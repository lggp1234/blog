import { QuartzComponentConstructor } from "./types"

/**
 * SpaLangGuard
 * -------------
 * Quartz SPA 모드에서 언어 전환 시 404 및 접두사 중복(/english/english/...) 문제 방지
 *
 * - 현재 URL에서 언어 접두사 감지 (여러 형태 지원: /en/, /english/, /ko/, /한국어버젼/ ...)
 * - 이미 접두사가 있는 링크는 그대로 사용
 * - 접두사가 없으면 현재 언어의 기본 접두사만 붙임
 * - 공백/언더바를 하이픈으로 slugify, 소문자화
 * - 끝에 / 붙이기
 * - 항상 하드 네비게이션(location.assign)으로 이동 → 404 방지
 */
export default (() => {
  const SpaLangGuard = () => {
    return (
      <script dangerouslySetInnerHTML={{
        __html: `
(function(){
  // ===== 언어 접두사 정의 (환경에 맞게 수정하세요) =====
  var LANGS = [
    { code: 'en', prefixes: ['/en/', '/english/'] },
    { code: 'ko', prefixes: ['/ko/', '/한국어버젼/'] },
  ];

  function allPrefixes(){
    return LANGS.flatMap(function(l){ return l.prefixes; });
  }

  function defaultPrefix(lang){
    var L = LANGS.find(function(l){ return l.code === lang; });
    return L ? L.prefixes[0] : '/en/';
  }

  function detectLangByPath(p){
    if (p === '/') return 'en';  // 루트는 영어로 취급
    for (var i=0; i<LANGS.length; i++){
      for (var j=0; j<LANGS[i].prefixes.length; j++){
        if (p.startsWith(LANGS[i].prefixes[j])) return LANGS[i].code;
      }
    }
    return 'en';
  }

  function hasAnyLangPrefix(href){
    var pref = allPrefixes();
    for (var i=0; i<pref.length; i++){
      if (href.startsWith(pref[i])) return true;
    }
    return false;
  }

  function ensureTrailingSlash(p){
    return p.endsWith('/') ? p : (p + '/');
  }

  function slugifyPath(p){
    return p.split('/').map(function(seg){
      if (!seg) return seg;
      return seg.replace(/\\s+/g,'-').replace(/_+/g,'-').toLowerCase();
    }).join('/');
  }

  function isExternal(href){
    return /^https?:\\/\\//i.test(href) || href.startsWith('mailto:') || href.startsWith('#');
  }

  // 언어 클래스 부여 (html 태그에 lang-ko / lang-en)
  function setLangClass(){
    var html = document.documentElement, p = location.pathname;
    html.classList.remove('lang-ko','lang-en');
    var lg = detectLangByPath(p);
    html.classList.add(lg === 'ko' ? 'lang-ko' : 'lang-en');
  }

  // 최초 진입 시
  setLangClass();

  // SPA 라우팅 감지 → 언어 클래스 업데이트
  var _ps = history.pushState, _rs = history.replaceState;
  function onNav(){ setLangClass(); }
  history.pushState = function(){ _ps.apply(this, arguments); onNav(); };
  history.replaceState = function(){ _rs.apply(this, arguments); onNav(); };
  window.addEventListener('popstate', onNav);

  // ===== 링크 클릭 가로채기 =====
  document.addEventListener('click', function(e){
    var a = e.target;
    while (a && a.tagName !== 'A') a = a.parentElement;
    if (!a) return;

    var href = a.getAttribute('href') || '';
    if (!href || isExternal(href)) return;

    var lang = detectLangByPath(location.pathname);
    var target = href;

    if (hasAnyLangPrefix(href)) {
      // 이미 언어 접두사가 있으면 그대로 → 중복 방지
      target = ensureTrailingSlash(slugifyPath(href));
    } else {
      // 접두사 없으면 현재 언어 기본 접두사 붙이기
      if (href.startsWith('/')) {
        target = defaultPrefix(lang) + href.replace(/^\\//,'');
      } else if (!href.startsWith('./') && !href.startsWith('../')) {
        target = defaultPrefix(lang) + href.replace(/^\\/?/,'');
      } else {
        // ./, ../ 상대경로는 그대로 두고 보정만
        target = href;
      }
      target = ensureTrailingSlash(slugifyPath(target));
    }

    e.preventDefault();
    window.location.assign(encodeURI(target));
  }, true);
})();
        `.trim()
      }} />
    )
  }

  SpaLangGuard.css = ``
  return SpaLangGuard
}) satisfies QuartzComponentConstructor
