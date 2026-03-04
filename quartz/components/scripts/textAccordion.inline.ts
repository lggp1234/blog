// Text: true + has subfolders -> inline accordion in folder listings
// Also sync with Explorer via shared localStorage key (fileTree.v2) + CustomEvent

type FolderState = { path: string; collapsed: boolean }

const FILETREE_KEY = "fileTree.v2"
const EVT = "quartz:folder-state"

const ARROW_CLOSED = ">"
const ARROW_OPEN = "∨"

function cssEscape(s: string): string {
  // @ts-ignore
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s)
  return s.replace(/[^a-zA-Z0-9_\-]/g, (c) => `\\${c}`)
}

function readFileTreeState(): FolderState[] {
  const raw = localStorage.getItem(FILETREE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as FolderState[]) : []
  } catch {
    return []
  }
}

function writeFileTreeState(next: FolderState[]) {
  localStorage.setItem(FILETREE_KEY, JSON.stringify(next))
}

function getCollapsed(folderKey: string): boolean | undefined {
  const st = readFileTreeState().find((x) => x?.path === folderKey)
  return st ? !!st.collapsed : undefined
}

function setCollapsed(folderKey: string, collapsed: boolean) {
  const arr = readFileTreeState()
  const hit = arr.find((x) => x?.path === folderKey)
  if (hit) hit.collapsed = collapsed
  else arr.push({ path: folderKey, collapsed })
  writeFileTreeState(arr)
}

function setDomForKey(folderKey: string, collapsed: boolean) {
  const li = document.querySelector(
    `li.text-accordion-li[data-folderkey="${cssEscape(folderKey)}"]`,
  ) as HTMLElement | null
  if (!li) return

  const btn = li.querySelector(".folder-text-accordion-btn") as HTMLButtonElement | null
  const arrow = li.querySelector(".folder-text-accordion-arrow") as HTMLElement | null
  const children = li.querySelector(".text-accordion-children") as HTMLElement | null

  const open = !collapsed
  li.classList.toggle("is-open", open)
  if (btn) btn.setAttribute("aria-expanded", String(open))
  if (children) children.setAttribute("aria-hidden", String(!open))
  if (arrow) arrow.textContent = open ? ARROW_OPEN : ARROW_CLOSED
}

function setupTextAccordions() {
  const buttons = document.querySelectorAll(".folder-text-accordion-btn") as NodeListOf<HTMLButtonElement>

  for (const btn of buttons) {
    const folderKey = btn.dataset.folderkey
    if (!folderKey) continue

    const collapsed = getCollapsed(folderKey) ?? true
    setDomForKey(folderKey, collapsed)

    const onClick = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const currentCollapsed = getCollapsed(folderKey) ?? true
      const nextCollapsed = !currentCollapsed

      setCollapsed(folderKey, nextCollapsed)
      setDomForKey(folderKey, nextCollapsed)

      window.dispatchEvent(
        new CustomEvent(EVT, { detail: { folderKey, collapsed: nextCollapsed, source: "content" } }),
      )
    }

    btn.addEventListener("click", onClick)
    // ✅ addCleanup은 nav 이후에 정의되므로, 여기서는 안전하지만 그래도 방어적으로
    // @ts-ignore
    if (typeof window.addCleanup === "function") {
      // @ts-ignore
      window.addCleanup(() => btn.removeEventListener("click", onClick))
    }
  }

  const onExternal = (e: any) => {
    const d = e?.detail
    if (!d || d.source === "content") return
    const folderKey = String(d.folderKey ?? "")
    if (!folderKey) return
    const collapsed = !!d.collapsed

    setCollapsed(folderKey, collapsed)
    setDomForKey(folderKey, collapsed)
  }

  window.addEventListener(EVT, onExternal)
  // @ts-ignore
  if (typeof window.addCleanup === "function") {
    // @ts-ignore
    window.addCleanup(() => window.removeEventListener(EVT, onExternal))
  }
}

// ✅ 핵심 수정: 즉시 실행 금지 (addCleanup/nav 준비되기 전 실행되면 전체 스크립트가 터져 Explorer가 죽음)
// Quartz SPA는 nav 이벤트를 “맨 마지막”에 발행하므로, 여기서 등록만 해두면 초기 로딩도 정상 동작함.
document.addEventListener("nav", () => {
  try {
    setupTextAccordions()
  } catch (e) {
    console.error("[TextAccordion] setup failed", e)
  }
})
