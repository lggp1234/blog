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

  if (slug === "english") return "/한국어"
  if (slug === "한국어" || slug === "한국어버젼") return "/english"

  // 하위 폴더는 이름이 번역되어 있으면 자동 매핑이 불가능하므로 여기선 무리해서 추정 안 함
  return null
}

export default ((opts = {}) => {
  function LanguageSwitch({ fileData }: QuartzComponentProps) {
    const fm = fileData.frontmatter ?? {}
    const slug = fileData.slug

    const fmAlt = (fm as any).altLangPath as string | undefined
    const fmLang = (fm as any).lang as string | undefined

    const inferredLang = getLangFromSlug(slug)
    const lang = (fmLang as SiteLang | undefined) ?? inferredLang ?? undefined
    const alt = fmAlt ?? inferAltForFolderList(slug)

    if (!alt || !lang) return null

    const label = lang === "ko" ? "English" : "한국어"

    return (
      <a
        class="px-3 py-1 rounded-md border hover:opacity-80 whitespace-nowrap"
        href={encodeURI(alt)}
        aria-label={`Switch to ${label}`}
      >
        {label} →
      </a>
    )
  }

  LanguageSwitch.css = `
    /* 필요하면 버튼 스타일을 여기에서 커스터마이즈하세요 */
  `

  return LanguageSwitch
}) satisfies QuartzComponentConstructor
