/* Campus Connect — grands moments animés (CC.fx). SPEC §6 bis.
 * Script classique, sans dépendance : Canvas 2D + Web Animations API.
 * Chargé après store.js et avant app.js. Les styles sont injectés ici (<style id="cc-fx-style">).
 *
 * Contrat :
 *   CC.fx.welcomeNetwork(canvas)                       → { stop() }
 *   CC.fx.revealMatches(me, matches, onDone)           matches = [{ person, reasons:[str] }] (3 max)
 *   CC.fx.confetti(x, y)                               coordonnées viewport
 *   CC.fx.countUp(el, from, to, ms)
 *   CC.fx.campusGraph(canvas, { people, connections, categories, meId }) → { stop(), pulse(personId) }
 *   CC.fx.avatarHTML(person, size)                     → chaîne HTML
 *
 * En plus (facultatif, rien ne casse si on ne s'en sert pas) :
 *   welcomeNetwork(canvas, { theme:'dark'|'light', background:true|false })  sinon détection auto
 *     (thème d'après la couleur du texte posé dessus ; pas de fond peint si l'écran a déjà le sien)
 *   revealMatches(...) → { close() } ; clic hors du bouton = passer l'animation ; Échap = fermer
 *   confetti(element) accepte aussi un élément (part de son centre)
 *   campusGraph(canvas, { ..., exchanges:false }) masque les pointillés « échange de talents possible »
 *   campusGraph(canvas, { ..., legend:false }) ne dessine pas la légende dans le canvas (à écrire en HTML)
 *   campusGraph : l'intro et les pulse() attendent que le canvas soit visible à 40 % ({ waitVisible:false } pour l'éviter)
 *   pulse(personId, otherId) : onde sur les deux personnes + étincelle le long du lien
 *   CC.fx.avatarColors(id), CC.fx.reducedMotion()
 *
 * Mode live (SPEC §9), tout est facultatif :
 *   campusGraph(canvas, { ..., theme:'dark', scale:1.4, background:false, maxDpr:1.5,
 *                          inset:{left,top,right,bottom}, exchanges:[[a,b],…], onLand(fn),
 *                          clip, labelFilter(p, n), labelScale(p, n), flyScale:true, maxSpots:2 })
 *   handle.add(person, { from:{x,y}, links:[ids], fly:false, label:false, title, sub }) : arrivée en vol
 *     (comète, onde, étincelles, étiquette, faisceaux vers ses affinités)
 *   handle.link(a, b) : nouvelle connexion qui se dessine ; handle.spot(id, titre, sous-titre, ms)
 *   handle.sync({ people, connections }) : rattrapage sans animation ; handle.setInset({…}) ;
 *   handle.has(id), handle.size(), handle.where(id)
 *
 * Chaque animation s'arrête seule si son canvas quitte la page, se met en pause quand l'onglet
 * est caché et s'allège si l'appareil peine.
 *
 * « Réduire les animations » (prefers-reduced-motion) : versions statiques.
 * Pour forcer les animations pendant la démo, dans la console : localStorage.cc_fx_motion = 'full'
 * (et 'reduced' pour forcer la version calme ; supprimer la clé pour revenir à l'auto).
 */
