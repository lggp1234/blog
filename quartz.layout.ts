import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"
import LanguageSwitch from "./quartz/components/LanguageSwitch"
import SidebarMap from "./quartz/components/SidebarMap" // ✅ 추가

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [
    Component.Comments({
      provider: "giscus",
      options: {
        repo: "lggp1234/blog",
        repoId: "R_kgDOPMIgzg",
        category: "General",
        categoryId: "DIC_kwDOPMIgzs4Cuo_O",
        mapping: "pathname",
      },
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
  beforeBody: [
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
        { Component: Component.Search(), grow: true },
        { Component: Component.Darkmode() },
        { Component: Component.ReaderMode() },
      ],
    }),

    // ✅ Explorer 정렬/표시 로직 유지
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
    }),

    // ✅ Explorer 바로 아래(사이드바 하단)에 지도 추가
    Component.DesktopOnly(
      SidebarMap({
        height: 220,
        sticky: false, // true면 사이드바 안에서 스크롤 따라오는 느낌
        titleKo: "위치",
        titleEn: "Location",
        iframeSrc: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d955.1395344719443!2d127.36311522887266!3d36.368198860395765!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x35654bc8f5ab6ced%3A0x683eda38f6c6366d!2z7ZWc6rWt6rO87ZWZ6riw7Iig7JuQIEtJ67mM65SpKEU0KQ!5e0!3m2!1sko!2skr!4v1772198546601!5m2!1sko!2skr",
      }),
    ),
  ],
  right: [Component.Graph(), Component.DesktopOnly(Component.TableOfContents()), Component.Backlinks()],
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
        { Component: Component.Search(), grow: true },
        { Component: Component.Darkmode() },
      ],
    }),

    Component.Explorer({
      mapFn: (node) => {
        if (!node.isFolder && node.data?.title) {
          node.displayName = node.data.title
        }
      },
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
    }),

    Component.DesktopOnly(
      SidebarMap({
        height: 220,
        sticky: false,
        titleKo: "위치",
        titleEn: "Location",
        iframeSrc: "https://www.google.com/maps/embed?pb=YOUR_EMBED_CODE_HERE",
      }),
    ),
  ],
  right: [],
}
