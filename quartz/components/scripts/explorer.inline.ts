import { FileTrieNode } from "../../util/fileTrie"
import { FullSlug, resolveRelative, simplifySlug } from "../../util/path"
import { ContentDetails } from "../../plugins/emitters/contentIndex"

type MaybeHTMLElement = HTMLElement | undefined

function isGlobalHomeSlug(slug: string): boolean {
  // Quartz 버전에 따라 홈 slug가 "index" 또는 빈 문자열일 수 있어서 둘 다 처리
  return slug === "index" || slug === ""
}

// =====================
// Compact Explorer (⋯ folding) helpers
// =====================
const CONTEXT_RADIUS = 2 // 항상 현재 항목 기준 ±2 표시

function normalizePaginationSlug(slug: FullSlug): FullSlug {
  // foo/bar/page/2 OR foo/bar/page/2/index -> foo/bar/index
  const m = (slug as string).match(/^(.*)\/page\/\d+(?:\/index)?$/)
  return (m ? `${m[1]}/index` : slug) as FullSlug
}

function isSimplePrefix(prefix: string, target: string): boolean {
  if (prefix === "/" || prefix === "") return true
  return target === prefix || target.startsWith(prefix + "/")
}

function updateExplorerTitle(explorer: HTMLElement, canonicalCurrentForLinks: FullSlug) {
  const isHome = isGlobalHomeSlug(currentSlug)
  const currentLang = getLangFromSlug(currentSlug) // "en" | "ko" | null

  const titleEls = explorer.querySelectorAll("h2")

  for (const el of titleEls) {
    const htmlEl = el as HTMLElement

    if (!htmlEl.dataset.defaultExplorerTitle) {
      htmlEl.dataset.defaultExplorerTitle = htmlEl.textContent ?? "탐색기"
    }

    if (isHome) {
      htmlEl.textContent = "언어 선택 / Language Selection"
    } else if (currentLang === "en") {
      htmlEl.textContent = "Explorer"
    } else if (currentLang === "ko") {
      htmlEl.textContent = "탐색기"
    } else {
      htmlEl.textContent = htmlEl.dataset.defaultExplorerTitle
    }

    // Home에서만 작은 폰트 class (이전 단계에서 추가한 경우 유지)
    htmlEl.classList.toggle("lang-selection-title", isHome)
  }
}

interface ParsedOptions {
  folderClickBehavior: "collapse" | "link"
  folderDefaultState: "collapsed" | "open"
  useSavedState: boolean
  sortFn: (a: FileTrieNode, b: FileTrieNode) => number
  filterFn: (node: FileTrieNode) => boolean
  mapFn: (node: FileTrieNode) => void
  order: ("sort" | "filter" | "map")[]
}

// --------------------- site language implement ---------------------
type SiteLang = "en" | "ko"

function getLangFromSlug(slug: string): SiteLang | null {
  // English
  if (slug === "english" || slug === "english/index" || slug.startsWith("english/")) return "en"

  // Korean (현재 네 repo 기준: 한국어버젼)
  if (slug === "한국어버젼" || slug === "한국어버젼/index" || slug.startsWith("한국어버젼/")) {
    return "ko"
  }

  // 혹시 일부 경로가 /한국어/ 로 남아있을 때 대비 (fallback)
  if (slug === "한국어" || slug === "한국어/index" || slug.startsWith("한국어/")) {
    return "ko"
  }

  return null
}

function isEnglishRootNode(node: FileTrieNode): boolean {
  return node.isFolder && node.slugSegment === "english"
}

function isKoreanRootNode(node: FileTrieNode): boolean {
  return node.isFolder && (node.slugSegment === "한국어버젼" || node.slugSegment === "한국어")
}

function isLanguageRootNode(node: FileTrieNode): boolean {
  return isEnglishRootNode(node) || isKoreanRootNode(node)
}

// -------------------------------------------------------------------

type FolderState = {
  path: string
  collapsed: boolean
  // (렌더링용) 아래 두 값은 localStorage에 저장하지 않고, ellipsisState(Map)에서만 관리
  expandPrev?: boolean
  expandNext?: boolean
}

let currentExplorerState: Array<FolderState>

// ✅ ellipsis만 “이동 시 초기화”하기 위한 메모리 상태 (persist X)
const ellipsisState = new Map<string, { prev: boolean; next: boolean }>()

