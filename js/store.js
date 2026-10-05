/* Campus Connect — état, persistance, affinités, statistiques, actions (CC.store).
 * Script classique, chargé après copy.js et data.js.
 * L'état est copié depuis CC.data au premier lancement (et après reset()),
 * puis enregistré dans localStorage (clé cc_state_v1). Si le stockage est
 * indisponible, l'app tourne quand même : l'état reste en mémoire.
 */
window.CC = window.CC || {};

(function (CC) {
  'use strict';

  var KEY = 'cc_state_v1';
  var VERSION = 1;
  var D = CC.data;
  var state = null;
  var storageOk = true;

  var api = {};

  /* Horloge remplaçable (tests). */
  api.now = function () { return new Date(); };

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

  function seed() {
    var base = api.now();
    return {
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
      seededAt: base.toISOString(),
      baseline: null
    };
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
      return s;
    } catch (e) {
      return null;
    }
  }

  function save() {
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
    }
    return state;
  };

  api.reset = function () {
    try { window.localStorage.removeItem(KEY); } catch (e) { /* stockage indisponible */ }
    state = seed();
    save();
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

  /* « Pour toi » : la passion de l'activité est dans mes passions ou mes « J'apprends ». */
  api.isForMe = function (a) {
    var me = api.me();
    if (!me) return false;
    return has(api.passionIds(me), a.passion) || has(me.learn || [], a.passion);
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
    var id = slug(c.firstName), n = 2;
    while (api.person(id)) id = slug(c.firstName) + '-' + (n++);
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
    return { ok: true, person: person };
  };

  api.updateMe = function (profile) {
    var me = api.me();
    if (!me) return { ok: false, error: 'nome' };
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
    return { ok: true, activity: a };
  };

  /* a : { title, cat, passion, date (ISO) | when {weekday, time} | day 'AAAA-MM-JJ' + time,
   *       place, max, level, description, emoji? } */
  api.createActivity = function (a) {
    var me = api.me();
    if (!me) return { ok: false, error: 'nome' };
    a = a || {};
    var title = str(a.title, 60);
    if (!title) return { ok: false, error: 'title' };

    var passion = api.passion(a.passion);
    var cat = api.category(a.cat) || (passion && api.category(passion.cat));
    if (!cat) return { ok: false, error: 'cat' };
    if (passion && passion.cat !== cat.id) passion = null;
    if (!passion) {
      passion = D.passions.filter(function (p) { return p.cat === cat.id; })[0];
    }

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
    var place = str(a.place, 40) || D.places[0];

    var act = {
      id: slug(title) + '-' + Date.now().toString(36),
      title: title,
      emoji: str(a.emoji, 16) || passion.emoji || cat.emoji,
      cat: cat.id,
      passion: passion.id,
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
    state.activities.push(act);
    save();
    return { ok: true, activity: act };
  };

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  api.cancelActivity = function (actId) {
    var me = api.me();
    var a = api.activity(actId);
    if (!me) return { ok: false, error: 'nome' };
    if (!a) return { ok: false, error: 'notfound' };
    if (a.organizerId !== me.id) return { ok: false, error: 'forbidden' };
    state.activities = state.activities.filter(function (x) { return x.id !== actId; });
    save();
    return { ok: true };
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
    return { ok: true, created: created };
  };

  CC.store = api;
  api.init();

  /* Un autre onglet de l'app a modifié l'état (reset, inscription…) : on recharge.
   * Sinon cet onglet garderait sa vieille copie en mémoire et l'écraserait à sa prochaine action. */
  try {
    if (window.addEventListener) {
      window.addEventListener('storage', function (e) {
        if (e.key !== KEY && e.key !== null) return;
        try { window.location.reload(); } catch (err) { /* rien */ }
      });
    }
  } catch (e) { /* rien */ }
})(window.CC);
