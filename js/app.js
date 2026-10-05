/* Campus Connect — routeur, vues et événements (CC.app).
 * Script classique, chargé en dernier (après copy, data, store, fx).
 * Rendu par templates de chaînes : toute donnée passe par esc().
 * Les grands moments animés viennent de CC.fx, appelé sous garde :
 * sans fx.js, l'app fonctionne quand même.
 */
(function () {
  'use strict';

  var CC = window.CC;
  var S = CC.store, D = CC.data, T = CC.copy;

  var mm = function (q) { return !!(window.matchMedia && window.matchMedia(q).matches); };
  /* Même source que CC.fx : respecte « Réduire les animations », mais le forçage
   * localStorage.cc_fx_motion = 'full' (ou 'reduced') vaut pour toute l'app. */
  var REDUCED = (function () {
    try { if (CC.fx && typeof CC.fx.reducedMotion === 'function') return !!CC.fx.reducedMotion(); } catch (e) { /* rien */ }
    return mm('(prefers-reduced-motion: reduce)');
  })();
  var CAN_HOVER = mm('(hover: hover) and (pointer: fine)');
  var HAS_VT = typeof document.startViewTransition === 'function';

  /* ================================================================
   * Outils
   * ================================================================ */

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) { return String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function enc(v) { return encodeURIComponent(String(v)); }
  /* Espaces insécables avant ? ! : ; (typographie française). */
  function nb(s) { return String(s).replace(/ ([?!:;»])/g, ' $1').replace(/« /g, '« '); }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function plural(n, one, many) { return n + ' ' + (n > 1 ? many : one); }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  /* ---------- Dates ---------- */
  var MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var DAYS_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

  function fmtTime(d) { return d.getHours() + 'h' + (d.getMinutes() ? pad(d.getMinutes()) : ''); }
  function fmtDay(d) { return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }
  function fmtWhen(iso) { var d = new Date(iso); return fmtDay(d) + ' · ' + fmtTime(d); }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function dayDiff(d) { return Math.round((startOfDay(d) - startOfDay(S.now())) / 864e5); }
  function dayLabel(d) {
    var n = dayDiff(d);
    if (n === 0) return "Aujourd'hui";
    if (n === 1) return 'Demain';
    return cap(fmtDay(d));
  }
  function shortWhen(iso) { var d = new Date(iso); return dayLabel(d) + ' · ' + fmtTime(d); }
  function relDays(iso) {
    var n = dayDiff(new Date(iso));
    if (n <= 0) return "Aujourd'hui";
    if (n === 1) return 'Demain';
    return 'Dans ' + n + ' jours';
  }
  /* Nombre de graphèmes d'un emoji (« 🎹🎸 » = 2) pour ajuster sa taille. */
  var SEG = null;
  try { if (window.Intl && Intl.Segmenter) SEG = new Intl.Segmenter('fr', { granularity: 'grapheme' }); } catch (e) { SEG = null; }
  function emojiCls(s) {
    s = String(s || '');
    var n;
    if (SEG) { n = 0; var it = SEG.segment(s)[Symbol.iterator](); while (!it.next().done) n++; }
    else n = Array.from(s).filter(function (c) { return !/[\uFE0F\u200D]/.test(c); }).length;
    return n > 1 ? ' is-multi' : '';
  }
  function isoDay(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  /* ---------- Données ---------- */
  function catOf(id) { return S.category(id) || D.categories[0]; }
  function catStyle(c) { return '--cat:' + c.color + ';--tint:' + c.tint; }
  function fullName(p) { return p.firstName + (p.lastName ? ' ' + p.lastName : ''); }
  function subtitle(p) { return p.role === 'prof' ? 'Prof · ' + (p.program || 'IDRAC') : (p.program || 'Étudiant·e'); }
  function dominantCat(p) {
    var counts = {};
    (p.passions || []).forEach(function (x) {
      var pa = S.passion(x.id);
      if (pa) counts[pa.cat] = (counts[pa.cat] || 0) + x.level + ((p.teach || []).indexOf(x.id) >= 0 ? 2 : 0);
    });
    var best = null;
    Object.keys(counts).forEach(function (k) { if (!best || counts[k] > counts[best]) best = k; });
    return catOf(best || 'musique');
  }

  /* ================================================================
   * Icônes, logo, avatars
   * ================================================================ */

  var ICONS = {
    home: '<path d="M3.5 10.4 12 3.6l8.5 6.8V19a1.6 1.6 0 0 1-1.6 1.6h-4.3v-6H9.4v6H5.1A1.6 1.6 0 0 1 3.5 19z"/>',
    search: '<circle cx="11" cy="11" r="6.8"/><path d="m20 20-4.1-4.1"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.2"/><path d="M3.5 10h17M8.2 3v4M15.8 3v4"/>',
    impact: '<path d="M5 20v-6.5M12 20V5M19 20v-10"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    pin: '<path d="M12 21s-6.8-6-6.8-11.3a6.8 6.8 0 0 1 13.6 0C18.8 15 12 21 12 21z"/><circle cx="12" cy="9.7" r="2.4"/>',
    clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.6V12l3 2"/>',
    level: '<path d="M5 19.5v-4M10 19.5v-8M15 19.5V8M20 19.5V4.5"/>',
    users: '<circle cx="9" cy="8.2" r="3.4"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0"/><path d="M15.8 4.9a3.4 3.4 0 0 1 0 6.6M17.6 14.2A6 6 0 0 1 21.2 20"/>',
    back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
    check: '<path d="M5 12.6l4.4 4.4L19 7.4"/>',
    close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    chat: '<path d="M4.5 5.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-5.5 4v-4h0a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z"/>',
    edit: '<path d="M4 20h4.2L19.4 8.8a2.1 2.1 0 0 0 0-3l-1.2-1.2a2.1 2.1 0 0 0-3 0L4 15.8z"/><path d="M13.5 6.5l4 4"/>',
    spark: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M19 15.5l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8z"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    minus: '<path d="M5 12h14"/>',
    graduation: '<path d="M2.5 9.5 12 5l9.5 4.5L12 14z"/><path d="M6.5 11.5v4.3c1.5 1.4 3.4 2.2 5.5 2.2s4-.8 5.5-2.2v-4.3"/>'
  };
  function icon(name, cls) {
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICONS[name] || '') + '</svg>';
  }

  function logoHTML(opts) {
    opts = opts || {};
    return '<span class="logo' + (opts.big ? ' logo--big' : '') + (opts.animate ? ' logo--animate' : '') + '">' +
      '<svg class="logo-mark" viewBox="0 0 52 34" aria-hidden="true" focusable="false">' +
        '<circle class="lm-a" cx="18" cy="17" r="13"/>' +
        '<circle class="lm-b" cx="34" cy="17" r="13"/>' +
        '<path class="lm-c" d="M26 6.75a13 13 0 0 1 0 20.5a13 13 0 0 1 0-20.5z"/>' +
      '</svg>' +
      '<span class="logo-text"><span class="logo-name">' + esc(T.appName) + '</span>' +
      (opts.tagline ? '<span class="logo-tag">' + esc(T.tagline) + '</span>' : '') + '</span>' +
    '</span>';
  }

  var AV = [
    ['#5B3DF5', '#9F7BFF'], ['#FF6B4A', '#FFA26B'], ['#E5539A', '#FF8FC4'], ['#22A06B', '#5AD69B'],
    ['#1C9FD6', '#62CCF5'], ['#C98A0B', '#F4BC45'], ['#9B59D0', '#C994F2'], ['#0F9E94', '#47D3C7'],
    ['#3B6FE0', '#79A2FF'], ['#E8743B', '#FFAB78']
  ];
  function hash(s) {
    var h = 2166136261;
    s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function initials(p) {
    var a = (p.firstName || '?').charAt(0);
    var b = p.lastName ? p.lastName.charAt(0) : '';
    return (a + b).toUpperCase();
  }
  function avatar(p, size, cls) {
    if (!p) return '';
    var c = AV[hash(p.id) % AV.length];
    var fs = Math.round(size * (initials(p).length > 1 ? 0.36 : 0.42));
    return '<span class="avatar' + (cls ? ' ' + cls : '') + (p.team ? ' avatar--team' : '') + '" style="--s:' + size + 'px;--fs:' + fs + 'px;--a1:' + c[0] + ';--a2:' + c[1] + '" aria-hidden="true">' + esc(initials(p)) + '</span>';
  }
  function avatarStack(ids, max) {
    var people = ids.map(S.person).filter(Boolean);
    var shown = people.slice(0, max);
    var more = people.length - shown.length;
    return '<span class="stack">' + shown.map(function (p) { return avatar(p, 30); }).join('') +
      (more > 0 ? '<span class="stack-more">+' + more + '</span>' : '') + '</span>';
  }

  /* ================================================================
   * Garde-fous pour CC.fx
   * ================================================================ */

  function fx(name) { return CC.fx && typeof CC.fx[name] === 'function' ? CC.fx[name] : null; }
  function callFx(name, args) {
    var f = fx(name);
    if (!f) return { ok: false };
    try { return { ok: true, value: f.apply(CC.fx, args || []) }; } catch (e) {
      if (window.console) console.warn('[CC.fx.' + name + ']', e);
      return { ok: false, error: e };
    }
  }

  /* ================================================================
   * État de l'interface (hors CC.store)
   * ================================================================ */

  var $app, $view, $toasts, $modal;
  var current = { name: null, key: null, order: -1 };
  var fxHandles = [];      // instances CC.fx avec stop()
  var loops = [];          // { id } requestAnimationFrame en cours
  var timers = [];         // setTimeout liés à l'écran
  var vt = null;           // View Transition en cours
  var draft = null;        // formulaire d'inscription / modification
  var restoredDraft = null; // brouillon relu après un rechargement de page (sessionStorage)
  var navCount = 0;
  var ui = {
    explore: { q: '', cat: '', teach: false },
    acts: { f: 'all' },
    pendingReveal: false,
    pulses: [],
    joinAnim: null,
    lastObPct: 0,
    justCreated: null,
    createPrefill: null
  };

  function later(fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; }
  function frame(fn) {
    var l = { id: 0 };
    l.id = requestAnimationFrame(function (t) { fn(t, l); });
    loops.push(l);
    return l;
  }

  function cleanup(soft) {
    fxHandles.forEach(function (h) { try { if (h && typeof h.stop === 'function') h.stop(); } catch (e) { /* rien */ } });
    fxHandles = [];
    loops.forEach(function (l) { cancelAnimationFrame(l.id); });
    loops = [];
    timers.forEach(clearTimeout);
    timers = [];
    tiltEl = null;
    if (!soft) closeModal(true);
  }

  /* Compteur animé : CC.fx.countUp si présent, sinon version maison. */
  function countUp(el, from, to, ms) {
    if (!el) return;
    if (REDUCED) { el.textContent = String(to); return; }
    if (callFx('countUp', [el, from, to, ms]).ok) return;
    var t0 = 0;
    el.textContent = String(from);
    var step = function (t, l) {
      if (!t0) t0 = t;
      var k = Math.min(1, (t - t0) / ms);
      var e = 1 - Math.pow(1 - k, 3);
      el.textContent = String(Math.round(from + (to - from) * e));
      if (k < 1) l.id = requestAnimationFrame(function (tt) { step(tt, l); });
    };
    frame(step);
  }

  /* ================================================================
   * Toasts et fenêtres
   * ================================================================ */

  function toast(msg, ic) {
    if (!$toasts) return;
    var el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<span class="toast-ic">' + (ic || icon('check')) + '</span><span class="toast-msg">' + esc(nb(msg)) + '</span>';
    $toasts.appendChild(el);
    while ($toasts.children.length > 3) $toasts.removeChild($toasts.firstChild);
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    }, 2800);
  }

  var lastFocus = null;
  var modalOnClose = null;
  var modalKeep = false;
  var modalOpenedAt = 0;
  var pendingClose = null;   // fermeture animée en cours (200 ms)
  function flushClose() { if (pendingClose) { var f = pendingClose; pendingClose = null; f(); } }
  function openModal(inner, opts) {
    opts = opts || {};
    flushClose();
    closeModal(true, true);
    lastFocus = document.activeElement;
    modalOnClose = opts.onClose || null;
    modalKeep = !!opts.keep;
    modalOpenedAt = Date.now();
    $modal.innerHTML =
      '<div class="modal' + (opts.cls ? ' ' + opts.cls : '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
        '<div class="modal-backdrop" data-action="close-modal"></div>' +
        '<div class="modal-sheet">' + inner + '</div>' +
      '</div>';
    document.body.classList.add('has-modal');
    var f = $('[data-autofocus]', $modal) || $('.modal-sheet button:not([disabled])', $modal);
    if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }, 30);
  }
  function setModalContent(inner) {
    var sheet = $('.modal-sheet', $modal);
    if (sheet) { sheet.innerHTML = inner; sheet.classList.remove('is-swap'); void sheet.offsetWidth; sheet.classList.add('is-swap'); }
  }
  function closeModal(instant, force) {
    if (pendingClose) { if (instant) flushClose(); return; }
    var m = $('.modal', $modal);
    if (!m) return;
    if (modalKeep && instant && !force) return;
    modalKeep = false;
    var cb = modalOnClose;
    modalOnClose = null;
    var fired = false, timer = 0;
    var done = function () {
      if (fired) return;
      fired = true;
      clearTimeout(timer);
      if (pendingClose === done) pendingClose = null;
      /* On ne retire que CETTE fenêtre : une nouvelle a pu s'ouvrir entre-temps. */
      if (m.parentNode) m.parentNode.removeChild(m);
      if (!$('.modal', $modal)) document.body.classList.remove('has-modal');
      if (lastFocus && lastFocus.focus && document.contains(lastFocus)) { try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* rien */ } }
      if (cb) cb();
    };
    if (instant || REDUCED) { done(); return; }
    m.classList.add('is-closing');
    pendingClose = done;
    timer = setTimeout(done, 200);
  }

  function confirmModal(o) {
    var keep = !!o.keep;
    openModal(
      '<div class="modal-body confirm">' +
        '<div class="confirm-ic">' + (o.emoji || '⚠️') + '</div>' +
        '<h2 id="modal-title">' + esc(nb(o.title)) + '</h2>' +
        '<p>' + esc(nb(o.text)) + '</p>' +
        '<div class="modal-actions">' +
          '<button type="button" class="btn btn-ghost" data-action="close-modal">' + esc(o.cancel || 'Annuler') + '</button>' +
          '<button type="button" class="btn ' + (o.danger ? 'btn-danger' : 'btn-primary') + '" data-action="' + o.action + '"' + (o.id ? ' data-id="' + esc(o.id) + '"' : '') + ' data-autofocus>' + esc(o.ok) + '</button>' +
        '</div>' +
      '</div>', { keep: keep });
  }

  /* ================================================================
   * Routeur
   * ================================================================ */

  function parseHash() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var query = {};
    var qi = h.indexOf('?');
    if (qi >= 0) {
      h.slice(qi + 1).split('&').forEach(function (kv) {
        if (!kv) return;
        var i = kv.indexOf('=');
        var k = i >= 0 ? kv.slice(0, i) : kv;
        var v = i >= 0 ? kv.slice(i + 1) : '';
        try { query[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { /* ignoré */ }
      });
      h = h.slice(0, qi);
    }
    var parts = h.split('/').filter(Boolean).map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
    return { parts: parts, query: query };
  }

  var ORDER = { welcome: 0, onboarding: 1, edit: 1, home: 10, explore: 11, activities: 12, impact: 13, create: 14, me: 15, person: 20, activity: 21 };

  function resolve(r) {
    var me = S.me();
    var name = r.parts[0] || '';
    var p1 = r.parts[1];
    if (!me) {
      if (name === 'onboarding') {
        var st = clamp(parseInt(p1, 10) || 1, 1, 3);
        if (String(st) !== p1) return { redirect: '#/onboarding/' + st };
        /* Étapes 2 et 3 sans prénom (page rechargée, lien direct) : retour à l'étape 1. */
        if (st > 1 && !draftHasName('onboarding')) return { redirect: '#/onboarding/1' };
        return { name: 'onboarding', step: st, query: r.query };
      }
      if (name !== 'welcome') return { redirect: '#/welcome' };
      return { name: 'welcome', query: r.query };
    }
    switch (name) {
      case 'home': case 'explore': case 'activities': case 'impact': case 'create': case 'me':
        return { name: name, query: r.query };
      case 'edit':
        var es = clamp(parseInt(p1, 10) || 1, 1, 3);
        if (String(es) !== p1) return { redirect: '#/edit/' + es };
        return { name: 'edit', step: es, query: r.query };
      case 'person':
        if (p1 === me.id) return { redirect: '#/me' };
        if (!p1 || !S.person(p1)) return { redirect: '#/explore' };
        return { name: 'person', id: p1, query: r.query };
      case 'activity':
        if (!p1 || !S.activity(p1)) return { redirect: '#/activities' };
        return { name: 'activity', id: p1, query: r.query };
      default:
        return { redirect: '#/home' };
    }
  }

  function replaceHash(h) {
    try { location.replace(h); } catch (e) { location.hash = h; }
  }
  var pendingOpts = null;
  var lastRenderedHash = null;
  function go(h, opts) {
    if (location.hash === h) {
      var o = { force: true };
      if (opts) for (var k in opts) o[k] = opts[k];
      render(o);
    } else {
      pendingOpts = opts || null;
      location.hash = h;
    }
  }
  function goBack(fallback) {
    if (navCount > 1 && history.length > 1) history.back();
    else go(fallback);
  }

  var VIEWS = {};

  function render(opts) {
    opts = opts || {};
    var r = parseHash();
    var target = resolve(r);
    if (target.redirect) {
      if (location.hash !== target.redirect) { replaceHash(target.redirect); return; }
      target = resolve(parseHash());
      if (target.redirect) return;
    }
    lastRenderedHash = location.hash;
    var key = target.name + '|' + (target.id || target.step || '');
    var same = key === current.key;
    var soft = !opts.force && (!!opts.soft || same);

    var view;
    try {
      view = VIEWS[target.name](target);
    } catch (e) {
      if (window.console) console.error(e);
      view = { html: '<section class="page"><div class="empty"><p class="empty-emoji">🛠️</p><p>' + esc(nb("Oups, cet écran n'a pas pu s'afficher.")) + '</p><a class="btn btn-primary" href="#/home">Retour à l\'accueil</a></div></section>' };
    }

    var order = (ORDER[target.name] || 0) + (target.step ? target.step / 10 : 0);
    var dir = order < current.order ? 'back' : 'forward';
    var first = current.name === null;

    var swap = function () {
      cleanup(soft);
      $view.innerHTML = view.html;
      $view.className = 'view view--' + target.name + (soft ? ' is-soft' : ' is-enter');
      current = { name: target.name, key: key, order: order };
      updateShell(target);
      if (!soft) {
        window.scrollTo(0, 0);
        if (!first) { try { $view.focus({ preventScroll: true }); } catch (e) { /* rien */ } }
        document.title = (view.title ? view.title + ' · ' : '') + T.appName;
      }
      if (view.mount) {
        try { view.mount($view, { soft: soft }); } catch (e) { if (window.console) console.error(e); }
      }
    };

    if (vt) { try { vt.skipTransition(); } catch (e) { /* rien */ } vt = null; }
    var useVT = HAS_VT && !REDUCED && !soft && !first && !opts.noTransition;
    if (useVT) {
      var htmlEl = document.documentElement;
      htmlEl.setAttribute('data-nav', dir);
      /* d'une étape d'inscription à l'autre, l'en-tête reste fixe (voir .vt-ob dans le CSS) */
      var obStep = (target.name === 'onboarding' || target.name === 'edit') && current.name === target.name;
      htmlEl.classList.toggle('vt-ob', obStep);
      try {
        var t = document.startViewTransition(swap);
        vt = t;
        var vtEnd = function () { if (vt === t) vt = null; if (!vt) htmlEl.classList.remove('vt-ob'); };
        if (t.ready) t.ready.catch(function () { /* transition sautée */ });
        if (t.finished) t.finished.then(vtEnd, vtEnd);
      } catch (e) {
        htmlEl.classList.remove('vt-ob');
        swap();
      }
    } else {
      swap();
    }
  }
  function refresh() { render({ soft: true }); }

  /* ================================================================
   * Coquille : barre latérale, barre du haut, barre d'onglets
   * ================================================================ */

  var NAV = [
    { id: 'home', label: 'Accueil', icon: 'home' },
    { id: 'explore', label: 'Explorer', icon: 'search' },
    { id: 'activities', label: 'Activités', icon: 'calendar' },
    { id: 'impact', label: 'Impact', icon: 'impact' }
  ];

  function shellHTML() {
    return '' +
      '<aside class="sidebar" aria-label="Navigation principale">' +
        '<a class="brand" href="#/home" data-logo aria-label="Campus Connect, accueil">' + logoHTML({ tagline: true }) + '</a>' +
        '<nav class="side-nav" id="side-nav">' +
          '<span class="nav-pill" aria-hidden="true"></span>' +
          NAV.map(function (n) {
            return '<a class="side-link" href="#/' + n.id + '" data-tab="' + n.id + '">' + icon(n.icon) + '<span>' + n.label + '</span></a>';
          }).join('') +
        '</nav>' +
        '<a class="btn btn-grad side-create" href="#/create" data-tab="create">' + icon('plus') + '<span>Créer une activité</span></a>' +
        '<div class="side-bottom">' +
          '<a class="side-me" href="#/me" data-tab="me" id="side-me"></a>' +
          '<p class="side-foot">' + esc(T.footer) + '</p>' +
        '</div>' +
      '</aside>' +
      '<header class="topbar">' +
        '<a class="brand brand--sm" href="#/home" data-logo aria-label="Campus Connect, accueil">' + logoHTML() + '</a>' +
        '<a class="topbar-me" href="#/me" data-tab="me" id="top-me" aria-label="Mon profil"></a>' +
      '</header>' +
      '<main id="view" class="view" tabindex="-1"></main>' +
      '<nav class="tabbar" id="tabbar" aria-label="Navigation">' +
        '<span class="nav-pill" aria-hidden="true"></span>' +
        '<a class="tab" href="#/home" data-tab="home">' + icon('home') + '<span>Accueil</span></a>' +
        '<a class="tab" href="#/explore" data-tab="explore">' + icon('search') + '<span>Explorer</span></a>' +
        '<a class="tab tab-create" href="#/create" data-tab="create" aria-label="Créer une activité"><span class="tab-create-btn">' + icon('plus') + '</span></a>' +
        '<a class="tab" href="#/activities" data-tab="activities">' + icon('calendar') + '<span>Activités</span></a>' +
        '<a class="tab" href="#/impact" data-tab="impact">' + icon('impact') + '<span>Impact</span></a>' +
      '</nav>' +
      '<div class="toasts" id="toasts" role="status" aria-live="polite"></div>' +
      '<div id="modal-root"></div>';
  }

  var TAB_OF = { home: 'home', explore: 'explore', person: 'explore', activities: 'activities', activity: 'activities', create: 'create', impact: 'impact', me: 'me', edit: 'me' };
  var lastMeSig = '';

  function updateShell(target) {
    var guest = target.name === 'welcome' || target.name === 'onboarding';
    document.body.classList.toggle('is-guest', guest);
    document.body.classList.toggle('is-onboarding', target.name === 'onboarding' || target.name === 'edit');
    var tab = TAB_OF[target.name] || '';
    $$('[data-tab]').forEach(function (a) {
      var on = a.getAttribute('data-tab') === tab;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    var me = S.me();
    var sig = me ? me.id + '|' + me.firstName + '|' + subtitle(me) : '';
    if (sig !== lastMeSig) {
      lastMeSig = sig;
      $('#side-me').innerHTML = me ? avatar(me, 40) + '<span class="side-me-txt"><strong>' + esc(me.firstName) + '</strong><span>Mon profil</span></span>' : '';
      $('#top-me').innerHTML = me ? avatar(me, 36) : '';
    }
    if (!guest) placePills(false);
  }

  var pillsReady = false;
  function placePill(container, vertical) {
    if (!container) return;
    var pill = $('.nav-pill', container);
    var active = $('[data-tab].is-active:not(.tab-create)', container);
    if (!pill) return;
    /* offsetParent vaut toujours null pour un élément position:fixed (barre d'onglets) */
    if (!active || !container.getClientRects().length) { pill.style.opacity = '0'; return; }
    var cr = container.getBoundingClientRect();
    var r = active.getBoundingClientRect();
    if (!r.width) { pill.style.opacity = '0'; return; }
    var inset = vertical ? 0 : 6;
    pill.style.width = (r.width - inset * 2) + 'px';
    pill.style.height = (r.height - inset * 2) + 'px';
    pill.style.transform = 'translate(' + (r.left - cr.left + inset) + 'px,' + (r.top - cr.top + inset) + 'px)';
    pill.style.opacity = '1';
  }
  function placePills(instant) {
    var nav1 = $('#tabbar'), nav2 = $('#side-nav');
    if (!pillsReady || instant) {
      [nav1, nav2].forEach(function (n) { if (n) n.classList.add('no-anim'); });
    }
    placePill(nav1, false);
    placePill(nav2, true);
    if (!pillsReady || instant) {
      pillsReady = true;
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        [nav1, nav2].forEach(function (n) { if (n) n.classList.remove('no-anim'); });
      }); });
    }
  }

  /* ================================================================
   * Morceaux d'interface réutilisables
   * ================================================================ */

  var R_IC = { teachesMe: '🎓', iTeach: '🤝', common: '💜' };

  function badgeForYou() { return '<span class="badge-foryou"><span>Pour toi</span></span>'; }
  function personBadges(p, isMe) {
    var b = '';
    if (isMe) b += '<span class="badge badge-me">C\'est toi</span>';
    if (p.team) b += '<span class="badge badge-team">' + icon('spark') + 'Équipe projet</span>';
    if (p.role === 'prof') b += '<span class="badge badge-prof">' + icon('graduation') + 'Prof</span>';
    return b ? '<span class="badges">' + b + '</span>' : '';
  }
  function passionChip(id, opts) {
    opts = opts || {};
    var pa = S.passion(id);
    if (!pa) return '';
    var c = catOf(pa.cat);
    var lvl = opts.level ? '<span class="lvl" title="' + esc(D.levels[opts.level]) + '">' + [1, 2, 3].map(function (n) { return '<i class="' + (n <= opts.level ? 'on' : '') + '"></i>'; }).join('') + '</span>' : '';
    return '<span class="pchip' + (opts.cls ? ' ' + opts.cls : '') + '" style="' + catStyle(c) + '">' +
      '<span class="pchip-emoji">' + esc(pa.emoji) + '</span>' + esc(pa.label) + lvl +
      (opts.level ? '<span class="sr-only">, ' + esc(D.levels[opts.level]) + '</span>' : '') + '</span>';
  }

  function topAffinityIds() {
    return S.affinities().slice(0, 3).map(function (a) { return a.person.id; });
  }

  function actCard(a, i, ctx) {
    ctx = ctx || {};
    var c = catOf(a.cat);
    var n = a.participants.length;
    var full = n >= a.max;
    var fy = S.isForMe(a);
    var mine = S.isIn(a);
    var me = S.me();
    var pct = Math.round(n / a.max * 100);
    var friends = (ctx.topIds || []).filter(function (id) { return a.participants.indexOf(id) >= 0 && (!me || id !== me.id); })
      .map(function (id) { var p = S.person(id); return p ? p.firstName : ''; }).filter(Boolean);
    var friendsLine = friends.length
      ? '<p class="act-friends">' + esc(friends.length > 1 ? friends.slice(0, -1).join(', ') + ' et ' + friends[friends.length - 1] + ' y vont' : friends[0] + ' y va') + '</p>'
      : '';
    var badges = (fy ? badgeForYou() : '') +
      (a.kind === 'atelier' ? '<span class="badge badge-prof">' + icon('graduation') + 'Animé par un prof</span>' : '') +
      (mine ? '<span class="badge badge-in">' + icon('check') + (a.organizerId === (me && me.id) ? 'Ton activité' : 'Tu y vas') + '</span>' : '') +
      (full && !mine ? '<span class="badge badge-full">Complet</span>' : '');
    var tag = ctx.preview ? 'div' : 'a';
    return '<' + tag + ' class="act-card tilt' + (fy ? ' is-foryou' : '') + (full ? ' is-full' : '') + (ctx.preview ? ' is-preview' : '') + '"' +
      (ctx.preview ? '' : ' href="#/activity/' + enc(a.id) + '"') + ' style="' + catStyle(c) + ';--i:' + Math.min(i || 0, 12) + '">' +
      '<span class="act-emoji' + emojiCls(a.emoji) + '" aria-hidden="true">' + esc(a.emoji) + '</span>' +
      '<span class="act-body">' +
        (badges ? '<span class="act-badges">' + badges + '</span>' : '') +
        '<span class="act-title">' + esc(a.title) + '</span>' +
        '<span class="act-meta">' + icon('clock') + '<span>' + esc(shortWhen(a.date)) + '</span></span>' +
        '<span class="act-meta">' + icon('pin') + '<span>' + esc(a.place) + '</span></span>' +
        '<span class="act-foot">' + avatarStack(a.participants, 4) +
          '<span class="act-count"><b>' + n + '</b>/' + a.max + '</span></span>' +
        '<span class="gauge" aria-hidden="true"><span style="width:' + pct + '%"></span></span>' +
        friendsLine +
      '</span>' +
    '</' + tag + '>';
  }

  function personCard(p, i, aff) {
    var dc = dominantCat(p);
    return '<a class="person-card tilt" href="#/person/' + enc(p.id) + '" style="--i:' + Math.min(i || 0, 12) + ';' + catStyle(dc) + '">' +
      '<span class="pc-top">' + avatar(p, 54) +
        '<span class="pc-id"><span class="pc-name">' + esc(fullName(p)) + '</span><span class="pc-sub">' + esc(subtitle(p)) + '</span></span>' +
      '</span>' +
      personBadges(p) +
      (aff && aff.details.length
        ? '<span class="reasons">' + aff.details.map(function (d) {
            return '<span class="reason r-' + d.type + '"><span class="r-ic" aria-hidden="true">' + R_IC[d.type] + '</span><span>' + esc(d.text) + '</span></span>';
          }).join('') + '</span>'
        : (p.bio ? '<span class="pc-bio">' + esc(p.bio) + '</span>' : '')) +
      '<span class="mini-chips">' + (p.passions || []).slice(0, 4).map(function (x) {
        var pa = S.passion(x.id);
        return pa ? '<span class="mchip' + ((p.teach || []).indexOf(x.id) >= 0 ? ' is-teach' : '') + '">' + esc(pa.emoji) + ' ' + esc(pa.label) + '</span>' : '';
      }).join('') + '</span>' +
    '</a>';
  }

  function emptyState(emoji, txt, cta) {
    return '<div class="empty"><p class="empty-emoji" aria-hidden="true">' + emoji + '</p><p>' + esc(nb(txt)) + '</p>' + (cta || '') + '</div>';
  }

  function footer() { return '<footer class="foot">' + esc(T.footer) + '</footer>'; }

  /* ================================================================
   * Vue : Bienvenue
   * ================================================================ */

  VIEWS.welcome = function () {
    var st = S.stats();
    var words = String(T.welcomeTitle).split(' ');
    var chris = S.person('chris');
    var foot = S.activity('foot-5v5');
    var jam = S.activity('jam-piano-guitare');
    var piano = S.passion('piano');
    var floats = '';
    if (chris && piano) {
      floats += '<div class="float-card fc-1">' + avatar(chris, 46) +
        '<div class="fc-txt"><strong>' + esc(chris.firstName) + '</strong><span>' + esc(nb('transmet ' + piano.withArticle + ' ' + piano.emoji)) + '</span></div></div>';
    }
    if (jam) {
      floats += '<div class="float-card fc-2"><span class="fc-emoji' + emojiCls(jam.emoji) + '">' + esc(jam.emoji) + '</span><div class="fc-txt">' + badgeForYou() + '<strong>' + esc(jam.title) + '</strong><span>' +
        esc(shortWhen(jam.date)) + ' · ' + jam.participants.length + '/' + jam.max + '</span></div></div>';
    }
    if (foot) {
      floats += '<div class="float-card fc-3"><span class="fc-emoji">' + esc(foot.emoji) + '</span><div class="fc-txt"><strong>' + esc(foot.title) + '</strong><span>' +
        esc(shortWhen(foot.date)) + '</span><span class="gauge"><span style="width:' + Math.round(foot.participants.length / foot.max * 100) + '%"></span></span></div></div>';
    }
    floats += '<div class="float-card fc-4"><span class="fc-emoji">🤝</span><div class="fc-txt"><strong>' + esc(nb('Tu peux lui apprendre la guitare')) + '</strong><span>Échange de talents</span></div></div>';

    return {
      title: 'Bienvenue',
      html:
        '<section class="welcome">' +
          '<div class="aurora" aria-hidden="true"><i></i><i></i><i></i><i></i></div>' +
          '<canvas class="welcome-canvas" id="welcome-canvas" aria-hidden="true"></canvas>' +
          '<div class="welcome-grain" aria-hidden="true"></div>' +
          '<div class="welcome-inner">' +
            '<div class="welcome-brand" data-logo>' + logoHTML({ big: true, animate: true }) + '</div>' +
            '<p class="welcome-tagline"><span>' + esc(T.tagline) + '</span></p>' +
            '<h1 class="welcome-title">' + words.map(function (w, i) {
              return '<span class="w" style="--i:' + i + '">' + esc(nb(w)) + '</span>';
            }).join(' ') + '</h1>' +
            '<p class="welcome-text">' + esc(nb(T.welcomeText)) + '</p>' +
            '<div class="welcome-cta">' +
              '<button type="button" class="btn btn-cta btn-xl" data-action="start"><span>Créer mon profil</span>' + icon('arrow') + '</button>' +
              '<p class="welcome-proof"><span class="live-dot" aria-hidden="true"></span>' + st.members + ' inscrits · ' + plural(st.upcoming, 'activité', 'activités') + ' cette semaine</p>' +
            '</div>' +
            '<ul class="welcome-points">' + T.welcomePoints.map(function (p, i) {
              return '<li style="--i:' + i + '"><span class="wp-ic" aria-hidden="true">' + (['🎯', '🤝', '📍'][i] || '✨') + '</span><span>' + esc(nb(p)) + '</span></li>';
            }).join('') + '</ul>' +
          '</div>' +
          '<div class="welcome-float" aria-hidden="true">' + floats + '</div>' +
          '<footer class="welcome-foot">' + esc(T.footer) + '</footer>' +
        '</section>',
      mount: function (root) {
        var cv = $('#welcome-canvas', root);
        var r = callFx('welcomeNetwork', [cv]);
        if (r.ok && r.value) fxHandles.push(r.value);
        else if (cv) cv.style.display = 'none';
      }
    };
  };

  /* ================================================================
   * Vue : Inscription / Modifier mon profil (3 étapes)
   * ================================================================ */

  function draftHasName(mode) {
    var d = draft && draft.mode === mode ? draft : (restoredDraft && restoredDraft.mode === mode ? restoredDraft : null);
    return !!(d && String(d.firstName || '').trim());
  }
  /* Le brouillon survit à un rechargement de page (Cmd + R en pleine inscription). */
  function readSavedDraft() {
    var d = null;
    try {
      var raw = window.sessionStorage.getItem('cc_draft');
      window.sessionStorage.removeItem('cc_draft');
      if (raw) d = JSON.parse(raw);
    } catch (e) { d = null; }
    if (!d || (d.mode !== 'onboarding' && d.mode !== 'edit') || !Array.isArray(d.passions) || !Array.isArray(d.teach) || !Array.isArray(d.learn)) return null;
    return d;
  }
  function saveDraftForReload() {
    try { if (draft) window.sessionStorage.setItem('cc_draft', JSON.stringify(draft)); } catch (e) { /* stockage indisponible */ }
  }

  function ensureDraft(mode) {
    if (draft && draft.mode === mode) return draft;
    if (restoredDraft && restoredDraft.mode === mode) { draft = restoredDraft; restoredDraft = null; return draft; }
    var me = S.me();
    if (mode === 'edit' && me) {
      draft = {
        mode: mode, firstName: me.firstName, role: me.role, program: me.program, bio: me.bio || '',
        visible: me.visible !== false,
        passions: (me.passions || []).map(function (x) { return { id: x.id, level: x.level }; }),
        teach: (me.teach || []).slice(), learn: (me.learn || []).slice()
      };
    } else {
      draft = { mode: mode, firstName: '', role: 'etudiant', program: D.programs[0], bio: '', visible: true, passions: [], teach: [], learn: [] };
    }
    return draft;
  }
  function draftHas(id) { return draft.passions.some(function (x) { return x.id === id; }); }
  function draftLevel(id) { for (var i = 0; i < draft.passions.length; i++) if (draft.passions[i].id === id) return draft.passions[i].level; return 0; }

  var OB_STEPS = [
    { title: "D'abord, toi", sub: null },
    { title: 'Ce que tu aimes', sub: 'Choisis tout ce qui te plaît, puis dis-nous ton niveau.' },
    { title: 'Apprendre, transmettre', sub: "Trois maximum de chaque côté. C'est ce qui permet de trouver les bons échanges." }
  ];

  function programField() {
    if (draft.role === 'prof') {
      return '<label class="label" for="ob-program">Ta matière</label>' +
        '<input class="input" id="ob-program" data-draft="program" maxlength="40" placeholder="Ex. : Marketing digital" value="' + esc(draft.program) + '">' +
        '<p class="field-error" data-err="program"></p>';
    }
    var opts = D.programs.map(function (p) { return '<option' + (p === draft.program ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('');
    return '<label class="label" for="ob-program">Ta filière</label>' +
      '<div class="select"><select class="input" id="ob-program" data-draft="program">' + opts + '</select></div>';
  }

  function obStep1() {
    return '' +
      '<div class="field">' +
        '<label class="label" for="ob-first">Ton prénom</label>' +
        '<input class="input input-lg" id="ob-first" data-draft="firstName" autocomplete="given-name" maxlength="30" placeholder="Ton prénom" value="' + esc(draft.firstName) + '">' +
        '<p class="field-error" data-err="firstName"></p>' +
      '</div>' +
      '<fieldset class="field">' +
        '<legend class="label">Tu es</legend>' +
        '<div class="seg seg-2">' +
          '<label class="seg-opt"><input type="radio" name="ob-role" value="etudiant" data-draft="role"' + (draft.role !== 'prof' ? ' checked' : '') + '><span>🎒 Étudiant·e</span></label>' +
          '<label class="seg-opt"><input type="radio" name="ob-role" value="prof" data-draft="role"' + (draft.role === 'prof' ? ' checked' : '') + '><span>🎓 Prof</span></label>' +
        '</div>' +
      '</fieldset>' +
      '<div class="field" id="ob-program-wrap">' + programField() + '</div>' +
      '<div class="field">' +
        '<label class="label" for="ob-bio">Ta bio <span class="opt">facultative</span></label>' +
        '<textarea class="input" id="ob-bio" data-draft="bio" maxlength="140" rows="3" placeholder="' + esc(nb("En une phrase : ce que tu aimes, ce que tu cherches…")) + '">' + esc(draft.bio) + '</textarea>' +
        '<p class="counter"><span id="bio-count">' + draft.bio.length + '</span>/140</p>' +
      '</div>' +
      '<label class="check">' +
        '<input type="checkbox" data-draft="visible"' + (draft.visible ? ' checked' : '') + '>' +
        '<span class="check-box" aria-hidden="true">' + icon('check') + '</span>' +
        '<span>Mon profil est visible par le campus</span>' +
      '</label>' +
      '<p class="privacy">' + icon('lock') + '<span>' + esc(nb(T.privacyLine)) + '</span></p>';
  }

  /* Le mot « passion(s) » disparaît sur petit écran (compteur dans l'en-tête). */
  function counterText(n) {
    return '<b class="flip">' + n + '</b> <span class="occ-w">' + (n > 1 ? 'passions' : 'passion') + ' </span>' + (n > 1 ? 'choisies' : 'choisie');
  }

  function levelsHTML() {
    if (!draft.passions.length) return '<p class="hint">' + esc(nb('Tes passions apparaîtront ici : tu pourras dire ton niveau pour chacune.')) + '</p>';
    return draft.passions.map(function (x) {
      var pa = S.passion(x.id);
      if (!pa) return '';
      return '<div class="level-row" data-row="' + esc(x.id) + '" style="' + catStyle(catOf(pa.cat)) + '">' +
        '<span class="level-name"><span aria-hidden="true">' + esc(pa.emoji) + '</span> ' + esc(pa.label) + '</span>' +
        '<span class="seg seg-3 seg-sm" role="radiogroup" aria-label="' + esc('Niveau en ' + pa.label) + '">' +
          [1, 2, 3].map(function (l) {
            return '<button type="button" class="seg-btn' + (x.level === l ? ' is-on' : '') + '" role="radio" aria-checked="' + (x.level === l) + '" data-action="set-level" data-id="' + esc(x.id) + '" data-level="' + l + '">' + esc(D.levels[l]) + '</button>';
          }).join('') +
        '</span>' +
      '</div>';
    }).join('');
  }

  function obStep2() {
    return '' +
      '<div class="cat-blocks">' +
        D.categories.map(function (c, ci) {
          var list = D.passions.filter(function (p) { return p.cat === c.id; });
          return '<section class="cat-block" style="' + catStyle(c) + ';--i:' + ci + '">' +
            '<h3 class="cat-block-title"><span aria-hidden="true">' + esc(c.emoji) + '</span> ' + esc(c.label) + '</h3>' +
            '<div class="chips">' + list.map(function (p) {
              var on = draftHas(p.id);
              return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" data-action="toggle-passion" data-id="' + esc(p.id) + '" aria-pressed="' + on + '">' +
                '<span class="chip-emoji" aria-hidden="true">' + esc(p.emoji) + '</span>' + esc(p.label) + '<span class="chip-check" aria-hidden="true">' + icon('check') + '</span></button>';
            }).join('') + '</div>' +
          '</section>';
        }).join('') +
      '</div>' +
      '<section class="levels card">' +
        '<h3 class="levels-title">Ton niveau</h3>' +
        '<div id="ob-levels">' + levelsHTML() + '</div>' +
      '</section>' +
      '<p class="field-error" data-err="passions"></p>';
  }

  function teachChips() {
    if (!draft.passions.length) return '<p class="hint">' + esc(nb("Choisis d'abord tes passions à l'étape précédente.")) + '</p>';
    return draft.passions.map(function (x) {
      var pa = S.passion(x.id);
      if (!pa) return '';
      var on = draft.teach.indexOf(x.id) >= 0;
      var off = !on && draft.learn.indexOf(x.id) >= 0;
      return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" style="' + catStyle(catOf(pa.cat)) + '" data-action="toggle-teach" data-id="' + esc(x.id) + '" aria-pressed="' + on + '"' + (off ? ' disabled title="Déjà dans J\'apprends"' : '') + '>' +
        '<span class="chip-emoji" aria-hidden="true">' + esc(pa.emoji) + '</span>' + esc(pa.label) + '<span class="chip-check" aria-hidden="true">' + icon('check') + '</span></button>';
    }).join('');
  }
  function learnChips() {
    return D.categories.map(function (c) {
      var list = D.passions.filter(function (p) { return p.cat === c.id; });
      return '<div class="learn-cat" style="' + catStyle(c) + '"><span class="learn-cat-title"><span aria-hidden="true">' + esc(c.emoji) + '</span> ' + esc(c.label) + '</span><div class="chips">' +
        list.map(function (p) {
          var on = draft.learn.indexOf(p.id) >= 0;
          var off = !on && draft.teach.indexOf(p.id) >= 0;
          return '<button type="button" class="chip chip-sm' + (on ? ' is-on' : '') + '" data-action="toggle-learn" data-id="' + esc(p.id) + '" aria-pressed="' + on + '"' + (off ? ' disabled title="Déjà dans Je transmets"' : '') + '>' +
            '<span class="chip-emoji" aria-hidden="true">' + esc(p.emoji) + '</span>' + esc(p.label) + '<span class="chip-check" aria-hidden="true">' + icon('check') + '</span></button>';
        }).join('') + '</div></div>';
    }).join('');
  }

  function obStep3() {
    return '' +
      '<section class="ob-block card">' +
        '<div class="ob-block-head"><h2>Je transmets</h2><span class="madskills">' + icon('spark') + esc(T.madSkills) + '</span><span class="quota" id="q-teach">' + draft.teach.length + '/3</span></div>' +
        '<p class="hint">' + esc(nb('Ce que tu peux montrer aux autres, pris dans tes passions.')) + '</p>' +
        '<div class="chips" id="ob-teach">' + teachChips() + '</div>' +
      '</section>' +
      '<section class="ob-block card">' +
        '<div class="ob-block-head"><h2>J\'apprends</h2><span class="quota" id="q-learn">' + draft.learn.length + '/3</span></div>' +
        '<p class="hint">' + esc(nb("Ce que tu aimerais apprendre, même en partant de zéro.")) + '</p>' +
        '<div id="ob-learn">' + learnChips() + '</div>' +
      '</section>';
  }

  function viewOb(target) {
    var mode = target.name === 'edit' ? 'edit' : 'onboarding';
    ensureDraft(mode);
    var step = target.step;
    var meta = OB_STEPS[step - 1];
    var pct = Math.round(step / 3 * 100);
    var fromPct = ui.lastObPct;
    var body = step === 1 ? obStep1() : step === 2 ? obStep2() : obStep3();
    var last = step === 3;
    var nextLabel = last ? (mode === 'edit' ? 'Enregistrer' : 'Créer mon profil') : 'Continuer';
    var sub = meta.sub || (mode === 'edit' ? 'Change ce que tu veux, puis enregistre à la dernière étape.' : T.onboardingIntro);
    return {
      title: mode === 'edit' ? 'Modifier mon profil' : 'Inscription',
      html:
        '<section class="ob ob--step' + step + '">' +
          '<div class="ob-aurora" aria-hidden="true"><i></i><i></i><i></i></div>' +
          '<header class="ob-head">' +
            '<button type="button" class="icon-btn" data-action="ob-back" aria-label="Retour">' + icon('back') + '</button>' +
            '<div class="ob-progress" role="progressbar" aria-valuemin="0" aria-valuemax="3" aria-valuenow="' + step + '" aria-label="Progression">' +
              '<span class="ob-progress-fill" style="width:' + fromPct + '%" data-to="' + pct + '"></span>' +
            '</div>' +
            (step === 2 ? '<span class="ob-counter" id="ob-counter" aria-live="polite">' + counterText(draft.passions.length) + '</span>' : '') +
            '<span class="ob-step">' + step + '/3</span>' +
          '</header>' +
          '<form class="ob-card" id="ob-form" data-form="ob" novalidate>' +
            '<p class="eyebrow">' + (mode === 'edit' ? 'Modifier mon profil · ' : '') + 'Étape ' + step + ' sur 3</p>' +
            '<h1 class="ob-title" data-demo-fill="ob" data-step="' + step + '">' + esc(meta.title) + '</h1>' +
            '<p class="ob-sub">' + esc(nb(sub)) + '</p>' +
            '<div class="ob-fields">' + body + '</div>' +
            '<div class="ob-actions">' +
              (step > 1 ? '<button type="button" class="btn btn-ghost" data-action="ob-back">Retour</button>' : '<span></span>') +
              '<button type="submit" class="btn btn-primary btn-lg ob-next">' + esc(nextLabel) + icon(last ? 'check' : 'arrow') + '</button>' +
            '</div>' +
          '</form>' +
        '</section>',
      mount: function (root) {
        ui.lastObPct = pct;
        var fill = $('.ob-progress-fill', root);
        if (fill) {
          if (REDUCED) fill.style.width = pct + '%';
          else frame(function () { frame(function () { fill.style.width = pct + '%'; }); });
        }
      }
    };
  }
  VIEWS.onboarding = viewOb;
  VIEWS.edit = viewOb;

  function showError(name, msg) {
    var el = $('[data-err="' + name + '"]', $view);
    if (el) { el.textContent = nb(msg); el.classList.remove('is-shown'); void el.offsetWidth; el.classList.add('is-shown'); }
    var input = name === 'firstName' ? $('#ob-first') : name === 'program' ? $('#ob-program') : null;
    if (input) {
      input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake');
      input.setAttribute('aria-invalid', 'true');
      try { input.focus(); } catch (e) { /* rien */ }
    }
  }
  function clearErrors() {
    $$('[data-err]', $view).forEach(function (el) { el.textContent = ''; el.classList.remove('is-shown'); });
    $$('[aria-invalid]', $view).forEach(function (el) { el.removeAttribute('aria-invalid'); });
  }

  function obStepOf() { var t = resolve(parseHash()); return t.step || 1; }
  function obBase() { return draft && draft.mode === 'edit' ? '#/edit/' : '#/onboarding/'; }

  function obNext() {
    if (!draft) return;
    var step = obStepOf();
    clearErrors();
    if (step === 1) {
      draft.firstName = String(draft.firstName || '').replace(/\s+/g, ' ').trim();
      if (!draft.firstName) { showError('firstName', 'Dis-nous ton prénom.'); return; }
      if (draft.role === 'prof' && !String(draft.program || '').trim()) { showError('program', 'Indique la matière que tu enseignes.'); return; }
      go(obBase() + '2');
      return;
    }
    if (step === 2) {
      if (!draft.passions.length) {
        showError('passions', 'Choisis au moins une passion pour continuer.');
        var blocks = $('.cat-blocks', $view);
        if (blocks) { blocks.classList.remove('shake'); void blocks.offsetWidth; blocks.classList.add('shake'); }
        return;
      }
      go(obBase() + '3');
      return;
    }
    obFinish();
  }

  function obFinish() {
    if (!draft.firstName) { go(obBase() + '1'); return; }
    if (!draft.passions.length) { go(obBase() + '2'); return; }
    var profile = {
      firstName: draft.firstName, lastName: '', role: draft.role, program: draft.program,
      passions: draft.passions, teach: draft.teach, learn: draft.learn, bio: draft.bio, visible: draft.visible
    };
    if (draft.mode === 'edit') {
      var u = S.updateMe(profile);
      if (!u.ok) { toast("Impossible d'enregistrer, vérifie ton prénom.", '⚠️'); go('#/edit/1'); return; }
      draft = null;
      ui.lastObPct = 0;
      go('#/me');
      toast('Profil mis à jour');
      return;
    }
    var r = S.register(profile);
    if (!r.ok) { toast('Il manque ton prénom.', '⚠️'); go('#/onboarding/1'); return; }
    draft = null;
    ui.lastObPct = 0;
    ui.pendingReveal = true;
    ui.pulses.push([r.person.id]);
    lastMeSig = '';
    go('#/home', { noTransition: true });
  }

  function obBack() {
    var step = obStepOf();
    if (step > 1) { go(obBase() + (step - 1)); return; }
    var edit = draft && draft.mode === 'edit';
    ui.lastObPct = 0;
    if (edit) { draft = null; go('#/me'); } else go('#/welcome');
  }

  function togglePassion(btn) {
    var id = btn.getAttribute('data-id');
    if (draftHas(id)) {
      draft.passions = draft.passions.filter(function (x) { return x.id !== id; });
      draft.teach = draft.teach.filter(function (x) { return x !== id; });
    } else {
      draft.passions.push({ id: id, level: 2 });
    }
    var on = draftHas(id);
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', String(on));
    pop(btn);
    var counter = $('#ob-counter');
    if (counter) counter.innerHTML = counterText(draft.passions.length);
    var lv = $('#ob-levels');
    if (lv) {
      lv.innerHTML = levelsHTML();
      if (on) { var row = $('[data-row="' + id + '"]', lv); if (row) row.classList.add('is-new'); }
    }
    if (draft.passions.length) clearErrors();
  }

  function pop(el) {
    if (REDUCED || !el) return;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }
  function shake(el) {
    if (!el) return;
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  }

  function toggleTeachLearn(btn, kind) {
    var id = btn.getAttribute('data-id');
    var list = draft[kind];
    var i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    else {
      if (list.length >= 3) {
        shake(btn);
        toast('3 maximum. Retire un choix pour en ajouter un autre.', '✋');
        return;
      }
      list.push(id);
    }
    var t = $('#ob-teach'), l = $('#ob-learn');
    var sy = window.scrollY;
    if (t) t.innerHTML = teachChips();
    if (l) l.innerHTML = learnChips();
    window.scrollTo(0, sy);
    var q1 = $('#q-teach'), q2 = $('#q-learn');
    if (q1) q1.textContent = draft.teach.length + '/3';
    if (q2) q2.textContent = draft.learn.length + '/3';
    var again = $('[data-action="toggle-' + kind + '"][data-id="' + id + '"]', $view);
    if (again) { pop(again); try { again.focus({ preventScroll: true }); } catch (e) { /* rien */ } }
    pop(kind === 'teach' ? q1 : q2);
  }

  function demoFillOb(step) {
    var m = D.demo && D.demo.marissa;
    if (!m || !draft) return;
    if (step === 1) {
      draft.firstName = m.firstName; draft.role = m.role; draft.program = m.program; draft.bio = m.bio; draft.visible = m.visible !== false;
    } else if (step === 2) {
      draft.passions = m.passions.map(function (x) { return { id: x.id, level: x.level }; });
      draft.teach = draft.teach.filter(function (id) { return draftHas(id); });
    } else {
      m.passions.forEach(function (x) { if (!draftHas(x.id)) draft.passions.push({ id: x.id, level: x.level }); });
      draft.teach = m.teach.slice();
      draft.learn = m.learn.slice();
    }
    refresh();
    $$('.input, .chip.is-on, .seg-btn.is-on, .seg-opt input:checked + span', $view).forEach(function (el, i) {
      el.style.setProperty('--fi', Math.min(i, 10));
      el.classList.add('flash');
    });
    /* Étape 3 : « J'apprends : Piano » est le choix qui compte, on le montre au-dessus de la barre du bas. */
    if (step === 3) {
      var learnOn = $('#ob-learn .chip.is-on', $view);
      if (learnOn) { try { learnOn.scrollIntoView({ block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' }); } catch (e) { /* rien */ } }
    }
  }

  /* ================================================================
   * Vue : Accueil
   * ================================================================ */

  VIEWS.home = function () {
    var me = S.me();
    var affs = S.affinities();
    var topIds = affs.slice(0, 3).map(function (a) { return a.person.id; });
    var week = S.upcoming().filter(function (a) { return dayDiff(new Date(a.date)) <= 7; });
    var learn = me.learn || [];
    var scored = week.map(function (a) {
      var fy = S.isForMe(a);
      var s = 0;
      if (fy) {
        s = 1 + (learn.indexOf(a.passion) >= 0 ? 1 : 0);
        a.participants.forEach(function (id) { if (topIds.indexOf(id) >= 0) s++; });
      }
      return { a: a, fy: fy, s: s };
    });
    scored.sort(function (x, y) {
      if (x.fy !== y.fy) return x.fy ? -1 : 1;
      if (y.s !== x.s) return y.s - x.s;
      return S.time(x.a) - S.time(y.a);
    });
    var shown = scored.slice(0, 6).map(function (x) { return x.a; });
    var forYouCount = scored.filter(function (x) { return x.fy; }).length;
    var st = S.stats();
    var now = S.now();

    var cats = D.categories.map(function (c, i) {
      return '<a class="cat-tile tilt" href="#/explore?cat=' + enc(c.id) + '" style="' + catStyle(c) + ';--i:' + i + '">' +
        '<span class="cat-emoji" aria-hidden="true">' + esc(c.emoji) + '</span><span class="cat-label">' + esc(c.label) + '</span></a>';
    }).join('');

    var summary = [];
    summary.push('<span class="hero-chip">' + (forYouCount ? '🎯 ' + plural(forYouCount, 'activité', 'activités') + ' pour toi' : '🗓️ ' + plural(week.length, 'activité', 'activités') + ' cette semaine') + '</span>');
    if (affs.length) summary.push('<span class="hero-chip">💜 ' + plural(affs.length, 'personne', 'personnes') + ' avec qui ça colle</span>');

    return {
      title: 'Accueil',
      html:
        '<section class="page home">' +
          '<header class="home-hero">' +
            '<div class="hero-aurora" aria-hidden="true"><i></i><i></i><i></i></div>' +
            '<div class="hero-content">' +
              '<p class="hero-date">' + esc(cap(fmtDay(now))) + '</p>' +
              '<h1 class="hero-title">Salut ' + esc(me.firstName) + ' <span class="wave" aria-hidden="true">👋</span></h1>' +
              '<div class="hero-chips">' + summary.join('') + '</div>' +
            '</div>' +
            '<div class="hero-orbit" aria-hidden="true">' + affs.slice(0, 3).map(function (a, i) { return '<span class="orbit-av o' + i + '">' + avatar(a.person, 46) + '</span>'; }).join('') +
              '<span class="orbit-me">' + avatar(me, 64) + '</span></div>' +
          '</header>' +

          '<section class="section">' +
            '<div class="section-head"><h2 class="section-title">Cette semaine</h2>' +
              '<a class="link-more" href="#/activities">Tout voir' + icon('arrow') + '</a></div>' +
            (shown.length
              ? '<div class="act-grid stagger">' + shown.map(function (a, i) { return actCard(a, i, { topIds: topIds }); }).join('') + '</div>'
              : emptyState('🗓️', T.emptyStates.activities, '<a class="btn btn-primary" href="#/create">Créer une activité</a>')) +
          '</section>' +

          '<section class="section">' +
            '<div class="section-head"><h2 class="section-title">Tes affinités</h2>' +
              '<a class="link-more" href="#/explore">Explorer' + icon('arrow') + '</a></div>' +
            '<p class="section-sub">Des gens avec qui ça colle, et pourquoi.</p>' +
            (affs.length
              ? '<div class="people-grid people-grid--3 stagger">' + affs.slice(0, 3).map(function (a, i) { return personCard(a.person, i, a); }).join('') + '</div>'
              : emptyState('💜', T.emptyStates.affinities, '<a class="btn btn-primary" href="#/edit/2">Ajouter des passions</a>')) +
          '</section>' +

          /* Les activités et les affinités passent avant la grille des catégories :
           * c'est ce que l'Accueil doit montrer sans défiler (scénario de démo). */
          '<section class="section">' +
            '<div class="section-head"><h2 class="section-title">' + esc(nb("Qu'est-ce que tu cherches aujourd'hui ?")) + '</h2></div>' +
            '<div class="cat-grid stagger">' + cats + '</div>' +
          '</section>' +

          '<a class="impact-banner tilt" href="#/impact">' +
            '<span class="ib-glow" aria-hidden="true"></span>' +
            '<span class="ib-title">' + icon('impact') + 'Ce que l\'app a déjà lancé</span>' +
            '<span class="ib-stats">' +
              '<span><b data-count="' + st.members + '">' + st.members + '</b> inscrits</span>' +
              '<span><b data-count="' + st.participations + '">' + st.participations + '</b> participations</span>' +
              '<span><b data-count="' + st.connections + '">' + st.connections + '</b> connexions</span>' +
            '</span>' +
            '<span class="ib-cta">Voir l\'impact' + icon('arrow') + '</span>' +
          '</a>' +
          footer() +
        '</section>',
      mount: function (root, info) {
        if (!info.soft) {
          $$('.impact-banner [data-count]', root).forEach(function (el) {
            countUp(el, 0, parseInt(el.getAttribute('data-count'), 10) || 0, 1100);
          });
        }
        if (ui.pendingReveal) {
          ui.pendingReveal = false;
          showReveal();
        }
      }
    };
  };

  /* Rejoue l'entrée de l'écran (après la révélation, qui la cachait) :
   * cascade, main qui salue, avatars en orbite, compteurs du bandeau Impact. */
  function replayEnter() {
    if (REDUCED || !$view) return;
    $view.classList.remove('is-enter', 'is-soft');
    void $view.offsetWidth;
    $view.classList.add('is-enter');
    $$('.wave, .orbit-av', $view).forEach(function (el) {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
    });
    $$('.impact-banner [data-count]', $view).forEach(function (el) {
      countUp(el, 0, parseInt(el.getAttribute('data-count'), 10) || 0, 1100);
    });
  }

  function showReveal() {
    var me = S.me();
    if (!me) return;
    var matches = S.affinities().slice(0, 3).map(function (a) { return { person: a.person, reasons: a.reasons }; });
    if (!matches.length) { toast('Bienvenue ' + me.firstName + ' !', '👋'); return; }
    var done = function () { replayEnter(); };
    var r = callFx('revealMatches', [me, matches, done]);
    if (r.ok) return;
    /* Repli sans fx.js : même contenu, en fenêtre animée. */
    openModal(
      '<div class="modal-body reveal-fb">' +
        '<p class="eyebrow">' + esc(nb('Ton profil est prêt')) + '</p>' +
        '<h2 id="modal-title">' + esc(nb('On a trouvé tes personnes 👀')) + '</h2>' +
        '<div class="reveal-me">' + avatar(me, 76) + '</div>' +
        '<ul class="reveal-list">' + matches.map(function (m, i) {
          return '<li style="--i:' + i + '">' + avatar(m.person, 50) + '<div class="rv-txt"><strong>' + esc(fullName(m.person)) + '</strong><span>' + esc(m.reasons[0] || '') + '</span></div></li>';
        }).join('') + '</ul>' +
        '<button type="button" class="btn btn-cta btn-lg btn-block" data-action="reveal-done" data-autofocus>' + esc(nb("C'est parti")) + icon('arrow') + '</button>' +
      '</div>', { cls: 'modal--reveal', onClose: done });
  }

  /* ================================================================
   * Vue : Explorer
   * ================================================================ */

  function filterChip(action, value, label, on, style, count) {
    return '<button type="button" class="fchip' + (on ? ' is-on' : '') + '" data-action="' + action + '" data-value="' + esc(value) + '" aria-pressed="' + on + '"' + (style ? ' style="' + style + '"' : '') + '>' +
      label + (count !== undefined ? '<span class="fchip-count">' + count + '</span>' : '') + '</button>';
  }

  VIEWS.explore = function (target) {
    var q = target.query || {};
    ui.explore = { q: String(q.q || '').slice(0, 60), cat: S.category(q.cat) ? q.cat : '', teach: q.teach === '1' };
    var e = ui.explore;
    return {
      title: 'Explorer',
      html:
        '<section class="page explore">' +
          '<header class="page-head">' +
            '<h1 class="page-title">Explorer</h1>' +
            '<p class="page-sub">' + esc(nb("Cherche quelqu'un par prénom, passion ou envie d'apprendre.")) + '</p>' +
          '</header>' +
          '<div class="explore-tools">' +
            '<label class="search">' + icon('search') +
              '<span class="sr-only">Rechercher</span>' +
              '<input type="search" id="explore-q" class="search-input" placeholder="' + esc(nb('Un prénom, une passion, un mot…')) + '" autocomplete="off" value="' + esc(e.q) + '">' +
              '<button type="button" class="search-clear" data-action="clear-search" aria-label="Effacer la recherche"' + (e.q ? '' : ' hidden') + '>' + icon('close') + '</button>' +
            '</label>' +
            '<div class="chip-strip" id="explore-cats" role="toolbar" aria-label="Catégories">' +
              filterChip('explore-cat', '', 'Toutes', !e.cat) +
              D.categories.map(function (c) { return filterChip('explore-cat', c.id, '<span aria-hidden="true">' + esc(c.emoji) + '</span> ' + esc(c.label), e.cat === c.id, catStyle(c)); }).join('') +
            '</div>' +
            '<label class="switch">' +
              '<input type="checkbox" id="explore-teach"' + (e.teach ? ' checked' : '') + '>' +
              '<span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>' +
              '<span>' + esc(nb("Peut m'apprendre quelque chose")) + '</span>' +
            '</label>' +
          '</div>' +
          '<p class="result-count" id="explore-count" aria-live="polite"></p>' +
          '<div class="people-grid stagger" id="explore-results"></div>' +
          footer() +
        '</section>',
      mount: function () { renderExploreResults(true); }
    };
  };

  function renderExploreResults(animate) {
    var box = $('#explore-results'), count = $('#explore-count');
    if (!box) return;
    var me = S.me();
    var e = ui.explore;
    var words = norm(e.q).split(/\s+/).filter(Boolean);
    var affMap = {};
    S.affinities().forEach(function (a) { affMap[a.person.id] = a; });
    var list = S.people().filter(function (p) {
      if (me && p.id === me.id) return false;
      if (p.visible === false) return false;
      if (e.cat) {
        var inCat = (p.passions || []).some(function (x) { var pa = S.passion(x.id); return pa && pa.cat === e.cat; });
        if (!inCat) return false;
      }
      if (e.teach && !S.canTeachMe(p)) return false;
      if (words.length) {
        var hay = norm([p.firstName, p.lastName, p.program, p.bio, p.role === 'prof' ? 'prof' : 'etudiant']
          .concat((p.passions || []).map(function (x) { var pa = S.passion(x.id); return pa ? pa.label + ' ' + pa.id : ''; }))
          .concat((p.learn || []).map(function (id) { var pa = S.passion(id); return pa ? pa.label : ''; }))
          .join(' '));
        for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) === -1) return false;
      }
      return true;
    });
    list.sort(function (a, b) {
      var sa = affMap[a.id] ? affMap[a.id].score : 0, sb = affMap[b.id] ? affMap[b.id].score : 0;
      if (sb !== sa) return sb - sa;
      if (!!b.team !== !!a.team) return b.team ? 1 : -1;
      return a.firstName.localeCompare(b.firstName, 'fr');
    });
    if (count) count.textContent = list.length ? plural(list.length, 'personne', 'personnes') : '';
    restagger(box, animate);
    if (!list.length) {
      box.innerHTML = emptyState('🔎', e.teach ? T.emptyStates.canTeachMe : (e.cat && !words.length ? T.emptyStates.category : T.emptyStates.search));
    } else {
      box.innerHTML = list.map(function (p, i) { return personCard(p, i, affMap[p.id]); }).join('');
    }
  }

  /* Les filtres vivent dans l'adresse, sans nouvelle entrée d'historique :
   * « Retour » depuis un profil ou une activité les retrouve. */
  function syncHash(base, params) {
    var parts = [];
    Object.keys(params).forEach(function (k) { if (params[k]) parts.push(k + '=' + enc(params[k])); });
    var h = base + (parts.length ? '?' + parts.join('&') : '');
    if (location.hash === h) return;
    lastRenderedHash = h;
    try { history.replaceState(history.state, '', h); } catch (e) { try { location.replace(h); } catch (e2) { /* rien */ } }
  }
  function syncExploreHash() { var e = ui.explore; syncHash('#/explore', { q: e.q, cat: e.cat, teach: e.teach ? '1' : '' }); }
  function syncActsHash() { syncHash('#/activities', { f: ui.acts.f === 'all' ? '' : ui.acts.f }); }

  /* Les cartes insérées dans un écran « is-enter » apparaissent en cascade ;
   * no-rise coupe cette cascade (frappe dans la recherche). */
  function restagger(box, animate) {
    if (box) box.classList.toggle('no-rise', !animate);
  }

  /* ================================================================
   * Vue : Activités
   * ================================================================ */

  VIEWS.activities = function (target) {
    var q = target.query || {};
    var f = q.f === 'pourtoi' || S.category(q.f) ? q.f : 'all';
    ui.acts = { f: f };
    var up = S.upcoming();
    var nFy = up.filter(S.isForMe).length;
    return {
      title: 'Activités',
      html:
        '<section class="page activities">' +
          '<header class="page-head page-head--row">' +
            '<div><h1 class="page-title">Activités</h1>' +
            '<p class="page-sub">' + esc(nb('Ce qui se passe sur le campus dans les prochains jours.')) + '</p></div>' +
            '<a class="btn btn-soft" href="#/create">' + icon('plus') + 'Créer</a>' +
          '</header>' +
          '<div class="chip-strip" id="acts-filters" role="toolbar" aria-label="Filtres">' +
            filterChip('acts-filter', 'all', 'Tout', f === 'all', '', up.length) +
            filterChip('acts-filter', 'pourtoi', '🎯 Pour toi', f === 'pourtoi', '', nFy) +
            D.categories.map(function (c) { return filterChip('acts-filter', c.id, '<span aria-hidden="true">' + esc(c.emoji) + '</span> ' + esc(c.label), f === c.id, catStyle(c)); }).join('') +
          '</div>' +
          '<div id="acts-list" class="stagger"></div>' +
          footer() +
        '</section>',
      mount: function () { renderActsList(true); }
    };
  };

  function renderActsList(animate) {
    var box = $('#acts-list');
    if (!box) return;
    var f = ui.acts.f;
    var topIds = topAffinityIds();
    restagger(box, animate);
    var list = S.upcoming().filter(function (a) {
      if (f === 'all') return true;
      if (f === 'pourtoi') return S.isForMe(a);
      return a.cat === f;
    });
    if (!list.length) {
      var txt = f === 'pourtoi' ? T.emptyStates.forYou : f === 'all' ? T.emptyStates.activities : T.emptyStates.category;
      box.innerHTML = emptyState('🗓️', txt, '<a class="btn btn-primary" href="#/create">Créer une activité</a>');
      return;
    }
    var groups = [];
    list.forEach(function (a) {
      var d = new Date(a.date);
      var k = isoDay(d);
      var g = groups[groups.length - 1];
      if (!g || g.k !== k) { g = { k: k, label: dayLabel(d), items: [] }; groups.push(g); }
      g.items.push(a);
    });
    var i = 0;
    box.innerHTML = groups.map(function (g) {
      return '<section class="day-group">' +
        '<h2 class="day-title" style="--i:' + Math.min(i++, 12) + '"><span>' + esc(g.label) + '</span><span class="day-count">' + plural(g.items.length, 'activité', 'activités') + '</span></h2>' +
        '<div class="act-grid">' + g.items.map(function (a) { return actCard(a, i++, { topIds: topIds }); }).join('') + '</div>' +
      '</section>';
    }).join('');
  }

  /* ================================================================
   * Vue : Détail d'une activité
   * ================================================================ */

  function actionHTML(a) {
    var me = S.me();
    var isOrg = me && a.organizerId === me.id;
    var isIn = S.isIn(a);
    var full = S.isFull(a);
    var past = S.isPast(a);
    var id = esc(a.id);
    if (past) return '<button type="button" class="btn btn-lg btn-block" disabled>Terminée</button>';
    if (isOrg) {
      return '<p class="action-note">' + icon('spark') + 'C\'est ton activité</p>' +
        '<button type="button" class="btn btn-danger-ghost btn-lg btn-block" data-action="cancel-activity" data-id="' + id + '">Annuler l\'activité</button>';
    }
    if (isIn) {
      return '<p class="action-note is-in">' + icon('check') + 'Tu participes</p>' +
        '<button type="button" class="btn btn-ghost btn-lg btn-block" data-action="leave" data-id="' + id + '">Je ne viens plus</button>';
    }
    if (full) return '<button type="button" class="btn btn-lg btn-block btn-full" disabled>Complet</button>';
    return '<button type="button" class="btn btn-cta btn-lg btn-block btn-join" data-action="join" data-id="' + id + '"><span>Participer</span>' + icon('arrow') + '</button>';
  }

  function placesLeftN(left) {
    if (left <= 0) return 'Complet';
    if (left === 1) return "Plus qu'une place";
    return left <= 3 ? 'Plus que ' + left + ' places' : left + ' places libres';
  }
  function placesLeft(a) { return placesLeftN(a.max - a.participants.length); }

  /* Petit écart (4 → 5) : l'ancien chiffre sort par le haut, le nouveau arrive par le bas,
   * puis un petit rebond. Grand écart : compteur classique. */
  function rollNumber(el, from, to, ms) {
    if (!el) return;
    if (REDUCED || !el.animate || Math.abs(to - from) > 3) { countUp(el, from, to, ms); return; }
    var dir = to > from ? -1 : 1;
    el.classList.add('roll');
    el.innerHTML = '<span class="roll-old">' + from + '</span><span class="roll-new">' + to + '</span>';
    var o = el.firstChild, n = el.lastChild, ended = false;
    var end = function () {
      if (ended) return;
      ended = true;
      if (!el.contains(n)) return;
      el.classList.remove('roll');
      el.textContent = String(to);
      try { el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.16)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'ease-out' }); } catch (e) { /* rien */ }
    };
    try {
      o.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(' + (dir * 100) + '%)', opacity: 0 }],
        { duration: ms * 0.75, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
      var an = n.animate([{ transform: 'translateY(' + (-dir * 100) + '%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
        { duration: ms, delay: ms * 0.2, easing: 'cubic-bezier(.2,1.5,.45,1)', fill: 'backwards' });
      an.onfinish = end;
    } catch (e) { end(); }
    setTimeout(end, ms * 1.2 + 400);
  }

  VIEWS.activity = function (target) {
    var a = S.activity(target.id);
    var me = S.me();
    var c = catOf(a.cat);
    var pa = S.passion(a.passion);
    var org = S.person(a.organizerId);
    var n = a.participants.length;
    var anim = ui.joinAnim && ui.joinAnim.id === a.id ? ui.joinAnim : null;
    var shownN = anim ? anim.from : n;
    var leftNow = placesLeft(a);
    var leftShown = anim ? placesLeftN(a.max - anim.from) : leftNow;
    var pct = Math.round(n / a.max * 100);
    var fromPct = anim ? Math.round(anim.from / a.max * 100) : pct;
    var orgAff = org && me ? S.affinityWith(me, org) : null;
    var isOrgMe = me && org && org.id === me.id;
    var parts = a.participants.map(S.person).filter(Boolean);

    var info = [
      [icon('calendar'), cap(fmtWhen(a.date)), relDays(a.date)],
      [icon('pin'), a.place, ''],
      [icon('level'), D.activityLevels[a.level] || 'Tous niveaux', a.level === 'debutant' ? 'Débutants bienvenus' : '']
    ];
    if (a.kind === 'atelier') info.push([icon('graduation'), 'Animé par un prof', '']);

    var action = actionHTML(a);
    var orgCard = org ? '<a class="card organizer tilt" href="#/' + (isOrgMe ? 'me' : 'person/' + enc(org.id)) + '">' +
        avatar(org, 52) +
        '<span class="org-txt"><span class="org-label">' + (a.kind === 'atelier' ? 'Animé par' : 'Organisé par') + '</span>' +
        '<span class="org-name">' + esc(isOrgMe ? 'Toi' : fullName(org)) + '</span>' +
        (orgAff && orgAff.details.length ? '<span class="org-reason">' + R_IC[orgAff.details[0].type] + ' ' + esc(orgAff.details[0].text) + '</span>' : '<span class="org-sub">' + esc(subtitle(org)) + '</span>') +
        '</span>' + icon('arrow', 'org-arrow') + '</a>' : '';

    return {
      title: a.title,
      html:
        '<article class="page act-detail" style="' + catStyle(c) + '">' +
          '<a class="back-link" href="#/activities" data-action="back" data-fallback="#/activities">' + icon('back') + 'Retour</a>' +
          '<header class="ad-hero">' +
            '<div class="ad-hero-bg" aria-hidden="true"><i></i><i></i></div>' +
            '<span class="ad-emoji' + emojiCls(a.emoji) + '" aria-hidden="true">' + esc(a.emoji) + '</span>' +
            '<div class="ad-hero-txt">' +
              '<div class="ad-badges">' +
                '<span class="badge badge-cat">' + esc(c.emoji) + ' ' + esc(c.label) + '</span>' +
                (pa ? '<span class="badge badge-cat">' + esc(pa.emoji) + ' ' + esc(pa.label) + '</span>' : '') +
                (S.isForMe(a) ? badgeForYou() : '') +
              '</div>' +
              '<h1 class="ad-title">' + esc(a.title) + '</h1>' +
              '<p class="ad-when">' + esc(cap(fmtWhen(a.date))) + ' · ' + esc(a.place) + '</p>' +
            '</div>' +
          '</header>' +
          '<div class="ad-grid">' +
            '<div class="ad-main stagger">' +
              '<div class="card ad-people" style="--i:0">' +
                '<div class="ag-head">' +
                  '<span class="ag-count"><b id="ag-n">' + shownN + '</b><span>/' + a.max + '</span></span>' +
                  '<span class="ag-label">participants</span>' +
                  '<span class="ag-left' + (shownN >= a.max ? ' is-full' : '') + '" id="ag-left" data-final="' + esc(leftNow) + '">' + esc(leftShown) + '</span>' +
                '</div>' +
                '<div class="gauge gauge-lg" aria-hidden="true"><span id="ag-bar" style="width:' + fromPct + '%" data-to="' + pct + '"></span></div>' +
                '<div class="participants">' + parts.map(function (p, i) {
                  var isMeP = me && p.id === me.id;
                  var cls = 'part' + (anim && isMeP ? ' is-new' : '');
                  var href = isMeP ? '#/me' : '#/person/' + enc(p.id);
                  return '<a class="' + cls + '" href="' + href + '" style="--i:' + Math.min(i, 12) + '">' + avatar(p, 48) +
                    '<span class="part-name">' + esc(isMeP ? 'Toi' : p.firstName) + '</span>' +
                    (p.id === a.organizerId ? '<span class="part-tag">orga</span>' : '') + '</a>';
                }).join('') +
                Array.apply(null, Array(Math.max(0, Math.min(a.max - n, 6)))).map(function () {
                  return '<span class="part part--free" aria-hidden="true"><span class="avatar avatar--free" style="--s:48px">+</span><span class="part-name">libre</span></span>';
                }).join('') +
                '</div>' +
              '</div>' +
              '<div class="card ad-info" style="--i:1">' + info.map(function (row) {
                return '<div class="info-row">' + row[0] + '<span class="info-main">' + esc(row[1]) + '</span>' + (row[2] ? '<span class="info-tag">' + esc(row[2]) + '</span>' : '') + '</div>';
              }).join('') + '</div>' +
              (a.description ? '<div class="card ad-desc" style="--i:2"><h2 class="card-title">Le programme</h2><p>' + esc(nb(a.description)) + '</p></div>' : '') +
            '</div>' +
            '<aside class="ad-side">' +
              orgCard +
              '<div class="ad-action ad-action--desk">' + action + '</div>' +
            '</aside>' +
          '</div>' +
          '<div class="ad-action ad-action--mobile">' + action + '</div>' +
          footer() +
        '</article>',
      mount: function (root) {
        var bar = $('#ag-bar', root);
        if (anim) {
          ui.joinAnim = null;
          rollNumber($('#ag-n', root), anim.from, anim.to, 560);
          var leftEl = $('#ag-left', root);
          if (leftEl && leftEl.textContent !== leftEl.getAttribute('data-final')) {
            later(function () {
              leftEl.textContent = leftEl.getAttribute('data-final');
              leftEl.classList.toggle('is-full', n >= a.max);
              pop(leftEl);
            }, REDUCED ? 0 : 620);
          }
          if (bar) {
            if (REDUCED) bar.style.width = pct + '%';
            else frame(function () { frame(function () { bar.style.width = pct + '%'; }); });
          }
          var gauge = bar && bar.parentNode;
          if (gauge && anim.to > anim.from) { gauge.classList.add('is-pulse'); }
        }
        if (ui.justCreated === a.id) {
          ui.justCreated = null;
          var hero = $('.ad-hero', root);
          if (hero) hero.classList.add('is-new');
        }
      }
    };
  };

  /* Mise à jour ciblée de l'écran courant : seuls les blocs listés sont remplacés.
   * Le reste (bandeau, emoji, fonds qui dérivent) ne bouge pas et ne rejoue pas son entrée. */
  function patchView(sels) {
    var target = resolve(parseHash());
    var key = target.name + '|' + (target.id || target.step || '');
    if (target.redirect || key !== current.key || !VIEWS[target.name]) { refresh(); return; }
    var view;
    try { view = VIEWS[target.name](target); } catch (e) { refresh(); return; }
    var tmp = document.createElement('div');
    tmp.innerHTML = view.html;
    var pairs = [], ok = true;
    sels.forEach(function (sel) {
      var olds = $$(sel, $view), news = $$(sel, tmp);
      if (!olds.length || olds.length !== news.length) ok = false;
      else olds.forEach(function (o, i) { pairs.push([o, news[i]]); });
    });
    if (!ok) { refresh(); return; }
    $view.classList.remove('is-enter');
    $view.classList.add('is-soft');
    pairs.forEach(function (pr) { if (pr[0].parentNode) pr[0].parentNode.replaceChild(pr[1], pr[0]); });
    if (view.mount) { try { view.mount($view, { soft: true, patch: true }); } catch (e) { if (window.console) console.error(e); } }
  }
  var ACT_PATCH = ['.ad-people', '.ad-action--desk', '.ad-action--mobile'];

  function doJoin(btn) {
    var id = btn.getAttribute('data-id');
    var r0 = btn.getBoundingClientRect();
    var res = S.join(id);
    if (!res.ok) {
      var msg = { full: "Trop tard, c'est complet.", past: 'Cette activité est déjà passée.', already: 'Tu participes déjà.' }[res.error] || 'Impossible de rejoindre cette activité.';
      toast(msg, '⚠️');
      refresh();
      return;
    }
    ui.joinAnim = { id: id, from: res.from, to: res.to };
    patchView(ACT_PATCH);
    if (!REDUCED) callFx('confetti', [r0.left + r0.width / 2, r0.top + r0.height / 2]);
    /* Téléphone : la jauge doit rester visible (le toast s'affiche en haut). */
    if (window.innerWidth < 900) {
      var num = $('#ag-n', $view), card = $('.ad-people', $view);
      if (num && card) {
        var rr = num.getBoundingClientRect();
        if (rr.top < 150 || rr.bottom > window.innerHeight - 200) {
          try { card.scrollIntoView({ block: 'center', behavior: REDUCED ? 'auto' : 'smooth' }); } catch (e) { /* rien */ }
        }
      }
    }
    toast("C'est noté, tu y vas ! 🎉", icon('check'));
  }

  function doLeave(btn) {
    var id = btn.getAttribute('data-id');
    var a = S.activity(id);
    var from = a ? a.participants.length : 0;
    var res = S.leave(id);
    if (!res.ok) { toast("Impossible de te retirer de cette activité.", '⚠️'); return; }
    ui.joinAnim = { id: id, from: from, to: from - 1 };
    patchView(ACT_PATCH);
    toast('Ta place est libérée.', '👋');
  }

  /* ================================================================
   * Vue : Créer une activité
   * ================================================================ */

  function dayOptions(selected) {
    var base = startOfDay(S.now());
    var out = [];
    for (var i = 0; i < 14; i++) {
      var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      var v = isoDay(d);
      var label = i === 0 ? "Aujourd'hui · " + DAYS_SHORT[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]
        : i === 1 ? 'Demain · ' + DAYS_SHORT[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]
        : cap(fmtDay(d));
      out.push('<option value="' + v + '"' + (v === selected ? ' selected' : '') + '>' + esc(label) + '</option>');
    }
    return out.join('');
  }
  function passionOptions(catId, selected) {
    return D.passions.filter(function (p) { return p.cat === catId; }).map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (p.id === selected ? ' selected' : '') + '>' + esc(p.emoji + ' ' + p.label) + '</option>';
    }).join('');
  }

  /* « autour de » + article : du piano, des jeux vidéo, de la guitare, de l'IA, d'Excel. */
  function deArt(w) {
    w = String(w || '');
    if (/^le /i.test(w)) return 'du ' + w.slice(3);
    if (/^les /i.test(w)) return 'des ' + w.slice(4);
    if (/^l'/i.test(w) || /^la /i.test(w)) return 'de ' + w;
    if (/^[aeiouyàâéèêëîïôûh]/i.test(w)) return "d'" + w;
    return 'de ' + w;
  }
  /* « Session piano », mais « Session IA », « Session BD & mangas », « Session Excel & data ». */
  function sessionTitle(pa) {
    var l = pa.label;
    var keepCase = /^[A-ZÀ-Ý]{2}/.test(l) || /^Excel/.test(l);
    return 'Session ' + (keepCase ? l : l.charAt(0).toLowerCase() + l.slice(1));
  }

  VIEWS.create = function (target) {
    var q = target.query || {};
    var me = S.me();
    var pre = ui.createPrefill;
    ui.createPrefill = null;
    var withP = q['with'] ? S.person(q['with']) : null;
    var pa = S.passion(q.passion) || (me.passions[0] && S.passion(me.passions[0].id)) || D.passions[0];
    var tomorrow = new Date(S.now().getTime() + 864e5);
    var v = pre || {
      title: q.passion && pa ? sessionTitle(pa) : '',
      cat: pa.cat, passion: pa.id, day: isoDay(tomorrow), time: '18:00',
      place: D.places[0], max: 8, level: 'tous', description: '', emoji: ''
    };
    var banner = withP && q.passion
      ? '<div class="propose-banner">' + avatar(withP, 36) + '<span>' + esc(nb('Tu proposes une activité à ' + withP.firstName + ', autour ' + deArt(pa.withArticle || pa.label) + '. Elle sera ouverte à tout le campus.')) + '</span></div>'
      : '';
    return {
      title: 'Créer une activité',
      html:
        '<section class="page create">' +
          '<header class="page-head">' +
            '<h1 class="page-title" data-demo-fill="create">Créer une activité</h1>' +
            '<p class="page-sub">' + esc(nb('Deux minutes pour lancer une activité. Elle sera marquée « Pour toi » chez celles et ceux qui ont cette passion ou veulent l\'apprendre.')) + '</p>' +
          '</header>' +
          banner +
          '<div class="create-grid">' +
            '<form class="card form create-form" id="create-form" data-form="create" novalidate>' +
              '<input type="hidden" name="emoji" value="' + esc(v.emoji) + '">' +
              '<div class="field">' +
                '<label class="label" for="cf-title">Titre</label>' +
                '<input class="input input-lg" id="cf-title" name="title" maxlength="60" placeholder="Ex. : Foot du jeudi, jam au foyer…" value="' + esc(v.title) + '">' +
                '<p class="field-error" data-err="title"></p>' +
              '</div>' +
              '<fieldset class="field">' +
                '<legend class="label">Catégorie</legend>' +
                '<div class="cat-pick">' + D.categories.map(function (c) {
                  return '<label class="cat-opt" style="' + catStyle(c) + '"><input type="radio" name="cat" value="' + esc(c.id) + '"' + (c.id === v.cat ? ' checked' : '') + '>' +
                    '<span><span class="cat-opt-emoji" aria-hidden="true">' + esc(c.emoji) + '</span>' + esc(c.label) + '</span></label>';
                }).join('') + '</div>' +
              '</fieldset>' +
              '<div class="field">' +
                '<label class="label" for="cf-passion">Passion</label>' +
                '<div class="select"><select class="input" id="cf-passion" name="passion">' + passionOptions(v.cat, v.passion) + '</select></div>' +
              '</div>' +
              '<div class="field-row">' +
                '<div class="field"><label class="label" for="cf-day">Jour</label>' +
                  '<div class="select"><select class="input" id="cf-day" name="day">' + dayOptions(v.day) + '</select></div></div>' +
                '<div class="field field--time"><label class="label" for="cf-time">Heure</label>' +
                  '<input class="input" type="time" id="cf-time" name="time" step="900" value="' + esc(v.time) + '"></div>' +
              '</div>' +
              '<p class="field-error" data-err="date"></p>' +
              '<div class="field-row">' +
                '<div class="field"><label class="label" for="cf-place">Lieu</label>' +
                  '<div class="select"><select class="input" id="cf-place" name="place">' + D.places.map(function (p) {
                    return '<option' + (p === v.place ? ' selected' : '') + '>' + esc(p) + '</option>';
                  }).join('') + '</select></div></div>' +
                '<div class="field field--places"><label class="label" for="cf-max">Places</label>' +
                  '<div class="stepper">' +
                    '<button type="button" class="step-btn" data-action="step" data-d="-1" aria-label="Une place de moins">' + icon('minus') + '</button>' +
                    '<input class="input" type="number" inputmode="numeric" id="cf-max" name="max" min="2" max="30" value="' + esc(v.max) + '">' +
                    '<button type="button" class="step-btn" data-action="step" data-d="1" aria-label="Une place de plus">' + icon('plus') + '</button>' +
                  '</div></div>' +
              '</div>' +
              '<p class="field-error" data-err="max"></p>' +
              '<fieldset class="field">' +
                '<legend class="label">Niveau</legend>' +
                '<div class="seg seg-3">' + ['tous', 'debutant', 'confirme'].map(function (l) {
                  return '<label class="seg-opt"><input type="radio" name="level" value="' + l + '"' + (l === v.level ? ' checked' : '') + '><span>' + esc(D.activityLevels[l]) + '</span></label>';
                }).join('') + '</div>' +
              '</fieldset>' +
              '<div class="field">' +
                '<label class="label" for="cf-desc">Description <span class="opt">facultative</span></label>' +
                '<textarea class="input" id="cf-desc" name="description" rows="3" maxlength="280" placeholder="' + esc(nb('Ce qu\'on va faire, ce qu\'il faut apporter…')) + '">' + esc(v.description) + '</textarea>' +
              '</div>' +
              '<button type="submit" class="btn btn-cta btn-lg btn-block create-submit"><span>Publier l\'activité</span>' + icon('arrow') + '</button>' +
            '</form>' +
            '<aside class="create-preview" aria-label="Aperçu">' +
              '<p class="eyebrow">Aperçu</p>' +
              '<div id="create-preview"></div>' +
              '<p class="hint">' + esc(nb('Voilà comment les autres verront ta carte.')) + '</p>' +
            '</aside>' +
          '</div>' +
          footer() +
        '</section>',
      mount: function () { updatePreview(); }
    };
  };

  function readCreateForm() {
    var f = $('#create-form');
    if (!f) return null;
    var val = function (n) { var el = f.elements[n]; return el ? el.value : ''; };
    var cat = $('input[name="cat"]:checked', f);
    var level = $('input[name="level"]:checked', f);
    return {
      title: val('title'), cat: cat ? cat.value : 'sport', passion: val('passion'),
      day: val('day'), time: val('time') || '18:00', place: val('place'),
      max: parseInt(val('max'), 10), level: level ? level.value : 'tous',
      description: val('description'), emoji: val('emoji')
    };
  }

  function updatePreview() {
    var box = $('#create-preview');
    var v = readCreateForm();
    if (!box || !v) return;
    var me = S.me();
    var pa = S.passion(v.passion);
    var dm = String(v.day).split('-');
    var hm = String(v.time).split(':');
    var d = new Date(+dm[0], (+dm[1]) - 1, +dm[2], parseInt(hm[0], 10) || 0, parseInt(hm[1], 10) || 0);
    if (isNaN(d.getTime())) d = new Date(S.now().getTime() + 864e5);
    var max = clamp(parseInt(v.max, 10) || 2, 2, 30);
    var fake = {
      id: 'apercu', title: String(v.title).trim() || 'Ton activité', emoji: v.emoji || (pa ? pa.emoji : '✨'),
      cat: v.cat, passion: v.passion, kind: me.role === 'prof' ? 'atelier' : 'activite',
      date: d.toISOString(), place: v.place, max: max, level: v.level,
      organizerId: me.id, participants: [me.id]
    };
    box.innerHTML = actCard(fake, 0, { preview: true });
  }

  function submitCreate(form) {
    var v = readCreateForm();
    if (!v) return;
    clearErrors();
    var btn = $('.create-submit', form);
    var r0 = btn ? btn.getBoundingClientRect() : null;
    var res = S.createActivity(v);
    if (!res.ok) {
      var map = {
        title: ['title', 'Donne un titre à ton activité.'],
        pastDate: ['date', 'Ce moment est déjà passé, choisis une autre heure ou un autre jour.'],
        date: ['date', 'Choisis un jour et une heure.'],
        max: ['max', 'Entre 2 et 30 places.'],
        cat: ['title', 'Choisis une catégorie.']
      };
      var m = map[res.error] || ['title', 'Vérifie le formulaire.'];
      showError(m[0], m[1]);
      var field = m[0] === 'title' ? $('#cf-title') : m[0] === 'date' ? $('#cf-time') : $('#cf-max');
      if (field) { shake(field); try { field.focus(); } catch (e) { /* rien */ } }
      return;
    }
    ui.justCreated = res.activity.id;
    /* On remplace l'entrée « Créer » de l'historique : « Retour » ne ramène pas sur un formulaire vide. */
    pendingOpts = null;
    replaceHash('#/activity/' + enc(res.activity.id));
    if (r0 && !REDUCED) setTimeout(function () { callFx('confetti', [r0.left + r0.width / 2, Math.min(r0.top, window.innerHeight - 80)]); }, 60);
    toast('Activité publiée 🎉');
  }

  function demoFillCreate() {
    var s = D.demo && D.demo.songActivity;
    var f = $('#create-form');
    if (!s || !f) return;
    var when = S.nextOccurrence(s.when.weekday, s.when.time);
    var set = function (n, v) { var el = f.elements[n]; if (el) el.value = v; };
    set('title', s.title);
    set('emoji', s.emoji || '');
    var catInput = $('input[name="cat"][value="' + s.cat + '"]', f);
    if (catInput) catInput.checked = true;
    var ps = $('#cf-passion', f);
    if (ps) { ps.innerHTML = passionOptions(s.cat, s.passion); ps.value = s.passion; }
    var dayVal = isoDay(when);
    var ds = $('#cf-day', f);
    if (ds) {
      if (!$('option[value="' + dayVal + '"]', ds)) ds.insertAdjacentHTML('beforeend', '<option value="' + dayVal + '">' + esc(cap(fmtDay(when))) + '</option>');
      ds.value = dayVal;
    }
    set('time', s.when.time);
    set('place', s.place);
    set('max', s.max);
    var lv = $('input[name="level"][value="' + s.level + '"]', f);
    if (lv) lv.checked = true;
    set('description', s.description || '');
    updatePreview();
    $$('.input, .cat-opt input:checked + span, .seg-opt input:checked + span', f).forEach(function (el, i) {
      el.style.setProperty('--fi', Math.min(i, 10));
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    });
    var card = $('#create-preview .act-card');
    pop(card);
  }

  /* ================================================================
   * Vue : Impact
   * ================================================================ */

  VIEWS.impact = function () {
    var st = S.stats();
    var base = S.state.baseline;
    var me = S.me();
    var delta = function (k) {
      if (!base || !me) return '';
      /* Activités : on compte celles créées depuis l'arrivée (une activité du seed qui passe
       * pendant la démo ne doit pas effacer le +1). */
      var d = k === 'upcoming' ? S.upcoming().filter(function (a) { return a.createdByMe; }).length : st[k] - base[k];
      return d > 0 ? '<span class="delta">+' + d + ' depuis ton arrivée</span>' : '';
    };
    var kpis = [
      { k: 'members', label: 'inscrits', sub: 'dont ' + plural(st.profs, 'prof', 'profs'), emoji: '🙋' },
      { k: 'upcoming', label: 'activités à venir', sub: 'sur le campus', emoji: '🗓️' },
      { k: 'participations', label: 'participations', sub: 'places prises', emoji: '🙌' },
      { k: 'connections', label: 'connexions créées', sub: 'demandes de contact', emoji: '🔗' },
      { k: 'exchanges', label: 'échanges de talents possibles', sub: "l'un transmet ce que l'autre veut apprendre", emoji: '🎓' }
    ];
    var maxBar = Math.max.apply(null, st.byCategory.map(function (b) { return b.count; }).concat([1]));
    var hasGraph = !!fx('campusGraph');
    return {
      title: 'Impact',
      html:
        '<section class="page impact">' +
          '<header class="page-head">' +
            '<p class="eyebrow eyebrow--live"><span class="live-dot" aria-hidden="true"></span>En direct</p>' +
            '<h1 class="page-title">Impact</h1>' +
            '<p class="page-sub">' + esc(nb(T.impactIntro)) + '</p>' +
          '</header>' +
          '<div class="kpis stagger">' + kpis.map(function (k, i) {
            return '<div class="kpi kpi--' + k.k + (i === 0 ? ' kpi--hero' : '') + '" style="--i:' + i + '">' +
              '<span class="kpi-emoji" aria-hidden="true">' + k.emoji + '</span>' +
              '<span class="kpi-num" data-count="' + st[k.k] + '">' + st[k.k] + '</span>' +
              '<span class="kpi-label">' + esc(k.label) + '</span>' +
              '<span class="kpi-sub">' + esc(k.sub) + '</span>' +
              delta(k.k) +
            '</div>';
          }).join('') + '</div>' +
          '<div class="impact-grid">' +
            (hasGraph
              ? '<section class="card graph-card">' +
                  '<div class="card-head"><h2 class="card-title">Réseau du campus</h2><span class="graph-meta">' + st.members + ' personnes · ' + st.connections + ' connexions</span></div>' +
                  '<div class="graph-wrap"><canvas id="campus-graph" aria-label="Graphe des connexions entre les membres du campus" role="img"></canvas></div>' +
                  '<div class="graph-legend">' +
                    '<span class="gl-item"><i class="gl-line" aria-hidden="true"></i>Connexion</span>' +
                    '<span class="gl-item"><i class="gl-dash" aria-hidden="true"></i>Échange de talents possible</span>' +
                    (me ? '<span class="gl-item"><i class="gl-me" aria-hidden="true">Toi</i>' + esc(me.firstName) + '</span>' : '') +
                  '</div>' +
                  '<p class="graph-hint">' + esc(nb('Chaque point est une personne, de la couleur de sa passion principale. Survole ou touche un point pour voir qui c\'est.')) + '</p>' +
                  '<div class="legend">' + D.categories.map(function (c) {
                    return '<span class="legend-item"><i style="background:' + c.color + '"></i>' + esc(c.label) + '</span>';
                  }).join('') + '</div>' +
                '</section>'
              : '') +
            '<section class="card top-card">' +
              '<h2 class="card-title">Top 3 des activités</h2>' +
              (st.top.length ? '<ol class="top-list">' + st.top.map(function (a, i) {
                var c = catOf(a.cat);
                var pct = Math.round(a.participants.length / a.max * 100);
                return '<li style="' + catStyle(c) + ';--i:' + i + '"><a href="#/activity/' + enc(a.id) + '" class="top-item">' +
                  '<span class="top-rank">' + (i + 1) + '</span>' +
                  '<span class="top-emoji' + emojiCls(a.emoji) + '" aria-hidden="true">' + esc(a.emoji) + '</span>' +
                  '<span class="top-txt"><span class="top-title">' + esc(a.title) + '</span><span class="top-when">' + esc(shortWhen(a.date)) + '</span>' +
                  '<span class="gauge"><span class="grow" style="--w:' + pct + '%"></span></span></span>' +
                  '<span class="top-count"><b>' + a.participants.length + '</b>/' + a.max + '</span>' +
                '</a></li>';
              }).join('') + '</ol>' : emptyState('🗓️', T.emptyStates.topActivities)) +
            '</section>' +
            '<section class="card bars-card">' +
              '<h2 class="card-title">Passions déclarées par catégorie</h2>' +
              '<div class="bars">' + st.byCategory.map(function (b, i) {
                return '<div class="bar-row" style="' + catStyle(b.cat) + ';--i:' + i + '">' +
                  '<span class="bar-label"><span aria-hidden="true">' + esc(b.cat.emoji) + '</span> ' + esc(b.cat.label) + '</span>' +
                  '<span class="bar-track"><span class="bar-fill grow" style="--w:' + Math.round(b.count / maxBar * 100) + '%"></span></span>' +
                  '<span class="bar-val" data-count="' + b.count + '">' + b.count + '</span>' +
                '</div>';
              }).join('') + '</div>' +
            '</section>' +
          '</div>' +
          '<p class="demo-note">' + esc(T.impactDisclaimer) + '</p>' +
          footer() +
        '</section>',
      mount: function (root, info) {
        if (!info.soft) {
          $$('.kpi-num[data-count]', root).forEach(function (el, i) {
            var to = parseInt(el.getAttribute('data-count'), 10) || 0;
            el.textContent = '0';
            later(function () { countUp(el, 0, to, 1300); }, 120 + i * 90);
          });
          $$('.bar-val[data-count]', root).forEach(function (el, i) {
            var to = parseInt(el.getAttribute('data-count'), 10) || 0;
            el.textContent = '0';
            later(function () { countUp(el, 0, to, 900); }, 300 + i * 70);
          });
        }
        frame(function () { frame(function () { root.classList.add('is-grown'); }); });
        var cv = $('#campus-graph', root);
        if (cv) {
          var r = callFx('campusGraph', [cv, { people: S.people(), connections: S.state.connections, categories: D.categories, meId: S.state.me, legend: false }]);
          var g = r.ok ? r.value : null;
          if (g) {
            fxHandles.push(g);
            /* [personne] = nouveau membre ; [moi, autre] = nouvelle connexion (le lien s'allume).
             * fx attend que le graphe soit à l'écran avant de jouer les pulsations. */
            var pulses = ui.pulses.slice();
            ui.pulses = [];
            pulses.forEach(function (pp, i) {
              later(function () { try { if (typeof g.pulse === 'function') g.pulse(pp[0], pp[1]); } catch (e) { /* rien */ } }, 1300 + i * 600);
            });
          } else {
            var card = cv.closest('.graph-card');
            if (card) card.style.display = 'none';
          }
        }
      }
    };
  };

  /* ================================================================
   * Vues : Profil d'une personne / Mon profil
   * ================================================================ */

  function proposePassion(me, p, aff) {
    if (aff) {
      if (aff.teachesMe.length) return aff.teachesMe[0];
      if (aff.iTeach.length) return aff.iTeach[0];
      if (aff.common.length) return aff.common[0];
    }
    return (p.teach && p.teach[0]) || (p.passions[0] && p.passions[0].id) || '';
  }

  function profileHTML(p, isMe) {
    var me = S.me();
    var aff = !isMe && me ? S.affinityWith(me, p) : null;
    var dc = dominantCat(p);
    var organized = S.organizedBy(p.id).filter(function (a) { return !S.isPast(a); });
    var topIds = isMe ? [] : topAffinityIds();
    var requested = !isMe && (S.hasRequested(p.id));
    var connected = !isMe && me && S.isConnected(me.id, p.id);

    var actions = isMe
      ? '<a class="btn btn-primary" href="#/edit/1" data-action="edit-profile">' + icon('edit') + 'Modifier mon profil</a>'
      : (requested
          ? '<button type="button" class="btn btn-done" disabled>' + esc(T.contactSent) + '</button>'
          : '<button type="button" class="btn btn-primary" data-action="contact" data-id="' + esc(p.id) + '">' + icon('chat') + 'Contacter</button>') +
        '<a class="btn btn-soft" href="#/create?passion=' + enc(proposePassion(me, p, aff)) + '&with=' + enc(p.id) + '">' + icon('plus') + 'Proposer une activité</a>';

    var why = aff && aff.details.length
      ? '<section class="card why" style="--i:0"><h2 class="card-title">' + esc(nb('Pourquoi ça colle')) + '</h2><ul class="why-list">' +
          aff.details.map(function (d) {
            return '<li class="r-' + d.type + '"><span class="r-ic" aria-hidden="true">' + R_IC[d.type] + '</span><span>' + esc(d.text) + '</span>' +
              '<span class="why-chips">' + d.passions.map(function (id) { return passionChip(id); }).join('') + '</span></li>';
          }).join('') + '</ul></section>'
      : '';

    var teach = (p.teach || []).map(function (id) { return passionChip(id, { level: S.levelOf(p, id), cls: 'is-teach' }); }).join('');
    var learn = (p.learn || []).map(function (id) { return passionChip(id); }).join('');
    var passions = (p.passions || []).map(function (x) { return passionChip(x.id, { level: x.level }); }).join('');

    var myActs = '';
    if (isMe) {
      var going = S.upcoming().filter(function (a) { return S.isIn(a) && a.organizerId !== p.id; });
      myActs = '<section class="card card--wide" style="--i:6"><h2 class="card-title">Mes activités</h2>' +
        (going.length ? '<div class="act-grid act-grid--compact' + (going.length === 1 ? ' act-grid--one' : '') + '">' + going.map(function (a, i) { return actCard(a, i, {}); }).join('') + '</div>'
          : '<p class="muted">' + esc(nb(T.emptyStates.myActivities)) + '</p><a class="btn btn-soft" href="#/activities">Voir les activités</a>') +
        '</section>';
    }

    return '' +
      '<article class="page profile" style="' + catStyle(dc) + '">' +
        (isMe ? '' : '<a class="back-link" href="#/explore" data-action="back" data-fallback="#/explore">' + icon('back') + 'Retour</a>') +
        '<header class="profile-hero">' +
          '<div class="profile-cover" aria-hidden="true"><i></i><i></i></div>' +
          '<div class="profile-id">' +
            '<span class="profile-avatar">' + avatar(p, 112) + '</span>' +
            '<div class="profile-txt">' +
              '<h1 class="profile-name">' + esc(fullName(p)) + '</h1>' +
              '<p class="profile-sub">' + esc(subtitle(p)) + (connected ? ' · <span class="connected">' + icon('check') + 'En contact</span>' : '') + '</p>' +
              personBadges(p, isMe) +
            '</div>' +
            '<div class="profile-actions">' + actions + '</div>' +
          '</div>' +
        '</header>' +
        (isMe ? '<p class="me-note">' + icon('users') + esc(nb(p.visible === false ? 'Ton profil est masqué : le campus ne le voit pas.' : 'Voilà comment les autres te voient.')) + '</p>' : '') +
        '<div class="profile-grid stagger">' +
          why +
          (p.bio ? '<section class="card bio" style="--i:1"><p class="bio-text">' + esc(nb(p.bio)) + '</p></section>' : '') +
          '<section class="card" style="--i:2"><h2 class="card-title">Je transmets <span class="madskills">' + icon('spark') + esc(T.madSkills) + '</span></h2>' +
            (teach ? '<div class="pchips">' + teach + '</div>' : '<p class="muted">' + esc(T.emptyStates.teach) + '</p>') + '</section>' +
          '<section class="card" style="--i:3"><h2 class="card-title">J\'apprends</h2>' +
            (learn ? '<div class="pchips">' + learn + '</div>' : '<p class="muted">' + esc(T.emptyStates.learn) + '</p>') + '</section>' +
          '<section class="card card--wide" style="--i:4"><h2 class="card-title">Passions</h2>' +
            (passions ? '<div class="pchips">' + passions + '</div>' : '<p class="muted">' + esc(nb("Rien pour l'instant.")) + '</p>') +
            '<p class="lvl-legend"><span class="lvl"><i class="on"></i><i></i><i></i></span> Débutant <span class="lvl"><i class="on"></i><i class="on"></i><i></i></span> Intermédiaire <span class="lvl"><i class="on"></i><i class="on"></i><i class="on"></i></span> Confirmé</p>' +
          '</section>' +
          '<section class="card card--wide" style="--i:5"><h2 class="card-title">Activités organisées</h2>' +
            (organized.length ? '<div class="act-grid act-grid--compact' + (organized.length === 1 ? ' act-grid--one' : '') + '">' + organized.map(function (a, i) { return actCard(a, i, { topIds: topIds }); }).join('') + '</div>'
              : '<p class="muted">' + esc(nb(T.emptyStates.organized)) + '</p>') +
          '</section>' +
          myActs +
        '</div>' +
        footer() +
      '</article>';
  }

  VIEWS.person = function (target) {
    var p = S.person(target.id);
    return { title: fullName(p), html: profileHTML(p, false) };
  };
  VIEWS.me = function () {
    var me = S.me();
    return { title: 'Mon profil', html: profileHTML(me, true) };
  };

  function contactModal(id) {
    var p = S.person(id);
    var me = S.me();
    if (!p || !me) return;
    var aff = S.affinityWith(me, p);
    var pid = aff ? (aff.teachesMe[0] || aff.iTeach[0] || aff.common[0]) : '';
    var pa = pid ? S.passion(pid) : null;
    var msg = typeof T.contactTemplate === 'function' ? T.contactTemplate(me.firstName, p.firstName, pa ? pa.label : '') : '';
    openModal(
      '<div class="modal-body">' +
        '<div class="modal-head"><h2 id="modal-title">Contacter ' + esc(p.firstName) + '</h2>' +
          '<button type="button" class="icon-btn" data-action="close-modal" aria-label="Fermer">' + icon('close') + '</button></div>' +
        '<div class="contact-to">' + avatar(p, 48) + '<div class="ct-txt"><strong>' + esc(fullName(p)) + '</strong><span>' + esc(subtitle(p)) + '</span></div></div>' +
        '<label class="label" for="contact-msg">Ton message</label>' +
        '<textarea class="input" id="contact-msg" rows="5" maxlength="500" data-autofocus>' + esc(msg) + '</textarea>' +
        '<p class="hint">' + icon('lock') + esc(nb(T.contactV2)) + '</p>' +
        '<div class="modal-actions">' +
          '<button type="button" class="btn btn-ghost" data-action="close-modal">Annuler</button>' +
          '<button type="button" class="btn btn-primary" data-action="send-request" data-id="' + esc(p.id) + '">' + icon('chat') + 'Envoyer la demande</button>' +
        '</div>' +
      '</div>');
  }

  function sendRequest(btn) {
    var id = btn.getAttribute('data-id');
    var ta = $('#contact-msg');
    var p = S.person(id);
    var me = S.me();
    var res = S.sendRequest(id, ta ? ta.value : '');
    if (!res.ok || !p) { toast("La demande n'est pas partie, réessaie.", '⚠️'); return; }
    if (res.created && me) ui.pulses.push([me.id, id]);
    setModalContent(
      '<div class="modal-body sent">' +
        '<div class="sent-check" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="23"/><path d="M15 27l7 7 15-15"/></svg></div>' +
        '<h2 id="modal-title">' + esc(nb(T.contactSent)) + '</h2>' +
        '<p>' + esc(nb("C'est fait : " + p.firstName + ' et toi êtes en contact sur le campus.')) + '</p>' +
        '<p class="hint">' + esc(nb(T.contactV2)) + '</p>' +
        '<button type="button" class="btn btn-primary btn-block" data-action="close-modal" data-autofocus>Fermer</button>' +
      '</div>');
    var f = $('.sent [data-autofocus]', $modal);
    if (f) try { f.focus({ preventScroll: true }); } catch (e) { /* rien */ }
    if (current.name === 'person') patchView(['.profile-txt', '.profile-actions']);
    else refresh();
  }

  /* ================================================================
   * Raccourcis cachés
   * ================================================================ */

  var logoClicks = [];
  function onLogoClick() {
    var now = Date.now();
    logoClicks = logoClicks.filter(function (t) { return now - t < 3000; });
    logoClicks.push(now);
    if (logoClicks.length >= 5) {
      logoClicks = [];
      confirmModal({
        emoji: '🔄', title: 'Remettre la démo à zéro ?',
        text: 'Les inscriptions, participations et activités créées sur cet appareil seront effacées.',
        ok: 'Remettre à zéro', cancel: 'Annuler', action: 'do-reset', danger: true, keep: true
      });
    }
  }

  function doReset() {
    S.reset();
    draft = null;
    ui.pendingReveal = false;
    ui.pulses = [];
    ui.joinAnim = null;
    ui.lastObPct = 0;
    lastMeSig = '';
    restoredDraft = null;
    closeModal(true, true);
    /* Pas de toast : le retour à la Bienvenue suffit, et le jury ne doit pas lire « démo remise à zéro ». */
    go('#/welcome', { force: true });
  }

  /* ================================================================
   * Événements (délégation, posés une seule fois)
   * ================================================================ */

  var ACTIONS = {
    'start': function () { draft = null; restoredDraft = null; ensureDraft('onboarding'); ui.lastObPct = 0; go('#/onboarding/1'); },
    'ob-back': obBack,
    'toggle-passion': togglePassion,
    'set-level': function (btn) {
      var id = btn.getAttribute('data-id'), l = parseInt(btn.getAttribute('data-level'), 10);
      draft.passions.forEach(function (x) { if (x.id === id) x.level = l; });
      var row = btn.closest('.level-row');
      $$('.seg-btn', row).forEach(function (b) {
        var on = b === btn;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', String(on));
      });
      pop(btn);
    },
    'toggle-teach': function (btn) { toggleTeachLearn(btn, 'teach'); },
    'toggle-learn': function (btn) { toggleTeachLearn(btn, 'learn'); },
    'join': doJoin,
    'leave': doLeave,
    'cancel-activity': function (btn) {
      confirmModal({
        emoji: '🗑️', title: 'Annuler cette activité ?',
        text: 'Elle disparaîtra pour tout le monde, participants compris.',
        ok: "Annuler l'activité", cancel: 'Garder', action: 'do-cancel', id: btn.getAttribute('data-id'), danger: true
      });
    },
    'do-cancel': function (btn) {
      var res = S.cancelActivity(btn.getAttribute('data-id'));
      closeModal(true, true);
      if (!res.ok) { toast("Seul l'organisateur peut annuler.", '⚠️'); return; }
      go('#/activities');
      toast('Activité annulée', '🗑️');
    },
    'contact': function (btn) { contactModal(btn.getAttribute('data-id')); },
    'send-request': sendRequest,
    'close-modal': function () { closeModal(false); },
    'reveal-done': function () { closeModal(false); },
    'do-reset': doReset,
    'edit-profile': function () { draft = null; restoredDraft = null; ui.lastObPct = 0; go('#/edit/1'); },
    'back': function (el) { goBack(el.getAttribute('data-fallback') || '#/home'); },
    'clear-search': function () {
      var inp = $('#explore-q');
      if (inp) { inp.value = ''; inp.focus(); }
      ui.explore.q = '';
      var c = $('.search-clear'); if (c) c.hidden = true;
      renderExploreResults(true);
      syncExploreHash();
    },
    'explore-cat': function (btn) {
      ui.explore.cat = btn.getAttribute('data-value');
      $$('#explore-cats .fchip').forEach(function (b) { var on = b === btn; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
      pop(btn);
      renderExploreResults(true);
      syncExploreHash();
    },
    'acts-filter': function (btn) {
      ui.acts.f = btn.getAttribute('data-value');
      $$('#acts-filters .fchip').forEach(function (b) { var on = b === btn; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
      pop(btn);
      renderActsList(true);
      syncActsHash();
    },
    'step': function (btn) {
      var inp = $('#cf-max');
      if (!inp) return;
      var v = clamp((parseInt(inp.value, 10) || 2) + parseInt(btn.getAttribute('data-d'), 10), 2, 30);
      inp.value = v;
      pop(inp);
      updatePreview();
    }
  };

  /* Actions qui changent l'état : un double-clic (ou un 2e tap trop rapide) ne doit pas les enchaîner.
   * Ex. : « Participer » est remplacé sous le doigt par « Je ne viens plus ». */
  var GUARDED = { 'join': 1, 'leave': 1, 'cancel-activity': 1, 'do-cancel': 1, 'contact': 1, 'send-request': 1, 'do-reset': 1, 'start': 1, 'edit-profile': 1, 'reveal-done': 1 };
  var lastActAt = 0;

  function bindEvents() {
    /* Pendant une View Transition (~0,4 s), la couche de transition capte les clics.
     * Au mousedown, on termine la transition ; si le clic arrive quand même sur <html>,
     * on le renvoie à l'élément visé. Un 2e clic de double-clic n'est jamais renvoyé. */
    var vtClick = null;
    document.addEventListener('mousedown', function (e) {
      if (!vt) return;
      try { vt.skipTransition(); } catch (err) { /* rien */ }
      vtClick = e.detail > 1 ? null : { x: e.clientX, y: e.clientY, t: Date.now() };
    }, true);
    document.addEventListener('click', function (e) {
      var p = vtClick;
      vtClick = null;
      if (!p || e.detail > 1 || Date.now() - p.t > 1500) return;
      var root = document.documentElement;
      if (e.target !== root && e.target !== document.body) return;
      var el = document.elementFromPoint(p.x, p.y);
      if (!el || el === root || el === document.body) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      try { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: p.x, clientY: p.y, detail: 1 })); } catch (err) { /* rien */ }
    }, true);

    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      /* Logo : compte les clics pour le reset caché. Il ramène à l'Accueil sans transition,
       * sinon la transition avale les clics suivants et le reset ne se déclenche pas. */
      var logo = t.closest('[data-logo]');
      if (logo) {
        onLogoClick();
        if (logo.tagName === 'A') {
          e.preventDefault();
          if (current.name !== 'home' && !$('.modal', $modal)) go('#/home', { noTransition: true });
        }
        return;
      }
      var el = t.closest('[data-action]');
      if (!el || el.disabled) return;
      var name = el.getAttribute('data-action');
      var fn = ACTIONS[name];
      if (!fn) return;
      if (el.tagName === 'A') e.preventDefault();
      var nowT = Date.now();
      if (GUARDED[name]) {
        if (e.detail > 1 || nowT - lastActAt < 450) return;
        lastActAt = nowT;
      }
      /* Une fenêtre qui vient de s'ouvrir ne se referme pas sur le 2e clic d'un double-clic
       * (qui tombe sur le fond). La confirmation du reset ignore le fond : on choisit un bouton. */
      if (name === 'close-modal') {
        var age = nowT - modalOpenedAt;
        var onBackdrop = el.classList.contains('modal-backdrop');
        if (e.detail > 1 || age < 400 || (onBackdrop && modalKeep)) return;
      }
      fn(el, e);
    });

    document.addEventListener('submit', function (e) {
      var f = e.target;
      var kind = f && f.getAttribute && f.getAttribute('data-form');
      if (!kind) return;
      e.preventDefault();
      if (kind === 'ob') obNext();
      else if (kind === 'create') submitCreate(f);
    });

    var onField = function (e) {
      var t = e.target;
      if (!t) return;
      var key = t.getAttribute && t.getAttribute('data-draft');
      if (key && draft) {
        if (t.type === 'checkbox') draft[key] = t.checked;
        else if (t.type === 'radio') { if (t.checked) draft[key] = t.value; }
        else draft[key] = t.value;
        if (key === 'bio') { var bc = $('#bio-count'); if (bc) bc.textContent = String(t.value.length); }
        if (key === 'role' && e.type === 'change') {
          draft.program = t.value === 'prof' ? '' : D.programs[0];
          var w = $('#ob-program-wrap');
          if (w) { w.innerHTML = programField(); pop(w); }
        }
        if (t.getAttribute('aria-invalid')) { t.removeAttribute('aria-invalid'); var er = $('[data-err="' + key + '"]'); if (er) er.textContent = ''; }
      }
      if (t.id === 'explore-q') {
        ui.explore.q = t.value;
        var c = $('.search-clear'); if (c) c.hidden = !t.value;
        renderExploreResults(false);
        syncExploreHash();
      }
      if (t.id === 'explore-teach' && e.type === 'change') {
        ui.explore.teach = t.checked;
        renderExploreResults(true);
        syncExploreHash();
      }
      if (t.form && t.form.id === 'create-form') {
        if (t.name === 'cat' && e.type === 'change') {
          var ps = $('#cf-passion');
          if (ps) { ps.innerHTML = passionOptions(t.value, ''); pop(ps); }
          var em = t.form.elements.emoji; if (em) em.value = '';
        }
        if (t.name === 'passion') { var em2 = t.form.elements.emoji; if (em2) em2.value = ''; }
        updatePreview();
      }
    };
    document.addEventListener('input', onField);
    document.addEventListener('change', onField);

    document.addEventListener('dblclick', function (e) {
      var t = e.target && e.target.closest && e.target.closest('[data-demo-fill]');
      if (!t) return;
      try { window.getSelection().removeAllRanges(); } catch (err) { /* rien */ }
      if (t.getAttribute('data-demo-fill') === 'ob') demoFillOb(parseInt(t.getAttribute('data-step'), 10) || 1);
      else demoFillCreate();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('.modal', $modal)) closeModal(false);
    });

    /* Inclinaison 3D des cartes (souris uniquement). */
    if (CAN_HOVER && !REDUCED) {
      document.addEventListener('pointermove', onTilt, { passive: true });
      document.addEventListener('pointerleave', function () { resetTilt(); }, { passive: true });
      window.addEventListener('scroll', function () { if (tiltEl) tiltRect = null; }, { passive: true });
    }

    var rz = 0;
    window.addEventListener('resize', function () {
      if (rz) return;
      rz = requestAnimationFrame(function () { rz = 0; if (!document.body.classList.contains('is-guest')) placePills(true); });
    });

    window.addEventListener('hashchange', function () {
      if (location.hash === lastRenderedHash) return;
      navCount++;
      var o = pendingOpts;
      pendingOpts = null;
      render(o || {});
    });
  }

  var tiltEl = null, tiltRect = null;
  function resetTilt() {
    if (!tiltEl) return;
    tiltEl.classList.remove('is-tilting');
    tiltEl.style.removeProperty('--rx');
    tiltEl.style.removeProperty('--ry');
    tiltEl = null;
    tiltRect = null;
  }
  function onTilt(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    var el = e.target && e.target.closest ? e.target.closest('.tilt') : null;
    if (el !== tiltEl) { resetTilt(); tiltEl = el; tiltRect = null; }
    if (!el) return;
    if (!tiltRect) tiltRect = el.getBoundingClientRect();
    var r = tiltRect;
    var px = clamp((e.clientX - r.left) / r.width, 0, 1);
    var py = clamp((e.clientY - r.top) / r.height, 0, 1);
    var k = r.width > 520 ? 0.4 : 1;
    el.style.setProperty('--rx', ((0.5 - py) * 8 * k).toFixed(2) + 'deg');
    el.style.setProperty('--ry', ((px - 0.5) * 10 * k).toFixed(2) + 'deg');
    el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
    el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
    el.classList.add('is-tilting');
  }

  /* ================================================================
   * Démarrage
   * ================================================================ */

  function init() {
    $app = document.getElementById('app');
    if (!$app) return;
    $app.innerHTML = shellHTML();
    $view = $('#view');
    $toasts = $('#toasts');
    $modal = $('#modal-root');
    if (REDUCED) document.documentElement.classList.add('reduced');
    if (HAS_VT) document.documentElement.classList.add('has-vt');
    restoredDraft = readSavedDraft();
    window.addEventListener('pagehide', saveDraftForReload);
    bindEvents();
    if (!location.hash || location.hash === '#' || location.hash === '#/') {
      replaceHash(S.me() ? '#/home' : '#/welcome');
    }
    navCount = 1;
    render();
    document.documentElement.classList.add('is-ready');
    if (!S.storageOk()) {
      setTimeout(function () { toast("Mode sans sauvegarde : le navigateur bloque le stockage local. Tout marche, mais rien n'est gardé après fermeture.", 'ℹ️'); }, 600);
    }
  }

  CC.app = { render: render, go: go, toast: toast, avatarHTML: avatar, esc: esc };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
