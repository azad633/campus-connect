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

  /* Adresse publique de l'app : c'est elle que vise le QR code de l'écran #/live.
   * À changer ici si le site déménage (ou CC.config.publicUrl dans config.js). */
  var PUBLIC_URL = 'https://azad633.github.io/campus-connect/';
  function publicUrl() { var c = CC.config || {}; return String(c.publicUrl || PUBLIC_URL); }
  /* Dossier de ce script : sert à charger js/vendor/qrcode.js quelle que soit la page hôte. */
  var SCRIPT_DIR = (function () {
    try {
      var src = document.currentScript && document.currentScript.src;
      if (src) return src.replace(/[?#].*$/, '').replace(/[^\/]*$/, '');
    } catch (e) { /* rien */ }
    return 'js/';
  })();

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

  /* Mode live (SPEC §9) : clés remplies dans config.js. Clés vides → mode local, exactement la V1. */
  function liveOn() { return !!(CC.sync && CC.sync.enabled); }
  /* Mode live : cet appareil est relié au profil d'Ewan (profil du seed, « Continuer en tant qu'Ewan » du panel). */
  function teamMe() {
    var me = S.me();
    return !!(me && liveOn() && typeof S.isSeedPerson === 'function' && S.isSeedPerson(me.id));
  }
  /* Mode live : profil de l'organisateur (Ewan), le seul présent au départ. Mode local : null. */
  function ownerP() {
    if (!liveOn() || typeof S.ownerId !== 'function') return null;
    var id = S.ownerId();
    return id ? S.person(id) : null;
  }
  /* Mode live, début de démo : aucune activité à venir. Les écrans vides invitent alors à lancer la première. */
  function noActsYet() { return liveOn() && !S.upcoming().length; }
  function firstActBtn(label, href, cls) {
    return '<a class="btn ' + (cls || 'btn-cta') + ' empty-cta" href="' + esc(href || '#/create') + '">' + icon('plus') + '<span>' + esc(nb(label || 'Crée la première activité')) + '</span></a>';
  }
  /* État vide soigné (mode live) : pastille animée, titre, texte, appel à l'action. Le mode local garde emptyState (V1). */
  function emptyLive(emoji, title, txt, cta, cls) {
    return '<div class="empty empty--live' + (cls ? ' ' + cls : '') + '">' +
      '<span class="empty-orb" aria-hidden="true"><span class="empty-orb-e">' + emoji + '</span></span>' +
      '<p class="empty-title">' + esc(nb(title)) + '</p>' +
      (txt ? '<p class="empty-txt">' + esc(nb(txt)) + '</p>' : '') + (cta || '') + '</div>';
  }
  /* Libellé d'un compteur : singulier pour 1 seulement (« 1 inscrit », « 0 inscrits », « 12 inscrits »). */
  function lbl(n, one, many) { return n === 1 ? one : many; }
  /* Profil masqué (case « Mon profil est visible par le campus » décochée) : il compte dans les chiffres,
   * mais n'est jamais nommé chez les autres. En V1 (local), seul « moi » peut l'être : rien ne change. */
  function hiddenP(p) { return !!p && p.visible === false && p.id !== S.state.me; }
  function nameOf(p) { return hiddenP(p) ? "Quelqu'un" : p.firstName; }
  /* Copie anonyme pour l'affichage : avatar « ? », sans prénom ni filière. */
  function anon(p) {
    return { id: p.id, firstName: '', lastName: '', role: 'etudiant', program: '', passions: p.passions || [],
      teach: [], learn: [], bio: '', team: false, photo: null, visible: false, anon: true };
  }
  function pubP(p) { return hiddenP(p) ? anon(p) : p; }

  /* ---------- Mode organisateur (#/admin) ----------
   * Le panel et le mur projeté (#/live) ne s'ouvrent qu'après le code organisateur. Protection côté
   * navigateur seulement (site statique, clé publique) : elle les cache à la classe, elle ne sécurise rien.
   * Le code n'est jamais écrit ici : seulement son empreinte SHA-256. Une fois le code saisi, l'appareil
   * le garde (localStorage) jusqu'à « Quitter le mode organisateur ». */
  var ADMIN_KEY = 'cc_admin';
  var ADMIN_HASH = '0e9c4f6ab3b16972ef98375edf094ac85baad5d4d8a555ab44400af16d7c7d3e';
  var adminMem = false; // stockage bloqué : l'accès tient jusqu'à la fermeture de l'onglet
  function isAdmin() {
    try { if (window.localStorage.getItem(ADMIN_KEY) === ADMIN_HASH) return true; } catch (e) { /* stockage bloqué */ }
    return adminMem;
  }
  function setAdmin(on) {
    adminMem = !!on;
    try {
      if (on) window.localStorage.setItem(ADMIN_KEY, ADMIN_HASH);
      else window.localStorage.removeItem(ADMIN_KEY);
    } catch (e) { /* stockage bloqué : adminMem suffit */ }
  }

  /* SHA-256 en hexadécimal : crypto.subtle si disponible (https, localhost), sinon version JS
   * (file://, vieux navigateur). Renvoie toujours une promesse. */
  function sha256Hex(str) {
    try {
      if (window.crypto && window.crypto.subtle && typeof window.TextEncoder === 'function') {
        return window.crypto.subtle.digest('SHA-256', new window.TextEncoder().encode(str)).then(function (buf) {
          var b = new Uint8Array(buf), out = '';
          for (var i = 0; i < b.length; i++) out += (b[i] < 16 ? '0' : '') + b[i].toString(16);
          return out;
        }, function () { return sha256Js(str); });
      }
    } catch (e) { /* repli JS */ }
    return Promise.resolve(sha256Js(str));
  }
  var SHA_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  function sha256Js(str) {
    var bytes = [], e, i, j;
    try { e = encodeURIComponent(String(str)); } catch (err) { return ''; } // moitié d'emoji : pas d'empreinte
    for (i = 0; i < e.length; i++) {
      if (e.charAt(i) === '%') { bytes.push(parseInt(e.substr(i + 1, 2), 16)); i += 2; } else bytes.push(e.charCodeAt(i));
    }
    var bits = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    var hi = Math.floor(bits / 0x100000000), lo = bits >>> 0;
    bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255, (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var w = new Array(64);
    function ror(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (var off = 0; off < bytes.length; off += 64) {
      for (j = 0; j < 16; j++) w[j] = (bytes[off + 4 * j] << 24) | (bytes[off + 4 * j + 1] << 16) | (bytes[off + 4 * j + 2] << 8) | bytes[off + 4 * j + 3];
      for (j = 16; j < 64; j++) {
        var s0 = ror(w[j - 15], 7) ^ ror(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        var s1 = ror(w[j - 2], 17) ^ ror(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], f = H[4], g = H[5], h = H[6], k = H[7];
      for (j = 0; j < 64; j++) {
        var t1 = (k + (ror(f, 6) ^ ror(f, 11) ^ ror(f, 25)) + ((f & g) ^ (~f & h)) + SHA_K[j] + w[j]) | 0;
        var t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        k = h; h = g; g = f; f = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + f) | 0; H[5] = (H[5] + g) | 0; H[6] = (H[6] + h) | 0; H[7] = (H[7] + k) | 0;
    }
    var out = '';
    for (i = 0; i < 8; i++) out += ('0000000' + (H[i] >>> 0).toString(16)).slice(-8);
    return out;
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
    graduation: '<path d="M2.5 9.5 12 5l9.5 4.5L12 14z"/><path d="M6.5 11.5v4.3c1.5 1.4 3.4 2.2 5.5 2.2s4-.8 5.5-2.2v-4.3"/>',
    screen: '<rect x="2.8" y="4" width="18.4" height="12.4" rx="2.4"/><path d="M8.5 20.4h7M12 16.4v4"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    play: '<path d="M7.5 5.2v13.6L18.6 12z"/>',
    pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
    send: '<path d="M20.5 3.5 3.5 10.6l6.8 2.6 2.6 6.8z"/><path d="m20.5 3.5-10.2 9.7"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>'
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
    var people = ids.map(S.person).filter(Boolean).map(pubP);
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
  var current = { name: null, key: null, order: -1, at: 0 };
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
    createPrefill: null,
    graph: null,        // réseau du campus affiché (page Impact), pour les ajouts en direct
    cancelledAt: 0
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
    ui.graph = null;
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

  var ORDER = { welcome: 0, onboarding: 1, edit: 1, home: 10, explore: 11, activities: 12, impact: 13, create: 14, me: 15, chats: 16, person: 20, activity: 21, chat: 22, admin: 29, live: 30 };

  function resolve(r) {
    var me = S.me();
    var name = r.parts[0] || '';
    var p1 = r.parts[1];
    /* Panel organisateur : ouvert sans profil (il demande le code). Écran projeté : organisateur seulement,
     * inscrit ou non ; les autres reviennent à l'accueil. */
    if (name === 'admin') return { name: 'admin', query: r.query };
    if (name === 'live') {
      if (!isAdmin()) return { redirect: me ? '#/home' : '#/welcome' };
      return { name: 'live', query: r.query };
    }
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
        if (teamMe()) return { redirect: '#/me' }; // profil d'Ewan (seed) : le même sur tous les appareils
        var es = clamp(parseInt(p1, 10) || 1, 1, 3);
        if (String(es) !== p1) return { redirect: '#/edit/' + es };
        return { name: 'edit', step: es, query: r.query };
      case 'person':
        if (p1 === me.id) return { redirect: '#/me' };
        if (!p1 || !S.person(p1) || hiddenP(S.person(p1))) return { redirect: '#/explore' };
        return { name: 'person', id: p1, query: r.query };
      case 'activity':
        if (!p1 || !S.activity(p1)) return { redirect: '#/activities' };
        return { name: 'activity', id: p1, query: r.query };
      case 'chats':
        return { name: 'chats', query: r.query };
      case 'chat':
        /* Chat d'une activité : participants seulement (sinon retour au détail, qui invite à participer). */
        if (!p1 || !S.activity(p1)) return { redirect: '#/chats' };
        if (!chatOn() || !S.canChat(p1)) return { redirect: '#/activity/' + enc(p1) };
        return { name: 'chat', id: p1, query: r.query };
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
      current = { name: target.name, key: key, order: order, at: Date.now() };
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
    { id: 'chats', label: 'Discussions', icon: 'chat' },
    { id: 'impact', label: 'Impact', icon: 'impact' }
  ];

  function shellHTML() {
    return '' +
      '<aside class="sidebar" aria-label="Navigation principale">' +
        '<a class="brand" href="#/home" data-logo aria-label="Campus Connect, accueil">' + logoHTML({ tagline: true }) + '</a>' +
        '<nav class="side-nav" id="side-nav">' +
          '<span class="nav-pill" aria-hidden="true"></span>' +
          NAV.map(function (n) {
            if (n.id === 'chats' && !chatOn()) return '';
            return '<a class="side-link" href="#/' + n.id + '" data-tab="' + n.id + '">' + icon(n.icon) + '<span>' + n.label + '</span>' +
              (n.id === 'chats' ? unreadBadgeHTML('nav-badge') : '') + '</a>';
          }).join('') +
        '</nav>' +
        '<a class="btn btn-grad side-create" href="#/create" data-tab="create">' + icon('plus') + '<span>Créer une activité</span></a>' +
        /* Pas de lien vers l'écran projeté (#/live) : il s'ouvre depuis le panel organisateur (#/admin).
         * Ici, seulement l'état du direct, comme sur téléphone (rien en mode local : c'est la V1). */
        '<p class="side-status">' + pillHTML('live-pill--side') + '</p>' +
        '<div class="side-bottom">' +
          '<a class="side-me" href="#/me" data-tab="me" id="side-me"></a>' +
          '<p class="side-foot">' + esc(T.footer) + '</p>' +
        '</div>' +
      '</aside>' +
      '<header class="topbar">' +
        '<a class="brand brand--sm" href="#/home" data-logo aria-label="Campus Connect, accueil">' + logoHTML() + '</a>' +
        '<span class="topbar-end">' + pillHTML('live-pill--top') +
          (chatOn() ? '<a class="topbar-chat" href="#/chats" data-tab="chats" aria-label="Mes discussions">' + icon('chat') + unreadBadgeHTML('topbar-badge') + '</a>' : '') +
          '<a class="topbar-me" href="#/me" data-tab="me" id="top-me" aria-label="Mon profil"></a></span>' +
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

  var TAB_OF = { home: 'home', explore: 'explore', person: 'explore', activities: 'activities', activity: 'activities', create: 'create', impact: 'impact', me: 'me', edit: 'me', chats: 'chats', chat: 'chats' };
  var lastMeSig = '';

  function updateShell(target) {
    var isLive = target.name === 'live';
    var guest = target.name === 'welcome' || target.name === 'onboarding' || isLive || target.name === 'admin';
    document.body.classList.toggle('is-guest', guest);
    document.body.classList.toggle('is-wall', isLive);
    document.body.classList.toggle('is-admin', target.name === 'admin');
    document.body.classList.toggle('is-onboarding', target.name === 'onboarding' || target.name === 'edit');
    document.body.classList.toggle('is-chat', target.name === 'chat');
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
    paintUnread();
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
          '<span class="act-count"><b data-n="' + n + '" data-ids="' + esc(a.participants.join(',')) + '">' + n + '</b>/' + a.max + '</span></span>' +
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

  /* « 25 inscrits · 9 activités cette semaine » : les chiffres bougent en direct (mode live). */
  function proofHTML(st) {
    /* Mode live, aucune activité encore : pas de « 0 activité » sec. */
    if (liveOn() && !st.upcoming) {
      return '<span class="live-dot" aria-hidden="true"></span><span><span class="wp-n" data-k="members">' + st.members + '</span> <span class="wp-m">' + lbl(st.members, 'inscrit', 'inscrits') + '</span> · ' +
        '<span class="wp-soon">les premières activités arrivent</span></span>';
    }
    return '<span class="live-dot" aria-hidden="true"></span><span><span class="wp-n" data-k="members">' + st.members + '</span> <span class="wp-m">' + lbl(st.members, 'inscrit', 'inscrits') + '</span> · ' +
      '<span class="wp-n" data-k="upcoming">' + st.upcoming + '</span> <span class="wp-w">' + (st.upcoming > 1 ? 'activités' : 'activité') + '</span> cette semaine</span>';
  }
  function proofShape(st) { return liveOn() && !st.upcoming ? 'soon' : 'n'; }

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
    /* Mode live : pas de Chris ni de jam. La carte d'Ewan (le seul vrai profil au départ) et l'activité la plus suivie. */
    var owner = ownerP();
    if (owner && owner.teach && owner.teach.length && S.passion(owner.teach[0])) {
      var ot = S.passion(owner.teach[0]);
      floats += '<div class="float-card fc-1">' + avatar(owner, 46) +
        '<div class="fc-txt"><strong>' + esc(owner.firstName) + '</strong><span>' + esc(nb('transmet ' + (ot.withArticle || ot.label) + ' ' + ot.emoji)) + '</span></div></div>';
    }
    var hot = liveOn() && st.top && st.top[0];
    if (hot) {
      floats += '<div class="float-card fc-2"><span class="fc-emoji' + emojiCls(hot.emoji) + '">' + esc(hot.emoji) + '</span><div class="fc-txt"><strong>' + esc(hot.title) + '</strong><span>' +
        esc(shortWhen(hot.date)) + ' · ' + hot.participants.length + '/' + hot.max + '</span></div></div>';
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
              '<p class="welcome-proof" data-shape="' + proofShape(st) + '">' + proofHTML(st) + '</p>' +
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
      '<p class="privacy">' + icon('lock') + '<span>' + esc(nb(liveOn() && T.privacyLineLive ? T.privacyLineLive : T.privacyLine)) + '</span></p>';
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
            /* Double-clic qui remplit le profil de Marissa : V1 (mode local) seulement. En live, chacun crée
             * son vrai profil. */
            '<h1 class="ob-title"' + (liveOn() ? '' : ' data-demo-fill="ob" data-step="' + step + '"') + '>' + esc(meta.title) + '</h1>' +
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
        var ap = S.activityPassion ? S.activityPassion(a) : S.passion(a.passion);
        s = 1 + (ap && learn.indexOf(ap.id) >= 0 ? 1 : 0);
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
    if (liveOn() && !week.length) summary.push('<span class="hero-chip">🌱 ' + esc(nb(S.upcoming().length ? 'Rien cette semaine pour l\'instant' : 'Les premières activités arrivent')) + '</span>');
    else summary.push('<span class="hero-chip">' + (forYouCount ? '🎯 ' + plural(forYouCount, 'activité', 'activités') + ' pour toi' : '🗓️ ' + plural(week.length, 'activité', 'activités') + ' cette semaine') + '</span>');
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
            (liveOn()
              ? '<div id="home-week" data-kind="' + (shown.length ? 'list' : 'empty') + '">' + homeWeekHTML(shown, topIds) + '</div>'
              : (shown.length
                ? '<div class="act-grid stagger">' + shown.map(function (a, i) { return actCard(a, i, { topIds: topIds }); }).join('') + '</div>'
                : emptyState('🗓️', T.emptyStates.activities, '<a class="btn btn-primary" href="#/create">Créer une activité</a>'))) +
          '</section>' +

          '<section class="section">' +
            '<div class="section-head"><h2 class="section-title">Tes affinités</h2>' +
              '<a class="link-more" href="#/explore">Explorer' + icon('arrow') + '</a></div>' +
            '<p class="section-sub">Des gens avec qui ça colle, et pourquoi.</p>' +
            '<div id="home-affs" data-kind="' + (affs.length ? 'list' : 'empty') + '">' +
            (affs.length
              ? '<div class="people-grid people-grid--3 stagger">' + affs.slice(0, 3).map(function (a, i) { return personCard(a.person, i, a); }).join('') + '</div>'
              : (liveOn() ? affEmptyLive(me, topIds) : emptyState('💜', T.emptyStates.affinities, '<a class="btn btn-primary" href="#/edit/2">Ajouter des passions</a>'))) +
            '</div>' +
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
              '<span><b data-count="' + st.members + '">' + st.members + '</b> <span class="ib-l">' + lbl(st.members, 'inscrit', 'inscrits') + '</span></span>' +
              '<span><b data-count="' + st.participations + '">' + st.participations + '</b> <span class="ib-l">' + lbl(st.participations, 'participation', 'participations') + '</span></span>' +
              '<span><b data-count="' + st.connections + '">' + st.connections + '</b> <span class="ib-l">' + lbl(st.connections, 'connexion', 'connexions') + '</span></span>' +
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

  /* Mode live : « Cette semaine » (liste, ou invitation à lancer la première activité). */
  function homeWeekHTML(shown, topIds) {
    var E = T.emptyLive || {};
    if (shown.length) return '<div class="act-grid stagger">' + shown.map(function (a, i) { return actCard(a, i, { topIds: topIds }); }).join('') + '</div>';
    if (!S.upcoming().length) return emptyLive('🗓️', E.weekTitle || "Rien de prévu pour l'instant", E.week || T.emptyStates.activities, firstActBtn());
    return emptyLive('🗓️', E.weekTitle || "Rien de prévu pour l'instant", T.emptyStates.activities, firstActBtn('Lance une activité', '#/create', 'btn-primary'));
  }

  /* Mode live, pas encore d'affinité (début de démo, peu d'inscrits) : au lieu d'un écran vide, les activités
   * de sa catégorie préférée (celle de ses passions les plus fortes), sinon une invitation à lancer la sienne. */
  function favCats(me) {
    var counts = {}, order = [];
    (me.passions || []).forEach(function (x) {
      var pa = S.passion(x.id);
      if (!pa) return;
      if (counts[pa.cat] === undefined) { counts[pa.cat] = 0; order.push(pa.cat); }
      counts[pa.cat] += x.level + ((me.teach || []).indexOf(x.id) >= 0 ? 2 : 0);
    });
    (me.learn || []).forEach(function (id) {
      var pa = S.passion(id);
      if (pa && counts[pa.cat] === undefined) { counts[pa.cat] = 1; order.push(pa.cat); }
    });
    order.sort(function (a, b) { return counts[b] - counts[a]; });
    return order.map(catOf);
  }
  function affEmptyLive(me, topIds) {
    var cats = favCats(me);
    var week = S.upcoming().filter(function (a) { return dayDiff(new Date(a.date)) <= 7; });
    var cat = null, list = [];
    for (var i = 0; i < cats.length && !list.length; i++) {
      list = week.filter(function (a) { return a.cat === cats[i].id; });
      if (list.length) cat = cats[i];
    }
    var c0 = cat || cats[0] || catOf('chill');
    var catTxt = c0.emoji + ' ' + c0.label;
    var first = (me.passions || [])[0];
    var proposeHref = '#/create' + (first && S.passion(first.id) && S.passion(first.id).cat === c0.id ? '?passion=' + enc(first.id) : '');
    var sig = c0.id + ':' + list.slice(0, 2).map(function (a) { return a.id; }).join(',') + ':' + S.upcoming().length;
    return '<div class="aff-empty" data-sig="' + esc(sig) + '" style="' + catStyle(c0) + '">' +
      '<div class="aff-empty-head"><span class="aff-empty-ic" aria-hidden="true">🌱</span>' +
        '<div><p class="aff-empty-title">' + esc(nb(T.emptyStates.affinitiesLiveTitle || 'Tes affinités arrivent')) + '</p>' +
        '<p class="aff-empty-txt">' + esc(nb(String(list.length ? T.emptyStates.affinitiesLive : T.emptyStates.affinitiesLiveNone).replace('{cat}', catTxt))) + '</p></div></div>' +
      (list.length
        ? '<div class="act-grid act-grid--compact' + (list.length === 1 ? ' act-grid--one' : '') + '">' + list.slice(0, 2).map(function (a, j) { return actCard(a, j, { topIds: topIds }); }).join('') + '</div>' +
          '<a class="link-more aff-empty-more" href="#/activities?f=' + enc(c0.id) + '">Tout voir côté ' + esc(c0.label) + icon('arrow') + '</a>'
        : firstActBtn('Lance la première côté ' + c0.label, proposeHref, 'btn-primary')) +
    '</div>';
  }

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
    /* Mode live : l'arrivée s'affiche sur l'écran projeté, on invite à lever les yeux. */
    var lookUp = function (ms) {
      if (!liveOn() || live.status !== 'live' || me.visible === false) return;
      setTimeout(function () { toast("Lève les yeux : ton prénom est sur l'écran du campus.", '👀'); }, ms);
    };
    if (!matches.length) { toast('Bienvenue ' + me.firstName + ' !', '👋'); lookUp(1400); return; }
    var done = function () { replayEnter(); lookUp(700); };
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
    var e = ui.explore;
    var words = norm(e.q).split(/\s+/).filter(Boolean);
    var res = exploreList();
    var list = res.list, affMap = res.affMap;
    if (count) count.textContent = list.length ? plural(list.length, 'personne', 'personnes') : '';
    restagger(box, animate);
    box.setAttribute('data-sig', list.map(function (p) { return p.id; }).join(','));
    if (!list.length) {
      box.innerHTML = liveOn() ? exploreEmptyLive(e, words)
        : emptyState('🔎', e.teach ? T.emptyStates.canTeachMe : (e.cat && !words.length ? T.emptyStates.category : T.emptyStates.search));
    } else {
      box.innerHTML = list.map(function (p, i) { return personCard(p, i, affMap[p.id]); }).join('');
    }
  }

  /* Mode live, peu d'inscrits : personne d'autre que moi, ou rien pour ce filtre. */
  function exploreEmptyLive(e, words) {
    var E = T.emptyLive || {};
    var me = S.me();
    var others = S.people().filter(function (p) { return (!me || p.id !== me.id) && p.visible !== false; }).length;
    if (!others && !words.length) {
      return emptyLive('👋', E.peopleTitle, E.people, noActsYet() ? firstActBtn() : '<a class="btn btn-primary empty-cta" href="#/activities">Voir les activités</a>');
    }
    if (e.teach) {
      var want = me && me.learn && me.learn[0];
      return emptyLive('🎓', "Personne ne transmet ça pour l'instant", T.emptyStates.canTeachMe, firstActBtn('Propose une activité', '#/create' + (want ? '?passion=' + enc(want) : ''), 'btn-primary'));
    }
    if (e.cat && !words.length) {
      var c = catOf(e.cat);
      return emptyLive(esc(c.emoji), 'Personne côté ' + c.label + " pour l'instant", 'Les profils arrivent en direct. Lance une activité dans cette catégorie : elle attirera ceux qui aiment ça.', firstActBtn('Lance la première', '#/create?cat=' + enc(c.id), 'btn-primary'), 'empty--cat');
    }
    return emptyLive('🔎', 'Personne ne correspond', T.emptyStates.search, '');
  }

  function exploreList() {
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
    return { list: list, affMap: affMap };
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
            /* mode live : pas de compteur « 0 » sur les filtres (début de démo) */
            filterChip('acts-filter', 'all', 'Tout', f === 'all', '', liveOn() && !up.length ? undefined : up.length) +
            filterChip('acts-filter', 'pourtoi', '🎯 Pour toi', f === 'pourtoi', '', liveOn() && !nFy ? undefined : nFy) +
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
      if (liveOn()) { box.innerHTML = actsEmptyLive(f, topIds); return; }
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

  /* Mode live, liste vide : « Tout » (aucune activité), une catégorie, ou « Pour toi » (propose alors les activités
   * des catégories de mes passions, sinon de lancer la mienne). */
  function actsEmptyLive(f, topIds) {
    var E = T.emptyLive || {};
    var me = S.me();
    if (f === 'all') return emptyLive('🗓️', E.allTitle, E.all, firstActBtn());
    if (f !== 'pourtoi') {
      var c = catOf(f);
      return emptyLive(esc(c.emoji), String(E.catTitle).replace('{cat}', c.label), E.cat, firstActBtn('Lance la première', '#/create?cat=' + enc(c.id)), 'empty--cat');
    }
    var cats = me ? favCats(me) : [];
    for (var i = 0; i < cats.length; i++) {
      var near = S.upcoming().filter(function (a) { return a.cat === cats[i].id; });
      if (near.length) {
        return '<div class="near-you" style="' + catStyle(cats[i]) + '">' +
          '<p class="near-you-txt"><span aria-hidden="true">🧭</span> ' + esc(nb(String(E.forYouNear).replace('{cat}', cats[i].emoji + ' ' + cats[i].label))) + '</p>' +
          '<div class="act-grid">' + near.slice(0, 4).map(function (a, j) { return actCard(a, j, { topIds: topIds }); }).join('') + '</div>' +
          firstActBtn('Ou lance la tienne', '#/create' + (me && me.passions[0] ? '?passion=' + enc(me.passions[0].id) : ''), 'btn-soft') +
        '</div>';
      }
    }
    var first = me && me.passions[0] ? me.passions[0].id : '';
    return emptyLive('🎯', E.forYouTitle, E.forYou, firstActBtn(S.upcoming().length ? 'Lance la tienne' : 'Crée la première activité', '#/create' + (first ? '?passion=' + enc(first) : '')));
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
      /* Mode live : aucune activité seed ; garde-fou si le seed en recevait une (voir store.cancelActivity). */
      var seedAct = liveOn() && typeof S.isSeedActivity === 'function' && S.isSeedActivity(a.id);
      return '<p class="action-note">' + icon('spark') + 'C\'est ton activité</p>' +
        (seedAct ? '' : '<button type="button" class="btn btn-danger-ghost btn-lg btn-block" data-action="cancel-activity" data-id="' + id + '">Annuler l\'activité</button>');
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
    var custom = !pa && a.customLabel ? a.customLabel : ''; // activité libre (« ✨ Autre chose »)
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
    var orgCard = org && hiddenP(org)
      ? '<div class="card organizer">' + avatar(anon(org), 52) +
          '<span class="org-txt"><span class="org-label">' + (a.kind === 'atelier' ? 'Animé par' : 'Organisé par') + '</span>' +
          '<span class="org-name">Profil masqué</span></span></div>'
      : org ? '<a class="card organizer tilt" href="#/' + (isOrgMe ? 'me' : 'person/' + enc(org.id)) + '">' +
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
                (pa ? '<span class="badge badge-cat">' + esc(pa.emoji) + ' ' + esc(pa.label) + '</span>'
                  : custom ? '<span class="badge badge-cat badge-custom">' + esc(a.emoji || c.emoji) + ' ' + esc(custom) + '</span>' : '') +
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
                  '<span class="ag-count"><b id="ag-n" data-n="' + n + '" data-ids="' + esc(a.participants.join(',')) + '">' + shownN + '</b><span>/' + a.max + '</span></span>' +
                  '<span class="ag-label">participants</span>' +
                  '<span class="ag-left' + (shownN >= a.max ? ' is-full' : '') + '" id="ag-left" data-final="' + esc(leftNow) + '">' + esc(leftShown) + '</span>' +
                '</div>' +
                '<div class="gauge gauge-lg" aria-hidden="true"><span id="ag-bar" style="width:' + fromPct + '%" data-to="' + pct + '"></span></div>' +
                '<div class="participants">' + parts.map(function (p, i) {
                  var isMeP = me && p.id === me.id;
                  /* nouvel avatar : le mien (ma participation) ou celui qui vient de rejoindre à distance */
                  var cls = 'part' + (anim && (anim.personId ? p.id === anim.personId : isMeP) ? ' is-new' : '');
                  if (hiddenP(p)) {
                    return '<span class="' + cls + '" style="--i:' + Math.min(i, 12) + '">' + avatar(anon(p), 48) +
                      '<span class="part-name">Masqué</span>' + (p.id === a.organizerId ? '<span class="part-tag">orga</span>' : '') + '</span>';
                  }
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
              chatBlockHTML(a) +
              '<div class="card ad-info" style="--i:2">' + info.map(function (row) {
                return '<div class="info-row">' + row[0] + '<span class="info-main">' + esc(row[1]) + '</span>' + (row[2] ? '<span class="info-tag">' + esc(row[2]) + '</span>' : '') + '</div>';
              }).join('') + '</div>' +
              (a.description ? '<div class="card ad-desc" style="--i:3"><h2 class="card-title">Le programme</h2><p>' + esc(nb(a.description)) + '</p></div>' : '') +
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
  /* .ad-chat : après Participer / Je ne viens plus, la discussion s'ouvre ou se referme. */
  var ACT_PATCH = ['.ad-people', '.ad-action--desk', '.ad-action--mobile'];
  function actPatch() { return chatOn() ? ACT_PATCH.concat(['.ad-chat']) : ACT_PATCH; }

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
    patchView(actPatch());
    if (!REDUCED) callFx('confetti', [r0.left + r0.width / 2, r0.top + r0.height / 2]);
    revealJoin(false);
    toast("C'est noté, tu y vas ! 🎉", icon('check'));
  }

  /* Téléphone : après « Participer » (ou une arrivée en direct), la jauge ET le nouvel avatar restent
   * visibles, entre la barre du haut (et le toast) et les barres collées en bas (« Tu participes », onglets).
   * Arrivée à distance : seulement si on regarde déjà la jauge (on ne déplace pas quelqu'un qui lit plus bas). */
  function revealJoin(remote) {
    if (window.innerWidth >= 900 || !$view || typing()) return;
    var num = $('#ag-n', $view);
    if (!num) return;
    var nw = $('.ad-people .part.is-new', $view);
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;
    var top = 150, bottom = vh;
    [$('.ad-action--mobile', $view), $('#tabbar')].forEach(function (b) {
      if (!b) return;
      var r = b.getBoundingClientRect();
      if (r.height && r.top > vh * 0.4 && r.top < bottom) bottom = r.top;
    });
    bottom -= 16;
    var nr = num.getBoundingClientRect();
    if (remote && (nr.bottom < 60 || nr.top > bottom)) return;
    var wr = nw ? nw.getBoundingClientRect() : nr;
    var hi = Math.min(nr.top, wr.top), lo = Math.max(nr.bottom, wr.bottom);
    var dy = 0;
    if (lo > bottom) dy = lo - bottom;
    else if (hi < top) dy = hi - top;
    if (hi - dy < 64) dy = hi - 64; // la jauge ne passe jamais sous la barre du haut
    if (Math.abs(dy) < 4) return;
    try { window.scrollBy({ top: dy, left: 0, behavior: REDUCED ? 'auto' : 'smooth' }); } catch (e) { try { window.scrollBy(0, dy); } catch (e2) { /* rien */ } }
  }

  function doLeave(btn) {
    var id = btn.getAttribute('data-id');
    var a = S.activity(id);
    var from = a ? a.participants.length : 0;
    var res = S.leave(id);
    if (!res.ok) { toast("Impossible de te retirer de cette activité.", '⚠️'); return; }
    ui.joinAnim = { id: id, from: from, to: from - 1 };
    patchView(actPatch());
    toast('Ta place est libérée.', '👋');
  }

  /* ================================================================
   * Chat d'activité (V1.2) : bloc « Discussion » du détail, #/chat/:id, #/chats (Mes discussions)
   * Seuls les participants lisent et écrivent : c'est un contrôle de l'interface, la base reste ouverte
   * (démo, assumé). Le ton : s'organiser (où, qui ramène quoi), pas une messagerie de plus.
   * Contrat (sous garde, sans lui le chat n'apparaît pas) : CC.store.messages / sendMessage / canChat /
   * unread / unreadTotal / markRead / myChats ; événements 'message:new' et 'message:hidden'.
   * ================================================================ */

  function chatOn() {
    return typeof S.sendMessage === 'function' && typeof S.messages === 'function' && typeof S.canChat === 'function' &&
      typeof S.unreadTotal === 'function' && typeof S.markRead === 'function';
  }
  var MSG_MAX = S.MSG_MAX || 300;
  var CHAT_SUGGEST = ['On se retrouve où ?', 'Qui ramène quoi ?', "J'arrive un peu en retard", "Quelqu'un part du campus avec moi ?"];
  var chat = null;        // écran #/chat affiché : { id, root, list, scroll, input, onVv, onScroll, onRz }
  var chatDrafts = {};    // message commencé, par activité (on peut aller voir le détail et revenir)

  function unreadBadgeHTML(cls) { return '<span class="unread ' + cls + '" data-unread hidden aria-hidden="true"></span>'; }
  /* Pastilles de non-lus (barre du haut, barre latérale). */
  function paintUnread() {
    if (!chatOn() || !$app) return;
    var n = 0;
    try { n = S.me() ? S.unreadTotal() : 0; } catch (e) { n = 0; }
    var txt = n > 9 ? '9+' : String(n);
    $$('[data-unread]').forEach(function (el) {
      var was = el.hidden;
      if (el.textContent !== txt) el.textContent = txt;
      el.hidden = n === 0;
      if (was && n > 0) pop(el);
    });
    $$('a[href="#/chats"][data-tab]').forEach(function (a) {
      a.setAttribute('aria-label', n ? 'Mes discussions, ' + plural(n, 'message non lu', 'messages non lus') : 'Mes discussions');
    });
  }

  function fmtClock(d) { return d.getHours() + 'h' + pad(d.getMinutes()); }
  function chatDay(d) {
    var n = dayDiff(d);
    if (n === 0) return "Aujourd'hui";
    if (n === -1) return 'Hier';
    return cap(fmtDay(d));
  }
  /* Heure courte d'un dernier message : « 14h05 », « hier », « lun. ». */
  function msgWhen(iso) {
    var d = new Date(iso), n = dayDiff(d);
    if (n === 0) return fmtClock(d);
    if (n === -1) return 'hier';
    return DAYS_SHORT[d.getDay()];
  }
  /* Coupe un texte pour un aperçu, sans moitié d'emoji. */
  function clip(s, n) {
    s = String(s || '');
    if (s.length <= n) return s;
    var t = s.slice(0, n - 1);
    if (/[\uD800-\uDBFF]$/.test(t)) t = t.slice(0, -1);
    return t.replace(/\s+\S*$/, '') + '…';
  }
  function msgAuthor(m, me) { return me && m.personId === me.id ? 'Toi' : nameOf(S.person(m.personId)); }

  /* Bloc « Discussion du groupe » du détail : ouvert aux participants, sinon une invitation à participer. */
  function chatBlockHTML(a) {
    if (!chatOn()) return '';
    var me = S.me();
    var all = S.messages(a.id);
    if (!S.canChat(a)) {
      var why = S.isPast(a) ? 'La discussion était réservée aux participants.'
        : S.isFull(a) ? 'La discussion est réservée aux participants.'
        : "Rejoins l'activité pour discuter avec le groupe : où se retrouver, qui ramène quoi.";
      return '<section class="card ad-chat is-locked" data-sig="' + esc('lock|' + all.length + '|' + why) + '" style="--i:1">' +
        '<h2 class="card-title">' + icon('chat') + 'Discussion du groupe</h2>' +
        '<p class="adc-lock">' + icon('lock') + '<span>' + esc(nb(why)) + '</span></p>' +
        (all.length ? '<p class="adc-count">' + esc(plural(all.length, 'message échangé', 'messages échangés')) + ' entre participants</p>' : '') +
      '</section>';
    }
    var unread = S.unread(a.id);
    var last = all.slice(-3);
    var sig = 'in|' + all.length + '|' + (last.length ? last[last.length - 1].id : '') + '|' + unread;
    var href = '#/chat/' + enc(a.id);
    return '<section class="card ad-chat" data-sig="' + esc(sig) + '" style="--i:1">' +
      '<div class="adc-head"><h2 class="card-title">' + icon('chat') + 'Discussion du groupe</h2>' +
        (unread ? '<span class="adc-new">' + esc(plural(unread, 'non lu', 'non lus')) + '</span>' : '') + '</div>' +
      (last.length
        ? '<ol class="adc-list">' + last.map(function (m) {
            var p = S.person(m.personId);
            return '<li class="adc-msg">' + avatar(pubP(p), 32) +
              '<p class="adc-txt"><b>' + esc(msgAuthor(m, me)) + '</b> ' + esc(nb(m.body)) + '</p>' +
              '<time class="adc-time" datetime="' + esc(m.at) + '">' + esc(msgWhen(m.at)) + '</time></li>';
          }).join('') + '</ol>'
        : '<p class="adc-empty">' + esc(nb("Personne n'a encore écrit. Lance la discussion : où se retrouver, qui ramène quoi.")) + '</p>') +
      '<a class="btn btn-soft btn-block adc-open" href="' + href + '">' + icon('chat') +
        '<span>' + (last.length ? 'Ouvrir la discussion' : 'Écrire au groupe') + '</span>' + icon('arrow') + '</a>' +
    '</section>';
  }
  /* Détail affiché : le bloc suit les nouveaux messages, les non-lus, ma participation. */
  function refreshChatBlock() {
    if (current.name !== 'activity' || !$view) return;
    var r = parseHash();
    var a = r.parts[0] === 'activity' ? S.activity(r.parts[1]) : null;
    var el = $('.ad-chat', $view);
    if (!a || !el) return;
    var n = htmlOf(chatBlockHTML(a)).firstChild;
    if (!n || n.getAttribute('data-sig') === el.getAttribute('data-sig')) return;
    settleView();
    el.parentNode.replaceChild(n, el);
    bump(n);
  }

  /* ---------- #/chat/:id ---------- */

  function msgHTML(m, prev, a, me) {
    var p = S.person(m.personId);
    var mine = !!me && m.personId === me.id;
    var cont = !!prev && prev.personId === m.personId && Date.parse(m.at) - Date.parse(prev.at) < 6 * 60000;
    var isOrg = !!p && p.id === a.organizerId && !hiddenP(p);
    return '<li class="msg' + (mine ? ' is-mine' : '') + (cont ? ' is-cont' : '') + '" data-key="' + esc(m.id) + '">' +
      (mine ? '' : '<span class="msg-av">' + (cont ? '' : avatar(pubP(p), 34)) + '</span>') +
      '<div class="msg-bubble">' +
        (!mine && !cont ? '<span class="msg-name">' + esc(nameOf(p)) + (isOrg ? '<span class="msg-tag">orga</span>' : '') + '</span>' : '') +
        '<p class="msg-text">' + esc(nb(m.body)) + '</p>' +
        '<time class="msg-time" datetime="' + esc(m.at) + '">' + esc(fmtClock(new Date(m.at))) + '</time>' +
      '</div>' +
    '</li>';
  }
  function chatListHTML(a) {
    var me = S.me(), out = '', prev = null, prevDay = '';
    S.messages(a.id).forEach(function (m) {
      var d = new Date(m.at), day = isoDay(d);
      if (day !== prevDay) {
        out += '<li class="msg-day" data-key="day-' + day + '"><span>' + esc(chatDay(d)) + '</span></li>';
        prevDay = day;
        prev = null;
      }
      out += msgHTML(m, prev, a, me);
      prev = m;
    });
    return out;
  }

  VIEWS.chat = function (target) {
    var a = S.activity(target.id);
    var c = catOf(a.cat);
    var n = a.participants.length;
    var back = '#/activity/' + enc(a.id);
    var count = S.messages(a.id).length;
    return {
      title: 'Discussion · ' + a.title,
      html:
        '<section class="chat" id="chat" data-id="' + esc(a.id) + '" style="' + catStyle(c) + '">' +
          '<header class="chat-head">' +
            '<a class="chat-back" href="' + back + '" data-action="back" data-fallback="' + back + '" aria-label="Retour à l\'activité">' + icon('back') + '</a>' +
            '<a class="chat-act" href="' + back + '">' +
              '<span class="chat-emoji' + emojiCls(a.emoji) + '" aria-hidden="true">' + esc(a.emoji) + '</span>' +
              '<span class="chat-act-txt"><strong>' + esc(a.title) + '</strong>' +
                '<span>' + esc(nb(shortWhen(a.date) + ' · ' + a.place)) + '</span></span>' +
            '</a>' +
            '<span class="chat-people" title="' + esc(plural(n, 'participant', 'participants')) + '">' + avatarStack(a.participants, 3) + '</span>' +
          '</header>' +
          '<div class="chat-scroll" id="chat-scroll">' +
            '<p class="chat-intro">' + icon('lock') + '<span>' + esc(nb("Visible seulement par les participants de l'activité. Pour s'organiser : où se retrouver, qui ramène quoi.")) + '</span></p>' +
            '<ol class="chat-list" id="chat-list">' + chatListHTML(a) + '</ol>' +
            '<div class="chat-empty" id="chat-empty"' + (count ? ' hidden' : '') + '>' +
              '<p class="chat-empty-emoji" aria-hidden="true">💬</p>' +
              '<p>' + esc(nb("Personne n'a encore écrit. Lance la discussion :")) + '</p>' +
              '<div class="chat-suggest">' + CHAT_SUGGEST.map(function (t) {
                return '<button type="button" class="chat-sugg" data-action="chat-suggest" data-text="' + esc(t) + '">' + esc(nb(t)) + '</button>';
              }).join('') + '</div>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="chat-jump" id="chat-jump" data-action="chat-jump" hidden>' + icon('down') + '<span>Nouveau message</span></button>' +
          '<form class="chat-compose" id="chat-form" data-form="chat" novalidate autocomplete="off">' +
            '<label class="sr-only" for="chat-input">Ton message au groupe</label>' +
            '<input class="chat-input" id="chat-input" name="body" type="text" maxlength="' + MSG_MAX + '" placeholder="Écris au groupe…" enterkeyhint="send" autocomplete="off" autocapitalize="sentences" spellcheck="true">' +
            '<span class="chat-count" id="chat-count" aria-live="polite" hidden></span>' +
            '<button type="submit" class="chat-send" id="chat-send" aria-label="Envoyer" disabled>' + icon('send') + '</button>' +
          '</form>' +
        '</section>',
      mount: mountChat
    };
  };

  function mountChat(root) {
    var box = $('#chat', root);
    if (!box) return;
    var c = chat = {
      id: box.getAttribute('data-id'), root: box,
      list: $('#chat-list', box), scroll: $('#chat-scroll', box), input: $('#chat-input', box),
      onVv: null, onScroll: null, onRz: null
    };
    if (chatDrafts[c.id]) c.input.value = chatDrafts[c.id];
    chatInputUi();
    chatViewport();
    chatToBottom(false);
    S.markRead(c.id);
    paintUnread();
    c.onScroll = function () { if (chatNearBottom()) chatJump(false); };
    c.scroll.addEventListener('scroll', c.onScroll, { passive: true });
    /* Clavier iOS : le chat suit la partie visible de l'écran (visualViewport), champ collé au clavier. */
    var vv = window.visualViewport;
    c.onVv = function () { chatViewport(); };
    if (vv && vv.addEventListener) { vv.addEventListener('resize', c.onVv); vv.addEventListener('scroll', c.onVv); }
    window.addEventListener('resize', c.onVv);
    /* ordinateur : on peut écrire tout de suite (sur téléphone, le clavier n'apparaît qu'au toucher) */
    if (CAN_HOVER) setTimeout(function () { if (chat === c) { try { c.input.focus({ preventScroll: true }); } catch (e) { /* rien */ } } }, 60);
    fxHandles.push({ stop: function () { stopChat(c); } });
  }
  function stopChat(c) {
    if (!c) return;
    try { if (S.me() && S.canChat(c.id)) chatDrafts[c.id] = c.input.value; else delete chatDrafts[c.id]; } catch (e) { /* rien */ }
    var vv = window.visualViewport;
    if (vv && vv.removeEventListener) { vv.removeEventListener('resize', c.onVv); vv.removeEventListener('scroll', c.onVv); }
    window.removeEventListener('resize', c.onVv);
    if (c.scroll) c.scroll.removeEventListener('scroll', c.onScroll);
    if (chat === c) chat = null;
  }
  function chatViewport() {
    var c = chat, vv = window.visualViewport;
    if (!c) return;
    var bottom = chatNearBottom();
    var ih = window.innerHeight || 0;
    /* ordinateur, zoom au pincement ou valeur douteuse : mise en page normale (100dvh) */
    if (!vv || (window.innerWidth || 0) >= 900 || (vv.scale && vv.scale > 1.05) || !(vv.height > 200) || !ih) {
      c.root.style.removeProperty('--vvh');
      c.root.style.removeProperty('--vvt');
      c.root.classList.remove('kb-open');
    } else {
      var h = Math.min(vv.height, ih);
      c.root.style.setProperty('--vvh', Math.round(h) + 'px');
      c.root.style.setProperty('--vvt', Math.round(Math.max(0, vv.offsetTop || 0)) + 'px');
      c.root.classList.toggle('kb-open', h < ih - 120);
    }
    if (bottom) chatToBottom(false);
  }
  function chatNearBottom() {
    var sc = chat && chat.scroll;
    return !sc || sc.scrollHeight - sc.scrollTop - sc.clientHeight < 90;
  }
  function chatToBottom(smooth) {
    var sc = chat && chat.scroll;
    if (!sc) return;
    try { sc.scrollTo({ top: sc.scrollHeight, behavior: smooth && !REDUCED ? 'smooth' : 'auto' }); } catch (e) { sc.scrollTop = sc.scrollHeight; }
  }
  function chatJump(show) {
    var b = chat && $('#chat-jump', chat.root);
    if (!b || b.hidden === !show) return;
    b.hidden = !show;
    if (show) pop(b);
  }
  function chatInputUi() {
    var c = chat;
    if (!c || !c.input) return;
    var v = c.input.value;
    var btn = $('#chat-send', c.root);
    if (btn) btn.disabled = !clean1(v);
    var cnt = $('#chat-count', c.root);
    if (cnt) {
      var left = MSG_MAX - v.length;
      cnt.hidden = left > 40;
      cnt.textContent = String(left);
    }
    chatDrafts[c.id] = v;
  }
  /* Liste à jour : nouveaux messages ajoutés à la fin (sans redessiner), sinon liste redessinée. */
  function chatSync(animate) {
    var c = chat;
    if (!c) return null;
    var a = S.activity(c.id);
    if (!a) return null;
    var wasBottom = chatNearBottom();
    var fresh = htmlOf('<ol>' + chatListHTML(a) + '</ol>').firstChild;
    var oldKeys = $$('#chat-list > li', c.root).map(keyOf);
    var lis = Array.prototype.slice.call(fresh.children);
    var newKeys = lis.map(keyOf);
    var prefix = oldKeys.length <= newKeys.length && oldKeys.every(function (k, i) { return k === newKeys[i]; });
    var added = [];
    if (prefix) {
      lis.slice(oldKeys.length).forEach(function (li) { c.list.appendChild(li); added.push(li); });
    } else {
      c.list.innerHTML = fresh.innerHTML;
    }
    var empty = $('#chat-empty', c.root);
    if (empty) empty.hidden = newKeys.length > 0;
    if (animate && !REDUCED) added.forEach(function (li) { if (li.classList.contains('msg')) li.classList.add('is-new'); });
    return { added: added.length, wasBottom: wasBottom };
  }
  function chatSend(form) {
    var c = chat;
    if (!c || !form) return;
    var inp = c.input, v = inp.value;
    if (!clean1(v)) { inp.value = ''; chatInputUi(); return; }
    var res = S.sendMessage(c.id, v);
    if (!res.ok) {
      if (res.error === 'flood') toast('Doucement : laisse aux autres le temps de répondre.', '✋');
      else if (res.error === 'notin' || res.error === 'notfound' || res.error === 'nome') { toast('Tu ne participes plus à cette activité.', '⚠️'); go(S.activity(c.id) ? '#/activity/' + enc(c.id) : '#/chats'); }
      else if (res.error !== 'empty') toast("Le message n'est pas parti, réessaie.", '⚠️');
      return;
    }
    inp.value = '';
    chatInputUi();
    chatSync(true);
    chatToBottom(true);
    chatJump(false);
    /* le clavier reste ouvert (iPhone) : on garde le focus dans le champ */
    try { inp.focus({ preventScroll: true }); } catch (e) { /* rien */ }
  }
  /* Message reçu (ou masqué) pour la discussion affichée : true si c'est elle (pas de toast). */
  function chatOnRemote(ev, d) {
    var c = chat;
    if (!c || current.name !== 'chat') return false;
    var aid = ev === 'message:hidden' ? d.activityId : (d.message && d.message.activityId);
    if (aid !== c.id) return false;
    var r = chatSync(ev === 'message:new');
    if (ev === 'message:new' && r && r.added) {
      if (r.wasBottom) chatToBottom(true); else chatJump(true);
    }
    S.markRead(c.id);
    paintUnread();
    return true;
  }
  /* Discussion affichée après une relecture : accès toujours permis ? liste à jour. */
  function refreshChat() {
    var c = chat;
    if (!c) return;
    if (!S.activity(c.id)) { toast("Cette activité vient d'être annulée par son organisateur.", '🗑️'); go('#/chats'); return; }
    if (!S.canChat(c.id)) { toast("Tu ne participes plus à cette activité : la discussion est réservée aux participants.", '👋'); go('#/activity/' + enc(c.id)); return; }
    var r = chatSync(true);
    if (r && r.added) { if (r.wasBottom) chatToBottom(true); else chatJump(true); }
    S.markRead(c.id);
    paintUnread();
  }

  /* ---------- #/chats : Mes discussions ---------- */

  function chatRows() {
    return S.myChats().map(function (a) {
      var last = S.lastMessage(a.id);
      return { a: a, last: last, unread: S.unread(a.id), past: S.isPast(a), t: last ? Date.parse(last.at) : 0 };
    }).sort(function (x, y) {
      if (x.past !== y.past) return x.past ? 1 : -1;
      if (y.t !== x.t) return y.t - x.t;
      return S.time(x.a) - S.time(y.a);
    });
  }
  function chatRowHTML(r, i) {
    var a = r.a, c = catOf(a.cat), m = r.last, me = S.me();
    var href = '#/chat/' + enc(a.id);
    return '<li class="chat-li" style="--i:' + Math.min(i, 10) + '"><a class="chat-row' + (r.unread ? ' has-unread' : '') + '" href="' + href + '" data-key="' + href + '" style="' + catStyle(c) + '">' +
      '<span class="cr-emoji' + emojiCls(a.emoji) + '" aria-hidden="true">' + esc(a.emoji) + '</span>' +
      '<span class="cr-main">' +
        '<span class="cr-top"><strong class="cr-title">' + esc(a.title) + '</strong>' +
          (m ? '<time class="cr-time" datetime="' + esc(m.at) + '">' + esc(msgWhen(m.at)) + '</time>' : '') + '</span>' +
        '<span class="cr-last">' + (m ? '<b>' + esc(nb(msgAuthor(m, me) + ' :')) + '</b> ' + esc(nb(m.body))
          : '<i>' + esc(nb('Pas encore de message. Lance la discussion !')) + '</i>') + '</span>' +
        '<span class="cr-when">' + esc(nb((r.past ? 'Terminée' : shortWhen(a.date)) + ' · ' + plural(a.participants.length, 'participant', 'participants'))) + '</span>' +
      '</span>' +
      (r.unread ? '<span class="cr-badge"><span aria-hidden="true">' + (r.unread > 9 ? '9+' : r.unread) + '</span><span class="sr-only">' + esc(plural(r.unread, 'message non lu', 'messages non lus')) + '</span></span>' : '') +
    '</a></li>';
  }
  VIEWS.chats = function () {
    var rows = chatOn() ? chatRows() : [];
    ui.chatsEmptyKind = rows.length ? '' : (noActsYet() ? 'none' : 'some');
    return {
      title: 'Mes discussions',
      html:
        '<section class="page chats">' +
          '<header class="page-head"><h1 class="page-title">Mes discussions</h1>' +
            '<p class="page-sub">' + esc(nb("Une discussion par activité où tu participes, pour t'organiser avec le groupe.")) + '</p></header>' +
          (rows.length
            ? '<ul class="chat-rows" id="chat-rows">' + rows.map(chatRowHTML).join('') + '</ul>'
            : noActsYet()
              ? emptyLive('💬', (T.emptyLive || {}).chatsTitle, (T.emptyLive || {}).chats, firstActBtn())
              : liveOn()
                ? emptyLive('💬', (T.emptyLive || {}).chatsTitle, "Rejoins une activité : tu pourras t'organiser avec le groupe ici.", '<a class="btn btn-primary empty-cta" href="#/activities">Voir les activités</a>')
                : emptyState('💬', "Pas encore de discussion. Rejoins une activité : tu pourras t'organiser avec le groupe ici.", '<a class="btn btn-primary" href="#/activities">Voir les activités</a>')) +
          footer() +
        '</section>'
    };
  };
  function refreshChats() {
    var box = $('#chat-rows', $view);
    var rows = chatRows();
    if (!box && !rows.length) {
      /* mode live : la première activité du campus vient d'arriver → l'invitation change */
      if (liveOn() && (noActsYet() ? 'none' : 'some') !== ui.chatsEmptyKind) refresh();
      return;
    }
    if (!box || !rows.length) { refresh(); return; }
    var html = rows.map(chatRowHTML).join('');
    if (box.innerHTML === htmlOf(html).innerHTML) return;
    flipSwap(box, html);
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
  /* « ✨ Autre chose » : activité libre, hors de la liste des passions (store : passion '' + customLabel). */
  var CUSTOM = S.CUSTOM || 'autre';
  function passionOptions(catId, selected) {
    return D.passions.filter(function (p) { return p.cat === catId; }).map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (p.id === selected ? ' selected' : '') + '>' + esc(p.emoji + ' ' + p.label) + '</option>';
    }).join('') +
      '<option value="' + CUSTOM + '"' + (selected === CUSTOM ? ' selected' : '') + '>' + esc('✨ Autre chose…') + '</option>';
  }
  /* Emoji d'une activité libre : celui de la catégorie (valeur vide = par défaut) ou un de cette liste. */
  var CUSTOM_EMOJIS = ['✨', '🎯', '🎲', '🎳', '🚴', '🍕', '☕', '🍻', '🎤', '📸', '💡'];
  function emojiChoices(catId, selected) {
    var c = catOf(catId);
    var list = [{ v: '', e: c.emoji, t: 'Emoji de la catégorie' }].concat(CUSTOM_EMOJIS.filter(function (e) { return e !== c.emoji; })
      .map(function (e) { return { v: e, e: e, t: '' }; }));
    if (selected && !list.some(function (x) { return x.v === selected; })) selected = '';
    return list.map(function (x) {
      return '<label class="emoji-opt"' + (x.t ? ' title="' + esc(x.t) + '"' : '') + '><input type="radio" name="emojiPick" value="' + esc(x.v) + '"' +
        (x.v === (selected || '') ? ' checked' : '') + (x.t ? ' aria-label="' + esc(x.t + ' ' + x.e) + '"' : '') + '>' +
        '<span' + (x.t ? ' aria-hidden="true"' : '') + '>' + esc(x.e) + '</span></label>';
    }).join('');
  }
  function placeChips(cur) {
    cur = String(cur || '').trim();
    return D.places.map(function (p) {
      var on = p === cur;
      return '<button type="button" class="fchip place-chip' + (on ? ' is-on' : '') + '" data-action="cf-place" data-value="' + esc(p) + '" aria-pressed="' + on + '">' + esc(p) + '</button>';
    }).join('');
  }
  /* Le champ « C'est quoi ? » et ses emojis n'apparaissent qu'avec « ✨ Autre chose ». */
  function syncCustomUi(form, focus) {
    var f = form || $('#create-form');
    if (!f) return;
    var ps = f.elements.passion;
    var on = !!ps && ps.value === CUSTOM;
    var box = $('#cf-custom', f), link = $('#cf-other', f);
    if (box && box.hidden === on) {
      box.hidden = !on;
      if (on) {
        var pick = $('#cf-emojis', f), cat = $('input[name="cat"]:checked', f);
        if (pick) pick.innerHTML = emojiChoices(cat ? cat.value : 'sport', f.elements.emoji ? f.elements.emoji.value : '');
        pop(box);
        var inp = $('#cf-custom-label', f);
        if (focus && inp) { try { inp.focus(); } catch (e) { /* rien */ } }
      } else {
        var er = $('[data-err="custom"]', f); if (er) er.textContent = '';
      }
    }
    if (link) link.hidden = on;
  }
  function syncPlaceChips(form) {
    var f = form || $('#create-form');
    var v = f && f.elements.place ? String(f.elements.place.value).replace(/\s+/g, ' ').trim() : '';
    $$('.place-chip', f).forEach(function (b) {
      var on = b.getAttribute('data-value') === v;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
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
    /* ?cat= (« Lance la première » d'une catégorie vide) : une de mes passions de cette catégorie, sinon la première */
    var qcat = !q.passion && S.category(q.cat) ? q.cat : '';
    var catPa = null;
    if (qcat) {
      (me.passions || []).some(function (x) { var p0 = S.passion(x.id); if (p0 && p0.cat === qcat) { catPa = p0; return true; } return false; });
      if (!catPa) catPa = D.passions.filter(function (p0) { return p0.cat === qcat; })[0] || null;
    }
    var pa = S.passion(q.passion) || catPa || (me.passions[0] && S.passion(me.passions[0].id)) || D.passions[0];
    var tomorrow = new Date(S.now().getTime() + 864e5);
    /* Pas de lieu par défaut : l'organisateur l'écrit (ou touche une suggestion). */
    var v = pre || {
      title: q.passion && pa ? sessionTitle(pa) : '',
      cat: pa.cat, passion: pa.id, customLabel: '', day: isoDay(tomorrow), time: '18:00',
      place: '', max: 8, level: 'tous', description: '', emoji: ''
    };
    var custom = v.passion === CUSTOM;
    var banner = withP && q.passion
      ? '<div class="propose-banner">' + avatar(withP, 36) + '<span>' + esc(nb('Tu proposes une activité à ' + withP.firstName + ', autour ' + deArt(pa.withArticle || pa.label) + '. Elle sera ouverte à tout le campus.')) + '</span></div>'
      : '';
    return {
      title: 'Créer une activité',
      html:
        '<section class="page create">' +
          '<header class="page-head">' +
            /* Double-clic qui pré-remplit « Écrire une chanson en groupe » : V1 (mode local) seulement. */
            '<h1 class="page-title"' + (liveOn() ? '' : ' data-demo-fill="create"') + '>Créer une activité</h1>' +
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
                '<button type="button" class="cf-other" id="cf-other" data-action="cf-other"' + (custom ? ' hidden' : '') + '>' +
                  '<span aria-hidden="true">✨</span> ' + esc(nb('Pas dans la liste ? Propose autre chose')) + '</button>' +
                '<div class="cf-custom" id="cf-custom"' + (custom ? '' : ' hidden') + '>' +
                  '<label class="label" for="cf-custom-label">' + esc(nb("C'est quoi ?")) + '</label>' +
                  '<input class="input" id="cf-custom-label" name="customLabel" maxlength="40" autocomplete="off" placeholder="' + esc(nb('Ex. : badminton, origami, soirée raclette…')) + '" value="' + esc(v.customLabel || '') + '">' +
                  '<p class="field-error" data-err="custom"></p>' +
                  '<p class="label cf-emoji-label" id="cf-emoji-label">Un emoji pour ta carte</p>' +
                  '<div class="emoji-pick" id="cf-emojis" role="radiogroup" aria-labelledby="cf-emoji-label">' + emojiChoices(v.cat, v.emoji) + '</div>' +
                '</div>' +
              '</div>' +
              '<div class="field-row">' +
                '<div class="field"><label class="label" for="cf-day">Jour</label>' +
                  '<div class="select"><select class="input" id="cf-day" name="day">' + dayOptions(v.day) + '</select></div></div>' +
                '<div class="field field--time"><label class="label" for="cf-time">Heure</label>' +
                  '<input class="input" type="time" id="cf-time" name="time" step="900" value="' + esc(v.time) + '"></div>' +
              '</div>' +
              '<p class="field-error" data-err="date"></p>' +
              '<div class="field field--place">' +
                '<label class="label" for="cf-place">Lieu</label>' +
                '<input class="input" id="cf-place" name="place" maxlength="60" autocomplete="off" placeholder="' + esc(nb('Où ça se passe ?')) + '" value="' + esc(v.place) + '">' +
                '<p class="field-error" data-err="place"></p>' +
                '<div class="chip-strip place-chips" role="group" aria-label="Suggestions de lieux">' + placeChips(v.place) + '</div>' +
              '</div>' +
              '<div class="field field--places"><label class="label" for="cf-max">Places</label>' +
                '<div class="stepper">' +
                  '<button type="button" class="step-btn" data-action="step" data-d="-1" aria-label="Une place de moins">' + icon('minus') + '</button>' +
                  '<input class="input" type="number" inputmode="numeric" id="cf-max" name="max" min="2" max="30" value="' + esc(v.max) + '">' +
                  '<button type="button" class="step-btn" data-action="step" data-d="1" aria-label="Une place de plus">' + icon('plus') + '</button>' +
                '</div></div>' +
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
    var passion = val('passion');
    return {
      title: val('title'), cat: cat ? cat.value : 'sport', passion: passion,
      customLabel: passion === CUSTOM ? val('customLabel') : '',
      day: val('day'), time: val('time') || '18:00', place: val('place'),
      max: parseInt(val('max'), 10), level: level ? level.value : 'tous',
      description: val('description'), emoji: val('emoji')
    };
  }
  function clean1(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

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
    var custom = v.passion === CUSTOM;
    var fake = {
      id: 'apercu', title: clean1(v.title) || (custom && clean1(v.customLabel)) || 'Ton activité',
      emoji: v.emoji || (pa ? pa.emoji : catOf(v.cat).emoji),
      cat: v.cat, passion: custom ? '' : v.passion, customLabel: custom ? clean1(v.customLabel) : '',
      kind: me.role === 'prof' ? 'atelier' : 'activite',
      date: d.toISOString(), place: clean1(v.place) || 'Lieu à choisir', max: max, level: v.level,
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
    var MSG = {
      title: 'Donne un titre à ton activité.',
      custom: "Dis en deux mots ce que c'est (ex. : badminton).",
      pastDate: 'Ce moment est déjà passé, choisis une autre heure ou un autre jour.',
      date: 'Choisis un jour et une heure.',
      place: 'Dis où ça se passe, ou touche une suggestion.',
      max: 'Entre 2 et 30 places.',
      cat: 'Choisis une catégorie.',
      other: 'Vérifie le formulaire.'
    };
    /* champs vides : toutes les erreurs d'un coup, dans l'ordre du formulaire */
    var errs = [];
    if (!clean1(v.title)) errs.push('title');
    if (v.passion === CUSTOM && !clean1(v.customLabel)) errs.push('custom');
    if (!clean1(v.place)) errs.push('place');
    var res = errs.length ? null : S.createActivity(v);
    if (res && !res.ok) errs.push(MSG[res.error] ? res.error : 'other');
    if (errs.length) {
      var FIELD = { title: '#cf-title', custom: '#cf-custom-label', pastDate: '#cf-time', date: '#cf-time', place: '#cf-place', max: '#cf-max', cat: '#cf-title', other: '#cf-title' };
      var ERR = { pastDate: 'date', cat: 'title', other: 'title' };
      errs.forEach(function (k, i) {
        showError(ERR[k] || k, MSG[k]);
        var field = $(FIELD[k]);
        if (!field) return;
        if (k !== 'pastDate' && k !== 'date' && k !== 'max') field.setAttribute('aria-invalid', 'true');
        shake(field);
        if (i === 0) { try { field.focus(); } catch (e) { /* rien */ } }
      });
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
    set('customLabel', '');
    set('max', s.max);
    var lv = $('input[name="level"][value="' + s.level + '"]', f);
    if (lv) lv.checked = true;
    set('description', s.description || '');
    clearErrors();
    syncCustomUi(f);
    syncPlaceChips(f);
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
    var lv = liveOn();
    var kpis = [
      { k: 'members', label: lbl(st.members, 'inscrit', 'inscrits'), sub: lv && !st.profs ? 'en direct sur le campus' : 'dont ' + plural(st.profs, 'prof', 'profs'), emoji: '🙋' },
      { k: 'upcoming', label: lbl(st.upcoming, 'activité à venir', 'activités à venir'), sub: 'sur le campus', emoji: '🗓️' },
      { k: 'participations', label: lbl(st.participations, 'participation', 'participations'), sub: lv && !st.participations ? 'dès la première activité' : 'places prises', emoji: '🙌' },
      { k: 'connections', label: lbl(st.connections, 'connexion créée', 'connexions créées'), sub: lv && !st.connections ? "« Contacter » sur un profil, et c'est parti" : 'demandes de contact', emoji: '🔗' },
      { k: 'exchanges', label: lbl(st.exchanges, 'échange de talents possible', 'échanges de talents possibles'), sub: "l'un transmet ce que l'autre veut apprendre", emoji: '🎓' }
    ];
    /* mode live, aucune activité : la tuile invite à lancer la première (pas de « 0 activité » sec) */
    var kpiSub = function (k) {
      if (lv && k.k === 'upcoming' && !st.upcoming && me) return '<a class="kpi-sub kpi-go" href="#/create">' + esc(nb('Lance la première')) + icon('arrow') + '</a>';
      return '<span class="kpi-sub">' + esc(lv ? nb(k.sub) : k.sub) + '</span>';
    };
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
              kpiSub(k) +
              delta(k.k) +
            '</div>';
          }).join('') + '</div>' +
          '<div class="impact-grid">' +
            (hasGraph
              ? '<section class="card graph-card">' +
                  '<div class="card-head"><h2 class="card-title">Réseau du campus</h2><span class="graph-meta" id="graph-meta">' + plural(S.people().length, 'personne', 'personnes') + ' · ' + st.connections + ' ' + lbl(st.connections, 'connexion', 'connexions') + '</span></div>' +
                  '<div class="graph-wrap"><canvas id="campus-graph" aria-label="Graphe des connexions entre les membres du campus" role="img"></canvas>' +
                    (lv ? '<p class="graph-alone" id="graph-alone"' + (S.people().length > 1 ? ' hidden' : '') + '>' + esc(nb((T.emptyLive || {}).graphAlone || '')) + '</p>' : '') + '</div>' +
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
            '<section class="card top-card" data-kind="' + (st.top.length ? 'list' : 'empty') + '">' +
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
              }).join('') + '</ol>'
                : lv ? emptyLive('🏆', (T.emptyLive || {}).topTitle, (T.emptyLive || {}).top, me ? firstActBtn('Crée la première activité', '#/create', 'btn-primary') : '', 'empty--top')
                : emptyState('🗓️', T.emptyStates.topActivities)) +
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
          '<p class="demo-note">' + esc(nb(liveOn() && T.impactDisclaimerLive ? T.impactDisclaimerLive : T.impactDisclaimer)) + '</p>' +
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
          var r = callFx('campusGraph', [cv, { people: S.people().map(pubP), connections: S.state.connections, categories: D.categories, meId: S.state.me, legend: false }]);
          var g = r.ok ? r.value : null;
          if (g) {
            fxHandles.push(g);
            ui.graph = g;
            /* [personne] = nouveau membre ; [moi, autre] = nouvelle connexion (le lien s'allume).
             * fx attend que le graphe soit à l'écran avant de jouer les pulsations. */
            var pulses = ui.pulses.slice();
            ui.pulses = [];
            pulses.forEach(function (pp, i) {
              later(function () { try { if (typeof g.pulse === 'function') g.pulse(pp[0], pp[1]); } catch (e) { /* rien */ } }, 1300 + i * 600);
            });
            /* mode live, une ou deux personnes : le réseau pulse doucement au lieu de rester figé */
            if (liveOn() && !REDUCED && typeof g.pulse === 'function') {
              var li = 0;
              var lonely = setInterval(function () {
                var ppl = S.people().filter(function (p) { return p.visible !== false || p.id === S.state.me; });
                if (ui.graph !== g || ppl.length > 2 || document.hidden) return;
                li = (li + 1) % ppl.length;
                try { g.pulse(ppl[li].id); } catch (e) { /* rien */ }
              }, 3400);
              fxHandles.push({ stop: function () { clearInterval(lonely); } });
            }
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
      ? (teamMe()
          ? '<p class="team-note">' + icon('spark') + esc(nb("Ton profil d'organisateur : il est fixé dans l'app, le même sur tous les appareils.")) + '</p>'
          : '<a class="btn btn-primary" href="#/edit/1" data-action="edit-profile">' + icon('edit') + 'Modifier mon profil</a>')
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
          : noActsYet()
            ? '<p class="muted">' + esc(nb((T.emptyLive || {}).myActs || T.emptyStates.myActivities)) + '</p>' + firstActBtn('Crée la première activité', '#/create', 'btn-soft')
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
   * Mode live (SPEC §9) : statut de la synchro, événements distants
   * Contrat consommé, toujours sous garde (sans lui, l'app reste la V1) :
   *   CC.store.on(event, fn) → off ; CC.store.syncStatus() → 'local' | 'connecting' | 'live' | 'offline'
   * Règle d'or : un événement distant ne re-rend jamais brutalement l'écran. On met à jour
   * seulement les blocs concernés (compteurs, jauges, listes en FLIP), jamais un formulaire.
   * ================================================================ */

  var LIVE_TXT = { live: 'LIVE', connecting: 'Connexion…', offline: 'Hors ligne', local: 'Local' };
  var WALL_TXT = { live: 'LIVE', connecting: 'Connexion…', offline: 'Hors ligne', local: 'Démo locale' };
  var ADMIN_TXT = { live: 'LIVE', connecting: 'Connexion…', offline: 'Hors ligne', local: 'Mode local' };
  var ADMIN_WHY = {
    live: 'Les téléphones et le mur sont reliés : tout arrive ici en direct.',
    connecting: 'Connexion à la base partagée…',
    offline: 'Pas de réseau : les actions de cet appareil partiront au retour du réseau.',
    local: 'Mode local : rien ne sort de cet ordinateur. Les téléphones ne sont pas reliés.'
  };
  var LIVE_TITLE = {
    live: 'En direct : tout le campus voit les mises à jour.',
    connecting: 'Connexion au direct…',
    offline: 'Hors ligne : tes actions partiront dès le retour du réseau.',
    local: 'Mode local : tout reste sur cet appareil.'
  };
  var live = { bound: false, status: 'local', liveAt: 0, bootAt: Date.now(), everLive: false, q: [], qT: 0, lastToast: 0, refT: 0, hints: [] };

  function readStatus() {
    try {
      if (S && typeof S.syncStatus === 'function') { var s = S.syncStatus(); if (LIVE_TXT[s]) return s; }
    } catch (e) { /* rien */ }
    return 'local';
  }

  function pillHTML(cls) {
    var quiet = cls === 'live-pill--top' || cls === 'live-pill--side';
    return '<span class="live-pill' + (cls ? ' ' + cls : '') + '" data-live-pill data-st="local" title="' + esc(LIVE_TITLE.local) + '"' +
      (quiet ? ' hidden' : '') + '><i aria-hidden="true"></i><span class="lp-txt">' + LIVE_TXT.local + '</span></span>';
  }
  function paintPills() {
    var st = live.status;
    $$('[data-live-pill]').forEach(function (el) {
      var kind = el.getAttribute('data-live-pill');
      var txt = kind === 'wall' ? WALL_TXT : kind === 'admin' ? ADMIN_TXT : LIVE_TXT;
      if (el.getAttribute('data-st') !== st) {
        el.setAttribute('data-st', st);
        el.title = LIVE_TITLE[st];
        var t = $('.lp-txt', el);
        if (t) t.textContent = txt[st];
        /* panel organisateur : la phrase d'explication suit la pastille */
        var why = kind === 'admin' && el.parentNode ? $('.adm-status-why', el.parentNode) : null;
        if (why) why.textContent = nb(ADMIN_WHY[st] || '');
      }
      /* Barre du haut et barre latérale : la pastille n'apparaît qu'en mode live (le mode local reste la V1). */
      if (el.classList.contains('live-pill--top') || el.classList.contains('live-pill--side')) el.hidden = st === 'local';
    });
    var ad = document.getElementById('adm');
    if (ad) ad.setAttribute('data-st', st);
  }

  function bindLive() {
    if (live.bound || !S || typeof S.on !== 'function') return false;
    live.bound = true;
    live.status = readStatus();
    if (live.status === 'live') { live.liveAt = Date.now(); live.everLive = true; }
    /* 'message:new' / 'message:hidden' : chat d'activité (V1.2). */
    ['status', 'person:new', 'join', 'leave', 'activity:new', 'connection:new', 'message:new', 'message:hidden', 'change'].forEach(function (ev) {
      try {
        S.on(ev, function (d) {
          try { onLive(ev, d || {}); } catch (e) { if (window.console) console.warn('[Campus Connect · direct]', e); }
        });
      } catch (e) { /* rien */ }
    });
    /* filet : si un « status » se perd, on le rattrape */
    if (typeof S.syncStatus === 'function') {
      setInterval(function () { var s = readStatus(); if (s !== live.status) onStatus(s); }, 4000);
    }
    paintPills();
    return true;
  }

  function onStatus(s) {
    if (!LIVE_TXT[s]) s = readStatus();
    var prev = live.status;
    if (s === prev) return;
    live.status = s;
    if (s === 'live') live.liveAt = Date.now();
    paintPills();
    var onWall = current.name === 'live' || current.name === 'admin';
    if (onWall && wall) { wallStatus(); if (s === 'live') wall.quietUntil = Date.now() + 1500; }
    if (s === 'offline' && live.everLive && !live.offToast) {
      live.offToast = true;
      if (!onWall) toast('Connexion perdue. Tes actions partiront dès le retour du réseau.', '📡');
    } else if (s === 'live') {
      if (live.offToast && !onWall) toast('De retour en direct.', '🟢');
      live.offToast = false;
      live.everLive = true;
    }
  }

  /* Écrans qui supposent un profil sur cet appareil. */
  var NEEDS_ME = { home: 1, explore: 1, activities: 1, impact: 1, create: 1, me: 1, edit: 1, person: 1, activity: 1, chats: 1, chat: 1 };

  function onLive(ev, d) {
    if (ev === 'status') { onStatus(d.status); return; }
    journalAdd(ev, d);
    if (current.name === 'admin') { if (wall) wallOn(ev, d); admOn(ev, d); return; }
    if (current.name === 'live') { wallOn(ev, d); return; }
    if (ev === 'message:new' || ev === 'message:hidden') { onChatEvent(ev, d); return; }
    if (ev === 'change') {
      paintUnread();
      /* Base remise à zéro (cc_reset) ou profil effacé dans un autre onglet : cet appareil n'a plus de
       * profil, on revient à la Bienvenue (sinon l'écran garderait l'ancien prénom et les actions échoueraient). */
      if (liveOn() && (d.reset || !S.me()) && NEEDS_ME[current.name] && (location.hash || '').indexOf('#/welcome') !== 0) {
        resetUi();
        go('#/welcome', { force: true });
        if (!d.reset || d.remote) toast('Le campus repart de zéro : recrée ton profil, ça prend deux minutes.', '🔄');
        return;
      }
      if (d.remote) scheduleRefresh();
      return;
    }
    if (!d.remote) return; // mes propres actions : l'écran est déjà à jour
    var me = S.state && S.state.me;
    /* Trop tard : plusieurs téléphones ont pris la dernière place en même temps, le serveur a départagé
     * et ce n'est pas moi. Réponse directe à mon clic : le toast passe tout de suite. */
    if (ev === 'leave' && d.reason === 'full' && me && d.personId === me) {
      var fa = S.activity(d.activityId);
      /* pas de « X vient de rejoindre » juste après : le toast « trop tard » dit déjà tout */
      live.fullAt = { a: d.activityId, t: Date.now() };
      takeQ(function (it) { return it.k === 'join' && it.a === d.activityId; });
      toast(fa ? "Trop tard : la dernière place de « " + fa.title + " » vient d'être prise. C'est complet." : "Trop tard : la dernière place vient d'être prise. C'est complet.", '😕');
      scheduleRefresh({ k: 'leave', a: d.activityId, p: me });
      return;
    }
    var quiet = live.status === 'connecting' || Date.now() - live.bootAt < 1500;
    var at = Date.now();
    if (ev === 'person:new') {
      if (!d.person || d.person.id === me || d.person.visible === false) return;
      if (!quiet) remoteToast({ k: 'person', p: d.person, at: at });
    } else if (ev === 'join' || ev === 'leave') {
      if (d.personId === me) return;
      scheduleRefresh({ k: ev, a: d.activityId, p: d.personId });
      var justFull = live.fullAt && live.fullAt.a === d.activityId && at - live.fullAt.t < 6000;
      if (ev === 'join' && !quiet && !justFull) remoteToast({ k: 'join', a: d.activityId, p: d.personId, at: at });
    } else if (ev === 'activity:new') {
      if (!d.activity || d.activity.organizerId === me) return;
      if (!quiet) remoteToast({ k: 'activity', act: d.activity, at: at });
    } else if (ev === 'connection:new') {
      scheduleRefresh({ k: 'conn', a: d.a, b: d.b });
      if (!quiet && me && d.b === me && d.a !== me) remoteToast({ k: 'conn', p: d.a, at: at });
    }
  }

  /* Chat : la discussion affichée se met à jour ; ailleurs, pastilles de non-lus et toast discret
   * (seulement pour les discussions où je participe, jamais pour mes propres messages). */
  function onChatEvent(ev, d) {
    paintUnread();
    if (!d.remote) return; // mes messages : l'écran est déjà à jour
    if (chatOnRemote(ev, d)) return;
    if (current.name === 'activity') refreshChatBlock();
    else if (current.name === 'chats') scheduleRefresh();
    if (ev !== 'message:new' || !d.message) return;
    var me = S.state && S.state.me, m = d.message;
    if (!me || m.personId === me || m.hidden || !S.canChat(m.activityId)) return;
    if (live.status === 'connecting' || Date.now() - live.bootAt < 1500) return;
    remoteToast({ k: 'msg', m: m, at: Date.now() });
  }

  /* ---------- Toasts des événements distants : regroupés, jamais pendant la saisie ---------- */

  var TOAST_GAP = 2600;
  function remoteToast(item) {
    live.q.push(item);
    if (live.q.length > 40) live.q.splice(0, live.q.length - 40);
    if (!live.qT) live.qT = setTimeout(flushRemote, 500);
  }
  function typing() {
    var a = document.activeElement;
    if (!a || a === document.body) return false;
    var tag = a.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') return !/^(checkbox|radio|button|submit|range|color|reset)$/i.test(a.type || 'text');
    return !!a.isContentEditable;
  }
  function holdToasts() {
    return current.name === 'onboarding' || current.name === 'edit' || current.name === 'live' || current.name === 'admin' || typing() ||
      !!($modal && $('.modal', $modal)) || !!document.querySelector('.ccfx-reveal');
  }
  function flushRemote() {
    live.qT = 0;
    var t = Date.now();
    live.q = live.q.filter(function (it) { return t - it.at < 90000; });
    if (!live.q.length) return;
    if (holdToasts()) { live.qT = setTimeout(flushRemote, 1500); return; }
    var wait = TOAST_GAP - (t - live.lastToast);
    if (wait > 0) { live.qT = setTimeout(flushRemote, wait); return; }
    var m = null;
    try { m = buildRemoteToast(); } catch (e) { live.q = []; }
    if (m) { toast(m.text, m.ic); live.lastToast = Date.now(); }
    if (live.q.length) live.qT = setTimeout(flushRemote, TOAST_GAP);
  }
  function takeQ(fn) {
    var out = [], keep = [];
    live.q.forEach(function (it) { (fn(it) ? out : keep).push(it); });
    live.q = keep;
    return out;
  }
  function names(list) {
    if (list.length === 1) return list[0];
    if (list.length === 2) return list[0] + ' et ' + list[1];
    if (list.length === 3) return list[0] + ', ' + list[1] + ' et ' + list[2];
    return list[0] + ', ' + list[1] + ' et ' + (list.length - 2) + ' autres';
  }
  function emojisOf(p, max) {
    return (p.passions || []).map(function (x) { var pa = S.passion(x.id); return pa ? pa.emoji : ''; }).filter(Boolean).slice(0, max || 3).join(' ');
  }
  function buildRemoteToast() {
    var me = S.me();
    /* 1. une nouvelle personne qui entre dans mes affinités */
    if (me) {
      var top = topAffinityIds();
      var aff = takeQ(function (it) { return it.k === 'person' && top.indexOf(it.p.id) >= 0; });
      if (aff.length) {
        var a1 = S.affinityWith(me, S.person(aff[0].p.id) || aff[0].p);
        live.q = aff.slice(1).concat(live.q);
        if (a1 && a1.reasons && a1.reasons[0]) return { text: 'Nouvelle affinité : ' + a1.reasons[0], ic: '💜' };
        return { text: aff[0].p.firstName + ' vient de s\'inscrire, et ça colle avec toi', ic: '💜' };
      }
    }
    /* 2. quelqu'un veut me rencontrer */
    var conn = takeQ(function (it) { return it.k === 'conn'; });
    if (conn.length) {
      var who = conn.map(function (it) { var p = S.person(it.p); return p ? p.firstName : ''; }).filter(Boolean);
      if (who.length) return { text: names(who) + (who.length > 1 ? ' veulent te rencontrer' : ' veut te rencontrer'), ic: '👋' };
    }
    /* 2 bis. nouveaux messages dans mes discussions (pas celle que je regarde, pas les messages masqués entre-temps) */
    var msgs = takeQ(function (it) { return it.k === 'msg'; }).filter(function (it) {
      var m = typeof S.message === 'function' ? S.message(it.m.id) : it.m;
      return !!m && !m.hidden && S.canChat(m.activityId) && !(current.name === 'chat' && chat && chat.id === m.activityId);
    });
    if (msgs.length === 1) {
      var mm = msgs[0].m, ma = S.activity(mm.activityId), mp = S.person(mm.personId);
      if (ma && mp) return { text: nameOf(mp) + ' · ' + shortTitle(ma.title) + ' : ' + clip(mm.body, 70), ic: '💬' };
    } else if (msgs.length > 1) {
      var mActs = [];
      msgs.forEach(function (it) { if (mActs.indexOf(it.m.activityId) === -1) mActs.push(it.m.activityId); });
      var ma1 = mActs.length === 1 ? S.activity(mActs[0]) : null;
      return { text: msgs.length + ' nouveaux messages ' + (ma1 ? 'dans « ' + shortTitle(ma1.title) + ' »' : 'dans tes discussions'), ic: '💬' };
    }
    /* 3. quelqu'un rejoint une activité où je suis (ou celle que je regarde) */
    var vh = parseHash();
    var viewing = current.name === 'activity' && vh.parts[0] === 'activity' ? vh.parts[1] : null;
    var mine = takeQ(function (it) {
      if (it.k !== 'join') return false;
      var a = S.activity(it.a);
      return !!a && (it.a === viewing || (me && (a.organizerId === me.id || a.participants.indexOf(me.id) >= 0)));
    });
    if (mine.length) {
      var a2 = S.activity(mine[0].a), p2 = S.person(mine[0].p);
      live.q = mine.slice(1).concat(live.q);
      if (a2 && p2) {
        if (mine[0].a === viewing) return { text: nameOf(p2) + ' vient de rejoindre l\'activité', ic: '🙌' };
        return { text: nameOf(p2) + (a2.organizerId === (me && me.id) ? ' rejoint ton activité « ' : ' rejoint « ') + a2.title + ' »', ic: '🙌' };
      }
    }
    /* 4. nouvelles activités */
    var acts = takeQ(function (it) { return it.k === 'activity'; });
    if (acts.length === 1) {
      var org = S.person(acts[0].act.organizerId);
      return { text: 'Nouvelle activité : ' + acts[0].act.title + (org && !hiddenP(org) ? ', par ' + org.firstName : ''), ic: esc(acts[0].act.emoji || '✨') };
    }
    if (acts.length > 1) return { text: acts.length + ' nouvelles activités sur le campus', ic: '✨' };
    /* 5. nouveaux inscrits */
    var ppl = takeQ(function (it) { return it.k === 'person'; });
    if (ppl.length) {
      var seen = {}, list = [];
      ppl.forEach(function (it) { if (!seen[it.p.id]) { seen[it.p.id] = 1; list.push(it.p); } });
      if (list.length === 1) {
        var em = emojisOf(list[0], 3);
        return { text: list[0].firstName + ' vient de s\'inscrire' + (em ? ' · ' + em : ''), ic: '🎉' };
      }
      return { text: names(list.map(function (p) { return p.firstName; })) + ' viennent de s\'inscrire', ic: '🎉' };
    }
    /* 6. participations ailleurs */
    var joins = takeQ(function (it) { return it.k === 'join'; });
    if (joins.length === 1) {
      var a3 = S.activity(joins[0].a), p3 = S.person(joins[0].p);
      if (a3 && p3) return { text: nameOf(p3) + ' participe à « ' + a3.title + ' »', ic: '🙌' };
    }
    if (joins.length > 1) return { text: joins.length + ' nouvelles participations sur le campus', ic: '🙌' };
    return null;
  }

  /* ---------- Mise à jour douce de l'écran courant ---------- */

  function scheduleRefresh(hint) {
    if (hint) live.hints.push(hint);
    if (live.refT) return;
    live.refT = setTimeout(runRefresh, 160);
  }
  function runRefresh() {
    live.refT = 0;
    if (!$view || !current.name) return;
    /* L'écran vient d'arriver : on laisse finir sa cascade d'apparition. */
    var age = Date.now() - (current.at || 0);
    if (age < 1500) { live.refT = setTimeout(runRefresh, 1500 - age); return; }
    var hints = live.hints;
    live.hints = [];
    try { liveRefresh(hints); } catch (e) { if (window.console) console.warn('[Campus Connect · direct] mise à jour', e); }
  }

  function liveRefresh(hints) {
    switch (current.name) {
      case 'welcome': refreshWelcome(); break;
      case 'home': refreshHome(); break;
      case 'activities': refreshActivities(); break;
      case 'activity': refreshActivity(hints); break;
      case 'impact': refreshImpact(); break;
      case 'explore': refreshExplore(); break;
      case 'person': case 'me': patchActCards($view); break;
      case 'chat': refreshChat(); break;
      case 'chats': refreshChats(); break;
      default: break; // inscription, modification, création : on ne touche à rien pendant la saisie
    }
    paintUnread();
  }

  /* L'entrée d'écran est finie : de nouveaux éléments ne doivent pas rejouer la cascade. */
  function settleView() {
    if ($view && $view.classList.contains('is-enter')) { $view.classList.remove('is-enter'); $view.classList.add('is-soft'); }
  }
  function htmlOf(html) { var d = document.createElement('div'); d.innerHTML = html; return d; }
  function keyOf(el) {
    var k = el.getAttribute('data-key') || el.getAttribute('href');
    if (!k) { var a = el.querySelector('[href]'); k = a ? a.getAttribute('href') : ''; }
    return k || '';
  }
  function keysOf(box) { return Array.prototype.map.call(box.children, keyOf).join('\n'); }
  function bump(el) {
    if (!el || REDUCED || !el.animate) return;
    try {
      el.animate([{ boxShadow: '0 0 0 0 rgba(91, 61, 245, .45)' }, { boxShadow: '0 0 0 14px rgba(91, 61, 245, 0)' }], { duration: 1100, easing: 'ease-out' });
    } catch (e) { /* rien */ }
  }

  /* Remplace le contenu d'une liste en animant chaque élément depuis son ancienne place (FLIP). */
  function flipSwap(box, content) {
    if (!box) return;
    settleView();
    var first = {};
    $$('[href], [data-key]', box).forEach(function (el) { var k = keyOf(el); if (k && !first[k]) first[k] = el.getBoundingClientRect(); });
    box.classList.add('no-rise');
    if (typeof content === 'function') content(); else box.innerHTML = content;
    if (REDUCED) return;
    $$('[href], [data-key]', box).forEach(function (el) {
      var k = keyOf(el);
      if (!k || !el.animate) return;
      var f = first[k], r = el.getBoundingClientRect();
      try {
        if (f) {
          var dx = f.left - r.left, dy = f.top - r.top;
          if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
            el.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 560, easing: 'cubic-bezier(.2,.85,.25,1.05)' });
          }
        } else {
          el.animate([{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.2,.9,.3,1.25)' });
        }
      } catch (e) { /* rien */ }
    });
  }

  /* Liste rendue dans le HTML de la vue : même ordre → on ne touche qu'aux compteurs ; sinon FLIP. */
  function listPatch(sel, fresh) {
    var box = $(sel, $view), nbox = $(sel, fresh);
    if (!box || !nbox) return false;
    if (keysOf(box) === keysOf(nbox)) { patchActCards(box); return false; }
    flipSwap(box, nbox.innerHTML);
    return true;
  }
  /* Chiffres [data-count] : compteur animé de l'ancienne valeur à la nouvelle. */
  function numsPatch(sel, fresh, glow) {
    var olds = $$(sel, $view), news = $$(sel, fresh);
    olds.forEach(function (o, i) {
      var nw = news[i];
      if (!nw) return;
      var to = parseInt(nw.getAttribute('data-count'), 10) || 0;
      var from = parseInt(o.getAttribute('data-count'), 10) || 0;
      if (to === from) return;
      o.setAttribute('data-count', to);
      countUp(o, from, to, 900);
      if (glow) bump(o.closest(glow));
    });
  }
  function swapPart(parent, nparent, sel, mode) {
    var o = $(sel, parent), n = $(sel, nparent);
    if (o && n) o.parentNode.replaceChild(n, o);
    else if (o && !n) o.parentNode.removeChild(o);
    else if (!o && n) { if (mode === 'prepend') parent.insertBefore(n, parent.firstChild); else parent.appendChild(n); }
  }

  /* Cartes d'activité déjà affichées : compteur qui défile, jauge qui glisse, avatars, badges. */
  function patchActCards(root) {
    var topIds = null;
    $$('a.act-card[href^="#/activity/"]', root || $view).forEach(function (el) {
      var id;
      try { id = decodeURIComponent(el.getAttribute('href').slice(11)); } catch (e) { return; }
      var a = S.activity(id);
      var cnt = $('.act-count b', el);
      if (!a || !cnt) return;
      var n = a.participants.length;
      var old = parseInt(cnt.getAttribute('data-n') || cnt.textContent, 10);
      var ids = a.participants.join(',');
      var oldIds = cnt.getAttribute('data-ids');
      /* même nombre mais pas les mêmes personnes (ex. : j'ai perdu la dernière place, un autre l'a) → on redessine aussi */
      if (old === n && (oldIds === null || oldIds === ids)) return;
      if (!topIds) topIds = topAffinityIds();
      var nw = htmlOf(actCard(a, 0, { topIds: topIds })).firstChild;
      var body = $('.act-body', el), nbody = nw && $('.act-body', nw);
      if (!body || !nbody) return;
      swapPart(body, nbody, '.act-badges', 'prepend');
      swapPart(body, nbody, '.stack');
      swapPart(body, nbody, '.act-friends', 'append');
      el.classList.toggle('is-full', nw.classList.contains('is-full'));
      el.classList.toggle('is-foryou', nw.classList.contains('is-foryou'));
      cnt.setAttribute('data-n', n);
      cnt.setAttribute('data-ids', ids);
      if (old !== n) rollNumber(cnt, old, n, 520);
      var g = $('.gauge span', el), ng = $('.gauge span', nw);
      if (g && ng) g.style.width = ng.style.width;
      pop($('.stack', el));
      bump(el);
    });
  }

  function refreshWelcome() {
    var box = $('.welcome-proof', $view);
    if (!box) return;
    var st = S.stats();
    /* première activité (ou plus aucune) : la phrase change de forme */
    if (box.getAttribute('data-shape') !== proofShape(st)) {
      box.setAttribute('data-shape', proofShape(st));
      box.innerHTML = proofHTML(st);
      pop(box);
      return;
    }
    var moved = false;
    $$('.wp-n', box).forEach(function (el) {
      var to = st[el.getAttribute('data-k')];
      var from = parseInt(el.textContent, 10);
      if (typeof to !== 'number' || to === from) return;
      countUp(el, from, to, 800);
      moved = true;
    });
    var w = $('.wp-w', box);
    if (w) w.textContent = st.upcoming > 1 ? 'activités' : 'activité';
    var wm = $('.wp-m', box);
    if (wm) wm.textContent = lbl(st.members, 'inscrit', 'inscrits');
    if (moved) pop(box);
  }

  function refreshHome() {
    if (!S.me()) return;
    var fresh = htmlOf(VIEWS.home({ name: 'home', query: {} }).html);
    numsPatch('.impact-banner [data-count]', fresh);
    var ibl = $$('.ib-l', $view), nibl = $$('.ib-l', fresh);
    ibl.forEach(function (el, i) { if (nibl[i] && el.textContent !== nibl[i].textContent) el.textContent = nibl[i].textContent; });
    var chips = $('.hero-chips', $view), nchips = $('.hero-chips', fresh);
    if (chips && nchips && chips.innerHTML !== nchips.innerHTML) { chips.innerHTML = nchips.innerHTML; pop(chips); }
    /* Mode live : première activité de la semaine (ou plus aucune) → la liste remplace l'invitation, et inversement. */
    var hw = $('#home-week', $view), nhw = $('#home-week', fresh);
    if (hw && nhw && hw.getAttribute('data-kind') !== nhw.getAttribute('data-kind')) {
      settleView();
      hw.parentNode.replaceChild(nhw, hw);
      bump(nhw);
    } else listPatch(hw ? '#home-week .act-grid' : '.home .act-grid', fresh);
    var orbit = function () {
      var orb = $('.hero-orbit', $view), norb = $('.hero-orbit', fresh);
      if (orb && norb) orb.parentNode.replaceChild(norb, orb);
    };
    /* Affinités : première affinité qui arrive (mode live) → la liste remplace l'encart d'attente, et inversement. */
    var ha = $('#home-affs', $view), nha = $('#home-affs', fresh);
    if (ha && nha && ha.getAttribute('data-kind') !== nha.getAttribute('data-kind')) {
      settleView();
      ha.parentNode.replaceChild(nha, ha);
      orbit();
      bump(nha);
      return;
    }
    if (ha && ha.getAttribute('data-kind') === 'empty') {
      /* encart d'attente : nouvelle activité dans ma catégorie (ou la première du campus) → encart redessiné */
      var ae = $('.aff-empty', ha), nae = nha && $('.aff-empty', nha);
      if (ae && nae && ae.getAttribute('data-sig') !== nae.getAttribute('data-sig')) {
        settleView();
        ae.parentNode.replaceChild(nae, ae);
        bump(nae);
        return;
      }
      patchActCards(ha);
      return;
    }
    if (listPatch('.home .people-grid--3', fresh)) orbit();
  }

  function actsFilter(a) {
    var f = ui.acts.f;
    if (f === 'all') return true;
    if (f === 'pourtoi') return S.isForMe(a);
    return a.cat === f;
  }
  function refreshActivities() {
    var box = $('#acts-list');
    if (!box) return;
    var keys = S.upcoming().filter(actsFilter).map(function (a) { return '#/activity/' + enc(a.id); }).join('\n');
    var cur = $$('a.act-card', box).map(function (el) { return el.getAttribute('href'); }).join('\n');
    if (keys === cur) patchActCards(box);
    else flipSwap(box, function () { renderActsList(false); });
    var up = S.upcoming();
    var counts = { all: up.length, pourtoi: up.filter(S.isForMe).length };
    $$('#acts-filters .fchip').forEach(function (b) {
      var c = $('.fchip-count', b), v = counts[b.getAttribute('data-value')];
      if (typeof v !== 'number') return;
      /* mode live : le compteur apparaît avec la première activité (pas de « 0 ») */
      if (!c && v > 0 && liveOn()) { b.insertAdjacentHTML('beforeend', '<span class="fchip-count">' + v + '</span>'); pop($('.fchip-count', b)); return; }
      if (c && v === 0 && liveOn()) { c.parentNode.removeChild(c); return; }
      if (c && String(v) !== c.textContent) { c.textContent = String(v); pop(c); }
    });
  }

  function refreshActivity(hints) {
    var r = parseHash();
    if (r.parts[0] !== 'activity' || !S.me()) return;
    var a = S.activity(r.parts[1]);
    if (!a) {
      /* annulée à distance par son organisateur (ou par moi, il y a un instant : déjà géré) */
      if (Date.now() - ui.cancelledAt < 3000) return;
      toast("Cette activité vient d'être annulée par son organisateur.", '🗑️');
      go('#/activities');
      return;
    }
    if (chatOn()) refreshChatBlock();
    var nEl = $('#ag-n', $view);
    if (!nEl) return;
    var shown = parseInt(nEl.getAttribute('data-n'), 10);
    var n = a.participants.length;
    var ids = a.participants.join(',');
    if (shown === n && nEl.getAttribute('data-ids') === ids) return;
    var who = '__personne__';
    (hints || []).forEach(function (h) { if (h.k === 'join' && h.a === a.id && a.participants.indexOf(h.p) >= 0) who = h.p; });
    ui.joinAnim = shown !== n ? { id: a.id, from: shown, to: n, personId: who } : null;
    patchView(actPatch());
    bump($('.ad-people', $view));
    if (who !== '__personne__') revealJoin(true);
  }

  function refreshImpact() {
    var fresh = htmlOf(VIEWS.impact({ name: 'impact', query: {} }).html);
    numsPatch('.kpi-num[data-count]', fresh, '.kpi');
    $$('.kpi', $view).forEach(function (k, i) {
      var nk = $$('.kpi', fresh)[i];
      if (!nk) return;
      var sub = $('.kpi-sub', k), nsub = $('.kpi-sub', nk);
      if (sub && nsub && sub.tagName !== nsub.tagName) sub.parentNode.replaceChild(nsub, sub); // lien « Lance la première » ↔ texte
      else if (sub && nsub && sub.textContent !== nsub.textContent) sub.textContent = nsub.textContent;
      var kl = $('.kpi-label', k), nkl = $('.kpi-label', nk);
      if (kl && nkl && kl.textContent !== nkl.textContent) kl.textContent = nkl.textContent;
      var od = $('.delta', k), nd = $('.delta', nk);
      if (nd && (!od || od.textContent !== nd.textContent)) {
        nd.style.animationDelay = '0s';
        if (od) k.replaceChild(nd, od); else k.appendChild(nd);
      }
    });
    var gm = $('#graph-meta', $view), ngm = $('#graph-meta', fresh);
    if (gm && ngm && gm.textContent !== ngm.textContent) gm.textContent = ngm.textContent;
    /* barres par catégorie : même ordre → la barre glisse ; sinon réordonnées en FLIP */
    var bars = $('.bars', $view), nbars = $('.bars', fresh);
    if (bars && nbars) {
      var labels = function (b) { return $$('.bar-label', b).map(function (x) { return x.textContent; }).join('|'); };
      if (labels(bars) === labels(nbars)) {
        var rows = $$('.bar-row', bars), nrows = $$('.bar-row', nbars);
        rows.forEach(function (r, i) {
          var f = $('.bar-fill', r), nf = $('.bar-fill', nrows[i]);
          if (f && nf) f.style.setProperty('--w', nf.style.getPropertyValue('--w'));
          var v = $('.bar-val', r), nv = $('.bar-val', nrows[i]);
          if (v && nv && v.getAttribute('data-count') !== nv.getAttribute('data-count')) {
            var from = parseInt(v.getAttribute('data-count'), 10) || 0, to = parseInt(nv.getAttribute('data-count'), 10) || 0;
            v.setAttribute('data-count', to);
            countUp(v, from, to, 700);
          }
        });
      } else {
        $$('.bar-row', nbars).forEach(function (r) { r.setAttribute('data-key', $('.bar-label', r).textContent); });
        $$('.bar-row', bars).forEach(function (r) { r.setAttribute('data-key', $('.bar-label', r).textContent); });
        flipSwap(bars, nbars.innerHTML);
      }
    }
    /* top 3 : première activité (mode live) → la liste remplace l'invitation, et inversement */
    var tc = $('.top-card', $view), ntc = $('.top-card', fresh);
    if (tc && ntc && tc.getAttribute('data-kind') !== ntc.getAttribute('data-kind')) {
      settleView();
      tc.parentNode.replaceChild(ntc, tc);
      bump(ntc);
    }
    var ga = $('#graph-alone', $view);
    if (ga) ga.hidden = S.people().length > 1;
    var top = $('.top-list', $view), ntop = $('.top-list', fresh);
    if (top && ntop) {
      if (keysOf(top) === keysOf(ntop)) {
        var li = $$('li', top), nli = $$('li', ntop);
        li.forEach(function (x, i) {
          var b = $('.top-count b', x), nb2 = nli[i] && $('.top-count b', nli[i]);
          if (b && nb2 && b.textContent !== nb2.textContent) { rollNumber(b, parseInt(b.textContent, 10) || 0, parseInt(nb2.textContent, 10) || 0, 520); bump(x); }
          var g = $('.grow', x), ng = nli[i] && $('.grow', nli[i]);
          if (g && ng) g.style.setProperty('--w', ng.style.getPropertyValue('--w'));
        });
      } else {
        flipSwap(top, ntop.innerHTML);
      }
    }
    /* réseau : les nouveaux arrivent en vol, les nouvelles connexions s'allument */
    var g2 = ui.graph;
    if (g2 && typeof g2.add === 'function') {
      S.people().forEach(function (p) {
        if (!g2.has(p.id)) g2.add(pubP(p), { links: affinityLinks(p, S.people(), 2) });
      });
      S.state.connections.forEach(function (c) { g2.link(c[0], c[1]); });
    }
  }

  function refreshExplore() {
    var box = $('#explore-results');
    if (!box) return;
    var sig = exploreList().list.map(function (p) { return p.id; }).join(',');
    if (sig !== box.getAttribute('data-sig')) flipSwap(box, function () { renderExploreResults(false); });
  }

  /* Les k personnes avec qui p a le plus d'affinités (pour relier un nouvel arrivant dans le réseau). */
  function affinityLinks(p, pool, k) {
    var out = [];
    pool.forEach(function (o) {
      if (!o || o.id === p.id) return;
      var a = null;
      try { a = S.affinityWith(p, o); } catch (e) { a = null; }
      if (a && a.score > 0) out.push({ id: o.id, s: a.score, t: o.team ? 1 : 0 });
    });
    out.sort(function (x, y) { return (y.s - x.s) || (y.t - x.t); });
    return out.slice(0, k).map(function (x) { return x.id; });
  }

  /* ================================================================
   * Vue : Écran live (#/live) — mur de projection
   * QR code + compteurs géants + réseau plein cadre + fil « à l'instant » + top des activités.
   * Les événements passent par une file : une arrivée à la fois, en accéléré si ça se bouscule.
   * ================================================================ */

  var SIM_NAMES = ['Malik', 'Zoé', 'Nathan', 'Lina', 'Adam', 'Manon', 'Ilyes', 'Clara', 'Noah', 'Jules', 'Maëlys', 'Ayoub',
    'Lou', 'Sacha', 'Romane', 'Eliott', 'Yasmine', 'Gabriel', 'Anaïs', 'Samy', 'Lisa', 'Tom', 'Inaya', 'Mathis', 'Léna',
    'Bilal', 'Alice', 'Diego', 'Salomé', 'Louis'];
  var wall = null;
  /* Simulation (répétition) : des arrivées fictives (ids « sim-… »), jamais écrites dans le store ni dans la base.
   * MODE LOCAL SEULEMENT (V1 hors ligne) : en mode live (vraie base, vrais inscrits), elle n'existe pas, ni
   * interrupteur dans le panel, ni personne « sim-… » sur le mur (simOk() ferme tous les chemins).
   * En local, elle se règle dans le panel organisateur, désactivée à chaque chargement de la page. Ses personnes
   * restent d'un montage du mur à l'autre (aperçu du panel → projection) ; l'arrêter les efface du mur. */
  function freshSim() { return { on: false, t: 0, n: 0, people: [], byId: {}, joins: {}, conns: [] }; }
  var SIM = freshSim();
  function simOk() { return !liveOn(); }

  function canFullscreen() {
    var d = document.documentElement;
    return !!(d && (d.requestFullscreen || d.webkitRequestFullscreen));
  }

  VIEWS.live = function () {
    return { title: 'Écran live', html: wallHTML(false), mount: function (root) { mountWall(root, {}); } };
  };

  /* Le mur, en grand (#/live) ou en miniature dans le panel organisateur (mini : sans outils ni QR géant). */
  function wallHTML(mini) {
    var url = publicUrl();
    var shortUrl = url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    var st = wallStats();
    var kp = WALL_KP;
    return '' +
        '<section class="lw' + (mini ? ' lw--mini' : '') + '" id="lw" data-st="' + esc(live.status) + '"' + (mini ? ' aria-hidden="true"' : '') + '>' +
          '<div class="lw-bg" aria-hidden="true"><i></i><i></i><i></i><i></i></div>' +
          '<header class="lw-head">' +
            '<div class="lw-brand"' + (mini ? '' : ' data-logo') + '>' + logoHTML({ big: true }) + '</div>' +
            '<span class="lw-pill" data-live-pill="wall" data-st="' + esc(live.status) + '" title="' + esc(LIVE_TITLE[live.status]) + '"><i aria-hidden="true"></i><span class="lp-txt">' + WALL_TXT[live.status] + '</span></span>' +
          '</header>' +
          '<div class="lw-kpis">' + kp.map(function (k) {
            return '<div class="lw-kpi lw-kpi--' + k.k + '">' +
              '<span class="lw-num" data-k="' + k.k + '">' + st[k.k] + '</span>' +
              '<span class="lw-label"><span class="lw-label-t" data-k="' + k.k + '">' + esc(lbl(st[k.k], k.one, k.many)) + '</span> <span class="lw-delta" data-k="' + k.k + '" hidden></span></span>' +
            '</div>';
          }).join('') + '</div>' +
          '<aside class="lw-join">' +
            '<p class="lw-eyebrow">Toi aussi</p>' +
            '<h1 class="lw-title">Scanne et rejoins Campus Connect</h1>' +
            '<div class="lw-qr" id="lw-qr"' + (mini ? '' : ' data-action="live-qr" title="Agrandir le QR code (touche Q)"') + '><span class="lw-qr-wait" aria-hidden="true"></span></div>' +
            '<p class="lw-url">' + esc(shortUrl) + '</p>' +
            '<p class="lw-how">' + esc(nb("Vise le code avec l'appareil photo de ton téléphone. Deux minutes, c'est fait.")) + '</p>' +
          '</aside>' +
          '<div class="lw-stage" id="lw-stage">' +
            /* mode live, début de démo (Ewan seul) : invitation sous le réseau */
            (liveOn() ? '<p class="lw-scan" id="lw-scan"' + (st.members > SCAN_MAX ? ' hidden' : '') + '><span class="lw-scan-arrow" aria-hidden="true">' + icon('back') + '</span><span>' + esc(nb((T.emptyLive || {}).wallScan || 'Scanne pour apparaître ici')) + '</span></p>' : '') +
            '<div class="lw-banner" id="lw-banner" aria-live="polite"></div>' +
          '</div>' +
          '<aside class="lw-side">' +
            '<section class="lw-panel lw-panel--feed"><h2 class="lw-h"><span class="lw-h-dot" aria-hidden="true"></span>' + esc(nb("À l'instant")) + '</h2><ol class="lw-feed" id="lw-feed"></ol></section>' +
            '<section class="lw-panel lw-panel--top"><h2 class="lw-h">Top des activités<span class="lw-h-n" id="lw-upc">' + esc(wallUpcTxt(S.upcoming().length)) + '</span></h2><ol class="lw-top" id="lw-top"></ol></section>' +
          '</aside>' +
          /* mode live, une seule personne (Ewan, en attendant les premiers scans) : des ondes partent d'elle */
          (liveOn() ? '<div class="lw-halo" id="lw-halo" aria-hidden="true" hidden><i></i><i></i><i></i></div>' : '') +
          '<canvas class="lw-graph" id="lw-graph" aria-hidden="true"></canvas>' +
          (mini ? '' :
          /* QR géant (touche Q, clic sur le QR, ou bouton) : pour le moment « sortez vos téléphones » */
          '<div class="lw-qrbig" id="lw-qrbig" data-action="live-qr" hidden>' +
            '<div class="lw-qrbig-card">' +
              '<div class="lw-qrbig-code" id="lw-qrbig-code"></div>' +
              '<div class="lw-qrbig-txt">' +
                '<p class="lw-eyebrow">Toi aussi</p>' +
                '<p class="lw-qrbig-title">Scanne et rejoins Campus Connect</p>' +
                '<p class="lw-qrbig-url">' + esc(shortUrl) + '</p>' +
                '<p class="lw-qrbig-n"><b data-k="members">' + st.members + '</b> <span class="lw-qrbig-l">' + lbl(st.members, 'inscrit', 'inscrits') + '</span></p>' +
              '</div>' +
            '</div>' +
            '<p class="lw-qrbig-hint">Q pour revenir au réseau</p>' +
          '</div>' +
          /* Outils discrets (cachés après 3 s sans bouger la souris). Pas de simulation ici : elle se règle
           * dans le panel organisateur. « Panel » (ou Échap) y ramène. */
          '<div class="lw-tools">' +
            '<button type="button" class="lw-btn" data-action="live-qr">' + icon('expand') + '<span>QR géant</span></button>' +
            (canFullscreen() ? '<button type="button" class="lw-btn" data-action="live-fs">' + icon('screen') + '<span>Plein écran</span></button>' : '') +
            '<button type="button" class="lw-btn" data-action="live-exit">' + icon('back') + '<span>Panel</span></button>' +
          '</div>') +
        '</section>';
  }

  /* Compteurs du mur (libellé au singulier pour 1). */
  var WALL_KP = [
    { k: 'members', one: 'inscrit', many: 'inscrits' },
    { k: 'participations', one: 'participation', many: 'participations' },
    { k: 'exchanges', one: 'échange de talents possible', many: 'échanges de talents possibles' },
    { k: 'passions', one: 'passion déclarée', many: 'passions déclarées' }
  ];

  /* ---------- Modèle du mur : le store + les personnes fictives de la simulation ---------- */

  function wallPerson(id) { return S.person(id) || (simOk() ? SIM.byId[id] : null) || null; }
  function wallPeople() {
    if (!wall) return S.people().slice();
    return wall.order.map(wallPerson).filter(Boolean);
  }
  function simJoins(actId) { return simOk() ? SIM.joins[actId] || [] : []; }
  /* Chiffres du mur, comme CC.store.stats. Mode live : le seed ne contient qu'Ewan (un vrai inscrit, il compte : le mur
   * démarre à « 1 inscrit ») et aucune activité. Mode local (V1) : la simulation compte comme de vraies arrivées. */
  function wallStats() {
    var people = wallPeople();
    var ex = 0;
    people.forEach(function (a) {
      var t = a.teach || [];
      if (!t.length) return;
      people.forEach(function (b) {
        if (a === b) return;
        var l = b.learn || [];
        for (var i = 0; i < t.length; i++) if (l.indexOf(t[i]) >= 0) { ex++; return; }
      });
    });
    var parts = 0, pas = 0;
    S.state.activities.forEach(function (a) { parts += simJoins(a.id).length + a.participants.length; });
    people.forEach(function (p) { pas += (p.passions || []).length; });
    return { members: people.length, participations: parts, exchanges: ex, passions: pas, upcoming: S.upcoming().length };
  }
  function upcomingTxt(n) { return plural(n, 'activité à venir', 'activités à venir'); }
  /* Mur, mode live sans activité : pas de « 0 activité à venir » au-dessus du top vide. */
  function wallUpcTxt(n) { return liveOn() && !n ? '' : upcomingTxt(n); }
  /* « Scanne pour apparaître ici » : affiché tant que le réseau compte peu de monde (mode live). */
  var SCAN_MAX = 3;
  function topActs() {
    return S.upcoming().map(function (a) { return { a: a, n: Math.min(a.max, a.participants.length + simJoins(a.id).length) }; })
      .sort(function (x, y) { return (y.n - x.n) || (S.time(x.a) - S.time(y.a)); })
      .slice(0, 3);
  }
  /* Mur projeté : un profil masqué n'y est jamais nommé (même le mien). */
  function wallHidden(p) { return !!p && p.visible === false; }
  function wallPub(p) { return wallHidden(p) ? anon(p) : p; }
  function wallName(p) { return wallHidden(p) ? "Quelqu'un" : p.firstName; }
  /* Liens doux de départ : chacun relié à ses 2 meilleures affinités. */
  function softLinks(people) {
    var out = [];
    people.forEach(function (p) {
      affinityLinks(p, people, 2).forEach(function (id) { out.push([p.id, id]); });
    });
    return out;
  }
  /* Réseau chargé (plus de 30 personnes) : on garde les prénoms des vrais inscrits et de l'équipe,
   * en plus grand que ceux des personnes de démo. Jamais de prénom pour un profil masqué. */
  var SEED_IDS = null;
  function isSeed(p) {
    if (!SEED_IDS) { SEED_IDS = Object.create(null); (D.people || []).forEach(function (x) { SEED_IDS[x.id] = true; }); }
    return !!SEED_IDS[p.id];
  }
  function wallLabel(p, n) {
    if (wallHidden(p) || !p.firstName) return false;
    if (n <= 30 || p.team) return true;
    return !isSeed(p);
  }
  function wallLabelScale(p) { return isSeed(p) && !p.team ? 1 : 1.3; }
  function wallScale() { return clamp(Math.min((window.innerHeight || 800) / 620, (window.innerWidth || 1280) / 1100), 0.7, 1.9); }

  /* opts.mini : miniature du panel organisateur (opts.k = son échelle) : pas d'outils, pas de curseur masqué,
   * pas de confettis, rendu plus léger. */
  function mountWall(root, opts) {
    opts = opts || {};
    var mini = !!opts.mini;
    var w = wall = {
      /* root = #view ou la miniature (conteneur de l'écran) ; el = la section .lw elle-même (classes is-idle, data-st) */
      root: root, el: $('#lw', root) || root, mini: mini, k: mini ? (+opts.k || 1) : 1, graph: null, order: [], shown: Object.create(null), q: [], busy: false, pumpT: 0, soonT: 0, bannerT: 0, tickT: 0, idleT: 0, lastEv: Date.now(),
      base: null, vals: null, quietUntil: Date.now() + 700, landT: Object.create(null), landing: Object.create(null), bq: [], bHold: 0, cursorT: 0
    };
    S.people().forEach(function (p) { w.shown[p.id] = true; w.order.push(p.id); });
    /* simulation déjà lancée (depuis l'aperçu du panel, mode local) : ses personnes sont déjà là */
    if (simOk()) SIM.people.forEach(function (p) { if (!w.shown[p.id]) { w.shown[p.id] = true; w.order.push(p.id); } });
    if (live.status === 'connecting') w.quietUntil = Date.now() + 1500;
    var cv = $('#lw-graph', root);
    var people0 = wallPeople();
    var r = callFx('campusGraph', [cv, {
      people: people0.map(wallPub), connections: S.state.connections.concat(simOk() ? SIM.conns : []), categories: D.categories, meId: null, legend: false,
      theme: 'dark', scale: wallScale(), background: false, maxDpr: mini ? 1 : 1.5, waitVisible: false, clip: true,
      exchanges: softLinks(people0), onLand: wallLanded, labelFilter: wallLabel, labelScale: wallLabelScale,
      flyScale: true, maxSpots: 2
    }]);
    if (r.ok && r.value) { w.graph = r.value; fxHandles.push(r.value); }
    else if (cv) cv.style.display = 'none';
    fxHandles.push({ stop: stopWall });
    w.base = wallStats();
    w.vals = { members: w.base.members, participations: w.base.participations, exchanges: w.base.exchanges, passions: w.base.passions };
    layoutWall();
    window.addEventListener('resize', onWallResize);
    loadQR(function (ok) { if (wall === w) renderQR(ok); });
    feedPrefill();
    renderTop(false);
    wallStatus();
    w.tickT = setInterval(feedTimes, 15000);
    w.idleT = setInterval(wallIdle, 5000);
    if (liveOn()) { w.lonelyT = setInterval(wallLonely, 3400); w.haloT = setInterval(wallHalo, 450); }
    w.stT = setInterval(wallStatus, 3000);
    if (!mini) {
      /* souris immobile 3 s : curseur et boutons disparaissent (projection propre) */
      w.onPtr = function () {
        if (wall !== w) return;
        w.el.classList.remove('is-idle');
        clearTimeout(w.cursorT);
        w.cursorT = setTimeout(function () { if (wall === w) w.el.classList.add('is-idle'); }, 3000);
      };
      window.addEventListener('pointermove', w.onPtr, { passive: true });
      window.addEventListener('pointerdown', w.onPtr, { passive: true });
      w.onPtr();
    }
    /* rattrapage : tout ce qui est arrivé pendant l'affichage */
    later(wallReconcile, 900);
    /* simulation en cours (mode local) : elle reprend sur ce mur */
    if (SIM.on && simOk()) { clearTimeout(SIM.t); SIM.t = setTimeout(simStep, 1200); }
  }

  function stopWall() {
    var w = wall;
    if (!w) return;
    clearTimeout(w.pumpT); clearTimeout(w.soonT); clearTimeout(w.bannerT); clearTimeout(w.bHold); clearTimeout(SIM.t); clearTimeout(w.cursorT);
    clearInterval(w.tickT); clearInterval(w.idleT); clearInterval(w.stT); clearInterval(w.lonelyT); clearInterval(w.haloT);
    Object.keys(w.landT).forEach(function (k) { clearTimeout(w.landT[k]); });
    window.removeEventListener('resize', onWallResize);
    if (w.onPtr) {
      window.removeEventListener('pointermove', w.onPtr);
      window.removeEventListener('pointerdown', w.onPtr);
    }
    wall = null;
  }

  var wallRz = 0;
  function onWallResize() {
    if (wallRz) return;
    wallRz = requestAnimationFrame(function () { wallRz = 0; layoutWall(); });
  }
  /* Le réseau se cadre dans la zone libre du milieu (le canvas, lui, couvre tout l'écran :
   * les arrivées partent du QR code). */
  function layoutWall() {
    if (!wall || !wall.graph) return;
    var cv = $('#lw-graph', wall.root), stage = $('#lw-stage', wall.root);
    if (!cv || !stage) return;
    var c = cv.getBoundingClientRect(), s = stage.getBoundingClientRect();
    if (!c.width || !s.width) return;
    /* miniature du panel : les rectangles sont à l'échelle k, le canvas compte en px CSS du mur */
    var k = wall.k || 1;
    var join = $('.lw-join', wall.root);
    var gap = join ? Math.max(8, (s.left - join.getBoundingClientRect().right) / k / 2) : 16;
    /* en bas, la place du bandeau « Bienvenue … » (il déborde en partie sous la zone, dans la marge du bas) */
    var bn = $('#lw-banner', wall.root);
    var sh = s.height / k;
    var reserve = bn ? Math.max(0, stage.offsetHeight - bn.offsetTop) + 10 : Math.min(sh * 0.1, (window.innerHeight || 0) * 0.055);
    /* pastille « Scanne pour apparaître ici » (mode live, peu d'inscrits) : aucun nœud ni prénom dessous.
     * offsetTop : mesure de mise en page, sans l'échelle de la miniature ni l'animation d'entrée. */
    var scan = $('#lw-scan', wall.root);
    if (scan && !scan.hidden && scan.offsetParent === stage) reserve = Math.max(reserve, stage.offsetHeight - scan.offsetTop + 10);
    reserve = Math.min(reserve, sh * 0.3);
    wall.graph.setInset({ left: (s.left - c.left) / k, top: (s.top - c.top) / k, right: (c.right - s.right) / k, bottom: (c.bottom - s.bottom) / k + reserve, pad: gap });
  }
  function qrPoint() {
    if (!wall) return null;
    var cv = $('#lw-graph', wall.root), qr = $('#lw-qr', wall.root);
    if (!cv || !qr) return null;
    var c = cv.getBoundingClientRect(), q = qr.getBoundingClientRect();
    if (!q.width) return null;
    var k = wall.k || 1;
    /* la personne sort à droite du QR code, assez loin pour que la comète (grossie en vol) ne le couvre jamais */
    return { x: (q.right - c.left) / k + 18 + 24 * wallScale(), y: (q.top + q.height / 2 - c.top) / k };
  }

  function wallStatus() {
    if (!wall) return;
    var st = live.status;
    wall.el.setAttribute('data-st', st);
    paintPills();
  }

  /* ---------- Entrée des événements ---------- */

  function wallOn(ev, d) {
    if (!wall) return;
    if (ev === 'person:new') { if (d.person) wallEnqueue({ k: 'arrive', p: d.person }); }
    else if (ev === 'join') wallEnqueue({ k: 'join', a: d.activityId, p: d.personId });
    else if (ev === 'leave') wallEnqueue({ k: 'leave', a: d.activityId, p: d.personId });
    else if (ev === 'activity:new') { if (d.activity) wallEnqueue({ k: 'activity', act: d.activity }); }
    else if (ev === 'connection:new') wallEnqueue({ k: 'conn', a: d.a, b: d.b });
    else if (ev === 'change') wallSoon();
  }
  function wallEnqueue(ev) {
    if (!wall) return;
    if (ev.k === 'arrive') {
      if (wall.shown[ev.p.id] || wall.q.some(function (x) { return x.k === 'arrive' && x.p.id === ev.p.id; })) return;
    }
    wall.q.push(ev);
    pump();
  }
  function wallSoon() {
    if (!wall) return;
    clearTimeout(wall.soonT);
    wall.soonT = setTimeout(wallReconcile, 700);
  }
  /* Rattrapage (relecture groupée, événement manqué) : personnes absentes → file ; le reste à jour. */
  function wallReconcile() {
    if (!wall) return;
    S.people().forEach(function (p) { if (!wall.shown[p.id]) wallEnqueue({ k: 'arrive', p: p }); });
    if (wall.graph) S.state.connections.forEach(function (c) { if (wall.shown[c[0]] && wall.shown[c[1]]) wall.graph.link(c[0], c[1], { quiet: true }); });
    if (!wall.q.length) { updateKpis(); renderTop(true); }
  }

  function pump() {
    var w = wall;
    if (!w || w.busy || !w.q.length) return;
    var ev = w.q.shift();
    var gap = 0;
    w.busy = true;
    try { gap = wallProcess(ev); } catch (e) { if (window.console) console.warn('[Campus Connect · mur]', e); gap = 0; }
    var backlog = w.q.length;
    if (backlog > 6) gap = Math.min(gap, 420);
    else if (backlog > 2) gap = Math.min(gap, 800);
    w.pumpT = setTimeout(function () { if (wall !== w) return; w.busy = false; pump(); }, gap);
  }

  function wallProcess(ev) {
    var w = wall;
    w.lastEv = Date.now();
    var quiet = Date.now() < w.quietUntil || live.status === 'connecting';
    if (ev.k === 'arrive') return wallArrive(ev.p, quiet);
    if (ev.k === 'join' || ev.k === 'leave') {
      var a = S.activity(ev.a), p = wallPerson(ev.p);
      renderTop(true, ev.k === 'join' ? ev.a : null);
      updateKpis();
      if (ev.k === 'leave' || quiet || !a || !p) return 0;
      if (w.graph) { w.graph.pulse(p.id); w.graph.spot(p.id, wallName(p), '→ ' + a.emoji + ' ' + shortTitle(a.title), 3600); }
      feedAdd(wallPub(p), '<b>' + esc(wallName(p)) + '</b> participe à', a.emoji + ' ' + a.title);
      return 1000;
    }
    if (ev.k === 'activity') {
      var act = S.activity(ev.act.id) || ev.act, org = wallPerson(act.organizerId);
      renderTop(true);
      updateKpis();
      if (quiet) return 0;
      if (org) {
        if (w.graph) { w.graph.pulse(org.id); w.graph.spot(org.id, wallName(org), '✨ ' + act.emoji + ' ' + shortTitle(act.title), 4200); }
        feedAdd(wallPub(org), '<b>' + esc(wallName(org)) + '</b> lance une activité', act.emoji + ' ' + act.title, 'is-act');
      }
      return 1200;
    }
    if (ev.k === 'conn') {
      var pa = wallPerson(ev.a), pb = wallPerson(ev.b);
      if (!pa || !pb) return 0;
      if (w.graph) w.graph.link(pa.id, pb.id, { quiet: quiet });
      if (quiet) return 0;
      feedAdd(wallPub(pa), '<b>' + esc(wallName(pa)) + '</b> et <b>' + esc(wallName(pb)) + '</b>', '🔗 sont en contact', 'is-conn');
      return 900;
    }
    return 0;
  }
  /* Rien ne se passe : le réseau met quelqu'un en lumière avec ce qu'il transmet (le concept, en direct). */
  function wallIdle() {
    var w = wall;
    if (!w || !w.graph || REDUCED || w.q.length || Date.now() - w.lastEv < 7000 || document.hidden) return;
    var pool = wallPeople().filter(function (p) { return (p.teach || []).length && !wallHidden(p); });
    if (!pool.length) return;
    var p = pick(pool);
    if (p.id === w.lastSpot && pool.length > 1) p = pick(pool);
    w.lastSpot = p.id;
    var pa = S.passion(pick(p.teach));
    if (!pa) return;
    w.graph.pulse(p.id);
    w.graph.spot(p.id, p.firstName, pa.emoji + ' transmet ' + (pa.withArticle || pa.label), 4200);
  }
  /* Mode live, début de démo : avec une ou deux personnes, le réseau ne reste pas figé. Chacune pulse doucement,
   * à tour de rôle (Ewan au centre en attendant les premiers scans). */
  function wallLonely() {
    var w = wall;
    if (!w || !w.graph || REDUCED || w.q.length || document.hidden) return;
    var pool = wallPeople().filter(function (p) { return !wallHidden(p); });
    if (!pool.length || pool.length > 2) return;
    w.lonelyI = ((w.lonelyI || 0) + 1) % pool.length;
    w.graph.pulse(pool[w.lonelyI].id);
  }
  /* Ondes autour de la personne seule sur le mur : elles suivent son point (le réseau respire), et s'effacent
   * dès la deuxième arrivée. Coordonnées du canvas = px CSS du mur (le canvas couvre tout le mur). */
  function wallHalo() {
    var w = wall;
    var el = w && $('#lw-halo', w.root);
    if (!el) return;
    var pool = wallPeople();
    var pos = null;
    if (pool.length === 1 && w.graph && typeof w.graph.where === 'function') { try { pos = w.graph.where(pool[0].id); } catch (e) { pos = null; } }
    if (!pos || !isFinite(pos.x) || !isFinite(pos.y) || (!pos.x && !pos.y)) { el.hidden = true; return; }
    el.style.transform = 'translate(' + pos.x.toFixed(1) + 'px, ' + pos.y.toFixed(1) + 'px)';
    if (el.hidden) { el.hidden = false; }
  }
  function shortTitle(t) { t = String(t || ''); return t.length > 28 ? t.slice(0, 27).replace(/\s+\S*$/, '') + '…' : t; }

  function wallArrive(p, quiet) {
    var w = wall;
    if (w.shown[p.id]) return 0;
    var pool = wallPeople();
    w.shown[p.id] = true;
    w.order.push(p.id);
    var links = affinityLinks(p, pool, 3);
    var fast = w.q.length > 3;
    var nm = wallName(p);
    if (w.graph) {
      if (quiet) w.graph.add(wallPub(p), { fly: false, label: false, links: links });
      else w.graph.add(wallPub(p), { from: qrPoint(), links: links, dur: fast ? 1000 : 1500, title: nm, sub: emojisOf(p, 4), spotMs: w.q.length > 2 ? 2500 : 4200 });
    }
    if (quiet) { updateKpis(); return 0; }
    /* compteurs et bandeau quand la personne atterrit (filet : un peu après, au cas où) */
    w.landing[p.id] = { p: p, links: links };
    w.landT[p.id] = setTimeout(function () { delete w.landT[p.id]; if (wall === w) landed(p.id); }, w.graph ? (fast ? 1100 : 1600) : 0);
    feedAdd(wallPub(p), '<b>' + esc(nm) + '</b> nous rejoint', emojisOf(p, 4) || (wallHidden(p) ? '' : subtitle(p)), 'is-arrive');
    return fast ? 700 : 1700;
  }
  function wallLanded(info) {
    var w = wall;
    if (!w) return;
    if (w.landT[info.id]) { clearTimeout(w.landT[info.id]); delete w.landT[info.id]; }
    landed(info.id);
  }
  function landed(id) {
    var w = wall;
    updateKpis();
    var it = w.landing[id];
    if (!it) return;
    delete w.landing[id];
    bannerPush(it.p, it.links);
  }
  /* Tous les 10 inscrits : pluie de confettis, lancée du bas du réseau (elle ne retombe pas sur le QR). */
  function milestone(n) {
    var w = wall;
    if (!w || REDUCED || w.mini) return;
    var st = $('#lw-stage', w.root);
    var r = st ? st.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    callFx('confetti', [r.left + r.width / 2, r.top + r.height * 0.8, { count: 150, rain: false }]);
    var tile = $('.lw-kpi--members', w.root);
    if (tile) { tile.classList.remove('is-milestone'); void tile.offsetWidth; tile.classList.add('is-milestone'); }
  }

  /* ---------- Affichage ---------- */

  function updateKpis() {
    var w = wall;
    if (!w) return;
    var st = wallStats();
    var up = $('#lw-upc', w.root);
    if (up) up.textContent = wallUpcTxt(st.upcoming);
    var scan = $('#lw-scan', w.root);
    if (scan && scan.hidden !== (st.members > SCAN_MAX)) {
      scan.hidden = st.members > SCAN_MAX;
      /* la pastille apparaît ou disparaît : le réseau reprend (ou libère) la place du bas */
      layoutWall();
    }
    var big = $('.lw-qrbig-n b', w.root);
    if (big && big.textContent !== String(st.members)) { big.textContent = String(st.members); pop(big); }
    var bigL = $('.lw-qrbig-l', w.root);
    if (bigL) bigL.textContent = lbl(st.members, 'inscrit', 'inscrits');
    WALL_KP.forEach(function (k) {
      var t = $('.lw-label-t[data-k="' + k.k + '"]', w.root);
      if (t) t.textContent = lbl(st[k.k], k.one, k.many);
    });
    ['members', 'participations', 'exchanges', 'passions'].forEach(function (k) {
      var el = $('.lw-num[data-k="' + k + '"]', w.root);
      if (!el) return;
      var from = w.vals[k], to = st[k];
      if (from !== to) {
        w.vals[k] = to;
        if (k === 'members' && to > from && Math.floor(to / 10) > Math.floor(from / 10)) later(function () { milestone(to); }, 450);
        countUp(el, from, to, 900);
        var tile = el.parentNode;
        if (tile && !REDUCED) { tile.classList.remove('is-bump'); void tile.offsetWidth; tile.classList.add('is-bump'); }
      }
      var de = $('.lw-delta[data-k="' + k + '"]', w.root);
      if (de) {
        var d = to - w.base[k];
        if (d > 0) { var txt = '+' + d; if (de.textContent !== txt) { de.textContent = txt; de.hidden = false; pop(de); } }
        else de.hidden = true;
      }
    });
  }

  function relTime(t) {
    var s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return "à l'instant";
    var m = Math.round(s / 60);
    return m < 60 ? 'il y a ' + m + ' min' : 'il y a ' + Math.round(m / 60) + ' h';
  }
  function feedTimes() {
    if (!wall) return;
    $$('#lw-feed time[data-at]', wall.root).forEach(function (el) { el.textContent = relTime(+el.getAttribute('data-at')); });
  }
  function feedItemHTML(p, main, sub, at) {
    return avatar(p, 52) +
      '<div class="lw-item-txt"><p class="lw-item-main">' + main + '</p>' +
        '<p class="lw-item-sub"><span class="lw-item-what">' + esc(sub || '') + '</span>' +
          (at ? '<time class="lw-time" data-at="' + at + '">' + esc(relTime(at)) + '</time>' : '') + '</p>' +
      '</div>';
  }
  function feedPrefill() {
    var ol = $('#lw-feed', wall.root);
    if (!ol) return;
    var seed = {};
    (D.people || []).forEach(function (p) { seed[p.id] = true; });
    var recent = S.people().filter(function (p) { return !seed[p.id]; }).slice(-4).reverse();
    if (!recent.length) {
      ol.innerHTML = '<li class="lw-empty">' + esc(nb('Les arrivées s\'affichent ici en direct. Scanne le QR code : ton prénom sera le prochain.')) + '</li>';
      return;
    }
    ol.innerHTML = recent.map(function (p) {
      return '<li class="lw-item">' + feedItemHTML(wallPub(p), '<b>' + esc(wallName(p)) + '</b> nous a rejoints', emojisOf(p, 4) || (wallHidden(p) ? '' : subtitle(p)), 0) + '</li>';
    }).join('');
  }
  function feedAdd(p, mainHTML, sub, cls) {
    var ol = wall && $('#lw-feed', wall.root);
    if (!ol) return;
    var empty = $('.lw-empty', ol);
    if (empty) ol.removeChild(empty);
    var li = document.createElement('li');
    li.className = 'lw-item' + (cls ? ' ' + cls : '');
    li.innerHTML = feedItemHTML(p, mainHTML, sub, Date.now());
    ol.insertBefore(li, ol.firstChild);
    while (ol.children.length > 7) ol.removeChild(ol.lastChild);
    if (REDUCED || !li.animate) return;
    try {
      var h = li.offsetHeight;
      li.animate([
        { height: '0px', opacity: 0, transform: 'translateX(-40px) scale(.9)', marginBottom: '0px' },
        { height: h + 'px', opacity: 1, transform: 'none', offset: 0.6 },
        { height: h + 'px', opacity: 1, transform: 'none' }
      ], { duration: 750, easing: 'cubic-bezier(.2,.9,.3,1.15)' });
      li.animate([{ backgroundColor: 'rgba(255, 255, 255, .26)' }, { backgroundColor: 'rgba(255, 255, 255, .07)' }], { duration: 2600, easing: 'ease-out' });
    } catch (e) { /* rien */ }
  }

  function renderTop(animate, hot) {
    var ol = wall && $('#lw-top', wall.root);
    if (!ol) return;
    var list = topActs();
    var first = {}, existing = {};
    $$('li[data-key]', ol).forEach(function (li) {
      var k = li.getAttribute('data-key');
      first[k] = li.getBoundingClientRect().top;
      existing[k] = li;
    });
    var empty = $('.lw-empty', ol);
    if (empty) ol.removeChild(empty);
    var items = list.map(function (x, i) {
      var a = x.a, pct = Math.min(100, Math.round(x.n / a.max * 100));
      var li = existing[a.id];
      if (li) {
        delete existing[a.id];
        var b = $('.lw-act-n', li);
        var old = b ? parseInt(b.getAttribute('data-n'), 10) : x.n;
        if (b && old !== x.n) { b.setAttribute('data-n', x.n); rollNumber(b, old, x.n, 520); }
        var g = $('.lw-gauge i', li);
        if (g) g.style.width = pct + '%';
        li.classList.toggle('is-full', x.n >= a.max);
      } else {
        li = document.createElement('li');
        li.className = 'lw-act' + (x.n >= a.max ? ' is-full' : '');
        li.setAttribute('data-key', a.id);
        li.style.setProperty('--cat', catOf(a.cat).color);
        li.innerHTML = '<span class="lw-rank"></span>' +
          '<span class="lw-act-emoji' + emojiCls(a.emoji) + '" aria-hidden="true">' + esc(a.emoji) + '</span>' +
          '<span class="lw-act-txt"><span class="lw-act-title">' + esc(a.title) + '</span>' +
            '<span class="lw-gauge"><i style="width:' + (animate ? 0 : pct) + '%"></i></span></span>' +
          '<span class="lw-act-count"><b class="lw-act-n" data-n="' + x.n + '">' + x.n + '</b>/' + a.max + '</span>';
        li.__new = pct;
      }
      $('.lw-rank', li).textContent = String(i + 1);
      return li;
    });
    Object.keys(existing).forEach(function (k) { var o = existing[k]; if (o.parentNode) o.parentNode.removeChild(o); });
    items.forEach(function (li) { ol.appendChild(li); });
    if (!items.length) {
      var E = T.emptyLive || {};
      ol.innerHTML = liveOn()
        ? '<li class="lw-empty lw-empty--top"><span class="lw-empty-ic" aria-hidden="true">✨</span><span class="lw-empty-txt"><strong>' + esc(nb(E.wallTop || '')) + '</strong><span>' + esc(nb(E.wallTopSub || '')) + '</span></span></li>'
        : '<li class="lw-empty">' + esc(nb("Pas encore d'activité avec des participants.")) + '</li>';
    }
    items.forEach(function (li) {
      var k = li.getAttribute('data-key');
      if (li.__new !== undefined) {
        var pct = li.__new;
        delete li.__new;
        var gi = $('.lw-gauge i', li);
        if (animate && gi) requestAnimationFrame(function () { requestAnimationFrame(function () { gi.style.width = pct + '%'; }); });
      }
      if (!animate || REDUCED || !li.animate) return;
      try {
        var f = first[k], top = li.getBoundingClientRect().top;
        if (f !== undefined && Math.abs(f - top) > 1) {
          li.animate([{ transform: 'translateY(' + (f - top) + 'px)' }, { transform: 'none' }], { duration: 700, easing: 'cubic-bezier(.2,.85,.25,1.08)' });
        } else if (f === undefined) {
          li.animate([{ opacity: 0, transform: 'translateX(30px)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: 'ease-out' });
        }
        if (hot && k === hot) li.animate([{ backgroundColor: 'rgba(255, 255, 255, .3)' }, { backgroundColor: 'rgba(255, 255, 255, 0)' }], { duration: 1800, easing: 'ease-out' });
      } catch (e) { /* rien */ }
    });
  }

  /* Bandeau « Bienvenue … » : affiché quand la personne atterrit. Il reste jusqu'à l'arrivée suivante
   * (4 s au moins quand c'est calme, 2,6 s en rafale ; les arrivées groupées partagent un bandeau),
   * et s'efface après 20 s sans nouvelle arrivée. */
  function bannerPush(p, links) {
    var w = wall;
    if (!w) return;
    w.bq.push({ p: p, links: links });
    if (!w.bHold) flushBanner();
  }
  function flushBanner() {
    var w = wall;
    if (!w) return;
    var list = w.bq;
    w.bq = [];
    if (!list.length) { w.bHold = 0; return; }
    banner(list);
    w.bHold = setTimeout(function () { if (wall !== w) return; w.bHold = 0; flushBanner(); }, w.q.length ? 2600 : 4000);
  }
  /* La meilleure raison réelle, à la 3e personne (« Chris peut lui apprendre le piano »). */
  function bannerReason(p, links) {
    var out = '';
    (links || []).some(function (id) {
      var o = wallPerson(id);
      if (!o || wallHidden(o)) return false;
      var a = null;
      try { a = S.affinityWith(p, o); } catch (e) { a = null; }
      if (!a) return false;
      if (a.teachesMe.length) out = o.firstName + ' peut lui apprendre ' + S.articleList(a.teachesMe.slice(0, 1));
      else if (a.iTeach.length) out = wallName(p) + ' peut apprendre ' + S.articleList(a.iTeach.slice(0, 1)) + ' à ' + o.firstName;
      else if (a.common.length) out = plural(a.common.length, 'passion', 'passions') + ' en commun avec ' + o.firstName;
      return !!out;
    });
    return out;
  }
  function banner(list) {
    var w = wall;
    var el = w && $('#lw-banner', w.root);
    if (!el) return;
    var ppl = list.map(function (it) { return it.p; });
    var named = ppl.filter(function (p) { return !wallHidden(p); }).map(function (p) { return p.firstName; });
    var title, sub;
    if (ppl.length === 1) {
      var p = ppl[0];
      title = wallHidden(p) ? 'Bienvenue sur le campus !' : 'Bienvenue ' + p.firstName + ' !';
      sub = [emojisOf(p, 4), bannerReason(p, list[0].links)].filter(Boolean).join(' · ');
    } else {
      if (named.length === ppl.length && ppl.length <= 3) title = 'Bienvenue ' + names(named) + ' !';
      else if (named.length) {
        var shownN = named.slice(0, 2);
        title = 'Bienvenue ' + shownN.join(', ') + ' et ' + plural(ppl.length - shownN.length, 'autre', 'autres') + ' !';
      } else title = 'Bienvenue aux ' + ppl.length + ' nouveaux !';
      var ems = [];
      ppl.forEach(function (x) { (x.passions || []).forEach(function (y) { var pa = S.passion(y.id); if (pa && ems.indexOf(pa.emoji) < 0) ems.push(pa.emoji); }); });
      sub = plural(ppl.length, 'nouvelle arrivée', 'nouvelles arrivées') + (ems.length ? ' · ' + ems.slice(0, 6).join(' ') : '');
    }
    var avs = ppl.slice(-3).map(function (x) { return avatar(wallPub(x), 64); }).join('');
    el.innerHTML = '<span class="lw-banner-avs' + (ppl.length > 1 ? ' is-many' : '') + '">' + avs + '</span>' +
      '<div class="lw-banner-txt"><strong>' + esc(nb(title)) + '</strong>' + (sub ? '<span>' + esc(nb(sub)) + '</span>' : '') + '</div>';
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
    clearTimeout(w.bannerT);
    w.bannerT = setTimeout(function () { el.classList.remove('is-on'); }, 20000);
  }

  /* ---------- QR géant (touche Q, clic sur le QR, bouton « QR géant ») ---------- */

  function bigQR(open) {
    var w = wall;
    var el = w && $('#lw-qrbig', w.root);
    if (!el) return;
    if (open === undefined) open = el.hidden;
    if (open) {
      var box = $('#lw-qrbig-code', el);
      if (box && !box.firstChild) {
        loadQR(function (ok) {
          if (wall !== w) return;
          var html = '';
          if (ok) { try { html = qrSVG(publicUrl()); } catch (e) { html = ''; } }
          box.innerHTML = html || '<p class="lw-qr-fb"><b>' + esc(publicUrl().replace(/^https?:\/\//, '').replace(/\/+$/, '')) + '</b></p>';
        });
      }
      el.hidden = false;
      void el.offsetWidth;
      el.classList.add('is-on');
    } else {
      el.classList.remove('is-on');
      el.hidden = true;
    }
  }

  /* ---------- QR code (encodeur local, chargé à la demande) ---------- */

  var qr = { state: 0, waiting: [] };
  function loadQR(cb) {
    if (typeof window.qrcode === 'function') { cb(true); return; }
    qr.waiting.push(cb);
    if (qr.state === 1) return;
    qr.state = 1;
    var done = function (ok) {
      qr.state = ok ? 2 : 0;
      var w = qr.waiting;
      qr.waiting = [];
      w.forEach(function (f) { try { f(ok); } catch (e) { /* rien */ } });
    };
    try {
      var s = document.createElement('script');
      s.src = SCRIPT_DIR + 'vendor/qrcode.js';
      s.async = true;
      s.onload = function () { done(typeof window.qrcode === 'function'); };
      s.onerror = function () { done(false); };
      (document.head || document.documentElement).appendChild(s);
    } catch (e) { done(false); }
  }
  function qrSVG(text) {
    var q = window.qrcode(0, 'M');
    q.addData(text);
    q.make();
    var n = q.getModuleCount(), m = 4, size = n + m * 2, d = '';
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (!q.isDark(r, c)) continue;
        var run = 1;
        while (c + run < n && q.isDark(r, c + run)) run++;
        d += 'M' + (c + m) + ' ' + (r + m) + 'h' + run + 'v1h-' + run + 'z';
        c += run - 1;
      }
    }
    return '<svg class="lw-qr-svg" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges" role="img" aria-label="' + esc('QR code vers ' + text) + '">' +
      '<rect width="' + size + '" height="' + size + '" fill="#FFFFFF"/><path fill="#1A1730" d="' + d + '"/></svg>';
  }
  function renderQR(ok) {
    var box = wall && $('#lw-qr', wall.root);
    if (!box) return;
    var url = publicUrl();
    var html = '';
    if (ok) { try { html = qrSVG(url); } catch (e) { html = ''; } }
    if (!html) {
      box.classList.add('is-fallback');
      box.innerHTML = '<p class="lw-qr-fb">' + esc(nb('Ouvre sur ton téléphone :')) + '<b>' + esc(url.replace(/^https?:\/\//, '').replace(/\/+$/, '')) + '</b></p>';
      return;
    }
    box.innerHTML = html;
    box.classList.add('is-ready');
  }

  /* ---------- Simulation (répétition) : des arrivées fictives, réglée depuis le panel organisateur ---------- */

  function rnd(n) { return Math.floor(Math.random() * n); }
  function pick(list) { return list[rnd(list.length)]; }
  /* on = true : lance (ou reprend) la simulation sur le mur affiché. on = false : l'arrête ET retire ses
   * personnes fictives (le mur ne montre plus que les vrais inscrits). */
  function setSim(on) {
    on = !!on && simOk();
    if (!simOk() && SIM.on) { clearTimeout(SIM.t); SIM = freshSim(); return; }
    if (on === SIM.on) return;
    if (on) {
      SIM.on = true;
      if (wall) { wall.quietUntil = 0; clearTimeout(SIM.t); simStep(true); }
    } else {
      clearTimeout(SIM.t);
      SIM = freshSim();
    }
  }
  function simStep(first) {
    var w = wall;
    if (!simOk()) { clearTimeout(SIM.t); SIM = freshSim(); return; }
    if (!w || !SIM.on) return;
    var r = Math.random();
    if (first || r < 0.62 || SIM.people.length < 2) simArrive();
    else if (r < 0.9) simJoin();
    else simConnect();
    clearTimeout(SIM.t);
    SIM.t = setTimeout(simStep, 1700 + Math.random() * 1700);
  }
  function simArrive() {
    var s = SIM;
    var i = s.n++;
    var name = SIM_NAMES[i % SIM_NAMES.length] + (i >= SIM_NAMES.length ? ' ' + 'ABCDEFGH'.charAt((i / SIM_NAMES.length | 0) - 1) + '.' : '');
    /* passions : 2 à 4, souvent dans les catégories déjà présentes ; elles transmettent 1 ou 2 choses
     * et veulent apprendre ce que d'autres transmettent (ça crée des affinités visibles) */
    var all = D.passions.map(function (p) { return p.id; });
    var mine = [];
    var want = 2 + rnd(3);
    while (mine.length < want) { var id = pick(all); if (mine.indexOf(id) < 0) mine.push(id); }
    var teachable = [];
    wallPeople().forEach(function (p) { (p.teach || []).forEach(function (t) { if (teachable.indexOf(t) < 0 && mine.indexOf(t) < 0) teachable.push(t); }); });
    var learn = [];
    var nl = 1 + rnd(2);
    while (learn.length < nl) {
      var l = (teachable.length && Math.random() < 0.75) ? pick(teachable) : pick(all);
      if (mine.indexOf(l) < 0 && learn.indexOf(l) < 0) learn.push(l);
    }
    var p = {
      id: 'sim-' + i + '-' + Math.random().toString(36).slice(2, 6), firstName: name, lastName: '',
      role: Math.random() < 0.08 ? 'prof' : 'etudiant', program: pick(D.programs),
      passions: mine.map(function (x) { return { id: x, level: 1 + rnd(3) }; }),
      teach: mine.slice(0, 1 + rnd(2)), learn: learn, bio: '', team: false, photo: null, visible: true
    };
    s.people.push(p);
    s.byId[p.id] = p;
    wallEnqueue({ k: 'arrive', p: p });
  }
  function simJoin() {
    var w = wall, s = SIM;
    var who = Math.random() < 0.7 && s.people.length ? pick(s.people) : wallPerson(pick(w.order));
    if (!who) return;
    var open = S.upcoming().filter(function (a) {
      var j = simJoins(a.id);
      return a.participants.length + j.length < a.max && a.participants.indexOf(who.id) < 0 && j.indexOf(who.id) < 0;
    });
    if (!open.length) { simArrive(); return; }
    /* les activités déjà populaires attirent un peu plus : le top bouge */
    open.sort(function (x, y) { return (y.participants.length + simJoins(y.id).length) - (x.participants.length + simJoins(x.id).length); });
    var a = Math.random() < 0.55 ? open[rnd(Math.min(3, open.length))] : pick(open);
    (s.joins[a.id] = s.joins[a.id] || []).push(who.id);
    wallEnqueue({ k: 'join', a: a.id, p: who.id });
  }
  function simConnect() {
    var s = SIM;
    if (!s.people.length) { simArrive(); return; }
    var a = pick(s.people);
    var links = affinityLinks(a, wallPeople(), 3);
    var b = links.length ? pick(links) : pick(wall.order);
    if (!b || b === a.id) return;
    s.conns.push([a.id, b]);
    wallEnqueue({ k: 'conn', a: a.id, b: b });
  }

  function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function enterFullscreen() {
    var el = document.documentElement;
    try {
      var fn = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!fn || isFullscreen()) return;
      var r = fn.call(el);
      if (r && r.catch) r.catch(function () { /* refusé : le mur reste en fenêtre, Échap ramène au panel */ });
    } catch (e) { /* rien */ }
  }
  /* manual : sortie voulue (bouton du mur, retour au panel) : on ne revient pas au panel une 2e fois. */
  var fsManual = false;
  function exitFullscreen() {
    var d = document;
    if (!isFullscreen()) return;
    fsManual = true;
    try {
      var r = (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      if (r && r.catch) r.catch(function () { fsManual = false; });
    } catch (e) { fsManual = false; }
  }
  function toggleFullscreen() {
    if (isFullscreen()) exitFullscreen();
    else enterFullscreen();
  }
  /* « Lancer la projection » (panel) : plein écran puis le mur. Sans API plein écran (ou refus), le mur
   * s'ouvre dans la fenêtre : Échap ou le bouton « Panel » y ramènent. */
  function launchProjection() {
    if (!isAdmin()) { go('#/admin'); return; }
    enterFullscreen();
    go('#/live', { noTransition: true });
  }
  function exitWall() {
    exitFullscreen();
    go(isAdmin() ? '#/admin' : (S.me() ? '#/home' : '#/welcome'), { noTransition: true });
  }
  /* Échap en plein écran : le navigateur sort du plein écran sans nous passer la touche. On ramène au panel. */
  function onFullscreenChange() {
    if (isFullscreen()) return;
    if (fsManual) { fsManual = false; return; }
    if (current.name === 'live' && isAdmin()) go('#/admin', { noTransition: true });
  }

  /* ================================================================
   * Vue : Panel organisateur (#/admin)
   * Sans le code : une saisie de code. Avec : l'aperçu du mur (la vraie vue #/live en miniature),
   * « Lancer la projection », le flux « qui fait quoi », les compteurs, l'état du direct et la simulation.
   * ================================================================ */

  /* Journal de la session : tout ce qui arrive depuis le chargement de la page, quel que soit l'écran
   * (le panel le relit en revenant de la projection). Le rattrapage du démarrage n'y entre pas : il est
   * résumé dans « Déjà inscrits ». La simulation n'y entre jamais (elle ne passe pas par le store). */
  var journal = [], journalSeq = 0;
  /* Gardé dans l'onglet (sessionStorage) : un rechargement de la page (autre onglet qui change de profil,
   * mode local) ne vide pas le flux du panel. Seulement sur l'appareil de l'organisateur. */
  var JOURNAL_KEY = 'cc_admin_journal', journalSaveT = 0;
  function journalLoad() {
    try {
      var raw = window.sessionStorage.getItem(JOURNAL_KEY);
      var arr = raw ? JSON.parse(raw) : null;
      if (!Array.isArray(arr)) return;
      journal = arr.filter(function (it) {
        return it && typeof it === 'object' && typeof it.k === 'string' && typeof it.id === 'number' && typeof it.at === 'number';
      }).slice(-300);
      journal.forEach(function (it) { if (it.id > journalSeq) journalSeq = it.id; });
    } catch (e) { journal = []; }
  }
  function journalSave() {
    if (journalSaveT) return;
    journalSaveT = setTimeout(function () {
      journalSaveT = 0;
      try { window.sessionStorage.setItem(JOURNAL_KEY, JSON.stringify(journal.slice(-150))); } catch (e) { /* stockage bloqué */ }
    }, 300);
  }
  function journalAdd(ev, d) {
    if (!isAdmin()) return;
    if (ev === 'change') { if (d.reset) { journal = []; journalSave(); } return; }
    if (d.remote && (live.status === 'connecting' || Date.now() - live.bootAt < 1500)) return;
    var it = null;
    if (ev === 'person:new' && d.person) it = { k: 'person', p: d.person.id };
    else if (ev === 'join' || ev === 'leave') it = { k: ev, a: d.activityId, p: d.personId, full: d.reason === 'full' };
    else if (ev === 'activity:new' && d.activity) it = { k: 'activity', a: d.activity.id, act: d.activity, p: d.activity.organizerId };
    else if (ev === 'connection:new') it = { k: 'conn', p: d.a, b: d.b };
    /* Chat d'activité : copie du message (le flux est gardé en sessionStorage). Une seule ligne par message. */
    else if (ev === 'message:new' && d.message) {
      var dm = d.message;
      if (journal.some(function (x) { return x.k === 'message' && x.m && x.m.id === dm.id; })) return;
      it = { k: 'message', m: { id: dm.id, activityId: dm.activityId, personId: dm.personId, body: String(dm.body || ''), hidden: !!dm.hidden }, p: dm.personId, a: dm.activityId };
    } else if (ev === 'message:hidden') {
      journal.forEach(function (x) { if (x.k === 'message' && x.m && x.m.id === d.id) x.m.hidden = true; });
      journalSave();
      return;
    }
    if (!it) return;
    it.at = Date.now();
    it.remote = !!d.remote;
    it.id = ++journalSeq;
    journal.push(it);
    if (journal.length > 300) journal.splice(0, journal.length - 300);
    journalSave();
  }

  var adm = null; // panel affiché : { root, vals, t, soonT, rz, onRz, wide }
  var admSel = 'all'; // filtre du flux, gardé d'un affichage du panel à l'autre
  var SEED_ACTS = null;
  function isSeedAct(a) {
    if (!SEED_ACTS) { SEED_ACTS = Object.create(null); (D.activities || []).forEach(function (x) { SEED_ACTS[x.id] = true; }); }
    return !!SEED_ACTS[a.id];
  }
  /* Compteurs du panel. Mode live : tout le monde est un vrai inscrit, Ewan compris (le panel démarre à « 1 inscrit »),
   * comme sur le mur et la page Impact. Mode local (V1) : les profils de data.js ne comptent pas. */
  function admStats() {
    var people = S.people(), real = Object.create(null), n = 0;
    var lv = liveOn();
    people.forEach(function (p) { if (lv || !isSeed(p)) { real[p.id] = true; n++; } });
    var parts = 0, acts = 0;
    S.state.activities.forEach(function (a) {
      if (lv || !isSeedAct(a)) acts++;
      a.participants.forEach(function (id) { if (real[id]) parts++; });
    });
    var conns = S.state.connections.filter(function (c) { return real[c[0]] || real[c[1]]; }).length;
    return { people: n, parts: parts, acts: acts, conns: conns, total: people.length, upcoming: S.upcoming().length };
  }
  var ADM_KPIS = [
    { k: 'people', ic: '🎉', one: 'inscrit', many: 'inscrits', sub: function (st) {
      if (!liveOn()) return st.total + ' sur le mur avec les profils de démo';
      return st.people <= 1 ? "pour l'instant, il n'y a que toi" : 'toi compris, en direct';
    } },
    { k: 'parts', ic: '🙌', one: 'participation', many: 'participations', sub: function () { return 'des inscrits aux activités'; } },
    { k: 'acts', ic: '✨', one: 'activité créée', many: 'activités créées', sub: function (st) {
      if (liveOn() && !st.upcoming) return "lance la première depuis l'app";
      return plural(st.upcoming, 'activité à venir', 'activités à venir') + ' en tout';
    } },
    { k: 'conns', ic: '👋', one: 'contact', many: 'contacts', sub: function () { return 'demandes de mise en relation'; } }
  ];
  var ADM_KIND = {
    person: { ic: '🎉', label: 'Inscription' }, join: { ic: '🙌', label: 'Participation' }, leave: { ic: '👋', label: 'Désistement' },
    activity: { ic: '✨', label: 'Activité' }, conn: { ic: '🔗', label: 'Contact' }, message: { ic: '💬', label: 'Message' }
  };
  /* Filtre « Messages » : seulement si le chat d'activité est là. */
  function admHasChat() { return typeof S.sendMessage === 'function' || journal.some(function (it) { return it.k === 'message'; }); }
  /* Messages arrivés sans événement (avant l'ouverture du panel, relecture groupée) : ajoutés au flux à leur heure,
   * pour pouvoir les masquer aussi. Les messages du seed n'y entrent jamais. */
  function admBackfill() {
    if (!chatOn() || !S.state || !Array.isArray(S.state.messages)) return;
    var known = Object.create(null);
    journal.forEach(function (it) { if (it.k === 'message' && it.m) known[it.m.id] = true; });
    var add = S.state.messages.filter(function (m) { return m && !m.seed && !known[m.id] && S.person(m.personId) && S.activity(m.activityId); });
    if (!add.length) return;
    add.forEach(function (m) {
      var t = Date.parse(m.at) || Date.now();
      var it = { k: 'message', m: { id: m.id, activityId: m.activityId, personId: m.personId, body: String(m.body || ''), hidden: !!m.hidden },
        p: m.personId, a: m.activityId, at: t, remote: true, id: ++journalSeq };
      var i = journal.length;
      while (i > 0 && journal[i - 1].at > t) i--;
      journal.splice(i, 0, it);
    });
    if (journal.length > 300) journal.splice(0, journal.length - 300);
    journalSave();
  }
  /* Aperçu du mur : écran d'ordinateur en largeur seulement (le mur est fait pour du 16:9 ou du 4:3). */
  var ADM_WIDE = '(min-width: 1100px) and (min-height: 640px)';
  function admMiniFits() { var w = window.innerWidth || 0, h = window.innerHeight || 0; return w >= 900 && w > h; }

  VIEWS.admin = function () {
    if (!isAdmin()) return admLockView();
    return { title: 'Panel organisateur', html: admHTML(), mount: mountAdmin };
  };

  function admLockView() {
    return {
      title: 'Espace organisateur',
      html:
        '<section class="adm-lock">' +
          '<div class="adm-lock-card">' +
            '<div class="adm-lock-logo">' + logoHTML() + '</div>' +
            '<span class="adm-lock-ic" aria-hidden="true">' + icon('lock') + '</span>' +
            '<h1 class="adm-lock-title">Espace organisateur</h1>' +
            '<p class="adm-lock-txt">' + esc(nb("Entre le code pour ouvrir le panel de la démo : l'aperçu du mur, la projection et tout ce qui se passe en direct.")) + '</p>' +
            '<form class="adm-lock-form" data-form="admin" novalidate autocomplete="off">' +
              '<label class="label" for="adm-code">Code organisateur</label>' +
              '<input class="input input-lg adm-code" id="adm-code" name="code" type="text" maxlength="40" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go">' +
              '<p class="field-error" data-err="admin" role="alert"></p>' +
              '<button type="submit" class="btn btn-primary btn-lg btn-block adm-lock-go"><span>Ouvrir le panel</span>' + icon('arrow') + '</button>' +
            '</form>' +
            '<a class="adm-lock-back" href="#/home">' + icon('back') + '<span>Retour à l\'app</span></a>' +
          '</div>' +
        '</section>',
      mount: function (root) {
        var i = $('#adm-code', root);
        if (i && CAN_HOVER) setTimeout(function () { try { i.focus({ preventScroll: true }); } catch (e) { /* rien */ } }, 60);
      }
    };
  }

  var adminTrying = false;
  function adminErr(msg) {
    var el = $('[data-err="admin"]', $view), inp = $('#adm-code', $view);
    if (el) { el.textContent = nb(msg); el.classList.remove('is-shown'); void el.offsetWidth; el.classList.add('is-shown'); }
    if (inp) {
      inp.setAttribute('aria-invalid', 'true');
      inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake');
      try { inp.focus({ preventScroll: true }); inp.select(); } catch (e) { /* rien */ }
    }
  }
  /* Le code tapé est comparé par son empreinte : minuscules, sans espaces autour (clavier iPhone). */
  function adminTry(form) {
    if (adminTrying) return;
    var inp = form.elements.code;
    var v = String((inp && inp.value) || '').trim().toLowerCase();
    if (!v) { adminErr('Entre le code organisateur.'); return; }
    adminTrying = true;
    var btn = $('.adm-lock-go', form);
    if (btn) btn.disabled = true;
    sha256Hex(v).then(function (h) {
      adminTrying = false;
      if (btn) btn.disabled = false;
      if (h === ADMIN_HASH) { setAdmin(true); go('#/admin', { force: true }); return; }
      adminErr("Ce n'est pas le bon code.");
    }, function () {
      adminTrying = false;
      if (btn) btn.disabled = false;
      adminErr("Impossible de vérifier le code. Recharge la page et réessaie.");
    });
  }

  function admHTML() {
    var st = admStats();
    var fits = admMiniFits();
    var owner = admOwnerHTML();
    var filters = [['all', 'Tout'], ['person', 'Inscriptions'], ['join', 'Participations'], ['activity', 'Activités'], ['conn', 'Contacts']];
    if (admHasChat()) filters.push(['message', 'Messages']);
    return '' +
      '<section class="adm" id="adm" data-st="' + esc(live.status) + '">' +
        '<header class="adm-head">' +
          '<div class="adm-brand"><span class="adm-logo" data-logo>' + logoHTML() + '</span>' +
            '<h1 class="adm-title">' + icon('lock') + '<span>Panel organisateur</span></h1></div>' +
          '<div class="adm-status">' +
            '<span class="live-pill adm-pill" data-live-pill="admin" data-st="' + esc(live.status) + '" title="' + esc(LIVE_TITLE[live.status]) + '"><i aria-hidden="true"></i><span class="lp-txt">' + esc(ADMIN_TXT[live.status]) + '</span></span>' +
            '<span class="adm-status-why">' + esc(nb(ADMIN_WHY[live.status] || '')) + '</span>' +
          '</div>' +
          '<div class="adm-head-end">' +
            '<a class="btn btn-ghost adm-hbtn" href="#/home">' + icon('home') + '<span>Voir l\'app</span></a>' +
            '<button type="button" class="btn btn-ghost adm-hbtn" data-action="admin-logout">' + icon('close') + '<span>Quitter le mode organisateur</span></button>' +
          '</div>' +
        '</header>' +
        '<div class="adm-grid' + (owner ? ' adm-grid--team' : '') + '">' +
          owner +
          '<section class="adm-card adm-wall" aria-labelledby="adm-wall-h">' +
            '<div class="adm-card-head">' +
              '<h2 class="adm-h" id="adm-wall-h">Aperçu du mur</h2>' +
              (simOk() ? '<span class="adm-sim-badge" id="adm-sim-badge" hidden>Simulation</span>' : '') +
              '<span class="adm-hint">Ce que la classe voit sur l\'écran projeté</span>' +
            '</div>' +
            '<div class="adm-mini" id="adm-mini">' + (fits
              ? '<div class="adm-mini-vp" id="adm-mini-vp">' + wallHTML(true) + '</div>'
              : '<p class="adm-mini-off">' + icon('screen') + '<span>' + esc(nb("L'aperçu du mur s'affiche sur un écran d'ordinateur, en largeur.")) + '</span></p>') +
            '</div>' +
            '<div class="adm-controls">' +
              '<button type="button" class="btn btn-grad btn-xl adm-launch" data-action="admin-launch">' + icon('screen') + '<span>Lancer la projection</span></button>' +
              /* Simulation (répétition) : mode local seulement, jamais avec la vraie base */
              (simOk()
                ? '<label class="switch adm-sim">' +
                    '<input type="checkbox" id="adm-sim"' + (SIM.on ? ' checked' : '') + '>' +
                    '<span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>' +
                    '<span class="adm-sim-txt"><strong>Simulation (répétition)</strong><span>De fausses arrivées sur le mur</span></span>' +
                  '</label>'
                : '') +
            '</div>' +
            '<p class="adm-help">' + esc(nb('Le mur passe en plein écran.')) + ' <kbd>Échap</kbd> ' + esc(nb('ramène ici,')) + ' <kbd>Q</kbd> ' + esc(nb('affiche le QR code en géant.')) + '</p>' +
            (simOk() ? '<p class="adm-sim-warn" id="adm-sim-warn" hidden>' + esc(nb('Simulation active : le mur projeté montre de faux participants. Coupe-la avant la vraie démo.')) + '</p>' : '') +
          '</section>' +
          '<div class="adm-side">' +
            '<div class="adm-kpis">' + ADM_KPIS.map(function (k) {
              return '<div class="adm-kpi adm-kpi--' + k.k + '">' +
                '<span class="adm-kpi-ic" aria-hidden="true">' + k.ic + '</span>' +
                '<span class="adm-kpi-n" data-k="' + k.k + '">' + st[k.k] + '</span>' +
                '<span class="adm-kpi-label" data-k="' + k.k + '">' + esc(lbl(st[k.k], k.one, k.many)) + '</span>' +
                '<span class="adm-kpi-sub" data-k="' + k.k + '">' + esc(nb(k.sub(st))) + '</span>' +
              '</div>';
            }).join('') + '</div>' +
            '<section class="adm-card adm-feedcard" aria-labelledby="adm-feed-h">' +
              '<div class="adm-card-head">' +
                '<h2 class="adm-h" id="adm-feed-h"><span class="adm-dot" aria-hidden="true"></span>En direct</h2>' +
                '<span class="adm-hint">Qui fait quoi</span>' +
              '</div>' +
              '<div class="adm-filters" id="adm-filters" role="group" aria-label="Filtrer le flux">' + filters.map(function (f) {
                return filterChip('admin-filter', f[0], esc(f[1]), f[0] === admSel);
              }).join('') + '</div>' +
              '<div class="adm-feedwrap">' +
                '<ol class="adm-feed" id="adm-feed"></ol>' +
                (liveOn()
                  ? '<div class="adm-empty adm-empty--live" id="adm-empty" hidden><span class="adm-empty-ic" aria-hidden="true">📡</span><p>' + esc(nb((T.emptyLive || {}).adminFeed || '')) + '</p>' +
                      '<button type="button" class="btn btn-soft adm-empty-cta" data-action="admin-first-act"' + (noActsYet() ? '' : ' hidden') + '>' + icon('plus') + '<span>Crée la première activité</span></button></div>'
                  : '<p class="adm-empty" id="adm-empty" hidden>' + esc(nb("Rien pour l'instant. Les inscriptions, participations, activités créées et contacts s'affichent ici dès qu'ils arrivent.")) + '</p>') +
                '<div class="adm-earlier" id="adm-earlier" hidden></div>' +
              '</div>' +
            '</section>' +
          '</div>' +
        '</div>' +
      '</section>';
  }

  /* « Continuer en tant qu'Ewan » (mode live) : l'ordinateur d'Ewan prend son profil (celui du seed), sans inscription,
   * puis l'accueil s'ouvre. Un bouton délie l'appareil (retour à la Bienvenue, le profil reste au campus). */
  function admOwnerHTML() {
    var o = ownerP();
    if (!o || typeof S.linkDevice !== 'function') return '';
    var me = S.me();
    var on = !!(me && me.id === o.id);
    var other = me && !on ? me : null;
    return '<section class="adm-card adm-team adm-owner' + (on ? ' is-on' : '') + '" id="adm-owner" aria-labelledby="adm-owner-h">' +
      '<div class="adm-owner-id">' +
        '<span class="adm-owner-av">' + avatar(o, 48) + (on ? '<span class="adm-owner-ok">' + icon('check') + '</span>' : '') + '</span>' +
        '<div class="adm-owner-txt">' +
          '<h2 class="adm-h" id="adm-owner-h">' + (on ? esc('Connecté en tant ' + queName(o.firstName)) : 'Cet appareil') + '</h2>' +
          '<p class="adm-team-help">' + esc(nb(on
            ? 'Tes participations, tes messages et tes activités partent en direct, comme pour tout le monde.'
            : other
              ? 'Il est relié au profil de ' + other.firstName + '. Passe sur ton profil pour participer, écrire et créer des activités.'
              : 'Ton profil est déjà prêt. Relie cet appareil pour participer, écrire et créer des activités, sans inscription.')) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="adm-owner-btns">' + (on
        ? '<a class="btn btn-primary adm-owner-go" href="#/home">' + icon('home') + '<span>Ouvrir l\'app</span></a>' +
          '<button type="button" class="btn btn-ghost adm-owner-unlink" data-action="admin-unlink">' + icon('close') + '<span>Délier cet appareil</span></button>'
        : '<button type="button" class="btn btn-grad adm-owner-link" data-action="admin-link"><span>' + esc('Continuer en tant ' + queName(o.firstName)) + '</span>' + icon('arrow') + '</button>') +
      '</div>' +
    '</section>';
  }
  /* « que Chris », « qu'Ewan » : élision devant une voyelle. */
  function queName(n) { n = String(n || ''); return (/^[aeiouyàâäéèêëîïôöùûü]/i.test(n) ? "qu'" : 'que ') + n; }
  function admLink() {
    var o = ownerP();
    var r = null;
    try { r = o ? S.linkDevice(o.id) : null; } catch (e) { r = null; }
    if (!r || !r.ok) { toast("Ce profil n'a pas pu être relié à cet appareil.", '⚠️'); return false; }
    if (!r.already) resetUi(); // brouillons et chat d'un ancien profil : on repart propre
    updateShell(current);
    return true;
  }
  function admUnlink() {
    var r = null;
    try { r = S.unlinkDevice(); } catch (e) { r = null; }
    if (!r || !r.ok) return;
    resetUi();
    var box = adm && $('#adm-owner', adm.root);
    if (box) {
      var nw = htmlOf(admOwnerHTML()).firstChild;
      if (nw) { box.parentNode.replaceChild(nw, box); pop($('.adm-owner-link', nw)); }
    }
    updateShell(current);
    toast('Cet appareil n\'est plus relié à ' + r.person.firstName + '.', '🔓');
  }

  function mountAdmin(root) {
    var a = adm = { root: root, vals: admStats(), t: 0, soonT: 0, rz: 0, onRz: null, wide: admMiniFits() };
    admBackfill();
    if (!$('#adm-filters [data-value="' + admSel + '"]', root)) {
      admSel = 'all';
      var c0 = $('#adm-filters [data-value="all"]', root);
      if (c0) { c0.classList.add('is-on'); c0.setAttribute('aria-pressed', 'true'); }
    }
    admRenderFeed(true);
    admEarlier();
    admSimUi();
    paintPills();
    var vp = $('#adm-mini-vp', root);
    if (vp) mountWall(vp, { mini: true, k: admFit() });
    a.onRz = function () {
      if (a.rz) return;
      a.rz = requestAnimationFrame(function () {
        a.rz = 0;
        if (adm !== a) return;
        if (admMiniFits() !== a.wide) { render({ force: true, noTransition: true }); return; }
        admFit();
      });
    };
    window.addEventListener('resize', a.onRz);
    a.t = setInterval(admTimes, 15000);
    fxHandles.push({ stop: stopAdmin });
  }
  function stopAdmin() {
    var a = adm;
    if (!a) return;
    clearInterval(a.t);
    clearTimeout(a.soonT);
    if (a.rz) cancelAnimationFrame(a.rz);
    window.removeEventListener('resize', a.onRz);
    adm = null;
  }

  /* La miniature : le mur rendu à la taille de cette fenêtre (ses tailles sont en vh/vw), réduit pour tenir
   * dans son cadre. Grand écran : le cadre prend la place libre ; sinon il suit les proportions de la fenêtre. */
  function admFit() {
    var box = adm && $('#adm-mini', adm.root), vp = box && $('#adm-mini-vp', box);
    if (!vp) return 1;
    var vw = window.innerWidth || 1280, vh = window.innerHeight || 800;
    vp.style.width = vw + 'px';
    vp.style.height = vh + 'px';
    var cw = box.clientWidth || 1, ch;
    if (mm(ADM_WIDE)) { box.style.height = ''; ch = box.clientHeight || Math.round(cw * vh / vw); }
    else { ch = Math.round(cw * vh / vw); box.style.height = ch + 'px'; }
    var k = Math.max(0.1, Math.min(cw / vw, ch / vh));
    vp.style.transform = 'scale(' + k.toFixed(4) + ')';
    vp.style.left = Math.round((cw - vw * k) / 2) + 'px';
    vp.style.top = Math.round((ch - vh * k) / 2) + 'px';
    if (wall && wall.mini) { wall.k = k; layoutWall(); }
    return k;
  }

  function admOn(ev, d) {
    if (!adm) return;
    if (ev === 'change' && d.reset) { render({ force: true, noTransition: true }); return; }
    if (ev === 'message:hidden') admMarkHidden(d.id);
    admSoon();
  }
  /* Message masqué (ici ou par un autre appareil) : le bouton devient l'étiquette « masqué ». */
  function admMarkHidden(id) {
    if (!adm || !id) return;
    $$('.adm-ev-btn[data-action="admin-hide-msg"]', adm.root).forEach(function (b) {
      if (b.getAttribute('data-id') !== id) return;
      var tag = document.createElement('span');
      tag.className = 'adm-ev-tag';
      tag.textContent = 'masqué';
      if (b.parentNode) b.parentNode.replaceChild(tag, b);
    });
  }
  function admSoon() {
    var a = adm;
    if (!a || a.soonT) return;
    a.soonT = setTimeout(function () {
      if (adm !== a) return;
      a.soonT = 0;
      admBackfill();
      admRenderFeed(false);
      admKpis();
      admEarlier();
      admOwnerSync();
    }, 120);
  }

  function admActLabel(a) { return a && a.title ? (a.emoji ? a.emoji + ' ' : '') + a.title : 'une activité'; }
  function admWhen(a) { return a && a.date && !isNaN(Date.parse(a.date)) ? shortWhen(a.date) : ''; }
  function admItemHTML(it) {
    var p = S.person(it.p) || null;
    if (!p) return ''; // profil retiré (modération, cc_reset) : ses actions quittent le flux
    var nm = wallName(p);
    var who = '<b>' + esc(nm) + '</b>';
    var a = it.a ? (S.activity(it.a) || it.act || null) : null;
    var what = '<b>' + esc(admActLabel(a)) + '</b>';
    var main = '', sub = '', extra = '';
    if (it.k === 'person') {
      main = who + ' a créé son profil';
      sub = [wallHidden(p) ? 'profil masqué' : subtitle(p), emojisOf(p, 4)].filter(Boolean).join(' · ');
    } else if (it.k === 'join') {
      main = who + ' participe à ' + what;
      sub = [admWhen(a), a && a.participants && a.max ? a.participants.length + '/' + a.max : ''].filter(Boolean).join(' · ');
    } else if (it.k === 'leave') {
      main = it.full ? who + ' arrive trop tard : ' + what + ' est complet' : who + ' ne vient plus à ' + what;
    } else if (it.k === 'activity') {
      main = who + ' a créé ' + what;
      sub = [admWhen(a), a && a.place ? String(a.place) : ''].filter(Boolean).join(' · ');
      if (!S.activity(it.a)) extra = '<span class="adm-ev-tag">annulée</span>';
    } else if (it.k === 'conn') {
      var b = S.person(it.b);
      main = who + ' a contacté <b>' + esc(b ? wallName(b) : "quelqu'un") + '</b>';
      sub = 'Demande de mise en relation';
    } else if (it.k === 'message') {
      var m = it.m || {};
      var sm = m.id && typeof S.message === 'function' ? S.message(m.id) : null;
      main = who + ' a écrit dans ' + what;
      sub = '« ' + clip(String(m.body || ''), 160) + ' »';
      if (m.hidden || (sm && sm.hidden)) extra = '<span class="adm-ev-tag">masqué</span>';
      else if (m.id && typeof S.hideMessage === 'function') extra = '<button type="button" class="adm-ev-btn" data-action="admin-hide-msg" data-id="' + esc(m.id) + '" aria-label="Masquer ce message pour tout le monde">Masquer</button>';
    } else return '';
    var kd = ADM_KIND[it.k];
    return '<li class="adm-ev adm-ev--' + it.k + '" data-k="' + (it.k === 'leave' ? 'join' : it.k) + '" data-id="' + it.id + '">' +
      '<span class="adm-ev-av">' + avatar(wallPub(p), 40) +
        '<span class="adm-ev-kind" title="' + esc(kd.label) + '" aria-hidden="true">' + kd.ic + '</span></span>' +
      '<div class="adm-ev-txt"><p class="adm-ev-main">' + nb(main) + '</p>' + (sub ? '<p class="adm-ev-sub">' + esc(nb(sub)) + '</p>' : '') + '</div>' +
      '<div class="adm-ev-end"><time class="adm-ev-time" data-at="' + it.at + '">' + esc(relTime(it.at)) + '</time>' + extra + '</div>' +
    '</li>';
  }
  /* Le flux suit le journal : les éléments déjà affichés restent en place (seuls les nouveaux s'animent),
   * ceux d'une personne retirée (modération, cc_reset) disparaissent. */
  function admRenderFeed(initial) {
    var a = adm, ol = a && $('#adm-feed', a.root);
    if (!ol) return;
    var existing = Object.create(null);
    $$('#adm-feed > li', a.root).forEach(function (li) { existing[li.getAttribute('data-id')] = li; });
    var list = [];
    journal.slice(-150).reverse().forEach(function (it) {
      if (!S.person(it.p)) return; // profil retiré : sa ligne part avec lui (voir plus bas)
      var li = existing[it.id];
      if (li) { delete existing[it.id]; list.push(li); return; }
      var html = admItemHTML(it);
      if (!html) return;
      li = htmlOf(html).firstChild;
      if (!initial) li.__fresh = true;
      list.push(li);
    });
    Object.keys(existing).forEach(function (k) { var o = existing[k]; if (o.parentNode) o.parentNode.removeChild(o); });
    list.forEach(function (li, i) { if (ol.children[i] !== li) ol.insertBefore(li, ol.children[i] || null); });
    list.forEach(function (li) {
      if (!li.__fresh) return;
      delete li.__fresh;
      if (REDUCED || !li.animate) return;
      try {
        li.animate([{ opacity: 0, transform: 'translateY(-12px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.15)' });
        li.animate([{ backgroundColor: 'rgba(91, 61, 245, .12)' }, { backgroundColor: 'rgba(91, 61, 245, .03)' }], { duration: 2200, easing: 'ease-out' });
      } catch (e) { /* rien */ }
    });
    /* premier message du chat : le filtre « Messages » apparaît */
    var fl = $('#adm-filters', a.root);
    if (fl && admHasChat() && !$('[data-value="message"]', fl)) fl.insertAdjacentHTML('beforeend', filterChip('admin-filter', 'message', 'Messages', admSel === 'message'));
    admFilter();
  }
  /* Déjà inscrits : les vrais inscrits arrivés avant le chargement de la page (sans heure connue). */
  function admEarlier() {
    var box = adm && $('#adm-earlier', adm.root);
    if (!box) return;
    var inJ = Object.create(null);
    journal.forEach(function (it) { if (it.k === 'person') inJ[it.p] = true; });
    var list = S.people().filter(function (p) { return !isSeed(p) && !inJ[p.id]; }).reverse();
    if (!list.length) { box.innerHTML = ''; box.hidden = true; admFilter(); return; }
    var shown = list.slice(0, 40);
    box.innerHTML = '<h3 class="adm-earlier-h">Déjà inscrits <span class="adm-earlier-n">' + list.length + '</span></h3>' +
      '<ul class="adm-earlier-list">' + shown.map(function (p) {
        var n = S.state.activities.filter(function (x) { return x.organizerId !== p.id && x.participants.indexOf(p.id) >= 0; }).length;
        var c = S.organizedBy(p.id).length;
        var bits = [emojisOf(p, 4)];
        if (n) bits.push('participe à ' + plural(n, 'activité', 'activités'));
        if (c) bits.push(plural(c, 'activité créée', 'activités créées'));
        return '<li class="adm-ev adm-ev--earlier">' +
          '<span class="adm-ev-av">' + avatar(wallPub(p), 36) + '</span>' +
          '<div class="adm-ev-txt"><p class="adm-ev-main"><b>' + esc(wallName(p)) + '</b>' + (wallHidden(p) ? ' <span class="adm-ev-tag">profil masqué</span>' : '') + '</p>' +
            '<p class="adm-ev-sub">' + esc(nb(bits.filter(Boolean).join(' · ') || subtitle(p))) + '</p></div>' +
        '</li>';
      }).join('') + '</ul>' +
      (list.length > shown.length ? '<p class="adm-more">' + esc(nb('Et ' + plural(list.length - shown.length, 'autre', 'autres') + '.')) + '</p>' : '');
    box.hidden = false;
    admFilter();
  }
  function admFilter() {
    var a = adm;
    if (!a) return;
    var f = admSel || 'all', n = 0;
    $$('#adm-feed > li', a.root).forEach(function (li) {
      var on = f === 'all' || li.getAttribute('data-k') === f;
      li.hidden = !on;
      if (on) n++;
    });
    var early = $('#adm-earlier', a.root);
    var earlyOn = !!(early && early.firstChild) && (f === 'all' || f === 'person');
    if (early) early.hidden = !earlyOn;
    var empty = $('#adm-empty', a.root);
    if (empty) empty.hidden = n > 0 || earlyOn;
    var cta = $('.adm-empty-cta', a.root);
    if (cta) cta.hidden = !noActsYet();
  }
  /* La carte « Continuer en tant qu'Ewan » suit l'identité de l'appareil (lien ou déliage dans un autre onglet). */
  function admOwnerSync() {
    var box = adm && $('#adm-owner', adm.root);
    if (!box) return;
    var nw = htmlOf(admOwnerHTML()).firstChild;
    if (nw && nw.outerHTML !== box.outerHTML) box.parentNode.replaceChild(nw, box);
  }
  function admTimes() {
    if (!adm) return;
    $$('#adm-feed time[data-at]', adm.root).forEach(function (el) { el.textContent = relTime(+el.getAttribute('data-at')); });
  }
  function admKpis() {
    var a = adm;
    if (!a) return;
    var st = admStats();
    ADM_KPIS.forEach(function (k) {
      var el = $('.adm-kpi-n[data-k="' + k.k + '"]', a.root);
      if (!el) return;
      var from = a.vals[k.k], to = st[k.k];
      if (from !== to) {
        countUp(el, from, to, 700);
        var tile = el.parentNode;
        if (tile && !REDUCED) { tile.classList.remove('is-bump'); void tile.offsetWidth; tile.classList.add('is-bump'); }
      }
      var sb = $('.adm-kpi-sub[data-k="' + k.k + '"]', a.root);
      if (sb) sb.textContent = nb(k.sub(st));
      var lb = $('.adm-kpi-label[data-k="' + k.k + '"]', a.root);
      if (lb) lb.textContent = lbl(st[k.k], k.one, k.many);
    });
    a.vals = st;
  }
  function admSimUi() {
    var a = adm;
    if (!a) return;
    var on = SIM.on;
    var cb = $('#adm-sim', a.root);
    if (cb) cb.checked = on;
    var badge = $('#adm-sim-badge', a.root), warn = $('#adm-sim-warn', a.root), sec = $('#adm', a.root);
    if (badge) badge.hidden = !on;
    if (warn) warn.hidden = !on;
    if (sec) sec.classList.toggle('is-sim', on);
  }
  /* Modération du chat : « Masquer » appelle CC.store.hideMessage(id) ; le message disparaît pour tout le monde. */
  function admHideMessage(btn) {
    var id = btn.getAttribute('data-id');
    if (!id || typeof S.hideMessage !== 'function') return;
    var r = null;
    try { r = S.hideMessage(id); } catch (e) { r = { ok: false }; }
    if (r && r.ok === false) { toast("Ce message n'a pas pu être masqué.", '⚠️'); return; }
    journal.forEach(function (it) { if (it.k === 'message' && it.m && it.m.id === id) it.m.hidden = true; });
    journalSave();
    admMarkHidden(id);
    toast('Message masqué pour tout le monde.', '🙈');
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
        text: liveOn()
          ? 'Cet appareil repart de zéro. Les inscriptions déjà partagées restent visibles par tout le campus.'
          : 'Les inscriptions, participations et activités créées sur cet appareil seront effacées.',
        ok: 'Remettre à zéro', cancel: 'Annuler', action: 'do-reset', danger: true, keep: true
      });
    }
  }

  function resetUi() {
    draft = null;
    chatDrafts = {}; // un message commencé ne passe pas au profil suivant
    ui.pendingReveal = false;
    ui.pulses = [];
    ui.joinAnim = null;
    ui.lastObPct = 0;
    lastMeSig = '';
    restoredDraft = null;
    closeModal(true, true);
  }

  function doReset() {
    S.reset();
    resetUi();
    /* Pas de toast : le retour à la Bienvenue suffit, et le jury ne doit pas lire « démo remise à zéro ».
     * Depuis le panel ou le mur, l'organisateur reste sur son panel. */
    var org = (current.name === 'admin' || current.name === 'live') && isAdmin();
    if (org) exitFullscreen();
    go(org ? '#/admin' : '#/welcome', { force: true });
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
      ui.cancelledAt = Date.now();
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
    'live-qr': function () { bigQR(); },
    'live-fs': function () { toggleFullscreen(); },
    'live-exit': function () { exitWall(); },
    'admin-launch': function () { launchProjection(); },
    'admin-logout': function () {
      confirmModal({
        emoji: '🔒', title: 'Quitter le mode organisateur ?',
        text: "Cet appareil n'aura plus accès au panel ni à l'écran projeté. Il faudra retaper le code pour revenir.",
        ok: 'Quitter', cancel: 'Rester', action: 'admin-logout-do'
      });
    },
    'admin-logout-do': function () {
      closeModal(true, true);
      setSim(false);
      setAdmin(false);
      journal = [];
      try { window.sessionStorage.removeItem(JOURNAL_KEY); } catch (e) { /* rien */ }
      go(S.me() ? '#/home' : '#/welcome');
      toast('Mode organisateur fermé sur cet appareil.', '🔒');
    },
    'admin-filter': function (btn) {
      if (!adm) return;
      admSel = btn.getAttribute('data-value') || 'all';
      $$('#adm-filters .fchip').forEach(function (b) { var on = b === btn; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
      pop(btn);
      admFilter();
    },
    'admin-hide-msg': function (btn) { admHideMessage(btn); },
    /* « Continuer en tant qu'Ewan » : lie l'appareil à son profil et ouvre l'accueil. Déjà relié à un inscrit →
     * confirmation (ce profil reste au campus, plus sur cet appareil). */
    'admin-link': function () {
      var o = ownerP(), me = S.me();
      if (!o) return;
      if (me && me.id !== o.id) {
        confirmModal({
          emoji: '📱', title: 'Passer cet appareil à ' + o.firstName + ' ?',
          text: 'Il est relié au profil de ' + me.firstName + '. Ce profil reste visible par le campus, mais cet appareil ne pourra plus l\'utiliser.',
          ok: 'Passer à ' + o.firstName, cancel: 'Annuler', action: 'admin-link-do'
        });
        return;
      }
      if (admLink()) go('#/home');
    },
    'admin-link-do': function () { closeModal(true, true); if (admLink()) go('#/home'); },
    'admin-unlink': function () { admUnlink(); },
    /* Flux vide du panel : « Crée la première activité » (relie l'appareil à Ewan s'il ne l'est pas encore). */
    'admin-first-act': function () {
      var o = ownerP(), me = S.me();
      if (!me && o && !admLink()) return;
      go('#/create');
    },
    /* Chat : une suggestion remplit le champ (on peut la modifier avant d'envoyer). */
    'chat-suggest': function (btn) {
      var inp = chat && chat.input;
      if (!inp) return;
      inp.value = btn.getAttribute('data-text') || '';
      chatInputUi();
      try { inp.focus({ preventScroll: true }); inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) { /* rien */ }
    },
    'chat-jump': function () { chatToBottom(true); chatJump(false); },
    /* Créer : « ✨ Pas dans la liste ? » bascule sur l'option « Autre chose ». */
    'cf-other': function () {
      var f = $('#create-form');
      var ps = f && f.elements.passion;
      if (!ps) return;
      ps.value = CUSTOM;
      if (f.elements.emoji) f.elements.emoji.value = '';
      syncCustomUi(f, true);
      updatePreview();
    },
    /* Créer : une suggestion de lieu remplit le champ (on peut encore le modifier). */
    'cf-place': function (btn) {
      var f = $('#create-form');
      var inp = f && f.elements.place;
      if (!inp) return;
      inp.value = btn.getAttribute('data-value') || '';
      inp.removeAttribute('aria-invalid');
      var er = $('[data-err="place"]', f); if (er) er.textContent = '';
      syncPlaceChips(f);
      pop(btn);
      updatePreview();
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
  var GUARDED = { 'join': 1, 'leave': 1, 'cancel-activity': 1, 'do-cancel': 1, 'contact': 1, 'send-request': 1, 'do-reset': 1, 'start': 1, 'edit-profile': 1, 'reveal-done': 1, 'live-fs': 1, 'live-exit': 1, 'admin-launch': 1, 'admin-logout': 1, 'admin-logout-do': 1, 'admin-hide-msg': 1, 'admin-link': 1, 'admin-link-do': 1, 'admin-unlink': 1, 'admin-first-act': 1 };
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
      else if (kind === 'admin') adminTry(f);
      else if (kind === 'chat') chatSend(f);
    });
    /* Bouton Envoyer du chat : le champ garde le focus (le clavier du téléphone reste ouvert). */
    document.addEventListener('mousedown', function (e) {
      if (e.target && e.target.closest && e.target.closest('.chat-send')) e.preventDefault();
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
      if (t.id === 'adm-sim' && e.type === 'change') {
        setSim(t.checked);
        /* arrêt : les personnes fictives quittent l'aperçu (le mur est remonté sans elles) */
        if (!t.checked && wall && wall.mini) render({ force: true, noTransition: true });
        else admSimUi();
        return;
      }
      if (t.id === 'chat-input') { chatInputUi(); return; }
      if (t.id === 'adm-code' && t.getAttribute('aria-invalid')) {
        t.removeAttribute('aria-invalid');
        var ae = $('[data-err="admin"]'); if (ae) ae.textContent = '';
      }
      if (t.id === 'explore-teach' && e.type === 'change') {
        ui.explore.teach = t.checked;
        renderExploreResults(true);
        syncExploreHash();
      }
      if (t.form && t.form.id === 'create-form') {
        var cf = t.form, em = cf.elements.emoji;
        if (t.name === 'cat' && e.type === 'change') {
          var ps = $('#cf-passion');
          var wasCustom = !!ps && ps.value === CUSTOM;
          if (ps) { ps.innerHTML = passionOptions(t.value, wasCustom ? CUSTOM : ''); pop(ps); }
          /* activité libre : on garde le texte et l'emoji choisi, l'emoji par défaut suit la catégorie */
          if (wasCustom) {
            var pick = $('#cf-emojis', cf);
            if (pick) pick.innerHTML = emojiChoices(t.value, em ? em.value : '');
            var sel = $('input[name="emojiPick"]:checked', cf);
            if (em) em.value = sel ? sel.value : '';
          } else if (em) em.value = '';
        }
        if (t.name === 'passion') { if (em) em.value = ''; syncCustomUi(cf, CAN_HOVER && e.type === 'change'); }
        if (t.name === 'emojiPick' && t.checked && em) em.value = t.value;
        if (t.name === 'place') syncPlaceChips(cf);
        if ((t.name === 'title' || t.name === 'customLabel' || t.name === 'place') && t.getAttribute('aria-invalid') && clean1(t.value)) {
          t.removeAttribute('aria-invalid');
          var ce = $('[data-err="' + (t.name === 'customLabel' ? 'custom' : t.name) + '"]', cf); if (ce) ce.textContent = '';
        }
        updatePreview();
      }
    };
    document.addEventListener('input', onField);
    document.addEventListener('change', onField);

    document.addEventListener('dblclick', function (e) {
      var t = e.target && e.target.closest && e.target.closest('[data-demo-fill]');
      if (!t) return;
      try { window.getSelection().removeAllRanges(); } catch (err) { /* rien */ }
      /* Raccourcis de la démo V1 : jamais en mode live (de vrais inscrits, une vraie base). */
      if (liveOn()) return;
      if (t.getAttribute('data-demo-fill') === 'ob') demoFillOb(parseInt(t.getAttribute('data-step'), 10) || 1);
      else demoFillCreate();
    });

    document.addEventListener('keydown', function (e) {
      var hadModal = !!$('.modal', $modal);
      if (e.key === 'Escape' && hadModal) closeModal(false);
      /* Mur : Q ouvre / ferme le QR géant ; Échap le ferme, sinon ramène au panel organisateur
       * (en plein écran, c'est le navigateur qui reçoit Échap : voir onFullscreenChange). */
      if (current.name === 'live' && wall && !e.metaKey && !e.ctrlKey && !e.altKey && !typing()) {
        if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); bigQR(); }
        else if (e.key === 'Escape' && !hadModal) {
          var big = $('#lw-qrbig', wall.root);
          if (big && !big.hidden) bigQR(false);
          else exitWall();
        }
      }
    });
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

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
    if (isAdmin()) journalLoad();
    bindEvents();
    if (!location.hash || location.hash === '#' || location.hash === '#/') {
      replaceHash(S.me() ? '#/home' : '#/welcome');
    }
    navCount = 1;
    /* Mode live : on écoute le store (sous garde : sans contrat, rien ne change). */
    if (!bindLive()) setTimeout(function () { if (bindLive()) paintPills(); }, 1500);
    render();
    paintPills();
    document.documentElement.classList.add('is-ready');
    if (!S.storageOk()) {
      setTimeout(function () { toast("Mode sans sauvegarde : le navigateur bloque le stockage local. Tout marche, mais rien n'est gardé après fermeture.", 'ℹ️'); }, 600);
    }
  }

  CC.app = { render: render, go: go, toast: toast, avatarHTML: avatar, esc: esc };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
