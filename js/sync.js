/* Campus Connect — synchronisation du mode live (SPEC §9). Script classique, chargé après store.js.
 *
 * Mode local (clés vides dans config.js) : ce fichier ne fait rien, aucun appel réseau.
 *
 * Mode live :
 *  - supabase-js v2 (UMD, version épinglée) est chargé à la demande depuis jsDelivr, sans bloquer
 *    l'affichage. S'il ne charge pas, l'app reste utilisable en local et réessaie plus tard.
 *  - L'état affiché = données seed (data.js, identiques pour tous) + copie du distant (R)
 *    + écritures locales pas encore envoyées (file d'attente persistée dans state.sync.outbox).
 *  - Les actions de CC.store écrivent d'abord en local (instantané), puis partent vers Supabase
 *    dans l'ordre ; un échec réseau est réessayé (backoff), y compris après rechargement de la page.
 *  - Le temps réel (postgres_changes sur les 5 tables) met à jour R ; un « diff » avant/après produit
 *    les événements { remote: true }. Ses propres écritures déjà appliquées ne produisent aucun diff :
 *    elles ne sont jamais comptées deux fois.
 *  - Chat d'activité (cc_messages, V1.2) : même principe. Si la table n'existe pas encore (migration
 *    pas exécutée), tout le reste marche : le chat reste local et les messages ne bloquent pas la file.
 *  - Si le temps réel ne passe pas (Wi-Fi d'école qui bloque les WebSockets), on relit la base toutes
 *    les 5 s ; on relit aussi au retour au premier plan (iPhone verrouillé) et toutes les 60 s.
 */
window.CC = window.CC || {};

