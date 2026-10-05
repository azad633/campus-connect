/* Campus Connect — état, persistance, affinités, statistiques, actions (CC.store).
 * Script classique, chargé après copy.js et data.js.
 * L'état est copié depuis CC.data au premier lancement (et après reset()),
 * puis enregistré dans localStorage (clé cc_state_v1). Si le stockage est
 * indisponible, l'app tourne quand même : l'état reste en mémoire.
 * Mode live (SPEC §9, clés remplies dans config.js) : clé cc_live_v1_<projet>, ids uniques entre
 * appareils, événements CC.store.on(...) ; la synchronisation elle-même est dans sync.js.
 * Chat d'activité (V1.2) : state.messages (seed de data.js + messages écrits) ; les messages lus sont notés
 * à part (clé <clé>_lus), propres à l'appareil, pour ne pas réécrire tout l'état à chaque lecture.
 */
window.CC = window.CC || {};

(function (CC) {
  'use strict';

  var VERSION = 1;
  var D = CC.data;
  var state = null;
  var storageOk = true;

  var api = {};

  /* Mode live (SPEC §9) : seulement si config.js contient une URL et une clé publique valides.
   * Sinon mode local, strictement comme la V1 (clé cc_state_v1, aucun appel réseau). */
  function liveConfig() {
    var c = CC.config || {};
    var url = String(c.supabaseUrl || '').trim().replace(/\/+$/, '');
    var key = String(c.supabaseAnonKey || '').trim();
    if (!url || !key) return null;
    if (!/^https:\/\/[^\s\/]+$/.test(url)) return null;
    if (/^sb_secret_/.test(key) || isServiceJwt(key)) {
      try { console.error('[Campus Connect] config.js contient une clé secrète (service_role) : mode live désactivé. Utilise la clé publique « anon ».'); } catch (e) { /* rien */ }
      return null;
    }
    return { url: url, key: key, ref: url.replace(/^https:\/\//, '').split('.')[0].replace(/[^a-zA-Z0-9_-]/g, '') };
  }
  function isServiceJwt(key) {
    var parts = key.split('.');
    if (parts.length !== 3) return false;
    try {
      var b = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      return JSON.parse(window.atob(b)).role === 'service_role';
    } catch (e) { return false; }
  }
  var LIVE = liveConfig();
  var KEY = (CC.config && typeof CC.config.storageKey === 'string' && CC.config.storageKey) ||
    (LIVE ? 'cc_live_v1_' + LIVE.ref : 'cc_state_v1');

  /* ---------- Données de départ du mode live : Ewan seul ----------
   * Mode local : tout data.js, exactement comme la V1. Mode live (demande d'Ewan, 5 oct. au soir : « je veux être
   * le seul à avoir un compte ») : le profil d'Ewan (CC.data.live.owner) et rien d'autre, ni activité, ni connexion,
   * ni message. CC.data est remplacé en place, avant tout le reste : sync.js, fx.js et app.js lisent ainsi le même
   * seed que le store. LIVE_SEED change quand ce seed change : un état live enregistré avec un autre seed est
   * reconstruit (voir load). */
  var LIVE_SEED = 'solo-ewan-1';
  var OWNER = null;
  function applyLiveSeed() {
    var L = D.live;
    var p = L && typeof L.owner === 'string' ? byId(D.people || [], L.owner) : null;
    D.people = p ? [clone(p)] : [];
    D.activities = [];
    D.connections = [];
    D.messages = [];
    OWNER = p ? p.id : null;
  }
  if (LIVE) applyLiveSeed();

  /* Ce qui vient du seed (après le remplacement ci-dessus). En mode live : le profil d'Ewan, jamais écrasé par la base. */
  var SEED_P = Object.create(null), SEED_A = Object.create(null);
  D.people.forEach(function (p) { SEED_P[p.id] = true; });
  D.activities.forEach(function (a) { SEED_A[a.id] = (a.participants || []).slice(); });
  api.isSeedPerson = function (id) { return !!SEED_P[id]; };
  api.isSeedActivity = function (id) { return !!SEED_A[id]; };
  api.isSeedPart = function (actId, personId) { var l = SEED_A[actId]; return !!l && l.indexOf(personId) !== -1; };
  /* Mode live : id du profil de l'organisateur (Ewan), que le panel peut relier à cet appareil. Mode local : null. */
  api.ownerId = function () { return OWNER; };

  /* Horloge remplaçable (tests). */
  api.now = function () { return new Date(); };

  /* ---------- Événements (SPEC §9) ----------
   * CC.store.on(event, fn) → fonction de désabonnement.
   * Les événements partent juste après l'action (micro-tâche), jamais pendant : l'appelant
   * a fini son travail (rendu, animation) quand les écouteurs sont appelés. Plusieurs
   * « change » rapprochés sont regroupés en un seul, envoyé après les événements précis. */
  var listeners = {};
  var evQueue = [];
  var evScheduled = false;

  api.on = function (evt, fn) {
    if (typeof fn !== 'function') return function () {};
    (listeners[evt] = listeners[evt] || []).push(fn);
    return function () {
      var l = listeners[evt] || [];
      var i = l.indexOf(fn);
      if (i !== -1) l.splice(i, 1);
    };
  };

  function dispatch(evt, payload) {
    var l = (listeners[evt] || []).slice();
    for (var i = 0; i < l.length; i++) {
      try { l[i](payload); } catch (e) {
        try { console.error('[CC.store] écouteur « ' + evt + ' » en erreur', e); } catch (e2) { /* rien */ }
      }
    }
  }

  function flushEvents() {
    evScheduled = false;
    var q = evQueue;
    evQueue = [];
    var change = null;
    for (var i = 0; i < q.length; i++) {
      if (q[i][0] === 'change') {
        var p = q[i][1] || {};
        change = change || { remote: false, reset: false };
        if (p.remote) change.remote = true;
        if (p.reset) change.reset = true;
      } else {
        dispatch(q[i][0], q[i][1]);
      }
    }
    if (change) dispatch('change', change);
  }

  function emit(evt, payload) {
    evQueue.push([evt, payload]);
    if (evScheduled) return;
    evScheduled = true;
    Promise.resolve().then(flushEvents);
  }

  /* État de la synchronisation : 'local' | 'connecting' | 'live' | 'offline' (géré par sync.js). */
  var status = LIVE ? 'connecting' : 'local';
  api.syncStatus = function () { return status; };
  function setStatus(s) {
    if (!LIVE || s === status) return;
    status = s;
    emit('status', { status: s });
  }

  /* Identifiant unique entre appareils : préfixe aléatoire + horodatage. */
  function uid() {
    var r = '';
    try {
      var a = new Uint32Array(2);
      window.crypto.getRandomValues(a);
      r = a[0].toString(36) + a[1].toString(36);
    } catch (e) { r = ''; }
    if (r.length < 6) r = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return r.slice(0, 6) + Date.now().toString(36);
  }

  /* ---------- Outils ---------- */

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function has(list, v) { return list.indexOf(v) !== -1; }
  function uniq(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) if (!has(out, list[i])) out.push(list[i]);
    return out;
  }
  function str(v, max) {
    var s = (v === undefined || v === null) ? '' : String(v);
    s = s.replace(/\s+/g, ' ').trim();
    return max ? s.slice(0, max) : s;
  }
  function text(v, max) { // garde les retours à la ligne
    var s = (v === undefined || v === null) ? '' : String(v);
    s = s.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return max ? s.slice(0, max) : s;
  }
  /* Coupe à max sans laisser une moitié d'emoji à la fin. */
  function cut(s, max) {
    s = str(s, max);
    return /[\uD800-\uDBFF]$/.test(s) ? s.slice(0, -1) : s;
  }
  function slug(s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'x';
  }

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* Prochaine occurrence d'un jour de semaine (1 = lundi) à une heure donnée,
   * aujourd'hui compris si l'heure n'est pas passée. */
  function nextOccurrence(weekday, time, base) {
    base = base || api.now();
    var hm = String(time || '18:00').split(':');
    var h = parseInt(hm[0], 10) || 0, m = parseInt(hm[1], 10) || 0;
    var d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0);
    var todayWd = ((base.getDay() + 6) % 7) + 1;
    var diff = ((weekday - todayWd) % 7 + 7) % 7;
    d.setDate(d.getDate() + diff);
    if (d.getTime() <= base.getTime()) d.setDate(d.getDate() + 7);
    return d;
  }
  api.nextOccurrence = nextOccurrence;

  /* ---------- Persistance ---------- */

  /* Messages du seed : datés à partir du premier lancement (ou de la remise à zéro).
   * rcv = heure d'arrivée sur l'appareil (sert aux non-lus) ; seed: true = jamais envoyé à la base. */
  function seedMessages(base) {
    var t0 = (base || api.now()).getTime();
    return (D.messages || []).map(function (m) {
      var t = t0 - Math.max(0, m.ago || 0) * 60000;
      return { id: m.id, activityId: m.activityId, personId: m.personId, body: cut(m.body, MSG_MAX),
        at: new Date(t).toISOString(), hidden: false, seed: true, rcv: t };
    });
  }
  /* État enregistré avant la V1.2 (sans messages) : on y ajoute ceux du seed. */
  function normalize(s) {
    if (!Array.isArray(s.messages)) {
      var t = Date.parse(s.seededAt);
      s.messages = seedMessages(isNaN(t) ? api.now() : new Date(t));
    }
    return s;
  }

  function seed() {
    var base = api.now();
    var s = {
      v: VERSION,
      me: null,
      people: clone(D.people),
      activities: D.activities.map(function (a) {
        var c = clone(a);
        c.date = nextOccurrence(a.when.weekday, a.when.time, base).toISOString();
        return c;
      }),
      connections: clone(D.connections),
      sentRequests: [],
      messages: seedMessages(base),
      seededAt: base.toISOString(),
      baseline: null
    };
    if (LIVE) s.seedSig = LIVE_SEED; // mode local : état identique à la V1
    return s;
  }

  /* Mode live : état enregistré avec un autre seed (personnes fictives avant la V1.3, équipe de 4 ensuite).
   * On repart du seed actuel ; le reste revient de la base. L'appareil garde son identité si c'est Ewan ou un vrai
   * inscrit (avec sa file d'envoi). Un ancien profil d'équipe ou fictif (Chris, Lucas…) n'existe plus : l'appareil
   * repart sans profil et sa file est jetée, pour qu'aucune action sous cet id ne parte dans la base. */
  var rebuilt = false;
  function rebuildLive(old) {
    var s = seed();
    var me = old.me ? byId(old.people, old.me) : null;
    var keep = false;
    if (me && SEED_P[me.id]) { s.me = me.id; keep = true; }
    else if (me && !me.team && !byId(s.people, me.id) && /-[a-z0-9]{6,}$/.test(me.id)) { s.people.push(me); s.me = me.id; keep = true; }
    if (keep) {
      if (old.sync && typeof old.sync === 'object') s.sync = old.sync;
      if (Array.isArray(old.sentRequests)) s.sentRequests = old.sentRequests;
    }
    rebuilt = true;
    return s;
  }

  function valid(s) {
    return !!(s && s.v === VERSION && Array.isArray(s.people) && Array.isArray(s.activities) &&
      Array.isArray(s.connections) && Array.isArray(s.sentRequests) && s.people.length > 0);
  }

  function load() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(KEY);
    } catch (e) {
      storageOk = false;
      return null;
    }
    if (!raw) return null;
    try {
      var s = JSON.parse(raw);
      if (!valid(s)) return null;
      if (s.me && !byId(s.people, s.me)) s.me = null;
      if (LIVE && s.seedSig !== LIVE_SEED) return rebuildLive(s);
      return normalize(s);
    } catch (e) {
      return null;
    }
  }

  var frozen = false; // mode live : onglet sur le point de recharger, il ne doit plus rien écrire

  function save() {
    if (frozen) return false;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
      storageOk = true;
      return true;
    } catch (e) {
      storageOk = false;
      return false;
    }
  }

  api.init = function () {
    state = load();
    if (!state) {
      state = seed();
      save();
    } else if (rebuilt) {
      rebuilt = false;
      save();
    }
    return state;
  };

  /* reset() ne touche que cet appareil, jamais la base partagée. */
  api.reset = function () {
    try { window.localStorage.removeItem(KEY); } catch (e) { /* stockage indisponible */ }
    readMap = { me: null, a: {} };
    try { window.localStorage.removeItem(READ_KEY); } catch (e) { /* stockage indisponible */ }
    state = seed();
    save();
    emit('change', { remote: false, reset: true });
    return state;
  };

  api.storageOk = function () { return storageOk; };

  /* ---------- Lecture ---------- */

  Object.defineProperty(api, 'state', { get: function () { return state; } });

  api.me = function () { return state.me ? byId(state.people, state.me) : null; };
  api.person = function (id) { return byId(state.people, id); };
  api.activity = function (id) { return byId(state.activities, id); };
  api.passion = function (id) { return byId(D.passions, id); };
  api.category = function (id) { return byId(D.categories, id); };
  api.people = function () { return state.people; };

  api.passionIds = function (p) { return (p.passions || []).map(function (x) { return x.id; }); };
  api.levelOf = function (p, passionId) {
    var list = p.passions || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === passionId) return list[i].level;
    return 0;
  };

  api.time = function (a) { return new Date(a.date).getTime(); };
  api.isPast = function (a) { return api.time(a) < api.now().getTime(); };
  api.isFull = function (a) { return a.participants.length >= a.max; };
  api.isIn = function (a, personId) { return has(a.participants, personId || state.me); };

  /* Activités à venir, triées par date. */
  api.upcoming = function () {
    return state.activities
      .filter(function (a) { return !api.isPast(a); })
      .sort(function (a, b) { return api.time(a) - api.time(b); });
  };

  /* ---------- Activités libres (« ✨ Autre chose ») ----------
   * Une activité libre n'a pas de passion de la liste (passion: '') mais un libellé `customLabel`
   * (≤ 40 caractères) ; son emoji est celui choisi, sinon celui de la catégorie.
   * Si le libellé désigne une passion connue (« escalade », « Padel », « afterwork »…), elle sert
   * pour « Pour toi », quelle que soit la catégorie choisie. */
  var CUSTOM = 'autre'; // valeur de l'option « ✨ Autre chose » du formulaire
  api.CUSTOM = CUSTOM;
  function words(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function singular(s) { return s.split(' ').map(function (w) { return w.length > 3 ? w.replace(/s$/, '') : w; }).join(' '); }
  var passionKeys = null;
  function matchPassion(label) {
    var k = words(label);
    if (!k) return null;
    if (!passionKeys) {
      passionKeys = Object.create(null);
      D.passions.forEach(function (p) {
        [p.label, p.id.replace(/-/g, ' ')].concat(String(p.label).split(/\s*[&,\/]\s*/)).forEach(function (v) {
          var n = words(v);
          if (!n) return;
          if (!passionKeys[n]) passionKeys[n] = p;
          if (!passionKeys[singular(n)]) passionKeys[singular(n)] = p;
        });
      });
    }
    return passionKeys[k] || passionKeys[singular(k)] || null;
  }
  api.matchPassion = matchPassion;

  /* Catégorie + passion d'une activité (création ici, données distantes dans sync.js).
   * passionId : un id de la liste, CUSTOM ou vide ; custom : le libellé libre.
   * → { cat, passion (objet | null), customLabel } ou { error: 'cat' | 'custom' } */
  function resolveTopic(catId, passionId, custom) {
    var passion = passionId === CUSTOM ? null : api.passion(passionId);
    var cat = api.category(catId) || (passion && api.category(passion.cat));
    if (!cat) return { error: 'cat' };
    if (passion && passion.cat !== cat.id) passion = null;
    custom = str(custom, 40);
    if (passion) return { cat: cat, passion: passion, customLabel: '' };
    if (custom) return { cat: cat, passion: null, customLabel: custom };
    if (passionId === CUSTOM) return { error: 'custom' };
    passion = D.passions.filter(function (p) { return p.cat === cat.id; })[0] || null;
    if (!passion) return { error: 'cat' };
    return { cat: cat, passion: passion, customLabel: '' };
  }

  /* Passion « effective » d'une activité : la sienne, ou celle que désigne son libellé libre (sinon null). */
  api.activityPassion = function (a) {
    if (!a) return null;
    var p = api.passion(a.passion);
    if (p) return p;
    return a.customLabel ? matchPassion(a.customLabel) : null;
  };

  /* Sujet affichable d'une activité : { label, emoji, custom }, jamais undefined. */
  api.activityTopic = function (a) {
    var c = a ? api.category(a.cat) : null;
    var p = a ? api.passion(a.passion) : null;
    if (p) return { label: p.label, emoji: p.emoji, custom: false };
    return {
      label: (a && a.customLabel) || (c ? c.label : 'Activité'),
      emoji: (a && a.emoji) || (c ? c.emoji : '✨'),
      custom: !!(a && a.customLabel)
    };
  };

  /* « Pour toi » : la passion de l'activité est dans mes passions ou mes « J'apprends ». */
  api.isForMe = function (a) {
    var me = api.me();
    if (!me) return false;
    var p = api.activityPassion(a);
    if (!p) return false;
    return has(api.passionIds(me), p.id) || has(me.learn || [], p.id);
  };

  api.organizedBy = function (personId) {
    return state.activities.filter(function (a) { return a.organizerId === personId; })
      .sort(function (a, b) { return api.time(a) - api.time(b); });
  };

  api.isConnected = function (a, b) {
    for (var i = 0; i < state.connections.length; i++) {
      var c = state.connections[i];
      if ((c[0] === a && c[1] === b) || (c[0] === b && c[1] === a)) return true;
    }
    return false;
  };

  api.hasRequested = function (personId) {
    for (var i = 0; i < state.sentRequests.length; i++) {
      if (state.sentRequests[i].to === personId) return true;
    }
    return false;
  };

  /* ---------- Affinités ---------- */

  function articleList(ids) {
    var parts = ids.map(function (id) {
      var p = api.passion(id);
      return p ? (p.withArticle || p.label.toLowerCase()) : id;
    });
    if (parts.length <= 1) return parts.join('');
    return parts.slice(0, -1).join(', ') + ' et ' + parts[parts.length - 1];
  }
  api.articleList = articleList;

  api.affinityWith = function (me, other) {
    if (!me || !other || me.id === other.id) return null;
    var myP = api.passionIds(me), oP = api.passionIds(other);
    var myLearn = me.learn || [], myTeach = me.teach || [];
    var oLearn = other.learn || [], oTeach = other.teach || [];

    var teachesMe = oTeach.filter(function (p) { return has(myLearn, p); });
    var iTeach = myTeach.filter(function (p) { return has(oLearn, p); });
    var common = myP.filter(function (p) { return has(oP, p); });
    var score = 3 * teachesMe.length + 2 * iTeach.length + common.length;

    var details = [];
    if (teachesMe.length) {
      details.push({ type: 'teachesMe', passions: teachesMe,
        text: other.firstName + " peut t'apprendre " + articleList(teachesMe) });
    }
    if (iTeach.length) {
      details.push({ type: 'iTeach', passions: iTeach,
        text: 'Tu peux lui apprendre ' + articleList(iTeach) });
    }
    if (common.length) {
      details.push({ type: 'common', passions: common,
        text: common.length + (common.length > 1 ? ' passions en commun' : ' passion en commun') });
    }
    return {
      person: other, score: score,
      teachesMe: teachesMe, iTeach: iTeach, common: common,
      details: details,
      reasons: details.map(function (d) { return d.text; })
    };
  };

  /* Toutes les affinités de `me` (ou d'une autre personne), scores nuls exclus,
   * tri décroissant, à égalité l'équipe d'abord puis le prénom. */
  api.affinities = function (personId) {
    var me = personId ? api.person(personId) : api.me();
    if (!me) return [];
    var out = [];
    state.people.forEach(function (p) {
      if (p.id === me.id) return;
      if (p.visible === false) return; // profil masqué : le campus ne le voit pas (seed : tous visibles)
      var a = api.affinityWith(me, p);
      if (a && a.score > 0) out.push(a);
    });
    out.sort(function (x, y) {
      if (y.score !== x.score) return y.score - x.score;
      if (!!y.person.team !== !!x.person.team) return y.person.team ? 1 : -1;
      return x.person.firstName.localeCompare(y.person.firstName, 'fr');
    });
    return out;
  };

  /* Cette personne transmet-elle quelque chose que je veux apprendre ? */
  api.canTeachMe = function (p) {
    var me = api.me();
    if (!me || !p || p.id === me.id) return false;
    return (p.teach || []).some(function (id) { return has(me.learn || [], id); });
  };

  /* ---------- Statistiques (calculées en direct) ---------- */

  /* Même calcul dans les deux modes. Mode live : le seed ne contient que le profil d'Ewan (un vrai inscrit, il compte)
   * et aucune activité : tous les chiffres viennent de vraies personnes. Mode local : calcul de la V1, inchangé. */
  api.stats = function () {
    var people = state.people;
    var profs = people.filter(function (p) { return p.role === 'prof'; }).length;
    var upcoming = api.upcoming();
    var participations = 0;
    state.activities.forEach(function (a) { participations += a.participants.length; });

    var exchanges = 0;
    people.forEach(function (a) {
      people.forEach(function (b) {
        if (a.id === b.id) return;
        var ok = (a.teach || []).some(function (id) { return has(b.learn || [], id); });
        if (ok) exchanges++;
      });
    });

    var top = upcoming.slice().sort(function (a, b) {
      if (b.participants.length !== a.participants.length) return b.participants.length - a.participants.length;
      return api.time(a) - api.time(b);
    }).slice(0, 3);

    var byCat = D.categories.map(function (c) { return { cat: c, count: 0 }; });
    people.forEach(function (p) {
      (p.passions || []).forEach(function (x) {
        var pa = api.passion(x.id);
        if (!pa) return;
        for (var i = 0; i < byCat.length; i++) if (byCat[i].cat.id === pa.cat) byCat[i].count++;
      });
    });
    byCat.sort(function (a, b) { return b.count - a.count; });

    return {
      members: people.length,
      profs: profs,
      upcoming: upcoming.length,
      participations: participations,
      connections: state.connections.length,
      exchanges: exchanges,
      top: top,
      byCategory: byCat
    };
  };

  /* ---------- Chat d'activité (V1.2) ----------
   * Message : { id, activityId, personId, body (≤ 300), at (ISO), hidden, rcv (arrivée sur l'appareil, ms), seed? }.
   * Seuls les participants (organisateur compris) lisent et écrivent le chat d'une activité. C'est un contrôle
   * de l'interface : la base reste ouverte (démo de classe, assumé). Un message masqué disparaît pour tous. */
  var MSG_MAX = 300;
  api.MSG_MAX = MSG_MAX;
  var msgSeq = 0;

  function byAt(x, y) { return (Date.parse(x.at) - Date.parse(y.at)) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0); }
  function msgShown(m) { return !m.hidden && !!api.person(m.personId); }

  api.message = function (id) { return byId(state.messages || [], id); };
  /* Messages visibles d'une activité, du plus ancien au plus récent. */
  api.messages = function (actId) {
    return (state.messages || []).filter(function (m) { return m.activityId === actId && msgShown(m); }).sort(byAt);
  };
  api.lastMessage = function (actId) {
    var l = api.messages(actId);
    return l.length ? l[l.length - 1] : null;
  };
  api.canChat = function (actOrId) {
    var a = typeof actOrId === 'string' ? api.activity(actOrId) : actOrId;
    return !!(a && state.me && has(a.participants, state.me));
  };
  /* Mes discussions : les activités où je participe (organisateur compris). */
  api.myChats = function () {
    if (!state.me) return [];
    return state.activities.filter(function (a) { return has(a.participants, state.me); });
  };

  /* Non-lus, propres à l'appareil (clé à part : lire un message ne réécrit pas l'état ni ne recharge les autres onglets). */
  var READ_KEY = KEY + '_lus';
  var readMap = (function () {
    try {
      var o = JSON.parse(window.localStorage.getItem(READ_KEY) || 'null');
      if (o && typeof o === 'object' && o.a && typeof o.a === 'object' && !Array.isArray(o.a)) return o;
    } catch (e) { /* stockage indisponible */ }
    return { me: null, a: {} };
  })();
  function readAt(actId) {
    if (readMap.me !== state.me) return 0;
    var v = readMap.a[actId];
    return typeof v === 'number' ? v : 0;
  }
  api.unread = function (actId) {
    if (!api.canChat(actId)) return 0;
    var seen = readAt(actId), n = 0;
    (state.messages || []).forEach(function (m) {
      if (m.activityId === actId && m.personId !== state.me && (m.rcv || 0) > seen && msgShown(m)) n++;
    });
    return n;
  };
  api.unreadTotal = function () {
    var n = 0;
    api.myChats().forEach(function (a) { n += api.unread(a.id); });
    return n;
  };
  api.markRead = function (actId) {
    if (!state.me || !actId) return;
    if (readMap.me !== state.me) readMap = { me: state.me, a: {} };
    readMap.a[actId] = api.now().getTime();
    try { window.localStorage.setItem(READ_KEY, JSON.stringify(readMap)); } catch (e) { /* stockage indisponible : en mémoire */ }
  };

  /* Écrire dans le chat d'une activité. Erreurs : nome, notfound, notin (pas participant), empty, flood. */
  api.sendMessage = function (actId, body) {
    var me = api.me();
    if (!me) return { ok: false, error: 'nome' };
    var a = api.activity(actId);
    if (!a) return { ok: false, error: 'notfound' };
    if (!has(a.participants, me.id)) return { ok: false, error: 'notin' };
    var b = cut(body, MSG_MAX);
    if (!b) return { ok: false, error: 'empty' };
    var t = api.now().getTime();
    if (!state.messages) state.messages = [];
    /* Anti-rafale : la base est ouverte à tous, on évite qu'un seul téléphone inonde le chat. */
    var recent = state.messages.filter(function (m) { return m.personId === me.id && !m.seed && t - (m.rcv || 0) < 15000; }).length;
    if (recent >= 8) return { ok: false, error: 'flood' };
    /* id triable : heure + compteur (deux messages dans la même milliseconde restent dans l'ordre),
     * puis un suffixe aléatoire en mode live (unique entre appareils). */
    var m = {
      id: 'm-' + t.toString(36) + ('00' + (++msgSeq % 46656).toString(36)).slice(-3) + (LIVE ? '-' + uid().slice(0, 6) : ''),
      activityId: a.id, personId: me.id, body: b,
      at: new Date(t).toISOString(), hidden: false, rcv: t
    };
    state.messages.push(m);
    save();
    api.markRead(a.id);
    emit('message:new', { message: m, remote: false });
    emit('change', { remote: false });
    return { ok: true, message: m };
  };

  /* Masquer un message pour tout le monde (modération, panel organisateur). */
  api.hideMessage = function (id) {
    var m = api.message(id);
    if (!m) return { ok: false, error: 'notfound' };
    if (m.hidden) return { ok: true, already: true, message: m };
    m.hidden = true;
    save();
    emit('message:hidden', { id: m.id, activityId: m.activityId, remote: false });
    emit('change', { remote: false });
    return { ok: true, message: m };
  };

  /* ---------- Actions ---------- */

  function cleanProfile(p, base) {
    base = base || {};
    var role = p.role === 'prof' ? 'prof' : 'etudiant';
    var passions = [];
    var seen = [];
    (p.passions || []).forEach(function (x) {
      var id = typeof x === 'string' ? x : x && x.id;
      if (!id || !api.passion(id) || has(seen, id)) return;
      var lvl = parseInt(x && x.level, 10);
      if (!(lvl >= 1 && lvl <= 3)) lvl = 2;
      seen.push(id);
      passions.push({ id: id, level: lvl });
    });
    var teach = uniq((p.teach || []).filter(function (id) { return has(seen, id); })).slice(0, 3);
    var learn = uniq((p.learn || []).filter(function (id) {
      return !!api.passion(id) && !has(teach, id);
    })).slice(0, 3);
    return {
      firstName: str(p.firstName, 30),
      lastName: str(p.lastName, 3),
      role: role,
      program: str(p.program, 40) || (role === 'prof' ? '' : 'Bachelor 1'),
      passions: passions,
      teach: teach,
      learn: learn,
      bio: text(p.bio, 140),
      visible: p.visible === undefined ? (base.visible !== undefined ? base.visible : true) : !!p.visible
    };
  }

  api.register = function (profile) {
    var c = cleanProfile(profile || {});
    if (!c.firstName) return { ok: false, error: 'firstName' };
    var baseline = api.stats();
    var id, n = 2;
    if (LIVE) {
      do { id = slug(c.firstName).slice(0, 24) + '-' + uid(); } while (api.person(id));
    } else {
      id = slug(c.firstName);
      while (api.person(id)) id = slug(c.firstName) + '-' + (n++);
    }
    var person = {
      id: id, firstName: c.firstName, lastName: c.lastName, role: c.role, program: c.program,
      passions: c.passions, teach: c.teach, learn: c.learn, bio: c.bio,
      team: false, photo: null, visible: c.visible, isNew: true
    };
    state.people.push(person);
    state.me = id;
    state.baseline = {
      members: baseline.members, upcoming: baseline.upcoming, participations: baseline.participations,
      connections: baseline.connections, exchanges: baseline.exchanges
    };
    save();
    emit('person:new', { person: person, remote: false });
    emit('change', { remote: false });
    return { ok: true, person: person };
  };

  api.updateMe = function (profile) {
    var me = api.me();
    if (!me) return { ok: false, error: 'nome' };
    /* Mode live : le profil d'Ewan est celui de data.js, le même sur tous les appareils. */
    if (LIVE && SEED_P[me.id]) return { ok: false, error: 'team' };
    var c = cleanProfile(profile || {}, me);
    if (!c.firstName) return { ok: false, error: 'firstName' };
    me.firstName = c.firstName;
    me.lastName = c.lastName;
    me.role = c.role;
    me.program = c.program;
    me.passions = c.passions;
    me.teach = c.teach;
    me.learn = c.learn;
    me.bio = c.bio;
    me.visible = c.visible;
    save();
    emit('change', { remote: false });
    return { ok: true, person: me };
  };

  api.join = function (actId) {
    var me = api.me();
    var a = api.activity(actId);
    if (!me) return { ok: false, error: 'nome' };
    if (!a) return { ok: false, error: 'notfound' };
    if (has(a.participants, me.id)) return { ok: false, error: 'already' };
    if (api.isPast(a)) return { ok: false, error: 'past' };
    if (api.isFull(a)) return { ok: false, error: 'full' };
    a.participants.push(me.id);
    save();
    emit('join', { activityId: a.id, personId: me.id, remote: false });
    emit('change', { remote: false });
    return { ok: true, activity: a, from: a.participants.length - 1, to: a.participants.length };
  };

  api.leave = function (actId) {
    var me = api.me();
    var a = api.activity(actId);
    if (!me) return { ok: false, error: 'nome' };
    if (!a) return { ok: false, error: 'notfound' };
    if (a.organizerId === me.id) return { ok: false, error: 'organizer' };
    var i = a.participants.indexOf(me.id);
    if (i === -1) return { ok: false, error: 'notin' };
    a.participants.splice(i, 1);
    save();
    emit('leave', { activityId: a.id, personId: me.id, remote: false });
    emit('change', { remote: false });
    return { ok: true, activity: a };
  };

  /* a : { title, cat, passion (id | CUSTOM), customLabel? (si « ✨ Autre chose »),
   *       date (ISO) | when {weekday, time} | day 'AAAA-MM-JJ' + time,
   *       place (obligatoire, ≤ 60), max, level, description, emoji? } */
  api.createActivity = function (a) {
    var me = api.me();
    if (!me) return { ok: false, error: 'nome' };
    a = a || {};
    var title = str(a.title, 60);
    if (!title) return { ok: false, error: 'title' };

    var topic = resolveTopic(a.cat, a.passion, a.customLabel);
    if (topic.error) return { ok: false, error: topic.error };
    var cat = topic.cat, passion = topic.passion;

    var date = null;
    if (a.date) {
      date = new Date(a.date);
    } else if (a.day) {
      var dm = String(a.day).split('-');
      var hm = String(a.time || '18:00').split(':');
      date = new Date(+dm[0], (+dm[1]) - 1, +dm[2], parseInt(hm[0], 10) || 0, parseInt(hm[1], 10) || 0, 0, 0);
    } else if (a.when && a.when.weekday) {
      date = nextOccurrence(a.when.weekday, a.when.time);
    }
    if (!date || isNaN(date.getTime())) return { ok: false, error: 'date' };
    if (date.getTime() <= api.now().getTime()) return { ok: false, error: 'pastDate' };

    var max = parseInt(a.max, 10);
    if (!(max >= 2 && max <= 30)) return { ok: false, error: 'max' };
    var level = has(['tous', 'debutant', 'confirme'], a.level) ? a.level : 'tous';
    /* Le lieu est écrit par l'organisateur : aucun lieu par défaut. */
    var place = str(a.place, 60);
    if (!place) return { ok: false, error: 'place' };

    var act = {
      id: slug(title) + '-' + (LIVE ? uid() : Date.now().toString(36)),
      title: title,
      emoji: str(a.emoji, 16) || (passion && passion.emoji) || cat.emoji,
      cat: cat.id,
      passion: passion ? passion.id : '',
      kind: me.role === 'prof' ? 'atelier' : 'activite',
      when: { weekday: ((date.getDay() + 6) % 7) + 1, time: pad(date.getHours()) + ':' + pad(date.getMinutes()) },
      date: date.toISOString(),
      place: place,
      max: max,
      level: level,
      description: text(a.description, 280),
      organizerId: me.id,
      participants: [me.id],
      createdByMe: true
    };
    if (topic.customLabel) act.customLabel = topic.customLabel;
    state.activities.push(act);
    save();
    emit('activity:new', { activity: act, remote: false });
    emit('change', { remote: false });
    return { ok: true, activity: act };
  };

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  api.cancelActivity = function (actId) {
    var me = api.me();
    var a = api.activity(actId);
    if (!me) return { ok: false, error: 'nome' };
    if (!a) return { ok: false, error: 'notfound' };
    if (a.organizerId !== me.id) return { ok: false, error: 'forbidden' };
    /* Mode live : aucune activité seed (garde-fou si le seed en recevait une un jour). */
    if (LIVE && SEED_A[actId]) return { ok: false, error: 'seed' };
    state.activities = state.activities.filter(function (x) { return x.id !== actId; });
    if (state.messages) state.messages = state.messages.filter(function (m) { return m.activityId !== actId; });
    save();
    emit('change', { remote: false });
    return { ok: true };
  };

  /* « Continuer en tant qu'Ewan » (panel organisateur, mode live) : cet appareil prend le profil du seed (Ewan).
   * Rien n'est créé en local : le profil est celui de data.js, le même sur tous les appareils. sync.js envoie ce
   * profil dans la base (upsert) ; ses participations, messages et activités partent ensuite sous son id. */
  api.linkDevice = function (id) {
    id = id || OWNER;
    var p = id ? api.person(id) : null;
    if (!LIVE || !p || !SEED_P[id]) return { ok: false, error: 'notfound' };
    if (state.me === id) return { ok: true, person: p, already: true };
    var st = api.stats();
    state.me = id;
    state.baseline = {
      members: st.members, upcoming: st.upcoming, participations: st.participations,
      connections: st.connections, exchanges: st.exchanges
    };
    save();
    emit('change', { remote: false });
    return { ok: true, person: p };
  };
  /* « Délier cet appareil » : l'appareil n'est plus Ewan (retour à la Bienvenue). Le profil reste au campus. */
  api.unlinkDevice = function () {
    var me = api.me();
    if (!me || !SEED_P[me.id]) return { ok: false, error: 'notlinked' };
    state.me = null;
    state.baseline = null;
    save();
    emit('change', { remote: false });
    return { ok: true, person: me };
  };

  api.sendRequest = function (personId, msg) {
    var me = api.me();
    var p = api.person(personId);
    if (!me) return { ok: false, error: 'nome' };
    if (!p || p.id === me.id) return { ok: false, error: 'notfound' };
    var created = false;
    if (!api.isConnected(me.id, p.id)) {
      state.connections.push([me.id, p.id]);
      created = true;
    }
    state.sentRequests.push({ to: p.id, msg: text(msg, 500), at: api.now().toISOString() });
    save();
    if (created) emit('connection:new', { a: me.id, b: p.id, remote: false });
    emit('change', { remote: false });
    return { ok: true, created: created };
  };

  /* ---------- Accès internes réservés à sync.js (ne pas utiliser dans app.js) ---------- */
  api._x = {
    live: LIVE,
    key: KEY,
    save: save,
    emit: emit,
    setStatus: setStatus,
    valid: valid,
    cleanProfile: cleanProfile,
    resolveTopic: resolveTopic,
    str: str,
    text: text,
    cut: cut,
    msgMax: MSG_MAX,
    seedMessages: seedMessages,
    /* Remplace l'état en mémoire par celui écrit par un autre onglet (sans le réenregistrer). */
    adopt: function (s) {
      if (!valid(s)) return false;
      if (s.me && !byId(s.people, s.me)) s.me = null;
      state = normalize(s);
      return true;
    },
    onExternal: null // fourni par sync.js en mode live
  };

  CC.store = api;
  api.init();

  /* Un autre onglet de l'app a modifié l'état (reset, inscription…) : on recharge.
   * Sinon cet onglet garderait sa vieille copie en mémoire et l'écraserait à sa prochaine action.
   * Mode live : sync.js peut intégrer l'état de l'autre onglet sans recharger (onExternal). */
  try {
    if (window.addEventListener) {
      window.addEventListener('storage', function (e) {
        if (e.key !== KEY && e.key !== null) return;
        if (LIVE && e.key === KEY && typeof api._x.onExternal === 'function') {
          if (e.newValue === null) return; // reset dans l'autre onglet : le nouvel état suit aussitôt
          var s = null;
          try { s = JSON.parse(e.newValue); } catch (err) { s = null; }
          try { if (s && api._x.onExternal(s)) return; } catch (err) { /* on recharge */ }
        }
        if (LIVE) frozen = true;
        try { window.location.reload(); } catch (err) { /* rien */ }
      });
    }
  } catch (e) { /* rien */ }
})(window.CC);