(function () {
  'use strict';

  var W = window;
  var doc = document;
  var CC = W.CC = W.CC || {};
  var TAU = Math.PI * 2;
  var UI_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  var EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif';
  var BRAND = {
    violet: '#5B3DF5', coral: '#FF6B4A', bg: '#F7F6F3', ink: '#1A1730',
    lavender: '#9B7BFF', pink: '#E5539A', amber: '#FFC23D', teal: '#12B5A6', blue: '#3B6FE0'
  };

  /* ------------------------------------------------------------------ */
  /* Outils                                                               */
  /* ------------------------------------------------------------------ */

  function noop() {}
  function now() { return (W.performance && performance.now) ? performance.now() : Date.now(); }
  var raf = W.requestAnimationFrame ? function (f) { return W.requestAnimationFrame(f); }
    : function (f) { return setTimeout(function () { f(now()); }, 16); };
  var caf = W.cancelAnimationFrame ? function (id) { W.cancelAnimationFrame(id); } : function (id) { clearTimeout(id); };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function toArr(x) { return Array.isArray(x) ? x : []; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }
  function easeOutExpo(t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOutBack(t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

  function getDpr() { return Math.min(W.devicePixelRatio || 1, 2); }

  function hash(str) {
    str = String(str == null ? '' : str);
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function hexToRgb(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n) || h.length !== 6) return { r: 91, g: 61, b: 245 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgba(hex, a) {
    var c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + (Math.round(a * 1000) / 1000) + ')';
  }
  /* Mélange avec du blanc (t > 0) ou du noir (t < 0). */
  function shade(hex, t) {
    var c = hexToRgb(hex), k = t < 0 ? 0 : 255, p = Math.abs(t);
    function m(v) { return Math.round(v + (k - v) * p); }
    return 'rgb(' + m(c.r) + ',' + m(c.g) + ',' + m(c.b) + ')';
  }

  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function isConnected(el) {
    if (!el) return false;
    if (typeof el.isConnected === 'boolean') return el.isConnected;
    return doc.documentElement.contains(el);
  }

  function motionPref() {
    try { return W.localStorage ? W.localStorage.getItem('cc_fx_motion') : null; } catch (e) { return null; }
  }
  var mq = null;
  try { mq = W.matchMedia ? W.matchMedia('(prefers-reduced-motion: reduce)') : null; } catch (e) { mq = null; }
  function reduced() {
    var m = (CC.fx && CC.fx.motion) || motionPref();
    if (m === 'full') return false;
    if (m === 'reduced') return true;
    return !!(mq && mq.matches);
  }

  /* Le canvas a-t-il une taille CSS, ou dépend-il de ses attributs width/height ? */
  function intrinsicSize(canvas) {
    var ow = canvas.width, oh = canvas.height;
    var w1 = canvas.clientWidth, h1 = canvas.clientHeight;
    canvas.width = ow + 41; canvas.height = oh + 29;
    var w2 = canvas.clientWidth, h2 = canvas.clientHeight;
    canvas.width = ow; canvas.height = oh;
    return { w: w1 !== w2, h: h1 !== h2 };
  }

  function catColors(categories) {
    var m = {};
    toArr(categories).forEach(function (c) { if (c && c.id) m[c.id] = c.color; });
    return m;
  }

  /* Observe la taille d'un élément ; renvoie une fonction pour arrêter. */
  function watchSize(el, cb) {
    var ro = null;
    if (W.ResizeObserver) {
      ro = new W.ResizeObserver(function () { cb(); });
      try { ro.observe(el); } catch (e) { ro = null; }
    }
    W.addEventListener('resize', cb);
    return function () {
      if (ro) ro.disconnect();
      W.removeEventListener('resize', cb);
    };
  }

  /* ------------------------------------------------------------------ */
  /* Styles injectés                                                     */
  /* ------------------------------------------------------------------ */

  var CSS = [
    /* Avatars */
    '.ccfx-av{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:none;box-sizing:border-box;border-radius:50%;color:#fff;font-weight:700;line-height:1;letter-spacing:-.01em;vertical-align:middle;-webkit-user-select:none;user-select:none;overflow:hidden;box-shadow:0 1px 2px rgba(26,23,48,.10),0 4px 12px -4px rgba(26,23,48,.28)}',
    '.ccfx-av::after{content:"";position:absolute;top:0;right:0;bottom:0;left:0;border-radius:50%;background:radial-gradient(120% 90% at 28% 12%,rgba(255,255,255,.42),rgba(255,255,255,0) 55%);pointer-events:none}',
    '.ccfx-av__i{position:relative;z-index:1;text-shadow:0 1px 2px rgba(20,10,60,.28)}',
    '.ccfx-av--team,.ccfx-av--prof{box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.95),0 1px 2px rgba(26,23,48,.10),0 4px 12px -4px rgba(26,23,48,.28)}',

    /* Confettis */
    '.ccfx-confetti{position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483000}',

    /* Révélation des affinités */
    '.ccfx-reveal{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147480000;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;color:#fff;font-family:' + UI_FONT + ';-webkit-font-smoothing:antialiased;background:#140D40;background:radial-gradient(130% 95% at 50% 0%,#4128D6 0%,#2A1894 30%,#180F55 62%,#0C0828 100%);cursor:default;-webkit-tap-highlight-color:transparent}',
    '.ccfx-reveal *{box-sizing:border-box}',
    '.ccfx-reveal__bg{position:fixed;top:0;right:0;bottom:0;left:0;overflow:hidden;pointer-events:none}',
    '.ccfx-blob{position:absolute;display:block;width:80vmax;height:80vmax;border-radius:50%;will-change:transform;mix-blend-mode:screen}',
    '.ccfx-blob--1{left:-38vmax;top:28%;background:radial-gradient(closest-side,rgba(255,92,138,.5),rgba(255,92,138,0));animation:ccfx-drift1 15s ease-in-out infinite alternate}',
    '.ccfx-blob--2{right:-32vmax;top:-34vmax;background:radial-gradient(closest-side,rgba(155,123,255,.62),rgba(155,123,255,0));animation:ccfx-drift2 18s ease-in-out infinite alternate}',
    '.ccfx-blob--3{left:30%;bottom:-50vmax;background:radial-gradient(closest-side,rgba(255,122,89,.42),rgba(255,122,89,0));animation:ccfx-drift3 21s ease-in-out infinite alternate}',
    '.ccfx-reveal__fx{position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none}',
    '.ccfx-reveal__inner{position:relative;min-height:100%;display:flex;flex-direction:column;padding:calc(22px + env(safe-area-inset-top,0px)) 16px calc(14px + env(safe-area-inset-bottom,0px))}',
    '.ccfx-reveal__wrap{margin:auto 0;width:100%;max-width:1040px;align-self:center;display:flex;flex-direction:column;align-items:center}',
    '.ccfx-reveal__title{margin:0;font-size:clamp(28px,7.4vw,58px);line-height:1.08;font-weight:800;letter-spacing:-.03em;text-align:center;max-width:15ch}',
    '.ccfx-reveal.is-wide .ccfx-reveal__title{max-width:none}',
    '.ccfx-w{display:inline-block;white-space:pre}',
    '.ccfx-w.is-grad{background:linear-gradient(95deg,#C4B5FF 0%,#FFB49E 100%);-webkit-background-clip:text;background-clip:text;color:transparent;padding-bottom:.08em}',
    '.ccfx-w.is-emoji{animation:ccfx-peek 1.5s ease-in-out 1.4s 2}',
    '.ccfx-reveal__sub{margin:10px 0 0;font-size:clamp(15px,1.9vw,19px);line-height:1.45;text-align:center;max-width:36ch;color:rgba(255,255,255,.78)}',
    '.ccfx-reveal__stage{position:relative;width:100%;margin-top:clamp(18px,4vh,40px);display:flex;flex-direction:column;align-items:center}',
    '.ccfx-reveal__svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:3}',
    '.ccfx-reveal__svg path{fill:none;stroke-linecap:round;stroke-linejoin:round}',
    '.ccfx-reveal__me{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:12px;margin-bottom:24px}',
    '.ccfx-reveal.is-wide .ccfx-reveal__me{margin-bottom:76px}',
    '.ccfx-reveal__meav{position:relative;display:inline-flex;border-radius:50%;isolation:isolate}',
    '.ccfx-reveal__meav::before{content:"";position:absolute;top:-8px;right:-8px;bottom:-8px;left:-8px;border-radius:50%;background:conic-gradient(from 0deg,#9B7BFF,#FF6B4A,#E5539A,#5B3DF5,#9B7BFF);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3.5px),#000 calc(100% - 3px));mask:radial-gradient(farthest-side,transparent calc(100% - 3.5px),#000 calc(100% - 3px));animation:ccfx-spin 5s linear infinite;z-index:-1}',
    '.ccfx-reveal__meav .ccfx-av{box-shadow:0 0 0 5px rgba(255,255,255,.08),0 0 60px 8px rgba(155,123,255,.55)}',
    '.ccfx-reveal__halo{position:absolute;top:0;right:0;bottom:0;left:0;border-radius:50%;border:2px solid rgba(205,190,255,.6);animation:ccfx-sonar 2.6s cubic-bezier(.15,.6,.3,1) infinite;pointer-events:none;z-index:-2}',
    '.ccfx-reveal__halo + .ccfx-reveal__halo{animation-delay:1.3s}',
    '.ccfx-reveal__mename{font-size:17px;font-weight:700;letter-spacing:-.01em;color:rgba(255,255,255,.92)}',
    '.ccfx-reveal__list{position:relative;z-index:2;list-style:none;margin:0;padding:0;width:100%;display:grid;gap:12px}',
    '.ccfx-reveal.is-narrow .ccfx-reveal__list{padding-left:30px}',
    '.ccfx-reveal.is-wide .ccfx-reveal__list{gap:22px;margin:0 auto}',
    '.ccfx-reveal__card{position:relative;display:flex;gap:14px;align-items:flex-start;text-align:left;padding:14px;border-radius:20px;background:linear-gradient(180deg,rgba(255,255,255,.13),rgba(255,255,255,.05));border:1px solid rgba(255,255,255,.17);-webkit-backdrop-filter:blur(14px) saturate(150%);backdrop-filter:blur(14px) saturate(150%);box-shadow:0 20px 44px -20px rgba(5,0,40,.75)}',
    '.ccfx-reveal.is-wide .ccfx-reveal__card{flex-direction:column;align-items:center;gap:0;text-align:center;padding:0 18px 20px;margin-top:calc(var(--av) / 2)}',
    '.ccfx-reveal.is-wide .ccfx-reveal__head,.ccfx-reveal.is-wide .ccfx-reveal__reasons{align-self:stretch}',
    '.ccfx-reveal__avw{position:relative;flex:none;display:inline-flex;border-radius:50%}',
    '.ccfx-reveal__card::after{content:"";position:absolute;top:0;right:0;bottom:0;left:0;border-radius:inherit;pointer-events:none;opacity:var(--glare,0);transition:opacity .25s ease;background:radial-gradient(260px circle at var(--gx,50%) var(--gy,0%),rgba(255,255,255,.16),rgba(255,255,255,0) 60%)}',
    '.ccfx-reveal.is-wide .ccfx-reveal__avw{margin-top:calc(var(--av) / -2)}',
    '.ccfx-reveal__avw .ccfx-av{box-shadow:0 0 0 3px rgba(255,255,255,.16),0 10px 28px -6px rgba(0,0,0,.55)}',
    '.ccfx-reveal__head{min-width:0}',
    '.ccfx-reveal__name{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font-size:18px;font-weight:750;letter-spacing:-.015em;line-height:1.2}',
    '.ccfx-reveal.is-wide .ccfx-reveal__name{justify-content:center;font-size:22px;margin-top:12px}',
    '.ccfx-reveal__meta{margin-top:2px;font-size:13.5px;font-weight:500;color:rgba(255,255,255,.66)}',
    '.ccfx-reveal.is-narrow .ccfx-reveal__card{display:grid;grid-template-columns:auto minmax(0,1fr);gap:0 12px;align-items:center;padding:12px}',
    '.ccfx-reveal.is-narrow .ccfx-reveal__reasons{grid-column:1 / -1;margin-top:10px;gap:5px}',
    '.ccfx-reveal.is-narrow .ccfx-reveal__reason{font-size:14.5px;padding:6px 10px}',
    '.ccfx-reveal.is-narrow .ccfx-reveal__title{font-size:clamp(25px,7vw,34px)}',
    '.ccfx-reveal.is-narrow .ccfx-reveal__sub{font-size:14.5px;margin-top:8px}',
    '.ccfx-reveal.is-narrow .ccfx-reveal__stage{margin-top:16px}',
    '.ccfx-reveal.is-narrow .ccfx-reveal__me{margin-bottom:16px;gap:8px}',
    '.ccfx-reveal.is-narrow .ccfx-reveal__list{gap:10px}',
    '.ccfx-reveal.is-narrow .ccfx-reveal__cta{margin-top:16px}',
    '.ccfx-reveal.is-wide.is-compact .ccfx-reveal__title{font-size:clamp(28px,4.2vw,46px)}',
    '.ccfx-reveal.is-wide.is-compact .ccfx-reveal__stage{margin-top:18px}',
    '.ccfx-reveal.is-wide.is-compact .ccfx-reveal__me{margin-bottom:56px}',
    '.ccfx-reveal.is-wide.is-compact .ccfx-reveal__cta{margin-top:18px}',
    '.ccfx-reveal.is-narrow.is-compact .ccfx-reveal__sub{display:none}',
    '.ccfx-reveal__badge{display:inline-block;font-size:11.5px;font-weight:700;letter-spacing:.02em;padding:3px 8px;border-radius:999px;background:rgba(255,255,255,.16);color:#fff;vertical-align:2px}',
    '.ccfx-reveal__badge.is-team{background:linear-gradient(135deg,#6E4BFF,#FF6B4A)}',
    '.ccfx-reveal__badge.is-prof{background:linear-gradient(135deg,#FFD27A,#F59E5B);color:#2A1A05}',
    '.ccfx-reveal__reasons{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}',
    '.ccfx-reveal__reason{display:flex;align-items:flex-start;gap:8px;font-size:15px;line-height:1.35;padding:7px 11px;border-radius:12px;background:rgba(255,255,255,.08);text-align:left}',
    '.ccfx-reveal__reason.is-learn{background:linear-gradient(135deg,rgba(132,102,255,.62),rgba(132,102,255,.26));font-weight:650}',
    '.ccfx-reveal__reason.is-teach{background:linear-gradient(135deg,rgba(255,107,74,.48),rgba(255,107,74,.18));font-weight:600}',
    '.ccfx-reveal__ic{flex:none;width:1.3em;text-align:center}',
    '.ccfx-reveal__empty{position:relative;z-index:2;margin:6px 0 0;max-width:34ch;text-align:center;font-size:16px;line-height:1.45;color:rgba(255,255,255,.8)}',
    '.ccfx-reveal__cta{position:-webkit-sticky;position:sticky;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:4;display:flex;justify-content:center;margin-top:26px;padding-top:6px}',
    '.ccfx-reveal__btn{position:relative;overflow:hidden;display:inline-flex;align-items:center;gap:10px;min-height:56px;padding:0 32px;border:0;border-radius:999px;font:inherit;font-size:18px;font-weight:750;letter-spacing:-.01em;color:#fff;cursor:pointer;background:linear-gradient(135deg,#6E4BFF 0%,#9B5CF0 45%,#FF6B4A 100%);box-shadow:0 14px 36px -10px rgba(255,107,74,.75),inset 0 1px 0 rgba(255,255,255,.35);transition:transform .16s ease}',
    '.ccfx-reveal__btn:hover{transform:translateY(-1px)}',
    '.ccfx-reveal__btn:active{transform:scale(.96)}',
    '.ccfx-reveal__btn:focus{outline:none}',
    '.ccfx-reveal__btn:focus-visible{outline:3px solid #fff;outline-offset:3px}',
    '.ccfx-reveal__btn::after{content:"";position:absolute;top:0;bottom:0;left:0;width:45%;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.42),rgba(255,255,255,0));transform:translateX(-150%) skewX(-20deg);animation:ccfx-shine 3.4s ease-in-out 1.2s infinite;pointer-events:none}',
    '.ccfx-reveal.is-done .ccfx-reveal__btn{animation:ccfx-ready 2.2s ease-in-out infinite}',
    '.ccfx-reveal__arrow{display:inline-block;transition:transform .2s ease}',
    '.ccfx-reveal__btn:hover .ccfx-reveal__arrow{transform:translateX(4px)}',
    '.ccfx-rm .ccfx-blob,.ccfx-rm .ccfx-reveal__meav::before,.ccfx-rm .ccfx-reveal__btn,.ccfx-rm .ccfx-reveal__btn::after,.ccfx-rm .ccfx-w{animation:none!important}',
    '.ccfx-rm .ccfx-reveal__halo{display:none}',

    '@keyframes ccfx-drift1{from{transform:translate3d(0,0,0) scale(1)}to{transform:translate3d(18vw,-12vh,0) scale(1.18)}}',
    '@keyframes ccfx-drift2{from{transform:translate3d(0,0,0) scale(1.1)}to{transform:translate3d(-16vw,14vh,0) scale(.92)}}',
    '@keyframes ccfx-drift3{from{transform:translate3d(0,0,0) scale(1)}to{transform:translate3d(-14vw,-10vh,0) scale(1.15)}}',
    '@keyframes ccfx-sonar{0%{transform:scale(1);opacity:.85}100%{transform:scale(2.3);opacity:0}}',
    '@keyframes ccfx-spin{to{transform:rotate(1turn)}}',
    '@keyframes ccfx-shine{0%{transform:translateX(-150%) skewX(-20deg)}55%,100%{transform:translateX(330%) skewX(-20deg)}}',
    '@keyframes ccfx-peek{0%,100%{transform:none}30%{transform:translateX(-3px) rotate(-10deg)}70%{transform:translateX(3px) rotate(10deg)}}',
    '@keyframes ccfx-ready{0%,100%{box-shadow:0 14px 36px -10px rgba(255,107,74,.75),0 0 0 0 rgba(255,138,101,.55),inset 0 1px 0 rgba(255,255,255,.35)}60%{box-shadow:0 14px 36px -10px rgba(255,107,74,.75),0 0 0 16px rgba(255,138,101,0),inset 0 1px 0 rgba(255,255,255,.35)}}'
  ].join('\n');

  function injectStyle() {
    try {
      if (doc.getElementById('cc-fx-style')) return;
      var st = doc.createElement('style');
      st.id = 'cc-fx-style';
      st.textContent = CSS;
      (doc.head || doc.documentElement).appendChild(st);
    } catch (e) { /* rien : les effets restent utilisables sans styles */ }
  }

  /* ------------------------------------------------------------------ */
  /* Avatars                                                             */
  /* ------------------------------------------------------------------ */

  /* Même palette et même hachage que avatar() dans app.js : une personne a la même couleur partout. */
  var AV_GRADS = [
    ['#5B3DF5', '#9F7BFF'], ['#FF6B4A', '#FFA26B'], ['#E5539A', '#FF8FC4'], ['#22A06B', '#5AD69B'],
    ['#1C9FD6', '#62CCF5'], ['#C98A0B', '#F4BC45'], ['#9B59D0', '#C994F2'], ['#0F9E94', '#47D3C7'],
    ['#3B6FE0', '#79A2FF'], ['#E8743B', '#FFAB78']
  ];
  var RING = {
    team: 'conic-gradient(from 200deg,#5B3DF5,#FF6B4A,#E5539A,#5B3DF5)',
    prof: 'linear-gradient(135deg,#FFD27A,#F59E5B)'
  };

  function avatarColors(id) { return AV_GRADS[hash(id) % AV_GRADS.length]; }

  function initials(p) {
    p = p || {};
    var f = String(p.firstName || '').trim();
    var l = String(p.lastName || '').replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '');
    var s = (f.charAt(0) + l.charAt(0)).toUpperCase();
    return s || '?';
  }

  function fullName(p) {
    p = p || {};
    return (String(p.firstName || '') + (p.lastName ? ' ' + p.lastName : '')).trim();
  }

  function avatarHTML(person, size) {
    var p = person || {};
    var s = Math.round(+size) || 44;
    if (s < 12) s = 12;
    var ini = initials(p);
    var g = avatarColors(p.id != null ? p.id : (p.firstName || '?'));
    var ring = p.team ? 'team' : (p.role === 'prof' ? 'prof' : '');
    var fs = Math.max(9, Math.round(s * (ini.length > 1 ? 0.38 : 0.44)));
    var fill = 'linear-gradient(135deg,' + g[0] + ' 0%,' + g[1] + ' 100%)';
    if (p.photo && typeof p.photo === 'string') {
      fill = 'url(&quot;' + escapeHTML(p.photo).replace(/[()]/g, '') + '&quot;) center/cover no-repeat,' + fill;
    }
    var style = 'width:' + s + 'px;height:' + s + 'px;font-size:' + fs + 'px;';
    if (ring) {
      var bw = Math.max(2, Math.round(s * 0.055));
      style += 'border:' + bw + 'px solid transparent;background:' + fill + ' padding-box,' + RING[ring] + ' border-box;';
    } else {
      style += 'background:' + fill + ';';
    }
    var name = fullName(p) || 'Profil';
    return '<span class="ccfx-av' + (ring ? ' ccfx-av--' + ring : '') + '" style="' + style + '" role="img" aria-label="' +
      escapeHTML(name) + '" title="' + escapeHTML(name) + '"' + (p.id != null ? ' data-person-id="' + escapeHTML(p.id) + '"' : '') + '>' +
      (p.photo ? '' : '<span class="ccfx-av__i" aria-hidden="true">' + escapeHTML(ini) + '</span>') + '</span>';
  }

  /* ------------------------------------------------------------------ */
  /* 1. Bienvenue : réseau vivant                                        */
  /* ------------------------------------------------------------------ */

  function detectDark(canvas) {
    try {
      var host = canvas.parentElement;
      if (!host) return false;
      var probe = host.querySelector('h1, h2, p') || host;
      var m = String(getComputedStyle(probe).color).match(/[\d.]+/g);
      if (!m || m.length < 3) return false;
      var lum = (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
      return lum > 0.6; // texte clair → fond sombre
    } catch (e) { return false; }
  }

  /* L'écran peint-il déjà son propre fond (dégradé, aurora CSS) sous le canvas ? */
  function hostHasBackdrop(canvas) {
    try {
      var host = canvas.parentElement;
      if (!host) return false;
      var bi = getComputedStyle(host).backgroundImage;
      if (bi && bi !== 'none') return true;
      for (var sib = canvas.previousElementSibling; sib; sib = sib.previousElementSibling) {
        if (/aurora|gradient|backdrop/i.test(String(sib.className || ''))) return true;
      }
    } catch (e) { /* rien */ }
    return false;
  }

  function auroraBlobs(dark) {
    if (dark) {
      return [
        { c: '#6A4BFF', a: 0.85, x: 0.22, y: 0.28, ax: 0.18, ay: 0.14, r: 0.62, sx: 0.11, sy: 0.09, p: 0.0 },
        { c: '#FF7A5C', a: 0.6, x: 0.84, y: 0.8, ax: 0.14, ay: 0.14, r: 0.5, sx: 0.08, sy: 0.12, p: 1.7 },
        { c: '#E5539A', a: 0.42, x: 0.78, y: 0.18, ax: 0.14, ay: 0.12, r: 0.45, sx: 0.13, sy: 0.07, p: 3.1 },
        { c: '#3B6FE0', a: 0.4, x: 0.25, y: 0.85, ax: 0.15, ay: 0.1, r: 0.5, sx: 0.07, sy: 0.1, p: 4.4 }
      ];
    }
    return [
      { c: '#5B3DF5', a: 0.42, x: 0.18, y: 0.22, ax: 0.16, ay: 0.12, r: 0.62, sx: 0.11, sy: 0.09, p: 0.0 },
      { c: '#FF6B4A', a: 0.38, x: 0.86, y: 0.8, ax: 0.14, ay: 0.14, r: 0.56, sx: 0.08, sy: 0.12, p: 1.7 },
      { c: '#E5539A', a: 0.26, x: 0.8, y: 0.14, ax: 0.12, ay: 0.1, r: 0.44, sx: 0.13, sy: 0.07, p: 3.1 },
      { c: '#9B7BFF', a: 0.28, x: 0.3, y: 0.88, ax: 0.15, ay: 0.08, r: 0.5, sx: 0.07, sy: 0.1, p: 4.4 }
    ];
  }

  function glowSprite(color, size, dpr) {
    var c = doc.createElement('canvas');
    var px = Math.ceil(size * dpr);
    c.width = c.height = px;
    var g = c.getContext('2d');
    var r = px / 2;
    var grd = g.createRadialGradient(r, r, 0, r, r, r);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.18, rgba(color, 0.95));
    grd.addColorStop(0.45, rgba(color, 0.35));
    grd.addColorStop(1, rgba(color, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, px, px);
    return c;
  }

  function welcomeNetwork(canvas, opts) {
    opts = opts || {};
    var api = { stop: noop };
    if (!canvas || typeof canvas.getContext !== 'function') return api;
    if (canvas.__ccfx && canvas.__ccfx.stop) canvas.__ccfx.stop();
    var ctx = canvas.getContext('2d');
    if (!ctx) return api;
    injectStyle();

    var D = CC.data || {};
    var rm = reduced();
    var themeLocked = opts.theme === 'dark' || opts.theme === 'light';
    var dark = themeLocked ? opts.theme === 'dark' : detectDark(canvas);
    /* fond aurora peint par le canvas, sauf si l'écran a déjà le sien (on se pose alors par-dessus) */
    var paintBg = opts.background === undefined ? !hostHasBackdrop(canvas) : !!opts.background;
    var colors = catColors(D.categories);

    /* Réserve de nœuds : emojis de passions + initiales de personnes. */
    var pool = [], seen = {};
    toArr(D.passions).forEach(function (p) {
      if (!p || !p.emoji || seen[p.emoji]) return;
      seen[p.emoji] = 1;
      pool.push({ kind: 'emoji', label: p.emoji, color: colors[p.cat] || BRAND.violet });
    });
    toArr(opts.people || D.people).forEach(function (p) {
      if (!p) return;
      var g = avatarColors(p.id != null ? p.id : p.firstName);
      pool.push({ kind: 'person', label: initials(p), c1: g[0], c2: g[1], color: g[0] });
    });
    if (!pool.length) pool.push({ kind: 'emoji', label: '✨', color: BRAND.violet });
    shuffle(pool);

    var w = 0, h = 0, dpr = 1, small = false;
    var nodes = [], sparks = [], waves = [], cand = [];
    var poolIdx = 0;
    var aur = doc.createElement('canvas');
    var actx = aur.getContext('2d');
    var blobs = auroraBlobs(dark);
    var sprites = {};
    var sparkImg = null, sparkKey = '';
    var pointer = { x: 0, y: 0, sx: 0, sy: 0, on: false, touch: false, until: 0, str: 0, init: false };
    var rafId = 0, stopped = false, born = now(), start = 0, last = 0, frames = 0;
    var dirty = true, wasConnected = false, checked = false, nextSpark = 0;
    /* qualité adaptative : si l'appareil peine (< ~40 i/s), on allège */
    var lvl = 0, ema = 16.7, slow = 0;
    var canFilter = typeof ctx.filter === 'string';
    var zones = [], zonesDirty = true;

    /* Zones de texte posées sur le canvas : les nœuds s'y effacent pour garder le texte lisible. */
    function refreshZones() {
      zonesDirty = false;
      zones = [];
      var host = canvas.parentElement;
      if (!host || !w) return;
      var cr = canvas.getBoundingClientRect();
      if (!cr.width || !cr.height) return;
      var sx = w / cr.width, sy = h / cr.height;
      var els = host.querySelectorAll('h1,h2,h3,p,button,a,li,label,input,svg,img,[class*="card"],[data-fx-avoid]');
      for (var i = 0; i < els.length && zones.length < 24; i++) {
        var el = els[i];
        if (el === canvas) continue;
        var r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        if (r.width * r.height > cr.width * cr.height * 0.6) continue;
        var x0 = (r.left - cr.left) * sx, y0 = (r.top - cr.top) * sy;
        var x1 = x0 + r.width * sx, y1 = y0 + r.height * sy;
        if (x0 > w || y0 > h || x1 < 0 || y1 < 0) continue;
        zones.push({ x0: x0, y0: y0, x1: x1, y1: y1 });
      }
    }
    function zoneFade(x, y, r) {
      var f = 1;
      for (var i = 0; i < zones.length; i++) {
        var z = zones[i];
        var dx = Math.max(z.x0 - x, 0, x - z.x1), dy = Math.max(z.y0 - y, 0, y - z.y1);
        var pad = 14 + r;
        if (dx > pad || dy > pad) continue;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d >= pad) continue;
        var k = d / pad;
        k = k * k * (3 - 2 * k);
        if (k < f) f = k;
      }
      return 0.12 + 0.88 * f;
    }

    function measure() {
      var cw = canvas.clientWidth, ch = canvas.clientHeight;
      if ((!cw || !ch) && canvas.getBoundingClientRect) {
        var r = canvas.getBoundingClientRect();
        cw = r.width; ch = r.height;
      }
      return { w: cw || 0, h: ch || 0 };
    }

    function spriteFor(item, r, z) {
      var blur = (canFilter && z < 0.66) ? Math.round((0.66 - z) * 9 * 2) / 2 : 0;
      var key = item.kind + '|' + item.label + '|' + (item.c1 || item.color) + '|' + Math.round(r * 2) + '|' + blur + '|' + (dark ? 1 : 0) + '|' + dpr;
      if (sprites[key]) return sprites[key];
      var pad = 12 + blur * 2;
      var half = r + pad;
      var c = doc.createElement('canvas');
      c.width = c.height = Math.ceil(half * 2 * dpr);
      var g = c.getContext('2d');
      g.scale(dpr, dpr);
      if (blur) g.filter = 'blur(' + blur + 'px)';
      var cx = half;
      g.beginPath();
      g.arc(cx, cx, r, 0, TAU);
      if (item.kind === 'emoji') {
        if (dark) {
          g.shadowColor = rgba(item.color, 0.8);
          g.shadowBlur = 18;
          g.fillStyle = 'rgba(255,255,255,0.13)';
        } else {
          g.shadowColor = 'rgba(46,28,140,0.22)';
          g.shadowBlur = 14;
          g.shadowOffsetY = 4;
          g.fillStyle = '#FFFFFF';
        }
        g.fill();
        g.shadowColor = 'transparent';
        g.shadowBlur = 0;
        g.shadowOffsetY = 0;
        g.lineWidth = dark ? 1.5 : 2;
        g.strokeStyle = rgba(item.color, dark ? 0.85 : 0.45);
        g.stroke();
        g.font = Math.round(r * 1.02) + 'px ' + EMOJI_FONT;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#000';
        g.fillText(item.label, cx, cx + r * 0.07);
      } else {
        var grd = g.createLinearGradient(cx - r, cx - r, cx + r, cx + r);
        grd.addColorStop(0, item.c1);
        grd.addColorStop(1, item.c2);
        g.shadowColor = dark ? rgba(item.c1, 0.9) : 'rgba(46,28,140,0.25)';
        g.shadowBlur = dark ? 18 : 12;
        g.shadowOffsetY = dark ? 0 : 4;
        g.fillStyle = grd;
        g.fill();
        g.shadowColor = 'transparent';
        g.shadowBlur = 0;
        g.shadowOffsetY = 0;
        var gl = g.createRadialGradient(cx - r * 0.35, cx - r * 0.5, 0, cx - r * 0.35, cx - r * 0.5, r * 1.1);
        gl.addColorStop(0, 'rgba(255,255,255,0.45)');
        gl.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gl;
        g.beginPath();
        g.arc(cx, cx, r, 0, TAU);
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = 'rgba(255,255,255,0.92)';
        g.stroke();
        g.fillStyle = '#FFFFFF';
        g.font = '700 ' + Math.round(r * (item.label.length > 1 ? 0.74 : 0.86)) + 'px ' + UI_FONT;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(item.label, cx, cx + 1);
      }
      sprites[key] = { img: c, half: half };
      return sprites[key];
    }

    function sizeNode(n) {
      var base = n.item.kind === 'emoji' ? (small ? 19 : 25) : (small ? 16 : 21);
      n.r = base * (0.6 + 0.4 * n.z);
      n.sp = spriteFor(n.item, n.r, n.z);
    }

    function addNode(intro, elapsed) {
      var item = pool[poolIdx % pool.length];
      poolIdx++;
      var z = 0.45 + Math.pow(Math.random(), 0.7) * 0.55;
      var n = { item: item, z: z, x: 0, y: 0, vx: 0, vy: 0, bvx: 0, bvy: 0, hs: 1, dx: 0, dy: 0, ia: 0, is: 0, delay: 0 };
      var sp = (7 + Math.random() * 13) * (0.55 + 0.6 * z);
      var ang = Math.random() * TAU;
      n.bvx = n.vx = Math.cos(ang) * sp;
      n.bvy = n.vy = Math.sin(ang) * sp;
      var best = null, bestD = -1;
      for (var k = 0; k < 14; k++) {
        var cx = Math.random() * w, cy = Math.random() * h, md = Infinity;
        for (var i = 0; i < nodes.length; i++) {
          var ddx = nodes[i].x - cx, ddy = nodes[i].y - cy, dd = ddx * ddx + ddy * ddy;
          if (dd < md) md = dd;
        }
        if (md > bestD) { bestD = md; best = [cx, cy]; }
      }
      n.x = best[0];
      n.y = best[1];
      var dc = Math.sqrt(Math.pow(n.x - w / 2, 2) + Math.pow(n.y - h / 2, 2)) / Math.sqrt(w * w / 4 + h * h / 4);
      n.delay = intro ? 60 + dc * 700 + Math.random() * 260 : elapsed + Math.random() * 300;
      sizeNode(n);
      nodes.push(n);
    }

    function targetCount() {
      var n = Math.round((w * h) / (small ? 10500 : 17500));
      n = Math.min(pool.length, clamp(n, small ? 18 : 28, small ? 34 : 64));
      return lvl >= 2 ? Math.round(n * 0.6) : n;
    }

    function syncCount(intro, elapsed) {
      var target = targetCount();
      if (nodes.length === target) return;
      while (nodes.length < target) addNode(intro, elapsed);
      while (nodes.length > target) nodes.splice((Math.random() * nodes.length) | 0, 1);
      nodes.sort(function (a, b) { return a.z - b.z; });
    }

    function resize() {
      var m = measure();
      if (m.w < 2 || m.h < 2) return false;
      if (!checked) {
        checked = true;
        if (opts.autoSize !== false) {
          var intr = intrinsicSize(canvas);
          if (intr.w || intr.h) {
            var st = canvas.style;
            st.position = 'fixed'; st.left = '0'; st.top = '0';
            st.width = '100%'; st.height = '100%';
            st.zIndex = '-1'; st.pointerEvents = 'none'; st.display = 'block';
            m = measure();
            if (m.w < 2 || m.h < 2) return false;
          }
        }
      }
      var nd = getDpr();
      if (m.w === w && m.h === h && nd === dpr) return true;
      var ow = w, oh = h, odpr = dpr, osmall = small;
      w = m.w; h = m.h; dpr = nd;
      small = w < 700 || h < 500;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      aur.width = Math.max(24, Math.ceil(w / 10));
      aur.height = Math.max(24, Math.ceil(h / 10));
      if (ow && oh) {
        for (var i = 0; i < nodes.length; i++) { nodes[i].x *= w / ow; nodes[i].y *= h / oh; }
      }
      if (odpr !== dpr || osmall !== small) {
        sprites = {};
        sparkImg = null;
        for (var j = 0; j < nodes.length; j++) sizeNode(nodes[j]);
      }
      var first = !start;
      if (first) start = now();
      syncCount(first, now() - start);
      return true;
    }

    function retheme() {
      var d = detectDark(canvas);
      if (d === dark) return;
      dark = d;
      blobs = auroraBlobs(dark);
      sprites = {};
      sparkImg = null;
      for (var i = 0; i < nodes.length; i++) sizeNode(nodes[i]);
    }

    /* --- interaction --- */
    function local(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
    }
    function onMove(e) {
      var p = local(e);
      pointer.x = p.x;
      pointer.y = p.y;
      pointer.on = p.x >= -30 && p.y >= -30 && p.x <= p.w + 30 && p.y <= p.h + 30;
      pointer.touch = e.pointerType === 'touch' || e.pointerType === 'pen';
      if (pointer.touch) pointer.until = now() + 1600;
      if (!pointer.init) { pointer.sx = p.x; pointer.sy = p.y; pointer.init = true; }
    }
    function onDown(e) {
      onMove(e);
      if (!pointer.on) return;
      pointer.sx = pointer.x;
      pointer.sy = pointer.y;
      waves.push({ x: pointer.x, y: pointer.y, t: now() });
      var R = small ? 200 : 280;
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i], dx = n.x - pointer.x, dy = n.y - pointer.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (d < R) {
          var push = (1 - d / R) * 640 * n.z;
          n.vx += dx / d * push;
          n.vy += dy / d * push;
        }
      }
    }
    function onOut(e) { if (!e.relatedTarget && !pointer.touch) pointer.on = false; }
    function onBlur() { pointer.on = false; }
    function onVis() {
      if (doc.hidden) { if (rafId) { caf(rafId); rafId = 0; } }
      else { last = now(); schedule(); }
    }
    function onResize() { dirty = true; zonesDirty = true; if (rm) drawStatic(); }
    function onScroll() { zonesDirty = true; }

    /* --- simulation --- */
    function update(dt, t) {
      var el = t - start;
      if (pointer.on && pointer.touch && t > pointer.until) pointer.on = false;
      pointer.str += ((pointer.on ? 1 : 0) - pointer.str) * Math.min(1, dt * 4);
      var sm = Math.min(1, dt * 9);
      pointer.sx += (pointer.x - pointer.sx) * sm;
      pointer.sy += (pointer.y - pointer.sy) * sm;
      var ps = pointer.str;
      var R = small ? 150 : 210, R2 = R * R, ring = small ? 52 : 72;
      var relax = Math.min(1, dt * 1.1);
      var cx = w / 2, cy = h / 2;
      var parX = ps * (pointer.sx - cx) * -0.035, parY = ps * (pointer.sy - cy) * -0.035;
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        n.vx += (n.bvx - n.vx) * relax;
        n.vy += (n.bvy - n.vy) * relax;
        var near = false;
        if (ps > 0.01) {
          var dx = pointer.x - n.x, dy = pointer.y - n.y, d2 = dx * dx + dy * dy;
          if (d2 < R2 && d2 > 1) {
            var d = Math.sqrt(d2), f = 1 - d / R;
            var acc = d > ring ? 560 * f : -420 * (1 - d / ring);
            var k = acc * dt * ps * (0.5 + 0.5 * n.z);
            n.vx += dx / d * k;
            n.vy += dy / d * k;
            n.vx += -dy / d * 110 * f * dt * ps;
            n.vy += dx / d * 110 * f * dt * ps;
            near = d < n.r + 34;
          }
        }
        var s2 = n.vx * n.vx + n.vy * n.vy;
        if (s2 > 160000) { var s = 400 / Math.sqrt(s2); n.vx *= s; n.vy *= s; }
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        var m = n.r + 10;
        if (n.x < -m) { n.x = -m; n.vx = Math.abs(n.vx); n.bvx = Math.abs(n.bvx); }
        else if (n.x > w + m) { n.x = w + m; n.vx = -Math.abs(n.vx); n.bvx = -Math.abs(n.bvx); }
        if (n.y < -m) { n.y = -m; n.vy = Math.abs(n.vy); n.bvy = Math.abs(n.bvy); }
        else if (n.y > h + m) { n.y = h + m; n.vy = -Math.abs(n.vy); n.bvy = -Math.abs(n.bvy); }
        n.hs += ((near ? 1.22 : 1) - n.hs) * Math.min(1, dt * 10);
        /* position dessinée : parallaxe + intro (explosion depuis le centre) */
        var p = clamp((el - n.delay) / 1000, 0, 1);
        var e = easeOutExpo(p);
        var px = n.x + parX * (n.z - 0.7), py = n.y + parY * (n.z - 0.7);
        n.dx = cx + (px - cx) * e;
        n.dy = cy + (py - cy) * e;
        n.ia = easeOutCubic(Math.min(1, p * 1.5));
        n.is = p >= 1 ? 1 : Math.max(0, easeOutBack(p));
        var zf = zones.length ? zoneFade(n.dx, n.dy, n.r) : 1;
        n.zf = n.zf === undefined ? zf : n.zf + (zf - n.zf) * Math.min(1, dt * 8);
      }
      for (var j = waves.length - 1; j >= 0; j--) if (t - waves[j].t > 900) waves.splice(j, 1);
      for (var q = sparks.length - 1; q >= 0; q--) if (t - sparks[q].t > sparks[q].dur) sparks.splice(q, 1);
      if (t > nextSpark && cand.length && sparks.length < (small ? 4 : 8)) {
        var pair = cand[(Math.random() * cand.length) | 0];
        var flip = Math.random() < 0.5;
        sparks.push({ a: flip ? pair[1] : pair[0], b: flip ? pair[0] : pair[1], t: t, dur: 900 + Math.random() * 600 });
        nextSpark = t + 220 + Math.random() * 380;
      }
    }

    /* --- dessin --- */
    function drawAurora(t) {
      var aw = aur.width, ah = aur.height, s = t / 1000;
      actx.globalCompositeOperation = 'source-over';
      if (dark) {
        var base = actx.createLinearGradient(0, 0, 0, ah);
        base.addColorStop(0, '#21137A');
        base.addColorStop(1, '#120A40');
        actx.fillStyle = base;
      } else {
        actx.fillStyle = BRAND.bg;
      }
      actx.fillRect(0, 0, aw, ah);
      actx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      var big = Math.max(aw, ah);
      for (var i = 0; i < blobs.length; i++) {
        var b = blobs[i];
        var bx = aw * (b.x + b.ax * Math.sin(s * b.sx * TAU * 0.5 + b.p));
        var by = ah * (b.y + b.ay * Math.cos(s * b.sy * TAU * 0.5 + b.p * 1.3));
        var R = big * b.r * (1 + 0.1 * Math.sin(s * 0.4 + b.p));
        var g = actx.createRadialGradient(bx, by, 0, bx, by, R);
        g.addColorStop(0, rgba(b.c, b.a));
        g.addColorStop(0.5, rgba(b.c, b.a * 0.42));
        g.addColorStop(1, rgba(b.c, 0));
        actx.fillStyle = g;
        actx.fillRect(0, 0, aw, ah);
      }
      actx.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingEnabled = true;
      try { ctx.imageSmoothingQuality = 'low'; } catch (e) { /* Safari ancien */ }
      ctx.drawImage(aur, 0, 0, w, h);
    }

    function draw(t, still) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      if (paintBg) drawAurora(still ? 0 : t);
      else ctx.clearRect(0, 0, w, h);
      var ps = still ? 0 : pointer.str;

      /* halo sous le curseur */
      if (ps > 0.01) {
        var gr = ctx.createRadialGradient(pointer.sx, pointer.sy, 0, pointer.sx, pointer.sy, small ? 150 : 230);
        gr.addColorStop(0, dark ? 'rgba(190,170,255,' + (0.3 * ps) + ')' : 'rgba(91,61,245,' + (0.14 * ps) + ')');
        gr.addColorStop(1, dark ? 'rgba(190,170,255,0)' : 'rgba(91,61,245,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, w, h);
      }

      /* liens entre nœuds proches */
      var LD = small ? 122 : 188, LD2 = LD * LD;
      var linkMax = dark ? 0.9 : 0.8;
      ctx.lineCap = 'round';
      cand.length = 0;
      for (var i = 0; i < nodes.length; i++) {
        var a = nodes[i];
        if (a.ia < 0.05) continue;
        for (var j = i + 1; j < nodes.length; j++) {
          var b = nodes[j];
          if (b.ia < 0.05) continue;
          var dx = b.dx - a.dx;
          if (dx > LD || dx < -LD) continue;
          var dy = b.dy - a.dy;
          if (dy > LD || dy < -LD) continue;
          var d2 = dx * dx + dy * dy;
          if (d2 > LD2) continue;
          var k = 1 - Math.sqrt(d2) / LD;
          var al = k * Math.sqrt(k) * linkMax * Math.min(a.z, b.z) * Math.min(a.ia, b.ia) * Math.min(a.zf, b.zf);
          if (al < 0.02) continue;
          ctx.globalAlpha = al;
          ctx.lineWidth = 1 + k * 1.8;
          if (al > 0.1 && lvl < 1) {
            var lg = ctx.createLinearGradient(a.dx, a.dy, b.dx, b.dy);
            lg.addColorStop(0, dark ? shade(a.item.color, 0.55) : a.item.color);
            lg.addColorStop(1, dark ? shade(b.item.color, 0.55) : b.item.color);
            ctx.strokeStyle = lg;
          } else {
            ctx.strokeStyle = dark ? '#C9BEFF' : BRAND.violet;
          }
          ctx.beginPath();
          ctx.moveTo(a.dx, a.dy);
          ctx.lineTo(b.dx, b.dy);
          ctx.stroke();
          if (al > (dark ? 0.14 : 0.22) && !small && lvl < 1) {
            ctx.globalAlpha = al * (dark ? 0.3 : 0.22);
            ctx.lineWidth = 5 + k * 5;
            ctx.stroke();
          }
          if (k > 0.3 && al > 0.08 && cand.length < 48) cand.push([a, b]);
        }
      }

      /* liens vers le curseur */
      if (ps > 0.05) {
        var PR = small ? 140 : 200;
        ctx.strokeStyle = BRAND.coral;
        for (var pi = 0; pi < nodes.length; pi++) {
          var pn = nodes[pi];
          var ex = pn.dx - pointer.sx, ey = pn.dy - pointer.sy, ed = Math.sqrt(ex * ex + ey * ey);
          if (ed > PR) continue;
          var kk = 1 - ed / PR;
          ctx.globalAlpha = kk * kk * 0.75 * ps * pn.ia * pn.zf;
          ctx.lineWidth = 1 + kk * 1.4;
          ctx.beginPath();
          ctx.moveTo(pointer.sx, pointer.sy);
          ctx.lineTo(pn.dx, pn.dy);
          ctx.stroke();
        }
      }

      /* étincelles qui voyagent sur les liens */
      if (sparks.length && !still) {
        var key = (dark ? 'd' : 'l') + dpr;
        if (!sparkImg || sparkKey !== key) { sparkImg = glowSprite(dark ? '#FF9A7E' : BRAND.coral, 40, dpr); sparkKey = key; }
        for (var si = 0; si < sparks.length; si++) {
          var sp = sparks[si];
          var pr = clamp((t - sp.t) / sp.dur, 0, 1);
          var ee = easeInOutCubic(pr);
          var sx = lerp(sp.a.dx, sp.b.dx, ee), sy = lerp(sp.a.dy, sp.b.dy, ee);
          var ddx = sp.b.dx - sp.a.dx, ddy = sp.b.dy - sp.a.dy;
          if (ddx * ddx + ddy * ddy > LD2 * 1.2) continue;
          var sa = Math.sin(pr * Math.PI);
          var size = (small ? 30 : 42) * (0.7 + 0.3 * sa);
          for (var tr = 3; tr >= 0; tr--) {
            var te = easeInOutCubic(Math.max(0, pr - tr * 0.035));
            ctx.globalAlpha = sa * (tr === 0 ? 1 : 0.28 / tr);
            var tx = lerp(sp.a.dx, sp.b.dx, te), ty = lerp(sp.a.dy, sp.b.dy, te);
            var ts = tr === 0 ? size : size * 0.6;
            ctx.drawImage(sparkImg, tx - ts / 2, ty - ts / 2, ts, ts);
          }
          ctx.globalAlpha = sa;
          ctx.drawImage(sparkImg, sx - size / 2, sy - size / 2, size, size);
        }
      }

      /* ondes au clic */
      for (var wi = 0; wi < waves.length; wi++) {
        var wv = waves[wi];
        var wp = clamp((t - wv.t) / 900, 0, 1);
        ctx.globalAlpha = (1 - wp) * 0.6;
        ctx.lineWidth = 2.5 * (1 - wp) + 0.5;
        ctx.strokeStyle = dark ? '#FFFFFF' : BRAND.violet;
        ctx.beginPath();
        ctx.arc(wv.x, wv.y, 14 + easeOutCubic(wp) * (small ? 190 : 270), 0, TAU);
        ctx.stroke();
      }

      /* nœuds, du plus lointain au plus proche */
      for (var ni = 0; ni < nodes.length; ni++) {
        var n = nodes[ni];
        if (n.ia <= 0.01) continue;
        var depth = 0.38 + 0.62 * clamp((n.z - 0.45) / 0.55, 0, 1);
        var sc = n.is * n.hs;
        if (sc <= 0.01) continue;
        var half = n.sp.half * sc;
        ctx.globalAlpha = n.ia * depth * n.zf;
        ctx.drawImage(n.sp.img, n.dx - half, n.dy - half, half * 2, half * 2);
      }
      ctx.globalAlpha = 1;
    }

    function drawStatic() {
      if (stopped) return;
      if (!resize()) return;
      refreshZones();
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        n.dx = n.x; n.dy = n.y; n.ia = 1; n.is = 1; n.hs = 1;
        n.zf = zones.length ? zoneFade(n.dx, n.dy, n.r) : 1;
      }
      draw(0, true);
    }

    function alive() {
      if (isConnected(canvas)) { wasConnected = true; return true; }
      if (wasConnected || now() - born > 8000) { stop(); return false; }
      return true;
    }

    function schedule() {
      if (!rafId && !stopped && !doc.hidden) rafId = raf(frame);
    }

    function frame() {
      rafId = 0;
      if (stopped || !alive()) return;
      var t = now();
      var raw = last ? t - last : 16.7;
      var dt = Math.min(0.05, Math.max(0, raw / 1000));
      last = t;
      frames++;
      if (start && t - start > 2500 && raw < 200 && lvl < 2) {
        ema += (raw - ema) * 0.05;
        slow = ema > 26 ? slow + 1 : 0;
        if (slow > 90) { lvl++; slow = 0; ema = 16.7; if (lvl >= 2) syncCount(false, t - start); }
      }
      if (frames % 45 === 0 && !W.ResizeObserver) dirty = true;
      if (dirty && resize()) dirty = false;
      if (w && start) {
        if (frames === 12 && !themeLocked) retheme();
        if (zonesDirty || frames % 40 === 1) refreshZones();
        update(dt, t);
        draw(t, false);
      }
      schedule();
    }

    var unwatch = watchSize(canvas, onResize);

    function stop() {
      if (stopped) return;
      stopped = true;
      if (rafId) caf(rafId);
      rafId = 0;
      unwatch();
      W.removeEventListener('pointermove', onMove);
      W.removeEventListener('pointerdown', onDown);
      doc.removeEventListener('pointerout', onOut);
      W.removeEventListener('blur', onBlur);
      W.removeEventListener('scroll', onScroll, true);
      doc.removeEventListener('visibilitychange', onVis);
      if (canvas.__ccfx === api) canvas.__ccfx = null;
    }

    api.stop = stop;
    wasConnected = isConnected(canvas);
    api._debug = function () {
      return { nodes: nodes.length, w: w, h: h, dpr: dpr, dark: dark, frames: frames, zones: zones.length, lvl: lvl,
        visible: nodes.filter(function (n) { return n.ia > 0.5; }).length };
    };
    canvas.__ccfx = api;

    if (rm) {
      /* Version calme : une image fixe, redessinée au redimensionnement. */
      var tries = 0;
      (function first() {
        if (stopped) return;
        if (resize()) { drawStatic(); return; }
        if (++tries < 40) setTimeout(first, 100);
      })();
      return api;
    }

    W.addEventListener('pointermove', onMove, { passive: true });
    W.addEventListener('pointerdown', onDown, { passive: true });
    doc.addEventListener('pointerout', onOut, { passive: true });
    W.addEventListener('blur', onBlur);
    W.addEventListener('scroll', onScroll, { passive: true, capture: true });
    doc.addEventListener('visibilitychange', onVis);
    schedule();
    return api;
  }

  /* ------------------------------------------------------------------ */
  /* 2. Révélation des affinités                                         */
  /* ------------------------------------------------------------------ */

  var uidSeq = 0;
  var SVGNS = 'http://www.w3.org/2000/svg';

  function reasonKind(text, type) {
    if (type === 'teachesMe' || /peut t.apprendre/i.test(text)) return { cls: 'is-learn', ic: '🎓' };
    if (type === 'iTeach' || /tu peux lui apprendre/i.test(text)) return { cls: 'is-teach', ic: '🤝' };
    if (type === 'common' || /en commun/i.test(text)) return { cls: 'is-common', ic: '💜' };
    return { cls: '', ic: '•' };
  }

  function reasonText(r) {
    if (r == null) return '';
    if (typeof r === 'string') return r;
    return String(r.text || r.label || '');
  }

  /* Position de el (son coin haut-gauche) dans anc, sans tenir compte des transformations. */
  function offsetIn(el, anc) {
    var x = 0, y = 0, e = el;
    while (e && e !== anc) {
      x += e.offsetLeft;
      y += e.offsetTop;
      var p = e.offsetParent;
      if (p && p !== anc) { x += p.clientLeft || 0; y += p.clientTop || 0; }
      e = p;
    }
    if (e !== anc) {
      var a = anc.getBoundingClientRect(), b = el.getBoundingClientRect();
      return { x: b.left - a.left, y: b.top - a.top };
    }
    return { x: x, y: y };
  }

  function svgEl(name, attrs) {
    var e = doc.createElementNS(SVGNS, name);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    return e;
  }

  function revealMatches(me, matches, onDone) {
    injectStyle();
    var rm = reduced();
    var list = toArr(matches).filter(function (m) { return m && (m.person || m.firstName); })
      .map(function (m) { return m.person ? m : { person: m, reasons: [] }; })
      .slice(0, 3);
    me = me || { id: 'me', firstName: 'Toi' };

    var old = doc.querySelector('.ccfx-reveal');
    if (old && old.__ccfxClose) old.__ccfxClose(true);

    var vw = W.innerWidth || doc.documentElement.clientWidth || 390;
    var vh = W.innerHeight || doc.documentElement.clientHeight || 800;
    var wide = vw >= 760;
    var compact = wide ? vh < 840 : vh < 760;
    var meSize = wide ? (compact ? 96 : 120) : (compact ? 64 : 76);
    var avSize = wide ? (compact ? 64 : 78) : (compact ? 40 : 46);
    var uid = 'ccfx-r' + (++uidSeq);

    /* --- contenu --- */
    var words = list.length ? ['On', 'a', 'trouvé', 'tes', 'personnes', '👀'] : ['Ton', 'profil', 'est', 'prêt', '✨'];
    var titleHTML = words.map(function (wd, i) {
      var cls = 'ccfx-w' + ((list.length ? (i === 3 || i === 4) : (i === 1)) ? ' is-grad' : '') +
        (i === words.length - 1 ? ' is-emoji' : '');
      return '<span class="' + cls + '">' + escapeHTML(wd) + '</span>';
    }).join(' ');

    var cardsHTML = list.map(function (m) {
      var p = m.person || {};
      var reasons = toArr(m.reasons).map(reasonText).filter(Boolean).slice(0, 3);
      var details = toArr(m.details);
      var badge = p.team ? '<span class="ccfx-reveal__badge is-team">Équipe projet</span>'
        : (p.role === 'prof' ? '<span class="ccfx-reveal__badge is-prof">Prof</span>' : '');
      var meta = p.program || ''; /* le badge « Prof » est déjà à côté du nom */
      var rs = reasons.map(function (r, k) {
        var kind = reasonKind(r, details[k] && details[k].type);
        return '<li class="ccfx-reveal__reason ' + kind.cls + '"><span class="ccfx-reveal__ic" aria-hidden="true">' + kind.ic +
          '</span><span>' + escapeHTML(r) + '</span></li>';
      }).join('');
      return '<li class="ccfx-reveal__card" style="--av:' + avSize + 'px">' +
        '<span class="ccfx-reveal__avw">' + avatarHTML(p, avSize) + '</span>' +
        '<div class="ccfx-reveal__head">' +
          '<div class="ccfx-reveal__name"><span>' + escapeHTML(fullName(p)) + '</span>' + badge + '</div>' +
          (meta ? '<div class="ccfx-reveal__meta">' + escapeHTML(meta) + '</div>' : '') +
        '</div>' +
        (rs ? '<ul class="ccfx-reveal__reasons">' + rs + '</ul>' : '') +
        '</li>';
    }).join('');

    var emptyText = (CC.copy && CC.copy.emptyStates && CC.copy.emptyStates.affinities) ||
      'Ajoute des passions ou ce que tu veux apprendre, on te proposera des gens.';

    var root = doc.createElement('div');
    root.className = 'ccfx-reveal ' + (wide ? 'is-wide' : 'is-narrow') + (compact ? ' is-compact' : '') + (rm ? ' ccfx-rm' : '');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', uid + '-t');
    root.innerHTML =
      '<div class="ccfx-reveal__bg" aria-hidden="true"><i class="ccfx-blob ccfx-blob--1"></i><i class="ccfx-blob ccfx-blob--2"></i><i class="ccfx-blob ccfx-blob--3"></i></div>' +
      '<canvas class="ccfx-reveal__fx" aria-hidden="true"></canvas>' +
      '<div class="ccfx-reveal__inner"><div class="ccfx-reveal__wrap">' +
        '<h2 class="ccfx-reveal__title" id="' + uid + '-t">' + titleHTML + '</h2>' +
        '<p class="ccfx-reveal__sub">' + (list.length ? "D'après tes passions et ce que tu veux apprendre, voilà avec qui ça colle." : '') + '</p>' +
        '<div class="ccfx-reveal__stage">' +
          '<div class="ccfx-reveal__me"><span class="ccfx-reveal__meav"><span class="ccfx-reveal__halo"></span><span class="ccfx-reveal__halo"></span>' +
            avatarHTML(me, meSize) + '</span><span class="ccfx-reveal__mename">' + escapeHTML(me.firstName || 'Toi') + '</span></div>' +
          (list.length ? '<ol class="ccfx-reveal__list" style="' + (wide ? 'grid-template-columns:repeat(' + list.length + ',minmax(0,1fr));max-width:' + (list.length * 330) + 'px' : '') + '">' + cardsHTML + '</ol>'
            : '<p class="ccfx-reveal__empty">' + escapeHTML(emptyText) + '</p>') +
        '</div>' +
        '<div class="ccfx-reveal__cta"><button type="button" class="ccfx-reveal__btn"><span>C\'est parti</span><span class="ccfx-reveal__arrow" aria-hidden="true">→</span></button></div>' +
      '</div></div>';
    if (!list.length) root.querySelector('.ccfx-reveal__sub').style.display = 'none';

    (doc.body || doc.documentElement).appendChild(root);

    var html = doc.documentElement;
    var prevOverflow = html.style.overflow;
    html.style.overflow = 'hidden';

    var stage = root.querySelector('.ccfx-reveal__stage');
    var btn = root.querySelector('.ccfx-reveal__btn');
    var meWrap = root.querySelector('.ccfx-reveal__meav');
    var meAv = meWrap.querySelector('.ccfx-av');
    var cards = [].slice.call(root.querySelectorAll('.ccfx-reveal__card'));
    var cvs = root.querySelector('.ccfx-reveal__fx');

    /* --- lignes SVG --- */
    var svg = svgEl('svg', { 'class': 'ccfx-reveal__svg', 'aria-hidden': 'true' });
    var defs = svgEl('defs', {});
    svg.appendChild(defs);
    var sg = svgEl('radialGradient', { id: uid + '-sp' });
    sg.appendChild(svgEl('stop', { offset: '0', 'stop-color': '#FFFFFF', 'stop-opacity': '1' }));
    sg.appendChild(svgEl('stop', { offset: '0.35', 'stop-color': '#FFC2AF', 'stop-opacity': '0.85' }));
    sg.appendChild(svgEl('stop', { offset: '1', 'stop-color': '#FF6B4A', 'stop-opacity': '0' }));
    defs.appendChild(sg);
    stage.insertBefore(svg, stage.firstChild);

    var lines = cards.map(function (card, i) {
      var gid = uid + '-g' + i;
      var lg = svgEl('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse' });
      lg.appendChild(svgEl('stop', { offset: '0', 'stop-color': '#B7A4FF' }));
      lg.appendChild(svgEl('stop', { offset: '1', 'stop-color': '#FF8A6B' }));
      defs.appendChild(lg);
      var glow = svgEl('path', { stroke: 'url(#' + gid + ')', 'stroke-width': '9', 'stroke-opacity': '0.28' });
      var core = svgEl('path', { stroke: 'url(#' + gid + ')', 'stroke-width': '2.6' });
      var end = svgEl('circle', { r: '4.5', fill: '#FFFFFF', opacity: '0' });
      var halo = svgEl('circle', { r: '14', fill: 'url(#' + uid + '-sp)', opacity: '0' });
      var spark = svgEl('circle', { r: '3.4', fill: '#FFFFFF', opacity: '0' });
      svg.appendChild(glow); svg.appendChild(core); svg.appendChild(end); svg.appendChild(halo); svg.appendChild(spark);
      return { card: card, av: card.querySelector('.ccfx-av'), lg: lg, glow: glow, core: core, end: end, halo: halo, spark: spark,
        len: 0, p: -1, arrived: false };
    });

    function layoutLines() {
      if (!lines.length) return;
      var mo = offsetIn(meAv, stage);
      var mr = meAv.offsetWidth / 2;
      var mcx = mo.x + mr, mcy = mo.y + mr;
      var nameEl = root.querySelector('.ccfx-reveal__mename');
      var nameBottom = nameEl ? offsetIn(nameEl, stage).y + nameEl.offsetHeight : mcy + mr;
      lines.forEach(function (L, i) {
        var o = offsetIn(L.av, stage);
        var r = L.av.offsetWidth / 2;
        var cx = o.x + r, cy = o.y + r;
        var d, x0, y0, x1, y1;
        if (wide) {
          x0 = mcx; y0 = Math.max(mcy + mr + 12, nameBottom + 10);
          x1 = cx; y1 = cy - r - 10;
          var my = y0 + (y1 - y0) * 0.5;
          d = 'M' + x0 + ' ' + y0 + ' C' + x0 + ' ' + my + ' ' + x1 + ' ' + my + ' ' + x1 + ' ' + y1;
        } else {
          x0 = mcx - mr - 12; y0 = mcy;
          x1 = cx - r - 8; y1 = cy;
          var xo = Math.max(3, x1 - 15 - i * 8);
          var R = Math.min(34, Math.abs(y1 - y0) / 3);
          d = 'M' + x0 + ' ' + y0 + ' C' + (xo + (x0 - xo) * 0.35) + ' ' + y0 + ' ' + xo + ' ' + y0 + ' ' + xo + ' ' + (y0 + R) +
            ' L' + xo + ' ' + (y1 - R) + ' Q' + xo + ' ' + y1 + ' ' + x1 + ' ' + y1;
        }
        L.lg.setAttribute('x1', x0); L.lg.setAttribute('y1', y0);
        L.lg.setAttribute('x2', x1); L.lg.setAttribute('y2', y1);
        L.core.setAttribute('d', d);
        L.glow.setAttribute('d', d);
        L.end.setAttribute('cx', x1); L.end.setAttribute('cy', y1);
        var len = 0;
        try { len = L.core.getTotalLength(); } catch (e) { len = 0; }
        L.len = len || 1;
        if (rm || L.p >= 1) {
          L.core.style.strokeDasharray = 'none';
          L.glow.style.strokeDasharray = 'none';
        } else {
          L.core.style.strokeDasharray = L.len + ' ' + L.len;
          L.glow.style.strokeDasharray = L.len + ' ' + L.len;
          var e = easeInOutCubic(Math.max(0, L.p));
          L.core.style.strokeDashoffset = L.len * (1 - e);
          L.glow.style.strokeDashoffset = L.len * (1 - e);
        }
      });
    }
    layoutLines();

    /* --- calendrier --- */
    var TL = { me: 380, first: 1000, gap: 720, line: 620, btn: 260 };
    function lineStart(i) { return TL.first + i * TL.gap; }
    var END = lines.length ? lineStart(lines.length - 1) + TL.line + 250 : 900;
    var T0 = now();
    var anims = [];
    var closed = false, skipped = false, done = false, rafId = 0, last = T0;
    var EASE = 'cubic-bezier(.2,.75,.2,1)';
    var SPRING = 'cubic-bezier(.2,.9,.3,1.05)';

    function anim(el, kf, o) {
      if (!el || !el.animate) return null;
      try {
        o.fill = o.fill || 'backwards';
        var a = el.animate(kf, o);
        anims.push(a);
        return a;
      } catch (e) { return null; }
    }

    if (!rm) {
      anim(root, [{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
      [].slice.call(root.querySelectorAll('.ccfx-w')).forEach(function (wd, i) {
        anim(wd, [
          { opacity: 0, transform: 'translateY(.5em) scale(.94)', filter: 'blur(8px)' },
          { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0px)' }
        ], { duration: 640, delay: 120 + i * 85, easing: EASE });
      });
      anim(root.querySelector('.ccfx-reveal__sub'), [
        { opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 520, delay: 560, easing: EASE });
      anim(meWrap, [
        { opacity: 0, transform: 'scale(.3)' },
        { opacity: 1, transform: 'scale(1.1)', offset: 0.6 },
        { opacity: 1, transform: 'scale(1)' }
      ], { duration: 780, delay: TL.me, easing: SPRING });
      anim(root.querySelector('.ccfx-reveal__mename'), [
        { opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 420, delay: TL.me + 380, easing: EASE });
      lines.forEach(function (L, i) {
        var s = lineStart(i);
        anim(L.card, [
          { opacity: 0, transform: wide ? 'translateY(28px) scale(.97)' : 'translateX(26px)' },
          { opacity: 1, transform: wide ? 'translateY(0) scale(1)' : 'translateX(0)' }
        ], { duration: 560, delay: s + TL.line - 260, easing: EASE });
        anim(L.card.querySelector('.ccfx-reveal__avw'), [
          { opacity: 0, transform: 'scale(.2)' },
          { opacity: 1, transform: 'scale(1.18)', offset: 0.55 },
          { opacity: 1, transform: 'scale(1)' }
        ], { duration: 680, delay: s + TL.line - 90, easing: SPRING });
        [].slice.call(L.card.querySelectorAll('.ccfx-reveal__reason')).forEach(function (li, k) {
          anim(li, [
            { opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }
          ], { duration: 440, delay: s + TL.line + 60 + k * 120, easing: EASE });
        });
      });
      var empty = root.querySelector('.ccfx-reveal__empty');
      if (empty) anim(empty, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 800 });
      anim(root.querySelector('.ccfx-reveal__cta'), [
        { opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 460, delay: TL.btn, easing: EASE });
    } else {
      root.classList.add('is-done');
      lines.forEach(function (L) { L.p = 1; L.arrived = true; L.end.setAttribute('opacity', '1'); });
    }

    /* --- particules (étoiles + éclats) --- */
    var pc = cvs.getContext && cvs.getContext('2d');
    var pw = 0, ph = 0, pd = 1;
    var stars = [], parts = [], rings = [];
    function sizeFx() {
      pd = getDpr();
      pw = W.innerWidth || 390;
      ph = W.innerHeight || 844;
      cvs.width = Math.round(pw * pd);
      cvs.height = Math.round(ph * pd);
    }
    var nStars = wide ? 90 : 48;
    for (var si = 0; si < nStars; si++) {
      stars.push({ x: Math.random(), y: Math.random(), r: 0.5 + Math.random() * 1.3, s: 0.6 + Math.random() * 1.8,
        p: Math.random() * TAU, v: 0.004 + Math.random() * 0.012 });
    }
    var PCOL = ['#FFFFFF', '#CDBFFF', '#FF9A7E', '#FFD27A', '#FF86B6'];
    function burst(x, y, n, speed) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * TAU, v = speed * (0.35 + Math.random() * 0.65);
        parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 0.6 + Math.random() * 0.6,
          r: 1.2 + Math.random() * 2, c: PCOL[(Math.random() * PCOL.length) | 0] });
      }
    }
    function centerOf(el) {
      var r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    function drawFx(dt, t) {
      if (!pc) return;
      pc.setTransform(pd, 0, 0, pd, 0, 0);
      pc.clearRect(0, 0, pw, ph);
      pc.globalCompositeOperation = 'lighter';
      pc.fillStyle = '#FFFFFF';
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        s.y -= s.v * dt;
        if (s.y < -0.02) { s.y = 1.02; s.x = Math.random(); }
        pc.globalAlpha = 0.12 + 0.5 * (0.5 + 0.5 * Math.sin(t / 1000 * s.s + s.p));
        pc.beginPath();
        pc.arc(s.x * pw, s.y * ph, s.r, 0, TAU);
        pc.fill();
      }
      for (var j = parts.length - 1; j >= 0; j--) {
        var p = parts[j];
        p.age += dt;
        if (p.age >= p.life) { parts.splice(j, 1); continue; }
        var k = Math.pow(0.9, dt * 60);
        p.vx *= k; p.vy = p.vy * k + 60 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        var a = Math.pow(1 - p.age / p.life, 1.2);
        pc.fillStyle = p.c;
        pc.globalAlpha = a * 0.25;
        pc.beginPath(); pc.arc(p.x, p.y, p.r * 3, 0, TAU); pc.fill();
        pc.globalAlpha = a;
        pc.beginPath(); pc.arc(p.x, p.y, p.r, 0, TAU); pc.fill();
      }
      for (var q = rings.length - 1; q >= 0; q--) {
        var rg = rings[q];
        var rp = (t - rg.t) / 1100;
        if (rp >= 1) { rings.splice(q, 1); continue; }
        pc.globalAlpha = (1 - rp) * 0.55;
        pc.strokeStyle = '#D9CCFF';
        pc.lineWidth = 2 + 3 * (1 - rp);
        pc.beginPath();
        pc.arc(rg.x, rg.y, rg.r0 + easeOutCubic(rp) * (wide ? 340 : 220), 0, TAU);
        pc.stroke();
      }
      pc.globalAlpha = 1;
      pc.globalCompositeOperation = 'source-over';
    }

    function updateLines(t) {
      for (var i = 0; i < lines.length; i++) {
        var L = lines[i];
        var p = skipped ? 1 : clamp((t - lineStart(i)) / TL.line, 0, 1);
        if (p === L.p) continue;
        L.p = p;
        var e = easeInOutCubic(p);
        var off = L.len * (1 - e);
        L.core.style.strokeDashoffset = off;
        L.glow.style.strokeDashoffset = off;
        if (p > 0 && p < 1) {
          var pt = null;
          try { pt = L.core.getPointAtLength(L.len * e); } catch (err) { pt = null; }
          if (pt) {
            var o = Math.sin(p * Math.PI) * 0.6 + 0.4;
            L.spark.setAttribute('cx', pt.x); L.spark.setAttribute('cy', pt.y);
            L.halo.setAttribute('cx', pt.x); L.halo.setAttribute('cy', pt.y);
            L.spark.setAttribute('opacity', o);
            L.halo.setAttribute('opacity', o);
          }
        } else {
          L.spark.setAttribute('opacity', '0');
          L.halo.setAttribute('opacity', '0');
        }
        if (p >= 1 && !L.arrived) {
          L.arrived = true;
          L.end.setAttribute('opacity', '1');
          L.core.style.strokeDasharray = 'none';
          L.glow.style.strokeDasharray = 'none';
          if (!skipped) { var c = centerOf(L.av); burst(c.x, c.y, wide ? 34 : 24, wide ? 300 : 220); }
        }
      }
    }

    function tick() {
      rafId = 0;
      if (closed) return;
      var tn = now();
      var dt = Math.min(0.05, Math.max(0, (tn - last) / 1000));
      last = tn;
      var t = skipped ? 1e9 : tn - T0;
      updateLines(t);
      if (!done && t >= END) {
        done = true;
        root.classList.add('is-done');
        if (!skipped) {
          var c = centerOf(meAv);
          rings.push({ x: c.x, y: c.y, r0: meAv.offsetWidth / 2, t: tn });
          burst(c.x, c.y, wide ? 46 : 30, wide ? 380 : 260);
        }
      }
      drawFx(dt, tn);
      if (!doc.hidden) rafId = raf(tick);
    }

    function skip() {
      if (skipped || done || rm) return;
      skipped = true;
      anims.forEach(function (a) { try { a.finish(); } catch (e) { /* rien */ } });
    }

    function onResize() {
      layoutLines();
      if (!rm) sizeFx();
    }
    function onVis() {
      if (!doc.hidden && !rafId && !closed && !rm) { last = now(); rafId = raf(tick); }
    }
    function onKey(e) {
      if (closed) return;
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        e.stopPropagation();
        close(false);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        btn.focus();
      }
    }

    function close(silent) {
      if (closed) return;
      closed = true;
      if (rafId) caf(rafId);
      rafId = 0;
      doc.removeEventListener('keydown', onKey, true);
      doc.removeEventListener('visibilitychange', onVis);
      W.removeEventListener('resize', onResize);
      html.style.overflow = prevOverflow;
      root.__ccfxClose = null;
      root.style.pointerEvents = 'none';
      root.setAttribute('aria-hidden', 'true');
      var removed = false;
      function remove() {
        if (removed) return;
        removed = true;
        if (root.parentNode) root.parentNode.removeChild(root);
      }
      if (!rm && !silent && root.animate) {
        try {
          var out = root.animate([
            { opacity: 1, transform: 'scale(1)' },
            { opacity: 0, transform: 'scale(1.04)' }
          ], { duration: 300, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
          out.onfinish = remove;
        } catch (e) { remove(); }
        setTimeout(remove, 650);
      } else {
        remove();
      }
      /* L'overlay ne capte plus rien : on enchaîne tout de suite (aucune attente). */
      if (!silent && typeof onDone === 'function') {
        try { onDone(); } catch (err) { if (W.console) console.error(err); }
      }
    }
    root.__ccfxClose = close;

    /* inclinaison 3D légère des cartes sous la souris (desktop) */
    function onTilt(e) {
      if (e.pointerType !== 'mouse' || rm) return;
      var card = e.currentTarget, r = card.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      card.style.transform = 'perspective(900px) rotateX(' + ((0.5 - py) * 7).toFixed(2) + 'deg) rotateY(' + ((px - 0.5) * 9).toFixed(2) + 'deg)';
      card.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
      card.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
      card.style.setProperty('--glare', '1');
    }
    function onTiltOut(e) {
      var card = e.currentTarget;
      card.style.transform = '';
      card.style.setProperty('--glare', '0');
    }
    cards.forEach(function (card) {
      card.style.transition = 'transform .18s ease-out';
      card.addEventListener('pointermove', onTilt);
      card.addEventListener('pointerleave', onTiltOut);
    });

    /* Le 2e clic d'un double-clic sur « Créer mon profil » tombe sur l'overlay qui vient de s'ouvrir :
     * on l'ignore (ni « passer », ni « C'est parti »), sinon le moment fort disparaît. */
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (e.detail > 1 || now() - T0 < 450) return;
      close(false);
    });
    root.addEventListener('click', function (e) {
      if (btn.contains(e.target) || e.detail > 1 || now() - T0 < 700) return;
      skip();
    });
    doc.addEventListener('keydown', onKey, true);
    doc.addEventListener('visibilitychange', onVis);
    W.addEventListener('resize', onResize);

    try { btn.focus({ preventScroll: true }); } catch (e) { try { btn.focus(); } catch (e2) { /* rien */ } }

    if (!rm) {
      sizeFx();
      rafId = raf(tick);
    }

    return { close: function () { close(false); } };
  }

  /* ------------------------------------------------------------------ */
  /* 3. Confettis                                                        */
  /* ------------------------------------------------------------------ */

  var CONF_COLORS = ['#5B3DF5', '#FF6B4A', '#E5539A', '#FFC23D', '#12B5A6', '#3B6FE0', '#9B7BFF', '#FF9466'];
  var CONF_SHAPES = ['rect', 'rect', 'strip', 'circle', 'tri', 'star', 'squiggle'];
  var confLayer = null;

  function makeConfettiLayer() {
    var c = doc.createElement('canvas');
    c.className = 'ccfx-confetti';
    c.setAttribute('aria-hidden', 'true');
    (doc.body || doc.documentElement).appendChild(c);
    var g = c.getContext('2d');
    var L = { c: c, g: g, ps: [], flashes: [], raf: 0, last: 0, w: 0, h: 0, dpr: 1 };
    function size() {
      L.dpr = getDpr();
      L.w = W.innerWidth || 800;
      L.h = W.innerHeight || 600;
      c.width = Math.round(L.w * L.dpr);
      c.height = Math.round(L.h * L.dpr);
    }
    size();
    W.addEventListener('resize', size);
    var safety = 0;
    function destroy() {
      if (L.raf) caf(L.raf);
      L.raf = 0;
      clearTimeout(safety);
      W.removeEventListener('resize', size);
      if (c.parentNode) c.parentNode.removeChild(c);
      if (confLayer === L) confLayer = null;
    }
    function star(gx, r) {
      gx.beginPath();
      for (var i = 0; i < 10; i++) {
        var rr = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + i * Math.PI / 5;
        if (i) gx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else gx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      gx.closePath();
      gx.fill();
    }
    function step() {
      L.raf = 0;
      var t = now();
      var dt = Math.min(0.034, Math.max(0, (t - L.last) / 1000));
      L.last = t;
      var dp = L.dpr;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, c.width, c.height);
      /* éclair au point de départ */
      for (var f = L.flashes.length - 1; f >= 0; f--) {
        var fl = L.flashes[f], fp = (t - fl.t) / 520;
        if (fp >= 1) { L.flashes.splice(f, 1); continue; }
        g.setTransform(dp, 0, 0, dp, 0, 0);
        var rr = 10 + easeOutCubic(fp) * 90;
        var gr = g.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, rr);
        gr.addColorStop(0, 'rgba(255,107,74,' + (0.35 * (1 - fp)) + ')');
        gr.addColorStop(1, 'rgba(255,107,74,0)');
        g.globalAlpha = 1;
        g.fillStyle = gr;
        g.beginPath(); g.arc(fl.x, fl.y, rr, 0, TAU); g.fill();
        g.globalAlpha = 1 - fp;
        g.strokeStyle = BRAND.violet;
        g.lineWidth = 3 * (1 - fp) + 0.5;
        g.beginPath(); g.arc(fl.x, fl.y, rr * 0.8, 0, TAU); g.stroke();
      }
      var G = 1250;
      for (var i = L.ps.length - 1; i >= 0; i--) {
        var p = L.ps[i];
        if (p.wait > 0) { p.wait -= dt; continue; }
        p.age += dt;
        var k = Math.pow(p.drag, dt * 60);
        p.vx *= k;
        p.vy = p.vy * k + G * dt;
        if (p.vy > p.term) p.vy += (p.term - p.vy) * Math.min(1, dt * 6);
        p.wob += p.vw * dt;
        p.x += (p.vx + Math.sin(p.wob) * p.wa * (p.vy > 0 ? 1 : 0.25)) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        p.tilt += p.vt * dt;
        if (p.age > p.life || p.y > L.h + 60 || p.x < -80 || p.x > L.w + 80) { L.ps.splice(i, 1); continue; }
        var a = p.age > p.life - 0.6 ? Math.max(0, (p.life - p.age) / 0.6) : 1;
        var flip = Math.cos(p.tilt);
        var cr = Math.cos(p.rot), sr = Math.sin(p.rot);
        g.setTransform(cr * dp, sr * dp, -sr * flip * dp, cr * flip * dp, p.x * dp, p.y * dp);
        g.globalAlpha = a;
        var col = flip >= 0 ? p.c1 : p.c2;
        g.fillStyle = col;
        var s = p.s;
        switch (p.shape) {
          case 'rect': g.fillRect(-s / 2, -s * 0.32, s, s * 0.64); break;
          case 'strip': g.fillRect(-s * 0.95, -s * 0.15, s * 1.9, s * 0.3); break;
          case 'circle': g.beginPath(); g.arc(0, 0, s * 0.42, 0, TAU); g.fill(); break;
          case 'tri':
            g.beginPath(); g.moveTo(0, -s * 0.55); g.lineTo(s * 0.5, s * 0.42); g.lineTo(-s * 0.5, s * 0.42); g.closePath(); g.fill();
            break;
          case 'star': star(g, s * 0.62); break;
          default:
            g.strokeStyle = col;
            g.lineWidth = s * 0.24;
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(-s * 0.8, 0);
            g.quadraticCurveTo(-s * 0.4, -s * 0.5, 0, 0);
            g.quadraticCurveTo(s * 0.4, s * 0.5, s * 0.8, 0);
            g.stroke();
        }
      }
      g.globalAlpha = 1;
      if (L.ps.length || L.flashes.length) {
        if (!doc.hidden) L.raf = raf(step);
        else { clearTimeout(safety); safety = setTimeout(destroy, 200); }
      } else {
        destroy();
      }
    }
    L.kick = function () {
      clearTimeout(safety);
      if (!L.raf) { L.last = now(); L.raf = raf(step); }
      /* filet de sécurité : jamais plus de 7 s à l'écran */
      safety = setTimeout(destroy, 7000);
    };
    return L;
  }

  function confetti(x, y, opts) {
    if (reduced()) return;
    try {
      injectStyle();
      if (x && typeof x === 'object' && x.getBoundingClientRect) {
        var r = x.getBoundingClientRect();
        opts = y;
        x = r.left + r.width / 2;
        y = r.top + r.height / 2;
      }
      var vw = W.innerWidth || 800, vh = W.innerHeight || 600;
      x = isFinite(+x) && x !== null ? +x : vw / 2;
      y = isFinite(+y) && y !== null ? +y : vh / 2;
      var small = Math.min(vw, vh) < 560;
      var n = (opts && opts.count) || (small ? 130 : 210);
      var power = clamp(Math.min(vw, vh * 1.2), 360, 1000);
      if (!confLayer) confLayer = makeConfettiLayer();
      var L = confLayer;
      if (L.ps.length > 450) L.ps.splice(0, L.ps.length - 450);
      var rain = (opts && opts.rain === false) ? 0 : (small ? 45 : 90);
      for (var i = 0; i < n + rain; i++) {
        var isRain = i >= n;
        var ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.25;
        var sp = power * 1.35 * (0.25 + Math.pow(Math.random(), 0.7) * 0.9);
        var col = CONF_COLORS[(Math.random() * CONF_COLORS.length) | 0];
        L.ps.push({
          x: isRain ? Math.random() * vw : x, y: isRain ? -20 - Math.random() * 60 : y,
          vx: isRain ? (Math.random() - 0.5) * 120 : Math.cos(ang) * sp,
          vy: isRain ? 60 + Math.random() * 140 : Math.sin(ang) * sp,
          wait: isRain ? 0.12 + Math.random() * 0.7 : 0,
          rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14,
          tilt: Math.random() * TAU, vt: 4 + Math.random() * 9,
          wob: Math.random() * TAU, vw: 2 + Math.random() * 4, wa: 25 + Math.random() * 50,
          s: (small ? 8 : 11.5) * (0.7 + Math.random() * 0.6),
          shape: CONF_SHAPES[(Math.random() * CONF_SHAPES.length) | 0],
          c1: col, c2: shade(col, -0.28),
          age: 0, life: 2.8 + Math.random() * 1.8, term: 70 + Math.random() * 110,
          drag: 0.972 - Math.random() * 0.012
        });
      }
      L.flashes.push({ x: x, y: y, t: now() });
      L.kick();
    } catch (e) { /* un effet raté ne doit jamais bloquer l'app */ }
  }

  /* ------------------------------------------------------------------ */
  /* Compteur animé                                                      */
  /* ------------------------------------------------------------------ */

  var nfCache = {};
  function fmt(v, dec) {
    try {
      if (!nfCache[dec]) nfCache[dec] = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      return nfCache[dec].format(v);
    } catch (e) {
      var s = (dec ? v.toFixed(dec) : String(Math.round(v))).replace('.', ',');
      return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }
  }
  function parseNum(s) {
    var n = parseFloat(String(s || '').replace(/[\s  ]/g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  function countUp(el, from, to, ms) {
    if (!el) return;
    from = (from === undefined || from === null || isNaN(+from)) ? parseNum(el.textContent) : +from;
    to = (to === undefined || to === null || isNaN(+to)) ? from : +to;
    ms = +ms > 0 ? +ms : 1200;
    var dec = (Math.round(to) !== to || Math.round(from) !== from) ? 1 : 0;
    if (el.__ccfxCount) { el.__ccfxCount.cancel(); el.__ccfxCount = null; }
    if (reduced() || from === to) {
      el.textContent = fmt(to, dec);
      return;
    }
    try { el.style.fontVariantNumeric = 'tabular-nums'; } catch (e) { /* rien */ }
    var t0 = now(), id = 0, finished = false, timer = 0;
    function finish() {
      if (finished) return;
      finished = true;
      if (id) caf(id);
      clearTimeout(timer);
      el.textContent = fmt(to, dec);
      if (el.__ccfxCount === handle) el.__ccfxCount = null;
      try {
        if (el.animate && getComputedStyle(el).display !== 'inline') {
          el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }],
            { duration: 280, easing: 'ease-out' });
        }
      } catch (e) { /* rien */ }
    }
    function step() {
      id = 0;
      if (finished) return;
      var p = Math.min(1, (now() - t0) / ms);
      var v = from + (to - from) * easeOutQuart(p);
      el.textContent = fmt(dec ? Math.round(v * 10) / 10 : Math.round(v), dec);
      if (p >= 1) finish();
      else id = raf(step);
    }
    var handle = {
      cancel: function () { finished = true; if (id) caf(id); clearTimeout(timer); }
    };
    el.__ccfxCount = handle;
    el.textContent = fmt(from, dec);
    id = raf(step);
    /* si l'onglet est en arrière-plan, la valeur finale arrive quand même */
    timer = setTimeout(finish, ms + 400);
  }

  /* ------------------------------------------------------------------ */
  /* 4. Réseau du campus (graphe à forces)                               */
  /* ------------------------------------------------------------------ */

  function campusGraph(canvas, opts) {
    opts = opts || {};
    var api = {
      stop: noop, pulse: function () { return false; }, add: function () { return false; },
      link: function () { return false; }, spot: function () { return false; },
      sync: function () { return []; }, setInset: noop, has: function () { return false; },
      size: function () { return 0; }
    };
    if (!canvas || typeof canvas.getContext !== 'function') return api;
    if (canvas.__ccfx && canvas.__ccfx.stop) canvas.__ccfx.stop();
    var ctx = canvas.getContext('2d');
    if (!ctx) return api;
    injectStyle();

    var D = CC.data || {};
    var rm = reduced();
    /* Options du mode « mur de projection » (toutes facultatives, défauts = page Impact) */
    var dark = opts.theme === 'dark';
    var SC = clamp(+opts.scale || 1, 0.6, 3);
    var maxDpr = +opts.maxDpr > 0 ? +opts.maxDpr : 2;
    var paintBg = opts.background !== false;
    var onLand = typeof opts.onLand === 'function' ? opts.onLand : null;
    /* clip:true : tout reste dans la zone utile (inset + pad), sauf les arrivées en vol */
    var clipStage = !!opts.clip;
    /* labelFilter(person, nbNœuds) → false : pas de prénom sous ce nœud (réseau très chargé) */
    var labelFilter = typeof opts.labelFilter === 'function' ? opts.labelFilter : null;
    /* labelScale(person) → facteur de taille du prénom (mur : prénoms des vrais inscrits plus grands) */
    var labelScale = typeof opts.labelScale === 'function' ? opts.labelScale : null;
    /* flyScale:true : la comète d'arrivée grossit en vol (×2,8 au milieu), porte son prénom,
     * et sa traînée dure 450 ms quel que soit l'écran (60 ou 120 Hz) */
    var bigFly = !!opts.flyScale;
    /* maxSpots : nombre maximum d'étiquettes d'arrivée à l'écran (les plus anciennes s'effacent) */
    var maxSpots = +opts.maxSpots > 0 ? +opts.maxSpots : 0;
    var people = toArr(opts.people || D.people);
    var cats = toArr(opts.categories || D.categories);
    var conns = toArr(opts.connections || D.connections);
    var meId = opts.meId != null ? opts.meId : null;
    var customExch = Array.isArray(opts.exchanges);
    var autoExch = opts.exchanges !== false && !customExch;
    var inset = { left: 0, top: 0, right: 0, bottom: 0, pad: 0 };
    var pInfo = {};
    toArr(D.passions).forEach(function (p) { if (p && p.id) pInfo[p.id] = p; });
    var cMap = {};
    cats.forEach(function (c) { if (c && c.id) cMap[c.id] = c; });

    function dominant(p) {
      var score = {}, order = [], teach = toArr(p.teach);
      toArr(p.passions).forEach(function (x) {
        var id = typeof x === 'string' ? x : (x && x.id);
        var info = pInfo[id];
        if (!info) return;
        var s = ((x && +x.level) || 1) + (teach.indexOf(id) >= 0 ? 1.5 : 0);
        if (!(info.cat in score)) { score[info.cat] = 0; order.push(info.cat); }
        score[info.cat] += s;
      });
      var best = null;
      order.forEach(function (c) { if (best === null || score[c] > score[best]) best = c; });
      return best;
    }

    var nodes = [], byId = {};
    function makeNode(p) {
      var cat = dominant(p);
      return {
        id: p.id, p: p, cat: cat, color: (cMap[cat] && cMap[cat].color) || '#8F8AAE',
        deg: 0, nb: [], x: 0, y: 0, vx: 0, vy: 0, ph: Math.random() * TAU,
        me: p.id === meId, hs: 1, sx: 0, sy: 0, sr: 0, fixed: false, ia: 0, xn: 0, arr: null, late: false
      };
    }
    people.forEach(function (p) {
      if (!p || p.id == null || byId[p.id]) return;
      var n = makeNode(p);
      nodes.push(n);
      byId[p.id] = n;
    });

    function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
    function ends(c) {
      var a, b;
      if (Array.isArray(c)) { a = c[0]; b = c[1]; }
      else if (c && typeof c === 'object') { a = c.a || c.from || c.source; b = c.b || c.to || c.target; }
      if (a == null || b == null || a === b) return null;
      return [a, b];
    }

    var edges = [], seenE = {};
    var exch = [], seenX = {};
    /* lien « connexion » (trait plein) ; born > 0 : il se dessine progressivement */
    function addEdge(a, b, born) {
      if (!a || !b || a === b) return null;
      var key = pairKey(a.id, b.id);
      if (seenE[key]) return null;
      seenE[key] = 1;
      if (seenX[key]) {
        exch = exch.filter(function (x) { return pairKey(x.a.id, x.b.id) !== key; });
        delete seenX[key];
      }
      var e = { a: a, b: b, ph: Math.random(), born: born || 0 };
      edges.push(e);
      a.deg++; b.deg++;
      a.nb.push(b); b.nb.push(a);
      return e;
    }
    /* lien doux (pointillés : échange de talents possible, ou affinité sur le mur) */
    function addExch(a, b, born) {
      if (!a || !b || a === b) return null;
      var key = pairKey(a.id, b.id);
      if (seenE[key] || seenX[key]) return null;
      seenX[key] = 1;
      var x = { a: a, b: b, born: born || 0 };
      exch.push(x);
      a.xn++; b.xn++;
      return x;
    }
    conns.forEach(function (c) {
      var ab = ends(c);
      if (ab) addEdge(byId[ab[0]], byId[ab[1]]);
    });
    function isNear(f, n) {
      if (f.nb.indexOf(n) >= 0) return true;
      for (var i = 0; i < exch.length; i++) {
        if ((exch[i].a === f && exch[i].b === n) || (exch[i].b === f && exch[i].a === n)) return true;
      }
      return false;
    }

    /* échanges de talents possibles (A transmet ce que B veut apprendre) : pointillés discrets */
    function exchOk(na, nb2) {
      var ta = toArr(na.p.teach), la2 = toArr(na.p.learn), tb = toArr(nb2.p.teach), lb = toArr(nb2.p.learn);
      return ta.some(function (id) { return lb.indexOf(id) >= 0; }) || tb.some(function (id) { return la2.indexOf(id) >= 0; });
    }
    if (autoExch) {
      for (var xi = 0; xi < nodes.length; xi++) {
        for (var xj = xi + 1; xj < nodes.length; xj++) {
          if (exchOk(nodes[xi], nodes[xj])) addExch(nodes[xi], nodes[xj]);
        }
      }
    } else if (customExch) {
      opts.exchanges.forEach(function (c) {
        var ab = ends(c);
        if (ab) addExch(byId[ab[0]], byId[ab[1]]);
      });
    }

    /* ressorts doux entre personnes de même catégorie : les couleurs se regroupent */
    var clusters = [];
    for (var ci = 0; ci < nodes.length; ci++) {
      for (var cj = ci + 1; cj < nodes.length; cj++) {
        if (nodes[ci].cat && nodes[ci].cat === nodes[cj].cat) clusters.push([nodes[ci], nodes[cj]]);
      }
    }

    /* positions de départ : spirale compacte (le graphe se déplie ensuite).
     * « Toi » part du centre de la spirale : sinon, dernier arrivé, il finit collé au bord. */
    var GA = Math.PI * (3 - Math.sqrt(5));
    nodes.slice().sort(function (a, b) { return (b.me ? 1 : 0) - (a.me ? 1 : 0); }).forEach(function (n, i) {
      var r = 9 * Math.sqrt(0.5 + i), a = i * GA;
      n.x = r * Math.cos(a);
      n.y = r * Math.sin(a);
    });

    if (!canvas.getAttribute('role')) canvas.setAttribute('role', 'img');
    if (!canvas.getAttribute('aria-label')) {
      canvas.setAttribute('aria-label', 'Réseau du campus : ' + nodes.length + ' personnes, ' + edges.length + ' connexions');
    }

    var w = 0, h = 0, dpr = 1, small = false, ownH = false, checked = false;
    var alpha = 1, alphaTarget = 0;
    var K = { L: 50, rep: 300, link: 0.5, cl: 0.012, clL: 90, gx: 0.05, gy: 0.05 };
    var cam = { s: 1, x: 0, y: 0, ready: false };
    var hover = null, sel = null, drag = null, pointerIn = false;
    var tip = { a: 0, n: null };
    var pulses = [], flows = [], beams = [], bursts = [], spots = [];
    var glows = {};
    var rafId = 0, stopped = false, born = now(), start = 0, last = 0, wasConnected = false, visible = true, dirty = true;
    /* L'intro (dépliage + pulsations) attend que le graphe soit vraiment à l'écran :
     * sinon elle se joue sous la ligne de flottaison et personne ne la voit. */
    var seen = rm || !W.IntersectionObserver || opts.waitVisible === false;
    var queued = [];

    function measure() {
      return { w: canvas.clientWidth || 0, h: canvas.clientHeight || 0 };
    }
    /* zone utile (hors panneaux posés par-dessus le canvas) */
    function avail() {
      return { w: Math.max(60, w - inset.left - inset.right), h: Math.max(60, h - inset.top - inset.bottom) };
    }
    function center() {
      var av = avail();
      return { x: inset.left + av.w / 2, y: inset.top + av.h / 2 };
    }

    /* au-delà de 40 personnes, les pastilles rétrécissent un peu pour que le réseau respire */
    function density() { return clamp(Math.sqrt(40 / Math.max(1, nodes.length)), 0.7, 1); }
    function radiusFor(n) {
      var base = small ? 10 : 12.5;
      var r = base + Math.min(small ? 8 : 11, Math.pow(n.deg, 0.85) * (small ? 2.6 : 3.4));
      if (n.me) r += small ? 4 : 5;
      return r * SC * density();
    }

    /* constantes adaptées à la taille : le graphe remplit le cadre à l'échelle ~1 */
    function constants() {
      if (!w) return;
      var N = Math.max(1, nodes.length);
      var av = avail();
      var aw = Math.max(30, av.w / 2 - (small ? 26 : 40)), ah = Math.max(30, av.h / 2 - (small ? 26 : 34));
      var unit = Math.sqrt((aw * ah * 4) / N);
      if (N > 40) for (var ri = 0; ri < nodes.length; ri++) nodes[ri].r = radiusFor(nodes[ri]);
      K.L = clamp(unit * 0.62, 34 * SC * density(), 92 * SC);
      K.clL = K.L * 1.5;
      K.rep = unit * unit * 0.32;
      K.gx = 0.05;
      K.gy = 0.05 * clamp(Math.pow(aw / Math.max(40, ah), 1.7), 0.4, 9);
    }

    function resize() {
      var m = measure();
      if (!checked && m.w >= 2) {
        checked = true;
        if (opts.autoSize !== false) {
          var intr = intrinsicSize(canvas);
          if (intr.w) canvas.style.width = '100%';
          if (intr.h) ownH = true;
          if (intr.w || intr.h) { canvas.style.display = 'block'; m = measure(); }
        }
      }
      if (ownH) {
        var cw = canvas.clientWidth || m.w;
        var want = Math.round(clamp(cw * 0.62, 280, 460));
        if (Math.abs((canvas.clientHeight || 0) - want) > 1) canvas.style.height = want + 'px';
        m = measure();
      }
      if (m.w < 2 || m.h < 2) return false;
      var nd = Math.min(getDpr(), maxDpr);
      if (m.w === w && m.h === h && nd === dpr) return true;
      var first = !w;
      w = m.w; h = m.h;
      if (nd !== dpr) glows = {};
      dpr = nd;
      small = w < 560;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      for (var i = 0; i < nodes.length; i++) nodes[i].r = radiusFor(nodes[i]);
      constants();
      if (!first) alpha = Math.max(alpha, 0.25);
      if (first && seen) start = now();
      return true;
    }

    function tick() {
      var a = alpha;
      var i, j, n, m, dx, dy, d2, d, f;
      var MAX2 = Math.pow(K.L * 6, 2);
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        for (j = i + 1; j < nodes.length; j++) {
          m = nodes[j];
          dx = m.x - n.x; dy = m.y - n.y;
          d2 = dx * dx + dy * dy;
          if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = dx * dx + dy * dy; }
          if (d2 < MAX2) {
            f = K.rep * a / d2;
            n.vx -= dx * f; n.vy -= dy * f;
            m.vx += dx * f; m.vy += dy * f;
          }
          var minD = (n.r + m.r + (n.me || m.me ? (small ? 26 : 30) : (small ? 10 : 14)) * SC) / Math.max(0.5, cam.s);
          if (d2 < minD * minD) {
            d = Math.sqrt(d2);
            var push = (minD - d) / d * 0.35;
            if (!n.fixed) { n.x -= dx * push; n.y -= dy * push; }
            if (!m.fixed) { m.x += dx * push; m.y += dy * push; }
          }
        }
      }
      for (i = 0; i < edges.length; i++) {
        var e = edges[i];
        dx = e.b.x - e.a.x; dy = e.b.y - e.a.y;
        d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        f = (d - K.L) / d * a * K.link * 0.5;
        e.a.vx += dx * f; e.a.vy += dy * f;
        e.b.vx -= dx * f; e.b.vy -= dy * f;
      }
      for (i = 0; i < exch.length; i++) {
        var x = exch[i];
        dx = x.b.x - x.a.x; dy = x.b.y - x.a.y;
        d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        f = (d - K.L * 1.7) / d * a * K.link * 0.09;
        x.a.vx += dx * f; x.a.vy += dy * f;
        x.b.vx -= dx * f; x.b.vy -= dy * f;
      }
      for (i = 0; i < clusters.length; i++) {
        var c = clusters[i];
        dx = c[1].x - c[0].x; dy = c[1].y - c[0].y;
        d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        if (d < K.clL) continue;
        f = (d - K.clL) / d * a * K.cl * 0.5;
        c[0].vx += dx * f; c[0].vy += dy * f;
        c[1].vx -= dx * f; c[1].vy -= dy * f;
      }
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        var gm = n.me ? 3.2 : 1; /* « Toi » reste près du centre, bien en vue */
        n.vx -= n.x * K.gx * a * gm;
        n.vy -= n.y * K.gy * a * gm;
        n.vx *= 0.6; n.vy *= 0.6;
        if (n.fixed) { n.vx = n.vy = 0; continue; }
        n.x += n.vx; n.y += n.vy;
      }
      alpha += (alphaTarget - alpha) * 0.022;
      if (alpha < 0.004 && alphaTarget === 0) alpha = 0;
    }

    /* Cadrage : boîte des centres des nœuds (monde), marges en pixels écran
     * (rayon dessiné, prénom sous le nœud, pastille « Toi », légende). */
    function fitTarget() {
      if (!nodes.length) return { s: 1, x: 0, y: 0 };
      var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, maxR = 0;
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
        var rr = (n.r || 12) * 1.15 + (n.me ? 8 : 3);
        if (rr > maxR) maxR = rr;
      }
      var padX = maxR + (small ? 14 : 26) * SC;
      var padTop = maxR + (small ? 8 : 12) * SC;
      var padBot = maxR + (small ? 30 : 34) * SC;
      if (showLegend()) padBot += small ? 18 : 22;
      var av = avail();
      var bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
      var s = Math.min((av.w - padX * 2) / bw, (av.h - padTop - padBot) / bh);
      s = clamp(s, 0.4, 1.5);
      /* centre du contenu placé au milieu de la zone utile [padTop, h - padBot] */
      return { s: s, x: (minX + maxX) / 2, y: (minY + maxY) / 2 + (padBot - padTop) / (2 * s) };
    }
    function showLegend() { return opts.legend !== false && exch.length && w >= 300; }

    function toScreen(x, y) {
      var c = center();
      return { x: (x - cam.x) * cam.s + c.x, y: (y - cam.y) * cam.s + c.y };
    }
    function toWorld(x, y) {
      var c = center();
      return { x: (x - c.x) / cam.s + cam.x, y: (y - c.y) / cam.s + cam.y };
    }

    function glowFor(color) {
      if (glows[color]) return glows[color];
      var size = 96, px = Math.ceil(size * dpr);
      var c = doc.createElement('canvas');
      c.width = c.height = px;
      var g = c.getContext('2d');
      var r = px / 2;
      var gr = g.createRadialGradient(r, r, 0, r, r, r);
      gr.addColorStop(0, rgba(color, 0.55));
      gr.addColorStop(0.4, rgba(color, 0.2));
      gr.addColorStop(1, rgba(color, 0));
      g.fillStyle = gr;
      g.fillRect(0, 0, px, px);
      glows[color] = c;
      return c;
    }

    function metaOf(p) {
      if (p.role === 'prof') return 'Prof' + (p.program ? ' · ' + p.program : '');
      return (p.program || '') + (p.team ? (p.program ? ' · ' : '') + 'Équipe projet' : '');
    }
    function passionsOf(p) {
      return toArr(p.passions).map(function (x) {
        var id = typeof x === 'string' ? x : (x && x.id);
        var info = pInfo[id];
        return info ? info.emoji + ' ' + info.label : '';
      }).filter(Boolean).slice(0, 5);
    }
    function emojisOf(p, max) {
      return toArr(p.passions).map(function (x) {
        var id = typeof x === 'string' ? x : (x && x.id);
        return pInfo[id] ? pInfo[id].emoji : '';
      }).filter(Boolean).slice(0, max || 4).join(' ');
    }

    function roundRect(x, y, rw, rh, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + rw - r, y);
      ctx.quadraticCurveTo(x + rw, y, x + rw, y + r);
      ctx.lineTo(x + rw, y + rh - r);
      ctx.quadraticCurveTo(x + rw, y + rh, x + rw - r, y + rh);
      ctx.lineTo(x + r, y + rh);
      ctx.quadraticCurveTo(x, y + rh, x, y + rh - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    function drawTooltip(n, a) {
      if (!n || a <= 0.01) return;
      var p = n.p;
      var pad = 12, maxW = Math.min(280, w - 24);
      var title = fullName(p) || '?';
      var meta = metaOf(p);
      var items = passionsOf(p);
      ctx.font = '700 15px ' + UI_FONT;
      var tw = ctx.measureText(title).width + 18;
      ctx.font = '500 12.5px ' + UI_FONT;
      var mw = meta ? ctx.measureText(meta).width : 0;
      /* passions sur une ou plusieurs lignes */
      ctx.font = '500 13px ' + UI_FONT;
      var linesP = [], cur = '';
      items.forEach(function (it) {
        var test = cur ? cur + '   ' + it : it;
        if (ctx.measureText(test).width > maxW - pad * 2 && cur) { linesP.push(cur); cur = it; }
        else cur = test;
      });
      if (cur) linesP.push(cur);
      var pw = 0;
      linesP.forEach(function (l) { pw = Math.max(pw, ctx.measureText(l).width); });
      var cw = Math.min(maxW, Math.max(tw, mw, pw) + pad * 2);
      var chh = pad + 18 + (meta ? 17 : 0) + (linesP.length ? 6 + linesP.length * 19 : 0) + pad - 2;
      var x = n.sx - cw / 2, y = n.sy - n.sr - 14 - chh;
      var below = false;
      if (y < 6) { y = n.sy + n.sr + 26; below = true; }
      x = clamp(x, 8, w - cw - 8);
      y = clamp(y, 4, Math.max(4, h - chh - 4));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(0, (1 - a) * (below ? -6 : 6));
      ctx.shadowColor = 'rgba(26,23,48,0.22)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = '#FFFFFF';
      roundRect(x, y, cw, chh, 14);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      /* petite flèche */
      var ax = clamp(n.sx, x + 18, x + cw - 18);
      ctx.beginPath();
      if (below) { ctx.moveTo(ax - 7, y + 0.5); ctx.lineTo(ax, y - 6); ctx.lineTo(ax + 7, y + 0.5); }
      else { ctx.moveTo(ax - 7, y + chh - 0.5); ctx.lineTo(ax, y + chh + 6); ctx.lineTo(ax + 7, y + chh - 0.5); }
      ctx.fill();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = n.color;
      ctx.beginPath();
      ctx.arc(x + pad + 5, y + pad + 9, 5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = BRAND.ink;
      ctx.font = '700 15px ' + UI_FONT;
      ctx.fillText(title, x + pad + 16, y + pad + 14);
      var yy = y + pad + 18;
      if (meta) {
        ctx.font = '500 12.5px ' + UI_FONT;
        ctx.fillStyle = '#6B6785';
        ctx.fillText(meta, x + pad, yy + 13);
        yy += 17;
      }
      if (linesP.length) {
        yy += 6;
        ctx.font = '500 13px ' + UI_FONT;
        ctx.fillStyle = '#2E2A48';
        linesP.forEach(function (l) { ctx.fillText(l, x + pad, yy + 14); yy += 19; });
      }
      ctx.restore();
    }

    /* Étiquette d'arrivée : prénom + emojis, au-dessus du nœud, quelques secondes. */
    var spotRects = [];
    function drawSpot(sp, t) {
      var n = sp.n;
      if (!n || n.arr) return;
      var age = t - sp.t;
      var a = clamp(age / 260, 0, 1) * clamp((sp.dur - age) / 600, 0, 1);
      if (a <= 0.01) return;
      var fsT = Math.round(16 * SC), fsS = Math.round(14 * SC);
      var padX = 12 * SC, padY = 8 * SC, gap = 3 * SC;
      ctx.font = '800 ' + fsT + 'px ' + UI_FONT;
      var tw = ctx.measureText(sp.title).width;
      var sw = 0;
      if (sp.sub) { ctx.font = '600 ' + fsS + 'px ' + UI_FONT + ', ' + EMOJI_FONT; sw = ctx.measureText(sp.sub).width; }
      var bw = Math.max(tw + 18 * SC, sw) + padX * 2;
      var bh = padY * 2 + fsT + (sp.sub ? gap + fsS + 2 : 0);
      var pop = easeOutBack(clamp(age / 420, 0, 1));
      var x0 = Math.max(6, inset.left - inset.pad), x1 = Math.min(w - 6, w - inset.right + inset.pad);
      var x = clamp(n.sx - bw / 2, x0, Math.max(x0, x1 - bw));
      var y = n.sy - n.sr - 12 * SC - bh;
      if (y < Math.max(6, inset.top - inset.pad)) y = n.sy + n.sr + 12 * SC;
      /* deux étiquettes au même endroit : la plus ancienne se décale (la récente reste sur son nœud) */
      for (var k = 0; k < spotRects.length; k++) {
        var o = spotRects[k];
        if (x < o.x + o.w && x + bw > o.x && y < o.y + o.h && y + bh > o.y) {
          var up = o.y - bh - 6 * SC;
          y = up >= Math.max(6, inset.top - inset.pad) ? up : o.y + o.h + 6 * SC;
        }
      }
      spotRects.push({ x: x, y: y, w: bw, h: bh });
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(n.sx, y + bh);
      ctx.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop);
      ctx.translate(-n.sx, -(y + bh));
      ctx.shadowColor = dark ? 'rgba(0,0,0,0.45)' : 'rgba(26,23,48,0.25)';
      ctx.shadowBlur = 22 * SC;
      ctx.shadowOffsetY = 6 * SC;
      ctx.fillStyle = '#FFFFFF';
      roundRect(x, y, bw, bh, Math.min(bh / 2, 18 * SC));
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = n.color;
      ctx.beginPath();
      ctx.arc(x + padX + 6 * SC, y + padY + fsT / 2 + 1, 6 * SC, 0, TAU);
      ctx.fill();
      ctx.fillStyle = BRAND.ink;
      ctx.font = '800 ' + fsT + 'px ' + UI_FONT;
      ctx.fillText(sp.title, x + padX + 18 * SC, y + padY);
      if (sp.sub) {
        ctx.font = '600 ' + fsS + 'px ' + UI_FONT + ', ' + EMOJI_FONT;
        ctx.fillStyle = '#45405F';
        ctx.fillText(sp.sub, x + padX, y + padY + fsT + gap);
      }
      ctx.restore();
    }

    /* Prénom porté par la comète pendant son vol (mur de projection). */
    function drawFlyName(n) {
      var ar = n.arr;
      if (!ar || n.sr <= 2) return;
      var lab = ar.title != null ? String(ar.title) : (n.p.firstName || '');
      if (!lab) return;
      var fs = Math.round(17 * SC);
      ctx.save();
      ctx.globalAlpha = clamp(n.sr / (n.r || 1) - 0.6, 0, 1);
      ctx.font = '800 ' + fs + 'px ' + UI_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4 * SC;
      ctx.strokeStyle = dark ? 'rgba(16,9,52,0.9)' : 'rgba(255,255,255,0.95)';
      var ly = n.sy + n.sr + 6 * SC;
      ctx.strokeText(lab, n.sx, ly);
      ctx.fillStyle = dark ? '#FFFFFF' : BRAND.ink;
      ctx.fillText(lab, n.sx, ly);
      ctx.restore();
    }

    /* Point de départ d'une arrivée sans origine donnée : un bord de la zone utile. */
    function edgePoint() {
      var av = avail(), side = Math.random();
      if (side < 0.5) return { x: side < 0.25 ? -20 : w + 20, y: inset.top + Math.random() * av.h };
      return { x: inset.left + Math.random() * av.w, y: side < 0.75 ? -20 : h + 20 };
    }

    /* Nouvelle étiquette ; au-delà de maxSpots, les plus anciennes s'effacent (fondu de 600 ms). */
    function pushSpot(sp) {
      spots.push(sp);
      if (!maxSpots) return;
      var live = spots.filter(function (s) { return s.t + s.dur > sp.t + 600; });
      for (var k = 0; k < live.length - maxSpots; k++) live[k].dur = Math.min(live[k].dur, sp.t - live[k].t + 600);
    }

    function land(n, t) {
      var ar = n.arr;
      n.arr = null;
      pulses.push({ n: n, t: t, big: true });
      var parts = [];
      var cols = [n.color, '#FFFFFF', BRAND.coral, BRAND.lavender, BRAND.amber];
      for (var i = 0; i < 26; i++) {
        var ang = Math.random() * TAU, sp = (70 + Math.random() * 150) * SC;
        parts.push({ vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 650 + Math.random() * 600,
          s: (1.6 + Math.random() * 2.8) * SC, c: cols[i % cols.length] });
      }
      bursts.push({ x: n.sx, y: n.sy, t: t, parts: parts });
      if (ar.label !== false) {
        pushSpot({ n: n, t: t, dur: ar.spotMs || 5200, title: ar.title || n.p.firstName || '', sub: ar.sub != null ? ar.sub : emojisOf(n.p) });
      }
      (ar.links || []).forEach(function (m, i) {
        if (m && m !== n) beams.push({ a: n, b: m, t: t + 260 + i * 230, dur: 680 });
      });
      if (onLand) { try { onLand({ id: n.id, x: n.sx, y: n.sy }); } catch (e) { /* rien */ } }
    }

    function draw(t, still) {
      var el = still ? 1e6 : t - start;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      /* caméra */
      if (!drag) {
        var ft = fitTarget();
        if (!cam.ready || still) { cam.s = ft.s; cam.x = ft.x; cam.y = ft.y; cam.ready = true; }
        else {
          var k = 0.07;
          cam.s += (ft.s - cam.s) * k;
          cam.x += (ft.x - cam.x) * k;
          cam.y += (ft.y - cam.y) * k;
        }
      }

      /* lueur de fond */
      if (paintBg) {
        var bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
        bg.addColorStop(0, dark ? 'rgba(155,123,255,0.10)' : 'rgba(91,61,245,0.07)');
        bg.addColorStop(1, dark ? 'rgba(155,123,255,0)' : 'rgba(91,61,245,0)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
      }

      var breathe = still ? 0 : clamp((0.35 - alpha) / 0.3, 0, 1);
      var focus = sel || hover;
      var ts = t / 1000;
      var i, n;

      /* positions écran */
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        var sp = toScreen(n.x, n.y);
        var bx = breathe * Math.sin(ts * 0.9 + n.ph) * 2.6 * SC;
        var by = breathe * Math.cos(ts * 0.75 + n.ph * 1.3) * 2.6 * SC;
        n.sx = sp.x + bx;
        n.sy = sp.y + by;
        n.ia = still || n.late ? 1 : clamp((el - i * 26) / 420, 0, 1);
        var bump = 0;
        for (var q = 0; q < pulses.length; q++) {
          if (pulses[q].n !== n) continue;
          var age = t - pulses[q].t;
          if (age > 0 && age < 800) bump = Math.max(bump, Math.sin(age / 800 * Math.PI) * (pulses[q].big ? 0.7 : 0.5));
        }
        var hv = (focus === n) ? 1.25 : 1;
        n.hs += (hv - n.hs) * (still ? 1 : 0.2);
        var rs = n.r * clamp(Math.sqrt(cam.s), 0.85, 1.15);
        n.sr = rs * (1 + 0.035 * breathe * Math.sin(ts * 1.6 + n.ph)) * n.hs * (1 + bump) * (still ? 1 : easeOutBack(n.ia));
        /* en vol : du point de départ vers sa place, sur une courbe */
        if (n.arr) {
          var ar = n.arr;
          var kf = (t - ar.t0) / ar.dur;
          if (still || kf >= 1) { land(n, t); }
          else if (kf < 0) { n.sx = ar.fx; n.sy = ar.fy; n.sr = 0; }
          else {
            var e1 = easeInOutCubic(kf);
            var mx = (ar.fx + n.sx) / 2, my = (ar.fy + n.sy) / 2;
            var ddx = n.sx - ar.fx, ddy = n.sy - ar.fy;
            var cx = mx - ddy * ar.bend, cy = my + ddx * ar.bend;
            var u = 1 - e1;
            var fx2 = u * u * ar.fx + 2 * u * e1 * cx + e1 * e1 * n.sx;
            var fy2 = u * u * ar.fy + 2 * u * e1 * cy + e1 * e1 * n.sy;
            n.sx = fx2; n.sy = fy2;
            if (bigFly) {
              n.sr = rs * (1.6 + 1.2 * Math.sin(kf * Math.PI));
              ar.trail.push({ x: fx2, y: fy2, t: t });
              while (ar.trail.length > 2 && t - ar.trail[0].t > 450) ar.trail.shift();
            } else {
              n.sr = rs * (0.75 + 0.55 * Math.sin(kf * Math.PI));
              ar.trail.push({ x: fx2, y: fy2 });
              if (ar.trail.length > 22) ar.trail.shift();
            }
          }
        }
      }

      var clipOn = clipStage && w > 0;
      if (clipOn) {
        var av0 = avail(), cp = inset.pad;
        ctx.save();
        ctx.beginPath();
        ctx.rect(inset.left - cp, inset.top - cp, av0.w + cp * 2, av0.h + cp * 2);
        ctx.clip();
      }

      /* liens doux (pointillés) */
      var ea = still ? 1 : clamp((el - 320) / 650, 0, 1);
      ctx.lineCap = 'round';
      if (exch.length && ctx.setLineDash) {
        ctx.setLineDash(dark ? [2 * SC, 7 * SC] : [3, 6]);
        ctx.lineDashOffset = still ? 0 : -ts * 9 * SC;
        ctx.lineWidth = (dark ? 1.7 : 1.4) * SC;
        for (i = 0; i < exch.length; i++) {
          var xe = exch[i];
          if (xe.a.arr || xe.b.arr) continue;
          var xh = focus && (xe.a === focus || xe.b === focus);
          var xa = (focus ? (xh ? 0.75 : 0.05) : (dark ? 0.42 : 0.3)) * ea;
          if (xa <= 0.01) continue;
          var xk = (xe.born && !still) ? clamp((t - xe.born) / 600, 0, 1) : 1;
          ctx.globalAlpha = xa;
          ctx.strokeStyle = xh ? (dark ? '#D9CFFF' : BRAND.violet) : (dark ? '#B6A6FF' : '#8C84C4');
          ctx.beginPath();
          ctx.moveTo(xe.a.sx, xe.a.sy);
          ctx.lineTo(lerp(xe.a.sx, xe.b.sx, easeOutCubic(xk)), lerp(xe.a.sy, xe.b.sy, easeOutCubic(xk)));
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
      }
      for (i = 0; i < edges.length; i++) {
        var e = edges[i];
        if (e.a.arr || e.b.arr) continue;
        var hl = focus && (e.a === focus || e.b === focus);
        var al = (focus ? (hl ? 0.95 : 0.12) : (dark ? 0.75 : 0.6)) * ea;
        if (al <= 0.01) continue;
        var ek = (e.born && !still) ? easeOutCubic(clamp((t - e.born) / 800, 0, 1)) : 1;
        var exx = lerp(e.a.sx, e.b.sx, ek), eyy = lerp(e.a.sy, e.b.sy, ek);
        var lg = ctx.createLinearGradient(e.a.sx, e.a.sy, e.b.sx, e.b.sy);
        lg.addColorStop(0, e.a.color);
        lg.addColorStop(1, e.b.color);
        ctx.strokeStyle = lg;
        ctx.globalAlpha = al;
        ctx.lineWidth = (hl ? 3.2 : 2) * (dark ? SC * 1.1 : SC);
        ctx.beginPath();
        ctx.moveTo(e.a.sx, e.a.sy);
        ctx.lineTo(exx, eyy);
        ctx.stroke();
        if (ek < 1) {
          ctx.globalAlpha = 1;
          ctx.drawImage(glowFor(e.b.color), exx - 20 * SC, eyy - 20 * SC, 40 * SC, 40 * SC);
          continue;
        }
        /* point lumineux qui circule */
        if (!still && (!focus || hl)) {
          var fpos = (ts * 0.22 + e.ph) % 1;
          var fx = lerp(e.a.sx, e.b.sx, fpos), fy = lerp(e.a.sy, e.b.sy, fpos);
          ctx.globalAlpha = al * 0.5;
          ctx.fillStyle = lerp(0, 1, fpos) < 0.5 ? e.a.color : e.b.color;
          ctx.beginPath(); ctx.arc(fx, fy, 4.5 * SC, 0, TAU); ctx.fill();
          ctx.globalAlpha = al;
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath(); ctx.arc(fx, fy, 2 * SC, 0, TAU); ctx.fill();
        }
      }

      /* faisceaux : un nouvel arrivant se relie à ses affinités */
      for (i = beams.length - 1; i >= 0; i--) {
        var bm = beams[i];
        var bk = (t - bm.t) / bm.dur;
        if (still || bk >= 1) {
          beams.splice(i, 1);
          if (!seenE[pairKey(bm.a.id, bm.b.id)]) addExch(bm.a, bm.b, still ? 0 : t);
          flows.push({ a: bm.a, b: bm.b, t: t });
          pulses.push({ n: bm.b, t: t });
          continue;
        }
        if (bk < 0) continue;
        var be = easeOutCubic(bk);
        var hx = lerp(bm.a.sx, bm.b.sx, be), hy = lerp(bm.a.sy, bm.b.sy, be);
        var bg2 = ctx.createLinearGradient(bm.a.sx, bm.a.sy, hx, hy);
        bg2.addColorStop(0, rgba(bm.a.color, 0.1));
        bg2.addColorStop(1, dark ? 'rgba(255,255,255,0.95)' : rgba(BRAND.violet, 0.9));
        ctx.globalAlpha = 1;
        ctx.strokeStyle = bg2;
        ctx.lineWidth = 3 * SC;
        ctx.beginPath();
        ctx.moveTo(bm.a.sx, bm.a.sy);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.drawImage(glowFor(dark ? '#FFFFFF' : BRAND.violet), hx - 22 * SC, hy - 22 * SC, 44 * SC, 44 * SC);
      }

      /* flux ponctuels (pulse) */
      for (i = flows.length - 1; i >= 0; i--) {
        var fl = flows[i];
        var fp = (t - fl.t) / 850;
        if (fp >= 1) { flows.splice(i, 1); continue; }
        if (fp < 0) continue;
        var fe = easeInOutCubic(fp);
        var gx = lerp(fl.a.sx, fl.b.sx, fe), gy = lerp(fl.a.sy, fl.b.sy, fe);
        var gimg = glowFor(fl.a.color);
        ctx.globalAlpha = Math.sin(fp * Math.PI);
        ctx.drawImage(gimg, gx - 22 * SC, gy - 22 * SC, 44 * SC, 44 * SC);
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.arc(gx, gy, 3 * SC, 0, TAU); ctx.fill();
      }

      /* ondes de pulsation */
      for (i = pulses.length - 1; i >= 0; i--) {
        var pu = pulses[i];
        var pa = t - pu.t;
        var plife = pu.big ? 2300 : 1900;
        if (pa > plife) { pulses.splice(i, 1); continue; }
        if (pu.n.arr) continue;
        if (pu.big && !still && pa >= 0 && pa < 420) {
          /* éclair à l'atterrissage */
          var fk = pa / 420;
          ctx.globalAlpha = (1 - fk) * 0.9;
          var fr = pu.n.sr * (1.5 + fk * 3.5);
          ctx.drawImage(glowFor(dark ? '#FFFFFF' : pu.n.color), pu.n.sx - fr, pu.n.sy - fr, fr * 2, fr * 2);
        }
        var edgeR = Infinity;
        if (clipOn) {
          var avE = avail();
          edgeR = Math.min(pu.n.sx - (inset.left - inset.pad), inset.left + avE.w + inset.pad - pu.n.sx,
            pu.n.sy - (inset.top - inset.pad), inset.top + avE.h + inset.pad - pu.n.sy);
        }
        for (var rk = 0; rk < 3; rk++) {
          var pk = (pa - rk * (pu.big ? 200 : 230)) / (pu.big ? 1500 : 1150);
          if (still) pk = rk === 0 ? 0.35 : -1;
          if (pk <= 0 || pk >= 1) continue;
          var ringR = pu.n.sr + 4 * SC + easeOutCubic(pk) * (small ? 48 : 74) * SC * (pu.big ? 1.9 : 1);
          var edgeK = edgeR === Infinity ? 1 : clamp((edgeR - ringR) / (26 * SC), 0, 1);
          if (edgeK <= 0.01) continue;
          ctx.globalAlpha = Math.pow(1 - pk, 1.4) * 0.85 * edgeK;
          ctx.strokeStyle = (pu.n.me || pu.big) ? (rk % 2 ? BRAND.coral : (dark ? BRAND.lavender : BRAND.violet)) : pu.n.color;
          ctx.lineWidth = ((pu.big ? 5 : 3.5) * (1 - pk) + 0.8) * SC;
          ctx.beginPath();
          ctx.arc(pu.n.sx, pu.n.sy, ringR, 0, TAU);
          ctx.stroke();
        }
      }

      /* étincelles à l'atterrissage */
      if (dark) ctx.globalCompositeOperation = 'lighter';
      for (i = bursts.length - 1; i >= 0; i--) {
        var bu = bursts[i];
        var bage = t - bu.t;
        if (bage > 1300 || still) { bursts.splice(i, 1); continue; }
        for (var pi = 0; pi < bu.parts.length; pi++) {
          var pt = bu.parts[pi];
          var pk2 = bage / pt.life;
          if (pk2 >= 1) continue;
          var dist = (1 - Math.pow(1 - Math.min(1, bage / 1000), 2.2)) * 0.9;
          ctx.globalAlpha = Math.pow(1 - pk2, 1.3);
          ctx.fillStyle = pt.c;
          ctx.beginPath();
          ctx.arc(bu.x + pt.vx * dist, bu.y + pt.vy * dist, pt.s * (1 - pk2 * 0.5), 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';

      /* nœuds (ceux en vol sont dessinés à la fin, par-dessus tout) */
      function drawNode(n) {
        if (n.ia <= 0.01 || n.sr <= 0.5) return;
        var dim = focus && focus !== n && !isNear(focus, n) ? 0.3 : 1;
        var r = n.sr;
        if (n.arr) {
          /* comète : traînée lumineuse */
          var tr = n.arr.trail;
          if (dark) ctx.globalCompositeOperation = 'lighter';
          for (var ti = 0; ti < tr.length; ti++) {
            var tk = (ti + 1) / tr.length;
            var trs = r * (bigFly ? 0.5 + 1.3 * tk : 0.35 + 1.6 * tk);
            ctx.globalAlpha = tk * tk * (bigFly ? 0.8 : 0.55);
            ctx.drawImage(glowFor(n.color), tr[ti].x - trs, tr[ti].y - trs, trs * 2, trs * 2);
            if (bigFly && dark && ti % 2) {
              ctx.globalAlpha = tk * tk * 0.35;
              ctx.drawImage(glowFor('#FFFFFF'), tr[ti].x - trs * 0.45, tr[ti].y - trs * 0.45, trs * 0.9, trs * 0.9);
            }
          }
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          var cg = r * 4.2;
          ctx.drawImage(glowFor(dark ? '#FFFFFF' : n.color), n.sx - cg / 2, n.sy - cg / 2, cg, cg);
        }
        ctx.globalAlpha = n.ia * dim * (n.me ? 1 : 0.85);
        var gimg2 = glowFor(n.me ? BRAND.violet : n.color);
        var gs = r * (n.me ? 4.4 : (dark ? 3.8 : 3.3));
        ctx.drawImage(gimg2, n.sx - gs / 2, n.sy - gs / 2, gs, gs);
        ctx.globalAlpha = n.ia * dim;
        var ng = ctx.createRadialGradient(n.sx - r * 0.35, n.sy - r * 0.4, r * 0.1, n.sx, n.sy, r);
        ng.addColorStop(0, shade(n.color, 0.42));
        ng.addColorStop(1, n.color);
        ctx.fillStyle = ng;
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, r, 0, TAU);
        ctx.fill();
        ctx.lineWidth = 2 * SC;
        ctx.strokeStyle = dark ? 'rgba(255,255,255,0.92)' : '#FFFFFF';
        ctx.stroke();
        if (n.p.team || n.p.role === 'prof') {
          ctx.lineWidth = 2 * SC;
          ctx.strokeStyle = n.p.team ? (dark ? BRAND.lavender : BRAND.violet) : '#F2A541';
          ctx.beginPath();
          ctx.arc(n.sx, n.sy, r + 3.2 * SC, 0, TAU);
          ctx.stroke();
        }
        if (n.me) {
          var rot = still ? 0 : ts * 1.4;
          var mg = ctx.createLinearGradient(n.sx + Math.cos(rot) * r, n.sy + Math.sin(rot) * r,
            n.sx - Math.cos(rot) * r, n.sy - Math.sin(rot) * r);
          mg.addColorStop(0, BRAND.violet);
          mg.addColorStop(1, BRAND.coral);
          ctx.strokeStyle = mg;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(n.sx, n.sy, r + 5 + (still ? 0 : Math.sin(ts * 2.2) * 1.5), 0, TAU);
          ctx.stroke();
        }
        if (r >= 11) {
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '700 ' + Math.round(r * 0.74) + 'px ' + UI_FONT;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(initials(n.p), n.sx, n.sy + 0.5);
        }
      }
      for (i = 0; i < nodes.length; i++) if (!nodes[i].arr) drawNode(nodes[i]);

      /* prénoms */
      var la = still ? 1 : clamp((0.45 - alpha) / 0.3, 0, 1) * ea;
      if (dark) la = still ? 1 : Math.max(la, 0.85 * ea);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineJoin = 'round';
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        if (n.arr) continue;
        var show = n.me || n === focus || (!small && !focus) || (small && n.p.team && !focus) || (focus && isNear(focus, n));
        if (show && labelFilter && !n.me && n !== focus) { try { show = labelFilter(n.p, nodes.length) !== false; } catch (e) { /* rien */ } }
        if (!show || n.ia < 0.5) continue;
        var lab = n.me ? 'Toi' : (n.p.firstName || '');
        if (!lab) continue;
        var lal = (n.me || n === focus) ? Math.max(la, n.ia) : la;
        if (lal <= 0.02) continue;
        ctx.globalAlpha = lal * (focus && focus !== n && !isNear(focus, n) ? 0.3 : 1);
        var lsc = 1;
        if (labelScale) { try { lsc = clamp(+labelScale(n.p, nodes.length) || 1, 0.5, 3); } catch (e) { lsc = 1; } }
        ctx.font = (n.me ? '800 ' : (dark ? '700 ' : '600 ')) + Math.round((n.me ? (small ? 13 : 14) : (small ? 11 : 12)) * SC * Math.max(0.85, density()) * lsc) + 'px ' + UI_FONT;
        var ly = n.sy + n.sr + (n.me ? 9 : 5) * SC;
        if (n.me) {
          var lw = ctx.measureText(lab).width + 14;
          ctx.fillStyle = BRAND.violet;
          roundRect(n.sx - lw / 2, ly - 1, lw, 19, 9.5);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(lab, n.sx, ly + 2);
        } else {
          ctx.lineWidth = 3.5 * SC;
          ctx.strokeStyle = dark ? 'rgba(16,9,52,0.85)' : 'rgba(255,255,255,0.92)';
          ctx.strokeText(lab, n.sx, ly);
          ctx.fillStyle = dark ? '#FFFFFF' : '#3B3758';
          ctx.fillText(lab, n.sx, ly);
        }
      }
      ctx.globalAlpha = 1;

      /* étiquettes d'arrivée */
      spotRects = [];
      for (i = spots.length - 1; i >= 0; i--) {
        if (t - spots[i].t > spots[i].dur) { spots.splice(i, 1); continue; }
        drawSpot(spots[i], t);
      }
      ctx.globalAlpha = 1;
      if (clipOn) ctx.restore();
      for (i = 0; i < nodes.length; i++) if (nodes[i].arr) { drawNode(nodes[i]); if (bigFly) drawFlyName(nodes[i]); }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      /* légende (opts.legend:false pour l'écrire en HTML sous le canvas) */
      if (showLegend()) {
        var lgA = (still ? 1 : ea) * 0.9;
        ctx.globalAlpha = lgA;
        ctx.font = '500 ' + (small ? 11 : 12) + 'px ' + UI_FONT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        var lx = small ? 10 : 16, ly2 = h - (small ? 12 : 16);
        ctx.lineWidth = 2;
        ctx.strokeStyle = BRAND.violet;
        ctx.beginPath(); ctx.moveTo(lx, ly2); ctx.lineTo(lx + 18, ly2); ctx.stroke();
        ctx.fillStyle = dark ? 'rgba(255,255,255,0.8)' : '#6B6785';
        ctx.fillText('connexion', lx + 24, ly2);
        var lx2 = lx + 24 + ctx.measureText('connexion').width + 16;
        ctx.setLineDash && ctx.setLineDash([3, 5]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#8C84C4';
        ctx.beginPath(); ctx.moveTo(lx2, ly2); ctx.lineTo(lx2 + 18, ly2); ctx.stroke();
        ctx.setLineDash && ctx.setLineDash([]);
        ctx.fillText('échange de talents possible', lx2 + 24, ly2);
        ctx.globalAlpha = 1;
      }

      /* bulle d'info */
      if (focus) { tip.n = focus; tip.a += (1 - tip.a) * (still ? 1 : 0.22); }
      else { tip.a += (0 - tip.a) * (still ? 1 : 0.25); if (tip.a < 0.02) { tip.a = 0; tip.n = null; } }
      drawTooltip(tip.n, tip.a);
      ctx.globalAlpha = 1;
    }

    /* --- interaction --- */
    function hit(x, y, extra) {
      var best = null, bd = Infinity;
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i], dx = n.sx - x, dy = n.sy - y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < n.sr + extra && d < bd) { bd = d; best = n; }
      }
      return best;
    }
    function pos(e) {
      var r = canvas.getBoundingClientRect();
      var sxr = r.width ? w / r.width : 1, syr = r.height ? h / r.height : 1;
      return { x: (e.clientX - r.left) * sxr, y: (e.clientY - r.top) * syr };
    }
    function onMove(e) {
      if (e.pointerType === 'touch') return;
      var p = pos(e);
      pointerIn = true;
      if (drag) {
        var wp = toWorld(p.x, p.y);
        drag.x = wp.x; drag.y = wp.y;
        alpha = Math.max(alpha, 0.12);
        if (rm) redraw();
        return;
      }
      var hnode = hit(p.x, p.y, 8);
      if (hnode !== hover) {
        hover = hnode;
        canvas.style.cursor = hover ? 'grab' : '';
        if (rm) redraw();
      }
    }
    function onDown(e) {
      var p = pos(e);
      if (e.pointerType === 'touch') {
        var tn = hit(p.x, p.y, 16);
        sel = tn && tn !== sel ? tn : null;
        if (rm) redraw();
        return;
      }
      var n = hit(p.x, p.y, 8);
      if (!n) { sel = null; return; }
      drag = n;
      n.fixed = true;
      alphaTarget = 0.08;
      alpha = Math.max(alpha, 0.15);
      canvas.style.cursor = 'grabbing';
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
      schedule();
    }
    function onUp() {
      if (!drag) return;
      drag.fixed = false;
      drag = null;
      alphaTarget = 0;
      canvas.style.cursor = hover ? 'grab' : '';
    }
    function onLeave(e) {
      if (e.pointerType === 'touch') return;
      pointerIn = false;
      if (!drag) { hover = null; canvas.style.cursor = ''; if (rm) redraw(); }
    }
    function onVis() {
      if (doc.hidden) { if (rafId) { caf(rafId); rafId = 0; } }
      else { last = now(); schedule(); }
    }
    function onResize() { dirty = true; if (rm) redraw(); else schedule(); }

    function alive() {
      if (isConnected(canvas)) { wasConnected = true; return true; }
      if (wasConnected || now() - born > 8000) { stop(); return false; }
      return true;
    }

    function schedule() {
      if (!rafId && !stopped && !rm && !doc.hidden && visible && (seen || !w)) rafId = raf(frame);
    }

    function markSeen() {
      if (seen || stopped) return;
      seen = true;
      if (seenIO) { seenIO.disconnect(); seenIO = null; }
      if (w && !start) start = now();
      var q = queued;
      queued = [];
      q.forEach(function (it, i) {
        setTimeout(function () { pulse(it[0], it[1]); }, 1150 + i * 550);
      });
      last = now();
      schedule();
    }

    function frame() {
      rafId = 0;
      if (stopped || !alive()) return;
      var t = now();
      last = t;
      if (dirty && resize()) dirty = false;
      if (w && start) {
        var steps = alpha > 0.5 ? 2 : 1;
        if (alpha > 0) for (var s = 0; s < steps; s++) tick();
        draw(t, false);
      }
      schedule();
    }

    function redraw() {
      if (stopped) return;
      if (dirty && resize()) dirty = false;
      if (!w) return;
      draw(now(), true);
    }

    /* Version calme : on laisse la mise en page se poser d'un coup, puis image fixe. */
    function settle() {
      if (!rm || stopped) return;
      if (dirty && resize()) dirty = false;
      for (var i = 0; i < 220 && alpha > 0; i++) tick();
      alpha = 0;
      redraw();
    }

    var unwatch = watchSize(canvas, onResize);
    var io = null;
    if (W.IntersectionObserver) {
      io = new W.IntersectionObserver(function (ents) {
        var en = ents[ents.length - 1];
        visible = !!(en && en.isIntersecting);
        if (!visible && wasConnected && !isConnected(canvas)) { stop(); return; }
        if (visible) { last = now(); schedule(); }
      }, { rootMargin: '120px' });
      try { io.observe(canvas); } catch (e) { io = null; }
    }
    var seenIO = null;
    if (!seen) {
      try {
        seenIO = new W.IntersectionObserver(function (ents) {
          for (var k = 0; k < ents.length; k++) {
            if (ents[k].isIntersecting && ents[k].intersectionRatio >= 0.4) { markSeen(); return; }
          }
        }, { threshold: [0, 0.2, 0.4, 0.6, 0.8] });
        seenIO.observe(canvas);
      } catch (e) { seenIO = null; seen = true; }
    }

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerleave', onLeave);
    W.addEventListener('pointerup', onUp);
    W.addEventListener('pointercancel', onUp);
    doc.addEventListener('visibilitychange', onVis);

    function stop() {
      if (stopped) return;
      stopped = true;
      if (rafId) caf(rafId);
      rafId = 0;
      unwatch();
      if (io) io.disconnect();
      if (seenIO) { seenIO.disconnect(); seenIO = null; }
      queued = [];
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerleave', onLeave);
      W.removeEventListener('pointerup', onUp);
      W.removeEventListener('pointercancel', onUp);
      doc.removeEventListener('visibilitychange', onVis);
      canvas.style.cursor = '';
      if (canvas.__ccfx === api) canvas.__ccfx = null;
    }

    function pulse(personId, otherId) {
      if (stopped) return false;
      var n = byId[personId];
      if (!n) return false;
      if (!seen) { queued.push([personId, otherId]); return true; }
      var t = now();
      pulses.push({ n: n, t: t });
      var o = otherId != null ? byId[otherId] : null;
      if (o) {
        flows.push({ a: n, b: o, t: t + 120 });
        pulses.push({ n: o, t: t + 800 });
      } else {
        n.nb.forEach(function (m, i) { flows.push({ a: n, b: m, t: t + 200 + i * 90 }); });
      }
      if (rm) {
        redraw();
        setTimeout(function () { pulses.length = 0; flows.length = 0; redraw(); }, 1500);
      } else {
        schedule();
      }
      return true;
    }

    /* ---------- Ajouts en direct (mode live) ---------- */

    /* Nouvelle personne. o = { from:{x,y} (px du canvas), links:[ids] (affinités : faisceaux),
     * fly:false (apparition sans vol), label:false, title, sub, dur } */
    function add(person, o) {
      o = o || {};
      if (stopped || !person || person.id == null || byId[person.id]) return false;
      var n = makeNode(person);
      n.late = true;
      var targets = toArr(o.links).map(function (id) { return byId[id]; }).filter(Boolean).slice(0, 4);
      /* position de départ dans la simulation : près de ses affinités, sinon en bordure du nuage */
      if (targets.length) {
        var sx = 0, sy = 0;
        targets.forEach(function (m) { sx += m.x; sy += m.y; });
        var jit = K.L * 0.7;
        n.x = sx / targets.length + (Math.random() - 0.5) * jit;
        n.y = sy / targets.length + (Math.random() - 0.5) * jit;
      } else if (nodes.length) {
        var R = 0;
        nodes.forEach(function (m) { R = Math.max(R, Math.sqrt(m.x * m.x + m.y * m.y)); });
        var ang = Math.random() * TAU;
        n.x = Math.cos(ang) * (R + K.L * 0.5);
        n.y = Math.sin(ang) * (R + K.L * 0.5);
      }
      nodes.forEach(function (m) {
        if (m.cat && m.cat === n.cat) clusters.push([n, m]);
        if (autoExch && exchOk(n, m)) addExch(n, m, rm ? 0 : now());
      });
      nodes.push(n);
      byId[n.id] = n;
      n.r = radiusFor(n);
      constants();
      try { canvas.setAttribute('aria-label', 'Réseau du campus : ' + nodes.length + ' personnes, ' + edges.length + ' connexions'); } catch (e) { /* rien */ }
      alpha = Math.max(alpha, o.calm ? 0.12 : 0.3);
      if (rm) {
        targets.forEach(function (m) { addExch(n, m); });
        settle();
        return true;
      }
      var t = now();
      if (o.fly === false || !seen || !w) {
        targets.forEach(function (m) { addExch(n, m, t); });
        if (seen && o.label !== false) pulses.push({ n: n, t: t });
      } else {
        var from = o.from && isFinite(o.from.x) && isFinite(o.from.y) ? { x: +o.from.x, y: +o.from.y } : edgePoint();
        n.arr = {
          t0: t, dur: o.dur || 1500, fx: from.x, fy: from.y, trail: [], links: targets,
          bend: (Math.random() < 0.5 ? -1 : 1) * (0.16 + Math.random() * 0.14),
          label: o.label, title: o.title, sub: o.sub, spotMs: o.spotMs
        };
      }
      schedule();
      return true;
    }

    /* Nouvelle connexion entre deux personnes : le lien se dessine, une étincelle le parcourt. */
    function link(a, b, o) {
      o = o || {};
      if (stopped) return false;
      var na = byId[a], nb = byId[b];
      if (!na || !nb || na === nb) return false;
      if (seenE[pairKey(na.id, nb.id)]) return false;
      var quiet = o.quiet || rm || !seen;
      var t = now();
      addEdge(na, nb, quiet ? 0 : t);
      na.r = radiusFor(na); nb.r = radiusFor(nb);
      alpha = Math.max(alpha, 0.15);
      if (rm) { settle(); return true; }
      if (!quiet) {
        flows.push({ a: na, b: nb, t: t + 700 });
        pulses.push({ n: na, t: t });
        pulses.push({ n: nb, t: t + 650 });
      }
      schedule();
      return true;
    }

    /* Étiquette ponctuelle au-dessus d'une personne (ex. « Yanis → 🎹🎸 Jam session »). */
    function spot(personId, title, sub, ms) {
      if (stopped || rm) return false;
      var n = byId[personId];
      if (!n) return false;
      spots = spots.filter(function (s) { return s.n !== n; });
      pushSpot({ n: n, t: now(), dur: ms || 3800, title: String(title || n.p.firstName || ''), sub: sub ? String(sub) : '' });
      schedule();
      return true;
    }

    /* Rattrapage : ajoute les personnes et connexions qui manquent (sans vol par défaut). */
    function sync(o) {
      o = o || {};
      var added = [];
      toArr(o.people).forEach(function (p) {
        if (p && p.id != null && !byId[p.id] && add(p, { fly: !!o.fly, label: o.fly ? undefined : false, calm: true })) added.push(p.id);
      });
      toArr(o.connections).forEach(function (c) {
        var ab = ends(c);
        if (ab) link(ab[0], ab[1], { quiet: !o.fly });
      });
      return added;
    }

    function setInset(o) {
      o = o || {};
      inset.left = Math.max(0, +o.left || 0);
      inset.top = Math.max(0, +o.top || 0);
      inset.right = Math.max(0, +o.right || 0);
      inset.bottom = Math.max(0, +o.bottom || 0);
      inset.pad = Math.max(0, +o.pad || 0);
      constants();
      alpha = Math.max(alpha, 0.1);
      if (rm) redraw(); else schedule();
    }

    if (opts.inset) setInset(opts.inset);

    api.stop = stop;
    api.pulse = pulse;
    api.add = add;
    api.link = link;
    api.spot = spot;
    api.sync = sync;
    api.setInset = setInset;
    api.has = function (id) { return !!byId[id]; };
    api.size = function () { return nodes.length; };
    /* position d'une personne (px du canvas), pour y lancer un effet */
    api.where = function (id) { var n = byId[id]; return n ? { x: n.sx, y: n.sy, r: n.sr } : null; };
    wasConnected = isConnected(canvas);
    canvas.__ccfx = api;

    if (rm) {
      /* Version calme : on calcule la mise en page d'un coup, puis image fixe. */
      var tries = 0;
      (function first() {
        if (stopped) return;
        if (!resize()) { if (++tries < 40) setTimeout(first, 100); return; }
        dirty = false;
        for (var i = 0; i < 320 && alpha > 0; i++) tick();
        alpha = 0;
        redraw();
      })();
    } else {
      schedule();
    }
    return api;
  }

  /* ------------------------------------------------------------------ */
  /* Export                                                              */
  /* ------------------------------------------------------------------ */

  var fx = CC.fx = CC.fx || {};
  fx.welcomeNetwork = welcomeNetwork;
  fx.revealMatches = revealMatches;
  fx.confetti = confetti;
  fx.countUp = countUp;
  fx.campusGraph = campusGraph;
  fx.avatarHTML = avatarHTML;
  /* utilitaires en plus (facultatifs) */
  fx.avatarColors = avatarColors;
  fx.reducedMotion = reduced;

  injectStyle();
})();
