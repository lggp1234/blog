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
import { isFolderPath } from "../../util/path"

interface FolderContentOptions {
  /**
   * Whether to display number of folders
   */
  showFolderCount: boolean
  showSubfolders: boolean
  sort?: SortFn
}

const alphabeticalFolderFirst: SortFn = (a, b) => {
  // (선택) 폴더를 먼저 보여주고 싶으면 유지
  const aIsFolder = isFolderPath(a.slug ?? "")
  const bIsFolder = isFolderPath(b.slug ?? "")
  if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1

  // 제목 우선, 없으면 slug로 fallback
  const aName = (a.frontmatter?.title ?? a.slug ?? "").trim()
  const bName = (b.frontmatter?.title ?? b.slug ?? "").trim()

  // 숫자 포함된 이름도 자연스럽게 정렬(1,2,10)
  return aName.localeCompare(bName, ["ko", "en"], {
    numeric: true,
    sensitivity: "base",
  })
}

const defaultOptions: FolderContentOptions = {
  showFolderCount: true,
  showSubfolders: true,
  sort: alphabeticalFolderFirst,
}

// NOTE: 폴더 항목의 날짜를 "하위 파일들 중 최신 수정일(modified)"로 표시하기 위한 helper
// 폴더 항목의 날짜를 "하위(재귀) 파일들 중 최신 modified"로 계산
const mostRecentModifiedInSubtree = (node: any): Date | undefined => {
  let latest: Date | undefined

  const walk = (n: any) => {
    const d: Date | undefined = n?.data?.dates?.modified
    if (d && (!latest || d > latest)) latest = d
    for (const c of n?.children ?? []) walk(c)
  }

  walk(node) // node 자신(index.md 포함) + 하위 전체
  return latest
}

export default ((opts?: Partial<FolderContentOptions>) => {
  const options: FolderContentOptions = {
    ...defaultOptions,
    ...opts,
    // opts.sort가 undefined이면 defaultOptions.sort를 유지
    sort: opts?.sort ?? defaultOptions.sort,
  }

  const FolderContent: QuartzComponent = (props: QuartzComponentProps) => {
    const { tree, fileData, allFiles, cfg } = props

    const trie = (props.ctx.trie ??= trieFromAllFiles(allFiles))
    const folder = trie.findNode(fileData.slug!.split("/"))
    if (!folder) {
      return null
    }

    const allPagesInFolder: QuartzPluginData[] =
      folder.children
        .map((node): QuartzPluginData | undefined => {
      // 1) 폴더 항목: 폴더 날짜 = 하위(재귀) 최신 modified
          if (node.isFolder && options.showSubfolders) {
            const latestModified =
              mostRecentModifiedInSubtree(node) ?? node.data?.dates?.modified ?? new Date()

        // 폴더에 index.md가 있는 경우(node.data 존재): 기존 데이터 유지 + modified만 덮어쓰기
            if (node.data) {
              return {
                ...node.data,
                dates: {
                  ...node.data.dates,
                  modified: latestModified,
                },
              }
            }  

        // index.md 없는 폴더: synthetic 항목 생성
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

          // 2) 일반 파일: 파일 날짜는 CreatedModifiedDate가 채운 file의 dates.modified(=git lastmod) 그대로 사용
          if (node.data) return node.data

          return undefined
        })
        .filter((page): page is QuartzPluginData => page !== undefined)
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
