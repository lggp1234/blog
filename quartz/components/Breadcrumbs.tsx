import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import breadcrumbsStyle from "./styles/breadcrumbs.scss"
import { FullSlug, SimpleSlug, resolveRelative, simplifySlug } from "../util/path"
import { classNames } from "../util/lang"
import { trieFromAllFiles } from "../util/ctx"

function normalizePaginationSlug(slug: FullSlug): FullSlug {
  // foo/bar/page/2/index -> foo/bar/index
  const m = (slug as string).match(/^(.*)\/page\/\d+\/index$/)
  return (m ? `${m[1]}/index` : slug) as FullSlug
}

function getBreadcrumbUiLang(pathNodes: Array<{ slug: string; displayName?: string }>): "ko" | "en" | null {
  const langNode = pathNodes[1]
  if (!langNode) return null

  const s = simplifySlug(langNode.slug as FullSlug)
  const name = (langNode.displayName ?? "").trim()

  if (s === "english" || name === "English" || name === "English Ver.") return "en"
  if (s === "한국어" || s === "한국어버젼" || name === "한국어") return "ko"

  return null
}

function getLanguageRootPathFromPathNodes(
  pathNodes: Array<{ slug: string; displayName?: string }>,
): SimpleSlug | null {
  const langNode = pathNodes[1]
  if (!langNode) return null

  if (isLanguageRootCrumb({ slug: langNode.slug, displayName: langNode.displayName ?? "" })) {
    return simplifySlug(langNode.slug as FullSlug)
  }
  return null
}

function isLanguageRootCrumb(node: { slug: string; displayName: string }): boolean {
  const s = simplifySlug(node.slug as FullSlug)

  if (s === "english" || s === "한국어" || s === "한국어버젼") return true

  const name = node.displayName.trim()
  if (name === "한국어" || name === "English Ver." || name === "English") return true

  return false
}

type CrumbData = {
  displayName: string
  path: string
}

interface BreadcrumbOptions {
  spacerSymbol: string
  rootName: string
  resolveFrontmatterTitle: boolean
  showCurrentPage: boolean
}

const defaultOptions: BreadcrumbOptions = {
  spacerSymbol: "❯",
  rootName: "Home",
  resolveFrontmatterTitle: true,
  showCurrentPage: true,
}

function formatCrumb(displayName: string, baseSlug: FullSlug, currentSlug: SimpleSlug): CrumbData {
  return {
    displayName: displayName.replaceAll("-", " "),
    path: resolveRelative(baseSlug, currentSlug),
  }
}

export default ((opts?: Partial<BreadcrumbOptions>) => {
  const options: BreadcrumbOptions = { ...defaultOptions, ...opts }

  const Breadcrumbs: QuartzComponent = ({ fileData, allFiles, displayClass, ctx }: QuartzComponentProps) => {
    const trie = (ctx.trie ??= trieFromAllFiles(allFiles))

    const currentSlug = fileData.slug! as FullSlug
    const lookupSlug = normalizePaginationSlug(currentSlug) // ✅ 여기서만 정규화
    const slugParts = (lookupSlug as string).split("/")

    const pathNodes = trie.ancestryChain(slugParts)
    if (!pathNodes) return null

    const uiLang = getBreadcrumbUiLang(pathNodes)
    const langRootPath = getLanguageRootPathFromPathNodes(pathNodes)

    const visiblePathNodes = pathNodes.filter((node, idx) => {
      if (idx === 0) return true
      if (idx === 1 && isLanguageRootCrumb(node)) return false
      return true
    })

    const crumbs: CrumbData[] = visiblePathNodes.map((node, idx) => {
      // ✅ 링크는 "현재 페이지(currentSlug)" 기준으로 상대경로를 만들어야 함
      const crumb = formatCrumb(node.displayName, currentSlug, simplifySlug(node.slug as FullSlug))

      if (idx === 0) {
        crumb.displayName = uiLang === "ko" ? "홈" : options.rootName
        if (langRootPath) {
          crumb.path = resolveRelative(currentSlug, langRootPath)
        }
      }

      // 마지막 크럼(현재 페이지 표기)은 클릭 비활성
      if (idx === visiblePathNodes.length - 1) {
        crumb.path = ""
      }

      return crumb
    })

    if (!options.showCurrentPage) crumbs.pop()

    return (
      <nav class={classNames(displayClass, "breadcrumb-container")} aria-label="breadcrumbs">
        {crumbs.map((crumb, index) => (
          <div class="breadcrumb-element">
            <a href={crumb.path}>{crumb.displayName}</a>
            {index !== crumbs.length - 1 && <p>{` ${options.spacerSymbol} `}</p>}
          </div>
        ))}
      </nav>
    )
  }

  Breadcrumbs.css = breadcrumbsStyle
  return Breadcrumbs
}) satisfies QuartzComponentConstructor
