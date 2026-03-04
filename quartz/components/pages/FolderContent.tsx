import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"

import style from "../styles/listPage.scss"
import { PageList, SortFn } from "../PageList"
import { Root } from "hast"
import { htmlToJsx } from "../../util/jsx"
import { i18n } from "../../i18n"
import { QuartzPluginData } from "../../plugins/vfile"
import { ComponentChildren, Fragment } from "preact"
import { concatenateResources } from "../../util/resources"
import { trieFromAllFiles } from "../../util/ctx"
import { FullSlug, isFolderPath, joinSegments, resolveRelative } from "../../util/path"

interface FolderContentOptions {
  /** Whether to display number of folders */
  showFolderCount: boolean
  showSubfolders: boolean
  sort?: SortFn
  /** number of items per page */
  pageSize?: number
}

const nameFromSlug = (slug: string) =>
  slug.replace(/\/index$/, "").split("/").filter(Boolean).at(-1) ?? slug

const nameFromFilePathOrSlug = (p: QuartzPluginData): string => {
  const fp = (p as any)?.filePath ? String((p as any).filePath) : ""
  if (fp) {
    const parts = fp.replace(/\\/g, "/").split("/").filter(Boolean)
    const lastRaw = parts.at(-1) ?? ""
    const last = lastRaw.replace(/\.(md|mdx)$/i, "")

    if (last === "index" || last === "_index") {
      return (parts.at(-2) ?? "").trim()
    }
    return last.trim()
  }

  return nameFromSlug(String(p.slug ?? "")).trim()
}

const alphabeticalFolderFirst: SortFn = (a, b) => {
  const aIsFolder = isFolderPath(a.slug ?? "")
  const bIsFolder = isFolderPath(b.slug ?? "")
  if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1

  // ✅ 폴더/파일 모두 "실제 이름" 기준으로 정렬
  const aKey = nameFromFilePathOrSlug(a)
  const bKey = nameFromFilePathOrSlug(b)

  return aKey.localeCompare(bKey, ["ko", "en"], { numeric: true, sensitivity: "base" })
}

const defaultOptions: FolderContentOptions = {
  showFolderCount: true,
  showSubfolders: true,
  sort: alphabeticalFolderFirst,
  pageSize: 10,
}

// NOTE: 폴더 항목의 날짜를 "하위 파일들 중 최신 수정일(modified)"로 표시하기 위한 helper
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

