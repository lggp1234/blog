export default () => {
  const sw = document.querySelector('[data-langswitch="true"]') as HTMLElement | null
  if (!sw) return

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
