import { QuartzComponentConstructor } from "./types"

export default (() => {
  const FixFolderUrl = () => (
    <script
      dangerouslySetInnerHTML={{
        __html: `
(function () {
  function fix() {
    var slug = (document.body && document.body.dataset && document.body.dataset.slug) || "";
    // folder index 페이지면 slug가 ".../index"
    if (!slug.endsWith("/index")) return;

    var p = location.pathname;
    // 이미 / 로 끝나면 OK
    if (p.endsWith("/")) return;

    // /something/index 로 들어온 경우도 /something/ 로 정규화
    if (p.endsWith("/index")) {
      var np = p.replace(/\\/index$/, "/");
      history.replaceState({}, "", np + location.search + location.hash);
      return;
    }

    // /something (슬래시 없음) -> /something/
    history.replaceState({}, "", p + "/" + location.search + location.hash);
  }

  fix();
  document.addEventListener("nav", fix); // SPA 이동 후에도 보정
})();
        `.trim(),
      }}
    />
  )

  FixFolderUrl.css = ``
  return FixFolderUrl
}) satisfies QuartzComponentConstructor
