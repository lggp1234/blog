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
  // foo/bar/page/2/index -> foo/bar/index
  const m = (slug as string).match(/^(.*)\/page\/\d+\/index$/)
  return (m ? `${m[1]}/index` : slug) as FullSlug
}

function isSimplePrefix(prefix: string, target: string): boolean {
  if (prefix === "/" || prefix === "") return true
  return target === prefix || target.startsWith(prefix + "/")
}

function normalizePaginationSlug(slug: FullSlug): FullSlug {
  // foo/bar/page/2/index -> foo/bar/index
  const m = (slug as string).match(/^(.*)\/page\/\d+\/index$/)
  return (m ? `${m[1]}/index` : slug) as FullSlug
}

function updateExplorerTitle(explorer: HTMLElement, currentSlug: FullSlug) {
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
  if (
    slug === "한국어버젼" ||
    slug === "한국어버젼/index" ||
    slug.startsWith("한국어버젼/")
  ) {
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
  expandPrev?: boolean
  expandNext?: boolean
}

let currentExplorerState: Array<FolderState>
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

  const stringifiedFileTree = JSON.stringify(currentExplorerState)
  localStorage.setItem("fileTree", stringifiedFileTree)
}

function createEllipsisNode(folderPath: FullSlug, side: "prev" | "next", expanded: boolean): HTMLLIElement {
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

  if (side === "prev") st.expandPrev = !(st.expandPrev ?? false)
  if (side === "next") st.expandNext = !(st.expandNext ?? false)

  localStorage.setItem("fileTree", JSON.stringify(currentExplorerState))

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

  // Next block (아래쪽 ⋯ + 이후 문서들)
  if (hasNextHidden) {
    ul.appendChild(createEllipsisNode(folderPath, "next", expandNext))
    if (expandNext) {
      for (let i = ctxEnd + 1; i < n; i++) {
        const child = children[i]
        const childNode = child.isFolder
          ? createFolderNode(currentSlug, activeSlug, child, opts)
          : createFileNode(currentSlug, activeSlug, child)
        ul.appendChild(childNode)
      }
    }
  }

  return li
}

