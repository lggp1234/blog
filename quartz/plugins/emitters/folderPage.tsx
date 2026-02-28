import { QuartzEmitterPlugin } from "../types"
import { QuartzComponentProps } from "../../components/types"
import HeaderConstructor from "../../components/Header"
import BodyConstructor from "../../components/Body"
import { pageResources, renderPage } from "../../components/renderPage"
import { ProcessedContent, QuartzPluginData, defaultProcessedContent } from "../vfile"
import { FullPageLayout } from "../../cfg"
import path from "path"
import {
  FullSlug,
  SimpleSlug,
  stripSlashes,
  joinSegments,
  pathToRoot,
  simplifySlug,
} from "../../util/path"
import { defaultListPageLayout, sharedPageComponents } from "../../../quartz.layout"
import { FolderContent } from "../../components"
import { write } from "./helpers"
import { i18n, TRANSLATIONS } from "../../i18n"
import { BuildCtx, trieFromAllFiles } from "../../util/ctx"
import { StaticResources } from "../../util/resources"
interface FolderPageOptions extends FullPageLayout {
  sort?: (f1: QuartzPluginData, f2: QuartzPluginData) => number
  pageSize?: number
}

const mostRecentModifiedInDescendants = (node: any): Date | undefined => {
  let latest: Date | undefined

  const walk = (n: any) => {
    const d: Date | undefined = n?.data?.dates?.modified
    if (d && (!latest || d > latest)) latest = d
    for (const c of n?.children ?? []) walk(c)
  }

  // node 자신 + 하위 전체 포함
  walk(node)
  return latest
}

async function* processFolderInfo(
  ctx: BuildCtx,
  folderInfo: Record<SimpleSlug, ProcessedContent>,
  allFiles: QuartzPluginData[],
  opts: FullPageLayout,
  resources: StaticResources,
  pageSize: number,
) {
  const cfg = ctx.cfg.configuration
  const trie = (ctx.trie ??= trieFromAllFiles(allFiles))

  for (const [folder, folderContent] of Object.entries(folderInfo) as [
    SimpleSlug,
    ProcessedContent,
  ][]) {
    // 폴더 내 아이템 개수(폴더/파일) 기반으로 총 페이지 수 계산
    const folderNode = trie.findNode(folder.split("/"))
    const totalItems = (folderNode?.children ?? []).filter((n) => n.isFolder || n.data).length
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

    const baseTitle =
      folderContent[1].data.frontmatter?.title ??
      `${i18n(cfg.locale).pages.folderContent.folder}: ${folder}`

    for (let p = 1; p <= totalPages; p++) {
      const slug =
        (p === 1
          ? joinSegments(folder, "index")
          : joinSegments(folder, "page", String(p), "index")) as FullSlug

      // 1페이지: 실제 folder index 내용 사용
      // 2페이지+: 빈 본문(목록만) + 제목만 유지
      const baseData = folderContent[1].data

      // (선택) 폴더의 표시 modified 날짜를 page 2+에서도 1페이지와 동일하게(최신 하위 modified) 맞춤
     const folderLatestModified = folderNode ? mostRecentModifiedInDescendants(folderNode) : undefined

     // reading time 계산용 텍스트: index.md의 text가 있으면 그대로, 없으면 description이라도 사용
     const inheritedText = (baseData.text ?? baseData.description ?? "") as string

     // 날짜: index.md의 dates를 기본으로 하되, modified는 폴더 최신으로 덮어쓰기(원하면)
     const inheritedDates =
       baseData.dates
         ? {
             ...baseData.dates,
             modified: folderLatestModified ?? baseData.dates.modified,
           }
         : folderLatestModified
           ? { created: folderLatestModified, modified: folderLatestModified, published: folderLatestModified }
           : undefined

     // 1페이지는 원본(folder index), 2페이지+는 meta가 포함된 synthetic vfile + (원한다면) 동일한 tree 사용
     const [tree, file] =
       p === 1
         ? folderContent
         : (() => {
             const [, vf] = defaultProcessedContent({
               // baseData를 최대한 계승(타이틀/설정 등)
               ...baseData,

               // ✅ 페이지 slug는 page/2/index 같은 걸로 유지해야 FolderContent가 페이지 번호를 파싱함
               slug,

               // ✅ meta를 살리기 위한 핵심 2개
               text: inheritedText,
               dates: inheritedDates,

               // 제목은 페이지 번호 붙이고 싶으면 여기서 조절
               frontmatter: {
                 ...(baseData.frontmatter ?? {}),
                 title: baseTitle,          // 또는 `${baseTitle} (Page ${p})`
                 tags: baseData.frontmatter?.tags ?? [],
               },

               // description은 유지(너는 폴더 소개글을 description으로 쓰고 있으니까)
               description: baseData.description,
             })

             // ✅ page 2+에서도 폴더 index.md 본문(html tree)을 계속 보여주고 싶으면:
             // return [folderContent[0], vf] 로 유지
             // (지금 너 화면에서 이미 intro가 보이니, 이건 있어도/없어도 OK)
             return [folderContent[0], vf] as const
           })()

      const externalResources = pageResources(pathToRoot(slug), resources)
      const componentData: QuartzComponentProps = {
        ctx,
        fileData: file.data,
        externalResources,
        cfg,
        children: [],
        tree,
        allFiles,
      }

      const content = renderPage(cfg, slug, componentData, opts, externalResources)
      yield write({
        ctx,
        content,
        slug,
        ext: ".html",
      })
    }
  }
}

