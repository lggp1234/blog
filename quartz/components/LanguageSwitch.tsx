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
  const [path, hash] = href.split("#", 2)
  // 이미 / 로 끝나거나 /index 로 끝나면 그대로
  if (path.endsWith("/") || path.endsWith("/index")) return href
  return (hash ? `${path}/#${hash}` : `${path}/`)
}

export default ((opts = {}) => {
  function LanguageSwitch({ fileData }: QuartzComponentProps) {
    const fm = fileData.frontmatter ?? {}
    const slug = fileData.slug

    const fmAlt = (fm as any).altLangPath as string | undefined
    const fmLang = (fm as any).lang as string | undefined

    const inferredLang = getLangFromSlug(slug)
    const lang = (fmLang as SiteLang | undefined) ?? inferredLang ?? undefined
    const rawAlt = fmAlt ?? inferAltForFolderList(slug)
    if (!rawAlt || !lang) return null

// 현재 페이지가 folder index(slug가 .../index)면 alt도 folder URL로 강제
    const alt = slug?.endsWith("/index") ? ensureFolderUrl(rawAlt) : rawAlt

    return (
      <a
        class="px-3 py-1 rounded-md border hover:opacity-80 whitespace-nowrap"
        href={encodeURI(alt)}
        aria-label={`Switch to ${label}`}
      >
        {label} →
      </a>
    )

  LanguageSwitch.css = `
    /* 필요하면 버튼 스타일을 여기에서 커스터마이즈하세요 */
  `

  return LanguageSwitch
}) satisfies QuartzComponentConstructor
