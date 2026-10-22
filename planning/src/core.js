// Logique métier du planning : dates, horaires, contraintes, génération, opérations.
// Aucune dépendance au navigateur : ce fichier est aussi chargé par les tests Node.
(function (root) {
  "use strict";

  const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const DAYS_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

  const ABSENCE_TYPES = {
    conges: "Congés payés",
    vacances: "Vacances",
    repos: "Jour de repos",
    arret: "Arrêt / absence",
    cours: "Journée de cours",
    indispo: "Indisponibilité",
    fermeture: "Fermeture",
  };

  const DEFAULT_SETTINGS = {
    checkRest: true, minRestHours: 11,
    checkMaxDay: true, maxDayHours: 10,
    checkMaxWeek: true, maxWeekHours: 48,
    coverageFromTemplate: true,
    rulesConfirmed: false,
  };

  // Codes qui empêchent d'enregistrer une modification ou de valider un planning.
  const BLOCKING = new Set(["TIME_INVALID", "SEG_OVERLAP", "SHIFT_OVERLAP", "ZONE_FORBIDDEN", "ZONE_MISSING", "FORMATION", "ABSENCE", "INACTIVE", "UNKNOWN_EMP"]);

  // ---------- Dates (ISO AAAA-MM-JJ, calculées en UTC pour éviter les décalages d'heure d'été) ----------
  const pad = (n) => String(n).padStart(2, "0");
  function parseISO(s) {
    const [y, m, d] = String(s).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const isISO = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(parseISO(s)) === s;
  const addDays = (s, n) => { const d = parseISO(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const dow = (s) => (parseISO(s).getUTCDay() + 6) % 7; // 0 = lundi
  const mondayOf = (s) => addDays(s, -dow(s));
  const weekDates = (monday) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
  function fmtDate(s, style) {
    const d = parseISO(s);
    const dd = d.getUTCDate(), mm = d.getUTCMonth(), yy = d.getUTCFullYear();
    if (style === "short") return `${pad(dd)}/${pad(mm + 1)}`;
    if (style === "num") return `${pad(dd)}/${pad(mm + 1)}/${yy}`;
    if (style === "day") return `${DAYS[dow(s)]} ${dd} ${MONTHS[mm]}`;
    return `${DAYS[dow(s)]} ${dd} ${MONTHS[mm]} ${yy}`;
  }
  function fmtWeek(monday) {
    const sun = addDays(monday, 6);
    const a = parseISO(monday), b = parseISO(sun);
    const same = a.getUTCMonth() === b.getUTCMonth();
    return `${a.getUTCDate()}${same ? "" : " " + MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
  }
  function isoWeekNumber(s) {
    const d = parseISO(s);
    d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
    const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  }

  // ---------- Horaires ----------
  const isTime = (t) => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  function normTime(t) {
    if (t == null) return null;
    let s = String(t).trim().toLowerCase().replace(/\s/g, "").replace("h", ":");
    if (/^\d{1,2}$/.test(s)) s += ":00";
    if (/^\d{1,2}:$/.test(s)) s += "00";
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const out = `${pad(+m[1])}:${m[2]}`;
    return isTime(out) ? out : (out === "24:00" ? "00:00" : null);
  }
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const fromMin = (m) => `${pad(Math.floor(((m % 1440) + 1440) % 1440 / 60))}:${pad(((m % 60) + 60) % 60)}`;
  // Intervalle d'un bloc en minutes depuis minuit ; une fin ≤ début passe minuit (horaire de nuit).
  function segRange(seg) {
    const s = toMin(seg.s); let e = toMin(seg.e);
    if (e <= s) e += 1440;
    return [s, e];
  }
  const segMinutes = (seg) => { const [s, e] = segRange(seg); return e - s; };
  // Les blocs d'une journée se suivent ; un bloc qui commence avant la fin du précédent est décalé au lendemain (nuit).
  function shiftRanges(segs) {
    const out = []; let offset = 0, prevS = -1;
    for (const seg of segs) {
      let s = toMin(seg.s) + offset, e = toMin(seg.e) + offset;
      if (e <= s) e += 1440;
      if (prevS >= 0 && s < prevS) { s += 1440; e += 1440; offset += 1440; }
      out.push([s, e]); prevS = s;
    }
    return out;
  }
  const shiftMinutes = (segs) => (segs || []).reduce((a, sg) => a + (isTime(sg.s) && isTime(sg.e) ? segMinutes(sg) : 0), 0);
  const fmtHours = (min) => { const h = Math.floor(min / 60), m = min % 60; return m ? `${h} h ${pad(m)}` : `${h} h`; };
  const hoursDecimal = (min) => (min / 60).toFixed(2);
  const segKey = (segs) => (segs || []).map((g) => `${g.s}-${g.e}-${g.z}`).join("|");
  const segLabel = (segs) => (segs || []).map((g) => `${g.s}–${g.e}`).join(" · ");
  // Pauses = trous entre deux blocs consécutifs.
  function pauses(segs) {
    const r = shiftRanges(segs || []); const out = [];
    for (let i = 1; i < r.length; i++) if (r[i][0] > r[i - 1][1]) out.push({ s: fromMin(r[i - 1][1]), e: fromMin(r[i][0]), min: r[i][0] - r[i - 1][1] });
    return out;
  }

  // ---------- Recherche ----------
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const slug = (s) => norm(s).replace(/ /g, "-") || "x";
  const uid = (p) => `${p || "id"}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  const empById = (state, id) => state.employees.find((e) => e.id === id);
  function findEmployee(state, name) {
    const q = norm(name);
    if (!q) return { matches: [] };
    const all = state.employees;
    const names = (e) => [e.id, e.name, ...(e.aliases || [])].map(norm);
    let m = all.filter((e) => names(e).includes(q));
    if (!m.length) m = all.filter((e) => names(e).some((n) => n.startsWith(q) || q.startsWith(n) && n.length >= 3));
    if (!m.length) m = all.filter((e) => names(e).some((n) => n.includes(q)));
    return m.length === 1 ? { emp: m[0], matches: m } : { matches: m };
  }

  // ---------- Zones ----------
  const zoneLevel = (emp, z) => (emp && emp.zones ? emp.zones[z] : undefined);
  const zoneById = (state, id) => state.zones.find((z) => z.id === id);
  const allowedZones = (emp) => Object.keys((emp && emp.zones) || {});

  // ---------- Calendrier d'alternance et absences ----------
  const CAL_CODES = { E: "entreprise", P: "formation", W: "weekend", F: "ferie", "?": "inconnu" };
  const CAL_LABELS = { entreprise: "En entreprise", formation: "Formation (CFA)", weekend: "Week-end (pas de cours)", ferie: "Jour férié", inconnu: "Statut inconnu" };
  function calendarCode(cal, date) {
    if (!cal || !cal.months) return "?";
    const s = cal.months[date.slice(0, 7)];
    const c = s ? s[Number(date.slice(8, 10)) - 1] : undefined;
    return c && CAL_CODES[c] ? c : "?";
  }
  // null : pas concerné (salarié non alternant)
  function calStatus(state, emp, date) {
    if (!emp || emp.role !== "alternant") return null;
    const cal = (state.calendars || []).find((c) => c.id === emp.calendarId);
    if (!cal) return "inconnu";
    return CAL_CODES[calendarCode(cal, date)];
  }
  const absenceList = (state) => Object.values(state.absences || {});
  function absencesOn(state, empId, date) {
    return absenceList(state).filter((a) => (a.emp === empId || a.emp === "*") && a.from <= date && date <= a.to);
  }

  // ---------- Modèle ----------
  const templateFor = (state, date) => ((state.template && state.template.shifts) || []).filter((t) => t.dow === dow(date));
  function templateMinutes(state, empId) {
    return ((state.template && state.template.shifts) || []).filter((t) => t.emp === empId).reduce((a, t) => a + shiftMinutes(t.segs), 0);
  }

  // ---------- Semaine ----------
  const getWeek = (state, monday) => (state.weeks || {})[monday] || null;
  const emptyWeek = (monday) => ({ week: monday, status: "brouillon", source: "manuel", shifts: [] });
  function shiftsAround(state, monday) {
    // Semaine courante + voisines (repos entre deux semaines, horaires de nuit).
    const out = [];
    for (const m of [addDays(monday, -7), monday, addDays(monday, 7)]) {
      const w = getWeek(state, m);
      if (w) for (const s of w.shifts) out.push(s);
    }
    return out;
  }
  // Intervalles absolus (minutes depuis le lundi de référence)
  function absRanges(shift, refMonday) {
    const base = daysBetween(refMonday, shift.date) * 1440;
    return shiftRanges(shift.segs).map(([s, e]) => [base + s, base + e]);
  }
  function weekMinutes(state, monday, empId) {
    const w = getWeek(state, monday);
    return w ? w.shifts.filter((s) => s.emp === empId).reduce((a, s) => a + shiftMinutes(s.segs), 0) : 0;
  }

  // ---------- Disponibilité ----------
  // Renvoie les raisons qui empêchent (bloquant) ou fragilisent (alerte) un créneau.
  function availability(state, empId, date, segs) {
    const emp = empById(state, empId);
    const out = { ok: true, block: [], warn: [] };
    if (!emp) { out.block.push("employé inconnu"); out.ok = false; return out; }
    if (emp.active === false) out.block.push("employé désactivé");
    for (const a of absencesOn(state, empId, date)) out.block.push(`${ABSENCE_TYPES[a.type] || "absence"} du ${fmtDate(a.from, "short")} au ${fmtDate(a.to, "short")}`);
    const cs = calStatus(state, emp, date);
    if (cs === "formation") out.block.push("en formation au CFA ce jour-là");
    if (cs === "inconnu") out.warn.push("statut d'alternance inconnu ce jour-là");
    for (const g of segs || []) {
      const lv = zoneLevel(emp, g.z);
      if (!lv) out.block.push(`${g.z} non autorisée pour ${emp.name}`);
      else if (lv === "incertain") out.warn.push(`${g.z} à confirmer pour ${emp.name}`);
    }
    if (!allowedZones(emp).length) out.warn.push("zones de travail non définies");
    out.warn = [...new Set(out.warn)];
    out.ok = out.block.length === 0;
    return out;
  }

  // ---------- Vérification ----------
  function validateWeek(state, monday, opts) {
    const st = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
    const w = getWeek(state, monday);
    const issues = [];
    const add = (level, code, emp, date, msg) => issues.push({ level, code, emp, date, msg, blocking: BLOCKING.has(code) });
    if (!w) return issues;
    const nameOf = (id) => (empById(state, id) || { name: id }).name;

    for (const sh of w.shifts) {
      const emp = empById(state, sh.emp);
      const who = nameOf(sh.emp);
      const d = sh.date;
      if (!emp) { add("erreur", "UNKNOWN_EMP", sh.emp, d, `Créneau attribué à une personne inconnue (${sh.emp}).`); continue; }
      if (emp.active === false) add("erreur", "INACTIVE", sh.emp, d, `${who} est désactivé(e) mais a un créneau le ${fmtDate(d, "day")}.`);
      if (!sh.segs || !sh.segs.length) add("erreur", "TIME_INVALID", sh.emp, d, `${who} : créneau vide le ${fmtDate(d, "day")}.`);
      let timesOk = true;
      for (const g of sh.segs || []) {
        if (!isTime(g.s) || !isTime(g.e) || g.s === g.e) { timesOk = false; add("erreur", "TIME_INVALID", sh.emp, d, `${who} : horaire incohérent (${g.s || "?"}–${g.e || "?"}) le ${fmtDate(d, "day")}.`); }
        if (!g.z) add("erreur", "ZONE_MISSING", sh.emp, d, `${who} : zone manquante (${g.s}–${g.e}) le ${fmtDate(d, "day")}.`);
        else if (!zoneById(state, g.z)) add("erreur", "ZONE_FORBIDDEN", sh.emp, d, `${who} : zone « ${g.z} » inexistante.`);
        else {
          const lv = zoneLevel(emp, g.z);
          if (!lv) add("erreur", "ZONE_FORBIDDEN", sh.emp, d, `${who} n'est pas autorisé(e) en ${zoneById(state, g.z).name} (${g.s}–${g.e}, ${fmtDate(d, "day")}).`);
          else if (lv === "incertain" && !g.doute) add("alerte", "ZONE_UNCERTAIN", sh.emp, d, `${who} en ${zoneById(state, g.z).name} le ${fmtDate(d, "day")} : affectation à confirmer.`);
        }
        if (g.doute) add("alerte", "SOURCE_DOUBT", sh.emp, d, `${who}, ${fmtDate(d, "day")} ${g.s}–${g.e} : ${g.doute}`);
      }
      if (timesOk && sh.segs && sh.segs.length > 1) {
        const r = shiftRanges(sh.segs);
        for (let i = 1; i < r.length; i++) if (r[i][0] < r[i - 1][1]) add("erreur", "SEG_OVERLAP", sh.emp, d, `${who} : deux blocs se chevauchent le ${fmtDate(d, "day")}.`);
      }
      if (!allowedZones(emp).length) add("alerte", "ZONE_UNKNOWN_EMP", sh.emp, d, `${who} n'a aucune zone enregistrée : à définir dans « Zones ».`);
      for (const a of absencesOn(state, sh.emp, d)) add("erreur", "ABSENCE", sh.emp, d, `${who} est absent(e) le ${fmtDate(d, "day")} (${ABSENCE_TYPES[a.type] || a.type}).`);
      const cs = calStatus(state, emp, d);
      if (cs === "formation") add("erreur", "FORMATION", sh.emp, d, `${who} est en formation au CFA le ${fmtDate(d, "day")}.`);
      else if (cs === "inconnu") add("alerte", "CAL_UNKNOWN", sh.emp, d, `${who} : statut d'alternance inconnu le ${fmtDate(d, "day")} (calendrier non renseigné).`);
      else if (cs === "ferie") add("info", "FERIE", sh.emp, d, `${fmtDate(d, "day")} est férié dans le calendrier d'alternance.`);
      if (st.checkMaxDay && timesOk && shiftMinutes(sh.segs) > st.maxDayHours * 60) add("alerte", "DAY_MAX", sh.emp, d, `${who} : ${fmtHours(shiftMinutes(sh.segs))} le ${fmtDate(d, "day")} (plus de ${st.maxDayHours} h).`);
    }

    // Chevauchements et repos (avec les semaines voisines).
    const around = shiftsAround(state, monday).filter((s) => (s.segs || []).every((g) => isTime(g.s) && isTime(g.e)));
    const byEmp = {};
    for (const s of around) (byEmp[s.emp] = byEmp[s.emp] || []).push(s);
    const inWeek = new Set(weekDates(monday));
    for (const [empId, list] of Object.entries(byEmp)) {
      const spans = list.map((s) => { const r = absRanges(s, monday); return { s, a: Math.min(...r.map((x) => x[0])), b: Math.max(...r.map((x) => x[1])) }; }).sort((x, y) => x.a - y.a);
      for (let i = 1; i < spans.length; i++) {
        const p = spans[i - 1], c = spans[i];
        if (!inWeek.has(c.s.date) && !inWeek.has(p.s.date)) continue;
        if (c.a < p.b) add("erreur", "SHIFT_OVERLAP", empId, c.s.date, `${nameOf(empId)} : créneaux qui se chevauchent (${fmtDate(p.s.date, "short")} et ${fmtDate(c.s.date, "short")}).`);
        else if (st.checkRest && c.a - p.b < st.minRestHours * 60) add("alerte", "REST", empId, c.s.date, `${nameOf(empId)} : ${fmtHours(c.a - p.b)} de repos seulement avant le ${fmtDate(c.s.date, "day")} (minimum réglé : ${st.minRestHours} h).`);
      }
    }
    // Durée hebdomadaire
    for (const emp of state.employees) {
      const m = weekMinutes(state, monday, emp.id);
      if (!m) continue;
      if (st.checkMaxWeek && m > st.maxWeekHours * 60) add("alerte", "WEEK_MAX", emp.id, null, `${emp.name} : ${fmtHours(m)} sur la semaine (plus de ${st.maxWeekHours} h).`);
      const ref = templateMinutes(state, emp.id);
      if (ref && m !== ref) add("info", "HOURS_DIFF", emp.id, null, `${emp.name} : ${fmtHours(m)} cette semaine, ${fmtHours(ref)} dans le modèle.`);
    }
    // Couverture
    if (!(opts && opts.skipCoverage)) for (const u of uncoveredPosts(state, monday)) add("alerte", "UNCOVERED", u.templateEmp, u.date, `Poste du modèle non pourvu le ${fmtDate(u.date, "day")} : ${segLabel(u.segs)} (${u.segs.map((g) => g.z).filter((v, i, a) => a.indexOf(v) === i).join("/")}) — habituellement ${nameOf(u.templateEmp)}${u.reason ? ", " + u.reason : ""}.`);
    return issues;
  }
  const blockingIssues = (issues) => issues.filter((i) => i.blocking);
  const issueKey = (i) => `${i.code}|${i.emp}|${i.date}`;

  // ---------- Couverture (postes du modèle) ----------
  function uncoveredPosts(state, monday) {
    const st = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
    if (!st.coverageFromTemplate) return [];
    const w = getWeek(state, monday);
    if (!w) return [];
    const out = [];
    for (const date of weekDates(monday)) {
      const posts = templateFor(state, date);
      if (!posts.length) continue;
      const pool = w.shifts.filter((s) => s.date === date).map((s) => ({ s, key: segKey(s.segs.map(({ s: a, e, z }) => ({ s: a, e, z }))), used: false }));
      // D'abord la même personne, puis n'importe qui avec exactement le même poste.
      const pending = [];
      for (const p of posts) {
        const key = segKey(p.segs.map(({ s, e, z }) => ({ s, e, z })));
        const same = pool.find((x) => !x.used && x.key === key && x.s.emp === p.emp);
        if (same) same.used = true; else pending.push({ p, key });
      }
      for (const { p, key } of pending) {
        const any = pool.find((x) => !x.used && x.key === key);
        if (any) { any.used = true; continue; }
        const av = availability(state, p.emp, date, []);
        const working = w.shifts.find((s) => s.emp === p.emp && s.date === date);
        const reason = av.block.length ? av.block[0] : working ? `affecté(e) à ${segLabel(working.segs)}` : av.warn.length ? av.warn[0] : "non planifié(e)";
        out.push({ id: `${date}|${p.emp}|${key}`, date, segs: p.segs.map(({ s, e, z }) => ({ s, e, z })), templateEmp: p.emp, reason });
      }
    }
    return out;
  }

  // ---------- Remplaçants ----------
  function findCandidates(state, date, segs, opts) {
    const st = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
    const monday = mondayOf(date);
    const w = getWeek(state, monday) || emptyWeek(monday);
    const exclude = new Set((opts && opts.exclude) || []);
    const newMin = shiftMinutes(segs);
    const out = [];
    for (const emp of state.employees) {
      if (exclude.has(emp.id) || emp.active === false) continue;
      const av = availability(state, emp.id, date, segs);
      const notes = [...av.warn];
      if (!av.ok) continue;
      if (!allowedZones(emp).length) continue;
      if (calStatus(state, emp, date) === "inconnu") continue; // jamais « disponible » par défaut
      if (w.shifts.some((s) => s.emp === emp.id && s.date === date)) continue;
      // Repos avec les jours voisins
      const cand = { emp: emp.id, date, segs };
      const cr = absRanges(cand, monday);
      const cStart = Math.min(...cr.map((x) => x[0])), cEnd = Math.max(...cr.map((x) => x[1]));
      let restOk = true, overlap = false;
      for (const s of shiftsAround(state, monday).filter((s) => s.emp === emp.id)) {
        const r = absRanges(s, monday); const a = Math.min(...r.map((x) => x[0])), b = Math.max(...r.map((x) => x[1]));
        if (a < cEnd && cStart < b) overlap = true;
        const gap = a >= cEnd ? a - cEnd : cStart - b;
        if (gap >= 0 && st.checkRest && gap < st.minRestHours * 60) restOk = false;
      }
      if (overlap) continue;
      if (!restOk) { notes.push(`repos < ${st.minRestHours} h avec un autre service`); }
      const weekMin = weekMinutes(state, monday, emp.id);
      if (st.checkMaxWeek && weekMin + newMin > st.maxWeekHours * 60) continue;
      if (st.checkMaxDay && newMin > st.maxDayHours * 60) notes.push(`plus de ${st.maxDayHours} h dans la journée`);
      const ref = templateMinutes(state, emp.id);
      const deficit = ref - weekMin;
      let score = 0;
      if (ref > 0) score += deficit >= newMin ? 30 : deficit > 0 ? 15 : -10;
      if (!restOk) score -= 40;
      score -= notes.length * 5;
      if (templateFor(state, date).some((t) => t.emp === emp.id && segKey(t.segs) === segKey(segs))) score += 10;
      out.push({ emp: emp.id, name: emp.name, score, notes, weekMinutes: weekMin, refMinutes: ref, restOk });
    }
    return out.sort((a, b) => b.score - a.score || a.weekMinutes - b.weekMinutes);
  }

  // ---------- Génération ----------
  function generateWeek(state, monday, opts) {
    opts = opts || {};
    const include = opts.employees ? new Set(opts.employees) : null;
    const from = opts.from || monday, to = opts.to || addDays(monday, 6);
    const extra = opts.unavailable || []; // [{emp, date}] contraintes ponctuelles
    const existing = getWeek(state, monday);
    const keep = existing ? existing.shifts.filter((s) => s.date < from || s.date > to) : [];
    const week = { week: monday, status: "brouillon", source: "généré", generatedAt: opts.now || null, shifts: keep.map((s) => ({ ...s, segs: s.segs.map((g) => ({ ...g })) })) };
    const placed = [], notPlaced = [];
    for (const date of weekDates(monday)) {
      if (date < from || date > to) continue;
      for (const t of templateFor(state, date)) {
        const emp = empById(state, t.emp);
        const segs = t.segs.map(({ s, e, z }) => ({ s, e, z }));
        let reason = null;
        if (!emp) reason = "personne absente de l'équipe";
        else if (include && !include.has(emp.id)) reason = "non sélectionné(e) pour cette génération";
        else if (emp.active === false) reason = "employé désactivé";
        else if (extra.some((x) => x.emp === emp.id && x.date === date)) reason = "contrainte particulière saisie pour cette génération";
        else {
          const av = availability(state, emp.id, date, segs);
          if (!av.ok) reason = av.block[0];
          else if (emp.role === "alternant" && calStatus(state, emp, date) === "inconnu") reason = "statut d'alternance inconnu (jamais considéré comme disponible)";
        }
        if (reason) notPlaced.push({ emp: t.emp, date, segs, reason });
        else { week.shifts.push({ id: uid("c"), emp: emp.id, date, segs }); placed.push({ emp: emp.id, date }); }
      }
    }
    week.shifts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const tmp = { ...state, weeks: { ...(state.weeks || {}), [monday]: week } };
    const issues = validateWeek(tmp, monday);
    const suggestions = notPlaced.map((n) => ({ ...n, candidates: findCandidates(tmp, n.date, n.segs, { exclude: [n.emp] }).slice(0, 3) }));
    return { week, report: { placed: placed.length, notPlaced: suggestions, issues } };
  }

  // ---------- Grille d'affichage / export ----------
  function weekGrid(state, monday, opts) {
    const w = getWeek(state, monday);
    const days = weekDates(monday);
    const showAll = !opts || opts.all !== false;
    const rows = [];
    for (const emp of state.employees) {
      const shifts = w ? w.shifts.filter((s) => s.emp === emp.id) : [];
      if (!showAll && !shifts.length) continue;
      if (emp.active === false && !shifts.length) continue;
      const cells = days.map((date) => ({
        date,
        shift: shifts.find((s) => s.date === date) || null,
        absences: absencesOn(state, emp.id, date),
        cal: calStatus(state, emp, date),
      }));
      rows.push({ emp, cells, minutes: shifts.reduce((a, s) => a + shiftMinutes(s.segs), 0) });
    }
    return { monday, days, rows, week: w };
  }

  function csvEscape(v) { const s = v == null ? "" : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
  function weeksToCSV(state, mondays) {
    const lines = [["Semaine", "Date", "Jour", "Prénom", "Début 1", "Fin 1", "Zone 1", "Début 2", "Fin 2", "Zone 2", "Début 3", "Fin 3", "Zone 3", "Pause", "Heures", "Statut"].join(";")];
    for (const m of mondays) {
      const w = getWeek(state, m);
      if (!w) continue;
      const list = [...w.shifts].sort((a, b) => (a.date + (a.segs[0] || {}).s).localeCompare(b.date + (b.segs[0] || {}).s));
      for (const s of list) {
        const emp = empById(state, s.emp);
        const cols = [m, fmtDate(s.date, "num"), DAYS[dow(s.date)], emp ? emp.name : s.emp];
        for (let i = 0; i < 3; i++) { const g = s.segs[i]; cols.push(g ? g.s : "", g ? g.e : "", g ? g.z : ""); }
        cols.push(pauses(s.segs).map((p) => `${p.s}-${p.e}`).join(" "), hoursDecimal(shiftMinutes(s.segs)).replace(".", ","), w.status);
        lines.push(cols.map(csvEscape).join(";"));
      }
    }
    return "﻿" + lines.join("\r\n") + "\r\n";
  }
  function parseCSV(text) {
    const rows = []; let row = [], cur = "", q = false;
    const t = String(text).replace(/^﻿/, "");
    const sep = (t.split("\n")[0].match(/;/g) || []).length >= (t.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true;
      else if (c === sep) { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
      else cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim()));
  }
  // Lit un CSV au format de l'export ; renvoie les créneaux reconnus et les lignes rejetées.
  function csvToShifts(state, text) {
    const rows = parseCSV(text);
    const head = (rows.shift() || []).map(norm);
    const col = (n) => head.indexOf(norm(n));
    const iDate = col("Date"), iName = col("Prénom");
    const shifts = [], rejected = [];
    rows.forEach((r, n) => {
      const line = n + 2;
      let date = (r[iDate] || "").trim();
      const m = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m) date = `${m[3]}-${m[2]}-${m[1]}`;
      if (!isISO(date)) return rejected.push({ line, why: `date illisible « ${r[iDate] || ""} »` });
      const f = findEmployee(state, r[iName]);
      if (!f.emp) return rejected.push({ line, why: f.matches.length ? `prénom ambigu « ${r[iName]} »` : `prénom inconnu « ${r[iName]} »` });
      const segs = [];
      for (let k = 1; k <= 3; k++) {
        const s = normTime(r[col("Début " + k)]), e = normTime(r[col("Fin " + k)]), z = (r[col("Zone " + k)] || "").trim().toUpperCase();
        if (!r[col("Début " + k)] && !r[col("Fin " + k)]) continue;
        if (!s || !e) return rejected.push({ line, why: `horaire ${k} illisible` });
        segs.push({ s, e, z });
      }
      if (!segs.length) return rejected.push({ line, why: "aucun horaire" });
      shifts.push({ emp: f.emp.id, date, segs });
    });
    return { shifts, rejected };
  }

  // ---------- Opérations (toute modification passe par ici) ----------
  const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  const CONFIG_KEYS = ["employees", "zones", "settings", "template", "calendars"];
  const SHIFT_OPS = new Set(["setShift", "removeShift", "moveShift", "copyDay", "duplicateWeek", "putWeek", "importShifts"]);

  function applyOps(state, ops, meta) {
    meta = meta || {};
    const s = clone(state);
    s.weeks = s.weeks || {}; s.absences = s.absences || {};
    const touched = { weeks: new Set(), absences: new Set(), config: new Set() };
    const errors = [], messages = [], impacts = [];
    const shiftWeeks = new Set();
    const fail = (m) => { errors.push(m); };
    const ensureWeek = (monday) => { if (!s.weeks[monday]) s.weeks[monday] = emptyWeek(monday); touched.weeks.add(monday); return s.weeks[monday]; };
    const empOf = (ref) => {
      if (!ref) return null;
      const byId = empById(s, ref);
      if (byId) return byId;
      const f = findEmployee(s, ref);
      if (f.emp) return f.emp;
      fail(f.matches.length > 1 ? `« ${ref} » correspond à plusieurs personnes : ${f.matches.map((e) => e.name).join(", ")}. Précisez.` : `Personne inconnue : « ${ref} ».`);
      return null;
    };
    const cleanSegs = (segs) => {
      const out = [];
      for (const g of segs || []) {
        const a = normTime(g.s != null ? g.s : g.debut), b = normTime(g.e != null ? g.e : g.fin);
        const z = String(g.z != null ? g.z : g.zone || "").trim().toUpperCase();
        if (!a || !b) { fail(`Horaire illisible : ${g.s || g.debut || "?"}–${g.e || g.fin || "?"}.`); return null; }
        if (a === b) { fail(`Horaire vide : ${a}–${b}.`); return null; }
        out.push({ s: a, e: b, z, ...(g.doute ? { doute: g.doute } : {}) });
      }
      if (!out.length) { fail("Aucun horaire indiqué."); return null; }
      return out;
    };
    const markWeek = (monday) => { touched.weeks.add(monday); shiftWeeks.add(monday); };
    const setShiftRaw = (empId, date, segs, extra) => {
      const monday = mondayOf(date); const w = ensureWeek(monday); markWeek(monday);
      const i = w.shifts.findIndex((x) => x.emp === empId && x.date === date);
      const sh = { id: i >= 0 ? w.shifts[i].id : uid("c"), emp: empId, date, segs, ...(extra || {}) };
      if (i >= 0) w.shifts[i] = sh; else w.shifts.push(sh);
      if (w.status === "validé") { w.status = "brouillon"; messages.push(`La semaine du ${fmtWeek(monday)} repasse en brouillon.`); }
    };
    const removeShiftRaw = (empId, date) => {
      const monday = mondayOf(date); const w = s.weeks[monday];
      if (!w) return false;
      const i = w.shifts.findIndex((x) => x.emp === empId && x.date === date);
      if (i < 0) return false;
      w.shifts.splice(i, 1); markWeek(monday);
      if (w.status === "validé") w.status = "brouillon";
      return true;
    };
    const dateOk = (d, label) => { if (!isISO(d)) { fail(`Date invalide${label ? " (" + label + ")" : ""} : « ${d} ».`); return false; } return true; };
    const conf = (k) => { touched.config.add(k); };

    for (const op of ops || []) {
      const before = errors.length;
      switch (op.type) {
        case "setShift": {
          const emp = empOf(op.emp); if (!emp || !dateOk(op.date)) break;
          const segs = cleanSegs(op.segs); if (!segs) break;
          for (const g of segs) {
            if (!g.z) { const z = allowedZones(emp); if (z.length === 1) g.z = z[0]; else { fail(`Précisez la zone pour ${emp.name} (${g.s}–${g.e}).`); break; } }
            if (!zoneById(s, g.z)) fail(`Zone inconnue « ${g.z} ».`);
            else if (!zoneLevel(emp, g.z)) fail(`${emp.name} n'est pas autorisé(e) en ${zoneById(s, g.z).name}. Modifiez d'abord ses zones dans « Zones » si c'est voulu.`);
          }
          if (errors.length > before) break;
          setShiftRaw(emp.id, op.date, segs, op.note ? { note: String(op.note).slice(0, 200) } : null);
          break;
        }
        case "removeShift": {
          const emp = empOf(op.emp); if (!emp || !dateOk(op.date)) break;
          if (!removeShiftRaw(emp.id, op.date)) fail(`${emp.name} n'a pas de créneau le ${fmtDate(op.date, "day")}.`);
          break;
        }
        case "moveShift": {
          const emp = empOf(op.emp); if (!emp || !dateOk(op.date)) break;
          const to = op.toEmp ? empOf(op.toEmp) : emp; if (!to) break;
          const toDate = op.toDate || op.date; if (!dateOk(toDate)) break;
          const w = s.weeks[mondayOf(op.date)];
          const sh = w && w.shifts.find((x) => x.emp === emp.id && x.date === op.date);
          if (!sh) { fail(`${emp.name} n'a pas de créneau le ${fmtDate(op.date, "day")}.`); break; }
          const tw = s.weeks[mondayOf(toDate)];
          const busy = tw && tw.shifts.find((x) => x.emp === to.id && x.date === toDate);
          if (busy && !op.swap) { fail(`${to.name} travaille déjà le ${fmtDate(toDate, "day")} (${segLabel(busy.segs)}).`); break; }
          for (const g of sh.segs) if (!zoneLevel(to, g.z)) fail(`${to.name} n'est pas autorisé(e) en ${(zoneById(s, g.z) || { name: g.z }).name}.`);
          if (errors.length > before) break;
          const segs = clone(sh.segs);
          if (busy && op.swap) {
            for (const g of busy.segs) if (!zoneLevel(emp, g.z)) fail(`${emp.name} n'est pas autorisé(e) en ${(zoneById(s, g.z) || { name: g.z }).name}.`);
            if (errors.length > before) break;
            const other = clone(busy.segs);
            removeShiftRaw(to.id, toDate); removeShiftRaw(emp.id, op.date);
            setShiftRaw(to.id, toDate, segs); setShiftRaw(emp.id, op.date, other);
          } else { removeShiftRaw(emp.id, op.date); setShiftRaw(to.id, toDate, segs); }
          break;
        }
        case "copyDay": {
          if (!dateOk(op.from) || !dateOk(op.to)) break;
          const src = (s.weeks[mondayOf(op.from)] || { shifts: [] }).shifts.filter((x) => x.date === op.from && (!op.emp || x.emp === op.emp));
          if (!src.length) { fail(`Aucun créneau le ${fmtDate(op.from, "day")}.`); break; }
          if (op.replace) for (const x of [...((s.weeks[mondayOf(op.to)] || { shifts: [] }).shifts)].filter((x) => x.date === op.to && (!op.emp || x.emp === op.emp))) removeShiftRaw(x.emp, op.to);
          for (const x of src) {
            const tw = s.weeks[mondayOf(op.to)];
            if (!op.replace && tw && tw.shifts.some((y) => y.emp === x.emp && y.date === op.to)) { messages.push(`${(empById(s, x.emp) || {}).name} travaille déjà le ${fmtDate(op.to, "day")} : non copié.`); continue; }
            setShiftRaw(x.emp, op.to, clone(x.segs));
          }
          break;
        }
        case "duplicateWeek": {
          if (!dateOk(op.from) || !dateOk(op.to)) break;
          const from = mondayOf(op.from), to = mondayOf(op.to);
          const src = s.weeks[from];
          if (!src || !src.shifts.length) { fail(`La semaine du ${fmtWeek(from)} est vide.`); break; }
          if (s.weeks[to] && s.weeks[to].shifts.length && !op.replace) { fail(`La semaine du ${fmtWeek(to)} contient déjà des horaires.`); break; }
          const delta = daysBetween(from, to);
          s.weeks[to] = { week: to, status: "brouillon", source: `copie du ${fmtDate(from, "num")}`, shifts: src.shifts.map((x) => ({ id: uid("c"), emp: x.emp, date: addDays(x.date, delta), segs: clone(x.segs) })) };
          markWeek(to);
          break;
        }
        case "putWeek": {
          if (!dateOk(op.monday)) break;
          s.weeks[op.monday] = clone(op.week); markWeek(op.monday);
          break;
        }
        case "importShifts": {
          for (const x of op.shifts || []) {
            if (!empById(s, x.emp) || !isISO(x.date)) continue;
            setShiftRaw(x.emp, x.date, clone(x.segs));
          }
          break;
        }
        case "setWeekStatus": {
          if (!dateOk(op.monday)) break;
          const w = ensureWeek(op.monday);
          if (op.status === "validé") {
            const iss = validateWeek(s, op.monday);
            const bl = blockingIssues(iss);
            if (bl.length) { fail(`Impossible de valider : ${bl.length} erreur(s) à corriger d'abord (${bl[0].msg}).`); break; }
            const al = iss.filter((i) => i.level === "alerte");
            if (al.length && !op.acknowledge) { fail(`${al.length} alerte(s) à vérifier avant validation.`); break; }
            w.validatedAt = meta.now || null; w.validatedBy = meta.by || null;
          }
          w.status = op.status === "validé" ? "validé" : "brouillon";
          break;
        }
        case "addAbsence": case "updateAbsence": {
          const a = op.absence || {};
          const emp = a.emp === "*" ? { id: "*", name: "Toute l'équipe" } : empOf(a.emp); if (!emp) break;
          if (!dateOk(a.from, "début") || !dateOk(a.to || a.from, "fin")) break;
          const to = a.to || a.from;
          if (to < a.from) { fail("La date de fin est avant la date de début."); break; }
          if (!ABSENCE_TYPES[a.type]) { fail(`Type d'absence inconnu « ${a.type} ».`); break; }
          const id = op.type === "updateAbsence" ? a.id : a.id || uid("abs");
          if (op.type === "updateAbsence" && !s.absences[id]) { fail("Absence introuvable."); break; }
          s.absences[id] = { id, emp: emp.id, type: a.type, from: a.from, to, note: String(a.note || "").slice(0, 300), createdAt: (s.absences[id] && s.absences[id].createdAt) || meta.now || null };
          touched.absences.add(id);
          // Créneaux déjà planifiés touchés par cette absence : signalés, jamais modifiés en silence.
          for (const w of Object.values(s.weeks)) for (const sh of w.shifts) if ((emp.id === "*" || sh.emp === emp.id) && sh.date >= a.from && sh.date <= to) impacts.push({ emp: sh.emp, date: sh.date, segs: sh.segs });
          break;
        }
        case "removeAbsence": {
          if (!s.absences[op.id]) { fail("Absence introuvable."); break; }
          delete s.absences[op.id]; touched.absences.add(op.id);
          break;
        }
        case "addEmployee": {
          const e = op.employee || {};
          const name = String(e.name || "").trim();
          if (!name) { fail("Prénom manquant."); break; }
          if (s.employees.some((x) => norm(x.name) === norm(name))) { fail(`${name} existe déjà dans l'équipe.`); break; }
          let id = slug(name); while (empById(s, id)) id += "-2";
          const zones = {};
          for (const z of e.zonesList || Object.keys(e.zones || {})) { const zz = String(z).toUpperCase(); if (!zoneById(s, zz)) { fail(`Zone inconnue « ${z} ».`); break; } zones[zz] = (e.zones && e.zones[zz]) || "confirme"; }
          if (errors.length > before) break;
          const role = e.role === "alternant" ? "alternant" : "salarie";
          s.employees.push({ id, name, role, zones, zoneNote: e.zoneNote || "", active: true, aliases: [], ...(role === "alternant" ? { calendarId: e.calendarId || (s.calendars[0] && s.calendars[0].id) || null } : {}) });
          conf("employees"); messages.push(`${name} ajouté(e) à l'équipe.`);
          break;
        }
        case "updateEmployee": {
          const emp = empById(s, op.id); if (!emp) { fail("Employé introuvable."); break; }
          const p = op.patch || {};
          if (p.name != null) {
            const n = String(p.name).trim();
            if (!n) { fail("Le prénom ne peut pas être vide."); break; }
            if (s.employees.some((x) => x.id !== emp.id && norm(x.name) === norm(n))) { fail(`${n} existe déjà.`); break; }
            emp.name = n;
          }
          for (const k of ["role", "active", "calendarId", "aliases", "zoneNote", "aliasNote"]) if (p[k] !== undefined) emp[k] = p[k];
          if (emp.role === "alternant" && !emp.calendarId && s.calendars[0]) emp.calendarId = s.calendars[0].id;
          conf("employees");
          break;
        }
        case "removeEmployee": {
          const emp = empById(s, op.id); if (!emp) { fail("Employé introuvable."); break; }
          const used = Object.values(s.weeks).some((w) => w.shifts.some((x) => x.emp === emp.id)) || (s.template.shifts || []).some((t) => t.emp === emp.id);
          if (used) { fail(`${emp.name} a des horaires enregistrés (ou figure dans le modèle) : désactivez plutôt la fiche pour garder l'historique.`); break; }
          s.employees = s.employees.filter((x) => x.id !== emp.id); conf("employees");
          break;
        }
        case "setZones": {
          const emp = empOf(op.emp); if (!emp) break;
          const zones = {};
          for (const [z, lv] of Object.entries(op.zones || {})) {
            if (!zoneById(s, z)) { fail(`Zone inconnue « ${z} ».`); break; }
            if (lv) zones[z] = ["confirme", "deduit", "incertain"].includes(lv) ? lv : "confirme";
          }
          if (errors.length > before) break;
          emp.zones = zones; conf("employees");
          for (const w of Object.values(s.weeks)) for (const sh of w.shifts) if (sh.emp === emp.id && sh.segs.some((g) => !zones[g.z])) impacts.push({ emp: sh.emp, date: sh.date, segs: sh.segs, why: "zone retirée" });
          break;
        }
        case "updateZone": {
          const z = zoneById(s, op.id); if (!z) { fail("Zone introuvable."); break; }
          const p = op.patch || {};
          if (p.color && !/^#[0-9a-fA-F]{6}$/.test(p.color)) { fail("Couleur invalide."); break; }
          Object.assign(z, Object.fromEntries(Object.entries(p).filter(([k]) => ["name", "short", "color", "pattern", "confidence"].includes(k))));
          conf("zones");
          break;
        }
        case "addZone": {
          const z = op.zone || {};
          const id = String(z.id || z.short || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
          if (!id || zoneById(s, id)) { fail("Code de zone manquant ou déjà utilisé."); break; }
          s.zones.push({ id, name: z.name || id, short: id, color: z.color || "#8E8E93", pattern: z.pattern || "points", confidence: "confirmé" });
          conf("zones");
          break;
        }
        case "setSettings": {
          const p = op.patch || {};
          for (const [k, v] of Object.entries(p)) {
            if (!(k in DEFAULT_SETTINGS)) continue;
            if (typeof DEFAULT_SETTINGS[k] === "number" && !(Number(v) > 0)) { fail(`Valeur invalide pour ${k}.`); continue; }
            s.settings[k] = typeof DEFAULT_SETTINGS[k] === "number" ? Number(v) : !!v;
          }
          conf("settings");
          break;
        }
        case "setTemplate": {
          if (!op.template || !Array.isArray(op.template.shifts)) { fail("Modèle invalide."); break; }
          for (const t of op.template.shifts) if (!(t.dow >= 0 && t.dow <= 6) || !empById(s, t.emp) || !(t.segs || []).every((g) => isTime(g.s) && isTime(g.e))) { fail(`Ligne de modèle invalide (${t.emp}, jour ${t.dow}).`); break; }
          if (errors.length > before) break;
          s.template = clone(op.template); conf("template");
          break;
        }
        case "setCalendarDay": {
          const cal = s.calendars.find((c) => c.id === op.calId); if (!cal) { fail("Calendrier introuvable."); break; }
          if (!dateOk(op.date) || !CAL_CODES[op.code]) { fail("Statut inconnu."); break; }
          const k = op.date.slice(0, 7); const len = new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7), 0)).getUTCDate();
          const str = (cal.months[k] || "?".repeat(len)).padEnd(len, "?").split("");
          str[Number(op.date.slice(8, 10)) - 1] = op.code; cal.months[k] = str.join("");
          conf("calendars");
          if (op.code === "P") for (const w of Object.values(s.weeks)) for (const sh of w.shifts) { const e = empById(s, sh.emp); if (sh.date === op.date && e && e.calendarId === cal.id && e.role === "alternant") impacts.push({ emp: sh.emp, date: sh.date, segs: sh.segs, why: "jour de formation" }); }
          break;
        }
        case "putCalendar": {
          const c = op.calendar || {};
          if (!c.id || !c.months) { fail("Calendrier invalide."); break; }
          const i = s.calendars.findIndex((x) => x.id === c.id);
          if (i >= 0 && !op.replace) { fail("Un calendrier porte déjà ce nom : confirmez le remplacement."); break; }
          if (i >= 0) s.calendars[i] = clone(c); else s.calendars.push(clone(c));
          conf("calendars");
          break;
        }
        default: fail(`Opération inconnue : ${op.type}`);
      }
    }

    // Une modification d'horaires ne doit jamais créer de nouvelle erreur bloquante.
    if (!errors.length && !meta.allowErrors) {
      for (const monday of shiftWeeks) {
        const was = new Set(blockingIssues(validateWeek(state, monday, { skipCoverage: true })).map(issueKey));
        const now = blockingIssues(validateWeek(s, monday, { skipCoverage: true }));
        for (const i of now) if (!was.has(issueKey(i))) errors.push(i.msg);
      }
    }
    if (errors.length) return { ok: false, errors: [...new Set(errors)], messages, impacts: [] };

    const changes = [];
    for (const m of touched.weeks) changes.push({ col: "weeks", id: m, before: clone((state.weeks || {})[m] || null), after: clone(s.weeks[m] || null) });
    for (const id of touched.absences) changes.push({ col: "absences", id, before: clone((state.absences || {})[id] || null), after: clone(s.absences[id] || null) });
    for (const k of touched.config) changes.push({ col: "config", id: k, before: clone(state[k]), after: clone(s[k]) });
    const issues = [];
    for (const m of shiftWeeks) issues.push(...validateWeek(s, m));
    return { ok: true, state: s, changes, messages, impacts, issues };
  }

  // Applique une liste de changements {col, id, after} sur un état (sans validation).
  function applyChanges(state, changes, which) {
    const s = { ...state, weeks: { ...(state.weeks || {}) }, absences: { ...(state.absences || {}) } };
    for (const c of changes) {
      const v = which === "before" ? c.before : c.after;
      if (c.col === "weeks") { if (v) s.weeks[c.id] = v; else delete s.weeks[c.id]; }
      else if (c.col === "absences") { if (v) s.absences[c.id] = v; else delete s.absences[c.id]; }
      else if (c.col === "config" && CONFIG_KEYS.includes(c.id)) s[c.id] = v;
    }
    return s;
  }

  function stateFromReference(ref) {
    return {
      employees: clone(ref.employees),
      zones: clone(ref.zones),
      settings: { ...DEFAULT_SETTINGS },
      template: clone(ref.template),
      calendars: clone(ref.calendars),
      weeks: {},
      absences: {},
    };
  }

  root.PlanningCore = {
    DAYS, DAYS_SHORT, MONTHS, ABSENCE_TYPES, DEFAULT_SETTINGS, BLOCKING, CAL_LABELS, CAL_CODES, CONFIG_KEYS, SHIFT_OPS,
    parseISO, iso, isISO, addDays, dow, mondayOf, weekDates, daysBetween, fmtDate, fmtWeek, isoWeekNumber,
    isTime, normTime, toMin, fromMin, segRange, segMinutes, shiftRanges, shiftMinutes, fmtHours, hoursDecimal, segKey, segLabel, pauses,
    norm, slug, uid, empById, findEmployee, zoneLevel, zoneById, allowedZones,
    calendarCode, calStatus, absencesOn, templateFor, templateMinutes, getWeek, emptyWeek, weekMinutes,
    availability, validateWeek, blockingIssues, uncoveredPosts, findCandidates, generateWeek, weekGrid,
    weeksToCSV, parseCSV, csvToShifts, applyOps, applyChanges, stateFromReference, clone,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.PlanningCore;
})(typeof globalThis !== "undefined" ? globalThis : this);
