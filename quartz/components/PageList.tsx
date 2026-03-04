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
} & QuartzComponentProps

export const PageList: QuartzComponent = ({ cfg, fileData, allFiles, limit, offset, sort }: Props) => {
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
        const isTextOnlyFolder =
          isFolderPath(page.slug ?? "") &&
          Boolean(((page.frontmatter as any)?.Text ?? (page.frontmatter as any)?.text) === true)

        return (
          <li class="section-li">
            <div class={`section${isTextOnlyFolder ? " section-text-only" : ""}`}>
              <p class="meta">
                {!isTextOnlyFolder && page.dates && <Date date={getDate(cfg, page)!} locale={cfg.locale} />}
              </p>
              <div class="desc">
                <h3>
                  {(() => {
                    const fm: any = page.frontmatter ?? {}
                    const isFolder = fm.__isFolder === true || isFolderPath(page.slug ?? "")
                    const isTextOnlyFolder = isFolder && (fm.Text === true || fm.text === true) // ✅ 추가
                    const isSpecialFolder = isFolder && fm.__specialButton === true
                
                    if (isTextOnlyFolder) {
                      return <span class="folder-text-only">{title}</span>
                    }
                
                    return isSpecialFolder ? (
                      <span class="folder-special-btn-outer">
                        <a
                          href={resolveRelative(fileData.slug!, page.slug!)}
                          class="internal folder-special-btn-link"
                        >
                          {title}
                        </a>
                      </span>
                    ) : (
                      <a href={resolveRelative(fileData.slug!, page.slug!)} class="internal">
                        {title}
                      </a>
                    )
                  })()}
                </h3>
              </div>
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
}

/* 날짜 column 자체를 없애서(좌측 공백 제거) title/tags만 2-column으로 정렬 */
.section.section-text-only {
  grid-template-columns: minmax(0, 1fr) auto;
}

.section.section-text-only > .meta {
  display: none;
}
`
