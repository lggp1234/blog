import { QuartzComponentConstructor, QuartzComponentProps } from "./types"

type SiteLang = "ko" | "en"

function getLangFromSlug(slug?: string): SiteLang | null {
  if (!slug) return null
  if (slug === "english" || slug.startsWith("english/")) return "en"
  if (slug === "한국어" || slug.startsWith("한국어/")) return "ko"
  if (slug === "한국어버젼" || slug.startsWith("한국어버젼/")) return "ko"
  return null
}

function inferAltForFolderList(slug?: string): string | null {
  if (!slug) return null
  const s = slug.replace(/\/index$/, "")
  if (s === "english") return "/한국어/"
  if (s === "한국어" || s === "한국어버젼") return "/english/"
  return null
}

function ensureFolderUrl(href: string): string {
  const [path0, hash] = href.split("#", 2)
  const path = path0.startsWith("/") ? path0 : `/${path0}`
  if (path.endsWith("/") || path.endsWith("/index")) return hash ? `${path}#${hash}` : path
  return hash ? `${path}/#${hash}` : `${path}/`
}

// @ts-ignore
import script from "./scripts/langswitch.inline"

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

    const label = lang === "ko" ? "English" : "한국어"
    const alt = slug?.endsWith("/index") ? ensureFolderUrl(rawAlt) : rawAlt
    const isHome = slug === "index" || slug === ""

    return (
      <a
        class={isHome ? "lang-switch lang-switch--home" : "lang-switch"}
        href={encodeURI(alt)}
        aria-label={`Switch to ${label}`}
        data-langswitch="true"
      >
        <span class="lang-switch__label">{label}</span>
        <span class="lang-switch__arrow" aria-hidden="true">→</span>
      </a>
    )
  }

  // ✅ CSS는 “레이아웃/줄바꿈만” 담당하고, 폰트는 JS가 본문에서 복사해옴
  LanguageSwitch.css = `
    .lang-switch {
      display: inline-flex;
      align-items: baseline;
      gap: 0.25rem;
      white-space: nowrap;
      flex-shrink: 0;

      margin-top: 0.75rem;

      text-decoration: none;
      color: var(--secondary);
    }

    .lang-switch:hover {
      color: var(--tertiary);
      opacity: 1;
    }

    .lang-switch--home {
      margin-top: 0;
    }
  `

  LanguageSwitch.afterDOMLoaded = script
  return LanguageSwitch
}) satisfies QuartzComponentConstructor
