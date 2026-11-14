// Tests de la logique métier : node --test planning/test
const test = require("node:test");
const assert = require("node:assert/strict");
require("./ref.js");
const C = require("../src/core.js");
const REF = globalThis.PlanningReference;

const fresh = () => C.stateFromReference(REF);
const W1 = "2026-10-19", W2 = "2026-10-26";
const withWeek1 = () => { const s = fresh(); s.weeks[W1] = C.generateWeek(s, W1).week; return s; };
const apply = (s, ops, meta) => C.applyOps(s, ops, meta);
const codes = (issues) => issues.map((i) => i.code);

test("dates : lundi, semaine à cheval sur deux mois, changement d'année", () => {
  assert.equal(C.mondayOf("2026-10-22"), W1);
  assert.equal(C.dow(W1), 0);
  assert.deepEqual(C.weekDates("2026-10-26").slice(-2), ["2026-10-31", "2026-11-01"]);
  assert.equal(C.mondayOf("2027-01-01"), "2026-12-28");
  assert.equal(C.addDays("2027-02-28", 1), "2027-03-01");
  assert.equal(C.isISO("2027-02-29"), false);
  // passage à l'heure d'hiver le 25/10/2026 : pas de décalage
  assert.equal(C.addDays("2026-10-24", 2), "2026-10-26");
});

test("horaires : saisie libre, durée, pauses, nuit", () => {
  assert.equal(C.normTime("9h"), "09:00");
  assert.equal(C.normTime("14 h 30"), "14:30");
  assert.equal(C.normTime("25:00"), null);
  assert.equal(C.shiftMinutes([{ s: "13:30", e: "17:00" }, { s: "17:30", e: "21:00" }]), 420);
  assert.deepEqual(C.pauses([{ s: "13:30", e: "17:00" }, { s: "17:30", e: "21:00" }]).map((p) => p.min), [30]);
  assert.equal(C.shiftMinutes([{ s: "22:00", e: "02:00" }]), 240);
  assert.deepEqual(C.shiftRanges([{ s: "21:00", e: "23:30" }, { s: "00:00", e: "03:00" }]), [[1260, 1410], [1440, 1620]]);
});

test("modèle : les totaux relus correspondent à la colonne Total du papier", () => {
  const s = fresh();
  for (const e of s.employees) assert.equal(C.templateMinutes(s, e.id) / 60, REF.totalsOnPaper[e.id] ?? 0, e.name);
});

test("génération semaine 1 : 52 créneaux, aucune erreur bloquante", () => {
  const s = fresh();
  const { week, report } = C.generateWeek(s, W1);
  assert.equal(week.shifts.length, 50);
  assert.equal(report.notPlaced.length, 0);
  assert.equal(C.blockingIssues(report.issues).length, 0);
});

test("génération : jamais d'alternant pendant les cours (29 et 30 octobre)", () => {
  const s = withWeek1();
  const { week, report } = C.generateWeek(s, W2);
  const bad = week.shifts.filter((x) => ["fleur", "camilian"].includes(x.emp) && ["2026-10-29", "2026-10-30"].includes(x.date));
  assert.equal(bad.length, 0);
  assert.equal(report.notPlaced.length, 4);
  assert.ok(report.notPlaced.every((n) => /formation|cours au CFA/.test(n.reason)));
  // les postes non pourvus restent signalés, jamais remplis d'office
  s.weeks[W2] = week;
  assert.equal(C.uncoveredPosts(s, W2).length, 4);
});

test("génération : statut d'alternance inconnu = non disponible", () => {
  const s = fresh();
  const { report } = C.generateWeek(s, "2027-08-02"); // hors calendrier fourni
  const camilian = report.notPlaced.filter((n) => n.emp === "camilian");
  assert.ok(camilian.length > 0 && camilian.every((n) => /inconnu/.test(n.reason)));
});

test("génération : congés, sélection d'employés, période partielle", () => {
  let s = fresh();
  s = apply(s, [{ type: "addAbsence", absence: { emp: "nathalie", type: "conges", from: "2026-10-19", to: "2026-10-20" } }]).state;
  const g = C.generateWeek(s, W1, { employees: ["nathalie", "eric"], from: "2026-10-19", to: "2026-10-21" });
  assert.deepEqual([...new Set(g.week.shifts.map((x) => x.emp))].sort(), ["eric", "nathalie"]);
  assert.equal(g.week.shifts.filter((x) => x.emp === "nathalie").length, 1); // seulement le mercredi
  assert.ok(g.week.shifts.every((x) => x.date <= "2026-10-21"));
});

test("modifier un horaire, avec zone déduite quand une seule est autorisée", () => {
  const s = withWeek1();
  const r = apply(s, [{ type: "setShift", emp: "Fleur", date: "2026-10-21", segs: [{ s: "14h", e: "21h" }] }]);
  assert.ok(r.ok, r.errors && r.errors.join());
  const sh = r.state.weeks[W1].shifts.find((x) => x.emp === "fleur" && x.date === "2026-10-21");
  assert.deepEqual(sh.segs, [{ s: "14:00", e: "21:00", z: "ZR" }]);
  assert.equal(r.changes[0].col, "weeks");
});

test("zones : affectation interdite refusée, autorisée après changement explicite de règle", () => {
  let s = withWeek1();
  let r = apply(s, [{ type: "setShift", emp: "maelle", date: "2026-10-19", segs: [{ s: "13:30", e: "21:00", z: "ZR" }] }]);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /pas autorisé/);
  s = apply(s, [{ type: "setZones", emp: "maelle", zones: { ZP: "confirme", ZR: "confirme" } }]).state;
  r = apply(s, [{ type: "setShift", emp: "maelle", date: "2026-10-19", segs: [{ s: "13:30", e: "21:00", z: "ZR" }] }]);
  assert.ok(r.ok);
});

