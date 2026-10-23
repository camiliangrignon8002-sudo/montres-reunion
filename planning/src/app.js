// Interface de l'application « Planning équipe ».
(function (root) {
  "use strict";
  const C = root.PlanningCore, Store = root.PlanningStore, AI = root.PlanningAI, X = root.PlanningExports;
  const CLAUDE_URL = "https://claude.ai/artifact/GqCvGUNogmGmept7ND8mdY";
  const inClaude = () => !!(root.claude && typeof root.claude.use === "function");

  // Données de l'équipe chiffrées dans l'appli publique : déchiffrées sur l'appareil avec le code d'accès.
  async function unlockReference(code) {
    const L = root.PlanningReferenceLocked;
    const b64 = (x) => Uint8Array.from(atob(x), (c) => c.charCodeAt(0));
    const raw = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(code).trim().toLowerCase()), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64(L.salt), iterations: L.iter, hash: "SHA-256" }, raw, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(L.iv) }, key, b64(L.data));
    return JSON.parse(new TextDecoder().decode(buf)).reference;
  }

  // ---------- Outils DOM ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
      else if (k === "value" && (tag === "input" || tag === "textarea" || tag === "select")) el.value = v;
      else if (k === "checked" || k === "selected" || k === "disabled") el[k] = !!v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
    return el;
  }
  const ICONS = {
    home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
    week: "M4 5h16v15H4z M4 9.5h16 M8 3v4 M16 3v4 M8 13h2 M12 13h2 M16 13h1 M8 16.5h2 M12 16.5h2",
    month: "M4 5h16v15H4z M4 9.5h16 M8 3v4 M16 3v4 M7.5 13h.01 M10.5 13h.01 M13.5 13h.01 M16.5 13h.01 M7.5 16.5h.01 M10.5 16.5h.01 M13.5 16.5h.01",
    spark: "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z M18.5 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z",
    school: "M2 9.5l10-5 10 5-10 5z M6 11.5V16c3.5 2.4 8.5 2.4 12 0v-4.5 M22 9.5v5",
    leave: "M4 8h16v12H4z M9 8V5h6v3 M4 13h16",
    team: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20c.6-3.6 3.2-6 6.5-6s5.9 2.4 6.5 6 M16 4.3a3.5 3.5 0 0 1 0 6.4 M18 14.2c2 .8 3.2 2.9 3.5 5.8",
    zones: "M12 21a9 9 0 1 1 9-9c0 2.5-2 3-3.5 3H16a2 2 0 0 0-1.4 3.4c.6.6.4 2.6-2.6 2.6z M7.5 11.5h.01 M10 7.5h.01 M14.5 7.5h.01",
    history: "M3.5 12a8.5 8.5 0 1 0 2.6-6.1 M3 4v4.5h4.5 M12 7.5V12l3 2",
    import: "M12 3v12 M7 10l5 5 5-5 M4 20h16",
    export: "M12 15V3 M7 8l5-5 5 5 M4 20h16",
    download: "M12 3.5v11.5 M7 10.5l5 5 5-5 M5 20h14",
    clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7.5V12l3.5 2",
    refresh: "M20 12a8 8 0 1 1-2.4-5.7 M20 4v5h-5",
    undo: "M9 14L4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
    left: "M15 18l-6-6 6-6", right: "M9 6l6 6-6 6",
    close: "M6 6l12 12 M18 6L6 18",
    more: "M5 12h.01 M12 12h.01 M19 12h.01",
    plus: "M12 5v14 M5 12h14",
    check: "M5 12.5l4.5 4.5L19 7",
    send: "M5 12h14 M13 6l6 6-6 6",
    wand: "M4 20L15 9 M17 3l.9 2.1L20 6l-2.1.9L17 9l-.9-2.1L14 6l2.1-.9z",
    grid: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
    list: "M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01",
    menu: "M4 7h16 M4 12h16 M4 17h16",
    info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 8h.01",
  };
  function icon(name) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", name === "more" ? "3" : "1.8"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); s.setAttribute("aria-hidden", "true");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", ICONS[name] || ""); s.append(p);
    return s;
  }
  const btn = (label, onClick, cls, extra) => h("button", { type: "button", class: "btn " + (cls || ""), onClick, ...(extra || {}) }, label);
  const iconBtn = (name, label, onClick, extra) => h("button", { type: "button", class: "icon-btn", "aria-label": label, title: label, onClick, ...(extra || {}) }, icon(name));
  const fmtTime = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  // ---------- Toasts et fenêtres ----------
  function toast(msg, kind, action) {
    let box = document.querySelector(".toasts");
    if (!box) { box = h("div", { class: "toasts", role: "status", "aria-live": "polite" }); document.body.append(box); }
    const t = h("div", { class: "toast " + (kind || "") }, h("span", {}, msg), action ? h("button", { type: "button", onClick: () => { t.remove(); action.fn(); } }, action.label) : null);
    box.append(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.remove(), kind === "err" ? 9000 : 3500);
  }
  function openDialog({ title, body, actions, wide, onClose }) {
    const prevFocus = document.activeElement;
    const close = () => { ov.remove(); document.removeEventListener("keydown", onKey); if (onClose) onClose(); if (prevFocus && prevFocus.focus) prevFocus.focus(); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    const footer = h("footer", {});
    const dlg = h("div", { class: "dialog" + (wide ? " wide" : ""), role: "dialog", "aria-modal": "true", "aria-label": title },
      h("header", {}, h("h2", {}, title), iconBtn("close", "Fermer", close)),
      h("div", { class: "body" }, typeof body === "function" ? body() : body),
      footer);
    const renderActions = () => {
      footer.replaceChildren(...(actions || []).map((a) => {
        const b = btn(a.label, async () => {
          if (a.onClick) { b.disabled = true; let res; try { res = await a.onClick(); } finally { b.disabled = false; } if (res === false) return; }
          close();
        }, a.primary ? "primary" : a.danger ? "danger" : "", { disabled: a.disabled });
        return b;
      }));
      footer.hidden = !(actions || []).length;
    };
    renderActions();
    const ov = h("div", { class: "overlay", onClick: (e) => { if (e.target === ov) close(); } }, dlg);
    document.body.append(ov);
    document.addEventListener("keydown", onKey);
    setTimeout(() => { const f = dlg.querySelector(".body input, .body select, .body textarea, footer .primary"); if (f) f.focus(); }, 30);
    return { close, el: dlg, body: dlg.querySelector(".body"), setActions: (a) => { actions = a; renderActions(); } };
  }
  function confirmDialog(title, message, okLabel, danger) {
    return new Promise((resolve) => {
      let done = false;
      openDialog({
        title, body: h("p", {}, message),
        actions: [{ label: "Annuler", onClick: () => { done = true; resolve(false); } }, { label: okLabel || "Confirmer", primary: !danger, danger, onClick: () => { done = true; resolve(true); } }],
        onClose: () => { if (!done) resolve(false); },
      });
    });
  }

  // ---------- Rendu des blocs ----------
  function zoneStyle(state, z) {
    const zone = C.zoneById(state, z);
    return { cls: zone && zone.pattern === "hachures" ? "hatch" : zone && zone.pattern === "points" ? "dots" : "", color: zone ? zone.color : "#8e8e93", short: zone ? zone.short : z || "?" };
  }
  function blk(state, g) {
    const zs = zoneStyle(state, g.z);
    return h("div", { class: `blk ${zs.cls}${g.doute ? " doubt" : ""}`, style: { "--z": zs.color }, title: g.doute || `${g.s}–${g.e} · ${(C.zoneById(state, g.z) || {}).name || g.z}` },
      h("span", {}, `${g.s}–${g.e}`), h("small", {}, zs.short));
  }
  function zoneTag(state, z) {
    const zs = zoneStyle(state, z);
    return h("span", { class: `zone-tag blk ${zs.cls}`, style: { "--z": zs.color } }, zs.short);
  }
  function legend(state) {
    return h("div", { class: "legend", "aria-label": "Légende" },
      state.zones.map((z) => h("span", {}, h("span", { class: `blk ${zoneStyle(state, z.id).cls}`, style: { "--z": z.color, width: "34px", "justify-content": "center" } }, h("small", {}, z.short)), z.name)),
      h("span", {}, h("span", { class: "tag-cours" }, "Cours"), "Formation CFA"),
      h("span", {}, h("span", { class: "tag-abs" }, "Absent"), "Congé / absence"),
      h("span", {}, h("span", { class: "tag-unk" }, "?"), "Statut inconnu"));
  }
  const monthName = (k) => `${C.MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;
  // Le mois en cours puis les précédents (« 2026-10 », « 2026-09 », …)
  const lastMonths = (today, n) => Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1 - i, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; });
  function rulesText(e) {
    const r = e.rules || {}, out = [];
    if (e.role === "alternant") out.push(e.calendarId ? "Suit le calendrier du BTS" : "Calendrier d'alternance non défini");
    if (e.onLeave) out.push(`En ${C.ABSENCE_TYPES[e.onLeave.type] ? C.ABSENCE_TYPES[e.onLeave.type].toLowerCase() : "congé"} depuis le ${C.fmtDate(e.onLeave.since, "short")}`);
    if (r.fixedHours) out.push(`Toujours ${r.fixedHours.s}–${r.fixedHours.e}`);
    if (Array.isArray(r.daysOff) && r.daysOff.length) out.push(`Repos fixe : ${r.daysOff.map((d) => C.DAYS[d].toLowerCase()).join(", ")}`);
    else if (r.sameWeekends) out.push("Mêmes week-ends (jours à préciser)");
    if (r.sameWeekends === false) out.push("Week-ends variables");
    return out.join(" · ");
  }
  const empName = (state, id) => (id === "*" ? "Toute l'équipe" : (C.empById(state, id) || { name: id }).name);

  // ---------- Résumés des opérations (historique) ----------
  function summarize(state, ops) {
    const d = (x) => (x ? `${C.DAYS_SHORT[C.dow(x)].toLowerCase()}. ${C.fmtDate(x, "short")}` : "");
    const n = (x) => { const e = C.empById(state, x) || C.findEmployee(state, x).emp; return e ? e.name : x; };
    return ops.map((o) => {
      switch (o.type) {
        case "setShift": return `${n(o.emp)} · ${d(o.date)} : ${o.segs.map((g) => `${C.normTime(g.s) || g.s}–${C.normTime(g.e) || g.e} ${g.z || ""}`).join(", ")}`;
        case "removeShift": return `${n(o.emp)} · ${d(o.date)} : créneau supprimé`;
        case "moveShift": return `${n(o.emp)} · ${d(o.date)} → ${n(o.toEmp || o.emp)}${o.toDate && o.toDate !== o.date ? " · " + d(o.toDate) : ""}${o.swap ? " (échange)" : ""}`;
        case "copyDay": return `Copie du ${d(o.from)} vers le ${d(o.to)}`;
        case "duplicateWeek": return `Semaine du ${C.fmtDate(o.from, "short")} dupliquée vers le ${C.fmtDate(o.to, "short")}`;
        case "putWeek": return `Semaine du ${C.fmtWeek(o.monday)} remplacée`;
        case "importShifts": return `Import de ${o.shifts.length} créneaux`;
        case "setWeekStatus": return `Semaine du ${C.fmtWeek(o.monday)} ${o.status === "validé" ? "validée" : "repassée en brouillon"}`;
        case "addAbsence": return `${C.ABSENCE_TYPES[o.absence.type]} : ${n(o.absence.emp)} du ${C.fmtDate(o.absence.from, "short")} au ${C.fmtDate(o.absence.to || o.absence.from, "short")}`;
        case "updateAbsence": return `Absence modifiée : ${n(o.absence.emp)}`;
        case "removeAbsence": return "Absence supprimée";
        case "addAdjustment": return `${C.ADJUST_TYPES[o.adjustment.type].label} : ${n(o.adjustment.emp)} ${d(o.adjustment.date)} (${C.ADJUST_TYPES[o.adjustment.type].sign > 0 ? "+" : "−"}${C.fmtHours(Math.round(Number(o.adjustment.minutes)))})`;
        case "removeAdjustment": return "Heures sup / retard supprimé";
        case "addEmployee": return `Ajout de ${o.employee.name}`;
        case "updateEmployee": return `Fiche de ${n(o.id)} modifiée`;
        case "removeEmployee": return `Suppression de ${n(o.id)}`;
        case "setZones": return `Zones de ${n(o.emp)} : ${Object.keys(o.zones).join(", ") || "aucune"}`;
        case "updateZone": return "Zone modifiée";
        case "addZone": return `Zone ${o.zone.id || o.zone.short} ajoutée`;
        case "setSettings": return "Règles modifiées";
        case "setTemplate": return "Planning modèle remplacé";
        case "setCalendarDay": return `Calendrier d'alternance : ${C.fmtDate(o.date, "num")} → ${C.CAL_LABELS[C.CAL_CODES[o.code]]}`;
        case "putCalendar": return `Calendrier « ${o.calendar.name} » enregistré`;
        default: return o.type;
      }
    }).join(" ; ").slice(0, 400);
  }

  // =====================================================================
  const App = {
    state: null, history: [], chat: [], names: {}, ready: false,
    ui: { hoursMode: "week", hoursMonday: null, hoursMonth: null, screen: "dashboard", monday: null, day: null, view: null, aiOpen: false, month: null, calEdit: false, calId: null, absMonth: null },

    today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; },
    userId() { return Store.userId || (Store.mode === "db" ? "inconnu" : "cet appareil"); },
    narrow() { return root.matchMedia && root.matchMedia("(max-width: 860px)").matches; },

    async boot() {
      const today = this.today();
      this.ui.monday = C.mondayOf(today); this.ui.day = today; this.ui.month = today.slice(0, 7); this.ui.absMonth = today.slice(0, 7);
      this.ui.view = this.narrow() ? "day" : "grid";
      try { const v = localStorage.getItem("planning-equipe:ui"); if (v) { const u = JSON.parse(v); if (u.view) this.ui.view = u.view; if (u.aiOpen && !this.narrow()) this.ui.aiOpen = true; } } catch (e) { /* préférences indisponibles */ }
      const hash = (location.hash || "").slice(1);
      if (SCREENS[hash]) this.ui.screen = hash;
      this.renderShell();
      this.setSync("busy", "Chargement…");
      await Store.init();
      AI.init().then(() => this.renderAI()).catch(() => { AI.status = "absent"; this.renderAI(); });
      try {
        await this.load();
        this.setSync("ok");
      } catch (e) {
        this.setSync("fail", "Chargement impossible");
        this.state = null;
        this.loadError = (e && e.message) || "erreur inconnue";
      }
      this.ready = true;
      // Premier lancement : les calendriers analysés (déjà confirmés) sont importés automatiquement.
      if (!this.state && !this.loadError && root.PlanningReference && Store.canWrite) { await this.importReference(true); return; }
      if (!this.state) this.ui.screen = "import";
      this.render();
      await this.syncReference();
      Store.watch((changes) => this.onRemote(changes));
      this.chat = await Store.loadChat();
      this.renderAI();
      this.installPullToRefresh();
    },
    async load() {
      const data = await Store.loadAll();
      const cfg = data.config;
      if (!cfg.employees) { this.state = null; this.history = []; return; }
      this.state = {
        employees: cfg.employees || [], zones: cfg.zones || [], settings: { ...C.DEFAULT_SETTINGS, ...(cfg.settings || {}) },
        template: cfg.template || { shifts: [] }, calendars: cfg.calendars || [], weeks: data.weeks || {}, absences: data.absences || {}, adjustments: data.adjustments || {},
      };
      this.history = await Store.listLog("history", 150).catch(() => []);
      const ids = [...new Set(this.history.map((x) => x.by).filter((x) => x && x !== "cet appareil" && x !== "inconnu"))];
      Object.assign(this.names, await Store.names(ids));
    },
    async refresh() {
      if (!inClaude() && Store.mode === "local" && location.protocol.startsWith("http")) { location.reload(); return; }
      const b = document.querySelector("#refresh-btn");
      if (b) b.classList.add("spin");
      this.setSync("busy", "Actualisation…");
      try {
        await this.load();
        this.setSync("ok");
        this.render();
        toast(`Planning actualisé à ${fmtTime(new Date())}`);
      } catch (e) {
        this.setSync("fail", "Actualisation impossible");
        toast("Impossible d'actualiser : vérifiez la connexion puis réessayez.", "err", { label: "Réessayer", fn: () => this.refresh() });
      } finally { if (b) b.classList.remove("spin"); }
    },
    onRemote(changes) {
      if (!this.state) { this.refresh(); return; }
      let n = 0;
      for (const c of changes) {
        if (c.col === "weeks") { if (c.removed) delete this.state.weeks[c.id]; else this.state.weeks[c.id] = c.data; n++; }
        else if (c.col === "absences") { if (c.removed) delete this.state.absences[c.id]; else this.state.absences[c.id] = c.data; n++; }
        else if (c.col === "adjustments") { this.state.adjustments = this.state.adjustments || {}; if (c.removed) delete this.state.adjustments[c.id]; else this.state.adjustments[c.id] = c.data; n++; }
        else if (c.col === "config" && C.CONFIG_KEYS.includes(c.id) && !c.removed) { this.state[c.id] = c.id === "settings" ? { ...C.DEFAULT_SETTINGS, ...c.data.value } : c.data.value; n++; }
      }
      if (n) { this.render(); toast("Le planning vient d'être modifié par une autre personne."); }
    },
    savePrefs() { try { localStorage.setItem("planning-equipe:ui", JSON.stringify({ view: this.ui.view, aiOpen: this.ui.aiOpen })); } catch (e) { /* ignoré */ } },

    setSync(kind, label) {
      const el = document.querySelector("#sync");
      if (!el) return;
      const where = Store.mode === "db" ? "Enregistré" : Store.mode === "local" ? "Enregistré sur cet appareil" : Store.mode === "memoire" ? "Non enregistré (stockage bloqué)" : "";
      el.className = "sync " + (kind === "busy" ? "busy" : kind === "fail" ? "fail" : "");
      el.replaceChildren(h("span", { class: "dot" }), h("span", { class: "lbl" }, label || (kind === "ok" ? where : kind === "fail" ? "Échec de l'enregistrement" : "Enregistrement…")));
    },

    // ---------- Modifications : vérifiées, enregistrées, historisées ----------
    async commit(ops, o) {
      o = o || {};
      if (!Store.canWrite) { toast(Store.readOnlyReason || "Lecture seule.", "err"); return { ok: false }; }
      const prev = this.state;
      const r = C.applyOps(prev, ops, { now: new Date().toISOString(), by: this.userId(), allowErrors: o.allowErrors });
      if (!r.ok) { if (!o.silent) this.showErrors(r.errors, o.errorTitle); return r; }
      if (!r.changes.length) return r;
      this.state = r.state;
      this.render();
      const ok = await this.persist(r.changes, o.source || "manuel", o.summary || summarize(prev, ops), () => this.commit(ops, o));
      if (!ok) { this.state = C.applyChanges(this.state, r.changes, "before"); this.render(); return { ok: false, errors: ["Échec de l'enregistrement."] }; }
      if (!o.quiet) for (const m of r.messages) toast(m);
      if (r.impacts && r.impacts.length && !o.noImpacts) this.showImpacts(r.impacts, o.impactTitle);
      return r;
    },
    async persist(changes, source, summary, retry) {
      this.setSync("busy");
      const written = [];
      try {
        for (const c of changes) { await Store.put(c.col, c.id, c.after); written.push(c); }
      } catch (e) {
        for (const c of written.reverse()) { try { await Store.put(c.col, c.id, c.before); } catch (e2) { /* au mieux */ } }
        this.setSync("fail");
        const why = e && e.code === "quota_exceeded" ? "la base de données est pleine (supprimez d'anciennes versions dans l'historique)" : e && e.code === "invalid_argument" ? "vous n'avez pas le droit de modifier ce planning" : "connexion ou service indisponible";
        toast(`Rien n'a été enregistré : ${why}.`, "err", retry ? { label: "Réessayer", fn: retry } : null);
        return false;
      }
      const entry = { id: C.uid("h"), at: new Date().toISOString(), by: this.userId(), source, summary, changes };
      if (JSON.stringify(entry).length > 230000) { entry.changes = changes.map((c) => ({ col: c.col, id: c.id })); entry.tooBig = true; }
      this.history.unshift(entry);
      try { await Store.addLog("history", entry); this.setSync("ok"); }
      catch (e) { this.setSync("ok", "Enregistré (historique incomplet)"); }
      return true;
    },
    showErrors(errors, title) {
      openDialog({
        title: title || "Modification refusée",
        body: h("div", { class: "stack" }, h("p", { class: "muted" }, "Rien n'a été modifié, car cela enfreindrait une règle :"),
          h("div", {}, errors.map((m) => h("div", { class: "issue erreur" }, h("span", { class: "ico" }, "!"), h("span", {}, m))))),
        actions: [{ label: "Compris", primary: true }],
      });
    },
    showImpacts(impacts, title) {
      const list = impacts.filter((x, i, a) => a.findIndex((y) => y.emp === x.emp && y.date === x.date) === i);
      const body = h("div", { class: "stack" },
        h("p", {}, `${list.length} créneau(x) déjà planifié(s) sont concernés. Ils n'ont pas été modifiés : choisissez quoi faire pour chacun.`),
        h("div", { class: "list" }, list.map((x) => {
          const row = h("div", { class: "item" },
            h("div", { class: "grow" }, h("b", {}, empName(this.state, x.emp)), " · ", C.fmtDate(x.date, "day"), h("div", { class: "row", style: { "margin-top": "4px" } }, x.segs.map((g) => blk(this.state, g)))),
            btn("Libérer le créneau", async (e) => {
              const r = await this.commit([{ type: "removeShift", emp: x.emp, date: x.date }], { summary: `${empName(this.state, x.emp)} · ${C.fmtDate(x.date, "short")} : créneau libéré (absence)`, noImpacts: true });
              if (r.ok) { e.target.closest(".item").replaceWith(h("div", { class: "item muted" }, `${empName(this.state, x.emp)} · ${C.fmtDate(x.date, "day")} : libéré. Le poste apparaît dans « Postes à pourvoir ».`)); }
            }, "sm"));
          return row;
        })));
      openDialog({ title: title || "Créneaux concernés", body, wide: true, actions: [{ label: "Voir le planning", onClick: () => { this.ui.monday = C.mondayOf(list[0].date); this.ui.day = list[0].date; this.go("week"); } }, { label: "Plus tard", primary: true }] });
    },

    // ---------- Annulation ----------
    describeUndo() { return this.history.find((e) => !e.undone && !e.tooBig && e.source !== "annulation" && e.changes && e.changes.length && "after" in e.changes[0]) || null; },
    async undo(entry) {
      entry = entry || this.describeUndo();
      if (!entry) { toast("Rien à annuler."); return; }
      if (!Store.canWrite) { toast(Store.readOnlyReason, "err"); return; }
      const current = (c) => (c.col === "weeks" ? this.state.weeks[c.id] : c.col === "absences" ? this.state.absences[c.id] : c.col === "adjustments" ? (this.state.adjustments || {})[c.id] : this.state[c.id]) || null;
      const drift = entry.changes.some((c) => JSON.stringify(current(c)) !== JSON.stringify(c.after));
      if (drift && !(await confirmDialog("Modifié depuis", "Ces éléments ont été modifiés après cette action. Revenir à l'état d'avant effacera aussi ces modifications plus récentes (elles restent dans l'historique). Continuer ?", "Revenir quand même", true))) return;
      const changes = entry.changes.map((c) => ({ col: c.col, id: c.id, before: current(c), after: c.before }));
      const prev = this.state;
      this.state = C.applyChanges(this.state, changes, "after");
      this.render();
      const ok = await this.persist(changes, "annulation", `Annulation : ${entry.summary}`);
      if (!ok) { this.state = prev; this.render(); return; }
      entry.undone = true;
      Store.updateLog("history", entry.id, { undone: true }).catch(() => {});
      toast(`Annulé : ${entry.summary.slice(0, 80)}`, "", { label: "Rétablir", fn: () => this.undo(this.history[0]) });
      this.render();
    },
    async saveVersion(monday, label) {
      const w = C.getWeek(this.state, monday);
      if (!w) return;
      const v = { id: C.uid("v"), at: new Date().toISOString(), by: this.userId(), week: monday, label: label || "Version enregistrée", data: C.clone(w) };
      try { await Store.addLog("versions", v); return true; } catch (e) { toast("La version n'a pas pu être enregistrée.", "err"); return false; }
    },

    // ---------- Navigation ----------
    go(screen) {
      this.ui.screen = screen;
      try { history.replaceState(null, "", "#" + screen); } catch (e) { /* ignoré */ }
      this.render();
      const c = document.querySelector(".content"); if (c) c.scrollTop = 0;
      root.scrollTo && root.scrollTo(0, 0);
    },
    toggleAI(open) {
      this.ui.aiOpen = open == null ? !this.ui.aiOpen : open;
      this.savePrefs();
      document.querySelector(".app").classList.toggle("with-ai", this.ui.aiOpen);
      this.renderAI();
      if (this.ui.aiOpen) setTimeout(() => { const t = document.querySelector("#ai-input"); if (t) t.focus(); }, 50);
    },

    renderShell() {
      const nav = (id, label, ic) => h("button", { type: "button", class: "nav", "data-screen": id, onClick: () => this.go(id) }, icon(ic), h("span", {}, label));
      const side = h("nav", { class: "side", "aria-label": "Navigation" },
        h("div", { class: "brand" }, h("b", {}, "Planning équipe"), h("span", { class: "tiny muted" }, "Zone aéroportuaire")),
        nav("dashboard", "Tableau de bord", "home"), nav("week", "Planning semaine", "week"), nav("month", "Planning du mois", "month"), nav("hours", "Heures par personne", "clock"),
        h("div", { class: "nav-group" }, "Organisation"),
        nav("absences", "Congés et absences", "leave"), nav("alternants", "Calendrier alternants", "school"), nav("team", "Équipe", "team"), nav("zones", "Zones et règles", "zones"),
        h("div", { class: "nav-group" }, "Données"),
        nav("history", "Historique", "history"), nav("import", "Importation", "import"), nav("export", "Exportation", "export"));
      const tab = (id, label, ic, fn) => h("button", { type: "button", "data-screen": id, onClick: fn || (() => this.go(id)) }, icon(ic), label);
      const tabbar = h("nav", { class: "tabbar", "aria-label": "Navigation" },
        tab("dashboard", "Accueil", "home"), tab("week", "Planning", "week"), tab("absences", "Absences", "leave"),
        tab("ai", "Assistant", "spark", () => this.toggleAI(true)), tab("more", "Plus", "menu", () => this.openMore()));
      const top = h("header", { class: "topbar" },
        h("div", { class: "title", id: "screen-title" }, ""),
        h("div", { class: "spacer" }),
        h("span", { id: "sync", class: "sync" }),
        iconBtn("undo", "Annuler la dernière modification", () => this.undo(), { id: "undo-btn" }),
        iconBtn("refresh", "Actualiser", () => this.refresh(), { id: "refresh-btn" }),
        h("button", { type: "button", class: "btn sm hide-sm", onClick: () => this.toggleAI() }, icon("spark"), "Assistant"));
      const shell = h("div", { class: "app" + (this.ui.aiOpen ? " with-ai" : "") },
        side,
        h("main", { class: "main" }, top, h("div", { class: "ptr", id: "ptr" }, "Relâchez pour actualiser"), h("div", { class: "content", id: "content" })),
        h("aside", { class: "ai", id: "ai", "aria-label": "Assistant IA", hidden: !this.ui.aiOpen }),
        tabbar);
      let mount = document.getElementById("app-root");
      if (!mount) { mount = h("div", { id: "app-root" }); document.body.append(mount); }
      mount.replaceChildren(shell);
    },
    openMore() {
      const items = [["hours", "Heures par personne", "clock"], ["month", "Planning du mois", "month"], ["alternants", "Calendrier alternants", "school"], ["team", "Équipe", "team"], ["zones", "Zones et règles", "zones"], ["history", "Historique", "history"], ["import", "Importation", "import"], ["export", "Exportation", "export"]];
      const d = openDialog({ title: "Plus", body: h("div", { class: "list" }, items.map(([id, label, ic]) => h("button", { type: "button", class: "nav", onClick: () => { d.close(); this.go(id); } }, icon(ic), label))), actions: [] });
    },

    render() {
      if (!document.querySelector("#content")) this.renderShell();
      const screen = SCREENS[this.ui.screen] ? this.ui.screen : "dashboard";
      document.querySelectorAll("[data-screen]").forEach((b) => b.setAttribute("aria-current", b.dataset.screen === screen ? "page" : "false"));
      const def = SCREENS[screen];
      document.querySelector("#screen-title").textContent = def.title;
      document.title = "Planning équipe";
      const undo = document.querySelector("#undo-btn"); if (undo) undo.disabled = !this.describeUndo() || !Store.canWrite;
      const content = document.querySelector("#content");
      const nodes = [];
      if (this.loadError) nodes.push(h("div", { class: "banner" }, `Les données n'ont pas pu être chargées (${this.loadError}). Vérifiez la connexion puis touchez Actualiser.`));
      if (!Store.canWrite) nodes.push(h("div", { class: "banner info" }, Store.readOnlyReason || "Lecture seule."));
      if (Store.mode === "local" && this.state) nodes.push(h("div", { class: "banner info small" }, "Données enregistrées sur ce téléphone. L'assistant IA et le partage avec l'équipe sont dans la ", h("a", { href: CLAUDE_URL, target: "_blank", rel: "noopener" }, "version Claude"), "."));
      if (Store.mode === "memoire") nodes.push(h("div", { class: "banner" }, "Le navigateur bloque l'enregistrement : vos modifications seront perdues en fermant la page."));
      for (const p of this.pendingRef || []) nodes.push(h("div", { class: "banner info row between" },
        h("span", {}, `Le planning papier de la semaine du ${C.fmtWeek(p.x.monday)} est disponible, mais cette semaine contient déjà des horaires.`),
        h("span", { class: "row" }, btn("Voir", () => { this.ui.monday = p.x.monday; this.go("week"); }, "sm ghost"), btn("Remplacer par le planning papier", () => this.applyRefWeek(p, true), "sm primary"), btn("Ignorer", () => { this.pendingRef = this.pendingRef.filter((y) => y !== p); this.render(); }, "sm"))));
      if (!this.ready) nodes.push(h("div", { class: "empty" }, "Chargement du planning…"));
      else if (!this.state && screen !== "import") nodes.push(h("div", { class: "empty" }, "Aucune donnée. ", btn("Importer les calendriers", () => this.go("import"), "primary")));
      else nodes.push(def.render.call(this));
      content.replaceChildren(...nodes);
      // Compteur d'erreurs sur la semaine en cours
      const wb = document.querySelector('.side [data-screen="week"]');
      if (wb && this.state) {
        const n = C.validateWeek(this.state, C.mondayOf(this.today())).filter((i) => i.level === "erreur").length;
        wb.querySelector(".count") && wb.querySelector(".count").remove();
        if (n) wb.append(h("span", { class: "count", title: `${n} erreur(s) cette semaine` }, n));
      }
    },

    installPullToRefresh() {
      let y0 = null, dy = 0;
      const ptr = document.querySelector("#ptr");
      root.addEventListener("touchstart", (e) => { y0 = (root.scrollY || document.documentElement.scrollTop) <= 0 && !document.querySelector(".overlay") ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
      root.addEventListener("touchmove", (e) => { if (y0 == null) return; dy = e.touches[0].clientY - y0; if (ptr) { ptr.style.height = Math.max(0, Math.min(56, dy / 2)) + "px"; ptr.textContent = dy > 110 ? "Relâchez pour actualiser" : "Tirez pour actualiser"; } }, { passive: true });
      root.addEventListener("touchend", () => { if (ptr) ptr.style.height = "0px"; if (y0 != null && dy > 110) this.refresh(); y0 = null; });
    },
  };

  // =====================================================================
  // Écrans
  // =====================================================================
  const SCREENS = {};

  // ---------- Tableau de bord ----------
  SCREENS.dashboard = { title: "Tableau de bord", render() {
    const s = this.state, today = this.today(), monday = C.mondayOf(today), next = C.addDays(monday, 7);
    const w = C.getWeek(s, monday), wn = C.getWeek(s, next);
    const iss = C.validateWeek(s, monday);
    const errs = iss.filter((i) => i.level === "erreur"), alerts = iss.filter((i) => i.level === "alerte");
    const open = C.uncoveredPosts(s, monday);
    const totalMin = w ? w.shifts.reduce((a, x) => a + C.shiftMinutes(x.segs), 0) : 0;
    const todayShifts = w ? w.shifts.filter((x) => x.date === today).sort((a, b) => a.segs[0].s.localeCompare(b.segs[0].s)) : [];
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const isNow = (x) => C.shiftRanges(x.segs).some(([a, b]) => a <= nowMin && nowMin < b);
    const statusChip = (wk) => !wk || !wk.shifts.length ? h("span", { class: "chip" }, "Pas encore créée") : wk.status === "validé" ? h("span", { class: "chip ok" }, "Validée") : h("span", { class: "chip warn" }, "Brouillon");
    const absUp = Object.values(s.absences).filter((a) => a.to >= today && a.from <= C.addDays(today, 30)).sort((a, b) => a.from.localeCompare(b.from));
    const altern = s.employees.filter((e) => e.role === "alternant" && e.active !== false);
    const pending = s.employees.filter((e) => e.active !== false && !e.onLeave && (Object.values(e.zones || {}).includes("incertain") || !Object.keys(e.zones || {}).length)).length;

    return h("div", { class: "stack", style: { gap: "20px" } },
      h("div", { class: "stack", style: { gap: "4px" } }, h("h1", {}, C.fmtDate(today, "day").replace(/^./, (c) => c.toUpperCase())), h("p", { class: "muted" }, `Semaine ${C.isoWeekNumber(today)} · ${C.fmtWeek(monday)}`)),
      (pending || !s.settings.rulesConfirmed) ? h("div", { class: "card", style: { "border-color": "var(--warn)" } }, h("div", { class: "row between" },
        h("div", { class: "stack", style: { gap: "4px" } }, h("h3", {}, "Informations à confirmer"),
          h("p", { class: "small muted" }, `${pending ? `Zones à confirmer ou inconnues : ${s.employees.filter((e) => e.active !== false && !e.onLeave && (Object.values(e.zones || {}).includes("incertain") || !Object.keys(e.zones || {}).length)).map((e) => e.name).join(", ")}. ` : ""}${!s.settings.rulesConfirmed ? "Les règles de repos et de durée sont des valeurs par défaut." : ""}`)),
        h("div", { class: "row" }, btn("Voir les questions", () => this.go("import"), "sm"), btn("Zones et règles", () => this.go("zones"), "sm")))) : null,
      h("div", { class: "cards" },
        h("section", { class: "card" }, h("div", { class: "row between" }, h("h2", {}, "Aujourd'hui"), h("span", { class: "chip" }, `${todayShifts.length} personne(s)`)),
          !w ? h("div", { class: "stack" }, h("p", { class: "muted" }, "Aucun planning cette semaine."), btn("Générer la semaine", () => this.openGenerate(), "primary")) :
            todayShifts.length ? h("div", { class: "list" }, todayShifts.map((x) => h("div", { class: "item", style: { cursor: "pointer" }, onClick: () => this.openEditor(x.emp, x.date) },
              h("div", { class: "grow" }, h("b", {}, empName(s, x.emp)), isNow(x) ? h("span", { class: "chip ok", style: { "margin-left": "8px" } }, "en poste") : null),
              h("div", { class: "stack", style: { gap: "3px" } }, x.segs.map((g) => blk(s, g)))))) : h("p", { class: "muted" }, "Personne n'est planifié aujourd'hui.")),
        h("section", { class: "card" }, h("div", { class: "row between" }, h("h2", {}, "Cette semaine"), statusChip(w)),
          h("div", { class: "kpis" },
            h("div", { class: "kpi" }, h("b", {}, C.fmtHours(totalMin)), h("span", {}, "heures planifiées")),
            h("div", { class: "kpi" }, h("b", { style: { color: errs.length ? "var(--danger)" : "inherit" } }, errs.length), h("span", {}, "erreurs")),
            h("div", { class: "kpi" }, h("b", {}, alerts.length), h("span", {}, "alertes")),
            h("div", { class: "kpi" }, h("b", {}, open.length), h("span", {}, "postes à pourvoir"))),
          errs.slice(0, 3).map((i) => h("div", { class: "issue erreur" }, h("span", { class: "ico" }, "!"), h("span", { class: "small" }, i.msg))),
          h("div", { class: "row", style: { "margin-top": "12px" } }, btn("Ouvrir le planning", () => { this.ui.monday = monday; this.go("week"); }, "primary"))),
        (() => {
          const months = lastMonths(today, 3).slice(1);
          return h("section", { class: "card" }, h("h2", {}, "Les 2 derniers mois"),
            h("div", { class: "list" }, months.map((k) => {
              const [yy, mm] = k.split("-").map(Number);
              const to = `${k}-${String(new Date(Date.UTC(yy, mm, 0)).getUTCDate()).padStart(2, "0")}`;
              const tot = s.employees.reduce((a, e) => a + C.hoursSummary(s, e.id, `${k}-01`, to).total, 0);
              return h("button", { type: "button", class: "item name-btn", style: { display: "flex" }, onClick: () => { this.ui.month = k; this.go("month"); } },
                h("b", { class: "grow", style: { "text-transform": "capitalize" } }, monthName(k)),
                h("span", { class: "small muted num" }, tot ? `${C.fmtHours(tot)} au total` : "aucun planning enregistré"), icon("right"));
            })),
            h("p", { class: "small muted", style: { "margin-top": "8px" } }, "Plannings, horaires, heures sup et retards restent consultables sans limite de durée."));
        })(),
        h("section", { class: "card" }, h("div", { class: "row between" }, h("h2", {}, "Semaine prochaine"), statusChip(wn)),
          h("p", { class: "muted small" }, C.fmtWeek(next)),
          h("div", { class: "row", style: { "margin-top": "12px" } },
            wn && wn.shifts.length ? btn("Ouvrir", () => { this.ui.monday = next; this.go("week"); }, "primary") : btn("Générer à partir du modèle", () => { this.ui.monday = next; this.openGenerate(); }, "primary"))),
        h("section", { class: "card" }, h("div", { class: "row between" }, h("h2", {}, "Absences à venir"), btn("Gérer", () => this.go("absences"), "sm ghost")),
          absUp.length ? h("div", { class: "list" }, absUp.slice(0, 6).map((a) => h("div", { class: "item" }, h("div", { class: "grow" }, h("b", {}, empName(s, a.emp)), h("div", { class: "small muted" }, C.ABSENCE_TYPES[a.type])), h("span", { class: "small num" }, a.from === a.to ? C.fmtDate(a.from, "short") : `${C.fmtDate(a.from, "short")} → ${C.fmtDate(a.to, "short")}`)))) : h("p", { class: "muted" }, "Aucune absence enregistrée dans les 30 prochains jours.")),
        h("section", { class: "card" }, h("div", { class: "row between" }, h("h2", {}, "Alternants"), btn("Calendrier", () => this.go("alternants"), "sm ghost")),
          h("div", { class: "list" }, altern.map((e) => {
            const days = Array.from({ length: 14 }, (_, i) => C.addDays(today, i)).filter((d) => C.calStatus(s, e, d) === "formation");
            const unk = Array.from({ length: 14 }, (_, i) => C.addDays(today, i)).some((d) => C.calStatus(s, e, d) === "inconnu");
            // Prénom sur sa propre ligne, jours de CFA en dessous : le prénom n'est jamais coupé.
            return h("div", { class: "item alt-item" }, h("b", {}, e.name),
              h("span", { class: "small" }, days.length ? h("span", { class: "chip cours" }, `CFA : ${days.map((d) => C.DAYS_SHORT[C.dow(d)].toLowerCase() + " " + C.fmtDate(d, "short")).join(", ")}`) : unk ? h("span", { class: "chip warn" }, "Calendrier incomplet") : h("span", { class: "muted" }, "Pas de cours sous 14 jours")));
          })))));
  } };

  // ---------- Planning de la semaine (et édition) ----------
  SCREENS.week = { title: "Planning semaine", render() {
    const s = this.state, monday = this.ui.monday, today = this.today();
    const w = C.getWeek(s, monday);
    const grid = C.weekGrid(s, monday);
    const issues = C.validateWeek(s, monday);
    const open = C.uncoveredPosts(s, monday);
    const errs = issues.filter((i) => i.level === "erreur"), alerts = issues.filter((i) => i.level === "alerte");
    const cellIssue = {}; for (const i of issues) if (i.emp && i.date && i.level !== "info") { const k = i.emp + "|" + i.date; cellIssue[k] = cellIssue[k] === "erreur" ? "erreur" : i.level; }
    const canEdit = Store.canWrite;
    if (!grid.days.includes(this.ui.day)) this.ui.day = grid.days.includes(today) ? today : monday;

    const status = !w || !w.shifts.length ? h("span", { class: "chip" }, "Vide") : w.status === "validé" ? h("span", { class: "chip ok" }, "Validée") : h("span", { class: "chip warn" }, "Brouillon");
    const head = h("div", { class: "week-head" },
      h("div", { class: "when" }, iconBtn("left", "Semaine précédente", () => { this.ui.monday = C.addDays(monday, -7); this.render(); }), iconBtn("right", "Semaine suivante", () => { this.ui.monday = C.addDays(monday, 7); this.render(); })),
      h("div", { class: "stack", style: { gap: "0" } }, h("h1", {}, C.fmtWeek(monday)), h("span", { class: "small muted" }, `Semaine ${C.isoWeekNumber(monday)}${w && w.source ? " · " + w.source : ""}`)),
      iconBtn("download", "Télécharger le planning de la semaine en PDF", () => this.downloadPDF([monday], `planning-semaine-${monday}.pdf`), { class: "icon-btn dl-btn", id: "dl-week" }),
      status,
      monday !== C.mondayOf(today) ? btn("Aujourd'hui", () => { this.ui.monday = C.mondayOf(today); this.ui.day = today; this.render(); }, "sm ghost") : null,
      h("div", { style: { flex: "1" } }),
      h("div", { class: "seg-ctl", role: "group", "aria-label": "Affichage" },
        h("button", { type: "button", "aria-pressed": String(this.ui.view === "grid"), onClick: () => { this.ui.view = "grid"; this.savePrefs(); this.render(); } }, "Semaine"),
        h("button", { type: "button", "aria-pressed": String(this.ui.view === "day"), onClick: () => { this.ui.view = "day"; this.savePrefs(); this.render(); } }, "Jour")));
    const actions = h("div", { class: "row" },
      canEdit ? btn([icon("wand"), "Générer"], () => this.openGenerate(), "primary sm") : null,
      canEdit && w && w.shifts.length ? btn([icon("check"), w.status === "validé" ? "Repasser en brouillon" : "Valider"], () => this.openValidate(), "sm") : null,
      canEdit ? btn([icon("plus"), "Créneau"], () => this.openEditor(null, this.ui.day), "sm") : null,
      btn("Exporter", () => this.go("export"), "sm ghost"),
      canEdit ? h("button", { type: "button", class: "btn sm ghost", onClick: (e) => this.weekMenu(e.currentTarget) }, icon("more"), "Plus") : null);

    // Grille
    let dragFrom = null;
    const table = h("table", { class: "plan" },
      h("thead", {}, h("tr", {}, h("th", { class: "name" }, "Équipe"),
        grid.days.map((d) => {
          const shifts = w ? w.shifts.filter((x) => x.date === d) : [];
          const byZone = {}; for (const x of shifts) for (const z of new Set(x.segs.map((g) => g.z))) byZone[z] = (byZone[z] || 0) + 1;
          return h("th", { class: d === today ? "today" : "" }, h("span", {}, C.DAYS[C.dow(d)]), h("span", { class: "d" }, C.fmtDate(d, "short")),
            h("span", { class: "cnt" }, s.zones.filter((z) => byZone[z.id]).map((z) => h("span", { class: `blk ${zoneStyle(s, z.id).cls}`, style: { "--z": z.color, padding: "0 5px" }, title: `${byZone[z.id]} en ${z.name}` }, h("small", {}, `${z.short} ${byZone[z.id]}`)))));
        }),
        h("th", { class: "tot" }, "Total"))),
      h("tbody", {}, grid.rows.map((row) => h("tr", { class: row.emp.active === false ? "inactive" : "" },
        h("td", { class: "name" }, h("button", { type: "button", class: "name-btn", onClick: () => this.openPerson(row.emp.id, "week"), title: `Heures de ${row.emp.name}` }, h("b", {}, row.emp.name), h("span", {}, row.emp.role === "alternant" ? "Alternant(e)" : Object.keys(row.emp.zones || {}).join(" · ") || "zone ?"))),
        row.cells.map((cell) => {
          const k = row.emp.id + "|" + cell.date, lvl = cellIssue[k];
          const kids = [];
          if (cell.shift) {
            kids.push(h("div", { class: "stack" }, cell.shift.segs.map((g) => blk(s, g))));
          } else {
            if (cell.absences.length) kids.push(h("span", { class: "tag-abs" }, C.ABSENCE_TYPES[cell.absences[0].type]));
            if (cell.cal === "formation") kids.push(h("span", { class: "tag-cours" }, "Cours CFA"));
            else if (cell.cal === "inconnu") kids.push(h("span", { class: "tag-unk", title: "Statut d'alternance inconnu ce jour-là" }, "?"));
            if (canEdit && !cell.absences.length && cell.cal !== "formation") kids.push(h("span", { class: "add", "aria-hidden": "true" }, "+"));
          }
          if (cell.shift && cell.cal === "formation") kids.push(h("span", { class: "tag-cours" }, "Cours CFA !"));
          if (cell.shift && cell.absences.length) kids.push(h("span", { class: "tag-abs" }, C.ABSENCE_TYPES[cell.absences[0].type] + " !"));
          if (lvl) kids.push(h("span", { class: "flag" + (lvl === "alerte" ? " warn" : ""), title: issues.filter((i) => i.emp === row.emp.id && i.date === cell.date).map((i) => i.msg).join("\n") }, lvl === "erreur" ? "!" : "?"));
          const td = h("td", {
            class: `cell${cell.date === today ? " today" : ""}${lvl === "erreur" ? " has-err" : ""}`,
            tabindex: "0", role: "button",
            "aria-label": `${row.emp.name}, ${C.fmtDate(cell.date, "day")} : ${cell.shift ? C.segLabel(cell.shift.segs) : "libre"}`,
            draggable: canEdit && cell.shift ? "true" : null,
            onClick: () => { if (canEdit || cell.shift) this.openEditor(row.emp.id, cell.date); },
            onKeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.openEditor(row.emp.id, cell.date); } },
            onDragstart: (e) => { dragFrom = { emp: row.emp.id, date: cell.date }; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", k); } catch (er) { /* ignoré */ } },
            onDragover: (e) => { if (dragFrom) { e.preventDefault(); td.classList.add("drop"); } },
            onDragleave: () => td.classList.remove("drop"),
            onDrop: async (e) => {
              e.preventDefault(); td.classList.remove("drop");
              const from = dragFrom; dragFrom = null;
              if (!from || (from.emp === row.emp.id && from.date === cell.date)) return;
              if (cell.shift) {
                const ok = await confirmDialog("Échanger les créneaux ?", `${row.emp.name} travaille déjà le ${C.fmtDate(cell.date, "day")}. Échanger les deux créneaux ?`, "Échanger");
                if (!ok) return;
                this.commit([{ type: "moveShift", emp: from.emp, date: from.date, toEmp: row.emp.id, toDate: cell.date, swap: true }]);
              } else this.commit([{ type: "moveShift", emp: from.emp, date: from.date, toEmp: row.emp.id, toDate: cell.date }]);
            },
          }, kids);
          return td;
        }),
        h("td", { class: "tot" }, row.minutes ? C.fmtHours(row.minutes) : "—")))));

    // Vue jour
    const dayView = () => {
      const d = this.ui.day;
      const shifts = (w ? w.shifts.filter((x) => x.date === d) : []).sort((a, b) => a.segs[0].s.localeCompare(b.segs[0].s));
      const off = s.employees.filter((e) => e.active !== false && !shifts.some((x) => x.emp === e.id));
      const absent = off.filter((e) => C.absencesOn(s, e.id, d).length || C.calStatus(s, e, d) === "formation");
      const posts = open.filter((u) => u.date === d);
      const groups = s.zones.map((z) => ({ z, list: shifts.filter((x) => x.segs[0].z === z.id) })).filter((g) => g.list.length);
      return h("div", { class: "stack" },
        h("div", { class: "daybar", role: "group", "aria-label": "Jour" }, grid.days.map((x) => h("button", { type: "button", "aria-pressed": String(x === d), onClick: () => { this.ui.day = x; this.render(); } }, C.DAYS_SHORT[C.dow(x)], h("b", {}, Number(x.slice(8))), h("span", { class: "tiny" }, `${w ? w.shifts.filter((y) => y.date === x).length : 0} pers.`)))),
        h("div", { class: "card", style: { padding: "0" } },
          shifts.length ? groups.map((g) => [
            h("div", { class: "zone-title" }, zoneTag(s, g.z.id), g.z.name, h("span", { class: "muted small" }, `· début de service`)),
            g.list.map((x) => {
              const lvl = cellIssue[x.emp + "|" + d];
              const p = C.pauses(x.segs);
              return h("div", { class: "shift-row", role: "button", tabindex: "0", onClick: () => this.openEditor(x.emp, d), onKeydown: (e) => { if (e.key === "Enter") this.openEditor(x.emp, d); } },
                h("div", { class: "who" }, h("button", { type: "button", class: "name-btn inline", onClick: (ev) => { ev.stopPropagation(); this.openPerson(x.emp, "week"); }, title: "Heures de la semaine" }, empName(s, x.emp)), lvl ? h("span", { class: "chip " + (lvl === "erreur" ? "err" : "warn"), style: { "margin-left": "6px" } }, lvl === "erreur" ? "!" : "?") : null),
                h("div", { class: "blocks" }, x.segs.map((g) => blk(s, g)), p.length ? h("span", { class: "pause" }, `Pause ${p.map((y) => `${y.s}–${y.e}`).join(", ")}`) : null),
                h("span", { class: "small num muted" }, C.fmtHours(C.shiftMinutes(x.segs))));
            })]) : h("div", { class: "empty", style: { border: "0" } }, w ? "Personne ce jour-là." : "Aucun planning pour cette semaine.")),
        absent.length ? h("div", { class: "card" }, h("h3", {}, "Absents ou en cours"), h("div", { class: "row", style: { "margin-top": "8px" } }, absent.map((e) => h("span", { class: C.calStatus(s, e, d) === "formation" ? "chip cours" : "chip" }, `${e.name} · ${C.absencesOn(s, e.id, d)[0] ? C.ABSENCE_TYPES[C.absencesOn(s, e.id, d)[0].type] : "CFA"}`)))) : null,
        posts.length ? h("div", { class: "card" }, h("h3", {}, "Postes à pourvoir ce jour"), this.postsList(posts)) : null);
    };

    const issuesCard = h("section", { class: "card" },
      h("div", { class: "row between" }, h("h2", {}, "Points à vérifier"), h("div", { class: "row" }, errs.length ? h("span", { class: "chip err" }, `${errs.length} erreur(s)`) : h("span", { class: "chip ok" }, "Aucune erreur"), alerts.length ? h("span", { class: "chip warn" }, `${alerts.length} alerte(s)`) : null)),
      issues.filter((i) => i.level !== "info" && i.code !== "UNCOVERED").length ? h("div", {}, issues.filter((i) => i.level !== "info" && i.code !== "UNCOVERED").slice(0, 40).map((i) => h("div", { class: "issue " + i.level, role: i.emp && i.date ? "button" : null, style: { cursor: i.emp && i.date ? "pointer" : "default" }, onClick: () => { if (i.emp && i.date) this.openEditor(i.emp, i.date); } }, h("span", { class: "ico" }, i.level === "erreur" ? "!" : "?"), h("span", {}, i.msg)))) : h("p", { class: "muted" }, w ? "Tout est cohérent avec les règles enregistrées." : "Rien à vérifier : la semaine est vide."),
      issues.some((i) => i.level === "info") ? h("details", { style: { "margin-top": "10px" } }, h("summary", { class: "small muted" }, `${issues.filter((i) => i.level === "info").length} information(s)`), issues.filter((i) => i.level === "info").map((i) => h("div", { class: "small muted", style: { padding: "3px 0" } }, i.msg))) : null);
    const postsCard = open.length ? h("section", { class: "card" }, h("div", { class: "row between" }, h("h2", {}, "Postes à pourvoir"), h("span", { class: "chip warn" }, open.length)),
      h("p", { class: "small muted" }, "Postes du planning modèle sans personne cette semaine. Les remplaçants proposés respectent zones, cours, absences, repos et durée : rien n'est attribué sans votre clic."),
      this.postsList(open)) : null;

    return h("div", { class: "stack", style: { gap: "16px" } },
      head, actions, legend(s),
      !w || !w.shifts.length ? h("div", { class: "empty" }, h("p", {}, "Aucun horaire pour cette semaine."), canEdit ? h("div", { class: "row", style: { "justify-content": "center", "margin-top": "12px" } }, btn("Générer à partir du modèle", () => this.openGenerate(), "primary"), btn("Dupliquer la semaine précédente", () => this.duplicateFrom(C.addDays(monday, -7), monday), "")) : null) : null,
      this.ui.view === "grid" ? h("div", { class: "grid-wrap" }, table) : dayView(),
      postsCard, issuesCard);
  } };

  App.postsList = function (posts) {
    const s = this.state;
    return h("div", {}, posts.map((u) => {
      const cands = C.findCandidates(s, u.date, u.segs, { exclude: [u.templateEmp] }).slice(0, 4);
      return h("div", { class: "post" },
        h("div", { class: "row between" }, h("div", {}, h("b", {}, C.fmtDate(u.date, "day")), h("div", { class: "small muted" }, `Habituellement ${empName(s, u.templateEmp)} — ${u.reason}`)), h("div", { class: "row" }, u.segs.map((g) => blk(s, g)))),
        cands.length ? h("div", { class: "row" }, h("span", { class: "small muted" }, "Remplaçants possibles :"), cands.map((c) => btn(`${c.name} · ${C.fmtHours(c.weekMinutes)}${c.notes.length ? " ⚠" : ""}`, async () => {
          const ok = await confirmDialog(`Attribuer à ${c.name} ?`, `${c.name} travaillera le ${C.fmtDate(u.date, "day")} de ${C.segLabel(u.segs)}. Cette semaine : ${C.fmtHours(c.weekMinutes)} actuellement, ${C.fmtHours(c.refMinutes)} dans le modèle.${c.notes.length ? "\nÀ noter : " + c.notes.join(", ") + "." : ""}`, "Attribuer");
          if (ok) this.commit([{ type: "setShift", emp: c.emp, date: u.date, segs: u.segs }], { summary: `${c.name} remplace ${empName(s, u.templateEmp)} le ${C.fmtDate(u.date, "short")}` });
        }, "sm", { title: c.notes.join(", ") || "Aucune remarque" }))) : h("p", { class: "small", style: { color: "var(--danger)" } }, "Personne ne peut prendre ce poste sans enfreindre une règle. Pistes : vérifier les zones autorisées (écran Zones), ajouter une personne, ou modifier les horaires."));
    }));
  };

  App.weekMenu = function (anchor) {
    const monday = this.ui.monday, s = this.state, w = C.getWeek(s, monday);
    const items = [
      ["Dupliquer cette semaine vers…", () => this.openDuplicate()],
      ["Copier un jour vers un autre…", () => this.openCopyDay()],
      ["Enregistrer une version", async () => { if (await this.saveVersion(monday, "Version enregistrée manuellement")) toast("Version enregistrée. Retrouvez-la dans Historique."); }],
      ["Utiliser cette semaine comme modèle", () => this.useAsTemplate()],
      ["Vider la semaine", async () => {
        if (!w || !w.shifts.length) return;
        if (!(await confirmDialog("Vider la semaine ?", `Les ${w.shifts.length} créneaux de la semaine du ${C.fmtWeek(monday)} seront supprimés. Une version est enregistrée avant, et l'action peut être annulée.`, "Vider", true))) return;
        await this.saveVersion(monday, "Avant suppression de la semaine");
        this.commit([{ type: "putWeek", monday, week: { ...C.emptyWeek(monday), source: "vidée" } }], { summary: `Semaine du ${C.fmtWeek(monday)} vidée` });
      }],
    ];
    const d = openDialog({ title: "Actions sur la semaine", body: h("div", { class: "list" }, items.map(([label, fn]) => h("button", { type: "button", class: "nav", onClick: () => { d.close(); fn(); } }, label))), actions: [] });
    void anchor;
  };

  App.duplicateFrom = async function (from, to) {
    const src = C.getWeek(this.state, from);
    if (!src || !src.shifts.length) { toast("La semaine précédente est vide."); return; }
    const r = await this.commit([{ type: "duplicateWeek", from, to, replace: false }], { errorTitle: "Duplication impossible telle quelle" });
    if (r.ok) toast("Semaine dupliquée en brouillon.");
    else if (r.errors && r.errors.some((m) => /formation|absent/.test(m))) toast("Certains créneaux tombent sur des cours ou absences : utilisez plutôt « Générer », qui les écarte et les signale.", "err");
  };
  App.openDuplicate = function () {
    const monday = this.ui.monday;
    const input = h("input", { type: "date", class: "input", value: C.addDays(monday, 7), id: "dup-to" });
    const rep = h("input", { type: "checkbox", id: "dup-rep" });
    openDialog({ title: "Dupliquer la semaine", body: h("div", { class: "stack" },
      h("p", { class: "muted small" }, `Copie tous les créneaux de la semaine du ${C.fmtWeek(monday)} vers la semaine choisie (en brouillon). Les créneaux qui tomberaient sur des cours, des absences ou une zone interdite bloquent la copie : utilisez alors « Générer ».`),
      h("label", { class: "f" }, "Vers la semaine du", input), h("label", { class: "check" }, rep, "Remplacer les horaires déjà présents (une version est enregistrée avant)")),
      actions: [{ label: "Annuler" }, { label: "Dupliquer", primary: true, onClick: async () => {
        if (!C.isISO(input.value)) { toast("Date invalide.", "err"); return false; }
        const to = C.mondayOf(input.value);
        if (rep.checked && C.getWeek(this.state, to)) await this.saveVersion(to, "Avant duplication");
        const r = await this.commit([{ type: "duplicateWeek", from: monday, to, replace: rep.checked }], { errorTitle: "Duplication impossible" });
        if (r.ok) { this.ui.monday = to; this.render(); toast("Semaine dupliquée."); }
        return r.ok;
      } }] });
  };
  App.openCopyDay = function () {
    const days = C.weekDates(this.ui.monday);
    const opt = (d) => h("option", { value: d }, C.fmtDate(d, "day"));
    const from = h("select", { class: "input", id: "cp-from" }, days.map(opt));
    const to = h("input", { type: "date", class: "input", id: "cp-to", value: days[1] });
    const rep = h("input", { type: "checkbox", id: "cp-rep" });
    from.value = this.ui.day;
    openDialog({ title: "Copier un jour", body: h("div", { class: "form-grid" }, h("label", { class: "f" }, "Copier le", from), h("label", { class: "f" }, "Vers le", to), h("label", { class: "check" }, rep, "Remplacer les créneaux existants ce jour-là")),
      actions: [{ label: "Annuler" }, { label: "Copier", primary: true, onClick: async () => { const r = await this.commit([{ type: "copyDay", from: from.value, to: to.value, replace: rep.checked }], { errorTitle: "Copie impossible" }); return r.ok; } }] });
  };
  App.useAsTemplate = async function () {
    const w = C.getWeek(this.state, this.ui.monday);
    if (!w || !w.shifts.length) { toast("Semaine vide."); return; }
    if (!(await confirmDialog("Remplacer le planning modèle ?", `Le modèle actuel (« ${this.state.template.label || "modèle"} ») sera remplacé par la semaine du ${C.fmtWeek(this.ui.monday)}. Les futures générations s'en serviront. L'ancien modèle reste dans l'historique.`, "Remplacer le modèle"))) return;
    const template = { label: `Semaine du ${C.fmtWeek(this.ui.monday)}`, referenceWeek: this.ui.monday, shifts: w.shifts.map((x) => ({ emp: x.emp, dow: C.dow(x.date), segs: x.segs.map(({ s, e, z }) => ({ s, e, z })) })) };
    this.commit([{ type: "setTemplate", template }]);
  };

  // ---------- Éditeur de créneau ----------
  App.openEditor = function (empId, date) {
    const s = this.state, canEdit = Store.canWrite;
    let emp = empId ? C.empById(s, empId) : null;
    const w = C.getWeek(s, C.mondayOf(date));
    let existing = emp && w ? w.shifts.find((x) => x.emp === emp.id && x.date === date) : null;
    let segs = existing ? existing.segs.map((g) => ({ ...g })) : [];
    let note = existing && existing.note || "";
    const body = h("div", { class: "stack" });
    let dlg;
    const presetsFor = () => {
      const keys = new Map();
      for (const t of s.template.shifts) if (t.dow === C.dow(date) && (!emp || t.segs.every((g) => C.zoneLevel(emp, g.z)))) keys.set(C.segKey(t.segs), t.segs);
      if (emp) for (const t of s.template.shifts) if (t.emp === emp.id) keys.set(C.segKey(t.segs), t.segs);
      return [...keys.values()].map((x) => x.map(({ s: a, e, z }) => ({ s: a, e, z }))).slice(0, 8);
    };
    const draw = () => {
      const kids = [];
      if (!emp) {
        const sel = h("select", { class: "input", id: "ed-emp", onChange: () => { emp = C.empById(s, sel.value); existing = emp && w ? w.shifts.find((x) => x.emp === emp.id && x.date === date) : null; segs = existing ? existing.segs.map((g) => ({ ...g })) : []; draw(); } },
          h("option", { value: "" }, "Choisir une personne…"), s.employees.filter((e) => e.active !== false).map((e) => h("option", { value: e.id }, e.name)));
        const dateIn = h("input", { type: "date", class: "input", id: "ed-date", value: date, onChange: () => { if (C.isISO(dateIn.value)) { date = dateIn.value; draw(); } } });
        kids.push(h("div", { class: "form-grid" }, h("label", { class: "f" }, "Personne", sel), h("label", { class: "f" }, "Date", dateIn)));
        body.replaceChildren(...kids);
        dlg && dlg.setActions([{ label: "Fermer" }]);
        return;
      }
      const cs = C.calStatus(s, emp, date), abs = C.absencesOn(s, emp.id, date);
      const zones = C.allowedZones(emp);
      kids.push(h("div", { class: "row" },
        emp.role === "alternant" ? h("span", { class: cs === "formation" ? "chip cours" : cs === "inconnu" ? "chip warn" : "chip" }, C.CAL_LABELS[cs]) : null,
        abs.map((a) => h("span", { class: "chip err" }, `${C.ABSENCE_TYPES[a.type]} (${C.absenceDates(a)})`)),
        h("span", { class: "small muted" }, "Zones autorisées :"), zones.length ? zones.map((z) => zoneTag(s, z)) : h("span", { class: "chip warn" }, "aucune — à définir dans Zones")));
      if (!canEdit) {
        kids.push(segs.length ? h("div", { class: "stack" }, segs.map((g) => blk(s, g))) : h("p", { class: "muted" }, "Pas de créneau."));
        body.replaceChildren(...kids); return;
      }
      // Blocs
      segs.forEach((g, i) => {
        const sIn = h("input", { type: "time", class: "input", value: g.s, step: "300", "aria-label": `Début du bloc ${i + 1}`, onChange: (e) => { g.s = e.target.value; refreshCheck(); } });
        const eIn = h("input", { type: "time", class: "input", value: g.e, step: "300", "aria-label": `Fin du bloc ${i + 1}`, onChange: (e) => { g.e = e.target.value; refreshCheck(); } });
        const zp = h("div", { class: "zone-pick", role: "group", "aria-label": "Zone" }, s.zones.map((z) => h("button", {
          type: "button", style: { "--z": z.color }, "aria-pressed": String(g.z === z.id), disabled: !C.zoneLevel(emp, z.id),
          title: C.zoneLevel(emp, z.id) ? z.name + (C.zoneLevel(emp, z.id) === "incertain" ? " (à confirmer)" : "") : `${emp.name} n'est pas autorisé(e) en ${z.name}. Modifiez la règle dans l'écran Zones.`,
          onClick: () => { g.z = z.id; draw(); },
        }, z.short)));
        kids.push(h("div", { class: "seg-edit" }, h("label", { class: "f" }, i ? `Reprise ${i}` : "Début", sIn), h("label", { class: "f" }, "Fin", eIn), h("div", { class: "f" }, h("span", {}, "Zone"), zp), iconBtn("close", "Retirer ce bloc", () => { segs.splice(i, 1); draw(); })));
      });
      kids.push(h("div", { class: "row" }, btn([icon("plus"), segs.length ? "Ajouter un bloc après une pause" : "Ajouter un horaire"], () => {
        const last = segs[segs.length - 1];
        const st = last && C.isTime(last.e) ? C.fromMin(C.toMin(last.e) + 30) : "09:00";
        segs.push({ s: st, e: C.fromMin(C.toMin(st) + 180), z: zones.length === 1 ? zones[0] : (last && last.z) || zones[0] || "" });
        draw();
      }, "sm")));
      const presets = presetsFor();
      if (presets.length) kids.push(h("div", { class: "stack", style: { gap: "6px" } }, h("span", { class: "small muted" }, "Horaires habituels (modèle) :"), h("div", { class: "suggest" }, presets.map((p) => h("button", { type: "button", onClick: () => { segs = p.map((g) => ({ ...g })); draw(); } }, `${C.segLabel(p)} ${[...new Set(p.map((g) => g.z))].join("/")}`)))));
      kids.push(h("label", { class: "f" }, "Note (facultatif, non transmise à l'IA)", h("input", { class: "input", id: "ed-note", value: note, maxlength: "200", onInput: (e) => { note = e.target.value; } })));
      const check = h("div", { id: "ed-check" });
      kids.push(check);
      // Déplacer / copier
      if (existing) {
        const toEmp = h("select", { class: "input", id: "ed-move-emp" }, s.employees.filter((e) => e.active !== false).map((e) => h("option", { value: e.id, selected: e.id === emp.id }, e.name)));
        const toDate = h("input", { type: "date", class: "input", id: "ed-move-date", value: date });
        kids.push(h("details", {}, h("summary", { class: "small" }, "Déplacer ou copier ce créneau"),
          h("div", { class: "form-grid", style: { "margin-top": "10px" } }, h("label", { class: "f" }, "Vers", toEmp), h("label", { class: "f" }, "Le", toDate),
            h("div", { class: "row" },
              btn("Déplacer", async () => { const r = await this.commit([{ type: "moveShift", emp: emp.id, date, toEmp: toEmp.value, toDate: toDate.value }], { errorTitle: "Déplacement impossible" }); if (r.ok) dlg.close(); }, "sm"),
              btn("Copier", async () => { const r = await this.commit([{ type: "setShift", emp: toEmp.value, date: toDate.value, segs: existing.segs.map(({ s: a, e, z }) => ({ s: a, e, z })) }], { errorTitle: "Copie impossible" }); if (r.ok) toast("Créneau copié."); }, "sm")))));
      }
      body.replaceChildren(...kids);
      refreshCheck();
    };
    const refreshCheck = () => {
      const box = body.querySelector("#ed-check");
      if (!box || !emp) return;
      const ops = segs.length ? [{ type: "setShift", emp: emp.id, date, segs, note }] : existing ? [{ type: "removeShift", emp: emp.id, date }] : [];
      if (!ops.length) { box.replaceChildren(); return; }
      const r = C.applyOps(s, ops, {});
      const total = C.shiftMinutes(segs.filter((g) => C.isTime(g.s) && C.isTime(g.e)));
      const p = segs.every((g) => C.isTime(g.s) && C.isTime(g.e)) ? C.pauses(segs) : [];
      const lines = [h("div", { class: "row small" }, h("b", {}, `Total ${C.fmtHours(total)}`), p.length ? h("span", { class: "muted" }, `· pause ${p.map((x) => `${x.s}–${x.e} (${x.min} min)`).join(", ")}`) : null)];
      if (!r.ok) lines.push(...r.errors.map((m) => h("div", { class: "issue erreur" }, h("span", { class: "ico" }, "!"), h("span", {}, m))));
      else lines.push(...r.issues.filter((i) => i.emp === emp.id && (i.date === date || !i.date) && i.level === "alerte").map((i) => h("div", { class: "issue alerte" }, h("span", { class: "ico" }, "?"), h("span", {}, i.msg))));
      box.replaceChildren(...lines);
      dlg && dlg.setActions([
        existing ? { label: "Supprimer le créneau", danger: true, onClick: async () => { const r2 = await this.commit([{ type: "removeShift", emp: emp.id, date }]); return r2.ok; } } : null,
        { label: "Annuler" },
        { label: "Enregistrer", primary: true, disabled: !r.ok || !segs.length, onClick: async () => { const r2 = await this.commit(ops); if (r2.ok) toast("Enregistré."); return r2.ok; } },
      ].filter(Boolean));
    };
    dlg = openDialog({ title: emp ? `${emp.name} · ${C.fmtDate(date, "day")}` : "Nouveau créneau", body, actions: [{ label: "Fermer" }] });
    draw();
  };

  // ---------- Génération ----------
  App.openGenerate = function () {
    const s = this.state;
    let mode = "semaine";
    const weekIn = h("input", { type: "date", class: "input", id: "gen-week", value: this.ui.monday });
    const monthIn = h("input", { type: "month", class: "input", id: "gen-month", value: this.ui.monday.slice(0, 7) });
    const fromIn = h("input", { type: "date", class: "input", id: "gen-from", value: this.ui.monday });
    const toIn = h("input", { type: "date", class: "input", id: "gen-to", value: C.addDays(this.ui.monday, 13) });
    const checks = s.employees.filter((e) => e.active !== false).map((e) => h("label", { class: "check" }, h("input", { type: "checkbox", value: e.id, checked: true }), e.name, e.role === "alternant" ? h("span", { class: "chip cours" }, "alternant") : null));
    const overwrite = h("input", { type: "checkbox", id: "gen-over" });
    const extra = [];
    const extraBox = h("div", { class: "stack" });
    const drawExtra = () => extraBox.replaceChildren(...extra.map((x, i) => h("div", { class: "row" }, h("span", {}, `${empName(s, x.emp)} indisponible le ${C.fmtDate(x.date, "day")}`), iconBtn("close", "Retirer", () => { extra.splice(i, 1); drawExtra(); }))));
    const xEmp = h("select", { class: "input" }, s.employees.map((e) => h("option", { value: e.id }, e.name)));
    const xDate = h("input", { type: "date", class: "input", value: this.ui.monday });
    const periodBox = h("div", {});
    const seg = h("div", { class: "seg-ctl", role: "group" }, ["semaine", "mois", "période"].map((m) => h("button", { type: "button", "aria-pressed": String(m === mode), onClick: () => { mode = m; seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.textContent.toLowerCase() === m))); drawPeriod(); } }, m[0].toUpperCase() + m.slice(1))));
    const drawPeriod = () => periodBox.replaceChildren(mode === "semaine" ? h("label", { class: "f" }, "Semaine contenant le", weekIn) : mode === "mois" ? h("label", { class: "f" }, "Mois", monthIn) : h("div", { class: "form-grid" }, h("label", { class: "f" }, "Du", fromIn), h("label", { class: "f" }, "Au", toIn)));
    drawPeriod();
    const range = () => {
      if (mode === "semaine") { const m = C.mondayOf(weekIn.value); return { from: m, to: C.addDays(m, 6) }; }
      if (mode === "mois") { const [y, mo] = monthIn.value.split("-").map(Number); const last = new Date(Date.UTC(y, mo, 0)).getUTCDate(); return { from: `${monthIn.value}-01`, to: `${monthIn.value}-${String(last).padStart(2, "0")}` }; }
      return { from: fromIn.value, to: toIn.value };
    };
    const absN = Object.values(s.absences).length;
    openDialog({ title: "Générer un planning", wide: true, body: h("div", { class: "stack" },
      h("p", { class: "muted small" }, `Le générateur reprend le planning modèle (« ${s.template.label || "modèle"} ») jour par jour, avec ses horaires, pauses et zones. Il n'attribue jamais un créneau pendant des cours, une absence ou dans une zone non autorisée : ces postes restent « à pourvoir », avec des remplaçants proposés.`),
      h("div", { class: "row" }, seg), periodBox,
      h("h3", {}, "Personnes concernées"), h("div", { class: "form-grid" }, checks),
      h("p", { class: "small muted" }, `${absN} congé(s) ou absence(s) enregistré(s) et le calendrier d'alternance sont pris en compte automatiquement.`),
      h("details", {}, h("summary", { class: "small" }, "Contraintes particulières pour cette génération"),
        h("div", { class: "stack", style: { "margin-top": "8px" } }, h("div", { class: "form-grid" }, h("label", { class: "f" }, "Personne", xEmp), h("label", { class: "f" }, "Indisponible le", xDate), btn("Ajouter", () => { if (C.isISO(xDate.value)) { extra.push({ emp: xEmp.value, date: xDate.value }); drawExtra(); } }, "sm")), extraBox)),
      h("label", { class: "check" }, overwrite, "Remplacer les semaines qui contiennent déjà des horaires (une version de chacune est enregistrée avant)")),
      actions: [{ label: "Annuler" }, { label: "Préparer la proposition", primary: true, onClick: () => {
        const { from, to } = range();
        if (!C.isISO(from) || !C.isISO(to) || to < from) { toast("Période invalide.", "err"); return false; }
        if (C.daysBetween(from, to) > 92) { toast("Trois mois maximum à la fois.", "err"); return false; }
        const employees = checks.map((c) => c.querySelector("input")).filter((i) => i.checked).map((i) => i.value);
        this.previewGeneration({ from, to, employees, unavailable: extra, overwrite: overwrite.checked });
      } }] });
  };
  App.previewGeneration = function (opts) {
    const s = this.state;
    const weeks = []; for (let m = C.mondayOf(opts.from); m <= opts.to; m = C.addDays(m, 7)) weeks.push(m);
    const results = [];
    let tmp = s;
    for (const m of weeks) {
      const exists = C.getWeek(s, m) && C.getWeek(s, m).shifts.some((x) => x.date >= opts.from && x.date <= opts.to);
      if (exists && !opts.overwrite) { results.push({ monday: m, skipped: true }); continue; }
      const g = C.generateWeek(tmp, m, { employees: opts.employees, from: opts.from > m ? opts.from : m, to: opts.to < C.addDays(m, 6) ? opts.to : C.addDays(m, 6), unavailable: opts.unavailable, now: new Date().toISOString() });
      if (exists) { g.week.status = "brouillon"; }
      tmp = { ...tmp, weeks: { ...tmp.weeks, [m]: g.week } };
      results.push({ monday: m, week: g.week, report: g.report, exists });
    }
    const todo = results.filter((r) => !r.skipped);
    const body = h("div", { class: "stack" },
      h("p", { class: "muted small" }, "Proposition non enregistrée. Vérifiez puis enregistrez en brouillon : la validation se fait ensuite semaine par semaine."),
      results.map((r) => h("section", { class: "card flat" },
        h("div", { class: "row between" }, h("h3", {}, `Semaine du ${C.fmtWeek(r.monday)}`), r.skipped ? h("span", { class: "chip" }, "Déjà remplie : non modifiée") : h("span", { class: "chip info" }, `${r.report.placed} créneaux`)),
        r.skipped ? null : h("div", { class: "stack", style: { gap: "6px", "margin-top": "8px" } },
          r.report.notPlaced.length ? h("div", {}, h("b", { class: "small" }, `${r.report.notPlaced.length} poste(s) non attribué(s) :`), r.report.notPlaced.map((n) => h("div", { class: "issue alerte" }, h("span", { class: "ico" }, "?"), h("span", { class: "small" }, `${empName(s, n.emp)} · ${C.fmtDate(n.date, "day")} ${C.segLabel(n.segs)} — ${n.reason}. `, n.candidates.length ? `Remplaçants possibles : ${n.candidates.map((c) => c.name).join(", ")}.` : "Aucun remplaçant possible avec les règles actuelles.")))) : h("p", { class: "small", style: { color: "var(--ok)" } }, "Tous les postes du modèle sont attribués."),
          (() => { const e = r.report.issues.filter((i) => i.level === "erreur"); const a = r.report.issues.filter((i) => i.level === "alerte" && i.code !== "UNCOVERED"); return h("p", { class: "small muted" }, `${e.length} erreur(s), ${a.length} alerte(s) à vérifier après enregistrement.`); })()))));
    openDialog({ title: "Proposition de planning", wide: true, body, actions: [{ label: "Fermer" }, { label: `Enregistrer ${todo.length} semaine(s) en brouillon`, primary: true, disabled: !todo.length, onClick: async () => {
      for (const r of todo) if (r.exists) await this.saveVersion(r.monday, "Avant régénération");
      const res = await this.commit(todo.map((r) => ({ type: "putWeek", monday: r.monday, week: r.week })), { source: "générateur", summary: `Génération : ${todo.map((r) => C.fmtDate(r.monday, "short")).join(", ")}` });
      if (res.ok) { this.ui.monday = todo[0].monday; this.go("week"); toast("Planning généré en brouillon."); }
      return res.ok;
    } }] });
  };

  // ---------- Validation ----------
  App.openValidate = function () {
    const monday = this.ui.monday, w = C.getWeek(this.state, monday);
    if (w && w.status === "validé") { this.commit([{ type: "setWeekStatus", monday, status: "brouillon" }]); return; }
    const iss = C.validateWeek(this.state, monday);
    const errs = iss.filter((i) => i.level === "erreur"), alerts = iss.filter((i) => i.level === "alerte");
    const ack = h("input", { type: "checkbox", id: "val-ack" });
    const d = openDialog({ title: `Valider la semaine du ${C.fmtWeek(monday)}`, body: h("div", { class: "stack" },
      errs.length ? h("div", {}, h("p", { style: { color: "var(--danger)" } }, `${errs.length} erreur(s) bloquante(s) : corrigez-les avant de valider.`), errs.map((i) => h("div", { class: "issue erreur" }, h("span", { class: "ico" }, "!"), h("span", { class: "small" }, i.msg)))) : h("p", { style: { color: "var(--ok)" } }, "Aucune erreur bloquante."),
      alerts.length ? h("div", {}, h("p", {}, `${alerts.length} alerte(s) à vérifier :`), alerts.map((i) => h("div", { class: "issue alerte" }, h("span", { class: "ico" }, "?"), h("span", { class: "small" }, i.msg)))) : null,
      alerts.length && !errs.length ? h("label", { class: "check" }, ack, "J'ai vérifié ces alertes") : null),
      actions: [{ label: "Fermer" }, { label: "Valider la semaine", primary: true, disabled: !!errs.length, onClick: async () => {
        if (alerts.length && !ack.checked) { toast("Cochez « J'ai vérifié ces alertes ».", "err"); return false; }
        const r = await this.commit([{ type: "setWeekStatus", monday, status: "validé", acknowledge: true }], { summary: `Semaine du ${C.fmtWeek(monday)} validée` });
        if (r.ok) { await this.saveVersion(monday, "Semaine validée"); toast("Semaine validée."); }
        return r.ok;
      } }] });
    void d;
  };

  // ---------- Mois ----------
  SCREENS.month = { title: "Planning du mois", render() {
    const s = this.state, [y, m] = this.ui.month.split("-").map(Number), today = this.today();
    const first = `${this.ui.month}-01`;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const start = C.mondayOf(first);
    const end = C.addDays(C.mondayOf(`${this.ui.month}-${String(last).padStart(2, "0")}`), 6);
    const cells = [];
    for (let d = start; d <= end; d = C.addDays(d, 1)) {
      const w = C.getWeek(s, C.mondayOf(d));
      const shifts = w ? w.shifts.filter((x) => x.date === d) : [];
      const byZone = {}; for (const x of shifts) for (const z of new Set(x.segs.map((g) => g.z))) byZone[z] = (byZone[z] || 0) + 1;
      const cours = s.employees.filter((e) => C.calStatus(s, e, d) === "formation");
      const abs = s.employees.filter((e) => C.absencesOn(s, e.id, d).length);
      const errs = shifts.length ? C.validateWeek(s, C.mondayOf(d)).filter((i) => i.date === d && i.level === "erreur").length : 0;
      cells.push(h("button", { type: "button", class: `mday${d.slice(0, 7) !== this.ui.month ? " out" : ""}${d === today ? " today" : ""}`, onClick: () => { this.ui.monday = C.mondayOf(d); this.ui.day = d; this.ui.view = "day"; this.go("week"); }, "aria-label": `${C.fmtDate(d, "day")} : ${shifts.length} personne(s)` },
        h("div", { class: "row between" }, h("span", { class: "n" }, Number(d.slice(8))), w && w.status === "validé" && C.dow(d) === 0 ? h("span", { class: "chip ok", style: { padding: "0 6px" } }, "✓") : null, errs ? h("span", { class: "chip err", style: { padding: "0 6px" } }, "!") : null),
        h("div", { class: "bars" },
          s.zones.filter((z) => byZone[z.id]).map((z) => h("span", { class: `bar blk ${zoneStyle(s, z.id).cls}`, style: { "--z": z.color } }, `${z.short} ${byZone[z.id]}`)),
          cours.length ? h("span", { class: "bar tag-cours", title: cours.map((e) => e.name).join(", ") }, `CFA ${cours.length}`) : null,
          abs.length ? h("span", { class: "bar tag-abs", title: abs.map((e) => e.name).join(", ") }, `Abs. ${abs.length}`) : null)));
    }
    const monthDays = Array.from({ length: last }, (_, i) => `${this.ui.month}-${String(i + 1).padStart(2, "0")}`);
    const hours = s.employees.map((e) => ({ e, h: C.hoursSummary(s, e.id, monthDays[0], monthDays[monthDays.length - 1]) })).filter((x) => x.h.total || x.h.planned || x.e.active !== false);
    const exportHours = () => {
      const lines = [["Mois", "Prénom", "Jours planifiés", "Heures prévues", "Heures sup", "Journées en plus", "Retards", "Total réel"].join(";")];
      for (const x of hours) lines.push([this.ui.month, x.e.name, x.h.workedDays + x.h.extraDayCount, C.hoursDecimal(x.h.planned), C.hoursDecimal(x.h.extra), C.hoursDecimal(x.h.extraDays), C.hoursDecimal(x.h.late), C.hoursDecimal(x.h.total)].map((v) => String(v).replace(".", ",")).join(";"));
      saveFile(`heures-${this.ui.month}.csv`, new Blob(["\ufeff" + lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" }));
    };
    const move = (n) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); this.ui.month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; this.render(); };
    const recent = lastMonths(today, 3);
    const hasShifts = monthDays.some((d) => { const w = C.getWeek(s, C.mondayOf(d)); return w && w.shifts.some((x) => x.date === d); });
    return h("div", { class: "stack", style: { gap: "16px" } },
      h("div", { class: "row" }, recent.map((k, i) => h("button", { type: "button", class: "btn sm" + (k === this.ui.month ? " primary" : ""), onClick: () => { this.ui.month = k; this.render(); } }, i === 0 ? "Ce mois-ci" : monthName(k)))),
      !hasShifts ? h("div", { class: "banner info small" }, this.ui.month < today.slice(0, 7) ? `Aucun planning enregistré pour ${monthName(this.ui.month)}. L'appli garde tous les plannings saisis, sans limite de durée, mais elle ne contient rien avant le 19/10/2026 : envoyez les photos des plannings de ce mois à Claude pour les ajouter, ou importez un CSV (écran Importation).` : `Aucun planning enregistré pour ${monthName(this.ui.month)}.`) : null,
      h("div", { class: "week-head" }, h("div", { class: "when" }, iconBtn("left", "Mois précédent", () => move(-1)), iconBtn("right", "Mois suivant", () => move(1))), h("h1", { style: { "text-transform": "capitalize" } }, `${C.MONTHS[m - 1]} ${y}`),
        iconBtn("download", "Télécharger le planning du mois en PDF", () => { const ms = []; for (let d = start; d <= end; d = C.addDays(d, 7)) ms.push(d); this.downloadPDF(ms, `planning-${this.ui.month}.pdf`); }, { class: "icon-btn dl-btn", id: "dl-month" }),
        h("div", { style: { flex: "1" } }), Store.canWrite ? btn([icon("wand"), "Générer le mois"], () => { this.ui.monday = C.mondayOf(first); this.openGenerate(); }, "sm primary") : null),
      legend(s),
      h("div", { class: "month" }, C.DAYS_SHORT.map((d) => h("div", { class: "dh" }, d)), cells),
      h("section", { class: "card" }, h("div", { class: "row between" }, h("h2", {}, "Heures du mois"), btn("Exporter (CSV)", exportHours, "sm ghost")),
        h("p", { class: "small muted" }, "Touchez un prénom pour voir le détail et ajouter des heures sup, une journée en plus ou un retard."),
        h("div", { class: "t-wrap" }, h("table", { class: "t" }, h("thead", {}, h("tr", {}, h("th", {}, "Personne"), h("th", {}, "Jours"), h("th", {}, "Prévu"), h("th", {}, "Heures sup"), h("th", {}, "Jours en plus"), h("th", {}, "Retards"), h("th", {}, "Total"))),
        h("tbody", {}, hours.map((x) => h("tr", {},
          h("td", {}, h("button", { type: "button", class: "name-btn inline", onClick: () => this.openPerson(x.e.id, "month") }, x.e.name)),
          h("td", { class: "num" }, x.h.workedDays + x.h.extraDayCount),
          h("td", { class: "num" }, C.fmtHours(x.h.planned)),
          h("td", { class: "num", style: { color: x.h.extra ? "var(--ok)" : "" } }, x.h.extra ? "+" + C.fmtHours(x.h.extra) : "—"),
          h("td", { class: "num", style: { color: x.h.extraDays ? "var(--ok)" : "" } }, x.h.extraDays ? `+${C.fmtHours(x.h.extraDays)} (${x.h.extraDayCount} j)` : "—"),
          h("td", { class: "num", style: { color: x.h.late ? "var(--danger)" : "" } }, x.h.late ? "−" + C.fmtHours(x.h.late) : "—"),
          h("td", { class: "num" }, h("b", {}, C.fmtHours(x.h.total))))))))));
  } };

  // ---------- Heures par personne (semaine ou mois) ----------
  SCREENS.hours = { title: "Heures par personne", render() {
    const s = this.state, mode = this.ui.hoursMode;
    const monday = this.ui.hoursMonday || this.ui.monday;
    const month = this.ui.hoursMonth || this.ui.month;
    let from, to, label;
    if (mode === "week") { from = monday; to = C.addDays(monday, 6); label = C.fmtWeek(monday); }
    else { const [y, m] = month.split("-").map(Number); from = `${month}-01`; to = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; label = monthName(month); }
    const move = (n) => {
      if (mode === "week") this.ui.hoursMonday = C.addDays(monday, 7 * n);
      else { const [y, m] = month.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); this.ui.hoursMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; }
      this.render();
    };
    const contract = (s.settings.contractHours || 35) * 60;
    const rows = s.employees.map((e) => ({ e, x: C.hoursSummary(s, e.id, from, to) })).filter((r) => r.e.active !== false || r.x.total || r.x.planned);
    const sum = (k) => rows.reduce((a, r) => a + r.x[k], 0);
    const exportCSV = () => {
      const lines = [["Période", "Prénom", "Jours", "Heures prévues", "Heures sup", "Journées en plus", "Retards", "Total"].join(";")];
      for (const r of rows) lines.push([label, r.e.name, r.x.workedDays + r.x.extraDayCount, C.hoursDecimal(r.x.planned), C.hoursDecimal(r.x.extra), C.hoursDecimal(r.x.extraDays), C.hoursDecimal(r.x.late), C.hoursDecimal(r.x.total)].map((v) => String(v).replace(".", ",")).join(";"));
      saveFile(`heures-${mode === "week" ? monday : month}.csv`, new Blob(["\ufeff" + lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" }));
    };
    const plus = (v) => (v ? "+" + C.fmtHours(v) : "—"), minus = (v) => (v ? "−" + C.fmtHours(v) : "—");
    return h("div", { class: "stack", style: { gap: "16px" } },
      h("div", { class: "week-head" },
        h("div", { class: "seg-ctl", role: "group", "aria-label": "Période" }, [["week", "Semaine"], ["month", "Mois"]].map(([k, l]) => h("button", { type: "button", "aria-pressed": String(mode === k), onClick: () => { this.ui.hoursMode = k; this.render(); } }, l))),
        h("div", { class: "when" }, iconBtn("left", "Période précédente", () => move(-1)), iconBtn("right", "Période suivante", () => move(1))),
        h("h1", { style: { "text-transform": mode === "month" ? "capitalize" : "none" } }, label),
        h("div", { style: { flex: "1" } }),
        btn([icon("download"), "CSV"], exportCSV, "sm")),
      h("div", { class: "kpis" },
        h("div", { class: "kpi" }, h("b", {}, C.fmtHours(sum("total"))), h("span", {}, "heures travaillées (équipe)")),
        h("div", { class: "kpi" }, h("b", { style: { color: sum("extra") + sum("extraDays") ? "var(--ok)" : "" } }, plus(sum("extra") + sum("extraDays"))), h("span", {}, "heures sup et jours en plus")),
        h("div", { class: "kpi" }, h("b", { style: { color: sum("late") ? "var(--danger)" : "" } }, minus(sum("late"))), h("span", {}, "retards"))),
      h("section", { class: "card", style: { padding: "0" } }, h("div", { class: "t-wrap" }, h("table", { class: "t" },
        h("thead", {}, h("tr", {}, h("th", {}, "Personne"), h("th", {}, "Jours"), h("th", {}, "Prévu"), h("th", {}, "Sup"), h("th", {}, "Retards"), h("th", {}, "Total"), mode === "week" ? h("th", {}, `Écart ${s.settings.contractHours || 35} h`) : null)),
        h("tbody", {}, rows.map((r) => h("tr", {},
          h("td", {}, h("button", { type: "button", class: "name-btn inline", onClick: () => this.openPerson(r.e.id, mode) }, r.e.name)),
          h("td", { class: "num" }, r.x.workedDays + r.x.extraDayCount),
          h("td", { class: "num" }, C.fmtHours(r.x.planned)),
          h("td", { class: "num", style: { color: r.x.extra + r.x.extraDays ? "var(--ok)" : "" } }, plus(r.x.extra + r.x.extraDays)),
          h("td", { class: "num", style: { color: r.x.late ? "var(--danger)" : "" } }, minus(r.x.late)),
          h("td", { class: "num" }, h("b", {}, C.fmtHours(r.x.total))),
          mode === "week" ? h("td", { class: "num small", style: { color: r.x.total > contract ? "var(--ok)" : r.x.total < contract ? "var(--fg-2)" : "" } }, r.x.total === contract ? "✓" : `${r.x.total > contract ? "+" : "−"}${C.fmtHours(Math.abs(r.x.total - contract))}`) : null)))))),
      h("p", { class: "small muted" }, "Touchez un prénom pour le détail jour par jour et pour ajouter des heures sup, une journée en plus ou un retard."));
  } };

  // ---------- Calendrier des alternants ----------
  SCREENS.alternants = { title: "Calendrier alternants", render() {
    const s = this.state, today = this.today();
    const cal = s.calendars.find((c) => c.id === this.ui.calId) || s.calendars[0];
    if (!cal) return h("div", { class: "empty" }, "Aucun calendrier d'alternance. ", btn("Importer", () => this.go("import"), "primary"));
    this.ui.calId = cal.id;
    const alts = s.employees.filter((e) => e.role === "alternant");
    const months = Object.keys(cal.months).sort();
    const order = ["E", "P", "W", "F", "?"];
    const edit = this.ui.calEdit && Store.canWrite;
    const stats = { E: 0, P: 0, F: 0 };
    for (const k of months) for (const c of cal.months[k]) if (stats[c] != null) stats[c]++;
    return h("div", { class: "stack", style: { gap: "16px" } },
      h("div", { class: "row between" }, h("div", { class: "stack", style: { gap: "2px" } }, h("h1", {}, cal.name), h("span", { class: "muted small" }, `${C.fmtDate(cal.from, "num")} → ${C.fmtDate(cal.to, "num")} · ${stats.P} jours de formation, ${stats.E} jours en entreprise`)),
        h("div", { class: "row" }, s.calendars.length > 1 ? h("select", { class: "input", onChange: (e) => { this.ui.calId = e.target.value; this.render(); } }, s.calendars.map((c) => h("option", { value: c.id, selected: c.id === cal.id }, c.name))) : null,
          Store.canWrite ? btn(edit ? "Terminer" : "Corriger des jours", () => { this.ui.calEdit = !this.ui.calEdit; this.render(); }, edit ? "primary sm" : "sm") : null)),
      h("div", { class: "card" }, h("h3", {}, "Alternants rattachés"), h("div", { class: "list" }, alts.map((e) => h("div", { class: "item" }, h("b", { class: "grow" }, e.name, e.aliasNote ? h("div", { class: "small muted", style: { "font-weight": "400" } }, e.aliasNote) : null),
        Store.canWrite ? h("select", { class: "input", style: { width: "auto" }, "aria-label": `Calendrier de ${e.name}`, onChange: (ev) => this.commit([{ type: "updateEmployee", id: e.id, patch: { calendarId: ev.target.value || null } }]) }, h("option", { value: "" }, "Aucun (statut inconnu)"), s.calendars.map((c) => h("option", { value: c.id, selected: c.id === e.calendarId }, c.name))) : h("span", {}, (s.calendars.find((c) => c.id === e.calendarId) || {}).name || "Aucun"))))),
      h("div", { class: "legend" }, h("span", {}, h("span", { class: "yday E", style: { width: "18px" } }, ""), "Entreprise"), h("span", {}, h("span", { class: "yday P", style: { width: "18px" } }, ""), "Formation CFA"), h("span", {}, h("span", { class: "yday W", style: { width: "18px" } }, ""), "Week-end (pas de cours)"), h("span", {}, h("span", { class: "yday F", style: { width: "18px" } }, ""), "Férié"), h("span", {}, h("span", { class: "yday Q", style: { width: "18px" } }, ""), "Inconnu")),
      edit ? h("p", { class: "banner info small" }, "Touchez un jour pour changer son statut : Entreprise → Formation → Week-end → Férié → Inconnu. Chaque changement est enregistré dans l'historique.") : null,
      h("div", { class: "yeargrid" + (edit ? " editing" : "") }, months.map((k) => {
        const [y, m] = k.split("-").map(Number);
        const str = cal.months[k];
        const pad = C.dow(`${k}-01`);
        return h("div", { class: "ymonth" }, h("h3", {}, `${C.MONTHS[m - 1]} ${y}`), h("div", { class: "days" },
          C.DAYS_SHORT.map((d) => h("span", { class: "tiny muted", style: { "text-align": "center" } }, d[0])),
          Array.from({ length: pad }, () => h("span", { class: "yday blank" })),
          Array.from(str).map((c, i) => {
            const date = `${k}-${String(i + 1).padStart(2, "0")}`;
            return h("button", { type: "button", class: `yday ${c === "?" ? "Q" : c}${date === today ? " today" : ""}`, title: `${C.fmtDate(date, "day")} : ${C.CAL_LABELS[C.CAL_CODES[c]]}`, disabled: !edit ? true : null, onClick: () => { const next = order[(order.indexOf(c) + 1) % order.length]; this.commit([{ type: "setCalendarDay", calId: cal.id, date, code: next }], { impactTitle: "Créneaux sur un jour de formation" }); } }, i + 1);
          })));
      })),
      h("p", { class: "small muted" }, cal.note || ""));
  } };

  // ---------- Congés et absences ----------
  SCREENS.absences = { title: "Congés et absences", render() {
    const s = this.state, today = this.today();
    const list = Object.values(s.absences).sort((a, b) => b.from.localeCompare(a.from));
    const upcoming = list.filter((a) => a.to >= today).reverse(), past = list.filter((a) => a.to < today);
    const empSel = h("select", { class: "input", id: "abs-emp" }, h("option", { value: "" }, "Choisir…"), s.employees.filter((e) => e.active !== false).map((e) => h("option", { value: e.id }, e.name)), h("option", { value: "*" }, "Toute l'équipe (fermeture)"));
    const typeSel = h("select", { class: "input", id: "abs-type" }, Object.entries(C.ABSENCE_TYPES).map(([k, v]) => h("option", { value: k }, v)));
    const from = h("input", { type: "date", class: "input", id: "abs-from", value: today }), to = h("input", { type: "date", class: "input", id: "abs-to", value: today });
    from.addEventListener("change", () => { if (to.value < from.value) to.value = from.value; });
    const note = h("input", { class: "input", id: "abs-note", maxlength: "300", placeholder: "Facultatif" });
    const row = (a) => h("div", { class: "item" },
      h("div", { class: "grow" }, h("b", {}, empName(s, a.emp)), h("div", { class: "small muted" }, C.ABSENCE_TYPES[a.type], a.note ? ` · ${a.note}` : "")),
      h("span", { class: "small num" }, a.from === a.to ? C.fmtDate(a.from, "num") : `${C.fmtDate(a.from, "short")} → ${C.fmtDate(a.to, "num")}`),
      Store.canWrite ? iconBtn("close", "Supprimer cette absence", async () => { if (await confirmDialog("Supprimer cette absence ?", `${empName(s, a.emp)} · ${C.ABSENCE_TYPES[a.type]} du ${C.fmtDate(a.from, "num")} au ${C.fmtDate(a.to, "num")}.`, "Supprimer", true)) this.commit([{ type: "removeAbsence", id: a.id }]); }) : null);
    // Frise du mois
    const [y, m] = this.ui.absMonth.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const days = Array.from({ length: last }, (_, i) => `${this.ui.absMonth}-${String(i + 1).padStart(2, "0")}`);
    const moveM = (n) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); this.ui.absMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; this.render(); };
    const timeline = h("div", { class: "timeline" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", { class: "n" }, ""), days.map((d) => h("th", { class: C.dow(d) >= 5 ? "we" : "" }, Number(d.slice(8)))))),
      h("tbody", {}, s.employees.filter((e) => e.active !== false).map((e) => h("tr", {}, h("td", { class: "n" }, e.name), days.map((d) => {
        const a = C.absencesOn(s, e.id, d)[0]; const c = C.calStatus(s, e, d) === "formation";
        return h("td", { class: `${a ? "a " + a.type : c ? "c" : ""}${C.dow(d) >= 5 && !a && !c ? " we" : ""}`, title: a ? `${e.name} : ${C.ABSENCE_TYPES[a.type]}` : c ? `${e.name} : CFA` : "" });
      }))))));
    return h("div", { class: "stack", style: { gap: "16px" } },
      Store.canWrite ? h("section", { class: "card" }, h("h2", {}, "Ajouter une absence"),
        h("form", { class: "stack", onSubmit: async (e) => {
          e.preventDefault();
          if (!empSel.value) { toast("Choisissez une personne.", "err"); return; }
          const r = await this.commit([{ type: "addAbsence", absence: { emp: empSel.value, type: typeSel.value, from: from.value, to: to.value, note: note.value } }], { impactTitle: "Créneaux déjà planifiés pendant cette absence" });
          if (r.ok) { toast("Absence enregistrée. Les prochaines générations en tiennent compte."); }
        } },
          h("div", { class: "form-grid" }, h("label", { class: "f" }, "Personne", empSel), h("label", { class: "f" }, "Type", typeSel), h("label", { class: "f" }, "Du", from), h("label", { class: "f" }, "Au (inclus)", to)),
          h("label", { class: "f" }, "Note", note),
          h("div", { class: "row" }, h("button", { type: "submit", class: "btn primary" }, "Enregistrer l'absence"), h("span", { class: "small muted" }, "Si des créneaux existent déjà sur ces dates, ils sont listés pour que vous choisissiez quoi faire.")))) : null,
      h("section", { class: "card" }, h("div", { class: "row between" }, h("h2", { style: { "text-transform": "capitalize" } }, `${C.MONTHS[m - 1]} ${y}`), h("div", { class: "row" }, iconBtn("left", "Mois précédent", () => moveM(-1)), iconBtn("right", "Mois suivant", () => moveM(1)))),
        h("div", { class: "legend", style: { margin: "8px 0" } }, h("span", {}, h("span", { class: "swatch", style: { background: "color-mix(in srgb, var(--accent) 35%, var(--surface))" } }), "Congés / vacances"), h("span", {}, h("span", { class: "swatch", style: { background: "color-mix(in srgb, var(--danger) 30%, var(--surface))" } }), "Arrêt"), h("span", {}, h("span", { class: "swatch", style: { background: "var(--absent-soft)" } }), "Autre"), h("span", {}, h("span", { class: "swatch", style: { background: "var(--cours-soft)" } }), "CFA")),
        timeline),
      s.employees.some((e) => e.onLeave) ? h("section", { class: "card" }, h("h2", {}, "En congé, retour non renseigné"),
        h("p", { class: "small muted" }, "Ces personnes ne sont jamais planifiées ni proposées en remplacement tant qu'elles sont en congé."),
        h("div", { class: "list" }, s.employees.filter((e) => e.onLeave).map((e) => {
          const back = h("input", { type: "date", class: "input", style: { width: "auto" }, "aria-label": `Date de retour de ${e.name}`, value: today });
          return h("div", { class: "item", style: { "flex-wrap": "wrap" } },
            h("div", { class: "grow" }, h("b", {}, e.name), h("div", { class: "small muted" }, `${C.ABSENCE_TYPES[e.onLeave.type] || "Congé"} depuis le ${C.fmtDate(e.onLeave.since, "num")}`)),
            Store.canWrite ? h("span", { class: "row" }, h("span", { class: "small muted" }, "Revient le"), back,
              btn("Enregistrer le retour", async () => {
                if (!C.isISO(back.value) || back.value <= e.onLeave.since) { toast("Choisissez une date de retour après le début du congé.", "err"); return; }
                await this.commit([
                  { type: "addAbsence", absence: { emp: e.id, type: e.onLeave.type || "vacances", from: e.onLeave.since, to: C.addDays(back.value, -1), note: "" } },
                  { type: "updateEmployee", id: e.id, patch: { onLeave: null } },
                ], { summary: `${e.name} : retour de congé le ${C.fmtDate(back.value, "num")}` });
              }, "sm primary")) : null);
        }))) : null,
      h("section", { class: "card" }, h("h2", {}, "À venir et en cours"), upcoming.length ? h("div", { class: "list" }, upcoming.map(row)) : h("p", { class: "muted" }, "Aucune absence à venir.")),
      past.length ? h("details", { class: "card" }, h("summary", {}, `Passées (${past.length})`), h("div", { class: "list" }, past.slice(0, 60).map(row))) : null);
  } };

  // ---------- Équipe ----------
  SCREENS.team = { title: "Équipe", render() {
    const s = this.state;
    const name = h("input", { class: "input", id: "team-name", placeholder: "Prénom", maxlength: "40" });
    const role = h("select", { class: "input", id: "team-role" }, h("option", { value: "salarie" }, "Salarié(e)"), h("option", { value: "alternant" }, "Alternant(e)"));
    const zc = s.zones.map((z) => h("label", { class: "check" }, h("input", { type: "checkbox", value: z.id }), zoneTag(s, z.id), z.name));
    return h("div", { class: "stack", style: { gap: "16px" } },
      Store.canWrite ? h("section", { class: "card" }, h("h2", {}, "Ajouter une personne"),
        h("form", { class: "stack", onSubmit: async (e) => {
          e.preventDefault();
          const zonesList = zc.map((c) => c.querySelector("input")).filter((i) => i.checked).map((i) => i.value);
          const r = await this.commit([{ type: "addEmployee", employee: { name: name.value, role: role.value, zonesList } }]);
          if (r.ok) { name.value = ""; }
        } }, h("div", { class: "form-grid" }, h("label", { class: "f" }, "Prénom", name), h("label", { class: "f" }, "Statut", role)), h("div", { class: "row" }, h("span", { class: "small muted" }, "Zones autorisées :"), zc), h("div", {}, h("button", { type: "submit", class: "btn primary" }, "Ajouter"))),
      ) : null,
      h("section", { class: "card" }, h("h2", {}, `${s.employees.length} personnes`), h("div", { class: "t-wrap" }, h("table", { class: "t" },
        h("thead", {}, h("tr", {}, h("th", {}, "Prénom"), h("th", {}, "Statut"), h("th", {}, "Zones"), h("th", {}, "Heures du modèle"), h("th", {}, "Règles"), h("th", {}, "Active"), h("th", {}, ""))),
        h("tbody", {}, s.employees.map((e) => h("tr", {},
          h("td", {}, h("b", {}, e.name), (e.aliases || []).length ? h("div", { class: "tiny muted" }, `aussi : ${e.aliases.join(", ")}`) : null),
          h("td", {}, e.role === "alternant" ? h("span", { class: "chip cours" }, "Alternant(e)") : "Salarié(e)"),
          h("td", {}, h("div", { class: "row" }, Object.entries(e.zones || {}).map(([z, lv]) => h("span", { class: "row", style: { gap: "3px" } }, zoneTag(s, z), lv === "incertain" ? h("span", { class: "chip warn" }, "?") : null)), !Object.keys(e.zones || {}).length ? h("span", { class: "chip warn" }, "inconnue") : null)),
          h("td", { class: "num" }, C.fmtHours(C.templateMinutes(s, e.id))),
          h("td", { class: "small" }, rulesText(e) || h("span", { class: "muted" }, "—")),
          h("td", {}, Store.canWrite ? h("input", { type: "checkbox", checked: e.active !== false, "aria-label": `${e.name} active`, onChange: (ev) => this.commit([{ type: "updateEmployee", id: e.id, patch: { active: ev.target.checked } }]) }) : (e.active !== false ? "Oui" : "Non")),
          h("td", {}, Store.canWrite ? btn("Modifier", () => this.openEmployee(e.id), "sm") : null))))))));
  } };
  App.openEmployee = function (id) {
    const s = this.state, e = C.empById(s, id);
    const name = h("input", { class: "input", id: "emp-name", value: e.name });
    const aliases = h("input", { class: "input", id: "emp-alias", value: (e.aliases || []).join(", "), placeholder: "Autres façons d'écrire le prénom" });
    const role = h("select", { class: "input", id: "emp-role" }, h("option", { value: "salarie", selected: e.role !== "alternant" }, "Salarié(e)"), h("option", { value: "alternant", selected: e.role === "alternant" }, "Alternant(e)"));
    const r = e.rules || {};
    const fixOn = h("input", { type: "checkbox", id: "emp-fix", checked: !!r.fixedHours });
    const fixS = h("input", { type: "time", class: "input", id: "emp-fix-s", value: r.fixedHours ? r.fixedHours.s : "" });
    const fixE = h("input", { type: "time", class: "input", id: "emp-fix-e", value: r.fixedHours ? r.fixedHours.e : "" });
    const offBoxes = C.DAYS.map((d, i) => h("label", { class: "check" }, h("input", { type: "checkbox", value: String(i), checked: (r.daysOff || []).includes(i) }), d));
    const sameWe = h("input", { type: "checkbox", id: "emp-same-we", checked: !!r.sameWeekends });
    openDialog({ title: e.name, body: h("div", { class: "stack" }, h("div", { class: "form-grid" }, h("label", { class: "f" }, "Prénom", name), h("label", { class: "f" }, "Statut", role)), h("label", { class: "f" }, "Autres écritures (séparées par des virgules)", aliases),
      h("h3", {}, "Règles personnelles"),
      h("label", { class: "check" }, fixOn, "Toujours les mêmes horaires"), h("div", { class: "form-grid" }, h("label", { class: "f" }, "Début", fixS), h("label", { class: "f" }, "Fin", fixE)),
      h("label", { class: "check" }, sameWe, "Toujours les mêmes week-ends"),
      h("div", { class: "stack", style: { gap: "4px" } }, h("span", { class: "small muted" }, "Jours de repos fixes (jamais de créneau ces jours-là) :"), h("div", { class: "row" }, offBoxes)),
      r.note ? h("p", { class: "small muted" }, `Consigne : ${r.note}`) : null,
      h("p", { class: "small muted" }, "Les zones se règlent dans « Zones et règles ». Une personne qui a des horaires ne peut pas être supprimée : désactivez-la pour garder l'historique.")),
      actions: [
        { label: "Supprimer", danger: true, onClick: async () => { if (!(await confirmDialog(`Supprimer ${e.name} ?`, "Possible seulement si la personne n'a aucun horaire enregistré ni dans le modèle.", "Supprimer", true))) return false; return (await this.commit([{ type: "removeEmployee", id }])).ok; } },
        { label: "Annuler" },
        { label: "Enregistrer", primary: true, onClick: async () => {
          const daysOff = offBoxes.map((b) => b.querySelector("input")).filter((i) => i.checked).map((i) => Number(i.value));
          if (fixOn.checked && (!C.isTime(fixS.value) || !C.isTime(fixE.value))) { toast("Indiquez le début et la fin des horaires fixes.", "err"); return false; }
          const rules = { ...r, fixedHours: fixOn.checked ? { s: fixS.value, e: fixE.value } : null, daysOff: daysOff.length ? daysOff : null, sameWeekends: sameWe.checked };
          return (await this.commit([{ type: "updateEmployee", id, patch: { name: name.value, role: role.value, aliases: aliases.value.split(",").map((x) => x.trim()).filter(Boolean), rules } }])).ok;
        } },
      ] });
  };

  // ---------- Zones, couleurs et règles ----------
  SCREENS.zones = { title: "Zones et règles", render() {
    const s = this.state, edit = Store.canWrite, st = s.settings;
    const LV = [["", "Non autorisée"], ["incertain", "À confirmer"], ["deduit", "Déduite du planning"], ["confirme", "Confirmée"]];
    const confidence = (e) => {
      const v = Object.values(e.zones || {});
      if (!v.length) return h("span", { class: "chip warn" }, "Inconnue");
      if (v.includes("incertain")) return h("span", { class: "chip warn" }, "Moyenne");
      if (v.every((x) => x === "confirme")) return h("span", { class: "chip ok" }, "Confirmée");
      return h("span", { class: "chip info" }, "Haute (déduite)");
    };
    const deduced = s.employees.filter((e) => Object.values(e.zones || {}).includes("deduit"));
    const num = (k, label, unit) => h("label", { class: "f" }, label, h("div", { class: "row" }, h("input", { type: "number", class: "input", style: { width: "90px" }, min: "1", max: "100", value: st[k], disabled: !edit, onChange: (ev) => this.commit([{ type: "setSettings", patch: { [k]: ev.target.value } }]) }), unit));
    const tog = (k, label) => h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!st[k], disabled: !edit, onChange: (ev) => this.commit([{ type: "setSettings", patch: { [k]: ev.target.checked } }]) }), label);
    return h("div", { class: "stack", style: { gap: "16px" } },
      h("section", { class: "card" }, h("h2", {}, "Zones de travail"), h("p", { class: "small muted" }, "Couleurs reprises du planning papier : vert = zone publique (ZP), orange = zone réservée (ZR). Le motif et le code restent visibles pour les personnes qui distinguent mal les couleurs."),
        h("div", { class: "list" }, s.zones.map((z) => h("div", { class: "item", style: { "flex-wrap": "wrap" } },
          h("span", { class: `blk ${zoneStyle(s, z.id).cls}`, style: { "--z": z.color, width: "64px", "justify-content": "center" } }, h("small", {}, z.short)),
          h("div", { class: "grow" }, h("b", {}, z.name), h("div", { class: "small muted" }, z.note || "")),
          edit ? h("input", { type: "color", value: z.color, "aria-label": `Couleur ${z.name}`, onChange: (ev) => this.commit([{ type: "updateZone", id: z.id, patch: { color: ev.target.value } }]) }) : null,
          edit ? h("select", { class: "input", style: { width: "auto" }, "aria-label": `Motif ${z.name}`, onChange: (ev) => this.commit([{ type: "updateZone", id: z.id, patch: { pattern: ev.target.value } }]) }, ["plein", "hachures", "points"].map((p) => h("option", { value: p, selected: z.pattern === p }, p[0].toUpperCase() + p.slice(1)))) : null)))),
      h("section", { class: "card" }, h("div", { class: "row between" }, h("h2", {}, "Qui peut travailler où"), edit && deduced.length ? btn("Confirmer toutes les zones déduites", async () => {
        if (!(await confirmDialog("Confirmer les zones déduites ?", `Les zones déduites du planning papier deviennent « confirmées » pour ${deduced.length} personne(s). Les zones « à confirmer » ne changent pas.`, "Confirmer"))) return;
        this.commit(deduced.map((e) => ({ type: "setZones", emp: e.id, zones: Object.fromEntries(Object.entries(e.zones).map(([z, lv]) => [z, lv === "deduit" ? "confirme" : lv])) })), { summary: "Zones déduites confirmées" });
      }, "sm") : null),
        h("p", { class: "small muted" }, "Une zone « Non autorisée » est bloquée partout (planning, générateur, assistant). « À confirmer » est autorisée mais signalée."),
        h("div", { class: "t-wrap" }, h("table", { class: "t" },
          h("thead", {}, h("tr", {}, h("th", {}, "Prénom"), s.zones.map((z) => h("th", {}, h("span", { class: "row", style: { gap: "6px" } }, zoneTag(s, z.id), z.name))), h("th", {}, "Confiance"), h("th", {}, "D'après le planning papier"))),
          h("tbody", {}, s.employees.map((e) => h("tr", {}, h("td", {}, h("b", {}, e.name)),
            s.zones.map((z) => h("td", {}, edit ? h("select", { class: "input", style: { width: "auto", "min-width": "150px" }, "aria-label": `${e.name} en ${z.name}`, onChange: (ev) => {
              const zones = { ...(e.zones || {}) }; if (ev.target.value) zones[z.id] = ev.target.value; else delete zones[z.id];
              this.commit([{ type: "setZones", emp: e.id, zones }], { impactTitle: "Créneaux dans une zone retirée" });
            } }, LV.map(([v, l]) => h("option", { value: v, selected: (e.zones || {})[z.id] === v || (!v && !(e.zones || {})[z.id]) }, l))) : (LV.find(([v]) => v === (e.zones || {})[z.id]) || LV[0])[1])),
            h("td", {}, confidence(e)), h("td", { class: "small muted", style: { "min-width": "220px" } }, e.zoneNote || ""))))))),
      h("section", { class: "card" }, h("div", { class: "row between" }, h("h2", {}, "Règles de repos et de durée"), st.rulesConfirmed ? h("span", { class: "chip ok" }, "Confirmées") : h("span", { class: "chip warn" }, "À confirmer")),
        h("p", { class: "small muted" }, "Règles de l'équipe : 35 h par semaine, journées de 7 h de travail avec 30 min de pause (7 h 30 sur place), 11 h de repos entre deux journées. Elles produisent des alertes, pas des blocages."),
        h("div", { class: "form-grid", style: { "margin-top": "10px" } },
          h("div", { class: "stack", style: { gap: "6px" } }, tog("checkRest", "Vérifier le repos entre deux services"), num("minRestHours", "Repos minimum", "heures")),
          h("div", { class: "stack", style: { gap: "6px" } }, tog("checkMaxDay", "Vérifier la durée par jour"), num("maxDayHours", "Maximum par jour", "heures")),
          h("div", { class: "stack", style: { gap: "6px" } }, tog("checkMaxWeek", "Vérifier la durée par semaine"), num("maxWeekHours", "Maximum par semaine", "heures")),
          h("div", { class: "stack", style: { gap: "6px" } }, tog("checkPause", "Vérifier la pause (journées de plus de 6 h)"), num("minPauseMinutes", "Pause minimum", "minutes")),
          h("div", { class: "stack", style: { gap: "6px" } }, num("lateThreshold", "Retard compté à partir de", "minutes"), num("extraThreshold", "Heures sup comptées à partir de", "minutes")),
          h("div", { class: "stack", style: { gap: "6px" } }, h("span", { class: "small muted" }, "Contrat de référence"), num("contractHours", "Heures par semaine", "heures"))),
        h("div", { class: "stack", style: { "margin-top": "12px", gap: "8px" } },
          tog("coverageFromTemplate", "Signaler les postes du modèle non pourvus (hypothèse : le modèle donne le besoin en personnel)"),
          tog("rulesConfirmed", "J'ai vérifié ces règles"))));
  } };

  // ---------- Historique ----------
  SCREENS.history = { title: "Historique", render() {
    const wrap = h("div", { class: "stack", style: { gap: "16px" } });
    const s = this.state;
    const who = (id) => (id === "cet appareil" ? "Cet appareil" : this.names[id] || (id === Store.userId ? "Vous" : "Une autre personne"));
    const fmtAt = (at) => { const d = new Date(at); return isNaN(d) ? "" : `${C.fmtDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, "num")} ${fmtTime(d)}`; };
    const detail = (c) => {
      if (c.col === "adjustments") { const a = c.after || c.before; return h("div", { class: "small muted" }, a ? `${c.after ? "" : "Supprimé : "}${C.ADJUST_TYPES[a.type].label} ${empName(s, a.emp)} ${C.fmtDate(a.date, "short")} (${C.fmtHours(a.minutes)})` : ""); }
      if (c.col !== "weeks" || !("before" in c)) return h("div", { class: "small muted" }, c.col === "absences" ? (c.after ? `Absence : ${empName(s, c.after.emp)} ${C.fmtDate(c.after.from, "short")} → ${C.fmtDate(c.after.to, "short")}` : "Absence supprimée") : c.col === "config" ? `Paramètres : ${({ employees: "équipe", zones: "zones", settings: "règles", template: "modèle", calendars: "calendrier d'alternance" })[c.id] || c.id}` : "");
      const key = (x) => `${x.emp}|${x.date}`;
      const b = new Map(((c.before && c.before.shifts) || []).map((x) => [key(x), x])), a = new Map(((c.after && c.after.shifts) || []).map((x) => [key(x), x]));
      const lines = [];
      for (const [k, x] of a) { const y = b.get(k); if (!y) lines.push(h("div", { class: "add" }, `+ ${empName(s, x.emp)} ${C.fmtDate(x.date, "short")} : ${x.segs.map((g) => `${g.s}–${g.e} ${g.z}`).join(", ")}`)); else if (C.segKey(y.segs) !== C.segKey(x.segs)) lines.push(h("div", {}, `~ ${empName(s, x.emp)} ${C.fmtDate(x.date, "short")} : ${y.segs.map((g) => `${g.s}–${g.e} ${g.z}`).join(", ")} → ${x.segs.map((g) => `${g.s}–${g.e} ${g.z}`).join(", ")}`)); }
      for (const [k, y] of b) if (!a.has(k)) lines.push(h("div", { class: "del" }, `− ${empName(s, y.emp)} ${C.fmtDate(y.date, "short")} : ${y.segs.map((g) => `${g.s}–${g.e} ${g.z}`).join(", ")}`));
      if ((c.before || {}).status !== (c.after || {}).status) lines.push(h("div", {}, `Statut : ${(c.before || {}).status || "—"} → ${(c.after || {}).status || "—"}`));
      return h("div", { class: "diff" }, h("b", { class: "small" }, `Semaine du ${C.fmtWeek(c.id)}`), lines.slice(0, 60), lines.length > 60 ? h("div", { class: "muted" }, `… ${lines.length - 60} autres lignes`) : null);
    };
    wrap.append(h("section", { class: "card" }, h("h2", {}, "Modifications"), h("p", { class: "small muted" }, "Chaque modification garde les valeurs d'avant et d'après. « Revenir avant » rétablit l'état précédent (cette action est elle-même historisée)."),
      this.history.length ? h("div", { class: "list" }, this.history.slice(0, 150).map((e) => h("div", { class: "item", style: { "align-items": "flex-start" } },
        h("div", { class: "grow" },
          h("div", { class: "row" }, h("b", { class: "small" }, fmtAt(e.at)), h("span", { class: "chip" + (e.source === "assistant IA" ? " info" : e.source === "annulation" ? " warn" : "") }, e.source), h("span", { class: "small muted" }, who(e.by)), e.undone ? h("span", { class: "chip" }, "annulée") : null),
          h("div", { style: { margin: "4px 0" } }, e.summary),
          h("details", {}, h("summary", { class: "small muted" }, "Détail"), (e.changes || []).map(detail))),
        Store.canWrite && !e.undone && !e.tooBig && e.source !== "annulation" && e.changes && e.changes[0] && "after" in e.changes[0] ? btn("Revenir avant", () => this.undo(e), "sm") : null))) : h("p", { class: "muted" }, "Aucune modification enregistrée.")));
    const versions = h("section", { class: "card" }, h("h2", {}, "Versions enregistrées"), h("p", { class: "muted small" }, "Chargement…"));
    wrap.append(versions);
    Store.listLog("versions", 120).then((vs) => {
      versions.replaceChildren(h("h2", {}, "Versions enregistrées"), h("p", { class: "small muted" }, "Une version est enregistrée automatiquement à chaque validation, avant une régénération ou un remplacement."),
        vs.length ? h("div", { class: "list" }, vs.map((v) => h("div", { class: "item" }, h("div", { class: "grow" }, h("b", {}, `Semaine du ${C.fmtWeek(v.week)}`), h("div", { class: "small muted" }, `${v.label} · ${fmtAt(v.at)} · ${(v.data.shifts || []).length} créneaux · ${who(v.by)}`)),
          Store.canWrite ? btn("Restaurer", async () => {
            if (!(await confirmDialog("Restaurer cette version ?", `La semaine du ${C.fmtWeek(v.week)} reprendra l'état du ${fmtAt(v.at)}. L'état actuel est enregistré comme version avant, et l'action peut être annulée.`, "Restaurer"))) return;
            await this.saveVersion(v.week, "Avant restauration");
            const r = await this.commit([{ type: "putWeek", monday: v.week, week: { ...v.data, status: "brouillon" } }], { source: "restauration", summary: `Restauration de la semaine du ${C.fmtWeek(v.week)} (${fmtAt(v.at)})`, allowErrors: true });
            if (r.ok) { this.ui.monday = v.week; this.go("week"); }
          }, "sm") : null))) : h("p", { class: "muted" }, "Aucune version pour l'instant."));
    }).catch(() => versions.replaceChildren(h("h2", {}, "Versions enregistrées"), h("p", { class: "muted" }, "Impossible de charger les versions.")));
    return wrap;
  } };

  // ---------- Importation ----------
  SCREENS.import = { title: "Importation", render() {
    const s = this.state;
    const wrap = h("div", { class: "stack", style: { gap: "16px" } });
    if (!root.PlanningReference && root.PlanningReferenceLocked) {
      const input = h("input", { class: "input", id: "unlock-code", autocomplete: "off", autocapitalize: "none", spellcheck: "false", placeholder: "xxxx-xxxx-xxxx", style: { "max-width": "260px", "font-family": "var(--mono)" } });
      const msg = h("p", { class: "small", role: "alert" });
      const go = async () => {
        msg.textContent = "Vérification…"; msg.style.color = "";
        try { root.PlanningReference = await unlockReference(input.value); this.render(); }
        catch (e) { msg.textContent = "Code incorrect. Vérifiez-le (il est dans la conversation avec Claude) et réessayez."; msg.style.color = "var(--danger)"; }
      };
      wrap.append(h("section", { class: "card" }, h("h2", {}, s ? "Calendriers analysés" : "Bienvenue"),
        h("p", { class: "muted", style: { "margin-top": "8px" } }, "Les prénoms et horaires de l'équipe sont chiffrés dans cette appli. Tapez le code d'accès une seule fois : ils sont ensuite enregistrés sur ce téléphone."),
        h("form", { class: "row", style: { "margin-top": "12px" }, onSubmit: (e) => { e.preventDefault(); go(); } }, input, h("button", { type: "submit", class: "btn primary" }, "Déverrouiller")), msg));
      return wrap;
    }
    if (!root.PlanningReference) return h("div", { class: "empty" }, "Données de référence indisponibles.");
    const R = root.PlanningReference;
    const refEmp = R.employees;
    const tplDays = (id) => R.template.shifts.filter((t) => t.emp === id);
    const doubts = R.template.shifts.filter((t) => t.segs.some((g) => g.doute));
    const calStats = (() => { const o = { E: 0, P: 0, W: 0, F: 0, "?": 0 }; for (const v of Object.values(R.calendars[0].months)) for (const c of v) o[c]++; return o; })();
    const refState = C.stateFromReference(R);
    wrap.append(h("section", { class: "card" },
      h("div", { class: "row between" }, h("h2", {}, "Calendriers analysés"), s ? h("span", { class: "chip ok" }, "Importés et confirmés") : h("span", { class: "chip info" }, "Import en cours…")),
      h("p", { class: "small muted" }, `Sources : ${R.source.planning} ; ${R.source.alternance}. Lecture faite le ${C.fmtDate(R.source.importedOn, "num")}.`),
      h("h3", { style: { "margin-top": "14px" } }, "1. Planning modèle (semaine du 19/10/2026)"),
      h("ul", { class: "small" },
        h("li", {}, "16 prénoms sur le planning papier. Depuis : Lydia (la patronne) est retirée du planning, Sonia, Sylvie et Sophie ne font plus partie de l'équipe, Amandine est en vacances."),
        h("li", {}, "Chaque journée = 2 blocs « De / A » séparés par une pause de 30 min (ex. 13:30–17:00 puis 17:30–21:00). La 3e colonne de chaque jour est vide."),
        h("li", {}, "Totaux vérifiés : ils correspondent à la colonne « Total » du papier (35 h, Mathilde 30 h)."),
        h("li", {}, "Couleurs : légende manuscrite « ZP » en vert = zone publique, « ZR » en orange = zone réservée."),
        h("li", {}, "Horaires types : ouverture 05:30, 06:00 ou 07:00 ; après-midi 13:30, 14:30 ou 15:30 ; fermeture 21:00 ou 22:00. Couverture 7 jours sur 7."),
        h("li", {}, "Une seule semaine est fournie (« Semaine 1 », « Page 1/2 ») : aucune rotation ne peut encore être déduite.")),
      h("div", { class: "t-wrap" }, h("table", { class: "t" }, h("thead", {}, h("tr", {}, h("th", {}, "Prénom"), C.DAYS_SHORT.map((d) => h("th", {}, d)), h("th", {}, "Total"))),
        h("tbody", {}, refEmp.filter((e) => tplDays(e.id).length).map((e) => h("tr", {}, h("td", {}, h("b", {}, e.name)),
          C.DAYS_SHORT.map((_, i) => { const t = tplDays(e.id).find((x) => x.dow === i); return h("td", {}, t ? h("div", { class: "stack", style: { gap: "2px" } }, t.segs.map((g) => blk(refState, g))) : ""); }),
          h("td", { class: "num" }, `${R.totalsOnPaper[e.id]} h`)))))),
      h("h3", { style: { "margin-top": "14px" } }, "2. Calendrier d'alternance (BTS MCO 1, août 2026 → juillet 2027)"),
      h("ul", { class: "small" },
        h("li", {}, `${calStats.P} jours de formation au CFA (rose), ${calStats.E} jours en entreprise, ${calStats.F} jours fériés, ${calStats.W} jours de week-end.`),
        h("li", {}, "Rythme le plus fréquent : 2 jours de CFA (souvent jeudi-vendredi ou lundi-mardi), avec des semaines complètes (5–9 oct., 14–18 déc., 22–26 mars, 19–23 avril, 5–9 juillet). « BTS BLANC » du 1er au 4 juin 2027 compté comme formation."),
        h("li", {}, "La semaine du 19/10/2026 est entièrement « entreprise » : cohérent avec Fleur et Camilian au travail ce jour-là."),
        h("li", {}, "Week-ends : aucun cours. Hypothèse retenue : travail possible le week-end (le planning modèle fait travailler Fleur et Camilian le samedi et le dimanche)."),
        h("li", {}, "Avant août 2026 et après juillet 2027 : statut inconnu, jamais considéré comme disponible.")),
      h("h3", { style: { "margin-top": "14px" } }, "3. Zones par personne"),
      s ? h("ul", { class: "small" }, s.employees.map((e) => h("li", {}, h("b", {}, e.name), ` : ${Object.entries(e.zones || {}).map(([z, lv]) => `${z}${lv === "confirme" ? " (confirmée)" : lv === "incertain" ? " (à confirmer)" : ""}`).join(", ") || "à définir"}${e.onLeave ? " — en vacances" : ""}`)))
        : h("ul", { class: "small" }, refEmp.map((e) => h("li", {}, h("b", {}, e.name), ` : ${Object.entries(e.zones).map(([z, lv]) => `${z}${lv === "incertain" ? " (à confirmer)" : ""}`).join(", ") || "inconnue"} — ${e.zoneNote}`))),
      h("h3", { style: { "margin-top": "14px" } }, "Points incertains"),
      (() => {
        const left = s ? Object.values(s.weeks).flatMap((w) => w.shifts).filter((x) => x.segs.some((g) => g.doute)) : doubts;
        if (s && !left.length) return h("p", { class: "small", style: { color: "var(--ok)" } }, "Aucun : toutes les informations sont confirmées.");
        return h("ul", { class: "small" }, (s ? left.map((x) => h("li", {}, `${empName(s, x.emp)}, ${C.fmtDate(x.date, "day")} : couleur à confirmer.`)) : doubts.map((t) => h("li", {}, `${C.empById(refState, t.emp).name}, ${C.DAYS[t.dow].toLowerCase()} : ${t.segs.filter((g) => g.doute).map((g) => `${g.s}–${g.e}`).join(", ")} — couleur mélangée, enregistrée en ZR.`))));
      })(),
      h("h3", { style: { "margin-top": "14px" } }, "Questions encore ouvertes (facultatif)"),
      h("ol", { class: "small" }, R.questions.map((q) => h("li", {}, q))),
      Store.canWrite ? h("div", { class: "row", style: { "margin-top": "14px" } }, btn(s ? "Réimporter ces données…" : "Importer ces données", () => this.importReference(), "primary"), h("span", { class: "small muted" }, s ? "Remplace l'équipe, les zones, le modèle et le calendrier (après confirmation). Les plannings et absences sont conservés." : "Crée l'équipe, les zones, le modèle et le calendrier, ainsi que la semaine du 19/10/2026 telle qu'elle est sur le papier.")) : null));

    if (s && Store.canWrite) {
      // Import d'une photo de planning modèle
      const imgCard = h("section", { class: "card" }, h("h2", {}, "Importer un nouveau planning modèle"),
        h("p", { class: "small muted" }, "Photo ou capture d'écran (JPEG, PNG) : l'assistant lit les horaires et les couleurs, puis vous corrigez avant d'enregistrer. Ou un fichier CSV au format de l'export."),
        h("div", { class: "row", style: { "margin-top": "10px" } },
          h("label", { class: "btn" }, "Choisir une photo…", h("input", { type: "file", accept: "image/*", hidden: true, onChange: (e) => this.importPlanningImage(e.target.files[0]) })),
          h("label", { class: "btn" }, "Choisir un CSV…", h("input", { type: "file", accept: ".csv,text/csv", hidden: true, onChange: (e) => this.importCSV(e.target.files[0]) }))),
        AI.imagesOk ? null : h("p", { class: "small muted", style: { "margin-top": "8px" } }, "La lecture de photos nécessite l'assistant IA (disponible dans Claude). Le CSV fonctionne partout."));
      const calCard = h("section", { class: "card" }, h("h2", {}, "Importer un calendrier d'alternance"),
        h("p", { class: "small muted" }, "Photo ou capture du calendrier de l'école : chaque jour est classé (entreprise, formation, week-end, férié, inconnu). Vous corrigez ensuite case par case dans « Calendrier alternants »."),
        h("div", { class: "row", style: { "margin-top": "10px" } }, h("label", { class: "btn" }, "Choisir une photo…", h("input", { type: "file", accept: "image/*", hidden: true, onChange: (e) => this.importCalendarImage(e.target.files[0]) }))));
      wrap.append(imgCard, calCard);
    }
    return wrap;
  } };

  App.importReference = async function (auto) {
    const R = root.PlanningReference, existing = !!this.state;
    if (existing && !(await confirmDialog("Réimporter les calendriers analysés ?", "L'équipe, les zones, le planning modèle et le calendrier d'alternance seront remplacés par les données extraites des photos (vos corrections seront perdues ; elles restent dans l'historique). Les plannings et absences sont conservés.", "Réimporter", true))) return;
    if (!Store.canWrite) { toast(Store.readOnlyReason, "err"); return; }
    const base = C.stateFromReference(R);
    const changes = C.CONFIG_KEYS.map((k) => ({ col: "config", id: k, before: existing ? C.clone(this.state[k]) : null, after: base[k] }));
    let weekChange = null;
    if (!existing || !C.getWeek(this.state, R.template.referenceWeek)) {
      const wk = { week: R.template.referenceWeek, status: "brouillon", source: "planning papier (photo)", refId: "papier-" + R.template.referenceWeek, shifts: R.template.shifts.map((t, i) => ({ id: `ref-${i}`, emp: t.emp, date: C.addDays(R.template.referenceWeek, t.dow), segs: C.clone(t.segs) })) };
      weekChange = { col: "weeks", id: R.template.referenceWeek, before: null, after: wk };
      changes.push(weekChange);
    }
    const prev = this.state;
    this.state = { ...base, weeks: prev ? prev.weeks : {}, absences: prev ? prev.absences : {}, adjustments: prev ? prev.adjustments || {} : {} };
    if (weekChange) this.state.weeks[weekChange.id] = weekChange.after;
    const ok = await this.persist(changes, "import", existing ? "Réimport des calendriers analysés" : "Import initial des deux calendriers");
    if (!ok) { this.state = prev; this.render(); return; }
    this.loadError = null;
    toast(auto ? "Planning de l'équipe chargé." : "Calendriers importés.");
    await this.syncReference();
    this.ui.monday = R.template.referenceWeek;
    this.go("week");
  };

  App.importCSV = async function (file) {
    if (!file) return;
    const text = await file.text().catch(() => "");
    const { shifts, rejected } = C.csvToShifts(this.state, text);
    if (!shifts.length) { this.showErrors([`Aucun créneau reconnu.${rejected.length ? " Exemple : ligne " + rejected[0].line + ", " + rejected[0].why + "." : ""}`], "Import CSV"); return; }
    const weeks = [...new Set(shifts.map((x) => C.mondayOf(x.date)))];
    const r = C.applyOps(this.state, [{ type: "importShifts", shifts }], { allowErrors: true });
    const issues = weeks.flatMap((m) => C.validateWeek(r.state, m)).filter((i) => i.level === "erreur");
    openDialog({ title: "Aperçu de l'import CSV", wide: true, body: h("div", { class: "stack" },
      h("p", {}, `${shifts.length} créneau(x) reconnu(s) sur ${weeks.length} semaine(s). Les créneaux existants des mêmes personnes aux mêmes dates seront remplacés.`),
      rejected.length ? h("div", {}, h("b", {}, `${rejected.length} ligne(s) ignorée(s) :`), rejected.slice(0, 20).map((x) => h("div", { class: "small" }, `Ligne ${x.line} : ${x.why}`))) : null,
      issues.length ? h("div", {}, h("b", { style: { color: "var(--danger)" } }, `${issues.length} erreur(s) après import (à corriger ensuite) :`), issues.slice(0, 15).map((i) => h("div", { class: "issue erreur" }, h("span", { class: "ico" }, "!"), h("span", { class: "small" }, i.msg)))) : h("p", { style: { color: "var(--ok)" } }, "Aucune erreur détectée.")),
      actions: [{ label: "Annuler" }, { label: "Importer", primary: true, onClick: async () => { for (const m of weeks) if (C.getWeek(this.state, m)) await this.saveVersion(m, "Avant import CSV"); const res = await this.commit([{ type: "importShifts", shifts }], { source: "import", summary: `Import CSV (${file.name})`, allowErrors: true }); if (res.ok) { this.ui.monday = weeks[0]; this.go("week"); } return res.ok; } }] });
  };

  App.importPlanningImage = async function (file) {
    if (!file) return;
    if (!AI.imagesOk) { toast("La lecture de photos n'est pas disponible ici (ouvrez l'application dans Claude).", "err"); return; }
    const d = openDialog({ title: "Lecture de la photo…", body: h("p", { class: "muted" }, "Claude lit le planning. Cela peut prendre une à deux minutes."), actions: [] });
    let data;
    try { data = await AI.readPlanningImage(file, this); } catch (e) { d.close(); toast(AI.errorText(e), "err"); return; }
    d.close();
    const s = this.state;
    const rows = (data && data.lignes) || [];
    const draft = rows.map((r) => {
      const f = C.findEmployee(s, r.prenom);
      return { name: String(r.prenom || ""), emp: f.emp ? f.emp.id : "", days: Array.from({ length: 7 }, (_, i) => { const j = (r.jours || []).find((x) => Number(x.jour) === i); return j ? (j.blocs || []).map((b) => `${b.debut}-${b.fin} ${String(b.zone || "").toUpperCase()}${b.doute ? " ?" : ""}`).join(", ") : ""; }) };
    });
    const parse = (txt) => String(txt).split(",").map((p) => p.trim()).filter(Boolean).map((p) => { const m = p.match(/^(\S+)\s*-\s*(\S+)\s+([A-Za-z]+)/); return m ? { s: C.normTime(m[1]), e: C.normTime(m[2]), z: m[3].toUpperCase() } : { bad: p }; });
    const body = h("div", { class: "stack" },
      h("p", { class: "small muted" }, "Corrigez chaque case au format « 13:30-17:00 ZP, 17:30-21:00 ZP ». Un « ? » signale une lecture incertaine (à retirer une fois vérifiée). Rattachez chaque ligne à une personne de l'équipe."),
      (data && data.incertitudes || []).length ? h("div", { class: "banner small" }, "Incertitudes signalées : ", data.incertitudes.join(" ; ")) : null,
      h("div", { class: "t-wrap" }, h("table", { class: "t" }, h("thead", {}, h("tr", {}, h("th", {}, "Ligne lue"), h("th", {}, "Personne"), C.DAYS_SHORT.map((x) => h("th", {}, x)))),
        h("tbody", {}, draft.map((r) => h("tr", {}, h("td", {}, r.name),
          h("td", {}, h("select", { class: "input", style: { width: "auto" }, onChange: (e) => { r.emp = e.target.value; } }, h("option", { value: "" }, "Ignorer"), s.employees.map((e) => h("option", { value: e.id, selected: e.id === r.emp }, e.name)))),
          r.days.map((v, i) => h("td", {}, h("input", { class: "input", style: { "min-width": "170px", "font-size": "13px" }, value: v, onInput: (e) => { r.days[i] = e.target.value; } })))))))));
    openDialog({ title: "Vérifier le planning lu", wide: true, body, actions: [{ label: "Annuler" }, { label: "Enregistrer comme modèle", primary: true, onClick: async () => {
      const shifts = [], problems = [];
      for (const r of draft) { if (!r.emp) continue; r.days.forEach((v, i) => { if (!v.trim()) return; if (v.includes("?")) problems.push(`${r.name}, ${C.DAYS[i]} : lecture incertaine non vérifiée`); const segs = parse(v.replace(/\?/g, "")); if (segs.some((g) => g.bad || !g.s || !g.e || !C.zoneById(s, g.z))) problems.push(`${r.name}, ${C.DAYS[i]} : « ${v} » illisible`); else shifts.push({ emp: r.emp, dow: i, segs }); }); }
      if (problems.length) { this.showErrors(problems.slice(0, 12), "À corriger avant d'enregistrer"); return false; }
      if (!shifts.length) { toast("Aucune ligne rattachée.", "err"); return false; }
      if (!(await confirmDialog("Remplacer le planning modèle ?", `${shifts.length} journées type remplaceront le modèle actuel. L'ancien reste dans l'historique.`, "Remplacer"))) return false;
      const r = await this.commit([{ type: "setTemplate", template: { label: `Modèle importé le ${C.fmtDate(this.today(), "num")}`, referenceWeek: data && C.isISO(data.semaine_du) ? data.semaine_du : null, shifts } }], { source: "import", summary: `Nouveau planning modèle (photo ${file.name})` });
      return r.ok;
    } }] });
  };

  App.importCalendarImage = async function (file) {
    if (!file) return;
    if (!AI.imagesOk) { toast("La lecture de photos n'est pas disponible ici (ouvrez l'application dans Claude).", "err"); return; }
    const d = openDialog({ title: "Lecture du calendrier…", body: h("p", { class: "muted" }, "Claude lit le calendrier. Cela peut prendre une à deux minutes."), actions: [] });
    let data;
    try { data = await AI.readCalendarImage(file); } catch (e) { d.close(); toast(AI.errorText(e), "err"); return; }
    d.close();
    const months = {};
    for (const [k, v] of Object.entries((data && data.mois) || {})) {
      if (!/^\d{4}-\d{2}$/.test(k)) continue;
      const len = new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7), 0)).getUTCDate();
      months[k] = String(v).toUpperCase().replace(/[^EPWF?]/g, "?").slice(0, len).padEnd(len, "?");
    }
    const keys = Object.keys(months).sort();
    if (!keys.length) { toast("Aucun mois reconnu sur l'image.", "err"); return; }
    const nameIn = h("input", { class: "input", value: (data && data.nom) || "Nouveau calendrier" });
    const s = this.state;
    const replaceSel = h("select", { class: "input" }, h("option", { value: "" }, "Ajouter comme nouveau calendrier"), s.calendars.map((c) => h("option", { value: c.id }, `Remplacer « ${c.name} »`)));
    const preview = h("div", { class: "yeargrid" }, keys.map((k) => h("div", { class: "ymonth" }, h("h3", {}, `${C.MONTHS[+k.slice(5) - 1]} ${k.slice(0, 4)}`), h("div", { class: "days" }, Array.from({ length: C.dow(`${k}-01`) }, () => h("span", { class: "yday blank" })), Array.from(months[k]).map((c, i) => h("span", { class: `yday ${c === "?" ? "Q" : c}` }, i + 1))))));
    openDialog({ title: "Vérifier le calendrier lu", wide: true, body: h("div", { class: "stack" }, (data.incertitudes || []).length ? h("div", { class: "banner small" }, "Incertitudes : ", data.incertitudes.join(" ; ")) : null, h("div", { class: "form-grid" }, h("label", { class: "f" }, "Nom", nameIn), h("label", { class: "f" }, "Enregistrement", replaceSel)), preview, h("p", { class: "small muted" }, "Après l'enregistrement, corrigez les jours mal lus dans « Calendrier alternants » (mode « Corriger des jours »).")),
      actions: [{ label: "Annuler" }, { label: "Enregistrer", primary: true, onClick: async () => {
        const id = replaceSel.value || C.slug(nameIn.value) + "-" + Date.now().toString(36).slice(-4);
        if (replaceSel.value && !(await confirmDialog("Remplacer le calendrier ?", "L'ancien calendrier reste dans l'historique.", "Remplacer", true))) return false;
        const r = await this.commit([{ type: "putCalendar", replace: !!replaceSel.value, calendar: { id, name: nameIn.value || "Calendrier", from: `${keys[0]}-01`, to: `${keys[keys.length - 1]}-${String(months[keys[keys.length - 1]].length).padStart(2, "0")}`, months, note: "Importé depuis une photo : à vérifier." } }], { source: "import" });
        if (r.ok) { this.ui.calId = id; this.go("alternants"); }
        return r.ok;
      } }] });
  };

  // ---------- Fiche heures d'une personne (semaine ou mois) ----------
  App.openPerson = function (empId, scope) {
    let mode = scope === "month" ? "month" : "week";
    let monday = this.ui.monday, month = this.ui.month;
    if (mode === "week" && this.ui.screen === "month") monday = C.mondayOf(`${month}-01`);
    const body = h("div", { class: "stack" });
    const range = () => {
      if (mode === "week") return { from: monday, to: C.addDays(monday, 6), label: `Semaine du ${C.fmtWeek(monday)}` };
      const [y, m] = month.split("-").map(Number);
      return { from: `${month}-01`, to: `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`, label: `${C.MONTHS[m - 1]} ${y}` };
    };
    const move = (n) => {
      if (mode === "week") monday = C.addDays(monday, 7 * n);
      else { const [y, m] = month.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; }
      draw();
    };
    const draw = () => {
      const s = this.state, e = C.empById(s, empId);
      if (!e) { body.replaceChildren(h("p", {}, "Personne introuvable.")); return; }
      const r = range(), x = C.hoursSummary(s, empId, r.from, r.to);
      const ref = mode === "week" ? C.templateMinutes(s, empId) : 0;
      const kpi = (label, val, color) => h("div", { class: "kpi" }, h("b", { style: color ? { color } : {} }, val), h("span", {}, label));
      const typeSel = h("select", { class: "input", id: "aj-type" }, Object.entries(C.ADJUST_TYPES).map(([k, v]) => h("option", { value: k }, v.label)));
      const dateIn = h("input", { type: "date", class: "input", id: "aj-date", value: r.from <= this.today() && this.today() <= r.to ? this.today() : r.from });
      const durIn = h("input", { class: "input", id: "aj-dur", placeholder: "ex. 1h30, 0:20, 7h", inputmode: "text" });
      const noteIn = h("input", { class: "input", id: "aj-note", maxlength: "200", placeholder: "Facultatif" });
      const realIn = h("input", { type: "time", class: "input", id: "aj-real", "aria-label": "Heure réelle" });
      const realLbl = h("span", {}, "ou heure réelle d'arrivée");
      const hint = h("p", { class: "small muted", id: "aj-hint" });
      const refresh = () => {
        realLbl.textContent = typeSel.value === "retard" ? "ou heure réelle d'arrivée" : typeSel.value === "heures_sup" ? "ou heure réelle de départ" : "";
        realIn.parentElement && (realIn.parentElement.hidden = typeSel.value === "journee_sup");
        const st = this.state.settings;
        const w = C.getWeek(this.state, C.mondayOf(dateIn.value));
        const sh = w && w.shifts.find((x) => x.emp === empId && x.date === dateIn.value);
        hint.textContent = typeSel.value === "journee_sup" ? "" : `${sh ? `Prévu ce jour : ${sh.segs[0].s}–${sh.segs[sh.segs.length - 1].e}. ` : "Pas d'horaire prévu ce jour-là. "}${typeSel.value === "retard" ? `Un retard compte à partir de ${st.lateThreshold || 5} min.` : `Les heures sup comptent à partir de ${st.extraThreshold || 5} min après l'heure.`}`;
      };
      typeSel.addEventListener("change", () => { if (typeSel.value === "journee_sup" && !durIn.value) durIn.value = "7h"; refresh(); });
      dateIn.addEventListener("change", refresh);
      body.replaceChildren(...[
        h("div", { class: "row between" },
          h("div", { class: "seg-ctl", role: "group", "aria-label": "Période" }, ["week", "month"].map((m) => h("button", { type: "button", "aria-pressed": String(m === mode), onClick: () => { mode = m; if (m === "month") month = monday.slice(0, 7); draw(); } }, m === "week" ? "Semaine" : "Mois"))),
          h("div", { class: "row" }, iconBtn("left", "Période précédente", () => move(-1)), h("b", { style: { "text-transform": mode === "month" ? "capitalize" : "none" } }, r.label), iconBtn("right", "Période suivante", () => move(1)))),
        h("div", { class: "kpis" },
          kpi("prévues au planning", C.fmtHours(x.planned)),
          kpi("heures sup", x.extra ? "+" + C.fmtHours(x.extra) : "0 h", x.extra ? "var(--ok)" : ""),
          kpi(`journée(s) en plus${x.extraDayCount ? " (" + x.extraDayCount + ")" : ""}`, x.extraDays ? "+" + C.fmtHours(x.extraDays) : "0 h", x.extraDays ? "var(--ok)" : ""),
          kpi("retards", x.late ? "−" + C.fmtHours(x.late) : "0 h", x.late ? "var(--danger)" : ""),
          kpi("total réel", C.fmtHours(x.total))),
        mode === "week" ? h("p", { class: "small muted" }, `Contrat : ${s.settings.contractHours || 35} h par semaine${x.total !== (s.settings.contractHours || 35) * 60 ? ` (${x.total > (s.settings.contractHours || 35) * 60 ? "+" : "−"}${C.fmtHours(Math.abs(x.total - (s.settings.contractHours || 35) * 60))})` : " ✓"}${ref ? ` · planning modèle : ${C.fmtHours(ref)}` : ""}.`) : null,
        h("details", { open: mode === "week" }, h("summary", { class: "small" }, `${x.workedDays} jour(s) planifié(s)`),
          h("div", { class: "list" }, x.days.map((d) => h("div", { class: "item" }, h("span", { class: "grow" }, C.fmtDate(d.date, "day")), h("span", { class: "small muted num" }, C.segLabel(d.segs)), h("b", { class: "num small" }, C.fmtHours(d.minutes)))))),
        h("h3", {}, "Heures sup, journées en plus et retards"),
        x.adjustments.length ? h("div", { class: "list" }, x.adjustments.map((a) => {
          const t = C.ADJUST_TYPES[a.type];
          return h("div", { class: "item" },
            h("span", { class: t.sign > 0 ? "chip ok" : "chip err" }, t.label),
            h("div", { class: "grow" }, h("div", {}, C.fmtDate(a.date, "day")), a.note ? h("div", { class: "small muted" }, a.note) : null),
            h("b", { class: "num", style: { color: t.sign > 0 ? "var(--ok)" : "var(--danger)" } }, `${t.sign > 0 ? "+" : "−"}${C.fmtHours(a.minutes)}`),
            Store.canWrite ? iconBtn("close", "Supprimer", async () => { if (await confirmDialog("Supprimer cette ligne ?", `${t.label} du ${C.fmtDate(a.date, "day")} (${C.fmtHours(a.minutes)}).`, "Supprimer", true)) { await this.commit([{ type: "removeAdjustment", id: a.id }]); draw(); } }) : null);
        })) : h("p", { class: "small muted" }, "Rien sur cette période."),
        Store.canWrite ? h("form", { class: "stack", onSubmit: async (ev) => {
          ev.preventDefault();
          let min = C.parseDuration(durIn.value), note = noteIn.value;
          if (realIn.value && typeSel.value !== "journee_sup") {
            const dv = C.deviationFromTimes(this.state, empId, dateIn.value, typeSel.value === "retard" ? { arrive: realIn.value } : { depart: realIn.value });
            if (dv.error) { toast(dv.error, "err"); return; }
            const got = typeSel.value === "retard" ? dv.late : dv.extra, raw = typeSel.value === "retard" ? dv.lateRaw : dv.extraRaw;
            if (!got) { toast(raw ? `${raw} min seulement : rien n'est compté (seuil de 5 min).` : "Pas d'écart avec l'horaire prévu : rien n'est compté.", ""); return; }
            min = got;
            note = [`${typeSel.value === "retard" ? "Arrivée" : "Départ"} à ${realIn.value} (prévu ${typeSel.value === "retard" ? dv.planned.s : dv.planned.e})`, note].filter(Boolean).join(" · ");
          }
          if (!min) { toast("Durée illisible : écrivez par exemple 1h30, 0:20 ou 7h, ou indiquez l'heure réelle.", "err"); return; }
          const res = await this.commit([{ type: "addAdjustment", adjustment: { emp: empId, date: dateIn.value, type: typeSel.value, minutes: min, note } }]);
          if (res.ok) { toast("Ajouté."); draw(); }
        } },
          h("div", { class: "form-grid" }, h("label", { class: "f" }, "Type", typeSel), h("label", { class: "f" }, "Date", dateIn), h("label", { class: "f" }, "Durée", durIn), h("label", { class: "f" }, realLbl, realIn)),
          hint,
          h("label", { class: "f" }, "Note", noteIn),
          h("div", {}, h("button", { type: "submit", class: "btn primary" }, "Ajouter"))) : null].filter(Boolean));
      refresh();
    };
    draw();
    openDialog({ title: empName(this.state, empId), body, wide: true, actions: [{ label: "Fermer", primary: true }] });
  };

  // ---------- Plannings papier fournis avec l'appli ----------
  // Ajoutés d'office si la semaine est vide ; sinon proposés (jamais de remplacement silencieux).
  App.syncReference = async function () {
    const R = root.PlanningReference;
    if (!R || !this.state || !Store.canWrite) return;
    this.pendingRef = [];
    for (const u of R.ruleUpdates || []) {
      const ops = [];
      for (const [id, rules] of Object.entries(u.rules || {})) {
        const e = C.empById(this.state, id);
        if (e && !(e.rulesApplied || []).includes(u.id)) ops.push({ type: "updateEmployee", id, patch: { rules: { ...(e.rules || {}), ...rules }, rulesApplied: [...(e.rulesApplied || []), u.id] } });
      }
      for (const [id, cal] of Object.entries(u.calendars || {})) {
        const e = C.empById(this.state, id);
        if (e && (e.role !== "alternant" || e.calendarId !== cal)) ops.push({ type: "updateEmployee", id, patch: { role: "alternant", calendarId: cal } });
      }
      if (ops.length) await this.commit(ops, { source: "import", summary: "Règles personnelles : horaires et jours de repos fixes, calendrier BTS des alternants", quiet: true, noImpacts: true });
    }
    for (const x of R.extraWeeks || []) {
      const cur = this.state.weeks[x.monday];
      if (cur && cur.refId === x.refId) continue;
      const p = { x };
      if (!cur || !cur.shifts.length) await this.applyRefWeek(p, false);
      else this.pendingRef.push(p);
    }
    // Départs de l'équipe : la personne est désactivée et ses créneaux à partir de la date sont retirés
    // (ses postes deviennent « à pourvoir », les jours passés restent dans l'historique des heures).
    // Réparation : départ appliqué par une version antérieure (sans date de départ ni postes vidés).
    for (const u of R.teamUpdates || []) {
      if (!(this.state.settings.appliedUpdates || []).includes(u.id)) continue;
      const ops = [];
      for (const [id, from] of Object.entries(u.leave || {})) {
        const e = C.empById(this.state, id);
        if (!e || e.leftOn) continue;
        ops.push({ type: "updateEmployee", id, patch: { leftOn: from } });
        const refShifts = [
          ...R.template.shifts.map((t) => ({ ...t, date: C.addDays(R.template.referenceWeek, t.dow) })),
          ...(R.extraWeeks || []).flatMap((x) => x.shifts.map((t) => ({ ...t, date: C.addDays(x.monday, t.dow) }))),
        ].filter((t) => t.emp === id && t.date >= from);
        const byWeek = {};
        for (const t of refShifts) (byWeek[C.mondayOf(t.date)] = byWeek[C.mondayOf(t.date)] || []).push(t);
        for (const [m, list] of Object.entries(byWeek)) {
          const w = this.state.weeks[m];
          if (!w) continue;
          const missing = list.filter((t) => !w.shifts.some((x) => x.emp === id && x.date === t.date) && !(w.vacated || []).some((v) => v.emp === id && v.date === t.date));
          if (missing.length) ops.push({ type: "putWeek", monday: m, week: { ...C.clone(w), vacated: [...(w.vacated || []), ...missing.map((t) => ({ date: t.date, emp: id, segs: t.segs.map(({ s: a, e: b, z }) => ({ s: a, e: b, z })), reason: `départ de ${e.name}` }))] } });
        }
      }
      if (ops.length) await this.commit(ops, { source: "import", summary: "Départ de l'équipe : date et postes à pourvoir complétés", quiet: true, noImpacts: true, allowErrors: true });
    }
    for (const u of R.teamUpdates || []) {
      const done = this.state.settings.appliedUpdates || [];
      if (done.includes(u.id)) continue;
      const ops = [];
      for (const id of u.remove || []) {
        const e = C.empById(this.state, id);
        if (!e) continue;
        const used = Object.values(this.state.weeks).some((w) => w.shifts.some((x) => x.emp === id)) || this.state.template.shifts.some((t) => t.emp === id);
        ops.push(used ? { type: "updateEmployee", id, patch: { active: false, leftOn: (u.leftOn && u.leftOn[id]) || e.leftOn || this.today() } } : { type: "removeEmployee", id });
      }
      // Personne retirée de tout le planning (ex. la patronne) : ses créneaux, postes vidés, modèle, heures et fiche.
      for (const id of u.purge || []) {
        const st = this.state;
        for (const w of Object.values(st.weeks)) {
          const mine = w.shifts.filter((x) => x.emp === id), vac = (w.vacated || []).filter((v) => v.emp === id);
          if (mine.length || vac.length) ops.push({ type: "putWeek", monday: w.week, week: { ...C.clone(w), shifts: w.shifts.filter((x) => x.emp !== id), vacated: (w.vacated || []).filter((v) => v.emp !== id) } });
        }
        if (st.template.shifts.some((t) => t.emp === id)) ops.push({ type: "setTemplate", template: { ...C.clone(st.template), shifts: st.template.shifts.filter((t) => t.emp !== id) } });
        for (const a of Object.values(st.adjustments || {})) if (a.emp === id) ops.push({ type: "removeAdjustment", id: a.id });
        for (const a of Object.values(st.absences || {})) if (a.emp === id) ops.push({ type: "removeAbsence", id: a.id });
        if (C.empById(st, id)) ops.push({ type: "removeEmployee", id });
      }
      for (const [id, leave] of Object.entries(u.onLeave || {})) if (C.empById(this.state, id)) ops.push({ type: "updateEmployee", id, patch: { onLeave: leave } });
      if (u.closing) {
        // Nouvelle heure de fermeture : services d'après-midi décalés à partir de la date, dans les semaines et le modèle.
        const cl = u.closing, st = this.state;
        for (const w of Object.values(st.weeks)) {
          if (C.addDays(w.week, 6) < cl.from) continue;
          let changed = false;
          const shifts = w.shifts.map((x) => { if (x.date < cl.from) return x; const segs = C.applyClosing(x.segs, cl); if (segs !== x.segs) changed = true; return { ...x, segs }; });
          if (changed) ops.push({ type: "putWeek", monday: w.week, week: { ...C.clone(w), shifts } });
        }
        const tpl = st.template.shifts.map((t) => ({ ...t, segs: C.applyClosing(t.segs, cl) }));
        if (tpl.some((t, i) => t.segs !== st.template.shifts[i].segs)) ops.push({ type: "setTemplate", template: { ...C.clone(st.template), shifts: tpl } });
        ops.push({ type: "setSettings", patch: { closingZP: cl.ZP, closingZR: cl.ZR } });
      }
      if (u.confirmAll) ops.push({ type: "confirmAll" });
      if (u.validatePaperWeeks) for (const w of Object.values(this.state.weeks)) {
        if (!(w.refId || /papier/.test(w.source || "")) || w.status === "validé" || !w.shifts.length) continue;
        if (C.blockingIssues(C.validateWeek(this.state, w.week)).length) continue; // une semaine avec une erreur reste en brouillon
        ops.push({ type: "setWeekStatus", monday: w.week, status: "validé", acknowledge: true });
      }
      if (u.settings) ops.push({ type: "setSettings", patch: u.settings });
      for (const [id, from] of Object.entries(u.leave || {})) {
        if (!C.empById(this.state, id)) continue;
        ops.push({ type: "updateEmployee", id, patch: { active: false, leftOn: from } });
        const nm = C.empById(this.state, id).name;
        for (const w of Object.values(this.state.weeks)) for (const x of w.shifts) if (x.emp === id && x.date >= from) ops.push({ type: "removeShift", emp: id, date: x.date, vacate: `départ de ${nm}` });
      }
      ops.push({ type: "setSettings", patch: { appliedUpdates: [...done, u.id] } });
      await this.commit(ops, { source: "import", summary: u.summary, quiet: true, noImpacts: true, allowErrors: true });
    }
    this.render();
  };
  App.applyRefWeek = async function (p, replacing) {
    const x = p.x, s = this.state;
    // Ancien employé présent sur un planning passé : remis dans les données comme parti (jamais planifié ensuite).
    const pre = [];
    for (const f of x.formerEmployees || []) {
      const e = C.empById(s, f.id);
      if (!e) pre.push({ type: "addEmployee", employee: { name: f.name, role: "salarie", zones: f.zones } }, { type: "updateEmployee", id: f.id, patch: { active: false, leftOn: f.leftOn } });
      else {
        const missing = Object.keys(f.zones || {}).filter((z) => !(e.zones || {})[z]);
        if (missing.length) pre.push({ type: "setZones", emp: f.id, zones: { ...(e.zones || {}), ...Object.fromEntries(missing.map((z) => [z, f.zones[z]])) } });
        if (e.active === false && !e.leftOn) pre.push({ type: "updateEmployee", id: f.id, patch: { leftOn: f.leftOn } });
      }
    }
    const week = { week: x.monday, status: "brouillon", source: x.source, refId: x.refId, shifts: x.shifts.map((t, i) => ({ id: `${x.refId}-${i}`, emp: t.emp, date: C.addDays(x.monday, t.dow), segs: C.clone(t.segs) })) };
    const ops = [];
    for (const [emp, zs] of Object.entries(x.zonesAdd || {})) {
      const e = C.empById(s, emp); if (!e) continue;
      const missing = zs.filter((z) => !(e.zones || {})[z]);
      if (missing.length) ops.push({ type: "setZones", emp, zones: { ...(e.zones || {}), ...Object.fromEntries(missing.map((z) => [z, "confirme"])) } });
    }
    ops.unshift(...pre);
    ops.push({ type: "putWeek", monday: x.monday, week });
    for (const ab of x.absences || []) {
      if (Object.values(s.absences || {}).some((y) => y.emp === ab.emp && y.from === ab.from && y.to === ab.to)) continue;
      if (C.empById(s, ab.emp) || pre.some((o) => o.type === "addEmployee" && C.slug(o.employee.name) === ab.emp)) ops.push({ type: "addAbsence", absence: { ...ab, id: `cp-${ab.emp}-${ab.from}` } });
    }
    if (replacing) await this.saveVersion(x.monday, "Avant remplacement par le planning papier");
    const r = await this.commit(ops, { source: "import", summary: `Planning papier de la semaine du ${C.fmtWeek(x.monday)}`, allowErrors: true, quiet: true, noImpacts: true });
    if (r.ok) {
      this.pendingRef = (this.pendingRef || []).filter((y) => y !== p);
      toast(`Planning de la semaine du ${C.fmtWeek(x.monday)} ajouté.`, "", { label: "Voir", fn: () => { this.ui.monday = x.monday; this.go("week"); } });
      this.render();
    }
  };

  // ---------- Exportation ----------
  SCREENS.export = { title: "Exportation", render() {
    const s = this.state;
    let scope = "semaine";
    const weekIn = h("input", { type: "date", class: "input", id: "ex-week", value: this.ui.monday });
    const monthIn = h("input", { type: "month", class: "input", id: "ex-month", value: this.ui.monday.slice(0, 7) });
    const box = h("div", {});
    const seg = h("div", { class: "seg-ctl", role: "group" }, ["semaine", "mois"].map((m) => h("button", { type: "button", "aria-pressed": String(m === scope), onClick: () => { scope = m; seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.textContent.toLowerCase() === m))); draw(); } }, m[0].toUpperCase() + m.slice(1))));
    const draw = () => box.replaceChildren(scope === "semaine" ? h("label", { class: "f" }, "Semaine contenant le", weekIn) : h("label", { class: "f" }, "Mois", monthIn));
    draw();
    const mondays = () => {
      if (scope === "semaine") return [C.mondayOf(weekIn.value)];
      const first = `${monthIn.value}-01`, [y, m] = monthIn.value.split("-").map(Number);
      const last = `${monthIn.value}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
      const out = []; for (let d = C.mondayOf(first); d <= last; d = C.addDays(d, 7)) out.push(d); return out;
    };
    const name = (ext) => `planning-${scope === "semaine" ? C.mondayOf(weekIn.value) : monthIn.value}.${ext}`;
    const run = async (kind) => {
      const ms = mondays().filter((m) => C.getWeek(s, m) && C.getWeek(s, m).shifts.length);
      if (!ms.length) { toast("Aucun horaire sur cette période.", "err"); return; }
      let data, type;
      if (kind === "pdf") { data = X.weeksToPDF(s, ms, "Planning équipe"); type = "application/pdf"; }
      else if (kind === "xlsx") { data = X.weeksToXLSX(s, ms); type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; }
      else { data = C.weeksToCSV(s, ms); type = "text/csv;charset=utf-8"; }
      await saveFile(name(kind), new Blob([data], { type }));
    };
    return h("div", { class: "stack", style: { gap: "16px" } },
      h("section", { class: "card" }, h("h2", {}, "Exporter le planning"),
        h("div", { class: "stack", style: { "margin-top": "12px" } }, h("div", { class: "row" }, seg), box,
          h("div", { class: "cards", style: { "margin-top": "8px" } },
            h("div", { class: "card flat" }, h("h3", {}, "PDF"), h("p", { class: "small muted" }, "Une page par semaine, en paysage, couleurs des zones et codes ZP/ZR. Pour afficher ou envoyer."), h("div", { style: { "margin-top": "10px" } }, btn("Télécharger le PDF", () => run("pdf"), "primary"))),
            h("div", { class: "card flat" }, h("h3", {}, "Excel (.xlsx)"), h("p", { class: "small muted" }, "Un onglet par semaine, cellules colorées par zone (hachures quand une journée mélange deux zones)."), h("div", { style: { "margin-top": "10px" } }, btn("Télécharger le fichier Excel", () => run("xlsx"), "primary"))),
            h("div", { class: "card flat" }, h("h3", {}, "CSV"), h("p", { class: "small muted" }, "Une ligne par personne et par jour (séparateur « ; »). Réimportable dans l'écran Importation."), h("div", { style: { "margin-top": "10px" } }, btn("Télécharger le CSV", () => run("csv"), "primary")))))),
      h("p", { class: "small muted" }, "Le téléchargement demande une confirmation. Les couleurs ne passent pas dans le CSV : les zones y sont écrites en toutes lettres (ZP, ZR)."));
  } };

  App.downloadPDF = async function (mondays, filename) {
    const ms = mondays.filter((m) => { const w = C.getWeek(this.state, m); return w && w.shifts.length; });
    if (!ms.length) { toast("Aucun horaire à télécharger sur cette période.", "err"); return; }
    const data = X.weeksToPDF(this.state, ms, "Planning équipe");
    await saveFile(filename, new Blob([data], { type: "application/pdf" }));
  };

  async function saveFile(filename, blob) {
    const claude = root.claude;
    const dl = claude && typeof claude.use === "function" ? await claude.use("downloads").catch(() => null) : null;
    if (dl) {
      try { const r = await dl.save({ filename, data: blob }); if (r && r.status === "saved") toast(`${filename} enregistré.`); }
      catch (e) { if (e && e.code !== "cancelled" && e.code !== "declined") toast("Le fichier n'a pas pu être enregistré.", "err"); }
      return;
    }
    // Téléphone : menu de partage (Imprimer, Enregistrer dans Fichiers, AirDrop…) ; ordinateur : téléchargement.
    const touch = root.matchMedia && root.matchMedia("(pointer: coarse)").matches;
    if (touch && navigator.canShare) {
      try {
        const file = new File([blob], filename, { type: blob.type });
        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return; }
      } catch (e) { if (e && e.name === "AbortError") return; }
    }
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: filename });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // =====================================================================
  // Assistant IA (panneau)
  // =====================================================================
  App.proposals = [];
  App.showProposal = function (p) {
    p.id = C.uid("p"); p.state = "en attente";
    this.proposals.push(p);
    this.chat.push({ role: "proposal", id: p.id, text: "" });
    this.renderMessages();
  };
  App.applyProposal = async function (id) {
    const p = this.proposals.find((x) => x.id === id);
    if (!p || p.state !== "en attente") return;
    let ok;
    if (p.kind === "undo") { await this.undo(); ok = true; }
    else {
      for (const o of p.ops) if (o.type === "putWeek" && C.getWeek(this.state, o.monday)) await this.saveVersion(o.monday, "Avant génération (assistant)");
      const r = await this.commit(p.ops, { source: "assistant IA", summary: p.summary });
      ok = r.ok;
      if (!ok && r.errors) this.chat.push({ role: "system", text: "La modification n'a pas été appliquée : le planning a changé depuis la proposition." });
    }
    p.state = ok ? "appliquée" : "échec";
    this.chat.push({ role: "system", text: ok ? `Appliqué : ${p.summary}` : "Non appliqué." });
    Store.saveChat(this.chat.filter((m) => m.role === "user" || m.role === "assistant" || m.role === "system"));
    this.renderMessages();
  };
  App.rejectProposal = function (id) {
    const p = this.proposals.find((x) => x.id === id);
    if (!p) return;
    p.state = "refusée";
    this.chat.push({ role: "system", text: "Proposition écartée." });
    this.renderMessages();
  };

  App.renderAI = function () {
    const box = document.querySelector("#ai");
    if (!box) return;
    box.hidden = !this.ui.aiOpen;
    if (!this.ui.aiOpen) return;
    const statusText = { verification: "Connexion à Claude…", absent: "Indisponible ici", "sans-outils": "Lecture seule", pret: "Prêt" }[AI.status] || "";
    const msgs = h("div", { class: "msgs", id: "ai-msgs", "aria-live": "polite" });
    const ta = h("textarea", { class: "input", id: "ai-input", rows: "1", placeholder: "Ex. : Mets Fleur de 14 h à 21 h mardi prochain", disabled: AI.status !== "pret" && AI.status !== "sans-outils",
      onKeydown: (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } },
      onInput: () => { ta.style.height = "auto"; ta.style.height = Math.min(140, ta.scrollHeight) + "px"; } });
    const send = h("button", { type: "submit", class: "btn primary", "aria-label": "Envoyer", disabled: AI.status !== "pret" && AI.status !== "sans-outils" }, icon("send"));
    const form = h("form", { onSubmit: (e) => { e.preventDefault(); this.askAI(ta.value); ta.value = ""; ta.style.height = "auto"; } }, ta, send);
    box.replaceChildren(
      h("header", {}, icon("spark"), h("h2", {}, "Assistant"), h("span", { class: "chip " + (AI.status === "pret" ? "ok" : "warn") }, statusText),
        iconBtn("info", "Données transmises à l'IA", () => this.aiInfo()),
        this.chat.length ? iconBtn("refresh", "Nouvelle conversation", () => { this.chat = []; this.proposals = []; Store.saveChat([]); this.renderMessages(); }) : null,
        iconBtn("close", "Fermer l'assistant", () => this.toggleAI(false))),
      msgs, form);
    this.renderMessages();
  };
  App.aiInfo = function () {
    openDialog({ title: "L'assistant et vos données", body: h("div", { class: "stack small" },
      h("p", {}, "L'assistant est Claude, utilisé avec le compte Claude de la personne qui écrit. Aucune clé API n'est stockée dans l'application."),
      h("p", {}, h("b", {}, "Envoyé à Claude à chaque message : "), "la date du jour, les prénoms de l'équipe, leur statut (salarié/alternant), leurs zones autorisées, et votre conversation. Pendant la réponse, Claude peut lire, via des outils contrôlés : les horaires d'une semaine, qui travaille un jour donné, les disponibilités, les congés (type et dates) et les points à vérifier."),
      h("p", {}, h("b", {}, "Jamais envoyé : "), "les notes des absences et des créneaux, l'historique, les photos d'origine (sauf si vous importez une photo, qui est alors lue par Claude)."),
      h("p", {}, h("b", {}, "Modifications : "), "Claude ne peut rien enregistrer. Il prépare une proposition, vérifiée par les mêmes règles que le planning ; vous cliquez sur « Appliquer » pour l'enregistrer. Tout est inscrit dans l'historique avec la mention « assistant IA »."),
      h("p", {}, "La conversation est gardée pour vous seul(e) (30 derniers messages).")), actions: [{ label: "Compris", primary: true }] });
  };
  App.renderMessages = function () {
    const box = document.querySelector("#ai-msgs");
    if (!box) return;
    const s = this.state;
    const kids = [];
    if (AI.status === "absent") kids.push(h("div", { class: "msg system" }, "L'assistant IA fonctionne dans la version Claude de l'appli (il utilise votre compte Claude, sans clé à configurer). Ici, tout le reste marche normalement.", h("div", { style: { "margin-top": "10px" } }, h("a", { class: "btn primary", href: CLAUDE_URL, target: "_blank", rel: "noopener" }, "Ouvrir l'assistant dans Claude"))));
    else if (AI.status === "sans-outils") kids.push(h("div", { class: "msg system" }, "Cette version de l'application Claude ne permet pas à l'assistant de lire le planning : mettez l'application à jour pour l'utiliser pleinement."));
    if (!this.chat.length && s) {
      kids.push(h("div", { class: "msg assistant" }, "Bonjour. Demandez-moi une modification ou une vérification en français courant. Je prépare la modification, vous la validez d'un clic."));
      kids.push(h("div", { class: "suggest" }, [
        "Qui travaille en zone réservée samedi ?",
        "Vérifie si les horaires sont compatibles avec les cours des alternants",
        "Génère le planning de la semaine prochaine",
        "Qui peut remplacer Fleur jeudi prochain ?",
      ].map((t) => h("button", { type: "button", onClick: () => this.askAI(t), disabled: AI.status !== "pret" }, t))));
    }
    for (const m of this.chat) {
      if (m.role === "proposal") {
        const p = this.proposals.find((x) => x.id === m.id);
        if (!p) continue;
        const pending = p.state === "en attente";
        const diffLines = [];
        if (p.kind === "ops" && p.changes) for (const c of p.changes) {
          if (c.col === "weeks") {
            const key = (x) => `${x.emp}|${x.date}`;
            const b = new Map(((c.before && c.before.shifts) || []).map((x) => [key(x), x])), a = new Map(((c.after && c.after.shifts) || []).map((x) => [key(x), x]));
            for (const [k, x] of a) { const y = b.get(k); if (!y) diffLines.push(h("div", { class: "add" }, `+ ${empName(s, x.emp)} ${C.fmtDate(x.date, "short")} ${C.segLabel(x.segs)} ${[...new Set(x.segs.map((g) => g.z))].join("/")}`)); else if (C.segKey(y.segs) !== C.segKey(x.segs)) diffLines.push(h("div", {}, `~ ${empName(s, x.emp)} ${C.fmtDate(x.date, "short")} : ${C.segLabel(y.segs)} → ${C.segLabel(x.segs)} ${[...new Set(x.segs.map((g) => g.z))].join("/")}`)); }
            for (const [k, y] of b) if (!a.has(k)) diffLines.push(h("div", { class: "del" }, `− ${empName(s, y.emp)} ${C.fmtDate(y.date, "short")} ${C.segLabel(y.segs)}`));
            if ((c.before || {}).status !== (c.after || {}).status && c.after && c.after.status === "validé") diffLines.push(h("div", {}, `Semaine du ${C.fmtWeek(c.id)} validée`));
          } else if (c.col === "absences") diffLines.push(h("div", { class: c.after ? "add" : "del" }, c.after ? `+ ${C.ABSENCE_TYPES[c.after.type]} : ${empName(s, c.after.emp)} du ${C.fmtDate(c.after.from, "short")} au ${C.fmtDate(c.after.to, "short")}` : "− absence supprimée"));
          else diffLines.push(h("div", {}, `Paramètres modifiés : ${({ employees: "équipe", zones: "zones", settings: "règles", template: "modèle", calendars: "calendrier" })[c.id]}`));
        }
        kids.push(h("div", { class: "proposal" + (pending ? "" : " done") },
          h("b", { class: "small" }, pending ? "Modification proposée" : `Proposition ${p.state}`),
          h("div", {}, p.summary),
          diffLines.length ? h("div", { class: "diff" }, diffLines.slice(0, 25), diffLines.length > 25 ? h("div", { class: "muted" }, `… et ${diffLines.length - 25} autres`) : null) : null,
          (p.alerts || []).length ? h("div", {}, p.alerts.slice(0, 6).map((a) => h("div", { class: "issue alerte" }, h("span", { class: "ico" }, "?"), h("span", { class: "small" }, a)))) : null,
          (p.impacts || []).length ? h("div", { class: "small" }, `${p.impacts.length} créneau(x) déjà planifié(s) concerné(s) : vous pourrez choisir quoi en faire après l'application.`) : null,
          pending ? h("div", { class: "row" }, btn("Appliquer", () => this.applyProposal(p.id), "primary sm", { disabled: !Store.canWrite }), btn("Écarter", () => this.rejectProposal(p.id), "sm")) : null));
      } else kids.push(h("div", { class: "msg " + m.role }, m.text));
    }
    if (this.aiBusy) kids.push(h("div", { class: "msg assistant", id: "ai-live" }, this.aiLive || "Réflexion…"), h("div", { class: "row" }, btn("Arrêter", () => this.aiCtl && this.aiCtl.abort(), "sm")));
    box.replaceChildren(...kids);
    box.scrollTop = box.scrollHeight;
  };
  App.askAI = async function (text) {
    text = String(text || "").trim();
    if (!text || this.aiBusy) return;
    if (!this.state) { toast("Importez d'abord les calendriers.", "err"); return; }
    if (!this.ui.aiOpen) this.toggleAI(true);
    this.chat.push({ role: "user", text, at: new Date().toISOString() });
    this.aiBusy = true; this.aiLive = ""; this.aiCtl = new AbortController();
    this.renderMessages();
    try {
      const history = this.chat.filter((m) => m.role === "user" || m.role === "assistant");
      const res = await AI.ask(this, history, ({ text: t }) => { this.aiLive = t; const live = document.querySelector("#ai-live"); if (live) live.textContent = t; }, this.aiCtl.signal);
      this.chat.push({ role: "assistant", text: res.text + (res.truncated ? "\n\n(Réponse coupée : posez une question plus courte.)" : ""), at: new Date().toISOString() });
    } catch (e) {
      if (e && e.text) this.chat.push({ role: "assistant", text: e.text });
      this.chat.push({ role: "system", text: AI.errorText(e) });
    } finally {
      this.aiBusy = false; this.aiCtl = null;
      Store.saveChat(this.chat.filter((m) => m.role !== "proposal"));
      this.renderMessages();
    }
  };

  root.PlanningApp = App;
  const start = () => App.boot().catch((e) => { const m = document.getElementById("app-root") || document.body; m.textContent = "Erreur au démarrage : " + (e && e.message) + ". Touchez Actualiser ou rechargez la page."; });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})(typeof globalThis !== "undefined" ? globalThis : this);
