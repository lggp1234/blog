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

function sortByTitleOrSlug(a: any, b: any) {
  const aKey = (a?.frontmatter?.title ?? a?.slug ?? "").toString()
  const bKey = (b?.frontmatter?.title ?? b?.slug ?? "").toString()
  return aKey.localeCompare(bKey, ["ko", "en"], { numeric: true, sensitivity: "base" })
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
        if (s.endsWith("/index")) return false              // 폴더 index 제외
        if (currentLang && getLangFromSlug(s) !== currentLang) return false
        return parentFolderOf(s) === currentParent           // 같은 폴더의 직계 파일만
      })
      .sort(sortByTitleOrSlug)

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

    return (
      <div class={classNames(displayClass, "comments-with-nav")}>
        <div class="giscus-navwrap">
          {/* reactions 줄 “양옆에 있는 것처럼” 보이게 iframe 상단에 오버레이 */}
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
            data-theme-url={
              opts.options.themeUrl ?? `https://${cfg.baseUrl ?? "example.com"}/static/giscus`
            }
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