(function (CC, W) {
  'use strict';

  var S = CC.store;
  CC.sync = { enabled: false };
  if (!S || !S._x || !S._x.live) return; // mode local : rien à faire

  var X = S._x;
  var CFG = X.live;
  var D = CC.data;

  var SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';
  var SDK_SRI = 'sha384-Rj26LVGvoeRVR6+mwQmFfcR3QOBEwT+ZmuCWpuiqeTzJpCs0ER4ITAWGb4Hiy3Ok';

  var T_PEOPLE = 'cc_people', T_ACTS = 'cc_activities', T_PARTS = 'cc_participations', T_CONNS = 'cc_connections';
  var T_MSGS = 'cc_messages';
  var LIMIT = 1000;          // lignes max par table et par lecture (limite par défaut de l'API Supabase)
  var REQ_TIMEOUT = 15000;   // une requête qui traîne est abandonnée
  var POLL_MS = 5000;        // relecture quand le temps réel ne passe pas
  var RT_GRACE_MS = 8000;    // délai avant de passer en relecture périodique
  var RESYNC_MS = 60000;     // relecture de sécurité
  var FLOOD = 12;            // au-delà, une relecture ne produit qu'un « change » (pas un toast par élément)
  var SEP = '\u0001';

  /* ---------- Index des données seed ---------- */

  var SEED_PEOPLE = dict(), SEED_PARTS = dict(), SEED_MSGS = dict();
  D.people.forEach(function (p) { SEED_PEOPLE[p.id] = true; });
  D.activities.forEach(function (a) { SEED_PARTS[a.id] = (a.participants || []).slice(); });
  (D.messages || []).forEach(function (m) { SEED_MSGS[m.id] = true; });

  /* ---------- État interne ---------- */

  var client = null, channel = null;
  var sdkState = 'idle', sdkTries = 0, sdkTimer = null, loadWaiting = false, loadWaited = false;
  var R = null;                         // copie du distant (null tant qu'aucune lecture complète)
  var snapInFlight = false, snapLog = null, snapAgain = false;
  var lastSnapOk = 0, nextSnapAt = 0, snapFails = 0;
  var channelOk = false, channelDownSince = 0;
  var netDown = false;
  var flushing = false, inflightU = null, retryTimer = null, retryDelay = 0;
  var reconcileTimer = null;
  var msgsTable = 'unknown';            // 'ok' | 'missing' (migration-v1.2.sql pas encore exécutée)

  function now() { return Date.now(); }
  function warn(msg, e) { try { console.warn('[Campus Connect · live] ' + msg, e || ''); } catch (x) { /* rien */ } }
  function st() { return S.state; }
  function later(fn, ms) { return W.setTimeout(function () { try { fn(); } catch (e) { warn('erreur interne', e); } }, ms || 0); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function pairKey(a, b) { return a < b ? a + SEP + b : b + SEP + a; }
  function ts(v) { var t = v ? Date.parse(v) : NaN; return isNaN(t) ? 0 : t; }
  function isStr(v, max) { return typeof v === 'string' && v.length > 0 && v.length <= max; }
  /* Index par id : objets SANS prototype. Avec {}, un id « constructor » ou « __proto__ » venu de la base
   * (ouverte en écriture à tous) tomberait sur une propriété héritée et casserait la fusion partout. */
  function dict() { return Object.create(null); }
  /* Ids refusés : noms de propriétés d'Object.prototype (« constructor », « toString », « __proto__ »…). */
  var PROTO = {};
  function isId(v, max) { return isStr(v, max) && !(v in PROTO) && v !== '__proto__' && v !== 'prototype'; }

  function meta() {
    var s = st();
    if (!s.sync || typeof s.sync !== 'object') s.sync = { outbox: [], meAck: null };
    if (!Array.isArray(s.sync.outbox)) s.sync.outbox = [];
    return s.sync;
  }
  function outbox() { return meta().outbox; }

  /* ---------- Statut ---------- */

  function online() { try { return W.navigator.onLine !== false; } catch (e) { return true; } }

  function updateStatus() {
    var s;
    if (!online() || netDown || (!client && (sdkState === 'failed' || sdkTries > 1))) s = 'offline';
    else if (!client || !lastSnapOk) s = 'connecting';
    else if (channelOk || (channelDownSince && now() - channelDownSince > RT_GRACE_MS)) s = 'live';
    else s = 'connecting';
    X.setStatus(s);
  }
  function netOk() {
    snapFails = 0;
    if (netDown) { netDown = false; later(retryNow, 0); } // le réseau est revenu : la file repart tout de suite
    updateStatus();
  }
  function netFail(err) { netDown = true; if (err) warn('réseau indisponible', err.message || err); updateStatus(); }

  /* ---------- Données publiées (ce qui part dans la colonne data) ---------- */

  /* Postgres refuse un JSON avec \u0000 ou une moitié d'emoji (coupée par une troncature) :
   * on nettoie tout ce qui part, sinon l'écriture serait rejetée. */
  function pgSafe(v) {
    if (typeof v === 'string') {
      return v.replace(/\u0000/g, '').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '$1');
    }
    if (Array.isArray(v)) return v.map(pgSafe);
    if (v && typeof v === 'object') {
      var o = {};
      Object.keys(v).forEach(function (k) { o[k] = pgSafe(v[k]); });
      return o;
    }
    return v;
  }

  /* Profil d'Ewan (seed) : envoyé tel quel pour que la base le contienne aussi ; les appareils, eux, gardent
   * toujours celui de data.js (une ligne « ewan » modifiée en base n'est jamais crue). */
  function pubPerson(p) {
    var seed = !!SEED_PEOPLE[p.id];
    return pgSafe({
      id: p.id, firstName: p.firstName, lastName: p.lastName || '', role: p.role, program: p.program || '',
      passions: p.passions || [], teach: p.teach || [], learn: p.learn || [], bio: p.bio || '',
      team: seed && !!p.team, photo: null, visible: p.visible !== false, isNew: !seed
    });
  }
  function pubActivity(a) {
    var o = {
      id: a.id, title: a.title, emoji: a.emoji, cat: a.cat, passion: a.passion || '', kind: a.kind,
      when: a.when, date: a.date, place: a.place, max: a.max, level: a.level,
      description: a.description || '', organizerId: a.organizerId, participants: [a.organizerId]
    };
    if (a.customLabel) o.customLabel = a.customLabel; // activité libre (« ✨ Autre chose »)
    return pgSafe(o);
  }

  /* ---------- Nettoyage de ce qui arrive du distant (la base est ouverte à tous) ---------- */

  function cleanPerson(id, d) {
    if (!isId(id, 80) || !d || typeof d !== 'object' || Array.isArray(d)) return null;
    if (typeof d.firstName !== 'string') return null;
    var c;
    try {
      c = X.cleanProfile({
        firstName: d.firstName, lastName: typeof d.lastName === 'string' ? d.lastName : '',
        role: d.role, program: typeof d.program === 'string' ? d.program : '',
        passions: Array.isArray(d.passions) ? d.passions : [],
        teach: Array.isArray(d.teach) ? d.teach : [], learn: Array.isArray(d.learn) ? d.learn : [],
        bio: typeof d.bio === 'string' ? d.bio : '', visible: d.visible !== false
      });
    } catch (e) { return null; }
    if (!c.firstName) return null;
    return {
      id: id, firstName: c.firstName, lastName: c.lastName, role: c.role, program: c.program,
      passions: c.passions, teach: c.teach, learn: c.learn, bio: c.bio,
      team: false, photo: null, visible: c.visible, isNew: true
    };
  }

  /* Message distant : auteur connu, activité affichée, texte non vide (≤ 300, sans moitié d'emoji). */
  function cleanMessage(id, x, known, actOk) {
    if (!isId(id, 80) || !x || !isId(x.a, 120) || !isId(x.p, 80)) return null;
    if (!actOk[x.a] || !known[x.p]) return null;
    var body = typeof x.body === 'string' ? X.cut(x.body, X.msgMax) : '';
    if (!body) return null;
    var at = typeof x.at === 'number' && x.at > 0 ? x.at : now();
    return { id: id, activityId: x.a, personId: x.p, body: body, at: new Date(at).toISOString(), hidden: !!x.hidden };
  }

  function cleanActivity(id, d, known, me) {
    if (!isId(id, 120) || !d || typeof d !== 'object' || Array.isArray(d)) return null;
    var org = d.organizerId;
    if (!isId(org, 80) || !known[org]) return null;
    var title = X.str(typeof d.title === 'string' ? d.title : '', 60);
    if (!title) return null;
    /* passion de la liste, ou activité libre (customLabel) : même règle que la création locale */
    var topic = X.resolveTopic(d.cat, typeof d.passion === 'string' ? d.passion : '',
      typeof d.customLabel === 'string' ? d.customLabel : '');
    if (topic.error) return null;
    var cat = topic.cat, passion = topic.passion;
    var date = new Date(typeof d.date === 'string' ? d.date : NaN);
    if (isNaN(date.getTime())) return null;
    var max = parseInt(d.max, 10);
    if (!(max >= 2)) max = 2;
    if (max > 30) max = 30;
    var level = ['tous', 'debutant', 'confirme'].indexOf(d.level) !== -1 ? d.level : 'tous';
    var a = {
      id: id, title: title,
      emoji: X.str(typeof d.emoji === 'string' ? d.emoji : '', 16) || (passion && passion.emoji) || cat.emoji,
      cat: cat.id, passion: passion ? passion.id : '',
      kind: d.kind === 'atelier' ? 'atelier' : 'activite',
      when: { weekday: ((date.getDay() + 6) % 7) + 1, time: pad(date.getHours()) + ':' + pad(date.getMinutes()) },
      date: date.toISOString(),
      place: X.str(typeof d.place === 'string' ? d.place : '', 60) || 'Lieu à préciser', // jamais un lieu inventé
      max: max, level: level,
      description: X.text(typeof d.description === 'string' ? d.description : '', 280),
      organizerId: org,
      participants: [org]
    };
    if (topic.customLabel) a.customLabel = topic.customLabel;
    if (org === me) a.createdByMe = true;
    return a;
  }

  function sameJSON(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  /* Met à jour un objet existant en place (les vues gardent la même référence). */
  function assign(cur, clean, skip) {
    var changed = false;
    Object.keys(clean).forEach(function (k) {
      if (skip && skip[k]) return;
      if (!sameJSON(cur[k], clean[k])) { cur[k] = clean[k]; changed = true; }
    });
    return changed;
  }
  function setList(arr, list) {
    if (sameJSON(arr, list)) return false;
    arr.length = 0;
    for (var i = 0; i < list.length; i++) arr.push(list[i]);
    return true;
  }

  /* ---------- Copie du distant (R) ---------- */

  /* gone : participations retirées (seule suppression permise à anon), pour qu'un autre onglet en retard ne les ressuscite pas */
  function emptyR() { return { people: dict(), acts: dict(), parts: dict(), conns: dict(), msgs: dict(), gone: dict(), complete: true }; }

  /* ev = { table, type: 'INSERT'|'UPDATE'|'DELETE', row } */
  /* L'heure du serveur (created_at) fait foi pour l'ordre d'arrivée : même ordre sur tous les appareils.
   * Sans elle (accusé de réception local), on garde l'heure déjà connue ou l'heure locale. */
  function applyEv(r, ev) {
    var row = ev.row || {};
    var srv = ts(row.created_at);
    var cur;
    function at(c) { return srv || (c ? c.at : now()); }
    if (ev.table === T_PEOPLE) {
      if (!isId(row.id, 80)) return;
      if (ev.type === 'DELETE') { delete r.people[row.id]; return; }
      cur = r.people[row.id];
      r.people[row.id] = { data: row.data !== undefined ? row.data : (cur ? cur.data : null), at: at(cur) };
    } else if (ev.table === T_ACTS) {
      if (!isId(row.id, 120)) return;
      if (ev.type === 'DELETE') { delete r.acts[row.id]; return; }
      cur = r.acts[row.id];
      r.acts[row.id] = {
        data: row.data !== undefined ? row.data : (cur ? cur.data : null),
        cancelled: row.cancelled !== undefined ? !!row.cancelled : (cur ? cur.cancelled : false),
        at: at(cur)
      };
    } else if (ev.table === T_PARTS) {
      if (!isId(row.activity_id, 120) || !isId(row.person_id, 80)) return;
      var k = row.activity_id + SEP + row.person_id;
      if (ev.type === 'DELETE') { delete r.parts[k]; if (r.gone) r.gone[k] = true; return; }
      if (r.gone) delete r.gone[k];
      r.parts[k] = { a: row.activity_id, p: row.person_id, at: at(r.parts[k]), srv: !!srv || !!(r.parts[k] && r.parts[k].srv) };
    } else if (ev.table === T_CONNS) {
      if (!isId(row.a, 80) || !isId(row.b, 80) || row.a === row.b) return;
      var ck = pairKey(row.a, row.b);
      if (ev.type === 'DELETE') { delete r.conns[ck]; return; }
      r.conns[ck] = { a: row.a, b: row.b, at: at(r.conns[ck]) };
    } else if (ev.table === T_MSGS) {
      if (!isId(row.id, 80)) return;
      if (ev.type === 'DELETE') { delete r.msgs[row.id]; return; }
      cur = r.msgs[row.id];
      if (!cur && row.activity_id === undefined) return; // masquage d'un message inconnu ici : la relecture suivante l'apportera
      r.msgs[row.id] = {
        a: row.activity_id !== undefined ? row.activity_id : cur.a,
        p: row.person_id !== undefined ? row.person_id : cur.p,
        body: row.body !== undefined ? row.body : cur.body,
        hidden: row.hidden !== undefined ? !!row.hidden : (cur ? cur.hidden : false),
        /* mon message accusé sans heure serveur : on garde l'heure d'envoi (pas celle de l'accusé) */
        at: srv || (cur ? cur.at : (typeof row._at === 'number' ? row._at : now()))
      };
    }
  }

  function applyToR(ev) {
    if (snapInFlight && snapLog) snapLog.push(ev);
    if (R) applyEv(R, ev);
  }

  /* Tri par heure d'arrivée, puis par clé : identique sur tous les appareils. */
  function sortedIdsByAt(obj) {
    return Object.keys(obj).sort(function (x, y) { return (obj[x].at - obj[y].at) || (x < y ? -1 : 1); });
  }
  function sortedByAt(obj) {
    return sortedIdsByAt(obj).map(function (k) { return obj[k]; });
  }

  /* ---------- Fusion : état = seed + distant + écritures en attente ---------- */

  function index(s) {
    var ix = { people: dict(), acts: dict(), parts: dict(), conns: dict(), msgs: dict() };
    s.people.forEach(function (p) { ix.people[p.id] = p; });
    s.activities.forEach(function (a) {
      ix.acts[a.id] = a;
      (a.participants || []).forEach(function (pid) { ix.parts[a.id + SEP + pid] = [a.id, pid]; });
    });
    s.connections.forEach(function (c) { ix.conns[pairKey(c[0], c[1])] = c; });
    /* hidden copié : l'objet message est modifié en place pendant la fusion */
    (s.messages || []).forEach(function (m) { ix.msgs[m.id] = { m: m, hidden: !!m.hidden }; });
    return ix;
  }

  function diffEvents(b, a, me, allowMe) {
    var out = [];
    Object.keys(a.people).forEach(function (id) {
      if (!b.people[id] && (allowMe || id !== me)) out.push(['person:new', { person: a.people[id], remote: true }]);
    });
    Object.keys(a.acts).forEach(function (id) {
      if (!b.acts[id] && (allowMe || a.acts[id].organizerId !== me)) out.push(['activity:new', { activity: a.acts[id], remote: true }]);
    });
    Object.keys(a.parts).forEach(function (k) {
      if (b.parts[k]) return;
      var ap = a.parts[k], act = a.acts[ap[0]];
      if (!allowMe && ap[1] === me) return;
      if (!b.acts[ap[0]] && act && act.organizerId === ap[1]) return; // l'organisateur d'une nouvelle activité
      out.push(['join', { activityId: ap[0], personId: ap[1], remote: true }]);
    });
    Object.keys(b.parts).forEach(function (k) {
      if (a.parts[k]) return;
      var bp = b.parts[k];
      if (!a.acts[bp[0]]) return; // activité annulée : pas de « leave »
      if (!allowMe && bp[1] === me) return;
      out.push(['leave', { activityId: bp[0], personId: bp[1], remote: true }]);
    });
    Object.keys(a.conns).forEach(function (k) {
      if (b.conns[k]) return;
      var c = a.conns[k];
      if (!allowMe && c[0] === me) return;
      out.push(['connection:new', { a: c[0], b: c[1], remote: true }]);
    });
    Object.keys(a.msgs).forEach(function (id) {
      var x = a.msgs[id], m = x.m;
      if (!b.msgs[id]) {
        if (!x.hidden && (allowMe || m.personId !== me)) out.push(['message:new', { message: m, remote: true }]);
      } else if (x.hidden && !b.msgs[id].hidden) {
        out.push(['message:hidden', { id: id, activityId: m.activityId, remote: true }]);
      }
    });
    var removed = Object.keys(b.people).some(function (id) { return !a.people[id]; }) ||
      Object.keys(b.acts).some(function (id) { return !a.acts[id]; }) ||
      Object.keys(b.conns).some(function (k) { return !a.conns[k]; }) ||
      Object.keys(b.parts).some(function (k) { return !a.parts[k]; }) ||
      Object.keys(b.msgs).some(function (id) { return !a.msgs[id]; });
    return { events: out, removed: removed };
  }

  /* mode : 'initial' (aucun toast), 'resync' / 'poll' (toasts si peu nombreux), 'realtime' (toasts). */
  function reconcile(mode, snapStartedAt) {
    if (!R) return;
    var s = st();
    var me = s.me;
    var sm = meta();
    var pending = outbox();

    /* La base a été remise à zéro (cc_reset) : mon profil, confirmé avant cette lecture, a disparu.
     * Inscrit : on remet l'appareil à zéro aussi (sinon il resterait connecté mais invisible pour les autres).
     * Ewan (profil du seed, relié depuis le panel) : il reste Ewan, son profil repart simplement dans la base. */
    if (me && snapStartedAt && R.complete && !R.people[me] && sm.meAck && sm.meAck.id === me &&
        sm.meAck.at < snapStartedAt && !pending.some(function (o) { return o.t === 'person' && o.id === me; }) && SEED_PEOPLE[me]) {
      sm.meAck = null;
      enqueue({ t: 'person', id: me });
    } else if (me && snapStartedAt && R.complete && !R.people[me] && sm.meAck && sm.meAck.id === me &&
        sm.meAck.at < snapStartedAt && !pending.some(function (o) { return o.t === 'person' && o.id === me; })) {
      warn('la base partagée a été remise à zéro : cet appareil repart de zéro');
      origReset.call(S);
      reconcile('initial');
      /* remote:true : l'app distingue ce reset venu de la base (toast d'explication) des 5 clics sur le logo */
      X.emit('change', { remote: true, reset: true });
      return;
    }

    var before = index(s);
    var dataChanged = false;

    /* Personnes : seed, puis distant (ordre d'arrivée), puis moi si pas encore envoyé. */
    var oldP = dict();
    s.people.forEach(function (p) { oldP[p.id] = p; });
    var people = [], known = dict();
    s.people.forEach(function (p) { if (SEED_PEOPLE[p.id]) { people.push(p); known[p.id] = true; } });
    sortedIdsByAt(R.people).forEach(function (id) {
      if (SEED_PEOPLE[id] || known[id]) return;
      if (id === me && oldP[me]) { people.push(oldP[me]); known[id] = true; return; } // mon profil local fait foi
      var clean = cleanPerson(id, R.people[id].data);
      if (!clean) return;
      var cur = oldP[id];
      if (cur) { if (assign(cur, clean, { isNew: true })) dataChanged = true; people.push(cur); }
      else people.push(clean);
      known[id] = true;
    });
    if (me && oldP[me] && !known[me]) { people.push(oldP[me]); known[me] = true; }

    /* Activités : seed, puis distant non annulé, puis créations en attente. */
    var oldA = dict();
    s.activities.forEach(function (a) { oldA[a.id] = a; });
    var pendAct = dict();
    pending.forEach(function (o) { if (o.t === 'act' && o.id) pendAct[o.id] = o; });
    var acts = [], seenA = dict();
    s.activities.forEach(function (a) { if (SEED_PARTS[a.id]) { acts.push(a); seenA[a.id] = true; } });
    function addAct(id, data, cancelled) {
      if (seenA[id] || SEED_PARTS[id]) return;
      seenA[id] = true;
      if (cancelled) return;
      var clean = cleanActivity(id, data, known, me);
      if (!clean) return;
      var cur = oldA[id];
      if (cur) {
        if (assign(cur, clean, { participants: true })) dataChanged = true;
        if (!cur.participants) cur.participants = [];
        acts.push(cur);
      } else acts.push(clean);
    }
    sortedIdsByAt(R.acts).forEach(function (id) {
      var p = pendAct[id], r = R.acts[id];
      addAct(id, p ? p.data : r.data, p ? !!p.cancelled : r.cancelled);
    });
    Object.keys(pendAct).forEach(function (id) { addAct(id, pendAct[id].data, !!pendAct[id].cancelled); });

    /* Participants : seed (ou organisateur), puis distant, puis rejoindre / quitter en attente. */
    var lists = dict();
    acts.forEach(function (a) { lists[a.id] = SEED_PARTS[a.id] ? SEED_PARTS[a.id].slice() : [a.organizerId]; });
    sortedByAt(R.parts).forEach(function (x) {
      var l = lists[x.a];
      if (l && known[x.p] && l.indexOf(x.p) === -1) l.push(x.p);
    });
    pending.forEach(function (o) {
      var l = lists[o.a];
      if (!l) return;
      var i = l.indexOf(o.p);
      if (o.t === 'join' && i === -1 && known[o.p]) l.push(o.p);
      if (o.t === 'leave' && i !== -1 && SEED_PARTS[o.a] && SEED_PARTS[o.a].indexOf(o.p) !== -1) return;
      if (o.t === 'leave' && i !== -1) l.splice(i, 1);
    });
    /* Places limitées : si plusieurs téléphones ont pris la dernière place en même temps, les premiers
     * arrivés sur le serveur gardent leur place (même résultat sur tous les appareils). */
    var bumped = [];
    acts.forEach(function (a) {
      var l = lists[a.id];
      var max = parseInt(a.max, 10);
      if (max > 0 && l.length > max) {
        var mine = me ? R.parts[a.id + SEP + me] : null;
        if (me && l.indexOf(me) >= max && mine && !mine.srv) {
          // ma place n'a pas encore son heure serveur (écho en route) : on attend avant de trancher
        } else {
          if (me && l.indexOf(me) >= max) bumped.push(a.id);
          l = lists[a.id] = l.slice(0, max);
        }
      }
      if (!a.participants) a.participants = [];
      if (setList(a.participants, l)) dataChanged = true;
    });

    /* Connexions : seed, distant, en attente (sans doublon de paire). */
    var conns = [], ck = dict();
    function addConn(a, b) {
      if (!known[a] || !known[b] || a === b) return;
      var k = pairKey(a, b);
      if (ck[k]) return;
      ck[k] = true;
      conns.push([a, b]);
    }
    (D.connections || []).forEach(function (c) { addConn(c[0], c[1]); });
    sortedByAt(R.conns).forEach(function (c) { addConn(c.a, c.b); });
    pending.forEach(function (o) { if (o.t === 'conn') addConn(o.a, o.b); });

    /* Messages : seed (tels quels, masquage local compris), distant (ordre d'arrivée), envoyés en attente.
     * Un masquage en attente s'applique tout de suite. rcv = arrivée sur cet appareil (non-lus). */
    var oldMsgs = Array.isArray(s.messages) ? s.messages : [];
    var oldM = dict(), msgs = [], seenM = dict(), actOk = dict(), pendHide = dict();
    oldMsgs.forEach(function (m) { if (m && m.id) oldM[m.id] = m; });
    acts.forEach(function (a) { actOk[a.id] = true; });
    pending.forEach(function (o) { if (o.t === 'hide') pendHide[o.id] = true; });
    oldMsgs.forEach(function (m) { if (m && SEED_MSGS[m.id] && !seenM[m.id]) { seenM[m.id] = true; msgs.push(m); } });
    var tRcv = S.now().getTime();
    function addMsg(id, x) {
      if (seenM[id] || SEED_MSGS[id]) return;
      seenM[id] = true;
      var clean = cleanMessage(id, x, known, actOk);
      if (!clean) return;
      if (pendHide[id]) clean.hidden = true;
      var cur = oldM[id];
      if (cur) {
        clean.rcv = cur.rcv;
        if (assign(cur, clean)) dataChanged = true;
        msgs.push(cur);
      } else {
        clean.rcv = tRcv;
        msgs.push(clean);
      }
    }
    sortedIdsByAt(R.msgs).forEach(function (id) { addMsg(id, R.msgs[id]); });
    pending.forEach(function (o) { if (o.t === 'msg') addMsg(o.id, { a: o.a, p: o.p, body: o.body, at: o.at, hidden: false }); });
    /* écrits quand la table cc_messages n'existait pas : ils restent sur cet appareil */
    oldMsgs.forEach(function (m) { if (m && m.localOnly && !seenM[m.id] && actOk[m.activityId]) { seenM[m.id] = true; msgs.push(m); } });

    var orderChanged = !sameJSON(s.people.map(function (p) { return p.id; }), people.map(function (p) { return p.id; })) ||
      !sameJSON(s.activities.map(function (a) { return a.id; }), acts.map(function (a) { return a.id; })) ||
      !sameJSON(s.connections, conns) ||
      !sameJSON(oldMsgs.map(function (m) { return m && m.id; }), msgs.map(function (m) { return m.id; }));
    s.people = people;
    s.activities = acts;
    s.connections = conns;
    s.messages = msgs;

    /* Fusion juste après l'état d'un autre onglet (onExternal) : c'est lui qui émet les événements,
     * et rien n'est réenregistré (sinon les deux onglets se renverraient l'état sans fin). */
    if (mode === 'external') return;
    var after = index(s);
    /* Mur et panel : mes propres actions faites sur un autre appareil relié au même profil (le téléphone
     * d'Ewan) ont aussi leur ligne « À l'instant ». Ailleurs, pas de toast pour mes propres actions. */
    var d = diffEvents(before, after, me, onWall());
    var changed = d.events.length > 0 || d.removed || dataChanged || orderChanged;
    if (!changed) return;
    var loud = mode === 'realtime' || ((mode === 'resync' || mode === 'poll') && d.events.length <= FLOOD);
    if (loud) d.events.forEach(function (e) { X.emit(e[0], e[1]); });

    /* Ma participation arrivée trop tard : je libère la ligne en base et je préviens l'interface. */
    bumped.forEach(function (aid) {
      if (pending.some(function (o) { return o.t === 'leave' && o.a === aid && o.p === me; })) return;
      enqueue({ t: 'leave', a: aid, p: me });
      X.emit('leave', { activityId: aid, personId: me, remote: true, reason: 'full' });
    });
    X.save();
    X.emit('change', { remote: true });
  }

  /* Regroupe les événements arrivés dans la même tâche ; micro-tâche plutôt que minuterie
   * (les minuteries sont ralenties dans un onglet en arrière-plan). */
  function scheduleReconcile() {
    if (reconcileTimer) return;
    reconcileTimer = true;
    Promise.resolve().then(function () {
      reconcileTimer = null;
      try { reconcile('realtime'); } catch (e) { warn('fusion impossible', e); }
    });
  }

  /* ---------- Lecture complète (photo) ---------- */

  function snapshot(mode) {
    if (!client) return;
    if (snapInFlight) { snapAgain = true; return; }
    snapInFlight = true;
    snapLog = [];
    var started = now();
    var q = [
      client.from(T_PEOPLE).select('id,data,created_at').order('created_at', { ascending: true }).limit(LIMIT),
      client.from(T_ACTS).select('id,data,cancelled,created_at').order('created_at', { ascending: true }).limit(LIMIT),
      client.from(T_PARTS).select('activity_id,person_id,created_at').order('created_at', { ascending: true }).limit(LIMIT),
      client.from(T_CONNS).select('a,b,created_at').order('created_at', { ascending: true }).limit(LIMIT),
      /* les plus récents d'abord : au-delà de la limite, ce sont les plus anciens qui manquent */
      client.from(T_MSGS).select('id,activity_id,person_id,body,hidden,created_at').order('created_at', { ascending: false }).limit(LIMIT)
    ];
    Promise.all(q.map(function (x) { return Promise.resolve(x).then(null, function (e) { return { error: e || {} }; }); }))
      .then(function (res) {
        snapInFlight = false;
        var log = snapLog || [];
        snapLog = null;
        /* Le chat ne fait jamais échouer la relecture : sans table cc_messages, le reste de l'app marche. */
        var mres = res.pop();
        var bad = null;
        res.forEach(function (r) { if (!bad && (!r || r.error || !Array.isArray(r.data))) bad = (r && r.error) || { message: 'réponse vide' }; });
        if (bad) {
          snapFails++;
          nextSnapAt = now() + Math.min(30000, 2000 * Math.pow(2, Math.min(snapFails - 1, 4)));
          netFail(bad);
        } else {
          var first = !R;
          var nr = emptyR();
          var tables = [T_PEOPLE, T_ACTS, T_PARTS, T_CONNS];
          res.forEach(function (r, i) {
            if (r.data.length >= LIMIT) nr.complete = false;
            r.data.forEach(function (row) { applyEv(nr, { table: tables[i], type: 'INSERT', row: row }); });
          });
          if (mres && !mres.error && Array.isArray(mres.data)) {
            mres.data.forEach(function (row) { applyEv(nr, { table: T_MSGS, type: 'INSERT', row: row }); });
            setMsgsTable('ok');
          } else {
            if (tableMissing(mres)) setMsgsTable('missing');
            else warn('messages illisibles pour le moment', mres && mres.error);
            if (R) nr.msgs = R.msgs; // on garde ceux déjà connus
          }
          log.forEach(function (ev) { applyEv(nr, ev); });
          R = nr;
          lastSnapOk = now();
          nextSnapAt = 0;
          netOk();
          /* Profil jamais confirmé par la base (inscrit, ou Ewan relié depuis le panel) : on l'envoie s'il n'y est pas. */
          if (!meta().meAck && st().me && !outbox().some(function (o) { return o.t === 'person'; })) {
            if (R.people[st().me]) meta().meAck = { id: st().me, at: started - 1 };
            else enqueue({ t: 'person', id: st().me }); // profil jamais envoyé : on l'envoie
          }
          reconcile(first ? 'initial' : (mode === 'poll' ? 'poll' : 'resync'), started);
          retryNow();
        }
        if (snapAgain) { snapAgain = false; later(function () { snapshot('resync'); }, 0); }
      });
  }

  /* ---------- File d'envoi ---------- */

  var opSeq = 0;
  function enqueue(op) {
    var ob = outbox();
    if (op.t === 'person' && ob.some(function (o) { return o.t === 'person' && o.id === op.id && o.u !== inflightU; })) {
      flushSoon();
      return; // un envoi du profil est déjà prévu : il lira la version la plus récente
    }
    op.u = now().toString(36) + '-' + (++opSeq) + '-' + Math.random().toString(36).slice(2, 6);
    ob.push(op);
    X.save();
    flushSoon();
  }

  function removeOp(u) {
    var ob = outbox();
    for (var i = 0; i < ob.length; i++) if (ob[i].u === u) { ob.splice(i, 1); return; }
  }

  function flushSoon() {
    Promise.resolve().then(function () { try { flush(); } catch (e) { warn('envoi impossible', e); } });
  }

  function classify(res) {
    if (!res || typeof res !== 'object') return 'retry';
    var e = res.error;
    if (!e) return 'ok';
    var code = String(e.code || '');
    var status = res.status || 0;
    if (code === '23505') return 'ok';                 // déjà enregistré : l'écriture est idempotente
    if (code === '42501') return 'drop';               // refusé par les règles de sécurité
    if (!status || status >= 500 || status === 408 || status === 429) return 'retry';
    if (/^PGRST/.test(code) || status === 401 || status === 403 || status === 404) return 'retry'; // configuration (table absente…)
    if (/^(08|40|53|57)/.test(code)) return 'retry';
    return 'drop';                                     // donnée refusée (contrainte) : inutile d'insister
  }

  function send(op) {
    var q;
    if (op.t === 'person') {
      var me = S.me();
      if (!me || me.id !== op.id) return Promise.resolve('drop');
      op.data = pubPerson(me);
      q = client.from(T_PEOPLE).upsert({ id: me.id, data: op.data }, { onConflict: 'id' });
    } else if (op.t === 'act') {
      q = client.from(T_ACTS).upsert({ id: op.id, data: op.data, cancelled: !!op.cancelled }, { onConflict: 'id' });
    } else if (op.t === 'join') {
      q = client.from(T_PARTS).upsert({ activity_id: op.a, person_id: op.p }, { onConflict: 'activity_id,person_id', ignoreDuplicates: true });
    } else if (op.t === 'leave') {
      q = client.from(T_PARTS)['delete']().eq('activity_id', op.a).eq('person_id', op.p);
    } else if (op.t === 'conn') {
      q = client.from(T_CONNS).insert({ a: op.a, b: op.b }); // le message reste sur l'appareil (V2 : vraie messagerie)
    } else if (op.t === 'msg') {
      q = client.from(T_MSGS).insert({ id: op.id, activity_id: op.a, person_id: op.p, body: pgSafe(op.body) });
    } else if (op.t === 'hide') {
      q = client.from(T_MSGS).update({ hidden: true }).eq('id', op.id);
    } else {
      return Promise.resolve('drop');
    }
    return Promise.resolve(q).then(function (res) {
      /* Table du chat absente (migration pas exécutée) : on n'insiste pas, sinon toute la file resterait bloquée. */
      if ((op.t === 'msg' || op.t === 'hide') && tableMissing(res)) {
        setMsgsTable('missing');
        if (op.t === 'msg') {
          var lm = S.message(op.id);
          if (lm) { lm.localOnly = true; X.save(); } // gardé sur l'appareil, jamais renvoyé
        }
        warn('message non envoyé : la table cc_messages n\'existe pas encore (supabase/migration-v1.2.sql)');
        return 'drop';
      }
      var c = classify(res);
      if (c === 'drop') warn('écriture refusée par la base, abandonnée', res && res.error);
      if (c === 'retry') netFail(res && res.error);
      return c;
    }, function (e) { netFail(e); return 'retry'; });
  }

  function acked(op) {
    if (op.t === 'person') {
      applyToR({ table: T_PEOPLE, type: 'UPDATE', row: { id: op.id, data: op.data } });
      if (op.id === st().me) meta().meAck = { id: op.id, at: now() };
    } else if (op.t === 'act') {
      applyToR({ table: T_ACTS, type: 'UPDATE', row: { id: op.id, data: op.data, cancelled: !!op.cancelled } });
    } else if (op.t === 'join') {
      applyToR({ table: T_PARTS, type: 'INSERT', row: { activity_id: op.a, person_id: op.p } });
    } else if (op.t === 'leave') {
      applyToR({ table: T_PARTS, type: 'DELETE', row: { activity_id: op.a, person_id: op.p } });
    } else if (op.t === 'conn') {
      applyToR({ table: T_CONNS, type: 'INSERT', row: { a: op.a, b: op.b } });
    } else if (op.t === 'msg') {
      applyToR({ table: T_MSGS, type: 'INSERT', row: { id: op.id, activity_id: op.a, person_id: op.p, body: op.body, _at: op.at } });
    } else if (op.t === 'hide') {
      applyToR({ table: T_MSGS, type: 'UPDATE', row: { id: op.id, hidden: true } });
    }
  }

  function flush() {
    if (flushing || !client || retryTimer) return;
    var ob = outbox();
    if (!ob.length) return;
    var op = ob[0];
    if (!op.u) op.u = 'x' + (++opSeq);
    flushing = true;
    inflightU = op.u;
    var p;
    try { p = send(op); } catch (e) { netFail(e); p = Promise.resolve('retry'); }
    p.then(function (r) {
      flushing = false;
      inflightU = null;
      if (r === 'ok' || r === 'drop') {
        removeOp(op.u);
        if (r === 'ok') { acked(op); netOk(); }
        X.save();
        retryDelay = 0;
        flush();
      } else {
        retryDelay = Math.min(30000, retryDelay ? retryDelay * 2 : 1000);
        retryTimer = later(function () { retryTimer = null; flush(); }, retryDelay);
      }
    }, function (e) {
      flushing = false;
      inflightU = null;
      warn('envoi impossible', e);
    });
  }

  function retryNow() {
    if (retryTimer) { W.clearTimeout(retryTimer); retryTimer = null; }
    retryDelay = 0;
    flush();
  }

  /* ---------- Temps réel ---------- */

  function onRealtime(payload) {
    try {
      if (!payload) return;
      var type = payload.eventType;
      var row = type === 'DELETE' ? payload.old : payload['new'];
      applyToR({ table: payload.table, type: type, row: row || {} });
      if (R) scheduleReconcile();
    } catch (e) { warn('événement temps réel ignoré', e); }
  }

  function subscribe() {
    if (!client) return;
    if (channel) { try { client.removeChannel(channel); } catch (e) { /* rien */ } channel = null; }
    channelOk = false;
    channelDownSince = now();
    var ch;
    try {
      ch = client.channel('cc-live');
      /* Sans table cc_messages, l'abonnement à cette table ferait échouer tout le canal : on s'en passe. */
      [T_PEOPLE, T_ACTS, T_PARTS, T_CONNS].concat(msgsTable === 'missing' ? [] : [T_MSGS]).forEach(function (t) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, onRealtime);
      });
      channel = ch;
      ch.subscribe(function (status) {
        if (ch !== channel) return;
        if (status === 'SUBSCRIBED') {
          channelOk = true;
          channelDownSince = 0;
          snapshot('resync'); // rattrape ce qui a pu passer avant l'abonnement ou pendant une coupure
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          channelOk = false;
          if (!channelDownSince) channelDownSince = now();
        }
        updateStatus();
      });
    } catch (e) {
      warn('temps réel indisponible, relecture périodique', e);
      channel = null;
    }
  }

  /* ---------- Table du chat présente ou non ---------- */

  function tableMissing(res) {
    var e = res && res.error;
    if (!e) return false;
    var code = String(e.code || '');
    return code === 'PGRST205' || code === '42P01' || (res.status === 404 && /^PGRST/.test(code));
  }
  function setMsgsTable(v) {
    if (v === msgsTable) return;
    var prev = msgsTable;
    msgsTable = v;
    if (v === 'missing') warn('table cc_messages absente : le chat reste sur cet appareil. Exécute supabase/migration-v1.2.sql.');
    /* réabonnement sans (ou de nouveau avec) la table des messages */
    if (client && (v === 'missing' || prev === 'missing')) subscribe();
  }

  /* ---------- Démarrage ---------- */

  function timedFetch(input, init) {
    if (typeof W.AbortController !== 'function') return W.fetch(input, init);
    var ctrl = new W.AbortController();
    var o = {};
    init = init || {};
    Object.keys(init).forEach(function (k) { o[k] = init[k]; });
    if (init.signal) {
      if (init.signal.aborted) ctrl.abort();
      else if (init.signal.addEventListener) init.signal.addEventListener('abort', function () { ctrl.abort(); });
    }
    o.signal = ctrl.signal;
    var t = W.setTimeout(function () { ctrl.abort(); }, REQ_TIMEOUT);
    return W.fetch(input, o).then(function (r) { W.clearTimeout(t); return r; }, function (e) { W.clearTimeout(t); throw e; });
  }

  function start() {
    if (client) return;
    try {
      client = W.supabase.createClient(CFG.url, CFG.key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: timedFetch },
        realtime: { params: { eventsPerSecond: 20 } }
      });
    } catch (e) {
      client = null;
      sdkState = 'failed';
      warn('client Supabase impossible à créer', e);
      updateStatus();
      return;
    }
    sdkState = 'ready';
    updateStatus();
    snapshot('initial');
    subscribe();
    flush();
  }

  function loadSdk() {
    if (client) return;
    if (W.supabase && typeof W.supabase.createClient === 'function') { start(); return; }
    if (sdkState === 'loading') return;
    var doc = W.document;
    if (!doc || !doc.createElement) { sdkState = 'failed'; updateStatus(); return; }
    if (doc.readyState && doc.readyState !== 'complete' && !loadWaited) {
      if (!loadWaiting) {
        loadWaiting = true;
        var go = function () { if (loadWaited) return; loadWaited = true; later(loadSdk, 0); };
        try { W.addEventListener('load', go); } catch (e) { /* rien */ }
        later(go, 4000); // filet : on n'attend pas plus
      }
      return;
    }
    sdkState = 'loading';
    sdkTries++;
    var done = false;
    var el = doc.createElement('script');
    var to = null;
    function finish(ok) {
      if (done) return;
      done = true;
      if (to) W.clearTimeout(to);
      if (ok && W.supabase && typeof W.supabase.createClient === 'function') { start(); return; }
      sdkState = 'failed';
      try { if (el.parentNode) el.parentNode.removeChild(el); } catch (e) { /* rien */ }
      updateStatus();
      if (sdkTimer) W.clearTimeout(sdkTimer);
      sdkTimer = later(function () { sdkTimer = null; loadSdk(); }, Math.min(30000, 5000 * sdkTries));
    }
    el.src = SDK_URL;
    el.async = true;
    el.crossOrigin = 'anonymous';
    el.integrity = SDK_SRI;
    el.onload = function () { finish(true); };
    el.onerror = function () { finish(false); };
    to = later(function () { finish(false); }, 20000);
    try { (doc.head || doc.documentElement).appendChild(el); } catch (e) { finish(false); }
  }

  function preconnect() {
    try {
      var l = W.document.createElement('link');
      l.rel = 'preconnect';
      l.href = CFG.url;
      l.crossOrigin = 'anonymous';
      W.document.head.appendChild(l);
    } catch (e) { /* rien */ }
  }

  /* Tic de surveillance : relectures, repli sans temps réel, réessais. */
  function tick() {
    if (!client) { if (sdkState === 'failed' && !sdkTimer && online()) loadSdk(); updateStatus(); return; }
    var t = now();
    if (!snapInFlight && t >= nextSnapAt) {
      if (!lastSnapOk || netDown) snapshot('resync');
      else if (!channelOk && channelDownSince && t - channelDownSince > RT_GRACE_MS && t - lastSnapOk >= POLL_MS) snapshot('poll');
      else if (t - lastSnapOk >= RESYNC_MS) snapshot('resync');
    }
    if (outbox().length && !flushing && !retryTimer) flush();
    updateStatus();
  }

  /* Retour au premier plan (iPhone déverrouillé, onglet réaffiché) : on rattrape tout de suite. */
  function wake() {
    if (!client) { loadSdk(); return; }
    if (!snapInFlight && now() - lastSnapOk > 3000) snapshot('resync');
    retryNow();
  }

  /* ---------- Branchement sur les actions du store ---------- */

  function wrap(name, after) {
    var orig = S[name];
    if (typeof orig !== 'function') return;
    S[name] = function () {
      var args = arguments;
      var pre = name === 'cancelActivity' ? S.activity(args[0]) : null;
      var preData = pre ? pubActivity(pre) : null;
      var r = orig.apply(S, args);
      try { if (r && r.ok) after(r, args, preData); } catch (e) { warn('mise en file impossible', e); }
      return r;
    };
  }

  wrap('register', function (r) { enqueue({ t: 'person', id: r.person.id }); });
  wrap('updateMe', function (r) { enqueue({ t: 'person', id: r.person.id }); });
  wrap('join', function (r) { enqueue({ t: 'join', a: r.activity.id, p: st().me }); });
  wrap('leave', function (r) { enqueue({ t: 'leave', a: r.activity.id, p: st().me }); });
  wrap('createActivity', function (r) {
    enqueue({ t: 'act', id: r.activity.id, data: pubActivity(r.activity), cancelled: false });
    enqueue({ t: 'join', a: r.activity.id, p: r.activity.organizerId });
  });
  wrap('cancelActivity', function (r, args, preData) {
    if (preData) enqueue({ t: 'act', id: preData.id, data: preData, cancelled: true });
  });
  wrap('sendRequest', function (r, args) {
    if (r.created) enqueue({ t: 'conn', a: st().me, b: args[0] });
  });
  wrap('sendMessage', function (r) {
    var m = r.message;
    enqueue({ t: 'msg', id: m.id, a: m.activityId, p: m.personId, body: m.body, at: Date.parse(m.at) });
  });
  wrap('hideMessage', function (r) {
    if (!r.already && !SEED_MSGS[r.message.id]) enqueue({ t: 'hide', id: r.message.id }); // seed : masquage local
  });
  /* « Continuer en tant qu'Ewan » : son profil (seed, le même partout) part aussitôt dans la base, pour qu'elle
   * contienne toutes les personnes qui agissent. Ses participations, messages et activités suivent sous son id. */
  wrap('linkDevice', function (r) {
    if (r.already) return;
    meta().meAck = null; // l'ancien accusé (profil inscrit avant) ne vaut plus pour cette identité
    enqueue({ t: 'person', id: r.person.id });
  });
  wrap('unlinkDevice', function () {
    meta().meAck = null;
    X.save();
  });

  /* reset() : l'appareil repart du seed (moi = personne), puis on y remet les données partagées. */
  var origReset = S.reset;
  S.reset = function () {
    var r = origReset.apply(S, arguments);
    try { if (R) reconcile('initial'); } catch (e) { warn('fusion après reset', e); }
    return r;
  };

  /* L'état enregistré par l'autre onglet contient ce qu'il tient de la base (accusés de réception, temps réel)
   * et que notre copie R n'a peut-être pas encore reçu : ça y entre comme provisoire, l'écho du temps réel
   * ou la relecture le confirmeront. Sans ça, la fusion qui suit l'effacerait, puis l'écho le referait
   * apparaître (clignotement, ligne en double dans le fil du mur). Les écritures en attente restent à la file. */
  function absorb(s) {
    if (!R) return;
    var pend = dict(), seedConns = dict();
    outbox().forEach(function (o) {
      if (o.t === 'person' || o.t === 'act' || o.t === 'msg' || o.t === 'hide') pend[o.t + SEP + o.id] = true;
      else if (o.t === 'join' || o.t === 'leave') pend['part' + SEP + o.a + SEP + o.p] = true;
      else if (o.t === 'conn') pend['conn' + SEP + pairKey(o.a, o.b)] = true;
    });
    (D.connections || []).forEach(function (c) { seedConns[pairKey(c[0], c[1])] = true; });
    var gone = R.gone || dict();
    (s.people || []).forEach(function (p) {
      if (!p || !isId(p.id, 80) || SEED_PEOPLE[p.id] || p.id === s.me || R.people[p.id] || pend['person' + SEP + p.id]) return;
      applyToR({ table: T_PEOPLE, type: 'INSERT', row: { id: p.id, data: pubPerson(p) } });
    });
    (s.activities || []).forEach(function (a) {
      if (!a || !isId(a.id, 120)) return;
      if (!SEED_PARTS[a.id] && !R.acts[a.id] && !pend['act' + SEP + a.id]) {
        applyToR({ table: T_ACTS, type: 'INSERT', row: { id: a.id, data: pubActivity(a), cancelled: false } });
      }
      var seedL = SEED_PARTS[a.id];
      (a.participants || []).forEach(function (pid) {
        if (seedL ? seedL.indexOf(pid) !== -1 : pid === a.organizerId) return;
        var k = a.id + SEP + pid;
        if (R.parts[k] || gone[k] || pend['part' + SEP + k]) return;
        applyToR({ table: T_PARTS, type: 'INSERT', row: { activity_id: a.id, person_id: pid } });
      });
    });
    (s.connections || []).forEach(function (c) {
      if (!c) return;
      var k = pairKey(c[0], c[1]);
      if (seedConns[k] || R.conns[k] || pend['conn' + SEP + k]) return;
      applyToR({ table: T_CONNS, type: 'INSERT', row: { a: c[0], b: c[1] } });
    });
    if (msgsTable !== 'missing') {
      (s.messages || []).forEach(function (m) {
        if (!m || !isId(m.id, 80) || SEED_MSGS[m.id] || m.localOnly || R.msgs[m.id] || pend['msg' + SEP + m.id]) return;
        applyToR({ table: T_MSGS, type: 'INSERT', row: { id: m.id, activity_id: m.activityId, person_id: m.personId, body: m.body, hidden: !!m.hidden, _at: ts(m.at) || now() } });
      });
    }
  }

  /* Un autre onglet du même appareil a enregistré l'état (store.js nous le passe). */
  /* Mur et panel organisateur : ils suivent l'autre onglet sans recharger (le flux du panel reste en place). */
  function onWall() { try { return /^#\/(live|admin)(\/|$|\?)/.test(W.location.hash || ''); } catch (e) { return false; } }
  X.onExternal = function (s) {
    var cur = st();
    var identity = s.me !== cur.me || s.seededAt !== cur.seededAt;
    if (identity && !onWall()) return false; // changement d'identité dans une vue de l'app : rechargement (V1)
    var before = index(cur);
    if (!X.adopt(s)) return false;
    /* L'autre onglet a pu enregistrer juste avant de recevoir ce que celui-ci tient déjà du temps réel
     * (deux inscriptions au même moment) : on refusionne avec notre copie distante, sinon une personne
     * déjà reçue disparaîtrait jusqu'au prochain événement (ou à la relecture de 60 s). */
    if (R) {
      try { absorb(st()); reconcile('external'); } catch (e) { warn('fusion avec l\'autre onglet impossible', e); }
    }
    var after = index(st());
    var d = diffEvents(before, after, st().me, true);
    if (d.events.length <= FLOOD) d.events.forEach(function (e) { X.emit(e[0], e[1]); });
    X.emit('change', { remote: true, reset: identity && !st().me });
    return true;
  };

  /* ---------- Exposé (debug, tests, petits indicateurs) ---------- */

  CC.sync = {
    enabled: true,
    status: function () { return S.syncStatus(); },
    pending: function () { return outbox().length; },
    /* lecture seule (panel organisateur, section Profils) : heure d'arrivée d'un profil dans la base */
    joinedAt: function (id) { var c = R && R.people && R.people[id]; return c && typeof c.at === 'number' ? c.at : 0; },
    resync: function () { snapshot('resync'); },
    flush: retryNow,
    _debug: function () {
      return {
        sdk: sdkState, client: !!client, channelOk: channelOk, netDown: netDown, lastSnapOk: lastSnapOk,
        remote: R ? { people: Object.keys(R.people).length, activities: Object.keys(R.acts).length,
          participations: Object.keys(R.parts).length, connections: Object.keys(R.conns).length,
          messages: Object.keys(R.msgs).length } : null,
        messagesTable: msgsTable,
        outbox: clone(outbox())
      };
    }
  };

  try {
    W.addEventListener('online', function () { netDown = false; updateStatus(); wake(); });
    W.addEventListener('offline', function () { updateStatus(); });
    W.addEventListener('pageshow', function (e) { if (e && e.persisted) wake(); });
    if (W.document && W.document.addEventListener) {
      W.document.addEventListener('visibilitychange', function () { if (W.document.visibilityState === 'visible') wake(); });
    }
  } catch (e) { /* rien */ }

  var iv = W.setInterval(function () { try { tick(); } catch (e) { warn('erreur interne', e); } }, 2000);
  if (iv && iv.unref) iv.unref();

  if (!(W.supabase && W.supabase.__mock)) preconnect();
  updateStatus();
  loadSdk();
})(window.CC, window);