test("zones : retirer une zone signale les créneaux concernés sans les modifier", () => {
  const s = withWeek1();
  const r = apply(s, [{ type: "setZones", emp: "mathilde", zones: { ZR: "confirme" } }]);
  assert.ok(r.ok);
  assert.equal(r.impacts.length, 1); // samedi en ZP
  assert.ok(r.state.weeks[W1].shifts.some((x) => x.emp === "mathilde" && x.date === "2026-10-24"));
  assert.ok(codes(C.validateWeek(r.state, W1)).includes("ZONE_FORBIDDEN"));
});

test("cours : impossible de placer un alternant un jour de formation", () => {
  const s = fresh();
  const r = apply(s, [{ type: "setShift", emp: "fleur", date: "2026-10-29", segs: [{ s: "14:30", e: "22:00", z: "ZR" }] }]);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /formation|cours au CFA/);
});

test("absence ajoutée après coup : créneaux identifiés, rien modifié en silence", () => {
  const s = withWeek1();
  const r = apply(s, [{ type: "addAbsence", absence: { emp: "eric", type: "arret", from: "2026-10-21", to: "2026-10-22" } }]);
  assert.ok(r.ok);
  assert.equal(r.impacts.length, 2);
  assert.equal(r.state.weeks[W1].shifts.filter((x) => x.emp === "eric").length, 5);
  const iss = C.validateWeek(r.state, W1);
  assert.equal(iss.filter((i) => i.code === "ABSENCE").length, 2);
  // validation impossible tant que ce n'est pas réglé
  const v = apply(r.state, [{ type: "setWeekStatus", monday: W1, status: "validé", acknowledge: true }]);
  assert.equal(v.ok, false);
  // on libère un créneau : autorisé (ça retire une erreur)
  const lib = apply(r.state, [{ type: "removeShift", emp: "eric", date: "2026-10-21" }]);
  assert.ok(lib.ok);
});

test("absence : dates incohérentes refusées", () => {
  const r = apply(fresh(), [{ type: "addAbsence", absence: { emp: "eric", type: "conges", from: "2026-11-10", to: "2026-11-02" } }]);
  assert.equal(r.ok, false);
});

test("chevauchements et horaires de nuit entre deux jours", () => {
  const s = fresh();
  let r = apply(s, [{ type: "setShift", emp: "nathalie", date: "2026-11-02", segs: [{ s: "20:00", e: "02:00", z: "ZR" }] }]);
  assert.ok(r.ok);
  r = apply(r.state, [{ type: "setShift", emp: "nathalie", date: "2026-11-03", segs: [{ s: "01:00", e: "06:00", z: "ZR" }] }]);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /chevauchent/);
  r = apply(s, [{ type: "setShift", emp: "nathalie", date: "2026-11-02", segs: [{ s: "06:00", e: "11:00", z: "ZR" }, { s: "10:30", e: "13:30", z: "ZR" }] }]);
  assert.equal(r.ok, false);
});

test("repos insuffisant entre deux semaines = alerte (non bloquante)", () => {
  let s = fresh();
  s = apply(s, [{ type: "setShift", emp: "murielle", date: "2026-11-01", segs: [{ s: "14:30", e: "22:00", z: "ZR" }] }]).state;
  const r = apply(s, [{ type: "setShift", emp: "murielle", date: "2026-11-02", segs: [{ s: "06:00", e: "13:30", z: "ZR" }] }]);
  assert.ok(r.ok);
  assert.ok(codes(C.validateWeek(r.state, "2026-11-02")).includes("REST"));
});

test("déplacer, échanger, copier un jour, dupliquer une semaine", () => {
  const s = withWeek1();
  let r = apply(s, [{ type: "moveShift", emp: "maelle", date: "2026-10-19", toEmp: "camilian" }]);
  assert.ok(r.ok, r.errors && r.errors.join());
  assert.ok(r.state.weeks[W1].shifts.some((x) => x.emp === "camilian" && x.date === "2026-10-19"));
  r = apply(s, [{ type: "moveShift", emp: "fleur", date: "2026-10-21", toEmp: "camilian" }]);
  assert.equal(r.ok, false); // Camilian travaille déjà + pas en ZR
  r = apply(s, [{ type: "copyDay", from: "2026-10-19", to: "2026-10-26" }]);
  assert.ok(r.ok);
  assert.equal(r.state.weeks[W2].shifts.length, s.weeks[W1].shifts.filter((x) => x.date === "2026-10-19").length);
  r = apply(s, [{ type: "duplicateWeek", from: W1, to: "2026-11-23" }]);
  assert.equal(r.ok, false); // 26-27 nov : Fleur et Camilian au CFA → erreurs créées
  r = apply(s, [{ type: "duplicateWeek", from: W1, to: "2026-10-26" }]);
  assert.equal(r.ok, false);
  r = apply(s, [{ type: "duplicateWeek", from: W1, to: "2026-09-21" }]);
  assert.ok(r.ok);
});

test("validation d'une semaine : alertes à reconnaître, puis repasse en brouillon après modification", () => {
  const s = withWeek1();
  let r = apply(s, [{ type: "setWeekStatus", monday: W1, status: "validé" }]);
  assert.equal(r.ok, false);
  r = apply(s, [{ type: "setWeekStatus", monday: W1, status: "validé", acknowledge: true }], { now: "x", by: "u" });
  assert.ok(r.ok);
  assert.equal(r.state.weeks[W1].status, "validé");
  const r2 = apply(r.state, [{ type: "setShift", emp: "eric", date: W1, segs: [{ s: "07:00", e: "14:00", z: "ZP" }] }]);
  assert.equal(r2.state.weeks[W1].status, "brouillon");
});

