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
          basis: "0",
          align: "start",
        },
        { Component: LanguageSwitch(), shrink: false, align: "start" },
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
      // (선택) 파일 표시 이름은 title 유지
      mapFn: (node) => {
        if (!node.isFolder && node.data?.title) {
          node.displayName = node.data.title
        }
      },
  
      // ✅ 정렬: 폴더 먼저 + 폴더/파일 모두 "실제 이름(slug 마지막 segment)" 기준
      sortFn: (a, b) => {
        // 폴더 먼저
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1

        // ✅ 외부 함수 참조 금지 → 여기서 인라인으로 키 추출
        const key = (n: any) => {
          let raw = String(n?.slug ?? "")
          if (raw.endsWith("/index")) raw = raw.slice(0, -"/index".length) // 폴더 slug 보정
          const parts = raw.split("/").filter(Boolean)
          return (parts.length ? parts[parts.length - 1] : "").trim()
        }

        return key(a).localeCompare(key(b), ["ko", "en"], { numeric: true, sensitivity: "base" })
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
        { Component: Component.Breadcrumbs(), grow: true, basis: "0", align: "start" },
        { Component: LanguageSwitch(), shrink: false, align: "start" },
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
      // (선택) 파일 표시 이름은 title 유지
      mapFn: (node) => {
        if (!node.isFolder && node.data?.title) {
          node.displayName = node.data.title
        }
      },
    
      // ✅ 정렬: 폴더 먼저 + 폴더/파일 모두 "실제 이름(slug 마지막 segment)" 기준
      sortFn: (a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1

        const key = (n: any) => {
          let raw = String(n?.slug ?? "")
          if (raw.endsWith("/index")) raw = raw.slice(0, -"/index".length)
          const parts = raw.split("/").filter(Boolean)
          return (parts.length ? parts[parts.length - 1] : "").trim()
        }

        return key(a).localeCompare(key(b), ["ko", "en"], { numeric: true, sensitivity: "base" })
      },
    })
  ],
  right: [],
}