function toggleExplorer(this: HTMLElement) {
  const nearestExplorer = this.closest(".explorer") as HTMLElement
  if (!nearestExplorer) return
  const explorerCollapsed = nearestExplorer.classList.toggle("collapsed")
  nearestExplorer.setAttribute(
    "aria-expanded",
    nearestExplorer.getAttribute("aria-expanded") === "true" ? "false" : "true",
  )

  if (!explorerCollapsed) {
    // Stop <html> from being scrollable when mobile explorer is open
    document.documentElement.classList.add("mobile-no-scroll")
  } else {
    document.documentElement.classList.remove("mobile-no-scroll")
  }
}

let lastKnownSlug: FullSlug = "index" as FullSlug
let lastExplorerActiveSlug: string | null = null

function toggleFolder(evt: MouseEvent) {
  evt.stopPropagation()
  const target = evt.target as MaybeHTMLElement
  if (!target) return

  // Check if target was svg icon or button
  const isSvg = target.nodeName === "svg"

  // corresponding <ul> element relative to clicked button/folder
  const folderContainer = (
    isSvg
      ? // svg -> div.folder-container
        target.parentElement
      : // button.folder-button -> div -> div.folder-container
        target.parentElement?.parentElement
  ) as MaybeHTMLElement
  if (!folderContainer) return
  const childFolderContainer = folderContainer.nextElementSibling as MaybeHTMLElement
  if (!childFolderContainer) return

  childFolderContainer.classList.toggle("open")

  // Collapse folder container
  const isCollapsed = !childFolderContainer.classList.contains("open")
  setFolderState(childFolderContainer, isCollapsed)

  const currentFolderState = currentExplorerState.find(
    (item) => item.path === folderContainer.dataset.folderpath,
  )
  if (currentFolderState) {
    currentFolderState.collapsed = isCollapsed
  } else {
    currentExplorerState.push({
      path: folderContainer.dataset.folderpath as FullSlug,
      collapsed: isCollapsed,
    })
  }

  // ✅ localStorage에는 “폴더 접힘 상태”만 저장 (ellipsis 토글 저장 X)
  const persisted = currentExplorerState.map(({ path, collapsed }) => ({ path, collapsed }))
  localStorage.setItem("fileTree", JSON.stringify(persisted))
}

function createEllipsisNode(
  folderPath: FullSlug,
  side: "prev" | "next",
  expanded: boolean,
): HTMLLIElement {
  const li = document.createElement("li")
  const btn = document.createElement("button")
  btn.type = "button"
  btn.className = expanded ? "explorer-ellipsis expanded" : "explorer-ellipsis"
  btn.textContent = "⋯"
  btn.dataset.folderpath = folderPath
  btn.dataset.side = side
  btn.setAttribute("aria-label", expanded ? "Collapse hidden items" : "Expand hidden items")
  li.appendChild(btn)
  return li
}

async function toggleEllipsis(evt: MouseEvent) {
  evt.preventDefault()
  evt.stopPropagation()

  const btn = evt.currentTarget as HTMLElement | null
  const folderPath = btn?.dataset.folderpath as FullSlug | undefined
  const side = btn?.dataset.side as ("prev" | "next") | undefined
  if (!folderPath || !side) return

  const st = currentExplorerState.find((s) => s.path === folderPath)
  if (!st) return

  const key = String(folderPath)
  const cur = ellipsisState.get(key) ?? { prev: false, next: false }

  if (side === "prev") cur.prev = !cur.prev
  if (side === "next") cur.next = !cur.next

  ellipsisState.set(key, cur)

  // 렌더링용 상태에도 반영
  st.expandPrev = cur.prev
  st.expandNext = cur.next

  // scroll position 유지
  const explorerUl = btn.closest(".explorer")?.querySelector(".explorer-ul") as HTMLElement | null
  if (explorerUl) {
    sessionStorage.setItem("explorerScrollTop", explorerUl.scrollTop.toString())
  }

  await setupExplorer(lastKnownSlug)
}

function createFileNode(currentSlug: FullSlug, activeSlug: FullSlug, node: FileTrieNode): HTMLLIElement {
  const template = document.getElementById("template-file") as HTMLTemplateElement
  const clone = template.content.cloneNode(true) as DocumentFragment
  const li = clone.querySelector("li") as HTMLLIElement
  const a = li.querySelector("a") as HTMLAnchorElement
  a.href = resolveRelative(currentSlug, node.slug)
  a.dataset.for = node.slug
  a.textContent = node.displayName

  if (activeSlug === node.slug) {
    a.classList.add("active")
    a.setAttribute("aria-current", "page")
  }

  return li
}

