/* Copie pour la DÉMO avec bots (app/demo/) : base locale au navigateur (clé cc_demo_db), jamais Supabase. */
/* Campus Connect — faux client Supabase pour les tests du mode live (jamais chargé par l'app réelle).
 *
 * Remplace `window.supabase.createClient(url, key)` par un client qui implémente le sous-ensemble
 * de supabase-js v2 utilisé par app/js/sync.js :
 *   from(t).select(cols) / insert(rows) / upsert(rows, { onConflict, ignoreDuplicates }) / update(v) / delete()
 *     + eq / neq / in / match / order / limit / single / maybeSingle → Promise { data, error, status }
 *   channel(name).on('postgres_changes', { event, schema, table }, cb).subscribe(cb)
 *   removeChannel(ch) / removeAllChannels() / getChannels()
 *
 * La « base » est un JSON dans localStorage (clé 'mocksb_db') et les événements temps réel passent
 * par BroadcastChannel('mocksb') : plusieurs onglets du même navigateur se voient en direct.
 *
 * Réglages (à modifier à chaud, depuis la console ou un test) :
 *   window.__mockSb = {
 *     latency: 40,        // ms ajoutées à chaque requête et à chaque événement temps réel
 *     failNext: 0,        // les N prochaines requêtes échouent comme une coupure réseau
 *     errorNext: null,    // { code, message, status } : la prochaine requête échoue avec cette erreur SQL
 *     offline: false,     // coupure réseau : requêtes en échec, canal en CHANNEL_ERROR, événements perdus
 *     realtimeBlocked: false, // WebSocket bloqué (Wi-Fi d'école) mais requêtes HTTP OK
 *     noMessages: false,  // table cc_messages absente (migration-v1.2.sql pas exécutée) : PGRST205,
 *                         // et un abonnement temps réel à cette table fait échouer le canal (CHANNEL_ERROR)
 *     backend: null       // (node) objet { getItem, setItem } partagé entre plusieurs « appareils »
 *   }
 *   window.__mockSb.reset()  // vide la fausse base (équivalent de cc_reset())
 *   window.__mockSb.dump()   // contenu de la fausse base
 *   window.__mockSb.stats    // { requests, failed, events }
 *
 * Imite aussi les règles de schema.sql : contraintes de taille (erreur 23514), clé primaire en double
 * (23505), RLS « anon » (update/delete interdits → 0 ligne, sans erreur, comme PostgREST),
 * table inconnue (PGRST205), update/delete sans filtre (21000), et pour cc_messages les droits par colonne
 * (insertion de id/activity_id/person_id/body seulement, modification de hidden seulement, vers true) → 42501.
 */
