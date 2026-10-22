// Stockage : base de données partagée de l'artifact (capacité « db ») ;
// hors de claude.ai, repli sur le stockage du navigateur (un seul appareil).
(function (root) {
  "use strict";
  const C = root.PlanningCore;
  const LS = "planning-equipe:";
  const HISTORY_KEEP = 300, VERSIONS_KEEP = 120, CHAT_KEEP = 30;
  // Le journal garde au moins 300 lignes ET tout ce qui a moins de 3 mois (les plannings eux-mêmes ne sont jamais effacés).
  const KEEP_DAYS = 92;
  const tooOld = (at) => !at || Date.now() - new Date(at).getTime() > KEEP_DAYS * 86400000;

  const lsGet = (k) => { try { const v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(LS + k); else localStorage.setItem(LS + k, JSON.stringify(v)); return true; } catch (e) { throw { code: "local_failed", message: "Le stockage du navigateur est plein ou bloqué." }; } };
  const lsKeys = (prefix) => { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(LS + prefix)) out.push(k.slice(LS.length)); } } catch (e) { /* ignoré */ } return out; };

  const Store = {
    mode: "aucun", db: null, user: null, userId: null, canWrite: true, readOnlyReason: "",
    queues: {}, unsubs: [],

    async init() {
      const claude = root.claude;
      if (claude && typeof claude.use === "function") {
        const [db, user] = await Promise.all([claude.use("db").catch(() => null), claude.use("user").catch(() => null)]);
        this.user = user;
        if (user) {
          try { this.userId = await user.id(); } catch (e) { this.userId = null; }
          try { const w = await user.can("data.write"); if (w === false) { this.canWrite = false; this.readOnlyReason = "Vous consultez ce planning en lecture seule."; } } catch (e) { /* inconnu : on garde l'édition */ }
        }
        if (db) { this.db = db; this.mode = "db"; return this.mode; }
      }
      try { localStorage.setItem(LS + "probe", "1"); localStorage.removeItem(LS + "probe"); this.mode = "local"; }
      catch (e) { this.mode = "memoire"; }
      return this.mode;
    },

    // Une écriture à la fois par document.
    queue(path, fn) {
      const prev = this.queues[path] || Promise.resolve();
      const next = prev.catch(() => {}).then(fn);
      this.queues[path] = next;
      return next;
    },
    async dbCall(fn) {
      try { return await fn(); }
      catch (e) {
        if (e && e.code === "unavailable") { await new Promise((r) => setTimeout(r, 400 + Math.random() * 600)); return fn(); }
        if (e && e.code === "invalid_argument") { this.canWrite = false; this.readOnlyReason = "L'enregistrement a été refusé : vous n'avez peut-être que le droit de lecture."; }
        throw e;
      }
    },

    async loadAll() {
      const out = { config: {}, weeks: {}, absences: {}, adjustments: {} };
      if (this.mode === "db") {
        const [cfg, weeks, abs, adj] = await Promise.all([
          this.dbCall(() => this.db.collection("config").get()),
          this.dbCall(() => this.db.collection("weeks").get()),
          this.dbCall(() => this.db.collection("absences").get()),
          this.dbCall(() => this.db.collection("adjustments").get()),
        ]);
        for (const d of adj.docs) out.adjustments[d.id] = C.clone(d.data());
        for (const d of cfg.docs) out.config[d.id] = C.clone(d.data().value);
        for (const d of weeks.docs) out.weeks[d.id] = C.clone(d.data());
        for (const d of abs.docs) out.absences[d.id] = C.clone(d.data());
      } else if (this.mode === "local") {
        for (const k of C.CONFIG_KEYS) { const v = lsGet("config/" + k); if (v != null) out.config[k] = v; }
        for (const k of lsKeys("weeks/")) out.weeks[k.slice(6)] = lsGet(k);
        for (const k of lsKeys("absences/")) out.absences[k.slice(9)] = lsGet(k);
        for (const k of lsKeys("adjustments/")) out.adjustments[k.slice(12)] = lsGet(k);
      } else if (this.memory) return C.clone(this.memory);
      return out;
    },

    // Mise à jour en direct quand quelqu'un d'autre modifie le planning.
    watch(onChange) {
      if (this.mode !== "db") return;
      this.unsubs.forEach((u) => u()); this.unsubs = [];
      let first = { config: true, weeks: true, absences: true, adjustments: true };
      const sub = (col) => this.db.collection(col).onSnapshot((snap) => {
        if (first[col]) { first[col] = false; return; }
        if (snap.metadata && snap.metadata.hasPendingWrites) return;
        const changes = snap.docChanges().map((c) => ({ col, id: c.doc.id, removed: c.type === "removed", data: c.type === "removed" ? null : C.clone(c.doc.data()) }));
        if (changes.length) onChange(changes);
      }, () => {});
      this.unsubs.push(sub("config"), sub("weeks"), sub("absences"), sub("adjustments"));
    },

    async put(col, id, value) {
      const path = `${col}/${id}`;
      if (this.mode === "db") {
        return this.queue(path, () => this.dbCall(() => {
          const ref = this.db.doc(path);
          if (value == null) return ref.delete();
          return ref.set(col === "config" ? { value } : value);
        }));
      }
      if (this.mode === "local") return lsSet(path, value);
      this.memory = this.memory || { config: {}, weeks: {}, absences: {}, adjustments: {} };
      const bucket = this.memory[col];
      if (value == null) delete bucket[id]; else bucket[id] = C.clone(value);
    },

    // ---------- Historique et versions ----------
    async addLog(col, entry) {
      const id = entry.id;
      if (this.mode === "db") {
        await this.queue(`${col}/${id}`, () => this.dbCall(() => this.db.doc(`${col}/${id}`).set(entry)));
        this.prune(col).catch(() => {});
      } else if (this.mode === "local") {
        lsSet(`${col}/${id}`, entry);
        const keys = lsKeys(col + "/").map((k) => ({ k, at: (lsGet(k) || {}).at || "" })).sort((a, b) => (a.at < b.at ? 1 : -1));
        keys.slice(col === "history" ? HISTORY_KEEP : VERSIONS_KEEP).filter((x) => tooOld(x.at)).forEach((x) => lsSet(x.k, null));
      } else {
        this.logs = this.logs || { history: [], versions: [] };
        this.logs[col].unshift(entry);
      }
    },
    async prune(col) {
      const keep = col === "history" ? HISTORY_KEEP : VERSIONS_KEEP;
      const snap = await this.db.collection(col).orderBy("at", "desc").limit(1000).get();
      for (const d of snap.docs.slice(keep)) if (tooOld(d.data().at)) await this.db.doc(`${col}/${d.id}`).delete();
    },
    async listLog(col, limit) {
      if (this.mode === "db") {
        const snap = await this.dbCall(() => this.db.collection(col).orderBy("at", "desc").limit(limit || 100).get());
        return snap.docs.map((d) => C.clone(d.data()));
      }
      if (this.mode === "local") return lsKeys(col + "/").map(lsGet).filter(Boolean).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit || 100);
      return ((this.logs || {})[col] || []).slice(0, limit || 100);
    },
    async updateLog(col, id, patch) {
      if (this.mode === "db") return this.queue(`${col}/${id}`, () => this.dbCall(() => this.db.doc(`${col}/${id}`).update(patch)));
      if (this.mode === "local") { const v = lsGet(`${col}/${id}`); if (v) lsSet(`${col}/${id}`, { ...v, ...patch }); return; }
      const e = ((this.logs || {})[col] || []).find((x) => x.id === id); if (e) Object.assign(e, patch);
    },

    // ---------- Conversation avec l'assistant (privée, par personne) ----------
    async loadChat() {
      try {
        if (this.mode === "db" && this.userId) { const d = await this.db.doc(`data/users/${this.userId}/chat`).get(); return d.exists ? (d.data().messages || []) : []; }
        if (this.mode === "local") return lsGet("chat") || [];
      } catch (e) { /* conversation non disponible */ }
      return [];
    },
    async saveChat(messages) {
      const m = messages.slice(-CHAT_KEEP).map((x) => ({ role: x.role, text: String(x.text || "").slice(0, 4000), at: x.at || null }));
      try {
        if (this.mode === "db" && this.userId) return this.queue("chat", () => this.db.doc(`data/users/${this.userId}/chat`).set({ messages: m }));
        if (this.mode === "local") lsSet("chat", m);
      } catch (e) { /* non bloquant */ }
    },

    async names(ids) {
      const out = {};
      if (!this.user || !ids.length) return out;
      try { const ps = await this.user.profiles(ids); for (const id of ids) out[id] = (ps[id] && ps[id].name) || ""; } catch (e) { /* noms indisponibles */ }
      return out;
    },
  };
  root.PlanningStore = Store;
})(typeof globalThis !== "undefined" ? globalThis : this);