function createFolderNode(
  currentSlug: FullSlug,
  activeSlug: FullSlug,
  node: FileTrieNode,
  opts: ParsedOptions,
): HTMLLIElement {
  const template = document.getElementById("template-folder") as HTMLTemplateElement
  const clone = template.content.cloneNode(true) as DocumentFragment
  const li = clone.querySelector("li") as HTMLLIElement
  const folderContainer = li.querySelector(".folder-container") as HTMLElement
  const titleContainer = folderContainer.querySelector("div") as HTMLElement
  const folderOuter = li.querySelector(".folder-outer") as HTMLElement
  const ul = folderOuter.querySelector("ul") as HTMLUListElement

  const folderPath = node.slug
  folderContainer.dataset.folderpath = folderPath

  if (opts.folderClickBehavior === "link") {
    const button = titleContainer.querySelector(".folder-button") as HTMLElement
    const a = document.createElement("a")
    a.href = resolveRelative(currentSlug, folderPath)
    a.dataset.for = folderPath
    a.className = "folder-title"
    a.textContent = node.displayName
    button.replaceWith(a)
  } else {
    const span = titleContainer.querySelector(".folder-title") as HTMLElement
    span.textContent = node.displayName
  }

  const st = currentExplorerState.find((item) => item.path === folderPath)
  const isCollapsed = st?.collapsed ?? opts.folderDefaultState === "collapsed"

  const simpleFolderPath = simplifySlug(folderPath) as string
  const simpleActive = simplifySlug(activeSlug) as string
  const folderIsPrefixOfActive = isSimplePrefix(simpleFolderPath, simpleActive)

  if (!isCollapsed || folderIsPrefixOfActive) {
    folderOuter.classList.add("open")
  }

  // =========================
  // "현재 보는 파일 기준 ±2" + 앞/뒤는 ⋯로 접기(토글)
  // =========================
  const children = node.children
  const n = children.length

  const expandPrev = st?.expandPrev ?? false
  const expandNext = st?.expandNext ?? false

  // 이 폴더가 "현재 파일의 직계 부모"이거나 "현재 폴더 페이지"일 때만 folding 적용
  const directIdx = children.findIndex((c) => !c.isFolder && c.slug === activeSlug)
  const isCurrentFolderPage = activeSlug === folderPath
  const shouldFold = (directIdx >= 0 || isCurrentFolderPage) && n > 0

  if (!shouldFold) {
    for (const child of children) {
      const childNode = child.isFolder
        ? createFolderNode(currentSlug, activeSlug, child, opts)
        : createFileNode(currentSlug, activeSlug, child)
      ul.appendChild(childNode)
    }
    return li
  }

  const anchor = directIdx >= 0 ? directIdx : 0
  const ctxStart = Math.max(0, anchor - CONTEXT_RADIUS)
  const ctxEnd = Math.min(n - 1, anchor + CONTEXT_RADIUS)

  const hasPrevHidden = ctxStart > 0
  const hasNextHidden = ctxEnd < n - 1

  // Prev block (위쪽 ⋯ + 이전 문서들)
  if (hasPrevHidden) {
    ul.appendChild(createEllipsisNode(folderPath, "prev", expandPrev))
    if (expandPrev) {
      for (let i = 0; i < ctxStart; i++) {
        const child = children[i]
        const childNode = child.isFolder
          ? createFolderNode(currentSlug, activeSlug, child, opts)
          : createFileNode(currentSlug, activeSlug, child)
        ul.appendChild(childNode)
      }
    }
  }

  // Context block (항상 보이는 ±2)
  for (let i = ctxStart; i <= ctxEnd; i++) {
    const child = children[i]
    const childNode = child.isFolder
      ? createFolderNode(currentSlug, activeSlug, child, opts)
      : createFileNode(currentSlug, activeSlug, child)
    ul.appendChild(childNode)
  }

  // Next block (아래쪽 ⋯ + 이후 문서들) — 펼쳤을 땐 목록 아래로 ⋯ 내려감
  if (hasNextHidden) {
    if (expandNext) {
      for (let i = ctxEnd + 1; i < n; i++) {
        const child = children[i]
        const childNode = child.isFolder
          ? createFolderNode(currentSlug, activeSlug, child, opts)
          : createFileNode(currentSlug, activeSlug, child)
        ul.appendChild(childNode)
      }
      ul.appendChild(createEllipsisNode(folderPath, "next", true))
    } else {
      ul.appendChild(createEllipsisNode(folderPath, "next", false))
    }
  }

  return li
}

