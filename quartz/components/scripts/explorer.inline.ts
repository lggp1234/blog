import { FileTrieNode } from "../../util/fileTrie"
import { FullSlug, resolveRelative } from "../../util/path"
import { ContentDetails } from "../../plugins/emitters/contentIndex"

type MaybeHTMLElement = HTMLElement | undefined

function isGlobalHomeSlug(slug: string): boolean {
  // Quartz 버전에 따라 홈 slug가 "index" 또는 빈 문자열일 수 있어서 둘 다 처리
  return slug === "index" || slug === ""
}

function persistCurrentlyOpenFolders(explorer: HTMLElement) {
  if (!currentExplorerState) return

  const folderContainers = explorer.querySelectorAll(".folder-container") as NodeListOf<HTMLElement>

  for (const folderContainer of folderContainers) {
    const folderOuter = folderContainer.nextElementSibling as HTMLElement | null
    if (!folderOuter || !folderOuter.classList.contains("folder-outer")) continue

    const isOpen = folderOuter.classList.contains("open")
    const folderKey =
      folderContainer.dataset.folderkey ??
      normalizeExplorerStatePath(folderContainer.dataset.folderpath || "")

    const st = currentExplorerState.find((x) => x.path === folderKey)
    if (st) st.collapsed = !isOpen
    else currentExplorerState.push({ path: folderKey, collapsed: !isOpen })
  }

  localStorage.setItem("fileTree", JSON.stringify(currentExplorerState))
}

