import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"
import LanguageSwitch from "./quartz/components/LanguageSwitch"
import FixFolderUrl from "./quartz/components/FixFolderUrl"

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [
    FixFolderUrl(),
    Component.Comments({
      provider: 'giscus',
      options: {
        repo: 'lggp1234/blog',
        repoId: 'R_kgDOPMIgzg',
        category: 'General',
        categoryId: 'DIC_kwDOPMIgzs4Cuo_O',
        mapping: 'pathname',
      }
    }),
  ],
  footer: Component.Footer({
    links: {
      GitHub: "https://github.com/jackyzha0/quartz",
      "Discord Community": "https://discord.gg/cRFFHYye7t",
    },
  }),
}

// components for pages that display a single page (e.g. a single note)
export const defaultContentPageLayout: PageLayout = {
  beforeBody:[
    Component.Flex({
      components: [
        {
          Component: Component.ConditionalRender({
            component: Component.Breadcrumbs(),
            condition: (page) => page.fileData.slug !== "index",
          }),
          grow: true,
        },
        { Component: LanguageSwitch() },
      ],
    }),

    Component.ArticleTitle(),
    Component.ContentMeta(),
    Component.TagList(),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
        { Component: Component.ReaderMode() },
      ],
    }),
    Component.Explorer({
      // 파일만 title을 displayName으로 사용 (폴더는 건드리지 않음)
      mapFn: (node) => {
        if (!node.isFolder && node.data?.title) {
          node.displayName = node.data.title
        }
      },

  // 정렬 규칙:
  // 1) 폴더 먼저
  // 2) 폴더는 "폴더 이름(slugSegment)" 기준
  // 3) 파일은 "표시 이름(displayName=title)" 기준
      sortFn: (a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1

        if (a.isFolder && b.isFolder) {
          const aFolder = (a.slugSegment ?? "").trim()
          const bFolder = (b.slugSegment ?? "").trim()
          return aFolder.localeCompare(bFolder, ["ko", "en"], {
            numeric: true,
            sensitivity: "base",
          })
        }

        const aName = (a.displayName ?? "").trim()
        const bName = (b.displayName ?? "").trim()
        return aName.localeCompare(bName, ["ko", "en"], {
          numeric: true,
          sensitivity: "base",
        })
      },
    })
  ],
  right: [
    Component.Graph(),
    Component.DesktopOnly(Component.TableOfContents()),
    Component.Backlinks(),
  ],
}

// components for pages that display lists of pages  (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [
    Component.Flex({
      components: [
        { Component: Component.Breadcrumbs(), grow: true },
        { Component: LanguageSwitch() },
      ],
    }),
    Component.ArticleTitle(),
    Component.ContentMeta(),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
      ],
    }),
    Component.Explorer({
      // 파일만 title을 displayName으로 사용 (폴더는 건드리지 않음)
      mapFn: (node) => {
        if (!node.isFolder && node.data?.title) {
          node.displayName = node.data.title
        }
      },

  // 정렬 규칙:
  // 1) 폴더 먼저
  // 2) 폴더는 "폴더 이름(slugSegment)" 기준
  // 3) 파일은 "표시 이름(displayName=title)" 기준
      sortFn: (a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1

        if (a.isFolder && b.isFolder) {
          const aFolder = (a.slugSegment ?? "").trim()
          const bFolder = (b.slugSegment ?? "").trim()
          return aFolder.localeCompare(bFolder, ["ko", "en"], {
            numeric: true,
            sensitivity: "base",
          })
        }

        const aName = (a.displayName ?? "").trim()
        const bName = (b.displayName ?? "").trim()
        return aName.localeCompare(bName, ["ko", "en"], {
          numeric: true,
          sensitivity: "base",
        })
      },
    })
  ],
  right: [],
}
