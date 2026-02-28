import { Date, getDate } from "./Date"
import { QuartzComponentConstructor, QuartzComponentProps } from "./types"
import readingTime from "reading-time"
import { classNames } from "../util/lang"
import { i18n } from "../i18n"
import { JSX } from "preact"
import style from "./styles/contentMeta.scss"
import { trieFromAllFiles } from "../util/ctx"

interface ContentMetaOptions {
  /**
   * Whether to display reading time
   */
  showReadingTime: boolean
  showComma: boolean
}

const defaultOptions: ContentMetaOptions = {
  showReadingTime: true,
  showComma: true,
}

// NOTE: 폴더(index.md) 페이지에서 표시할 날짜를 "하위 파일들 중 최신 수정일"로 덮어쓰기 위한 helper
const mostRecentModifiedInDescendants = (node: any): Date | undefined => {
  let latest: Date | undefined = undefined

  const walk = (n: any) => {
    const d: Date | undefined = n?.data?.dates?.modified
    if (d) {
      if (!latest || d > latest) latest = d
    }
    for (const c of n?.children ?? []) walk(c)
  }

  for (const c of node?.children ?? []) walk(c)
  return latest
}

export default ((opts?: Partial<ContentMetaOptions>) => {
  // Merge options with defaults
  const options: ContentMetaOptions = { ...defaultOptions, ...opts }

  function ContentMetadata({ cfg, fileData, displayClass, ctx, allFiles }: QuartzComponentProps) {
    const text = fileData.text

    if (text) {
      const segments: (string | JSX.Element)[] = []

      if (fileData.dates) {
        const dateType = cfg.defaultDateType ?? "modified"
        let dateToShow = getDate(cfg, fileData)!

  // 폴더 페이지(= trie에서 폴더로 인식되는 slug)이고, modified를 보여주는 설정이면:
  // 표시 날짜를 "하위 파일들 중 최신 수정일"로 덮어씀
        if (dateType === "modified" && fileData.slug) {
          const trie = (ctx.trie ??= trieFromAllFiles(allFiles))
          const node = trie.findNode(fileData.slug.split("/"))
          if (node?.isFolder) {
            const latest = mostRecentModifiedInDescendants(node)
            if (latest) dateToShow = latest
          }
        }

        segments.push(<Date date={dateToShow} locale={cfg.locale} />)
      }

      // Display reading time if enabled
      if (options.showReadingTime) {
        const { minutes, words: _words } = readingTime(text)
        const displayedTime = i18n(cfg.locale).components.contentMeta.readingTime({
          minutes: Math.ceil(minutes),
        })
        segments.push(<span>{displayedTime}</span>)
      }

      return (
        <p show-comma={options.showComma} class={classNames(displayClass, "content-meta")}>
          {segments}
        </p>
      )
    } else {
      return null
    }
  }

  ContentMetadata.css = style

  return ContentMetadata
}) satisfies QuartzComponentConstructor
