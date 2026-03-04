import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"

import style from "../styles/listPage.scss"
import { PageList, SortFn } from "../PageList"
import { Root } from "hast"
import { htmlToJsx } from "../../util/jsx"
import { i18n } from "../../i18n"
import { QuartzPluginData } from "../../plugins/vfile"
import { ComponentChildren, Fragment } from "preact"
import { concatenateResources } from "../../util/resources"
import accordionScript from "../scripts/textAccordion.inline"
import { trieFromAllFiles } from "../../util/ctx"
import { FullSlug, isFolderPath, joinSegments, resolveRelative } from "../../util/path"
import accordionScript from "../scripts/textAccordion.inline"

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
const readTextFlag = (frontmatter: any): boolean => {
  if (!frontmatter) return false

  let v: any = frontmatter.Text ?? frontmatter.text

  // 키가 Text/text가 아닌 형태(공백/대소문자 등)로 들어와도 Special처럼 잡기
  if (v === undefined) {
    for (const [k, val] of Object.entries(frontmatter)) {
      if (String(k).trim().toLowerCase() === "text") {
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

// ------------------------------
// Explorer-sync folder key (language-independent)
// - Must match explorer.inline.ts folderKey logic
// ------------------------------

const stripIndexFromSlug = (slug: string): string =>
  slug.endsWith("/index") ? slug.slice(0, -"/index".length) : slug

const rootSegmentOfSlug = (slug: string): string => {
  const raw = slug.startsWith("/") ? slug.slice(1) : slug
  return raw.split("/").filter(Boolean)[0] ?? ""
}

const isEscapedUnicodeSegment = (seg: string): boolean => /^U[0-9A-Fa-f]{4}/.test(seg)
const isKoreanRootSegment = (seg: string): boolean =>
  seg === "한국어버젼" || seg === "한국어" || isEscapedUnicodeSegment(seg)

const extractNumericPrefix = (seg: string): string | null => {
  const m = seg.match(/^(\d+)[-\.]/) ?? seg.match(/^(\d+)-/)
  return m ? m[1] : null
}

// physical folder name key (NOT title)
const physicalNameKey = (n: any): string => {
  let s = String(n?.fileSegmentHint ?? n?.slugSegment ?? n?.displayName ?? "").trim()
  s = s.replace(/\.(md|mdx)$/i, "")
  return s
}

const physicalFolderSort = (a: any, b: any): number =>
  physicalNameKey(a).localeCompare(physicalNameKey(b), ["ko", "en"], { numeric: true, sensitivity: "base" })

const folderIndexAmongFoldersPhysical = (parent: any, child: any): number => {
  const folders = (parent?.children ?? []).filter((c: any) => c?.isFolder)
  folders.sort(physicalFolderSort)
  return Math.max(0, folders.findIndex((c: any) => c === child))
}

const folderTokenFromNode = (node: any, indexAmongFolders0: number): string => {
  const hint = physicalNameKey(node)
  const n = extractNumericPrefix(hint)
  if (n) return n
  return String(indexAmongFolders0 + 1)
}

const selectRenderRootForSlug = (trie: any, currentSlug: FullSlug): any => {
  const seg0 = rootSegmentOfSlug(stripIndexFromSlug(currentSlug))
  if (!seg0) return trie
  if (seg0 === "english" || isKoreanRootSegment(seg0)) {
    const langRoot = (trie.children ?? []).find((c: any) => c?.isFolder && c?.slugSegment === seg0)
    if (langRoot) return langRoot
  }
  return trie
}

const computeFolderKeyForSlug = (renderRoot: any, targetSlug: FullSlug): string => {
  const curSegs = stripIndexFromSlug(String(targetSlug)).split("/").filter(Boolean)
  const rootSegs = stripIndexFromSlug(String(renderRoot?.slug ?? "")).split("/").filter(Boolean)

  let segs = curSegs
  if (rootSegs.length > 0 && segs.length >= rootSegs.length && rootSegs.every((s, i) => segs[i] === s)) {
    segs = segs.slice(rootSegs.length)
  }

  let node = renderRoot
  let key = ""
  for (const seg of segs) {
    const next = (node?.children ?? []).find((c: any) => c?.slugSegment === seg)
    if (!next || !next.isFolder) break

    const i0 = folderIndexAmongFoldersPhysical(node, next)
    const token = folderTokenFromNode(next, i0)
    key = key ? `${key}/${token}` : token
    node = next
  }
  return key
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
    const renderRootForKeys = selectRenderRootForSlug(trie, fileData.slug! as FullSlug)
    const accordionChildrenByKey: Record<string, QuartzPluginData[]> = {}

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
            const childIsTextOnly = readTextFlag(node.data.frontmatter ?? {})
            const folderKey = computeFolderKeyForSlug(renderRootForKeys, node.slug as FullSlug)
            
            // Text: true + direct subfolders => accordion
            const childHasDirectSubfolder = (node.children ?? []).some((c: any) => c?.isFolder)
            const childIsTextAccordion = childIsTextOnly && !!node.data && childHasDirectSubfolder
            
            if (childIsTextAccordion && folderKey) {
              const subNodes = (node.children ?? []).filter((c: any) => c?.isFolder)
              subNodes.sort(physicalFolderSort) // ✅ 1.1 실제 폴더명 정렬
            
              const subPages: QuartzPluginData[] = subNodes
                .map((sub: any): QuartzPluginData | undefined => {
                  const latest = mostRecentModifiedInSubtree(sub) ?? sub.data?.dates?.modified ?? new Date()
                  const created = sub.data?.dates?.created ?? latest
                  const published = sub.data?.dates?.published ?? latest
                  const subKey = computeFolderKeyForSlug(renderRootForKeys, sub.slug as FullSlug)
            
                  if (sub.data) {
                    const subIsSpecial = readSpecialFlag(sub.data.frontmatter ?? {})
                    return {
                      ...sub.data,
                      frontmatter: {
                        ...(sub.data.frontmatter ?? {}),
                        __isFolder: true,
                        __specialButton: subIsSpecial,
                        __textOnlyFolder: false,     // ✅ 1.2 하위 폴더는 Text:false UI로 강제
                        __textAccordion: false,
                        __folderKey: subKey,
                      },
                      dates: { created, modified: latest, published },
                    }
                  }
            
                  return {
                    slug: sub.slug,
                    dates: { created: latest, modified: latest, published: latest },
                    frontmatter: {
                      title: sub.displayName,
                      tags: [],
                      __isFolder: true,
                      __specialButton: false,
                      __textOnlyFolder: false,
                      __textAccordion: false,
                      __folderKey: subKey,
                    },
                  }
                })
                .filter((x): x is QuartzPluginData => x !== undefined)
            
              accordionChildrenByKey[folderKey] = subPages
            }

            return {
              ...node.data,
              frontmatter: {
                ...(node.data.frontmatter ?? {}),
                __isFolder: true,
                __specialButton: childIsSpecial, 
                __textOnlyFolder: childIsTextOnly,
                __folderKey: folderKey,
                __textAccordion: childIsTextAccordion,
              },
              dates: {
                created,
                modified: latestModified,
                published,
              },
            }
          }
          
          const folderKey = computeFolderKeyForSlug(renderRootForKeys, node.slug as FullSlug)
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
              __textOnlyFolder: false,
              __folderKey: folderKey,
              __textAccordion: false,
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

        <div class="page-listing">
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
              accordionChildrenByKey={accordionChildrenByKey}
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
  FolderContent.afterDOMLoaded = accordionScript
  return FolderContent
}) satisfies QuartzComponentConstructor