test("employés : ajout, doublon, homonymes, suppression protégée", () => {
  let s = fresh();
  let r = apply(s, [{ type: "addEmployee", employee: { name: "Inès", role: "salarie", zonesList: ["ZP"] } }]);
  assert.ok(r.ok);
  s = r.state;
  assert.equal(C.empById(s, "ines").zones.ZP, "confirme");
  assert.equal(apply(s, [{ type: "addEmployee", employee: { name: "ines" } }]).ok, false);
  assert.equal(C.weekGrid(s, W1).rows.length, s.employees.length);
  assert.equal(apply(s, [{ type: "removeEmployee", id: "eric" }]).ok, false);
  assert.ok(apply(s, [{ type: "removeEmployee", id: "ines" }]).ok);
  assert.equal(C.findEmployee(s, "Kamiliane").emp.id, "camilian");
  assert.equal(C.findEmployee(s, "S").emp, undefined); // Sebastien, Sonia, Sophie, Sylvie
});

test("annuler / restaurer : les changements contiennent l'état précédent", () => {
  const s = withWeek1();
  const r = apply(s, [{ type: "removeShift", emp: "eric", date: W1 }]);
  const back = C.applyChanges(r.state, r.changes, "before");
  assert.deepEqual(back.weeks[W1], s.weeks[W1]);
  const fwd = C.applyChanges(back, r.changes, "after");
  assert.deepEqual(fwd.weeks[W1], r.state.weeks[W1]);
});

test("export CSV puis réimport : mêmes créneaux", () => {
  const s = withWeek1();
  const csv = C.weeksToCSV(s, [W1]);
  assert.ok(csv.startsWith("﻿Semaine;Date"));
  const { shifts, rejected } = C.csvToShifts(s, csv);
  assert.equal(rejected.length, 0);
  assert.equal(shifts.length, 50);
  const r = apply(fresh(), [{ type: "importShifts", shifts }], { allowErrors: true });
  const a = r.state.weeks[W1].shifts.map((x) => x.emp + x.date + C.segKey(x.segs)).sort();
  const b = s.weeks[W1].shifts.map((x) => x.emp + x.date + C.segKey(x.segs)).sort();
  assert.deepEqual(a, b);
});

test("CSV : lignes illisibles rejetées avec la raison", () => {
  const s = fresh();
  const { shifts, rejected } = C.csvToShifts(s, "Date;Prénom;Début 1;Fin 1;Zone 1\n31/02/2026;Eric;07:00;12:00;ZP\n20/10/2026;Zorro;07:00;12:00;ZP\n20/10/2026;Eric;7h;12h;ZP\n");
  assert.equal(shifts.length, 1);
  assert.equal(rejected.length, 2);
});

test("calendrier d'alternance : lecture et modification d'un jour", () => {
  let s = fresh();
  const fleur = C.empById(s, "fleur");
  assert.equal(C.calStatus(s, fleur, "2026-10-05"), "formation");
  assert.equal(C.calStatus(s, fleur, "2026-10-19"), "entreprise");
  assert.equal(C.calStatus(s, fleur, "2026-11-11"), "ferie");
  assert.equal(C.calStatus(s, fleur, "2026-10-24"), "weekend");
  assert.equal(C.calStatus(s, fleur, "2027-09-01"), "inconnu");
  assert.equal(C.calStatus(s, C.empById(s, "eric"), "2026-10-05"), null);
  s = apply(s, [{ type: "setCalendarDay", calId: "bts-mco1", date: "2026-10-21", code: "P" }]).state;
  assert.equal(C.calStatus(s, fleur, "2026-10-21"), "formation");
});

test("remplaçants : jamais un alternant en cours, jamais une zone interdite, jamais quelqu'un qui travaille déjà", () => {
  const s = withWeek1();
  const segs = [{ s: "14:30", e: "17:00", z: "ZR" }, { s: "17:30", e: "22:00", z: "ZR" }];
  const c = C.findCandidates(s, "2026-10-21", segs);
  for (const x of c) {
    const e = C.empById(s, x.emp);
    assert.ok(e.zones.ZR, e.name);
    assert.ok(!s.weeks[W1].shifts.some((y) => y.emp === x.emp && y.date === "2026-10-21"));
  }
  assert.ok(!C.findCandidates(s, "2026-10-29", segs).some((x) => x.emp === "fleur"));
});

test("semaine du 26/10 (planning papier) : totaux de la feuille et aucune erreur bloquante", () => {
  const x = REF.extraWeeks.find((w) => w.monday === "2026-10-26");
  let s = withWeek1();
  const ops = (x.newEmployees || []).map((n) => ({ type: "addEmployee", employee: { name: n.name, zones: n.zones } }));
  ops.push(...Object.entries(x.zonesAdd).map(([emp, zs]) => ({ type: "setZones", emp, zones: { ...C.empById(s, emp).zones, ...Object.fromEntries(zs.map((z) => [z, "deduit"])) } })));
  s = apply(s, ops).state;
  s.weeks[x.monday] = { week: x.monday, status: "brouillon", shifts: x.shifts.map((t, i) => ({ id: "t" + i, emp: t.emp, date: C.addDays(x.monday, t.dow), segs: t.segs })) };
  for (const [emp, h] of Object.entries(x.totalsOnPaper)) assert.equal(C.weekMinutes(s, x.monday, emp) / 60, h, emp);
  assert.equal(C.blockingIssues(C.validateWeek(s, x.monday)).length, 0);
});

