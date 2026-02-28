import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"

import style from "../styles/listPage.scss"
import { PageList, SortFn } from "../PageList"
import { Root } from "hast"
import { htmlToJsx } from "../../util/jsx"
import { i18n } from "../../i18n"
import { QuartzPluginData } from "../../plugins/vfile"
import { ComponentChildren } from "preact"
import { concatenateResources } from "../../util/resources"
import { trieFromAllFiles } from "../../util/ctx"

interface FolderContentOptions {
  /**
   * Whether to display number of folders
   */
  showFolderCount: boolean
  showSubfolders: boolean
  sort?: SortFn
}

const defaultOptions: FolderContentOptions = {
  showFolderCount: true,
  showSubfolders: true,
}

// NOTE: 폴더 항목의 날짜를 "하위 파일들 중 최신 수정일(modified)"로 표시하기 위한 helper
const mostRecentModifiedInDescendants = (node: any): Date | undefined => {
  let latest: Date | undefined = undefined

  const walk = (n: any) => {
    const d: Date | undefined = n?.data?.dates?.modified
    if (d) {
      if (!latest || d > latest) latest = d
    }
    for (const c of n?.children ?? []) walk(c)
  }

  // "하위 파일들"만: node 자기 자신(index.md 포함)은 제외하고 children부터 순회
  for (const c of node?.children ?? []) walk(c)

  return latest
}

export default ((opts?: Partial<FolderContentOptions>) => {
  const options: FolderContentOptions = { ...defaultOptions, ...opts }

  const FolderContent: QuartzComponent = (props: QuartzComponentProps) => {
    const { tree, fileData, allFiles, cfg } = props

    const trie = (props.ctx.trie ??= trieFromAllFiles(allFiles))
    const folder = trie.findNode(fileData.slug!.split("/"))
    if (!folder) {
      return null
    }

    const allPagesInFolder: QuartzPluginData[] =
      folder.children
        .map((node) => {
          // 1) 폴더 항목: (index.md 유무와 무관하게) 폴더 날짜 = 하위 최신 수정일
          if (node.isFolder && options.showSubfolders) {
            const latestModified =
              mostRecentModifiedInDescendants(node) ?? node.data?.dates?.modified ?? new Date()

    // 폴더에 index.md가 있으면 node.data가 존재함 -> 기존 frontmatter 유지 + modified만 덮어쓰기
            if (node.data) {
              return {
                ...node.data,
                dates: {
                  ...node.data.dates,
                  modified: latestModified,
                },
              }
            }

    // index.md가 없는 폴더 -> synthetic 항목 생성
            return {
              slug: node.slug,
              dates: {
                created: latestModified,
                modified: latestModified,
                published: latestModified,
              },
              frontmatter: {
                title: node.displayName,
                tags: [],
              },
            }
          }

          // 2) 일반 파일
          if (node.data) {
            return node.data
          }
        })
              return (
                maybeDates ?? {
                  created: new Date(),
                  modified: new Date(),
                  published: new Date(),
                }
              )
            }

            return {
              slug: node.slug,
              dates: getMostRecentDates(),
              frontmatter: {
                title: node.displayName,
                tags: [],
              },
            }
          }
        })
        .filter((page) => page !== undefined) ?? []
    const cssClasses: string[] = fileData.frontmatter?.cssclasses ?? []
    const classes = cssClasses.join(" ")
    const listProps = {
      ...props,
      sort: options.sort,
      allFiles: allPagesInFolder,
    }

    const content = (
      (tree as Root).children.length === 0
        ? fileData.description
        : htmlToJsx(fileData.filePath!, tree)
    ) as ComponentChildren

    return (
      <div class="popover-hint">
        <article class={classes}>{content}</article>
        <div class="page-listing">
          {options.showFolderCount && (
            <p>
              {i18n(cfg.locale).pages.folderContent.itemsUnderFolder({
                count: allPagesInFolder.length,
              })}
            </p>
          )}
          <div>
            <PageList {...listProps} />
          </div>
        </div>
      </div>
    )
  }

  FolderContent.css = concatenateResources(style, PageList.css)
  return FolderContent
}) satisfies QuartzComponentConstructor
