import { QuartzComponentConstructor } from "./types"

/**
 * SPA 환경에서:
 * - 현재 경로로부터 언어(class: lang-ko/lang-en) 지정
 * - 모든 내부 링크 클릭을 가로채서:
 *   · 현재 언어 접두사(/ko, /en) 보정
 *   · 경로 슬러그화(공백/언더바 → 하이픈, 소문자)
 *   · 끝에 / 보장
 *   · 하드 네비게이션(location.assign)로 이동 → 404 방지
 */
export default (() => {
  const SpaLangGuard = () => {
    return (
      <script dangerouslySetInnerHTML={{
        __html: `
(function(){
  // ===== 유틸 =====
  function currentLangFromPath(p){
    if (p === '/' || p.startsWith('/en/')) return 'en';
    if (p.startsWith('/ko/')) return 'ko';
    return null;
  }
  function setLangClass(){
    var root = document.documentElement, p = location.pathname;
    root.classList.remove('lang-ko','lang-en');
    var lg = currentLangFromPath(p);
    if (lg === 'ko') root.classList.add('lang-ko');
    else root.classList.add('lang-en'); // 기본 en (루트 포함)
  }
  function ensureTrailingSlash(p){
    return p.endsWith('/') ? p : (p + '/');
  }
  function slugifyPath(p){
    // 각 세그먼트 별로 공백/언더바 → 하이픈, 소문자
    return p.split('/').map(function(seg){
      if (!seg) return seg;
      return seg.replace(/\\s+/g,'-').replace(/_+/g,'-').toLowerCase();
    }).join('/');
  }
  function isExternal(href){
    return /^https?:\\/\\//i.test(href) || href.startsWith('mailto:') || href.startsWith('#');
  }
  function hasLangPrefix(href){
    return href.startsWith('/ko/') || href.startsWith('/en/');
  }
  function normalizeInternalHref(href, lang){
    // 절대경로지만 언어 접두사 없으면 추가, 상대경로면 현재 언어 루트 기준으로
    var clean = href;
    if (href.startsWith('/')) clean = '/' + lang + href; 
    else if (!href.startsWith('./') && !href.startsWith('../')) clean = '/' + lang + '/' + href.replace(/^\\/?/, '');
    // 슬러그화 + 안전 인코딩 + 트레일링 슬래시
    clean = slugifyPath(clean);
    clean = ensureTrailingSlash(clean);
    return encodeURI(clean);
  }

  // ===== 최초 진입 시 언어 클래스 지정 =====
  setLangClass();

  // ===== SPA 라우팅 감지 → 언어 클래스 재지정 =====
  var _ps = history.pushState, _rs = history.replaceState;
  function onNav(){ setLangClass(); }
  history.pushState = function(){ _ps.apply(this, arguments); onNav(); };
  history.replaceState = function(){ _rs.apply(this, arguments); onNav(); };
  window.addEventListener('popstate', onNav);

  // ===== 문서 전체의 내부 링크 클릭 가로채기 =====
  document.addEventListener('click', function(e){
    var a = e.target;
    // 아이콘/스팬 등 안쪽을 눌러도 상위 a로 올리기
    while (a && a.tagName !== 'A') a = a.parentElement;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (!href || isExternal(href)) return;

    var lang = currentLangFromPath(location.pathname) || 'en';

    // 언어 스위치 같은 이미 접두사 있는 링크는 그대로, 나머진 보정
    var target;
    if (hasLangPrefix(href)) {
      target = encodeURI(ensureTrailingSlash(slugifyPath(href)));
    } else {
      target = normalizeInternalHref(href, lang);
    }

    // SPA 라우터를 우회해서 하드 네비게이션(404 방지에 가장 확실)
    e.preventDefault();
    window.location.assign(target);
  }, true); // capture로 조기 가로채기
})();
        `.trim()
      }} />
    )
  }

  SpaLangGuard.css = ``
  return SpaLangGuard
}) satisfies QuartzComponentConstructor