test("règles personnelles : horaires fixes et jours de repos signalés, respectés par les remplaçants", () => {
  const s = withWeek1();
  // Sebastien : du matin (horaires variables), le soir possible sans alerte
  assert.equal(C.empById(s, "sebastien").rules.fixedHours, null);
  assert.equal(C.empById(s, "sebastien").rules.prefers, "matin");
  const r = apply(s, [{ type: "setShift", emp: "sebastien", date: "2026-10-19", segs: [{ s: "14:30", e: "17:00", z: "ZP" }, { s: "17:30", e: "21:30", z: "ZP" }] }]);
  assert.ok(r.ok, r.errors && r.errors.join());
  assert.ok(!C.validateWeek(r.state, W1).some((i) => i.emp === "sebastien" && ["FIXED_HOURS", "FIXED_DAYOFF", "LATEST_END"].includes(i.code)));
  const r2 = apply(s, [{ type: "setShift", emp: "eric", date: "2026-10-24", segs: [{ s: "07:00", e: "13:00", z: "ZP" }] }]); // 35 h + 6 h ≤ 42 h
  assert.ok(C.validateWeek(r2.state, W1).some((i) => i.code === "FIXED_DAYOFF" && i.emp === "eric"));
  // Eric (repos samedi-dimanche) jamais proposé un samedi ; Sebastien jamais sur un poste d'après-midi
  const sat = C.findCandidates(s, "2026-10-24", [{ s: "07:00", e: "14:30", z: "ZP" }]).map((c) => c.emp);
  assert.ok(!sat.includes("eric"));
  // Sebastien proposé en priorité le matin, en dernier le soir (jamais exclu)
  const am = C.findCandidates(s, "2026-12-08", [{ s: "06:00", e: "11:00", z: "ZP" }, { s: "11:30", e: "13:30", z: "ZP" }]);
  const pm = C.findCandidates(s, "2026-12-08", [{ s: "14:30", e: "17:00", z: "ZP" }, { s: "17:30", e: "22:00", z: "ZP" }]);
  const sa = am.find((c) => c.emp === "sebastien"), sp = pm.find((c) => c.emp === "sebastien");
  assert.ok(sa && sp && sa.score > sp.score);
  assert.ok(sp.notes.includes("fait d'habitude le matin"));
  for (const id of ["fleur", "camilian", "lucas"]) assert.equal(C.empById(s, id).calendarId, "bts-mco1");
  assert.equal(C.empById(s, "eric").rules.fixedHours, null); // horaires variables
  assert.equal(C.empById(s, "eric").rules.maxEnd, "15:30");
  // Eric : jamais après 15:30 (bloquant) ; 05:30–13:00 accepté sans alerte d'horaires fixes.
  const late = apply(s, [{ type: "setShift", emp: "eric", date: "2026-10-20", segs: [{ s: "09:00", e: "12:00", z: "ZP" }, { s: "12:30", e: "16:00", z: "ZP" }] }]);
  assert.equal(late.ok, false);
  assert.match(late.errors.join(), /Eric ne finit jamais après 15:30/);
  const early = apply(s, [{ type: "setShift", emp: "eric", date: "2026-10-20", segs: [{ s: "05:30", e: "10:30", z: "ZP" }, { s: "11:00", e: "13:00", z: "ZP" }] }]);
  assert.ok(early.ok);
  assert.ok(!C.validateWeek(early.state, W1).some((i) => i.emp === "eric" && i.code === "FIXED_HOURS"));
  assert.ok(!C.findCandidates(s, "2026-10-21", [{ s: "10:00", e: "13:00", z: "ZP" }, { s: "13:30", e: "17:30", z: "ZP" }]).some((c) => c.emp === "eric"));
  assert.deepEqual(C.empById(s, "nathalie").rules.daysOff, [5, 6]);
  // le modèle (semaine du 19/10) respecte ces règles : aucune alerte de règle personnelle
  assert.equal(C.validateWeek(s, W1).filter((i) => i.code === "FIXED_HOURS" || i.code === "FIXED_DAYOFF").length, 0);
});

test("heures : semaine et mois, avec heures sup, journée en plus et retard", () => {
  let s = withWeek1();
  let x = C.hoursSummary(s, "fleur", W1, "2026-10-25");
  assert.equal(x.planned, 35 * 60);
  const r = apply(s, [
    { type: "addAdjustment", adjustment: { emp: "Fleur", date: "2026-10-21", type: "heures_sup", minutes: C.parseDuration("1h30") } },
    { type: "addAdjustment", adjustment: { emp: "fleur", date: "2026-10-22", type: "retard", minutes: C.parseDuration("0:20") } },
    { type: "addAdjustment", adjustment: { emp: "fleur", date: "2026-10-19", type: "journee_sup", minutes: C.parseDuration("5h") } }, // 35 h + 1 h 30 + 5 h = 41 h 30 (≤ 42 h)
  ]);
  assert.ok(r.ok, r.errors && r.errors.join());
  assert.equal(r.changes.filter((c) => c.col === "adjustments").length, 3);
  s = r.state;
  x = C.hoursSummary(s, "fleur", W1, "2026-10-25");
  assert.deepEqual([x.extra, x.late, x.extraDays, x.extraDayCount, x.total], [90, 20, 300, 1, 35 * 60 + 90 + 300 - 20]);
  const m = C.hoursSummary(s, "fleur", "2026-10-01", "2026-10-31");
  assert.equal(m.total, x.total); // une seule semaine planifiée en octobre
  assert.equal(apply(s, [{ type: "addAdjustment", adjustment: { emp: "fleur", date: "2026-10-21", type: "heures_sup", minutes: 0 } }]).ok, false);
  const id = Object.keys(s.adjustments)[0];
  const back = C.applyChanges(apply(s, [{ type: "removeAdjustment", id }]).state, [], "after");
  assert.equal(Object.keys(back.adjustments).length, 2);
});

test("confirmation : zones confirmées, doutes levés, pause vérifiée", () => {
  let s = withWeek1();
  assert.ok(s.weeks[W1].shifts.some(() => true));
  s.weeks[W1].shifts[0].segs[0].doute = "test";
  const r = apply(s, [{ type: "confirmAll" }, { type: "setSettings", patch: { maxDayHours: 7, maxWeekHours: 35, minPauseMinutes: 30, rulesConfirmed: true } }]);
  assert.ok(r.ok);
  s = r.state;
  assert.ok(s.employees.every((e) => Object.values(e.zones).every((v) => v === "confirme")));
  assert.ok(Object.values(s.weeks).every((w) => w.shifts.every((x) => x.segs.every((g) => !g.doute))));
  assert.equal(C.validateWeek(s, W1).filter((i) => ["PAUSE", "DAY_MAX", "WEEK_MAX", "ZONE_UNCERTAIN", "SOURCE_DOUBT"].includes(i.code)).length, 0);
  const r2 = apply(s, [{ type: "setShift", emp: "maelle", date: W1, segs: [{ s: "13:30", e: "21:00", z: "ZP" }] }]);
  assert.ok(C.validateWeek(r2.state, W1).some((i) => i.code === "PAUSE" && i.emp === "maelle"));
  assert.ok(C.validateWeek(r2.state, W1).some((i) => i.code === "DAY_MAX" && i.emp === "maelle"));
});

