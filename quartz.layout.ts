import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"
import LanguageSwitch from "./quartz/components/LanguageSwitch"

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [
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
      // 문서 제목(title)이 있으면 Explorer 표시명으로 사용
      mapFn: (node) => {
        if (node.data?.title) {
          node.displayName = node.data.title
        }
      },

      // 제목 기준 사전순 정렬 (한/영 혼합 + 숫자 자연정렬)
      sortFn: (a, b) => {
        // 폴더를 파일보다 먼저 두고 싶으면 유지
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1

        const aName = (a.displayName ?? "").trim()
        const bName = (b.displayName ?? "").trim()
    
        return aName.localeCompare(bName, ["ko", "en"], {
          numeric: true,
          sensitivity: "base",
        })
      },
    }),
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
      mapFn: (node) => {
        if (node.data?.title) {
          node.displayName = node.data.title
        }
      },
      sortFn: (a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
        const aName = (a.displayName ?? "").trim()
        const bName = (b.displayName ?? "").trim()
        return aName.localeCompare(bName, ["ko", "en"], {
          numeric: true,
          sensitivity: "base",
        })
      },
    }),
  ],
  right: [],
}
