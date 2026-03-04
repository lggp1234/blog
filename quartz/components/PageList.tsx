import { FullSlug, isFolderPath, resolveRelative } from "../util/path"
import { QuartzPluginData } from "../plugins/vfile"
import { Date, getDate } from "./Date"
import { QuartzComponent, QuartzComponentProps } from "./types"
import { GlobalConfiguration } from "../cfg"

export type SortFn = (f1: QuartzPluginData, f2: QuartzPluginData) => number

export function byDateAndAlphabetical(cfg: GlobalConfiguration): SortFn {
  return (f1, f2) => {
    // Sort by date/alphabetical
    if (f1.dates && f2.dates) {
      // sort descending
      return getDate(cfg, f2)!.getTime() - getDate(cfg, f1)!.getTime()
    } else if (f1.dates && !f2.dates) {
      // prioritize files with dates
      return -1
    } else if (!f1.dates && f2.dates) {
      return 1
    }

    // otherwise, sort lexographically by title
    const f1Title = f1.frontmatter?.title.toLowerCase() ?? ""
    const f2Title = f2.frontmatter?.title.toLowerCase() ?? ""
    return f1Title.localeCompare(f2Title)
  }
}

export function byDateAndAlphabeticalFolderFirst(cfg: GlobalConfiguration): SortFn {
  return (f1, f2) => {
    // Sort folders first
    const f1IsFolder = isFolderPath(f1.slug ?? "")
    const f2IsFolder = isFolderPath(f2.slug ?? "")
    if (f1IsFolder && !f2IsFolder) return -1
    if (!f1IsFolder && f2IsFolder) return 1

    // If both are folders or both are files, sort by date/alphabetical
    if (f1.dates && f2.dates) {
      // sort descending
      return getDate(cfg, f2)!.getTime() - getDate(cfg, f1)!.getTime()
    } else if (f1.dates && !f2.dates) {
      // prioritize files with dates
      return -1
    } else if (!f1.dates && f2.dates) {
      return 1
    }

    // otherwise, sort lexographically by title
    const f1Title = f1.frontmatter?.title.toLowerCase() ?? ""
    const f2Title = f2.frontmatter?.title.toLowerCase() ?? ""
    return f1Title.localeCompare(f2Title)
  }
}

type Props = {
  limit?: number
  offset?: number
  sort?: SortFn
  accordionChildrenByKey?: Record<string, QuartzPluginData[]>
} & QuartzComponentProps