test("semaines du 05/10 et du 12/10 (plannings papier) : totaux des feuilles", () => {
  for (const x of REF.extraWeeks.filter((w) => w.dayTotals)) {
    const day = [0, 0, 0, 0, 0, 0, 0];
    for (const t of x.shifts) day[t.dow] += C.shiftMinutes(t.segs) / 60;
    assert.deepEqual(day, x.dayTotals, x.monday);
  }
});

test("fermeture : après-midi ZP 14:30–22:00 et ZR 15:30–23:00, matin inchangé", () => {
  const cl = { ZP: "22:00", ZR: "23:00" };
  const k = (segs) => segs.map((g) => `${g.s}-${g.e}`).join(" ");
  assert.equal(k(C.applyClosing([{ s: "13:30", e: "17:00", z: "ZP" }, { s: "17:30", e: "21:00", z: "ZP" }], cl)), "14:30-18:00 18:30-22:00");
  assert.equal(k(C.applyClosing([{ s: "14:30", e: "17:00", z: "ZR" }, { s: "17:30", e: "22:00", z: "ZR" }], cl)), "15:30-18:00 18:30-23:00");
  const m = [{ s: "07:00", e: "12:00", z: "ZP" }, { s: "12:30", e: "14:30", z: "ZR" }];
  assert.equal(C.applyClosing(m, cl), m);
  const late = C.applyClosing([{ s: "14:30", e: "17:00", z: "ZR" }, { s: "17:30", e: "22:00", z: "ZR" }], cl);
  assert.equal(C.shiftMinutes(late), 7 * 60);
});

test("retards et heures sup comptés à partir de 5 min", () => {
  const s = withWeek1();
  // Eric lundi 19/10 : prévu 07:00–14:30
  const at = (o) => C.deviationFromTimes(s, "eric", W1, o);
  assert.equal(at({ arrive: "07:04" }).late, 0);
  assert.equal(at({ arrive: "07:05" }).late, 5);
  assert.equal(at({ arrive: "07:20" }).late, 20);
  assert.equal(at({ depart: "14:34" }).extra, 0);
  assert.equal(at({ depart: "14:35" }).extra, 5);
  assert.equal(at({ depart: "15:30" }).extra, 60);
  assert.equal(at({ arrive: "06:50" }).late, 0);
  assert.ok(C.deviationFromTimes(s, "eric", "2026-10-24", { arrive: "07:30" }).error);
  const add = (type, minutes) => apply(s, [{ type: "addAdjustment", adjustment: { emp: "eric", date: W1, type, minutes } }]).ok;
  assert.equal(add("retard", 4), false);
  assert.equal(add("retard", 5), true);
  assert.equal(add("heures_sup", 3), false);
  assert.equal(add("heures_sup", 5), true);
  assert.equal(add("journee_sup", 3), true);
});

test("alternants : pause déjeuner au CFA 12:30–13:30 non comptée et bloquée", () => {
  const s = fresh();
  const fleur = C.empById(s, "fleur");
  const day = "2026-10-29"; // jeudi de cours : 07:30–12:30 et 13:30–17:30
  assert.equal(C.courseMinutesOn(s, fleur, day), 9 * 60);
  assert.ok(C.courseBusy(s, fleur, day).some((x) => x.lunch && x.s === "12:30" && x.e === "13:30"));
  const r = apply(s, [{ type: "setShift", emp: "fleur", date: day, segs: [{ s: "12:40", e: "13:20", z: "ZR" }] }]);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /pause déjeuner/);
});

test("nouvelles personnes en formation : jamais seules dans leur zone (même pendant une pause)", () => {
  let s = withWeek1();
  s = apply(s, [{ type: "addEmployee", employee: { name: "Ruby", zones: { ZP: "confirme" } } }, { type: "updateEmployee", id: "ruby", patch: { training: { since: "2026-10-19" } } }]).state;
  assert.equal(C.inTraining(C.empById(s, "ruby"), "2027-10-19"), true); // pas de délai : jusqu'à ce qu'on décoche
  // Lundi 19/10 : Eric en ZP de 07:00 à 12:00 puis 12:30–14:30 ; Ruby de 07:00 à 14:30 serait seule de 12:00 à 12:30.
  const eric = s.weeks["2026-10-19"].shifts.find((x) => x.emp === "eric" && x.date === "2026-10-19");
  assert.ok(eric);
  const others = s.weeks["2026-10-19"].shifts.filter((x) => x.date === "2026-10-19" && x.emp !== "eric" && x.segs.some((g) => g.z === "ZP"));
  s.weeks["2026-10-19"].shifts = s.weeks["2026-10-19"].shifts.filter((x) => !others.includes(x));
  const r = apply(s, [{ type: "setShift", emp: "ruby", date: "2026-10-19", segs: [{ s: "07:00", e: "14:30", z: "ZP" }] }]);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /en formation.*seul\(e\) en ZP.*12:00–12:30/);
  // Avec quelqu'un de confirmé tout le temps : accepté.
  const ok = apply(s, [{ type: "setShift", emp: "ruby", date: "2026-10-19", segs: eric.segs }]);
  assert.equal(ok.ok, true);
  // Formation décochée : plus de contrôle.
  const later = apply(s, [{ type: "updateEmployee", id: "ruby", patch: { training: { since: "2026-10-01", ended: "2026-10-19" } } }, { type: "setShift", emp: "ruby", date: "2026-10-19", segs: [{ s: "07:00", e: "14:30", z: "ZP" }] }]);
  assert.equal(later.ok, true);
  // Jamais proposée en remplaçante si elle serait seule.
  assert.ok(!C.findCandidates(s, "2026-10-19", [{ s: "15:00", e: "21:00", z: "ZP" }]).some((x) => x.emp === "ruby"));
});

