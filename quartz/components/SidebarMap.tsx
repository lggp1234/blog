import { QuartzComponentConstructor, QuartzComponentProps } from "./types"

type SiteLang = "ko" | "en" | null

function getLangFromSlug(slug?: string): SiteLang {
  if (!slug) return null
  if (slug === "english" || slug.startsWith("english/")) return "en"
  if (slug === "한국어" || slug.startsWith("한국어/")) return "ko"
  if (slug === "한국어버젼" || slug.startsWith("한국어버젼/")) return "ko"
  return null
}

interface Options {
  // Google Maps iframe src (Embed 링크)
  iframeSrc: string

  // 표시 옵션
  titleKo?: string
  titleEn?: string
  height?: number
  sticky?: boolean // true면 스크롤 시 사이드바 내에서 고정 느낌
}

const defaultOptions: Options = {
  iframeSrc: "",
  titleKo: "위치",
  titleEn: "Location",
  height: 220,
  sticky: false,
}

export default ((userOpts?: Partial<Options>) => {
  const opts = { ...defaultOptions, ...userOpts }

  function SidebarMap(props: QuartzComponentProps) {
    if (!opts.iframeSrc) return null

    const lang = getLangFromSlug(props.fileData.slug)
    const title = lang === "en" ? opts.titleEn : opts.titleKo

    return (
      <div class={`sidebar-map ${opts.sticky ? "is-sticky" : ""}`}>
        <div class="sidebar-map-title">{title}</div>
        <iframe
          title={title}
          src={opts.iframeSrc}
          width="100%"
          height={String(opts.height)}
          style="border:0;"
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    )
  }

  SidebarMap.css = `
    .sidebar-map {
      margin-top: 0.75rem;
      border: 1px solid var(--lightgray);
      border-radius: 10px;
      overflow: hidden;
      background: var(--light);
    }
    .sidebar-map-title {
      padding: 0.5rem 0.75rem;
      font-size: 0.9rem;
      font-weight: 600;
      border-bottom: 1px solid var(--lightgray);
      line-height: 1.2;
    }
    .sidebar-map.is-sticky {
      position: sticky;
      top: 0.75rem; /* 사이드바 안에서 고정 느낌 */
    }
  `

  return SidebarMap
}) satisfies QuartzComponentConstructor
