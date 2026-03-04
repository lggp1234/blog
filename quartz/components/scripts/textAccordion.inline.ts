type FolderState = { path: string; collapsed: boolean }

const FILETREE_KEY = "fileTree.v2"
const EVT = "quartz:folder-state"

const ARROW_CLOSED = ">"
const ARROW_OPEN = "∨"

function safeEscape(s: string): string {
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

function getCollapsed(folderKey: string): boolean {
  const st = readFileTreeState().find((x) => x?.path === folderKey)
  return st ? !!st.collapsed : true
}

function setCollapsed(folderKey: string, collapsed: boolean) {
  const arr = readFileTreeState()
  const hit = arr.find((x) => x?.path === folderKey)
  if (hit) hit.collapsed = collapsed
  else arr.push({ path: folderKey, collapsed })
  writeFileTreeState(arr)
}

function applyDom(folderKey: string, collapsed: boolean) {
  const li = document.querySelector(
    `li.section-li.is-accordion-parent[data-folderkey="${safeEscape(folderKey)}"]`,
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
  const buttons = document.querySelectorAll(
    ".folder-text-accordion-btn[data-folderkey]",
  ) as NodeListOf<HTMLButtonElement>

  for (const btn of buttons) {
    const folderKey = btn.dataset.folderkey
    if (!folderKey) continue

    // 초기 상태 (Explorer와 같은 fileTree.v2 공유)
    applyDom(folderKey, getCollapsed(folderKey))

    const onClick = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const nextCollapsed = !getCollapsed(folderKey)
      setCollapsed(folderKey, nextCollapsed)
      applyDom(folderKey, nextCollapsed)

      // Explorer로 동기화 이벤트
      window.dispatchEvent(
        new CustomEvent(EVT, { detail: { folderKey, collapsed: nextCollapsed, source: "content" } }),
      )
    }

    btn.addEventListener("click", onClick)
    // @ts-ignore
    if (typeof window.addCleanup === "function") {
      // @ts-ignore
      window.addCleanup(() => btn.removeEventListener("click", onClick))
    }
  }

  // Explorer -> Content 동기화
  const onExternal = (ev: any) => {
    const d = ev?.detail
    if (!d || d.source !== "explorer") return
    const folderKey = String(d.folderKey ?? "")
    if (!folderKey) return
    const collapsed = !!d.collapsed

    setCollapsed(folderKey, collapsed)
    applyDom(folderKey, collapsed)
  }

  window.addEventListener(EVT, onExternal)
  // @ts-ignore
  if (typeof window.addCleanup === "function") {
    // @ts-ignore
    window.addCleanup(() => window.removeEventListener(EVT, onExternal))
  }
}

document.addEventListener("nav", () => {
  try {
    setupTextAccordions()
  } catch (e) {
    console.error("[TextAccordion] setup failed", e)
  }
})
