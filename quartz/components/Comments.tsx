import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import { FullSlug, resolveRelative } from "../util/path"
// @ts-ignore
import script from "./scripts/comments.inline"
import style from "./styles/commentsNav.scss"

type SiteLang = "en" | "ko" | null

function getLangFromSlug(slug: string): SiteLang {
  if (slug === "english" || slug === "english/index" || slug.startsWith("english/")) return "en"
  if (
    slug === "한국어버젼" ||
    slug === "한국어버젼/index" ||
    slug.startsWith("한국어버젼/") ||
    slug === "한국어" ||
    slug === "한국어/index" ||
    slug.startsWith("한국어/")
  ) {
    return "ko"
  }
  return null
}

function stripTrailingIndex(slug: string): string {
  return slug.replace(/\/index$/, "")
}

function parentFolderOf(slug: string): string {
  const s = stripTrailingIndex(slug)
  const parts = s.split("/").filter(Boolean)
  parts.pop()
  return parts.join("/")
}

// ✅ 탐색기와 동일한 기준: "실제 파일 경로(filePath) → 없으면 slug"로 정렬
function physicalKeyFromFilePathOrSlug(p: any): string {
  // Quartz allFiles 항목에는 보통 filePath가 들어있음(없으면 slug로 fallback)
  const fp = (p?.filePath ?? p?.data?.filePath ?? "") as string

  if (fp) {
    const parts = fp.replace(/\\/g, "/").split("/").filter(Boolean)
    const lastRaw = parts.at(-1) ?? ""
    const last = lastRaw.replace(/\.(md|mdx)$/i, "")

    // index.md / _index.md는 폴더 대표 파일이므로 "부모 폴더명"을 키로 사용
    if (last === "index" || last === "_index") {
      return (parts.at(-2) ?? "").toString()
    }
    return last.toString()
  }

  // fallback: slug에서 마지막 segment
  let slug = String(p?.slug ?? "")
  slug = slug.replace(/\/index$/, "")
  const seg = slug.split("/").filter(Boolean).at(-1) ?? ""
  return String(seg)
}

function sortByPhysicalPath(a: any, b: any) {
  const ak = physicalKeyFromFilePathOrSlug(a)
  const bk = physicalKeyFromFilePathOrSlug(b)
  return ak.localeCompare(bk, ["ko", "en"], { numeric: true, sensitivity: "base" })
}

type Options = {
  provider: "giscus"
  options: {
    repo: `${string}/${string}`
    repoId: string
    category: string
    categoryId: string
    themeUrl?: string
    lightTheme?: string
    darkTheme?: string
    mapping?: "url" | "title" | "og:title" | "specific" | "number" | "pathname"
    strict?: boolean
    reactionsEnabled?: boolean
    inputPosition?: "top" | "bottom"
    lang?: string
  }
}

function boolToStringBool(b: boolean): string {
  return b ? "1" : "0"
}

export default ((opts: Options) => {
  const Comments: QuartzComponent = ({ displayClass, fileData, cfg, allFiles }: QuartzComponentProps) => {
    const disableComment: boolean =
      typeof fileData.frontmatter?.comments !== "undefined" &&
      (!fileData.frontmatter?.comments || fileData.frontmatter?.comments === "false")
    if (disableComment) return <></>

    // ===== Prev/Next (same folder direct siblings) =====
    const currentSlug = (fileData.slug ?? "") as FullSlug
    const currentNoIndex = stripTrailingIndex(currentSlug)
    const currentParent = parentFolderOf(currentSlug)
    const currentLang = getLangFromSlug(currentSlug)

    const siblingPages = (allFiles ?? [])
      .filter((f) => {
        const s = (f?.slug ?? "") as string
        if (!s) return false
        if (s.startsWith("tags/")) return false
        if (s.endsWith("/index")) return false // 폴더 index 제외
        if (currentLang && getLangFromSlug(s) !== currentLang) return false
        return parentFolderOf(s) === currentParent // 같은 폴더의 직계 파일만
      })
      .sort(sortByPhysicalPath)

    const currentIdx = siblingPages.findIndex(
      (f) => stripTrailingIndex((f?.slug ?? "") as string) === currentNoIndex,
    )

    const prevSlug: FullSlug | null =
      currentIdx > 0 ? (siblingPages[currentIdx - 1].slug as FullSlug) : null
    const nextSlug: FullSlug | null =
      currentIdx >= 0 && currentIdx < siblingPages.length - 1
        ? (siblingPages[currentIdx + 1].slug as FullSlug)
        : null

    const prevLabel = currentLang === "ko" ? "‹ 이전 문서" : "‹ Prev"
    const nextLabel = currentLang === "ko" ? "이후 문서 ›" : "Next ›"

    // ✅ "폴더에서 파일을 연 경우"에만 버튼 표시:
    // - 같은 폴더에 직계 문서가 2개 이상 있고
    // - 현재 문서가 그 목록에 포함될 때만
    const shouldShowPrevNext = siblingPages.length >= 2 && currentIdx >= 0 && !currentSlug.endsWith("/index")

    return (
      <div class={classNames(displayClass, "comments-with-nav")}>
        <div class="giscus-navwrap">
          {shouldShowPrevNext && (
            <nav class="giscus-prevnext" aria-label="Previous and Next document">
              {prevSlug ? (
                <a class="internal comment-nav-btn" href={resolveRelative(currentSlug, prevSlug)}>
                  {prevLabel}
                </a>
              ) : (
                <span class="comment-nav-btn disabled" aria-disabled="true">
                  {prevLabel}
                </span>
              )}

              {nextSlug ? (
                <a class="internal comment-nav-btn" href={resolveRelative(currentSlug, nextSlug)}>
                  {nextLabel}
                </a>
              ) : (
                <span class="comment-nav-btn disabled" aria-disabled="true">
                  {nextLabel}
                </span>
              )}
            </nav>
          )}

          <div
            class="giscus"
            data-repo={opts.options.repo}
            data-repo-id={opts.options.repoId}
            data-category={opts.options.category}
            data-category-id={opts.options.categoryId}
            data-mapping={opts.options.mapping ?? "url"}
            data-strict={boolToStringBool(opts.options.strict ?? true)}
            data-reactions-enabled={boolToStringBool(opts.options.reactionsEnabled ?? true)}
            data-input-position={opts.options.inputPosition ?? "bottom"}
            data-light-theme={opts.options.lightTheme ?? "light"}
            data-dark-theme={opts.options.darkTheme ?? "dark"}
            data-theme-url={opts.options.themeUrl ?? `https://${cfg.baseUrl ?? "example.com"}/static/giscus`}
            data-lang={opts.options.lang ?? "en"}
          ></div>
        </div>
      </div>
    )
  }

  Comments.afterDOMLoaded = script
  Comments.css = style
  return Comments
}) satisfies QuartzComponentConstructor<Options>