const readSpecialFlag = (frontmatter: any): boolean => {
  if (!frontmatter) return false

  let v: any = frontmatter.Special ?? frontmatter.special

  if (v === undefined) {
    for (const [k, val] of Object.entries(frontmatter)) {
      if (String(k).trim().toLowerCase() === "special") {
        v = val
        break
      }
    }
  }

  if (typeof v === "boolean") return v
  if (typeof v === "number") return v !== 0
  if (typeof v === "string") {
    const s = v.trim().toLowerCase()
    return s === "true" || s === "1" || s === "yes" || s === "y" || s === "on"
  }
  return false
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
    if (!folder) return null

    // baseSlug: foo/bar/index -> baseFolder: foo/bar
    const baseFolder = baseSlug.replace(/\/index$/, "")

    // =========================================================
    // ✅ "index.md 제외하고 파일이 없고 하위 폴더만 있는지" 판별
    //
    // - Quartz trie 구조에서 폴더의 index.md는 보통 folder.data에 있고,
    //   folder.children에는 "직계 하위 폴더/파일"만 들어있음.
    // - 따라서 folder.children 중에서 "파일 노드(!isFolder)"가 하나도 없으면
    //   (index.md 제외하고) 이 폴더에는 파일이 없다고 볼 수 있음.
    // =========================================================
    const hasDirectFile =
      (folder.children ?? []).some((n: any) => !n.isFolder && n.data) // 직계 하위에 파일이 존재?
    const hasDirectSubfolder =
      options.showSubfolders && (folder.children ?? []).some((n: any) => n.isFolder)

    // 요구사항: "직계 하위에 파일은 없고, 하위 폴더만 있는 경우"에는 페이지네이션 제거
    const disablePaginationForOnlySubfolders = !hasDirectFile && hasDirectSubfolder
    const enablePagination = !disablePaginationForOnlySubfolders

    // Build items under this folder
    const allPagesInFolder: QuartzPluginData[] = folder.children
      .map((node): QuartzPluginData | undefined => {
        // 1) 폴더 항목: 폴더 날짜 = 하위(재귀) 최신 modified
        if (node.isFolder && options.showSubfolders) {
          const latestModified =
            mostRecentModifiedInSubtree(node) ?? node.data?.dates?.modified ?? new Date()

          if (node.data) {
            const created = node.data.dates?.created ?? latestModified
            const published = node.data.dates?.published ?? latestModified

            const childIsSpecial = readSpecialFlag(node.data.frontmatter ?? {})

            return {
              ...node.data,
              frontmatter: {
                ...(node.data.frontmatter ?? {}),
                __isFolder: true,
                __specialButton: childIsSpecial, 
              },
              dates: {
                created,
                modified: latestModified,
                published,
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
              __isFolder: true,
              __specialButton: false, // index.md 없으면 Special 판단 불가 → false
            },
          }
        }

        // 2) 일반 파일
        if (node.data) return node.data

        return undefined
      })
      .filter((p): p is QuartzPluginData => p !== undefined)

    // =========================
    // Pagination (static pages)
    // =========================
    const pageSize = options.pageSize ?? 10
    const totalPages = enablePagination
      ? Math.max(1, Math.ceil(allPagesInFolder.length / pageSize))
      : 1
    const safePage = enablePagination ? Math.min(Math.max(page, 1), totalPages) : 1

    const pageSlug = (p: number): FullSlug =>
      p === 1
        ? (joinSegments(baseFolder, "index") as FullSlug)
        : (joinSegments(baseFolder, "page", String(p), "index") as FullSlug)
    const hrefForPage = (p: number) => resolveRelative(fileData.slug!, pageSlug(p))

    // Navigation window: show 10 page numbers at a time
    const navWindow = 10
    const groupStart = Math.floor((safePage - 1) / navWindow) * navWindow + 1
    const groupEnd = Math.min(totalPages, groupStart + navWindow - 1)

    const firstHref = safePage === 1 ? null : hrefForPage(1)
    const lastHref = safePage === totalPages ? null : hrefForPage(totalPages)
    const prevGroupHref = groupStart === 1 ? null : hrefForPage(Math.max(1, groupStart - navWindow))
    const nextGroupHref =
      groupEnd === totalPages ? null : hrefForPage(Math.min(totalPages, groupStart + navWindow))

    const cssClasses: string[] = fileData.frontmatter?.cssclasses ?? []
    const classes = cssClasses.join(" ")

    const listProps = {
      ...props,
      sort: options.sort,
      allFiles: allPagesInFolder,
    }
    
    // Folder intro content (index.md body / description)
    const content = (
      (tree as Root).children.length === 0 ? fileData.description : htmlToJsx(fileData.filePath!, tree)
    ) as ComponentChildren

    // (현재 너 설정) 모든 페이지에서 index.md 본문 표시
    const hasFolderIntro = (tree as Root).children.length > 0 || !!fileData.description
    const showFolderIntro = hasFolderIntro

    return (
      <div class="popover-hint">
        {showFolderIntro && <article class={classes}>{content}</article>}

        <div class="page-listing" data-special-buttons={specialFolderButtons ? "1" : "0"}>
          {options.showFolderCount && (
            <p>
              {i18n(cfg.locale).pages.folderContent.itemsUnderFolder({
                count: allPagesInFolder.length,
              })}
            </p>
          )}

          <div>
            {/* ✅ only-subfolders면 limit/offset을 주지 않아서 전체 목록이 "주르륵" 뜸 */}
            <PageList
              {...listProps}
              offset={enablePagination ? (safePage - 1) * pageSize : undefined}
              limit={enablePagination ? pageSize : undefined}
            />

            {/* ✅ only-subfolders면 네비게이션 자체를 제거 (기본 Quartz 느낌) */}
            {enablePagination && (
              <nav class="pagination" aria-label="Pagination">
                {/* « : 가장 첫 페이지 */}
                {firstHref ? (
                  <a class="internal pagination-btn" href={firstHref} aria-label="First page">
                    «
                  </a>
                ) : (
                  <span class="pagination-btn pagination-disabled" aria-disabled="true">
                    «
                  </span>
                )}

                {/* < : 10개 단위로 앞으로(이전 그룹) 이동 */}
                {prevGroupHref ? (
                  <a class="internal pagination-btn" href={prevGroupHref} aria-label="Previous 10 pages">
                    ‹
                  </a>
                ) : (
                  <span class="pagination-btn pagination-disabled" aria-disabled="true">
                    ‹
                  </span>
                )}

                {/* 1 | 2 | ... 숫자 */}
                <div class="pagination-pages" aria-label="Page numbers">
                  {Array.from({ length: groupEnd - groupStart + 1 }, (_, i) => groupStart + i).map(
                    (p, idx) => (
                      <Fragment key={p}>
                        {idx > 0 && <span class="pagination-sep">|</span>}
                        {p === safePage ? (
                          <span class="pagination-page pagination-current" aria-current="page">
                            {p}
                          </span>
                        ) : (
                          <a class="internal pagination-page" href={hrefForPage(p)}>
                            {p}
                          </a>
                        )}
                      </Fragment>
                    ),
                  )}
                </div>

                {/* > : 10개 단위로 뒤로(다음 그룹) 이동 */}
                {nextGroupHref ? (
                  <a class="internal pagination-btn" href={nextGroupHref} aria-label="Next 10 pages">
                    ›
                  </a>
                ) : (
                  <span class="pagination-btn pagination-disabled" aria-disabled="true">
                    ›
                  </span>
                )}

                {/* » : 가장 뒷 페이지 */}
                {lastHref ? (
                  <a class="internal pagination-btn" href={lastHref} aria-label="Last page">
                    »
                  </a>
                ) : (
                  <span class="pagination-btn pagination-disabled" aria-disabled="true">
                    »
                  </span>
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