function normalizeExplorerStatePath(path: string): string {
  // Explorer state key must be stable across (en/ko) AND must not include trailing /index.
  // Your content uses ordered prefixes like "1-...". We normalize each segment to just the number
  // so that "1-study" and "1-학업" map to the same key ("1").
  const raw = path.startsWith("/") ? path.slice(1) : path
  const segs = raw.split("/").filter((s) => s.length > 0)

  // drop trailing index (folder slugs are like .../index)
  if (segs.at(-1) === "index") segs.pop()

  const isLangRoot = (s: string) => s === "english" || s === "한국어버젼" || s === "한국어"

  // keep language root itself unique (home page), but strip it for all descendants (for en<->ko sharing)
  if (segs.length === 1 && isLangRoot(segs[0])) {
    return segs[0]
  }
  if (segs.length >= 2 && isLangRoot(segs[0])) {
    segs.shift()
  }

  // order-prefix normalization: "12-foo" -> "12"
  const normalized = segs.map((seg) => {
    const m = seg.match(/^(\d+)-/)
    return m ? m[1] : seg
  })

  return normalized.join("/")
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

// -------------------------------------------------------------------

type FolderState = {
  path: string
  collapsed: boolean
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

function toggleFolder(evt: MouseEvent) {
  evt.stopPropagation()
  const target = evt.target as MaybeHTMLElement
  if (!target) return

  const isSvg = target.nodeName === "svg"

  // svg(folder-icon) 클릭이면 parent가 div.folder-container
  // button 클릭이면 parentElement?.parentElement가 div.folder-container
  const folderContainer = (
    isSvg ? target.parentElement : target.parentElement?.parentElement
  ) as MaybeHTMLElement
  if (!folderContainer) return

  const childFolderContainer = folderContainer.nextElementSibling as MaybeHTMLElement
  if (!childFolderContainer) return

  // 토글
  childFolderContainer.classList.toggle("open")

  const isCollapsed = !childFolderContainer.classList.contains("open")
  setFolderState(childFolderContainer, isCollapsed)

  // 열렸을 때만 compact 적용
  if (!isCollapsed) {
    const ul = childFolderContainer.querySelector("ul") as HTMLUListElement | null
    if (ul) applyCompactRuleToUl(ul)
  }

  // ✅ 상태 키는 무조건 "정규화 키"로 통일
  const folderKey =
    folderContainer.dataset.folderkey ??
    normalizeExplorerStatePath(folderContainer.dataset.folderpath || "")

  const currentFolderState = currentExplorerState.find((item) => item.path === folderKey)
  if (currentFolderState) {
    currentFolderState.collapsed = isCollapsed
  } else {
    currentExplorerState.push({ path: folderKey, collapsed: isCollapsed })
  }

  localStorage.setItem("fileTree", JSON.stringify(currentExplorerState))
}

function createFileNode(currentSlug: FullSlug, node: FileTrieNode): HTMLLIElement {
  const template = document.getElementById("template-file") as HTMLTemplateElement
  const clone = template.content.cloneNode(true) as DocumentFragment
  const li = clone.querySelector("li") as HTMLLIElement
  const a = li.querySelector("a") as HTMLAnchorElement
  a.href = resolveRelative(currentSlug, node.slug)
  a.dataset.for = node.slug
  a.textContent = node.displayName

  if (currentSlug === node.slug) {
    a.classList.add("active")
  }

  return li
}

function createFolderNode(
  currentSlug: FullSlug,
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
  const folderKey = normalizeExplorerStatePath(folderPath)

  // 원본 경로(혹시 필요할 수 있어) + 정규화 키(상태 저장용)를 분리해서 저장
  folderContainer.dataset.folderpath = folderPath
  folderContainer.dataset.folderkey = folderKey

  if (opts.folderClickBehavior === "link") {
    // Replace button with link for link behavior
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

  // if the saved state is collapsed or the default state is collapsed
  const isCollapsed =
    currentExplorerState.find((item) => item.path === folderKey)?.collapsed ??
    opts.folderDefaultState === "collapsed"

  // if this folder is a prefix of the current path we
  // want to open it anyways
  const currentKey = normalizeExplorerStatePath(currentSlug)
  const folderIsPrefixOfCurrentSlug =
    currentKey === folderKey || currentKey.startsWith(folderKey + "/")

  if (!isCollapsed || folderIsPrefixOfCurrentSlug) {
    folderOuter.classList.add("open")
  }

  for (const child of node.children) {
    const childNode = child.isFolder
      ? createFolderNode(currentSlug, child, opts)
      : createFileNode(currentSlug, child)
    ul.appendChild(childNode)
  }
  if (folderOuter.classList.contains("open")) {
    applyCompactRuleToUl(ul)
  }
  return li
}

function applyCompactRuleToUl(ul: HTMLUListElement) {
  // (1) 이 UL의 "직계 파일 li"만 모음: <li><a ...></a></li>
  const fileLis = Array.from(ul.children).filter((el): el is HTMLLIElement => {
    if (!(el instanceof HTMLLIElement)) return false
    if (el.classList.contains("ce-ellipsis")) return false
    return el.firstElementChild?.tagName === "A"
  })

  // 파일이 적으면 굳이 접지 않음
  if (fileLis.length <= 5) return

  // (2) focus: 이 UL에서 active 파일이 있으면 그걸 기준, 없으면 0번(처음) 기준
  const activeLi = ul.querySelector(":scope > li > a.active")?.closest("li") as HTMLLIElement | null
  const focusIndex = activeLi ? fileLis.indexOf(activeLi) : 0

  // (3) 이전에 만들어둔 ⋯ 제거(중복 방지)
  ul.querySelectorAll(":scope > li.ce-ellipsis").forEach((n) => n.remove())

  // (4) 펼침 상태는 UL dataset으로 유지(폴더 닫았다 열어도 유지되게)
  let prevOpen = ul.dataset.cePrevOpen === "true"
  let nextOpen = ul.dataset.ceNextOpen === "true"

  const start = Math.max(0, focusIndex - 2)
  const end = Math.min(fileLis.length - 1, focusIndex + 2)

  const hasPrev = start > 0
  const hasNext = end < fileLis.length - 1

  let prevBtn: HTMLButtonElement | null = null
  let nextBtn: HTMLButtonElement | null = null

  const update = () => {
    for (let i = 0; i < fileLis.length; i++) {
      const li = fileLis[i]
      const inWindow = i >= start && i <= end
      const inPrev = i < start
      const inNext = i > end
      const show = inWindow || (prevOpen && inPrev) || (nextOpen && inNext)
      li.classList.toggle("ce-hidden", !show)
    }

    // 상태 저장
    ul.dataset.cePrevOpen = String(prevOpen)
    ul.dataset.ceNextOpen = String(nextOpen)

    if (prevBtn) prevBtn.classList.toggle("is-open", prevOpen)
    if (nextBtn) nextBtn.classList.toggle("is-open", nextOpen)
  }

  // (5) 위쪽 ⋯
  if (hasPrev) {
    const li = document.createElement("li")
    li.className = "ce-ellipsis ce-prev"

    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = "ce-ellipsis-btn"
    btn.textContent = "⋯"

    const onClick = (e: MouseEvent) => {
      e.preventDefault()
      prevOpen = !prevOpen
      update()
    }
    btn.addEventListener("click", onClick)
    window.addCleanup(() => btn.removeEventListener("click", onClick))

    li.appendChild(btn)
    ul.insertBefore(li, fileLis[0]) // 맨 위에
    prevBtn = btn
  } else {
    prevOpen = false
  }

  // (6) 아래쪽 ⋯  (펼쳐지면 버튼이 아래로 “밀려 내려가도록” 맨 아래에 둠)
  if (hasNext) {
    const li = document.createElement("li")
    li.className = "ce-ellipsis ce-next"

    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = "ce-ellipsis-btn"
    btn.textContent = "⋯"

    const onClick = (e: MouseEvent) => {
      e.preventDefault()
      nextOpen = !nextOpen
      update()
    }
    btn.addEventListener("click", onClick)
    window.addCleanup(() => btn.removeEventListener("click", onClick))

    li.appendChild(btn)
    ul.appendChild(li) // 항상 맨 아래
    nextBtn = btn
  } else {
    nextOpen = false
  }

  update()
}

function applyCompactRuleToOpenFolders(explorer: HTMLElement) {
  // 현재 "열려있는 폴더들"의 ul에 대해, 처음부터 compact 적용
  const uls = explorer.querySelectorAll(".folder-outer.open > ul") as NodeListOf<HTMLUListElement>
  for (const ul of uls) {
    applyCompactRuleToUl(ul)
  }
}

async function setupExplorer(currentSlug: FullSlug) {
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
    const serializedExplorerState: FolderState[] =
      storageTree && opts.useSavedState ? JSON.parse(storageTree) : []

    // If we changed the normalization rules (e.g., en/ko share the same numeric keys),
    // multiple legacy entries can collapse into the same key. In that case we prefer "open"
    // if ANY of them was open (i.e., collapsed=false).
    const oldIndex = new Map<string, boolean>()
    for (const entry of serializedExplorerState) {
      const key = normalizeExplorerStatePath(entry.path)
      const prev = oldIndex.get(key)
      oldIndex.set(key, prev === undefined ? entry.collapsed : prev && entry.collapsed)
    }

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
      const key = normalizeExplorerStatePath(path)
      const previousState = oldIndex.get(key)
      return {
        path: key,
        collapsed: previousState === undefined ? opts.folderDefaultState === "collapsed" : previousState,
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
        ? createFolderNode(currentSlug, child, opts)
        : createFileNode(currentSlug, child)

      fragment.appendChild(node)
    }
    explorerUl.insertBefore(fragment, explorerUl.firstChild)
    applyCompactRuleToOpenFolders(explorer)

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
  }
}

document.addEventListener("prenav", () => {
  const explorers = document.querySelectorAll("div.explorer") as NodeListOf<HTMLElement>

  for (const ex of explorers) {
    // 1) 스크롤 위치 저장(기존 기능 유지)
    const ul = ex.querySelector(".explorer-ul") as HTMLElement | null
    if (ul) sessionStorage.setItem("explorerScrollTop", ul.scrollTop.toString())

    // 2) ✅ 현재 화면에서 열려있는 폴더 상태를 저장 (자동으로 열린 폴더 포함)
    persistCurrentlyOpenFolders(ex)
  }
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
