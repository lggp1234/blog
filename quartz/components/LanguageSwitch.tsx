import { QuartzComponentConstructor, QuartzComponentProps } from "./types"

type SiteLang = "ko" | "en"

function getLangFromSlug(slug?: string): SiteLang | null {
  if (!slug) return null
  if (slug === "english" || slug.startsWith("english/")) return "en"
  if (slug === "한국어" || slug.startsWith("한국어/")) return "ko"
  if (slug === "한국어버젼" || slug.startsWith("한국어버젼/")) return "ko"
  return null
}

// frontmatter가 없는 "폴더 리스트 페이지"를 위한 최소 fallback
// (루트 언어 폴더까지만 안전하게 처리)
function inferAltForFolderList(slug?: string): string | null {
  if (!slug) return null

  // folder index slug(".../index")도 동일 취급
  const s = slug.replace(/\/index$/, "")

  if (s === "english") return "/한국어/"
  if (s === "한국어" || s === "한국어버젼") return "/english/"

  return null
}

function ensureFolderUrl(href: string): string {
  // hash 분리 보존
  const [path0, hash] = href.split("#", 2)

  // SPA에서 상대경로 꼬임 방지: 항상 절대경로로
  const path = path0.startsWith("/") ? path0 : `/${path0}`

  // 이미 / 로 끝나거나 /index 로 끝나면 그대로
  if (path.endsWith("/") || path.endsWith("/index")) {
    return hash ? `${path}#${hash}` : path
  }

  return hash ? `${path}/#${hash}` : `${path}/`
}

export default (() => {
  function LanguageSwitch({ fileData }: QuartzComponentProps) {
    const fm = fileData.frontmatter ?? {}
    const slug = fileData.slug

    const fmAlt = (fm as any).altLangPath as string | undefined
    const fmLang = (fm as any).lang as string | undefined

    const inferredLang = getLangFromSlug(slug)
    const lang = (fmLang as SiteLang | undefined) ?? inferredLang
    const rawAlt = fmAlt ?? inferAltForFolderList(slug)

    if (!rawAlt || !lang) return null

    // 버튼 라벨(현재 언어 기준으로 반대 언어를 표시)
    const label = lang === "ko" ? "English" : "한국어"

    // 현재 페이지가 folder index(slug가 .../index)면 alt도 folder URL로 강제
    const alt = slug?.endsWith("/index") ? ensureFolderUrl(rawAlt) : rawAlt

    const isHome = slug === "index" || slug === ""

    return (
      <a
        class={isHome ? "lang-switch lang-switch--home" : "lang-switch"}
        href={encodeURI(alt)}
        aria-label={`Switch to ${label}`}
      >
        <span class="lang-switch__label">{label}</span>
        <span class="lang-switch__arrow" aria-hidden="true">→</span>
      </a>
    )
  }

  LanguageSwitch.css = `
    .lang-switch {
      display: inline-flex;
      align-items: baseline;
      gap: 0.25rem;
      white-space: nowrap;
      flex-shrink: 0;

      /* Breadcrumbs first line alignment (너가 쓰던 값 유지) */
      margin-top: 0.75rem;

      /* ✅ 본문과 완전히 동일하게 */
      font-family: var(--bodyFont);
      font-size: 1em;          /* 부모(본문 기준)와 동일 */
      font-weight: var(--normalWeight, 400);      /* ✅ 굵기 고정 */
      font-style: normal;
      font-variant: normal;
      letter-spacing: normal;
      line-height: inherit;    /* 본문 line-height를 그대로 */
      text-rendering: optimizeLegibility;

      text-decoration: none;
      color: var(--secondary);
    }

    .lang-switch__label,
    .lang-switch__arrow {
      font: inherit;           /* ✅ label/arrow도 완전 동일 */
    }

    .lang-switch:hover {
      color: var(--tertiary);
      opacity: 1;
    }

    .lang-switch--home {
      margin-top: 0;
    }
  `

  return LanguageSwitch
}) satisfies QuartzComponentConstructor