async function setupExplorer(currentSlug: FullSlug) {
  // (A) URL이 folder/, folder, folder/page/2 처럼 들어와도 처리하기 위해 단순화
  const simpleUrl = simplifySlug(currentSlug as FullSlug) as string

  // (B) 페이지네이션 페이지면 “실제 HTML 파일 경로”는 항상 .../index
  const pageMatch = simpleUrl.match(/^(.*\/page\/\d+)$/)
  const currentSlugForLinks: FullSlug =
    simpleUrl === "/"
      ? ("index" as FullSlug)
      : (pageMatch ? `${pageMatch[1]}/index` : (simpleUrl as FullSlug))

  // (C) active는 페이지네이션이면 base 폴더로, 아니면 현재 페이지로
  const activeBaseSimple = pageMatch ? pageMatch[1].replace(/\/page\/\d+$/, "") : simpleUrl
  const activeSlugRaw: FullSlug =
    activeBaseSimple === "/"
      ? ("index" as FullSlug)
      : ((activeBaseSimple === "" ? "index" : activeBaseSimple) as FullSlug)

  // ✅ lastKnownSlug는 "링크 기준 slug"로 저장 (toggleEllipsis가 이걸로 rerender하므로 중요)
  lastKnownSlug = currentSlugForLinks

  // navigationChanged는 “active 기준”으로 비교 (폴더/페이지 이동 감지)
  const navigationChanged = lastExplorerActiveSlug !== String(activeSlugRaw)
  lastExplorerActiveSlug = String(activeSlugRaw)

  const allExplorers = document.querySelectorAll("div.explorer") as NodeListOf<HTMLElement>

  for (const explorer of allExplorers) {
    ...

  for (const explorer of allExplorers) {
    const dataFns = JSON.parse(explorer.dataset.dataFns || "{}")
    const opts: ParsedOptions = {
      folderClickBehavior: (explorer.dataset.behavior || "collapse") as "collapse" | "link",
      folderDefaultState: (explorer.dataset.collapsed || "collapsed") as "collapsed" | "open",
      useSavedState: explorer.dataset.savestate === "true",
      order: dataFns.order || ["filter", "map", "sort"],
      sortFn: new Function("return " + (dataFns.sortFn || "undefined"))(),
      filterFn: new Function("return " + (dataFns.filterFn || "undefined"))(),
      mapFn: new Function("return " + (dataFns.mapFn || "undefined"))(),
    }

    updateExplorerTitle(explorer, currentSlug)

    // Get folder state from local storage (collapsed만 사용)
    const storageTree = localStorage.getItem("fileTree")
    const serializedExplorerState = storageTree && opts.useSavedState ? JSON.parse(storageTree) : []
    const oldCollapsed = new Map<string, boolean>(
      serializedExplorerState.map((entry: FolderState) => [entry.path, entry.collapsed]),
    )

    const data = await fetchData
    const entries = [...Object.entries(data)] as [FullSlug, ContentDetails][]
    const trie = FileTrieNode.fromEntries(entries)
    const parts = (s: string) => s.split("/").filter(Boolean)

    // (1) 링크 기준 current page가 trie에 존재하면(폴더면 folder/index로) canonicalize
    const currentNode = trie.findNode(parts(simplifySlug(currentSlugForLinks as FullSlug) as string))
    const canonicalCurrentForLinks = (currentNode?.slug ?? currentSlugForLinks) as FullSlug

    // (2) active도 trie 기준으로 canonicalize (폴더 페이지면 folder/index로 맞춰짐)
    const activeNode = trie.findNode(parts(simplifySlug(activeSlugRaw as FullSlug) as string))
    const canonicalActiveSlug = (activeNode?.slug ?? activeSlugRaw) as FullSlug

    // Apply functions in order (기존 옵션 적용)
    for (const fn of opts.order) {
      switch (fn) {
        case "filter":
          if (opts.filterFn) trie.filter(opts.filterFn)
          break
        case "map":
          if (opts.mapFn) trie.map(opts.mapFn)
          break
        case "sort":
          if (opts.sortFn) trie.sort(opts.sortFn)
          break
      }
    }

    // -------------------------------
    // Language-aware filtering & virtual root
    // -------------------------------
    const currentLang = getLangFromSlug(currentSlug)
    let renderRoot = trie // 기본: 홈(index)에서는 전체 트리 그대로

    if (currentLang) {
      trie.filter((node) => {
        if (node.slugSegment === "tags") return false
        if (isEnglishRootNode(node)) return currentLang === "en"
        if (isKoreanRootNode(node)) return currentLang === "ko"

        const lang = getLangFromSlug(node.slug)
        if (!lang) return true
        return lang === currentLang
      })

      const langRoot = trie.children.find((child) => {
        return currentLang === "en" ? isEnglishRootNode(child) : isKoreanRootNode(child)
      })

      if (langRoot && langRoot.isFolder) {
        renderRoot = langRoot
      }
    }

    const hiddenRootPath = renderRoot !== trie ? renderRoot.slug : null
    const folderPaths = renderRoot
      .getFolderPaths()
      .filter((path) => (hiddenRootPath ? path !== hiddenRootPath : true))

    currentExplorerState = folderPaths.map((path) => {
      const previousCollapsed = oldCollapsed.get(path)
      const mem = ellipsisState.get(String(path)) ?? { prev: false, next: false }

      return {
        path,
        collapsed:
          previousCollapsed === undefined ? opts.folderDefaultState === "collapsed" : previousCollapsed,
        expandPrev: mem.prev,
        expandNext: mem.next,
      }
    })

    const explorerUl = explorer.querySelector(".explorer-ul")
    if (!explorerUl) continue

    explorerUl.innerHTML = ""

    const fragment = document.createDocumentFragment()
    for (const child of renderRoot.children) {
      const node = child.isFolder
        ? createFolderNode(canonicalCurrentForLinks, canonicalActiveSlug, child, opts)
        : createFileNode(canonicalCurrentForLinks, canonicalActiveSlug, child)
      fragment.appendChild(node)
    }
    explorerUl.insertBefore(fragment, explorerUl.firstChild)

    const scrollTop = sessionStorage.getItem("explorerScrollTop")
    if (scrollTop) {
      explorerUl.scrollTop = parseInt(scrollTop)
    } else {
      const activeElement = explorerUl.querySelector(".active")
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: "smooth" })
      }
    }

    // Set up event handlers
    const explorerButtons = explorer.getElementsByClassName("explorer-toggle") as HTMLCollectionOf<HTMLElement>
    for (const button of explorerButtons) {
      button.addEventListener("click", toggleExplorer)
      window.addCleanup(() => button.removeEventListener("click", toggleExplorer))
    }

    // Set up folder click handlers
    if (opts.folderClickBehavior === "collapse") {
      const folderButtons = explorer.getElementsByClassName("folder-button") as HTMLCollectionOf<HTMLElement>
      for (const button of folderButtons) {
        button.addEventListener("click", toggleFolder)
        window.addCleanup(() => button.removeEventListener("click", toggleFolder))
      }
    }

    const folderIcons = explorer.getElementsByClassName("folder-icon") as HTMLCollectionOf<HTMLElement>
    for (const icon of folderIcons) {
      icon.addEventListener("click", toggleFolder)
      window.addCleanup(() => icon.removeEventListener("click", toggleFolder))
    }

    const ellipsisButtons = explorer.getElementsByClassName("explorer-ellipsis") as HTMLCollectionOf<HTMLElement>
    for (const btn of ellipsisButtons) {
      btn.addEventListener("click", toggleEllipsis)
      window.addCleanup(() => btn.removeEventListener("click", toggleEllipsis))
    }
  }
}