test("compétences : ouverture et fermeture signalées, formation sans date de fin", () => {
  let s = withWeek1();
  // personne n'a la compétence : aucune alerte
  assert.ok(!C.validateWeek(s, W1).some((i) => i.code === "OPEN_SKILL" || i.code === "CLOSE_SKILL"));
  s = apply(s, [{ type: "updateEmployee", id: "eric", patch: { skills: { ouverture: true } } }]).state;
  const open = C.validateWeek(s, W1).filter((i) => i.code === "OPEN_SKILL");
  assert.ok(open.length > 0);
  assert.match(open[0].msg, /sans la compétence « ouverture du magasin »/);
  assert.equal(C.hasSkill(C.empById(s, "eric"), "ouverture"), true);
  assert.equal(C.hasSkill(C.empById(s, "eric"), "badgeRouge"), !!C.empById(s, "eric").zones.ZR);
  // en formation sans date de fin : actif jusqu'à ce qu'on décoche
  const e = { training: { since: "2026-11-01" } };
  assert.equal(C.inTraining(e, "2027-06-01"), true);
  assert.equal(C.inTraining({ training: { since: "2026-11-01", ended: "2026-11-12" } }, "2026-11-20"), false);
});

test("conditions : personnes liées (mêmes horaires, zone au choix, mêmes week-ends)", () => {
  let s = withWeek1();
  const r = apply(s, [{ type: "setSettings", patch: { links: [{ emps: ["maelle", "murielle"], sameHours: true, sameZone: false, sameWeekends: true }] } }]);
  assert.ok(r.ok, r.errors && r.errors.join());
  s = r.state;
  assert.equal(apply(s, [{ type: "setSettings", patch: { links: [{ emps: ["maelle"], sameHours: true }] } }]).ok, false);
  const M = "2026-12-07";
  const { week, report } = C.generateWeek(s, M);
  for (const d of C.weekDates(M)) {
    const a = week.shifts.find((x) => x.emp === "maelle" && x.date === d), b = week.shifts.find((x) => x.emp === "murielle" && x.date === d);
    const excused = report.notPlaced.some((n) => ["maelle", "murielle"].includes(n.emp) && n.date === d);
    if (a && b) assert.deepEqual(C.shiftSpan(a.segs), C.shiftSpan(b.segs), d);
    if (C.dow(d) >= 5 && !excused) assert.equal(!!a, !!b, "week-end " + d);
  }
  // validation : horaires différents signalés
  s.weeks[M] = { week: M, status: "brouillon", shifts: [
    { id: "a", emp: "maelle", date: "2026-12-08", segs: [{ s: "07:00", e: "12:00", z: "ZP" }, { s: "12:30", e: "14:30", z: "ZP" }] },
    { id: "b", emp: "murielle", date: "2026-12-08", segs: [{ s: "14:30", e: "17:00", z: "ZR" }, { s: "17:30", e: "22:00", z: "ZR" }] },
    { id: "c", emp: "maelle", date: "2026-12-12", segs: [{ s: "07:00", e: "12:00", z: "ZP" }, { s: "12:30", e: "14:30", z: "ZP" }] }] };
  const iss = C.validateWeek(s, M);
  assert.ok(iss.some((i) => i.code === "LINK_HOURS"));
  assert.ok(iss.some((i) => i.code === "LINK_WEEKEND"));
  assert.ok(!iss.some((i) => i.code === "LINK_ZONE")); // zone libre
});

test("conditions : zone toute la semaine, jours de bureau, liaison désactivable", () => {
  let s = withWeek1();
  let r = apply(s, [{ type: "updateEmployee", id: "charlotte", patch: { rules: { ...(C.empById(s, "charlotte").rules || {}), officeMinDays: 2, officeSince: null } } }]);
  s = r.state;
  assert.ok(C.validateWeek(s, W1).some((i) => i.code === "OFFICE_DAYS" && i.emp === "charlotte"));
  const ch = s.weeks[W1].shifts.filter((x) => x.emp === "charlotte").slice(0, 2);
  r = apply(s, ch.map((x) => ({ type: "setShift", emp: "charlotte", date: x.date, segs: x.segs, office: true })), { allowErrors: true });
  assert.ok(!C.validateWeek(r.state, W1).some((i) => i.code === "OFFICE_DAYS"));
  // zone toute la semaine : génération en ZR et alerte si un bloc est en ZP
  s = apply(s, [{ type: "updateEmployee", id: "murielle", patch: { rules: { weekZone: "ZR" } } }]).state;
  const { week } = C.generateWeek(s, "2026-12-07");
  assert.ok(week.shifts.filter((x) => x.emp === "murielle").every((x) => x.segs.every((g) => g.z === "ZR")));
  // liaison décochée : ignorée
  s = apply(s, [{ type: "setSettings", patch: { links: [{ emps: ["maelle", "murielle"], sameHours: true, sameWeekends: true, active: false }] } }]).state;
  s.weeks["2026-12-07"] = { week: "2026-12-07", status: "brouillon", shifts: [
    { id: "a", emp: "maelle", date: "2026-12-08", segs: [{ s: "07:00", e: "12:00", z: "ZP" }] },
    { id: "b", emp: "murielle", date: "2026-12-08", segs: [{ s: "15:00", e: "20:00", z: "ZR" }] }] };
  assert.ok(!C.validateWeek(s, "2026-12-07").some((i) => i.code.startsWith("LINK")));
});