export const PageList: QuartzComponent = ({ cfg, fileData, allFiles, limit, offset, sort, accordionChildrenByKey }: Props) => {
  const sorter = sort ?? byDateAndAlphabeticalFolderFirst(cfg)
  let list = allFiles.sort(sorter)

  const start = offset ?? 0
  const end = limit ? start + limit : undefined
  list = list.slice(start, end)

  return (
    <ul class="section-ul">
      {list.map((page) => {
        const title = page.frontmatter?.title
        const tags = page.frontmatter?.tags ?? []
        const fm: any = page.frontmatter ?? {}
        const isFolder = fm.__isFolder === true || isFolderPath(page.slug ?? "")
        const isTextOnlyFolder = isFolder && fm.__textOnlyFolder === true
        const folderKey = typeof fm.__folderKey === "string" ? fm.__folderKey : ""
        const children = folderKey ? accordionChildrenByKey?.[folderKey] : undefined
        const isTextAccordion =
          isTextOnlyFolder && fm.__textAccordion === true && Array.isArray(children) && children.length > 0
        const isSpecialFolder = isFolder && fm.__specialButton === true

        return (
          <li class={`section-li${isTextAccordion ? " is-accordion-parent" : ""}`} data-folderkey={isTextAccordion ? folderKey : undefined}>
            <div class={`section${isTextOnlyFolder ? " section-text-only" : ""}`}>
              <p class="meta">
                {!isTextOnlyFolder && page.dates && <Date date={getDate(cfg, page)!} locale={cfg.locale} />}
              </p>
          
              <div class="desc">
                <h3>
                  {isTextAccordion ? (
                    <button
                      type="button"
                      class="folder-text-accordion-btn"
                      data-folderkey={folderKey}
                      aria-expanded={"false"}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="5 8 14 8"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        class="folder-text-accordion-icon"
                        aria-hidden="true"
                      >
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                      <span class="folder-text-accordion-title">{title}</span>
                    </button>
                  ) : isTextOnlyFolder ? (
                    <span class="folder-text-only">{title}</span>
                  ) : isSpecialFolder ? (
                    <span class="folder-special-btn-outer">
                      <a href={resolveRelative(fileData.slug!, page.slug!)} class="internal folder-special-btn-link">
                        {title}
                      </a>
                    </span>
                  ) : (
                    <a href={resolveRelative(fileData.slug!, page.slug!)} class="internal">
                      {title}
                    </a>
                  )}
                </h3>
              </div>
          
              <ul class="tags">
                {tags.map((tag) => (
                  <li>
                    <a class="internal tag-link" href={resolveRelative(fileData.slug!, `tags/${tag}` as FullSlug)}>
                      {tag}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          
            {/* ✅ 핵심: children은 section(grid) 밖에 둔다 */}
            {isTextAccordion && children && (
              <div class="text-accordion-children" data-folderkey={folderKey} aria-hidden={"true"}>
                <ul class="section-ul section-ul--nested">
                  {children.map((child) => {
                    const ctitle = child.frontmatter?.title
                    const ctags = child.frontmatter?.tags ?? []
                    const cfm: any = child.frontmatter ?? {}
                    const cIsFolder = cfm.__isFolder === true || isFolderPath(child.slug ?? "")
                    const cIsTextOnlyFolder = cIsFolder && cfm.__textOnlyFolder === true
                    const cIsSpecialFolder = cIsFolder && cfm.__specialButton === true
          
                    return (
                      <li class="section-li">
                        <div class={`section${cIsTextOnlyFolder ? " section-text-only" : ""}`}>
                          <p class="meta">
                            {!cIsTextOnlyFolder && child.dates && <Date date={getDate(cfg, child)!} locale={cfg.locale} />}
                          </p>
          
                          <div class="desc">
                            <h3>
                              {cIsTextOnlyFolder ? (
                                <span class="folder-text-only">{ctitle}</span>
                              ) : cIsSpecialFolder ? (
                                <span class="folder-special-btn-outer">
                                  <a href={resolveRelative(fileData.slug!, child.slug!)} class="internal folder-special-btn-link">
                                    {ctitle}
                                  </a>
                                </span>
                              ) : (
                                <a href={resolveRelative(fileData.slug!, child.slug!)} class="internal">
                                  {ctitle}
                                </a>
                              )}
                            </h3>
                          </div>
          
                          <ul class="tags">
                            {ctags.map((tag) => (
                              <li>
                                <a class="internal tag-link" href={resolveRelative(fileData.slug!, `tags/${tag}` as FullSlug)}>
                                  {tag}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

PageList.css = `
.section h3 {
  margin: 0;
}

.section > .tags {
  margin: 0;
}

/* Special: folder entries as "buttons" (appearance only) */
/* ✅ a.internal 전역 스타일과 충돌해도 절대 안 죽게 OUTER에 외형 부여 */
.folder-special-btn-outer {
  background-color: #fff;           /* 요구사항: 라이트 모드 흰색 */
  padding: 0.35rem 0.75rem;
  border-radius: 0.6rem;

  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  text-align: left;

  border: 1px solid rgba(0, 0, 0, 0.18);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06);
}

/* ✅ 링크는 글씨만 (타이포는 Quartz 기본 title 그대로 상속) */
a.internal.folder-special-btn-link {
  background: transparent !important;
  padding: 0 !important;
  border: 0 !important;
  box-shadow: none !important;
  text-decoration: none;
}

:root[saved-theme="dark"] .folder-special-btn-outer {
  background-color: #000;           /* 요구사항: 다크 모드 검은색 */
  border-color: rgba(255, 255, 255, 0.22);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.08);
}

/* Text: true 폴더는 링크가 아니므로, 링크처럼 보이지 않게 */
.folder-text-only {
  cursor: default;
  text-decoration: none;

  /* 1.1: 제목 중앙 정렬 */
  display: block;
  width: 100%;
  text-align: center;

  /* 1.1: 폰트/사이즈는 기본(h3) 그대로 */
  font: inherit;

  /* 1.2: 비활성(기본) 색 = 평범한 폴더 색(secondary) */
  color: var(--secondary);
}

/* 날짜 column 자체를 없애서(좌측 공백 제거) title/tags만 2-column으로 정렬 */
.section.section-text-only {
  grid-template-columns: minmax(0, 1fr) auto;
}

.section.section-text-only > .meta {
  display: none;
}

/* Text: true + has subfolders -> accordion button */
.folder-text-accordion-btn {
  background: transparent;
  border: 0;
  padding: 0;

  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;   /* 1.1 제목 중앙 */
  gap: 0.35rem;

  font: inherit;             /* 1.1 폰트/사이즈 기본 유지 */
  cursor: pointer;

  /* 1.2 비활성(접힘) 색: 평범한 폴더 색 */
  color: var(--secondary);
}

/* 1.2 활성(펼침) 색: 평범한 “활성 폴더” 청록(tertiary) */
li.section-li.is-open .folder-text-accordion-btn {
  color: var(--tertiary);
}

/* 1.4 Quartz 기본 chevron 아이콘: 접힘이면 -90deg(오른쪽), 펼침이면 아래 */
.folder-text-accordion-icon {
  transition: transform 0.3s ease;
  transform: rotate(-90deg);
  flex-shrink: 0;
}

li.section-li.is-open .folder-text-accordion-icon {
  transform: rotate(0deg);
}

/* 제목 텍스트는 버튼 컬러를 상속 */
.folder-text-accordion-title {
  color: inherit;
}

.text-accordion-children {
  display: none;
  margin-top: 0.25rem;
}

.section-li.is-accordion-parent.is-open .text-accordion-children {
  display: block;
}

/* ✅ nested list가 기본 UL 들여쓰기를 갖지 않도록 완전히 제거 */
.section-ul.section-ul--nested {
  margin: 0;
  padding: 0;
  list-style: none;
}
/* children 항목들 사이 간격: 기본 section-ul과 유사하게 */
.section-ul.section-ul--nested > .section-li {
  margin-top: 0.55rem;   /* 기본 리스트의 항목 간격 느낌 */
}

.section-ul.section-ul--nested > .section-li:first-child {
  margin-top: 0;         /* 첫 항목은 간격 없이 시작 */
}


/* children wrapper도 왼쪽 들여쓰기/여백 제거 */
.text-accordion-children {
  margin-top: 0.85rem;   /* ✅ blog-4(14) 기본 느낌에 가장 가까운 값 */
  padding: 0;
}
`