(function (W) {
  'use strict';

  var DB_KEY = 'cc_demo_db';
  var BC_NAME = 'cc_demo_bc';
  var opts = W.__mockSb = W.__mockSb || {};
  if (opts.latency === undefined) opts.latency = 40;
  if (!opts.failNext) opts.failNext = 0;
  opts.stats = opts.stats || { requests: 0, failed: 0, events: 0 };

  var windowId = Math.random().toString(36).slice(2);
  var setT = W.setTimeout ? W.setTimeout.bind(W) : setTimeout;
  var setI = W.setInterval ? W.setInterval.bind(W) : setInterval;

  function nowIso() { return new Date().toISOString(); }
  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function len(s) { return Array.from(String(s == null ? '' : s)).length; } // caractères, comme char_length
  function bytes(o) {
    var s = JSON.stringify(o);
    try { return new TextEncoder().encode(s).length; } catch (e) { return unescape(encodeURIComponent(s)).length; }
  }

  /* Postgres (jsonb, text) refuse \u0000 et les moitiés d'emoji isolées : erreur 22P05. */
  function badText(v) {
    if (typeof v === 'string') {
      return /\u0000/.test(v) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v);
    }
    if (Array.isArray(v)) return v.some(badText);
    if (v && typeof v === 'object') return Object.keys(v).some(function (k) { return badText(v[k]); });
    return false;
  }

  /* ---------- Schéma imité (voir supabase/schema.sql) ---------- */

  var TABLES = {
    cc_people: {
      pk: ['id'], timestamps: true, update: true, del: false,
      defaults: function () { return {}; },
      check: function (r) {
        if (typeof r.id !== 'string' || len(r.id) < 1 || len(r.id) > 80) return 'cc_people_id_len';
        if (!r.data || typeof r.data !== 'object' || Array.isArray(r.data)) return 'cc_people_data_object';
        var fn = r.data.firstName == null ? '' : r.data.firstName;
        if (len(fn) < 1 || len(fn) > 40) return 'cc_people_firstname_len';
        if (len(r.data.bio == null ? '' : r.data.bio) > 140) return 'cc_people_bio_len';
        if (bytes(r.data) > 8192) return 'cc_people_data_size';
        return null;
      }
    },
    cc_activities: {
      pk: ['id'], timestamps: true, update: true, del: false,
      defaults: function () { return { cancelled: false }; },
      check: function (r) {
        if (typeof r.id !== 'string' || len(r.id) < 1 || len(r.id) > 120) return 'cc_activities_id_len';
        if (!r.data || typeof r.data !== 'object' || Array.isArray(r.data)) return 'cc_activities_data_object';
        var t = r.data.title == null ? '' : r.data.title;
        if (len(t) < 1 || len(t) > 80) return 'cc_activities_title_len';
        if (len(r.data.description == null ? '' : r.data.description) > 600) return 'cc_activities_description_len';
        if (bytes(r.data) > 8192) return 'cc_activities_data_size';
        if (typeof r.cancelled !== 'boolean') return 'cc_activities_cancelled_bool';
        return null;
      }
    },
    cc_participations: {
      pk: ['activity_id', 'person_id'], timestamps: false, update: false, del: true,
      defaults: function () { return {}; },
      check: function (r) {
        if (typeof r.activity_id !== 'string' || len(r.activity_id) < 1 || len(r.activity_id) > 120) return 'cc_participations_activity_len';
        if (typeof r.person_id !== 'string' || len(r.person_id) < 1 || len(r.person_id) > 80) return 'cc_participations_person_len';
        return null;
      }
    },
    cc_connections: {
      pk: ['id'], serial: 'id', timestamps: false, update: false, del: false,
      unique: function (r) { return [r.a, r.b].sort().join('|'); }, // index unique sur la paire (least, greatest)
      defaults: function () { return {}; },
      check: function (r) {
        if (typeof r.a !== 'string' || len(r.a) < 1 || len(r.a) > 80) return 'cc_connections_a_len';
        if (typeof r.b !== 'string' || len(r.b) < 1 || len(r.b) > 80) return 'cc_connections_b_len';
        if (r.a === r.b) return 'cc_connections_not_self';
        if (len(r.message == null ? '' : r.message) > 500) return 'cc_connections_message_len';
        return null;
      }
    },
    cc_messages: {
      pk: ['id'], timestamps: false, update: true, del: false,
      insertCols: ['id', 'activity_id', 'person_id', 'body'],   // grant insert (id, activity_id, person_id, body)
      updateCols: ['hidden'],                                   // grant update (hidden)
      updateCheck: function (r) { return r.hidden === true; },  // policy cc_messages_hide : with check (hidden)
      defaults: function () { return { hidden: false }; },
      check: function (r) {
        if (typeof r.id !== 'string' || len(r.id) < 1 || len(r.id) > 80) return 'cc_messages_id_len';
        if (typeof r.activity_id !== 'string' || len(r.activity_id) < 1 || len(r.activity_id) > 120) return 'cc_messages_activity_len';
        if (typeof r.person_id !== 'string' || len(r.person_id) < 1 || len(r.person_id) > 80) return 'cc_messages_person_len';
        if (typeof r.body !== 'string' || len(r.body) > 300 || !r.body.trim()) return 'cc_messages_body_len';
        if (typeof r.hidden !== 'boolean') return 'cc_messages_hidden_bool';
        return null;
      }
    }
  };
  /* Table absente de la fausse base (opts.noMessages) : comme une base où la migration n'a pas été lancée. */
  function tableDef(name) {
    if (name === 'cc_messages' && opts.noMessages) return null;
    return Object.prototype.hasOwnProperty.call(TABLES, name) ? TABLES[name] : null;
  }
  function denied(table) { return pgError(403, '42501', 'permission denied for table ' + table); }

  /* ---------- Stockage ---------- */

  function store() { return opts.backend || W.localStorage; }
  function emptyDb() { return { t: { cc_people: [], cc_activities: [], cc_participations: [], cc_connections: [], cc_messages: [] }, seq: 0 }; }
  function loadDb() {
    var db = null;
    try { db = JSON.parse(store().getItem(DB_KEY) || 'null'); } catch (e) { db = null; }
    if (!db || !db.t) db = emptyDb();
    Object.keys(TABLES).forEach(function (k) { if (!Array.isArray(db.t[k])) db.t[k] = []; });
    return db;
  }
  function saveDb(db) { store().setItem(DB_KEY, JSON.stringify(db)); }

  opts.reset = function () { saveDb(emptyDb()); };
  opts.dump = function () { return loadDb().t; };

  /* ---------- Temps réel : registre local + BroadcastChannel ---------- */

  var channels = [];
  var bc = null;
  try { bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(BC_NAME) : null; } catch (e) { bc = null; }
  if (bc) {
    bc.onmessage = function (e) {
      var m = e && e.data;
      if (!m || m.from === windowId || !Array.isArray(m.events)) return;
      deliver(m.events);
    };
  }

  function deliver(events) {
    setT(function () {
      if (opts.offline || opts.realtimeBlocked) return; // coupure : les événements sont perdus, comme en vrai
      events.forEach(function (ev) {
        channels.slice().forEach(function (ch) {
          if (ch.state !== 'joined') return;
          ch.bindings.forEach(function (b) {
            if (b.table && b.table !== ev.table) return;
            if (b.event && b.event !== '*' && b.event !== ev.eventType) return;
            if (b.schema && b.schema !== 'public') return;
            opts.stats.events++;
            try { b.cb(clone(ev)); } catch (err) { setT(function () { throw err; }, 0); }
          });
        });
      });
    }, opts.latency || 0);
  }

  function publish(events) {
    if (!events.length) return;
    deliver(events);
    if (bc) { try { bc.postMessage({ from: windowId, events: events }); } catch (e) { /* rien */ } }
  }

  function pkOf(table, row) {
    var o = {};
    TABLES[table].pk.forEach(function (k) { o[k] = row[k]; });
    return o;
  }
  function evt(table, type, row, oldRow) {
    return {
      schema: 'public', table: table, commit_timestamp: nowIso(), eventType: type,
      'new': type === 'DELETE' ? {} : clone(row),
      old: oldRow ? pkOf(table, oldRow) : {}, // avec RLS, l'ancien enregistrement ne contient que la clé primaire
      errors: null
    };
  }

  /* Surveillance de la coupure simulée : canaux en erreur puis réabonnés au retour. */
  var lastOffline = !!opts.offline;
  var watching = false;
  function watch() {
    if (watching) return;
    watching = true;
    var iv = setI(function () {
      var off = !!opts.offline;
      if (off === lastOffline) return;
      lastOffline = off;
      channels.slice().forEach(function (ch) {
        if (off && (ch.state === 'joined' || ch.state === 'joining')) {
          ch.state = 'errored';
          ch._status('CHANNEL_ERROR', new Error('mock: réseau coupé'));
        } else if (!off && ch.state === 'errored') {
          ch._join();
        }
      });
    }, 100);
    if (iv && iv.unref) iv.unref();
  }

  function Channel(client, name) {
    this.topic = 'realtime:' + name;
    this.bindings = [];
    this.state = 'closed';
    this._cb = null;
    this._client = client;
  }
  Channel.prototype.on = function (type, filter, cb) {
    if (type === 'postgres_changes' && typeof cb === 'function') {
      filter = filter || {};
      this.bindings.push({ event: filter.event || '*', schema: filter.schema, table: filter.table, cb: cb });
    }
    return this;
  };
  Channel.prototype._status = function (s, err) {
    if (this._cb) { var cb = this._cb; try { cb(s, err); } catch (e) { setT(function () { throw e; }, 0); } }
  };
  Channel.prototype._join = function () {
    var self = this;
    self.state = 'joining';
    setT(function () {
      if (self.state !== 'joining') return;
      if (opts.offline || opts.realtimeBlocked) { self.state = 'errored'; self._status('CHANNEL_ERROR', new Error('mock: réseau coupé')); return; }
      /* abonnement à une table qui n'existe pas : le serveur refuse tout le canal */
      if (self.bindings.some(function (b) { return b.table && !tableDef(b.table); })) {
        opts.stats.badJoins = (opts.stats.badJoins || 0) + 1;
        self.state = 'errored';
        self._status('CHANNEL_ERROR', new Error('mock: Unable to subscribe to changes with given parameters'));
        return;
      }
      self.state = 'joined';
      self._status('SUBSCRIBED');
    }, (opts.latency || 0) + 10);
  };
  Channel.prototype.subscribe = function (cb) {
    this._cb = typeof cb === 'function' ? cb : null;
    if (channels.indexOf(this) === -1) channels.push(this);
    watch();
    this._join();
    return this;
  };
  Channel.prototype.unsubscribe = function () {
    var i = channels.indexOf(this);
    if (i !== -1) channels.splice(i, 1);
    var was = this.state;
    this.state = 'closed';
    if (was !== 'closed') this._status('CLOSED');
    return Promise.resolve('ok');
  };

  /* ---------- Requêtes ---------- */

  function netError() {
    return { data: null, error: { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' }, count: null, status: 0, statusText: '' };
  }
  function pgError(status, code, message) {
    return { data: null, error: { message: message, details: null, hint: null, code: code }, count: null, status: status, statusText: '' };
  }

  function Query(client, table) {
    this.table = table;
    this.op = 'select';
    this.cols = '*';
    this.ret = false;
    this.filters = [];
    this.orders = [];
    this.lim = null;
    this.values = null;
    this.o = {};
    this.single = null;
  }
  Query.prototype.select = function (cols) {
    if (this.op === 'select') this.cols = cols || '*'; else this.ret = true;
    if (this.op !== 'select' && cols) this.cols = cols;
    return this;
  };
  Query.prototype.insert = function (v, o) { this.op = 'insert'; this.values = v; this.o = o || {}; return this; };
  Query.prototype.upsert = function (v, o) { this.op = 'upsert'; this.values = v; this.o = o || {}; return this; };
  Query.prototype.update = function (v) { this.op = 'update'; this.values = v; return this; };
  Query.prototype['delete'] = function () { this.op = 'delete'; return this; };
  Query.prototype.eq = function (c, v) { this.filters.push(function (r) { return r[c] === v; }); return this; };
  Query.prototype.neq = function (c, v) { this.filters.push(function (r) { return r[c] !== v; }); return this; };
  Query.prototype['in'] = function (c, list) { list = list || []; this.filters.push(function (r) { return list.indexOf(r[c]) !== -1; }); return this; };
  Query.prototype.match = function (obj) { var self = this; Object.keys(obj || {}).forEach(function (k) { self.eq(k, obj[k]); }); return this; };
  Query.prototype.order = function (c, o) { this.orders.push({ c: c, asc: !(o && o.ascending === false) }); return this; };
  Query.prototype.limit = function (n) { this.lim = n; return this; };
  Query.prototype.single = function () { this.single = 'one'; return this; };
  Query.prototype.maybeSingle = function () { this.single = 'maybe'; return this; };
  Query.prototype.then = function (res, rej) {
    var self = this;
    opts.stats.requests++;
    var p = new Promise(function (resolve) {
      function exec() {
        var out;
        try { out = self._run(); } catch (e) { out = pgError(500, 'XX000', 'mock: ' + (e && e.message)); }
        if (out.error) opts.stats.failed++;
        resolve(out);
      }
      setT(function () {
        /* Plusieurs onglets écrivent dans la même fausse base (localStorage) : lecture → écriture sous un
         * verrou partagé entre onglets, sinon deux écritures simultanées s'écraseraient. */
        var locks = !opts.backend && W.navigator && W.navigator.locks;
        if (locks && typeof locks.request === 'function') {
          var ran = false;
          var once = function () { if (!ran) { ran = true; exec(); } };
          locks.request('cc_demo_db', function () { once(); }).then(null, once);
        } else exec();
      }, opts.latency || 0);
    });
    return p.then(res, rej);
  };
  Query.prototype['catch'] = function (rej) { return this.then(null, rej); };

  function project(rows, cols) {
    if (!cols || cols === '*') return rows.map(clone);
    var list = cols.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    return rows.map(function (r) { var o = {}; list.forEach(function (k) { o[k] = clone(r[k]); }); return o; });
  }

  Query.prototype._run = function () {
    if (opts.offline) return netError();
    if (opts.failNext > 0) { opts.failNext--; return netError(); }
    if (opts.errorNext) {
      var en = opts.errorNext; opts.errorNext = null;
      return pgError(en.status || 400, en.code || '23514', en.message || 'mock: erreur forcée');
    }
    var T = tableDef(this.table);
    if (!T) return pgError(404, 'PGRST205', "Could not find the table 'public." + this.table + "' in the schema cache");

    if (this.op !== 'select' && this.op !== 'delete' && badText(this.values)) {
      return pgError(400, '22P05', 'unsupported Unicode escape sequence');
    }
    var db = loadDb();
    var rows = db.t[this.table];
    var filters = this.filters;
    var match = function (r) { for (var i = 0; i < filters.length; i++) if (!filters[i](r)) return false; return true; };
    var events = [];
    var affected = [];
    var self = this;

    if (this.op === 'select') {
      var sel = rows.filter(match);
      this.orders.slice().reverse().forEach(function (o) {
        sel.sort(function (a, b) {
          var x = a[o.c], y = b[o.c];
          if (x === y) return 0;
          return (x < y ? -1 : 1) * (o.asc ? 1 : -1);
        });
      });
      if (this.lim != null) sel = sel.slice(0, this.lim);
      var data = project(sel, this.cols);
      if (this.single) {
        if (data.length === 1) return { data: data[0], error: null, status: 200 };
        if (data.length === 0 && this.single === 'maybe') return { data: null, error: null, status: 200 };
        return pgError(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned');
      }
      return { data: data, error: null, count: null, status: 200, statusText: 'OK' };
    }

    if (this.op === 'insert' || this.op === 'upsert') {
      var list = Array.isArray(this.values) ? this.values : [this.values];
      var conflictCols = this.o.onConflict ? String(this.o.onConflict).split(',').map(function (s) { return s.trim(); }) : T.pk;
      var work = rows.map(clone);
      var seq = db.seq || 0;
      for (var i = 0; i < list.length; i++) {
        var src = list[i] || {};
        if (T.insertCols && Object.keys(src).some(function (k) { return T.insertCols.indexOf(k) === -1; })) return denied(self.table);
        var row = Object.assign({}, T.defaults(), clone(src));
        if (T.serial && row[T.serial] == null) row[T.serial] = ++seq;
        var key = function (r) { return conflictCols.map(function (k) { return JSON.stringify(r[k]); }).join('|'); };
        var existing = null;
        for (var j = 0; j < work.length; j++) if (key(work[j]) === key(row)) { existing = work[j]; break; }
        if (!existing && T.unique) {
          for (var u = 0; u < work.length; u++) if (T.unique(work[u]) === T.unique(row)) {
            return pgError(409, '23505', 'duplicate key value violates unique constraint "' + self.table + '_pair_key"');
          }
        }
        if (existing) {
          if (this.op === 'insert') return pgError(409, '23505', 'duplicate key value violates unique constraint "' + self.table + '_pkey"');
          if (this.o.ignoreDuplicates) continue;
          if (!T.update) return pgError(403, '42501', 'new row violates row-level security policy (USING expression) for table "' + self.table + '"');
          if (T.updateCols) return denied(self.table); // upsert = mise à jour de toutes les colonnes envoyées
          var merged = Object.assign({}, existing, clone(src));
          if (T.timestamps) merged.updated_at = nowIso();
          var errU = T.check(merged);
          if (errU) return pgError(400, '23514', 'new row for relation "' + self.table + '" violates check constraint "' + errU + '"');
          Object.keys(existing).forEach(function (k) { delete existing[k]; });
          Object.assign(existing, merged);
          affected.push(existing);
          events.push(evt(self.table, 'UPDATE', existing, existing));
        } else {
          if (row.created_at == null) row.created_at = nowIso();
          if (T.timestamps && row.updated_at == null) row.updated_at = row.created_at;
          var err = T.check(row);
          if (err) return pgError(400, '23514', 'new row for relation "' + self.table + '" violates check constraint "' + err + '"');
          work.push(row);
          affected.push(row);
          events.push(evt(self.table, 'INSERT', row, null));
        }
      }
      db.t[this.table] = work;
      db.seq = seq;
      saveDb(db);
      publish(events);
      return { data: this.ret ? project(affected, this.cols) : null, error: null, count: null, status: 201, statusText: 'Created' };
    }

    if (this.op === 'update') {
      if (!filters.length) return pgError(400, '21000', 'UPDATE requires a WHERE clause');
      if (!T.update) return { data: this.ret ? [] : null, error: null, status: this.ret ? 200 : 204 }; // RLS : 0 ligne
      if (T.updateCols && Object.keys(this.values || {}).some(function (k) { return T.updateCols.indexOf(k) === -1; })) return denied(self.table);
      var work2 = rows.map(clone);
      for (var k2 = 0; k2 < work2.length; k2++) {
        var r = work2[k2];
        if (!match(r)) continue;
        var m2 = Object.assign({}, r, clone(this.values));
        if (T.updateCheck && !T.updateCheck(m2)) return pgError(403, '42501', 'new row violates row-level security policy for table "' + self.table + '"');
        if (T.timestamps) m2.updated_at = nowIso();
        var e2 = T.check(m2);
        if (e2) return pgError(400, '23514', 'new row for relation "' + self.table + '" violates check constraint "' + e2 + '"');
        work2[k2] = m2;
        affected.push(m2);
        events.push(evt(self.table, 'UPDATE', m2, m2));
      }
      db.t[this.table] = work2;
      saveDb(db);
      publish(events);
      return { data: this.ret ? project(affected, this.cols) : null, error: null, status: this.ret ? 200 : 204 };
    }

    if (this.op === 'delete') {
      if (!filters.length) return pgError(400, '21000', 'DELETE requires a WHERE clause');
      if (!T.del) return { data: this.ret ? [] : null, error: null, status: this.ret ? 200 : 204 }; // RLS : 0 ligne
      var keep = [];
      rows.forEach(function (r) {
        if (match(r)) { affected.push(r); events.push(evt(self.table, 'DELETE', null, r)); } else keep.push(r);
      });
      db.t[this.table] = keep;
      saveDb(db);
      publish(events);
      return { data: this.ret ? project(affected, this.cols) : null, error: null, status: this.ret ? 200 : 204 };
    }
    return pgError(400, 'PGRST100', 'mock: opération inconnue');
  };

  /* ---------- Client ---------- */

  function createClient(url, key) {
    if (!url || !key) throw new Error('supabaseUrl is required.');
    var client = {
      __mock: true,
      supabaseUrl: url,
      from: function (t) { return new Query(client, t); },
      channel: function (name) { return new Channel(client, name || 'mock'); },
      removeChannel: function (ch) { return ch && ch.unsubscribe ? ch.unsubscribe() : Promise.resolve('ok'); },
      removeAllChannels: function () {
        return Promise.all(channels.filter(function (c) { return c._client === client; }).map(function (c) { return c.unsubscribe(); }));
      },
      getChannels: function () { return channels.filter(function (c) { return c._client === client; }); }
    };
    return client;
  }

  W.supabase = { createClient: createClient, __mock: true };
})(typeof window !== 'undefined' ? window : this);