test("durée par semaine : dépassement possible jusqu'à 42 h, jamais au-delà", () => {
  let s = withWeek1();
  assert.equal(C.DEFAULT_SETTINGS.hardMaxWeekHours, 42);
  const W = "2026-12-07";
  const day = (i, a, b) => ({ type: "setShift", emp: "maelle", date: C.addDays(W, i), segs: [{ s: a, e: "12:00", z: "ZP" }, { s: "12:30", e: b, z: "ZP" }] });
  // 6 jours de 7 h = 42 h : accepté (dépassement signalé, pas bloquant)
  let r = apply(s, [0, 1, 2, 3, 4, 5].map((i) => day(i, "07:00", "14:30")));
  assert.ok(r.ok, r.errors && r.errors.join());
  assert.ok(!C.validateWeek(r.state, W).some((i) => i.code === "WEEK_HARD_MAX"));
  // un 7e jour : 49 h → refusé
  const r2 = apply(r.state, [day(6, "07:00", "14:30")]);
  assert.equal(r2.ok, false);
  assert.match(r2.errors.join(), /maximum de 42 h/);
  // heures sup au-delà de 42 h refusées
  const r3 = apply(r.state, [{ type: "addAdjustment", adjustment: { emp: "maelle", date: C.addDays(W, 1), type: "heures_sup", minutes: 30 } }]);
  assert.equal(r3.ok, false);
  // jamais proposée en remplaçante au-delà de 42 h
  assert.ok(!C.findCandidates(r.state, C.addDays(W, 6), [{ s: "07:00", e: "12:00", z: "ZP" }]).some((c) => c.emp === "maelle"));
});

test("temps partiel : jamais 42 h (contrat + 10 % au plus) ; règles légales", () => {
  let s = withWeek1();
  s = apply(s, [{ type: "addEmployee", employee: { name: "Ruby", zones: { ZP: "confirme" } } }, { type: "updateEmployee", id: "ruby", patch: { contractHours: 21 } }]).state;
  const cap = C.weekCap(s, C.empById(s, "ruby"));
  assert.equal(cap.partTime, true);
  assert.equal(cap.minutes, Math.round(21 * 60 * 1.1));
  assert.equal(C.weekCap(s, C.empById(s, "charlotte")).minutes, 42 * 60);
  const W = "2026-12-07";
  const d = (i) => ({ type: "setShift", emp: "ruby", date: C.addDays(W, i), segs: [{ s: "14:30", e: "17:00", z: "ZP" }, { s: "17:30", e: "22:00", z: "ZP" }] });
  assert.ok(apply(s, [d(0), d(1), d(2)]).ok); // 21 h
  const r = apply(s, [d(0), d(1), d(2), d(3)]); // 28 h > 23 h 06
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /temps partiel/);
  // droit du travail : 10 h par jour, 13 h d'amplitude, 6 h d'affilée, 7 jours d'affilée
  const iss = (ops) => C.validateWeek(apply(s, ops, { allowErrors: true }).state, W).map((i) => i.code);
  assert.ok(iss([{ type: "setShift", emp: "charlotte", date: W, segs: [{ s: "06:00", e: "12:00", z: "ZP" }, { s: "12:30", e: "17:30", z: "ZP" }] }]).includes("LEGAL_DAY_MAX"));
  assert.ok(iss([{ type: "setShift", emp: "charlotte", date: W, segs: [{ s: "06:00", e: "09:00", z: "ZP" }, { s: "17:00", e: "20:00", z: "ZP" }] }]).includes("LEGAL_AMPLITUDE"));
  assert.ok(iss([{ type: "setShift", emp: "charlotte", date: W, segs: [{ s: "06:00", e: "13:00", z: "ZP" }] }]).includes("LEGAL_CONTINUOUS"));
  const seven = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ type: "setShift", emp: "charlotte", date: C.addDays(W, i), segs: [{ s: "07:00", e: "11:00", z: "ZP" }] }));
  const codes = iss(seven);
  assert.ok(codes.includes("LEGAL_CONSECUTIVE") && codes.includes("LEGAL_DAYS_OFF"));
  // jamais proposé(e) pour un 6e jour dans la semaine (2 jours de repos)
  const five = apply(s, [0, 1, 2, 3, 4].map((i) => ({ type: "setShift", emp: "charlotte", date: C.addDays(W, i), segs: [{ s: "07:00", e: "11:00", z: "ZP" }] })), { allowErrors: true }).state;
  assert.ok(!C.findCandidates(five, C.addDays(W, 5), [{ s: "07:00", e: "11:00", z: "ZP" }]).some((c) => c.emp === "charlotte"));
});

test("horaires d'ouverture des points de vente (été / hiver)", () => {
  let s = withWeek1();
  assert.equal(C.seasonOf("2026-11-16", s), "ete"); // période été : 25/10/2026 → 27/03/2027
  assert.equal(C.seasonOf("2027-03-27", s), "ete");
  assert.equal(C.seasonOf("2027-03-28", s), "hiver");
  assert.equal(C.seasonOf("2026-10-24", s), "hiver");
  const W = "2026-12-07";
  const late = [{ type: "setShift", emp: "maelle", date: W, segs: [{ s: "14:30", e: "17:30", z: "ZP" }, { s: "18:00", e: "22:30", z: "ZP" }] }];
  assert.ok(C.validateWeek(apply(s, late).state, W).some((i) => i.code === "OUT_OF_HOURS"));
  const ok = [{ type: "setShift", emp: "maelle", date: W, segs: [{ s: "14:30", e: "17:30", z: "ZP" }, { s: "18:00", e: "22:00", z: "ZP" }] }];
  assert.ok(!C.validateWeek(apply(s, ok).state, W).some((i) => i.code === "OUT_OF_HOURS"));
  s = apply(s, [{ type: "setSettings", patch: { season: "hiver" } }]).state;
  assert.ok(C.validateWeek(apply(s, ok).state, W).some((i) => i.code === "OUT_OF_HOURS")); // hiver : ZP ferme à 21:00
  assert.equal(apply(s, [{ type: "setSettings", patch: { hoursZP_hiver: "5h30" } }]).ok, false);
  assert.ok(!C.findCandidates(s, W, [{ s: "18:00", e: "22:00", z: "ZP" }]).length);
});