document.addEventListener("prenav", async () => {
  const explorer = document.querySelector(".explorer-ul") as HTMLElement | null
  if (!explorer) return
  sessionStorage.setItem("explorerScrollTop", explorer.scrollTop.toString())
})

document.addEventListener("nav", async (e: CustomEventMap["nav"]) => {
  const currentSlug = simplifySlug(e.detail.url as FullSlug) as FullSlug
  await setupExplorer(currentSlug)

  // if mobile hamburger is visible, collapse by default
  for (const explorer of document.getElementsByClassName("explorer")) {
    const mobileExplorer = (explorer as HTMLElement).querySelector(".mobile-explorer")
    if (!mobileExplorer) return

    if ((mobileExplorer as HTMLElement).checkVisibility()) {
      ;(explorer as HTMLElement).classList.add("collapsed")
      ;(explorer as HTMLElement).setAttribute("aria-expanded", "false")
      document.documentElement.classList.remove("mobile-no-scroll")
    }

    ;(mobileExplorer as HTMLElement).classList.remove("hide-until-loaded")
  }
})

window.addEventListener("resize", function () {
  const explorer = document.querySelector(".explorer")
  if (explorer && !explorer.classList.contains("collapsed")) {
    document.documentElement.classList.add("mobile-no-scroll")
    return
  }
})

function setFolderState(folderElement: HTMLElement, collapsed: boolean) {
  return collapsed ? folderElement.classList.remove("open") : folderElement.classList.add("open")
}
