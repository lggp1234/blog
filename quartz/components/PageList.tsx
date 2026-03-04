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
          <li class="section-li">
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
                      <span class="folder-text-accordion-arrow">&gt;</span>
                      <span class="folder-text-only">{title}</span>
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
              
              {isTextAccordion && children && (
                <div class="text-accordion-children" data-folderkey={folderKey} aria-hidden={"true"}>
                  <ul class="section-ul section-ul--nested">
                    {children.map(/* ... */)}
                  </ul>
                </div>
              )}
              
              <ul class="tags">
                {tags.map((tag) => (
                  <li>
                    <a
                      class="internal tag-link"
                      href={resolveRelative(fileData.slug!, `tags/${tag}` as FullSlug)}
                    >
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
  color: inherit;

  font-size: 1.35em; /* 4.2 글씨 크기 키우기 (원하면 1.25~1.6 조절) */
}

/* 날짜 column 자체를 없애서(좌측 공백 제거) title/tags만 2-column으로 정렬 */
.section.section-text-only {
  grid-template-columns: minmax(0, 1fr) auto;
}

.section.section-text-only > .meta {
  display: none;
}

.section.section-text-only .desc {
  text-align: center;
}

/* Text: true + has subfolders -> accordion button */
.folder-text-accordion-btn {
  background: transparent;
  border: 0;
  padding: 0;

  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center; /* Text-only 스타일(가운데) 유지 */
  gap: 0.35rem;

  font: inherit;
  color: inherit;
  cursor: pointer;
}

.folder-text-accordion-arrow {
  font-size: 0.95em;
  line-height: 1;
}

.text-accordion-children {
  display: none;
  margin-top: 0.25rem;
}

.text-accordion-li.is-open > .text-accordion-children {
  display: block;
}

.section-ul.section-ul--nested {
  margin-left: 1.25rem; /* “아래에 쭉” 보이되 약간만 들여쓰기 */
}
`
