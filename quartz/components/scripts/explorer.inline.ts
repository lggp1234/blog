import { FileTrieNode } from "../../util/fileTrie"
import { FullSlug, resolveRelative } from "../../util/path"
import { ContentDetails } from "../../plugins/emitters/contentIndex"

type MaybeHTMLElement = HTMLElement | undefined

// --------------------- persisted state keys ---------------------
const FILETREE_KEY = "fileTree.v2"          // 새 저장 키(언어 독립)
const FILETREE_KEY_LEGACY = "fileTree"      // 기존 저장 키(마이그레이션용)
const EXPLORER_UI_KEY = "explorerUi.v1"     // 탐색기 전체 접힘/펼침 상태 저장

const EXPLORER_COMPACT_KEY = "explorerCompact.v1"

// --------------------- Text Accordion sync ---------------------
const FOLDER_STATE_EVT = "quartz:folder-state"

type FolderStateEvtDetail = {
  folderKey: string
  collapsed: boolean
  source: "explorer" | "content"
}

function cssEscape(s: string): string {
  // @ts-ignore
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s)
  return s.replace(/[^a-zA-Z0-9_\-]/g, (c) => `\\${c}`)
}

/** folderContainer가 text-accordion일 때만 title 앞에 > / ∨ 를 갱신 */
function updateTextAccordionTitle(folderContainer: HTMLElement, collapsed: boolean) {
  if (!folderContainer.classList.contains("folder-text-accordion")) return

  const titleEl = folderContainer.querySelector(".folder-title") as HTMLElement | null
  if (!titleEl) return

  const base =
    titleEl.dataset.baseTitle ??
    (titleEl.textContent ?? "").replace(/^[>∨]\s+/, "")

  titleEl.dataset.baseTitle = base
  titleEl.textContent = `${collapsed ? ACC_ARROW_CLOSED : ACC_ARROW_OPEN} ${base}`
}

type ExplorerCompactState = {
  prevOpen: boolean
  nextOpen: boolean
}

