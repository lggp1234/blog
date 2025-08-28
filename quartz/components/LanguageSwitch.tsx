import { QuartzComponentConstructor, QuartzComponentProps } from "./types"

export default ((opts = {}) => {
  function LanguageSwitch({ fileData }: QuartzComponentProps) {
    const fm = fileData.frontmatter ?? {}
    const alt = (fm as any).altLangPath as string | undefined
    const lang = (fm as any).lang as string | undefined
    if (!alt) return null

    const label = lang === "ko" ? "English" : "한국어"
    return (
      <div class="not-prose mt-2 mb-6 flex justify-end">
        <a class="px-3 py-1 rounded-md border hover:opacity-80" href={alt}>
          {label} →
        </a>
      </div>
    )
  }

  LanguageSwitch.css = `
    .not-prose a { text-decoration: none; }
  `

  return LanguageSwitch
}) satisfies QuartzComponentConstructor