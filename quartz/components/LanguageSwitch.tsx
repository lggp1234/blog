import { QuartzComponentConstructor, QuartzComponentProps } from "./types"

export default ((opts = {}) => {
  function LanguageSwitch({ fileData }: QuartzComponentProps) {
    const fm = fileData.frontmatter ?? {}
    const alt = (fm as any).altLangPath as string | undefined
    const lang = (fm as any).lang as string | undefined
    if (!alt) return null

    const label = lang === "ko" ? "English" : "한국어"

    return (
      <a
        class="px-3 py-1 rounded-md border hover:opacity-80 whitespace-nowrap"
        href={alt}
        onClick={(e) => {
          // SPA 라우터 대신 항상 브라우저 풀 리로드를 하도록 강제
          e.preventDefault()
          window.location.assign(alt)
        }}
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