function computeFolderInfo(
  folders: Set<SimpleSlug>,
  content: ProcessedContent[],
  locale: keyof typeof TRANSLATIONS,
): Record<SimpleSlug, ProcessedContent> {
  // Create default folder descriptions
  const folderInfo: Record<SimpleSlug, ProcessedContent> = Object.fromEntries(
    [...folders].map((folder) => [
      folder,
      defaultProcessedContent({
        slug: joinSegments(folder, "index") as FullSlug,
        frontmatter: {
          title: `${i18n(locale).pages.folderContent.folder}: ${folder}`,
          tags: [],
        },
      }),
    ]),
  )

  // Update with actual content if available
  for (const [tree, file] of content) {
    const slug = stripSlashes(simplifySlug(file.data.slug!)) as SimpleSlug
    if (folders.has(slug)) {
      folderInfo[slug] = [tree, file]
    }
  }

  return folderInfo
}

function _getFolders(slug: FullSlug): SimpleSlug[] {
  var folderName = path.dirname(slug ?? "") as SimpleSlug
  const parentFolderNames = [folderName]

  while (folderName !== ".") {
    folderName = path.dirname(folderName ?? "") as SimpleSlug
    parentFolderNames.push(folderName)
  }
  return parentFolderNames
}

export const FolderPage: QuartzEmitterPlugin<Partial<FolderPageOptions>> = (userOpts) => {
  const opts: FullPageLayout = {
    ...sharedPageComponents,
    ...defaultListPageLayout,
    pageBody: FolderContent({ sort: userOpts?.sort, pageSize: userOpts?.pageSize }),
    ...userOpts,
  }

  const { head: Head, header, beforeBody, pageBody, afterBody, left, right, footer: Footer } = opts
  const Header = HeaderConstructor()
  const Body = BodyConstructor()

  return {
    name: "FolderPage",
    getQuartzComponents() {
      return [
        Head,
        Header,
        Body,
        ...header,
        ...beforeBody,
        pageBody,
        ...afterBody,
        ...left,
        ...right,
        Footer,
      ]
    },
    async *emit(ctx, content, resources) {
      const allFiles = content.map((c) => c[1].data)
      const cfg = ctx.cfg.configuration

      const folders: Set<SimpleSlug> = new Set(
        allFiles.flatMap((data) => {
          return data.slug
            ? _getFolders(data.slug).filter((folderName) => folderName !== "." && folderName !== "tags")
            : []
        }),
      )

      const folderInfo = computeFolderInfo(folders, content, cfg.locale)
      const pageSize = userOpts?.pageSize ?? 10
      yield* processFolderInfo(ctx, folderInfo, allFiles, opts, resources, pageSize)
    },
    async *partialEmit(ctx, content, resources, changeEvents) {
      const allFiles = content.map((c) => c[1].data)
      const cfg = ctx.cfg.configuration

      // Find all folders that need to be updated based on changed files
      const affectedFolders: Set<SimpleSlug> = new Set()
      for (const changeEvent of changeEvents) {
        if (!changeEvent.file) continue
        const slug = changeEvent.file.data.slug!
        const folders = _getFolders(slug).filter((folderName) => folderName !== "." && folderName !== "tags")
        folders.forEach((folder) => affectedFolders.add(folder))
      }

      // If there are affected folders, rebuild their pages
      if (affectedFolders.size > 0) {
        const folderInfo = computeFolderInfo(affectedFolders, content, cfg.locale)
        const pageSize = userOpts?.pageSize ?? 10
        yield* processFolderInfo(ctx, folderInfo, allFiles, opts, resources, pageSize)
      }
    },
  }
}