async function setupExplorer(currentSlug: FullSlug) {
  lastKnownSlug = currentSlug
  const activeSlug = normalizePaginationSlug(currentSlug)
  const activeSlug = normalizePaginationSlug(currentSlug)
  const allExplorers = document.querySelectorAll("div.explorer") as NodeListOf<HTMLElement>

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

    // Get folder state from local storage
    const storageTree = localStorage.getItem("fileTree")
    const serializedExplorerState = storageTree && opts.useSavedState ? JSON.parse(storageTree) : []
    const oldCollapsed = new Map<string, boolean>(
      serializedExplorerState.map((entry: FolderState) => [entry.path, entry.collapsed]),
    )
    const oldExpandPrev = new Map<string, boolean>(
      serializedExplorerState.map((entry: FolderState) => [entry.path, entry.expandPrev ?? false]),
    )
    const oldExpandNext = new Map<string, boolean>(
      serializedExplorerState.map((entry: FolderState) => [entry.path, entry.expandNext ?? false]),
    )

    const data = await fetchData
    const entries = [...Object.entries(data)] as [FullSlug, ContentDetails][]
    const trie = FileTrieNode.fromEntries(entries)

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
      // 현재 언어가 정해진 페이지에서는 반대 언어 제거
      trie.filter((node) => {
        // tags는 기존 filterFn에서 보통 걸러지지만, 혹시 모르니 한번 더 방어
        if (node.slugSegment === "tags") return false

        // 최상위 언어 루트 폴더는 명시적으로 판정
        if (isEnglishRootNode(node)) return currentLang === "en"
        if (isKoreanRootNode(node)) return currentLang === "ko"

        // 일반 노드들은 slug prefix로 판정
        const lang = getLangFromSlug(node.slug)
        if (!lang) return true // 언어 중립 노드는 유지
        return lang === currentLang
      })

      // 현재 언어 루트 폴더를 찾아서, 그 children만 루트처럼 보여주기
      const langRoot = trie.children.find((child) => {
        return currentLang === "en" ? isEnglishRootNode(child) : isKoreanRootNode(child)
      })

      if (langRoot && langRoot.isFolder) {
        renderRoot = langRoot
      }
    }

    // Get folder paths for state management
    // (virtual root인 경우, 그 루트 폴더 자체는 렌더링 안 하므로 상태 목록에서도 제외)
    const hiddenRootPath = renderRoot !== trie ? renderRoot.slug : null
    const folderPaths = renderRoot
      .getFolderPaths()
      .filter((path) => (hiddenRootPath ? path !== hiddenRootPath : true))

    currentExplorerState = folderPaths.map((path) => {
      const previousCollapsed = oldCollapsed.get(path)
      const previousExpandPrev = oldExpandPrev.get(path)
      const previousExpandNext = oldExpandNext.get(path)
      return {
        path,
        collapsed: previousCollapsed === undefined ? opts.folderDefaultState === "collapsed" : previousCollapsed,
        expandPrev: previousExpandPrev ?? false,
        expandNext: previousExpandNext ?? false,
      }
    })

    const explorerUl = explorer.querySelector(".explorer-ul")
    if (!explorerUl) continue

    // (중요) 기존 내용 비우고 다시 그림
    explorerUl.innerHTML = ""

    // Create and insert new content
    const fragment = document.createDocumentFragment()
    for (const child of renderRoot.children) {
      const node = child.isFolder
        ? createFolderNode(currentSlug, activeSlug, child, opts)
        : createFileNode(currentSlug, activeSlug, child)

      fragment.appendChild(node)
    }
    explorerUl.insertBefore(fragment, explorerUl.firstChild)

    // restore explorer scrollTop position if it exists
    const scrollTop = sessionStorage.getItem("explorerScrollTop")
    if (scrollTop) {
      explorerUl.scrollTop = parseInt(scrollTop)
    } else {
      // try to scroll to the active element if it exists
      const activeElement = explorerUl.querySelector(".active")
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: "smooth" })
      }
    }

    // Set up event handlers
    const explorerButtons = explorer.getElementsByClassName(
      "explorer-toggle",
    ) as HTMLCollectionOf<HTMLElement>
    for (const button of explorerButtons) {
      button.addEventListener("click", toggleExplorer)
      window.addCleanup(() => button.removeEventListener("click", toggleExplorer))
    }

    // Set up folder click handlers
    if (opts.folderClickBehavior === "collapse") {
      const folderButtons = explorer.getElementsByClassName(
        "folder-button",
      ) as HTMLCollectionOf<HTMLElement>
      for (const button of folderButtons) {
        button.addEventListener("click", toggleFolder)
        window.addCleanup(() => button.removeEventListener("click", toggleFolder))
      }
    }

    const folderIcons = explorer.getElementsByClassName(
      "folder-icon",
    ) as HTMLCollectionOf<HTMLElement>
    for (const icon of folderIcons) {
      icon.addEventListener("click", toggleFolder)
      window.addCleanup(() => icon.removeEventListener("click", toggleFolder))
    }

    const ellipsisButtons = explorer.getElementsByClassName(
      "explorer-ellipsis",
    ) as HTMLCollectionOf<HTMLElement>
    for (const btn of ellipsisButtons) {
      btn.addEventListener("click", toggleEllipsis)
      window.addCleanup(() => btn.removeEventListener("click", toggleEllipsis))
    }
  }
}

document.addEventListener("prenav", async () => {
  // save explorer scrollTop position
  const explorer = document.querySelector(".explorer-ul")
  if (!explorer) return
  sessionStorage.setItem("explorerScrollTop", explorer.scrollTop.toString())
})

document.addEventListener("nav", async (e: CustomEventMap["nav"]) => {
  const currentSlug = e.detail.url
  await setupExplorer(currentSlug)

  // if mobile hamburger is visible, collapse by default
  for (const explorer of document.getElementsByClassName("explorer")) {
    const mobileExplorer = explorer.querySelector(".mobile-explorer")
    if (!mobileExplorer) return

    if (mobileExplorer.checkVisibility()) {
      explorer.classList.add("collapsed")
      explorer.setAttribute("aria-expanded", "false")

      // Allow <html> to be scrollable when mobile explorer is collapsed
      document.documentElement.classList.remove("mobile-no-scroll")
    }

    mobileExplorer.classList.remove("hide-until-loaded")
  }
})

window.addEventListener("resize", function () {
  // Desktop explorer opens by default, and it stays open when the window is resized
  // to mobile screen size. Applies `no-scroll` to <html> in this edge case.
  const explorer = document.querySelector(".explorer")
  if (explorer && !explorer.classList.contains("collapsed")) {
    document.documentElement.classList.add("mobile-no-scroll")
    return
  }
})

function setFolderState(folderElement: HTMLElement, collapsed: boolean) {
  return collapsed ? folderElement.classList.remove("open") : folderElement.classList.add("open")
}
