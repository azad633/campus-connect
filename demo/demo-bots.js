/* Campus Connect — bots de la DÉMO (app/demo/ uniquement, jamais chargé par la version live).
 *
 * 1. Remplit la fausse base locale (mock-supabase.js) avec les données de démo de data.js :
 *    personnes, activités (dates recalées sur les 7 prochains jours), participations, discussions, contacts.
 * 2. Fait vivre des bots dans UN seul onglet (élection par localStorage) : inscriptions, participations,
 *    messages dans les discussions, nouvelles activités. L'app les reçoit comme des événements temps réel :
 *    toasts, mur, flux du panel, jauges, chat.
 * Les bots n'agissent jamais au nom de l'appareil courant ni au nom d'Ewan.
 */
(function () {
  'use strict';
  var W = window, CC = W.CC || {}, S = CC.store;
  /* données de démo copiées avant store.js (voir index.html) ; CC.data ne garde qu'Ewan en mode live */
  var D = W.__ccDemoSeed || CC.data;
  if (!D || !S || !W.supabase || !W.supabase.__mock) return;
  var db = W.supabase.createClient('https://demo.invalid', 'demo-key');
  var OWNER = (D.live && D.live.owner) || 'ewan';
  var LEAD_KEY = 'cc_demo_bots_leader', SEED_KEY = 'cc_demo_seeded';
  var me = Math.random().toString(36).slice(2);

  function rnd(n) { return Math.floor(Math.random() * n); }
  function pick(a) { return a[rnd(a.length)]; }
  function ls(k, v) { try { if (v === undefined) return W.localStorage.getItem(k); W.localStorage.setItem(k, v); } catch (e) { return null; } return null; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function iso(ms) { return new Date(ms).toISOString(); }

  /* ---------- 1. Remplissage initial (une seule fois par navigateur, ou après ?reset=1) ---------- */
  function pubPerson(p) {
    return { id: p.id, firstName: p.firstName, lastName: p.lastName || '', role: p.role, program: p.program || '',
      passions: p.passions || [], teach: p.teach || [], learn: p.learn || [], bio: p.bio || '',
      team: false, photo: null, visible: true, isNew: false };
  }
  function seed() {
    if (ls(SEED_KEY)) return Promise.resolve(false);
    ls(SEED_KEY, String(Date.now()));
    var now = Date.now();
    var people = (D.people || []).filter(function (p) { return p.id !== OWNER; });
    var acts = (D.activities || []).map(function (a) {
      var d = S.nextOccurrence(a.when.weekday, a.when.time);
      var o = { id: a.id, title: a.title, emoji: a.emoji, cat: a.cat, passion: a.passion || '', kind: a.kind,
        when: a.when, date: d.toISOString(), place: a.place, max: a.max, level: a.level,
        description: a.description || '', organizerId: a.organizerId, participants: [a.organizerId] };
      return { row: { id: a.id, data: o, cancelled: false }, others: (a.participants || []).filter(function (x) { return x !== a.organizerId; }) };
    });
    var parts = [];
    acts.forEach(function (a) { a.others.forEach(function (p) { parts.push({ activity_id: a.row.id, person_id: p }); }); });
    var msgs = (D.messages || []).map(function (m) {
      return { id: m.id, activity_id: m.activityId, person_id: m.personId, body: m.body, created_at: iso(now - (m.ago || 0) * 60000) };
    });
    var conns = (D.connections || []).map(function (c) { return { a: c[0], b: c[1] }; });
    return db.from('cc_people').upsert(people.map(function (p) { return { id: p.id, data: pubPerson(p) }; }), { onConflict: 'id' })
      .then(function () { return db.from('cc_activities').upsert(acts.map(function (a) { return a.row; }), { onConflict: 'id' }); })
      .then(function () { return parts.length ? db.from('cc_participations').upsert(parts, { onConflict: 'activity_id,person_id', ignoreDuplicates: true }) : null; })
      .then(function () { return msgs.length ? db.from('cc_messages').insert(msgs) : null; })
      .then(function () { return conns.length ? db.from('cc_connections').insert(conns) : null; })
      .then(function () { return true; }, function (e) { try { W.localStorage.removeItem(SEED_KEY); } catch (x) { /* rien */ } throw e; });
  }

  /* ---------- 2. Bots ---------- */
  var NAMES = ['Malik', 'Zoé', 'Nathan', 'Lina', 'Adam', 'Manon', 'Ilyes', 'Clara', 'Noah', 'Jules', 'Maëlys', 'Ayoub',
    'Léna', 'Hugo', 'Sofia', 'Rayan', 'Chloé', 'Enzo', 'Inaya', 'Théo', 'Jade', 'Samy', 'Louise', 'Bilal', 'Nina', 'Tom',
    'Yasmine', 'Mathis', 'Alice', 'Karim', 'Emma', 'Lucas'];
  var BIOS = ['Nouveau sur le campus, chaud pour tout.', 'Je cherche des gens pour bouger le midi.', 'Toujours partant pour un verre après les cours.',
    'Je débute, soyez indulgents 😅', 'Je peux aider en Excel si besoin.', 'Fan de jeux de société et de brunchs.', '', ''];
  var LINES = ['Je viens ! 🙌', 'On se retrouve où exactement ?', "J'arrive un peu en retard, gardez-moi une place", 'Quelqu\'un a du matériel en plus ?',
    'Trop bien, enfin une activité comme ça', 'Je ramène un pote, ça passe ?', 'On peut décaler de 15 min ?', 'Top, à tout à l\'heure 👋',
    'Premier fois pour moi, je suis débutant', 'Je prends des boissons pour tout le monde', 'Quelqu\'un vient du campus à pied ?', 'Chaud ! 🔥'];
  var NEW_ACTS = [
    { title: 'Padel en double', cat: 'sport', passion: 'padel', place: 'Padel club (10 min)', max: 4 },
    { title: 'Apéro de fin de semaine', cat: 'chill', passion: 'apero', custom: 'Apéro', place: 'Bar en face du campus', max: 15 },
    { title: 'Quiz musical au bar', cat: 'chill', passion: 'quiz', custom: 'Blind test', place: 'Bar en face du campus', max: 12 },
    { title: 'Laser tag entre promos', cat: 'jeux', passion: 'laser-tag', custom: 'Laser tag', place: 'Laser Game Evolution', max: 10 },
    { title: 'Run club 5 km', cat: 'sport', passion: 'running', place: 'Parc à côté du campus', max: 15 },
    { title: 'Brunch du dimanche', cat: 'chill', passion: 'brunch', custom: 'Brunch', place: 'Café du centre', max: 8 },
    { title: 'Révisions + café', cat: 'chill', custom: 'Café', place: "Cafét'", max: 6 }
  ];

  function catOk(c) { return (D.categories || []).some(function (x) { return x.id === c; }); }
  function passionOk(id) { return (D.passions || []).some(function (x) { return x.id === id; }); }
  function bots() { return S.people().filter(function (p) { return p.id !== OWNER && (!S.me() || p.id !== S.me().id); }); }

  var n = 0;
  function arrive() {
    var all = (D.passions || []).map(function (p) { return p.id; });
    var mine = []; while (mine.length < 2 + rnd(3)) { var x = pick(all); if (mine.indexOf(x) < 0) mine.push(x); }
    var learn = []; while (learn.length < 1 + rnd(2)) { var l = pick(all); if (mine.indexOf(l) < 0 && learn.indexOf(l) < 0) learn.push(l); }
    var name = NAMES[(n++ + rnd(NAMES.length)) % NAMES.length];
    var id = 'bot-' + uid();
    var p = { id: id, firstName: name, lastName: String.fromCharCode(65 + rnd(26)) + '.', role: Math.random() < 0.07 ? 'prof' : 'etudiant',
      program: pick(D.programs || ['Bachelor 1']), passions: mine.map(function (m) { return { id: m, level: 1 + rnd(3) }; }),
      teach: mine.slice(0, 1 + rnd(2)), learn: learn, bio: pick(BIOS), team: false, photo: null, visible: true, isNew: true };
    return db.from('cc_people').upsert({ id: id, data: p }, { onConflict: 'id' });
  }
  function join() {
    var who = pick(bots()); if (!who) return arrive();
    var open = S.upcoming().filter(function (a) { return a.participants.length < a.max && a.participants.indexOf(who.id) < 0; });
    if (!open.length) return arrive();
    open.sort(function (x, y) { return y.participants.length - x.participants.length; });
    var a = Math.random() < 0.55 ? open[rnd(Math.min(4, open.length))] : pick(open);
    return db.from('cc_participations').upsert({ activity_id: a.id, person_id: who.id }, { onConflict: 'activity_id,person_id', ignoreDuplicates: true });
  }
  function talk() {
    var meId = S.me() && S.me().id;
    var acts = S.upcoming().filter(function (a) { return a.participants.length >= 2; });
    if (!acts.length) return join();
    /* un peu plus souvent dans une activité où je suis : le chat bouge sous mes yeux */
    var mine = meId ? acts.filter(function (a) { return a.participants.indexOf(meId) >= 0; }) : [];
    var a = mine.length && Math.random() < 0.5 ? pick(mine) : pick(acts);
    var who = a.participants.filter(function (p) { return p !== OWNER && p !== meId; });
    if (!who.length) return join();
    return db.from('cc_messages').insert({ id: 'm-bot-' + uid(), activity_id: a.id, person_id: pick(who), body: pick(LINES) });
  }
  function create() {
    var who = pick(bots()); if (!who) return arrive();
    var t = pick(NEW_ACTS);
    if (!catOk(t.cat)) return join();
    var d = new Date(Date.now() + (1 + rnd(6)) * 864e5); d.setHours(12 + rnd(9), rnd(2) * 30, 0, 0);
    var id = t.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + uid();
    var o = { id: id, title: t.title, emoji: '', cat: t.cat, passion: t.passion && passionOk(t.passion) ? t.passion : '', kind: 'activite',
      date: d.toISOString(), place: t.place, max: t.max, level: 'tous', description: '', organizerId: who.id, participants: [who.id] };
    if (!o.passion) o.customLabel = t.custom || t.title;
    return db.from('cc_activities').upsert({ id: id, data: o, cancelled: false }, { onConflict: 'id' });
  }

  function leader() {
    var raw = ls(LEAD_KEY), now = Date.now();
    var cur = raw ? raw.split('|') : null;
    if (!cur || cur[0] === me || now - (+cur[1] || 0) > 7000) { ls(LEAD_KEY, me + '|' + now); return true; }
    return false;
  }
  var tick = 0;
  function step() {
    var delay = 3000 + rnd(3500);
    if (leader() && S.syncStatus && S.syncStatus() === 'live') {
      tick++;
      var r = Math.random(), total = S.people().length;
      var job = (tick === 1 || (total < 45 && r < 0.34)) ? arrive : r < 0.66 ? join : r < 0.92 ? talk : create;
      if (total >= 80 && job === arrive) job = join; // assez de monde : le campus vit sans gonfler
      try { var p = job(); if (p && p.then) p.then(null, function () { /* une erreur de démo n'arrête rien */ }); } catch (e) { /* rien */ }
    }
    W.setTimeout(step, delay);
  }
  /* L'onglet garde sa place de meneur tant qu'il est ouvert. */
  W.setInterval(function () { var raw = ls(LEAD_KEY); if (raw && raw.split('|')[0] === me) ls(LEAD_KEY, me + '|' + Date.now()); }, 2000);

  function start() {
    seed().then(function () { W.setTimeout(step, 2500); }, function () { W.setTimeout(step, 2500); });
  }
  if (document.readyState === 'complete') start(); else W.addEventListener('load', start);
})();
