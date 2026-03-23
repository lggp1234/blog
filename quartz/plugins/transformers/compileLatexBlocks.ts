import { QuartzTransformerPlugin } from "../types"
import { visit } from "unist-util-visit"
import { toString } from "hast-util-to-string"
import { fromHtml } from "hast-util-from-html"
import { spawnSync } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"
import crypto from "crypto"
import type { Element, Root } from "hast"

interface Options {
  languages: string[]
  cacheDir: string
  preamblePath: string
}

const defaultOptions: Options = {
  languages: ["latex-render", "tex-render"],
  cacheDir: ".quartz-cache/latex",
  preamblePath: "quartz/latex/preamble.tex",
}

const forbiddenPatterns: RegExp[] = [
  /\\(?:documentclass|usepackage|RequirePackage)\b/,
  /\\(?:input|include|includeonly|import|subimport)\b/,
  /\\(?:openin|openout|read|write|write18|readline)\b/,
  /\\(?:includegraphics|graphicspath|bibliography|addbibresource|externaldocument)\b/,
  /\\(?:lstinputlisting|verbatiminput)\b/,
]

function ensureSafeSnippet(src: string, relativePath: string) {
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(src)) {
      throw new Error(
        `[CompileLatexBlocks] Forbidden LaTeX command in ${relativePath}. ` +
          `Move packages/macros to quartz/latex/preamble.tex and keep note blocks body-only.`,
      )
    }
  }
}

function readPreamble(preamblePath: string): string {
  const absolute = path.resolve(process.cwd(), preamblePath)
  if (!fs.existsSync(absolute)) {
    throw new Error(
      `[CompileLatexBlocks] Missing preamble file: ${absolute}. ` +
        `Create quartz/latex/preamble.tex first.`,
    )
  }
  return fs.readFileSync(absolute, "utf8").trim()
}

function makeDocument(preamble: string, body: string): string {
  return `${preamble}

\\begin{document}
${body}
\\end{document}
`
}

function normalizeSvg(svg: string): string {
  return svg
    .replace(/<\?xml[\s\S]*?\?>\s*/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>\s*/g, "")
    .trim()
}

function compileToSvg(
  latexBody: string,
  opts: Options,
  relativePath: string,
): string {
  ensureSafeSnippet(latexBody, relativePath)

  const preamble = readPreamble(opts.preamblePath)
  const texSource = makeDocument(preamble, latexBody)

  const hash = crypto
    .createHash("sha256")
    .update(preamble)
    .update("\n---\n")
    .update(latexBody)
    .digest("hex")

  const persistentCacheDir = path.resolve(process.cwd(), opts.cacheDir, hash.slice(0, 2), hash)
  const persistentSvgPath = path.join(persistentCacheDir, "snippet.svg")

  if (fs.existsSync(persistentSvgPath)) {
    return normalizeSvg(fs.readFileSync(persistentSvgPath, "utf8"))
  }

  fs.mkdirSync(persistentCacheDir, { recursive: true })

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "quartz-latex-"))
  const texPath = path.join(tempDir, "snippet.tex")
  const xdvPath = path.join(tempDir, "snippet.xdv")
  const svgPath = path.join(tempDir, "snippet.svg")

  fs.writeFileSync(texPath, texSource, "utf8")

  const hiddenPaths = [
    path.resolve(process.cwd()),
    path.resolve(process.cwd(), "content"),
    process.env.HOME,
  ].filter((p): p is string => Boolean(p))

  const tectonicArgs = [
    "-X",
    "compile",
    "snippet.tex",
    "--untrusted",
    "--outfmt",
    "xdv",
    "--outdir",
    tempDir,
    ...hiddenPaths.flatMap((p) => ["--hide", p]),
  ]

  const tectonic = spawnSync("tectonic", tectonicArgs, {
    cwd: tempDir,
    encoding: "utf8",
    env: {
      ...process.env,
      TECTONIC_UNTRUSTED_MODE: "1",
    },
  })

  if (tectonic.status !== 0 || !fs.existsSync(xdvPath)) {
    throw new Error(
      `[CompileLatexBlocks] tectonic failed in ${relativePath}\n` +
        `${tectonic.stderr || tectonic.stdout || "No compiler output"}`
    )
  }

  const dvisvgm = spawnSync(
    "dvisvgm",
    ["--no-fonts", "--exact", "--bbox=preview", "snippet.xdv", "-o", "snippet.svg"],
    {
      cwd: tempDir,
      encoding: "utf8",
    },
  )

  if (dvisvgm.status !== 0 || !fs.existsSync(svgPath)) {
    throw new Error(
      `[CompileLatexBlocks] dvisvgm failed in ${relativePath}\n` +
        `${dvisvgm.stderr || dvisvgm.stdout || "No converter output"}`
    )
  }

  const svg = normalizeSvg(fs.readFileSync(svgPath, "utf8"))
  fs.writeFileSync(persistentSvgPath, svg, "utf8")
  fs.rmSync(tempDir, { recursive: true, force: true })

  return svg
}

function hasLanguage(codeEl: Element, languages: string[]): boolean {
  const classNames = Array.isArray(codeEl.properties?.className)
    ? (codeEl.properties.className as string[]).map(String)
    : []
  return languages.some((lang) => classNames.includes(`language-${lang}`))
}

export const CompileLatexBlocks: QuartzTransformerPlugin<Partial<Options>> = (userOpts) => {
  const opts: Options = { ...defaultOptions, ...userOpts }

  return {
    name: "CompileLatexBlocks",

    htmlPlugins() {
      return [
        () => {
          return async (tree: Root, file) => {
            const jobs: Array<{ node: Element; index: number; parent: any }> = []

            visit(tree, "element", (node: any, index, parent) => {
              if (
                index === undefined ||
                !parent ||
                node.tagName !== "pre" ||
                !Array.isArray(node.children) ||
                node.children.length === 0
              ) {
                return
              }

              const first = node.children[0]
              if (!first || first.type !== "element" || first.tagName !== "code") return
              if (!hasLanguage(first, opts.languages)) return

              jobs.push({ node, index, parent })
            })

            for (const job of jobs) {
              const codeEl = job.node.children[0] as Element
              const latexBody = toString(codeEl).trim()
              const relativePath = String(file.data.relativePath ?? file.path ?? "unknown-file")

              const svg = compileToSvg(latexBody, opts, relativePath)

              const fragment = fromHtml(
                `<div class="latex-compiled-block">${svg}</div>`,
                { fragment: true },
              )

              const replacement = fragment.children.find(
                (child: any) => child.type === "element",
              ) as Element | undefined

              if (!replacement) {
                throw new Error(
                  `[CompileLatexBlocks] Failed to create replacement SVG node in ${relativePath}`,
                )
              }

              job.parent.children[job.index] = replacement
            }
          }
        },
      ]
    },

    externalResources() {
      return {
        css: [
          {
            content: `
.latex-compiled-block {
  overflow-x: auto;
  margin: 1rem 0;
}
.latex-compiled-block > svg {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}
`,
          },
        ],
      }
    },
  }
}
