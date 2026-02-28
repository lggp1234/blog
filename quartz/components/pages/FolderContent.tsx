import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"

import style from "../styles/listPage.scss"
import { PageList, SortFn } from "../PageList"
import { Root } from "hast"
import { htmlToJsx } from "../../util/jsx"
import { i18n } from "../../i18n"
import { QuartzPluginData } from "../../plugins/vfile"
import { ComponentChildren } from "preact"
import { concatenateResources } from "../../util/resources"
import { trieFromAllFiles } from "../../util/ctx"
import { FullSlug, isFolderPath, joinSegments, resolveRelative } from "../../util/path"

interface FolderContentOptions {
  /**
   * Whether to display number of folders
   */
  showFolderCount: boolean
  showSubfolders: boolean
  sort?: SortFn
  pageSize?: number
}

const nameFromSlug = (slug: string) =>
  slug.replace(/\/index$/, "").split("/").filter(Boolean).at(-1) ?? slug

const alphabeticalFolderFirst: SortFn = (a, b) => {
  const aIsFolder = isFolderPath(a.slug ?? "")
  const bIsFolder = isFolderPath(b.slug ?? "")
  if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1

  const aKey = aIsFolder ? nameFromSlug(a.slug ?? "") : (a.frontmatter?.title ?? a.slug ?? "")
  const bKey = bIsFolder ? nameFromSlug(b.slug ?? "") : (b.frontmatter?.title ?? b.slug ?? "")

  return aKey.localeCompare(bKey, ["ko", "en"], { numeric: true, sensitivity: "base" })
}

const defaultOptions: FolderContentOptions = {
  showFolderCount: true,
  showSubfolders: true,
  sort: alphabeticalFolderFirst,
  pageSize: 40,
}

// NOTE: 폴더 항목의 날짜를 "하위 파일들 중 최신 수정일(modified)"로 표시하기 위한 helper
// 폴더 항목의 날짜를 "하위(재귀) 파일들 중 최신 modified"로 계산
const mostRecentModifiedInSubtree = (node: any): Date | undefined => {
  let latest: Date | undefined

  const walk = (n: any) => {
    const d: Date | undefined = n?.data?.dates?.modified
    if (d && (!latest || d > latest)) latest = d
    for (const c of n?.children ?? []) walk(c)
  }

  walk(node) // node 자신(index.md 포함) + 하위 전체
  return latest
}

const parseFolderPagination = (slug: string) => {
  // ex) foo/bar/page/2/index  -> baseSlug=foo/bar/index, page=2
  const m = slug.match(/^(.*)\/page\/(\d+)\/index$/)
  if (!m) return { baseSlug: slug, page: 1 }
  return { baseSlug: `${m[1]}/index`, page: parseInt(m[2], 10) }
}

export default ((opts?: Partial<FolderContentOptions>) => {
  const options: FolderContentOptions = {
    ...defaultOptions,
    ...opts,
    // opts.sort가 undefined이면 defaultOptions.sort를 유지
    sort: opts?.sort ?? defaultOptions.sort,
  }

  const FolderContent: QuartzComponent = (props: QuartzComponentProps) => {
    const { tree, fileData, allFiles, cfg } = props

    const trie = (props.ctx.trie ??= trieFromAllFiles(allFiles))

    const { baseSlug, page } = parseFolderPagination(fileData.slug!)
    const folder = trie.findNode(baseSlug.split("/"))
    if (!folder) {
      return null
    }

    const allPagesInFolder: QuartzPluginData[] =
      folder.children
        .map((node): QuartzPluginData | undefined => {
      // 1) 폴더 항목: 폴더 날짜 = 하위(재귀) 최신 modified
          if (node.isFolder && options.showSubfolders) {
            const latestModified =
              mostRecentModifiedInSubtree(node) ?? node.data?.dates?.modified ?? new Date()

        // 폴더에 index.md가 있는 경우(node.data 존재): 기존 데이터 유지 + modified만 덮어쓰기
            if (node.data) {
              return {
                ...node.data,
                dates: {
                  ...node.data.dates,
                  modified: latestModified,
                },
              }
            }  

        // index.md 없는 폴더: synthetic 항목 생성
            return {
              slug: node.slug,
              dates: {
                created: latestModified,
                modified: latestModified,
                published: latestModified,
              },
              frontmatter: {
                title: node.displayName,
                tags: [],
              },
            }
          }

          // 2) 일반 파일: 파일 날짜는 CreatedModifiedDate가 채운 file의 dates.modified(=git lastmod) 그대로 사용
          if (node.data) return node.data

          return undefined
        })
        .filter((page): page is QuartzPluginData => page !== undefined)
    // ✅ (E) pagination 계산
    const pageSize = 40 // 원하는 값. 나중에 options로 빼도 됨.
    const totalPages = Math.max(1, Math.ceil(allPagesInFolder.length / pageSize))
    const safePage = Math.min(Math.max(page, 1), totalPages)

// baseSlug: foo/bar/index  -> baseFolder: foo/bar
    const baseFolder = baseSlug.replace(/\/index$/, "")

    const pageSlug = (p: number): FullSlug =>
      p === 1
        ? (joinSegments(baseFolder, "index") as FullSlug)
        : (joinSegments(baseFolder, "page", String(p), "index") as FullSlug)

    const prevHref = safePage > 1 ? resolveRelative(fileData.slug!, pageSlug(safePage - 1)) : null
    const nextHref = safePage < totalPages ? resolveRelative(fileData.slug!, pageSlug(safePage + 1)) : null
    const cssClasses: string[] = fileData.frontmatter?.cssclasses ?? []
    const classes = cssClasses.join(" ")
    const listProps = {
      ...props,
      sort: options.sort,
      allFiles: allPagesInFolder,
    }

    const content = (
      (tree as Root).children.length === 0
        ? fileData.description
        : htmlToJsx(fileData.filePath!, tree)
    ) as ComponentChildren

    return (
      <div class="popover-hint">
        <article class={classes}>{content}</article>
        <div class="page-listing">
          {options.showFolderCount && (
            <p>
              {i18n(cfg.locale).pages.folderContent.itemsUnderFolder({
                count: allPagesInFolder.length,
              })}
            </p>
          )}
          <div>
            <PageList
              {...listProps}
              offset={(safePage - 1) * pageSize}
              limit={pageSize}
            />

            {totalPages > 1 && (
              <nav class="pagination">
                {prevHref ? (
                  <a class="internal" href={prevHref}>
                    ← Prev
                  </a>
                ) : (
                  <span class="pagination-disabled">← Prev</span>
                )}

                <span class="pagination-info">
                  {safePage} / {totalPages}
                </span>

                {nextHref ? (
                  <a class="internal" href={nextHref}>
                    Next →
                  </a>
                ) : (
                  <span class="pagination-disabled">Next →</span>
                )}
              </nav>
            )}
          </div>
        </div>
      </div>
    )
  }

  FolderContent.css = concatenateResources(style, PageList.css)
  return FolderContent
}) satisfies QuartzComponentConstructor