test("saison choisie à la génération : postes décalés dans l'ouverture du point de vente", () => {
  const s = withWeek1();
  const W = "2026-12-07";
  const hiver = C.generateWeek(s, W, { season: "hiver" }).week;
  assert.equal(hiver.season, "hiver");
  assert.ok(hiver.shifts.every((x) => x.segs.every((g) => g.z !== "ZP" || (g.s >= "05:30" && g.e <= "21:00"))));
  const ete = C.generateWeek(s, W, { season: "ete" }).week;
  assert.equal(ete.season, "ete");
  const r = apply(s, [{ type: "putWeek", monday: W, week: hiver }, { type: "setWeekSeason", monday: W, season: "ete" }], { allowErrors: true });
  assert.equal(r.state.weeks[W].season, "ete");
});

test("préférence de zone : obligatoire, ou « si besoin » peut changer", () => {
  let s = withWeek1();
  s = apply(s, [{ type: "updateEmployee", id: "murielle", patch: { rules: { weekZone: "ZR" } } }]).state;
  const W = "2026-12-07", zp = [{ s: "14:30", e: "17:00", z: "ZP" }, { s: "17:30", e: "22:00", z: "ZP" }];
  const iss = (st) => C.validateWeek(apply(st, [{ type: "setShift", emp: "murielle", date: W, segs: zp }]).state, W);
  assert.ok(iss(s).some((i) => i.code === "WEEK_ZONE"));
  assert.ok(!C.findCandidates(s, W, zp).some((c) => c.emp === "murielle"));
  s = apply(s, [{ type: "updateEmployee", id: "murielle", patch: { rules: { weekZone: "ZR", zoneFlex: true } } }]).state;
  assert.ok(!iss(s).some((i) => i.code === "WEEK_ZONE"));
  const c = C.findCandidates(s, W, zp).find((x) => x.emp === "murielle");
  assert.ok(c && c.notes.includes("préfère la ZR"));
});

test("préférence de service : matin/soir obligatoire, ou « si besoin »", () => {
  let s = withWeek1();
  assert.equal(C.empById(s, "sebastien").rules.shiftFlex, true);
  s = apply(s, [{ type: "updateEmployee", id: "maelle", patch: { rules: { prefers: "matin" } } }]).state;
  const W = "2026-12-07", pm = [{ s: "14:30", e: "17:00", z: "ZP" }, { s: "17:30", e: "22:00", z: "ZP" }];
  assert.ok(C.validateWeek(apply(s, [{ type: "setShift", emp: "maelle", date: W, segs: pm }]).state, W).some((i) => i.code === "SHIFT_PREF"));
  assert.ok(!C.findCandidates(s, W, pm).some((c) => c.emp === "maelle"));
  s = apply(s, [{ type: "updateEmployee", id: "maelle", patch: { rules: { prefers: "matin", shiftFlex: true } } }]).state;
  assert.ok(!C.validateWeek(apply(s, [{ type: "setShift", emp: "maelle", date: W, segs: pm }]).state, W).some((i) => i.code === "SHIFT_PREF"));
});

test("administratif : zone ADM (bureau), compétence, jour de bureau", () => {
  let s = withWeek1();
  s = apply(s, [{ type: "addZone", zone: { id: "ADM", name: "Administratif (bureau)", color: "#5E5CE6", pattern: "plein" } }]).state;
  const ch = C.empById(s, "charlotte");
  assert.equal(C.hasSkill(ch, "admin"), false);
  const W = "2026-12-07", seg = [{ s: "09:00", e: "12:00", z: "ADM" }, { s: "12:30", e: "16:30", z: "ADM" }];
  assert.equal(apply(s, [{ type: "setShift", emp: "charlotte", date: W, segs: seg }]).ok, false); // pas la compétence
  s = apply(s, [{ type: "setZones", emp: "charlotte", zones: { ...ch.zones, ADM: "confirme" } }, { type: "updateEmployee", id: "charlotte", patch: { rules: { officeMinDays: 1 } } }]).state;
  assert.equal(C.hasSkill(C.empById(s, "charlotte"), "admin"), true);
  const r = apply(s, [{ type: "setShift", emp: "charlotte", date: W, segs: seg }]);
  assert.ok(r.ok, r.errors && r.errors.join());
  const iss = C.validateWeek(r.state, W).map((i) => i.code);
  assert.ok(!iss.includes("OFFICE_DAYS") && !iss.includes("OUT_OF_HOURS"));
});

test("absence pour raison médicale sur une plage horaire, avec un nom", () => {
  let s = withWeek1();
  const d = "2026-10-20";
  const r = apply(s, [{ type: "addAbsence", absence: { emp: "eric", type: "medical", from: d, to: d, label: "Rendez-vous médecin", s: "09:00", e: "10:30" } }]);
  assert.ok(r.ok, r.errors && r.errors.join());
  assert.ok(r.impacts.some((x) => x.emp === "eric" && x.date === d)); // Eric 07:00–14:30 ce jour-là
  s = r.state;
  const a = Object.values(s.absences)[0];
  assert.equal(C.absLabel(a), "Rendez-vous médecin 09:00–10:30");
  assert.ok(C.validateWeek(s, W1).some((i) => i.code === "ABSENCE" && i.emp === "eric" && /09:00 à 10:30/.test(i.msg)));
  // en dehors de la plage : planifiable
  assert.ok(C.availability(s, "eric", d, [{ s: "11:00", e: "15:00", z: "ZP" }]).ok);
  assert.equal(C.availability(s, "eric", d, [{ s: "07:00", e: "12:00", z: "ZP" }]).ok, false);
  assert.equal(apply(s, [{ type: "addAbsence", absence: { emp: "eric", type: "medical", from: d, s: "11:00", e: "10:00" } }]).ok, false);
});