function readCompactStateMap(): Record<string, ExplorerCompactState> {
  const raw = localStorage.getItem(EXPLORER_COMPACT_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, ExplorerCompactState>
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function writeCompactStateMap(map: Record<string, ExplorerCompactState>) {
  localStorage.setItem(EXPLORER_COMPACT_KEY, JSON.stringify(map))
}

function loadCompactState(folderKey: string): ExplorerCompactState | null {
  const map = readCompactStateMap()
  return map[folderKey] ?? null
}

function saveCompactState(folderKey: string, prevOpen: boolean, nextOpen: boolean) {
  const map = readCompactStateMap()
  map[folderKey] = { prevOpen, nextOpen }
  writeCompactStateMap(map)
}

type ExplorerUiState = {
  desktopCollapsed: boolean
  mobileCollapsed: boolean
}

function readExplorerUiState(): ExplorerUiState {
  const raw = localStorage.getItem(EXPLORER_UI_KEY)
  if (!raw) return { desktopCollapsed: false, mobileCollapsed: true }
  try {
    const parsed = JSON.parse(raw) as Partial<ExplorerUiState>
    return {
      desktopCollapsed: parsed.desktopCollapsed ?? false,
      mobileCollapsed: parsed.mobileCollapsed ?? true,
    }
  } catch {
    return { desktopCollapsed: false, mobileCollapsed: true }
  }
}

function writeExplorerUiState(next: Partial<ExplorerUiState>) {
  const cur = readExplorerUiState()
  localStorage.setItem(EXPLORER_UI_KEY, JSON.stringify({ ...cur, ...next }))
}

function isGlobalHomeSlug(slug: string): boolean {
  // Quartz 버전에 따라 홈 slug가 "index" 또는 빈 문자열일 수 있어서 둘 다 처리
  return slug === "index" || slug === ""
}


function stripIndexFromSlug(slug: string): string {
  return slug.endsWith("/index") ? slug.slice(0, -"/index".length) : slug
}

function rootSegmentOfSlug(slug: string): string {
  const raw = slug.startsWith("/") ? slug.slice(1) : slug
  return raw.split("/").filter(Boolean)[0] ?? ""
}

function isEscapedUnicodeSegment(seg: string): boolean {
  // e.g., Ud55cUad6dUc5b4... (Quartz slugify removes '#')
  return /^U[0-9A-Fa-f]{4}/.test(seg)
}

function isKoreanRootSegment(seg: string): boolean {
  return seg === "한국어버젼" || seg === "한국어" || isEscapedUnicodeSegment(seg)
}

function isLangRootSegment(seg: string): boolean {
  return seg === "english" || isKoreanRootSegment(seg)
}

function extractNumericPrefix(seg: string): string | null {
  const m = seg.match(/^(\d+)[-\.]/) ?? seg.match(/^(\d+)-/)
  return m ? m[1] : null
}

function folderIndexAmongFolders(parent: FileTrieNode, child: FileTrieNode): number {
  let idx = 0
  for (const c of parent.children) {
    if (!c.isFolder) continue
    if (c === child) return idx
    idx++
  }
  return 0
}

function folderTokenFromNode(node: FileTrieNode, indexAmongFolders0: number): string {
  // 언어 루트 폴더는 충돌 방지용으로 고정 토큰 사용
  if (node.slugSegment === "english") return "lang-en"
  if (isKoreanRootSegment(node.slugSegment)) return "lang-ko"

  // 숫자 프리픽스(예: 1-study, 2-research)가 있으면 그걸 우선 사용
  const hint = String((node as any)?.fileSegmentHint ?? node.slugSegment ?? "")
  const n = extractNumericPrefix(hint)
  if (n) return n

  // 숫자 프리픽스가 없으면 “형제 폴더 중 몇 번째인지(1-based)”를 사용 (언어 독립)
  return String(indexAmongFolders0 + 1)
}

function computeOpenFolderKeySet(renderRoot: FileTrieNode, currentSlug: FullSlug): Set<string> {
  const open = new Set<string>()

  const curSegs = stripIndexFromSlug(currentSlug).split("/").filter(Boolean)
  const rootSegs = stripIndexFromSlug(renderRoot.slug).split("/").filter(Boolean)

  // currentSlug를 renderRoot 기준 상대 경로로 만들기
  let segs = curSegs
  if (
    rootSegs.length > 0 &&
    segs.length >= rootSegs.length &&
    rootSegs.every((s, i) => segs[i] === s)
  ) {
    segs = segs.slice(rootSegs.length)
  }

  let node: FileTrieNode = renderRoot
  let key = ""

  for (const seg of segs) {
    const next = node.children.find((c) => c.slugSegment === seg)
    if (!next) break
    if (!next.isFolder) break

    const i0 = folderIndexAmongFolders(node, next)
    const token = folderTokenFromNode(next, i0)
    key = key ? `${key}/${token}` : token
    open.add(key)

    node = next
  }

  return open
}

function isTopLevelFolder(node: FileTrieNode): boolean {
  if (!node.isFolder) return false
  const noIndex = stripIndexFromSlug(node.slug)
  return noIndex.split("/").filter(Boolean).length === 1
}

function safeEvalFn<T>(code: string | undefined, label: string): T | undefined {
  try {
    return new Function("return " + (code || "undefined"))() as T
  } catch (e) {
    console.warn(`[Explorer] failed to eval ${label}`, e)
    return undefined
  }
}

// ✅ "실제 파일/폴더명(파일시스템 segment)" 기준 정렬
function physicalNameKey(n: any): string {
  // private field지만 런타임에는 프로퍼티로 존재함
  let s = String(n?.fileSegmentHint ?? n?.slugSegment ?? n?.displayName ?? "").trim()
  s = s.replace(/\.(md|mdx)$/i, "")
  return s
}

function physicalSort(a: any, b: any): number {
  if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
  return physicalNameKey(a).localeCompare(physicalNameKey(b), ["ko", "en"], {
    numeric: true,
    sensitivity: "base",
  })
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
      normalizeExplorerStatePathLegacy(folderContainer.dataset.folderpath || "")
    
    const st = currentExplorerState.find((x) => x.path === folderKey)
    if (st) st.collapsed = !isOpen
    else currentExplorerState.push({ path: folderKey, collapsed: !isOpen })
  }

  localStorage.setItem(FILETREE_KEY, JSON.stringify(currentExplorerState))
}

function persistCompactStateFromExplorer(explorer: HTMLElement) {
  const map = readCompactStateMap()

  const uls = explorer.querySelectorAll(".folder-outer > ul") as NodeListOf<HTMLUListElement>
  for (const ul of uls) {
    const folderKey = ul.dataset.ceFolderKey
    if (!folderKey) continue

    // dataset이 존재하는 UL만 저장 (compact가 한 번이라도 적용된 UL)
    if (ul.dataset.cePrevOpen !== undefined || ul.dataset.ceNextOpen !== undefined) {
      map[folderKey] = {
        prevOpen: ul.dataset.cePrevOpen === "true",
        nextOpen: ul.dataset.ceNextOpen === "true",
      }
    }
  }

  writeCompactStateMap(map)
}

function normalizeExplorerStatePathLegacy(path: string): string {
  // Explorer state key must be stable across (en/ko) AND must not include trailing /index.
  // Your content uses ordered prefixes like "1-...". We normalize each segment to just the number
  // so that "1-study" and "1-#Ud559#Uc5c5" (slugified) map to the same key ("1").
  const raw = path.startsWith("/") ? path.slice(1) : path
  const segs = raw.split("/").filter((s) => s.length > 0)

  // drop trailing index (folder slugs are like .../index)
  if (segs.at(-1) === "index") segs.pop()

  // keep language root itself unique (home page), but strip it for all descendants (for en<->ko sharing)
  if (segs.length === 1 && isLangRootSegment(segs[0])) {
    return segs[0]
  }
  if (segs.length >= 2 && isLangRootSegment(segs[0])) {
    segs.shift()
  }

  // order-prefix normalization: "12-foo" -> "12"
  const normalized = segs.map((seg) => {
    const m = seg.match(/^(\d+)[-\.]/) ?? seg.match(/^(\d+)-/)
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
  sortFn?: (a: FileTrieNode, b: FileTrieNode) => number
  filterFn?: (node: FileTrieNode) => boolean
  mapFn?: (node: FileTrieNode) => void
  order: ("sort" | "filter" | "map")[]
}

// --------------------- site language implement --------------------- 
type SiteLang = "en" | "ko"

function getLangFromSlug(slug: string): SiteLang | null {
  const root = rootSegmentOfSlug(slug)
  if (root === "english") return "en"
  if (isKoreanRootSegment(root)) return "ko"
  return null
}

function isEnglishRootNode(node: FileTrieNode): boolean {
  return isTopLevelFolder(node) && node.slugSegment === "english"
}

function isKoreanRootNode(node: FileTrieNode): boolean {
  return isTopLevelFolder(node) && isKoreanRootSegment(node.slugSegment)
}

// -------------------------------------------------------------------

type FolderState = {
  path: string
  collapsed: boolean
}

let currentExplorerState: Array<FolderState>
let savedCollapsedByKeyV2 = new Map<string, boolean>()
let legacyCollapsedByKey = new Map<string, boolean>()
let openFolderKeysForCurrentSlug = new Set<string>()
function toggleExplorer(this: HTMLElement) {
  const nearestExplorer = this.closest(".explorer") as HTMLElement
  if (!nearestExplorer) return

  const explorerCollapsed = nearestExplorer.classList.toggle("collapsed")
  nearestExplorer.setAttribute(
    "aria-expanded",
    nearestExplorer.getAttribute("aria-expanded") === "true" ? "false" : "true",
  )

  // ✅ desktop/mobile 접힘 상태 저장
  const isMobileBtn = this.dataset.mobile === "true"
  writeExplorerUiState(isMobileBtn ? { mobileCollapsed: explorerCollapsed } : { desktopCollapsed: explorerCollapsed })

  // ✅ scroll lock은 “모바일 탐색기 열림”일 때만 적용
  if (isMobileBtn && !explorerCollapsed) {
    document.documentElement.classList.add("mobile-no-scroll")
  } else if (isMobileBtn && explorerCollapsed) {
    document.documentElement.classList.remove("mobile-no-scroll")
  }
}

function toggleFolder(evt: MouseEvent) {
  evt.stopPropagation()
  const target = evt.target as HTMLElement | null
  if (!target) return

  // ✅ 어떤 내부 엘리먼트를 눌러도 folder-container를 정확히 찾기
  const folderContainer = target.closest(".folder-container") as HTMLElement | null
  if (!folderContainer) return

  const folderOuter = folderContainer.nextElementSibling as HTMLElement | null
  if (!folderOuter || !folderOuter.classList.contains("folder-outer")) return

  // 토글
  folderOuter.classList.toggle("open")
  const isCollapsed = !folderOuter.classList.contains("open")

  // 열렸을 때만 compact 적용
  if (!isCollapsed) {
    const ul = folderOuter.querySelector("ul") as HTMLUListElement | null
    if (ul) applyCompactRuleToUl(ul)
  }

  // ✅ 상태 키는 무조건 v2 folderKey로 통일
  const folderKey =
    folderContainer.dataset.folderkey ??
    normalizeExplorerStatePathLegacy(folderContainer.dataset.folderpath || "")

  // currentExplorerState 업데이트
  const st = currentExplorerState.find((item) => item.path === folderKey)
  if (st) st.collapsed = isCollapsed
  else currentExplorerState.push({ path: folderKey, collapsed: isCollapsed })

  localStorage.setItem(FILETREE_KEY, JSON.stringify(currentExplorerState))

  // ✅ 본문(PageList)과 즉시 동기화 이벤트 발행
  window.dispatchEvent(
    new CustomEvent<FolderStateEvtDetail>(FOLDER_STATE_EVT, {
      detail: { folderKey, collapsed: isCollapsed, source: "explorer" },
    }),
  )
}

function createFileNode(currentSlug: FullSlug, node: FileTrieNode): HTMLLIElement {
  const template = document.getElementById("template-file") as HTMLTemplateElement
  const clone = template.content.cloneNode(true) as DocumentFragment
  const li = clone.querySelector("li") as HTMLLIElement
  const a = li.querySelector("a") as HTMLAnchorElement
  a.href = resolveRelative(currentSlug, node.slug)
  a.dataset.for = node.slug
  a.textContent = node.displayName
  a.classList.add("ce-truncate")

  if (currentSlug === node.slug) {
    a.classList.add("active")
  }

  return li
}

function createFolderNode(
  currentSlug: FullSlug,
  node: FileTrieNode,
  opts: ParsedOptions,
  parentKey: string,
  indexAmongFolders0: number,
  forceNormalTextOnly: boolean = false,
  virtualChildren: FileTrieNode[] | null = null, 
): HTMLLIElement {
  const template = document.getElementById("template-folder") as HTMLTemplateElement
  const clone = template.content.cloneNode(true) as DocumentFragment
  const li = clone.querySelector("li") as HTMLLIElement
  const folderContainer = li.querySelector(".folder-container") as HTMLElement
  const titleContainer = folderContainer.querySelector("div") as HTMLElement
  const folderOuter = li.querySelector(".folder-outer") as HTMLElement
  const ul = folderOuter.querySelector("ul") as HTMLUListElement

  const folderPath = node.slug
  const token = folderTokenFromNode(node, indexAmongFolders0)
  const folderKey = parentKey ? `${parentKey}/${token}` : token
  
  // ✅ 직계 자식들은 "일반 폴더처럼" 보이게 강제할 수 있음
  const isTextOnlyFolder = !forceNormalTextOnly && !!(node.data as any)?.textOnly
  const childrenForThisFolder = virtualChildren ?? node.children
  const isTextAccordionFolder = isTextOnlyFolder && childrenForThisFolder.some((c) => c.isFolder)
  
  if (isTextOnlyFolder && !isTextAccordionFolder) {
    const icon = folderContainer.querySelector(".folder-icon")
    icon?.remove()
  }

  // 원본 경로(혹시 필요할 수 있어) + 정규화 키(상태 저장용)를 분리해서 저장
  folderContainer.dataset.folderpath = folderPath
  folderContainer.dataset.folderkey = folderKey
  ul.dataset.ceFolderKey = folderKey

// -------------------------------
// Folder title rendering
// - normal folders: follow opts.folderClickBehavior (link vs collapse)
// - text-only folders (no children): NO LINK (non-clickable label)
// - text-accordion folders (has children): KEEP BUTTON + show > / ∨
// -------------------------------
if (isTextOnlyFolder && !isTextAccordionFolder) {
  // Replace the button with a plain <span> (no link, no toggle on title)
  const button = titleContainer.querySelector(".folder-button") as HTMLElement
  const span = document.createElement("span")
  span.className = "folder-title folder-title--textonly"
  span.textContent = node.displayName
  button.replaceWith(span)
  folderContainer.classList.add("folder-text-only")
} else if (isTextAccordionFolder) {
  const span = titleContainer.querySelector(".folder-title") as HTMLElement
  span.textContent = node.displayName

  folderContainer.classList.add("folder-text-accordion")
} else if (opts.folderClickBehavior === "link") {
  // Replace button with link for link behavior
  const button = titleContainer.querySelector(".folder-button") as HTMLElement
  const a = document.createElement("a")
  a.href = resolveRelative(currentSlug, folderPath)
  a.dataset.for = folderPath
  a.className = "folder-title"
  a.textContent = node.displayName
  button.replaceWith(a)
} else {
  // collapse behavior: keep the button and set its inner title
  const span = titleContainer.querySelector(".folder-title") as HTMLElement
  span.textContent = node.displayName
}

  // ✅ 폴더 페이지 자체가 현재 페이지인 경우에도 active 표시
  // (파일 링크(<a>)만 active가 붙던 문제를 해결)
  const isActiveFolderPage =
    stripIndexFromSlug(String(currentSlug)) === stripIndexFromSlug(String(folderPath))

  if (isActiveFolderPage) {
    const titleEl = folderContainer.querySelector(".folder-title") as HTMLElement | null
    titleEl?.classList.add("active")
  }
  // if the saved state is collapsed or the default state is collapsed
  const folderTitleEl = folderContainer.querySelector(".folder-title") as HTMLElement | null
  // ✅ 폴더/파일 동일하게 truncate 대상 지정
  // (폴더는 title이 button/span/a 형태로 갈라져서 selector를 넓게 잡는다)
  const folderTitleEl = folderContainer.querySelector(
    ".folder-title, .folder-title--textonly",
  ) as HTMLElement | null
  folderTitleEl?.classList.add("ce-truncate")
  const legacyKey = normalizeExplorerStatePathLegacy(folderPath)
  const fromLegacy = legacyCollapsedByKey.get(legacyKey)
  const isCollapsed = persisted ?? fromLegacy ?? opts.folderDefaultState === "collapsed"

  if (persisted === undefined) {
    savedCollapsedByKeyV2.set(folderKey, isCollapsed)
  }

  // currentExplorerState에도 엔트리 보장 (토글/프리네브 저장용)
  if (!currentExplorerState.find((x) => x.path === folderKey)) {
    currentExplorerState.push({ path: folderKey, collapsed: isCollapsed })
  }

  // 현재 페이지의 조상 폴더는 무조건 열리게
  const folderIsPrefixOfCurrentSlug = openFolderKeysForCurrentSlug.has(folderKey)

  if (!isCollapsed || folderIsPrefixOfCurrentSlug) {
    folderOuter.classList.add("open")
  }

  const kids = childrenForThisFolder
  let folderChildIndex0 = 0
  
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i]
  
    if (!child.isFolder) {
      ul.appendChild(createFileNode(currentSlug, child))
      continue
    }
  
    // forceNormalTextOnly면(accordion 내부) 헤더 grouping 금지
    const childIsHeader = !forceNormalTextOnly && !!(child.data as any)?.textOnly
  
    if (childIsHeader) {
      // ✅ 다음 헤더 전까지의 “형제 폴더들”을 가상 하위로 묶기
      const grouped: FileTrieNode[] = []
      let j = i + 1
      let skippedFolderCount = 0
  
      while (j < kids.length) {
        const nxt = kids[j]
        if (!nxt.isFolder) break
        if (!!(nxt.data as any)?.textOnly) break
        grouped.push(nxt)
        j++
        skippedFolderCount++
      }
  
      const headerNode = createFolderNode(
        currentSlug,
        child,
        opts,
        folderKey,
        folderChildIndex0++,
        false,
        grouped.length > 0 ? grouped : null,
      )
      ul.appendChild(headerNode)
  
      // ✅ 부모 레벨에서 grouped 폴더들은 렌더하지 않음
      // (folderChildIndex0는 원래 구조 유지 목적이면 여기에 skippedFolderCount만큼 증가시킬 수도 있음)
      i = j - 1
      continue
    }
  
    const childNode = createFolderNode(currentSlug, child, opts, folderKey, folderChildIndex0++, isTextAccordionFolder)
    ul.appendChild(childNode)
  }
  if (ul.querySelector(".active")) {
    folderOuter.classList.add("open")

    // 상태도 "열림"으로 동기화(다음 nav 때도 따라오게)
    savedCollapsedByKeyV2.set(folderKey, false)
    const st2 = currentExplorerState.find((x) => x.path === folderKey)
    if (st2) st2.collapsed = false
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
  const folderKey = ul.dataset.ceFolderKey
  const saved = folderKey ? loadCompactState(folderKey) : null
  
  let prevOpen = ul.dataset.cePrevOpen === "true"
  let nextOpen = ul.dataset.ceNextOpen === "true"

  // DOM 재생성 직후에는 dataset이 비어있으니(localStorage로 복원)
  if (saved) {
    if (ul.dataset.cePrevOpen === undefined) prevOpen = !!saved.prevOpen
    if (ul.dataset.ceNextOpen === undefined) nextOpen = !!saved.nextOpen
  }

  const start = Math.max(0, focusIndex - 2)
  const end = Math.min(fileLis.length - 1, focusIndex + 2)

  const hasPrev = start > 0
  const hasNext = end < fileLis.length - 1

  let prevBtn: HTMLButtonElement | null = null
  let nextBtn: HTMLButtonElement | null = null

  // ✅ 기호 규칙
  const PREV_CLOSED = "⊻"
  const PREV_OPEN = "⊼"
  const NEXT_CLOSED = "⊼"
  const NEXT_OPEN = "⊻"

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
    
    if (folderKey) {
      saveCompactState(folderKey, prevOpen, nextOpen)
    }
    
    // ✅ 버튼 UI 동기화 (위/아래 서로 반대)
    if (prevBtn) {
      prevBtn.classList.toggle("is-open", prevOpen)
      prevBtn.setAttribute("aria-expanded", String(prevOpen))
      prevBtn.textContent = prevOpen ? PREV_OPEN : PREV_CLOSED
    }
    if (nextBtn) {
      nextBtn.classList.toggle("is-open", nextOpen)
      nextBtn.setAttribute("aria-expanded", String(nextOpen))
      nextBtn.textContent = nextOpen ? NEXT_OPEN : NEXT_CLOSED
    }
  }

  // (5) 위쪽 버튼
  if (hasPrev) {
    const li = document.createElement("li")
    li.className = "ce-ellipsis ce-prev"

    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = "ce-ellipsis-btn"
    btn.setAttribute("aria-label", "이전 문서 펼치기/접기")
    btn.setAttribute("aria-expanded", "false")
    btn.textContent = PREV_CLOSED

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

  // (6) 아래쪽 버튼 (맨 아래)
  if (hasNext) {
    const li = document.createElement("li")
    li.className = "ce-ellipsis ce-next"

    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = "ce-ellipsis-btn"
    btn.setAttribute("aria-label", "이후 문서 펼치기/접기")
    btn.setAttribute("aria-expanded", "false")
    btn.textContent = NEXT_CLOSED

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

function applyExplorerTitleTruncation(explorer: HTMLElement) {
  const targets = explorer.querySelectorAll(".ce-truncate") as NodeListOf<HTMLElement>

  for (const el of targets) {
    el.classList.remove("is-overflowing")

    // display:none 상태면 측정 불가하니 건너뜀
    if (el.offsetParent === null) continue

    // scrollWidth > clientWidth면 overflow
    if (el.scrollWidth > el.clientWidth + 1) {
      el.classList.add("is-overflowing")
    }
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
      sortFn: safeEvalFn(dataFns.sortFn, "sortFn"),
      filterFn: safeEvalFn(dataFns.filterFn, "filterFn"),
      mapFn: safeEvalFn(dataFns.mapFn, "mapFn"),
    }

    // ✅ enforce physical-name sort (actual folder/file name)
    opts.sortFn = physicalSort

    updateExplorerTitle(explorer, currentSlug)

    // -------------------------------
    // Load persisted folder state (v2 preferred, legacy fallback)
    // -------------------------------
    savedCollapsedByKeyV2 = new Map<string, boolean>()
    legacyCollapsedByKey = new Map<string, boolean>()
    openFolderKeysForCurrentSlug = new Set<string>()

    const serializedV2: FolderState[] = (() => {
      if (!opts.useSavedState) return []
      const raw = localStorage.getItem(FILETREE_KEY)
      if (!raw) return []
      try {
        return JSON.parse(raw) as FolderState[]
      } catch {
        return []
      }
    })()

    currentExplorerState = Array.isArray(serializedV2) ? [...serializedV2] : []
    for (const entry of currentExplorerState) {
      if (!entry?.path) continue
      savedCollapsedByKeyV2.set(String(entry.path), !!entry.collapsed)
    }

    const legacy: FolderState[] = (() => {
      if (!opts.useSavedState) return []
      const raw = localStorage.getItem(FILETREE_KEY_LEGACY)
      if (!raw) return []
      try {
        return JSON.parse(raw) as FolderState[]
      } catch {
        return []
      }
    })()

    for (const entry of legacy) {
      const k = normalizeExplorerStatePathLegacy(String(entry?.path ?? ""))
      if (!k) continue
      const prev = legacyCollapsedByKey.get(k)
      legacyCollapsedByKey.set(k, prev === undefined ? !!entry.collapsed : prev && !!entry.collapsed)
    }

    const data = await fetchData
    const entries = [...Object.entries(data)] as [FullSlug, ContentDetails][]
    const trie = FileTrieNode.fromEntries(entries)

    // Apply functions in order (기존 옵션 적용)
    for (const fn of opts.order) {
      try {
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
      } catch (e) {
        console.warn(`[Explorer] failed during ${fn}`, e)
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

    openFolderKeysForCurrentSlug = computeOpenFolderKeySet(renderRoot, currentSlug)

    const explorerUl = explorer.querySelector(".explorer-ul")
    if (!explorerUl) continue

    // Create and insert new content
    const isHome = isGlobalHomeSlug(currentSlug)

    // Home(index)에서는 언어 선택(english/한국어)만 보이도록 (있으면)
    let childrenToRender = renderRoot.children
    if (isHome) {
      const langRoots = renderRoot.children.filter((c) => isEnglishRootNode(c) || isKoreanRootNode(c))
      if (langRoots.length > 0) childrenToRender = langRoots
    }

    const fragment = document.createDocumentFragment()
    try {
      let topFolderIndex0 = 0
      for (const child of childrenToRender) {
        const node = child.isFolder
          ? createFolderNode(currentSlug, child, opts, "", topFolderIndex0++)
          : createFileNode(currentSlug, child)

        fragment.appendChild(node)
      }
    } catch (e) {
      console.error("[Explorer] failed to build explorer tree", e)
      continue
    }

    // (중요) 전부 성공했을 때만 기존 내용 비우고 교체
    explorerUl.innerHTML = ""
    explorerUl.insertBefore(fragment, explorerUl.firstChild)
    applyCompactRuleToOpenFolders(explorer)
    applyExplorerTitleTruncation(explorer)
    if (opts.useSavedState) {
      localStorage.setItem(FILETREE_KEY, JSON.stringify(currentExplorerState))
    }

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

    if (opts.folderClickBehavior === "link") {
      const accButtons = explorer.querySelectorAll(
        ".folder-container.folder-text-accordion .folder-button",
      ) as NodeListOf<HTMLElement>

      for (const button of accButtons) {
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
    // ✅ 본문(PageList) -> Explorer 동기화
    const onExternalFolderState = (ev: Event) => {
      const e = ev as CustomEvent<FolderStateEvtDetail>
      const d = e.detail
      if (!d || d.source !== "content") return
    
      const folderKey = String(d.folderKey ?? "")
      if (!folderKey) return
      const collapsed = !!d.collapsed
    
      const container = explorer.querySelector(
        `.folder-container[data-folderkey="${cssEscape(folderKey)}"]`,
      ) as HTMLElement | null
      if (!container) return
    
      const outer = container.nextElementSibling as HTMLElement | null
      if (!outer || !outer.classList.contains("folder-outer")) return
    
      if (collapsed) outer.classList.remove("open")
      else outer.classList.add("open")
    
      if (!collapsed) {
        const ul = outer.querySelector("ul") as HTMLUListElement | null
        if (ul) applyCompactRuleToUl(ul)
      }
    
      const st = currentExplorerState.find((x) => x.path === folderKey)
      if (st) st.collapsed = collapsed
      else currentExplorerState.push({ path: folderKey, collapsed })
    
      localStorage.setItem(FILETREE_KEY, JSON.stringify(currentExplorerState))
    }
    
    window.addEventListener(FOLDER_STATE_EVT, onExternalFolderState as EventListener)
    window.addCleanup(() => window.removeEventListener(FOLDER_STATE_EVT, onExternalFolderState as EventListener))
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
    persistCompactStateFromExplorer(ex)
  }
})

document.addEventListener("nav", async (e: CustomEventMap["nav"]) => {
  const currentSlug = e.detail.url
  await setupExplorer(currentSlug)

  const ui = readExplorerUiState()
  
  for (const ex of document.getElementsByClassName("explorer")) {
    const explorer = ex as HTMLElement
    const mobileBtn = explorer.querySelector(".mobile-explorer") as HTMLElement | null
    if (!mobileBtn) continue
  
    const isMobile = mobileBtn.checkVisibility()
    const shouldCollapse = isMobile ? ui.mobileCollapsed : ui.desktopCollapsed
  
    explorer.classList.toggle("collapsed", shouldCollapse)
    explorer.setAttribute("aria-expanded", shouldCollapse ? "false" : "true")
  
    if (isMobile) {
      document.documentElement.classList.toggle("mobile-no-scroll", !shouldCollapse)
    } else {
      document.documentElement.classList.remove("mobile-no-scroll")
    }
  
    mobileBtn.classList.remove("hide-until-loaded")
  }
})

window.addEventListener("resize", function () {
  const explorer = document.querySelector(".explorer") as HTMLElement | null
  if (!explorer) return

  const mobileBtn = explorer.querySelector(".mobile-explorer") as HTMLElement | null
  if (!mobileBtn) return

  const isMobile = mobileBtn.checkVisibility()
  const isOpen = !explorer.classList.contains("collapsed")

  if (isMobile) {
    document.documentElement.classList.toggle("mobile-no-scroll", isOpen)
  } else {
    document.documentElement.classList.remove("mobile-no-scroll")
  }

  applyExplorerTitleTruncation(explorer)
})

function setFolderState(folderElement: HTMLElement, collapsed: boolean) {
  return collapsed ? folderElement.classList.remove("open") : folderElement.classList.add("open")
}
