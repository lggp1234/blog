export default () => {
  const sw = document.querySelector('[data-langswitch="true"]') as HTMLElement | null
  if (!sw) return
  
  // ✅ 언어 전환 클릭 직전: 탐색기 폴더 열림/닫힘 + 탐색기 접힘 상태를 스냅샷 저장
  const FILETREE_KEY = "fileTree.v2"
  const EXPLORER_UI_KEY = "explorerUi.v1"

  const snapshotExplorerState = () => {
    let existing: Array<{ path: string; collapsed: boolean }> = []
    try {
      const raw = localStorage.getItem(FILETREE_KEY)
      if (raw) existing = JSON.parse(raw)
    } catch {
      existing = []
    }

    const m = new Map<string, boolean>()
    for (const it of existing) {
      if (!it?.path) continue
      m.set(String(it.path), !!it.collapsed)
    }

    // 폴더 open/close 저장
    document.querySelectorAll("div.explorer").forEach((ex) => {
      const explorer = ex as HTMLElement

      explorer.querySelectorAll(".folder-container").forEach((fc) => {
        const folderContainer = fc as HTMLElement
        const outer = folderContainer.nextElementSibling as HTMLElement | null
        if (!outer || !outer.classList.contains("folder-outer")) return

        const key = folderContainer.dataset.folderkey
        if (!key) return

        const isOpen = outer.classList.contains("open")
        m.set(key, !isOpen)
      })

      // 탐색기 전체 collapse 상태도 저장
      const mobileBtn = explorer.querySelector(".mobile-explorer") as HTMLElement | null
      const isMobile = mobileBtn ? mobileBtn.checkVisibility() : false
      const isCollapsed = explorer.classList.contains("collapsed")

      let ui = { desktopCollapsed: false, mobileCollapsed: true }
      try {
        const raw = localStorage.getItem(EXPLORER_UI_KEY)
        if (raw) ui = { ...ui, ...(JSON.parse(raw) as any) }
      } catch {}

      const next = isMobile ? { ...ui, mobileCollapsed: isCollapsed } : { ...ui, desktopCollapsed: isCollapsed }
      localStorage.setItem(EXPLORER_UI_KEY, JSON.stringify(next))
    })

    localStorage.setItem(
      FILETREE_KEY,
      JSON.stringify(Array.from(m.entries()).map(([path, collapsed]) => ({ path, collapsed }))),
    )
  }

  sw.addEventListener("click", snapshotExplorerState)

  // 본문(가능하면 article)을 기준으로 computed font를 복사
  const article =
    (document.querySelector("article") as HTMLElement | null) ??
    (document.querySelector(".article") as HTMLElement | null) ??
    (document.querySelector("main") as HTMLElement | null)

  if (!article) return

  const cs = window.getComputedStyle(article)

  // 폰트 관련 핵심 속성만 복사 (진짜 “동일”하게 만드는 부분)
  sw.style.fontFamily = cs.fontFamily
  sw.style.fontSize = cs.fontSize
  sw.style.fontWeight = cs.fontWeight
  sw.style.fontStyle = cs.fontStyle
  sw.style.letterSpacing = cs.letterSpacing
  sw.style.lineHeight = cs.lineHeight
}
