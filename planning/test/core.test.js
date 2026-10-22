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
  assert.ok(report.notPlaced.every((n) => /formation/.test(n.reason)));
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
  assert.match(r.errors.join(), /formation/);
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
  const ops = Object.entries(x.zonesAdd).map(([emp, zs]) => ({ type: "setZones", emp, zones: { ...C.empById(s, emp).zones, ...Object.fromEntries(zs.map((z) => [z, "deduit"])) } }));
  s = apply(s, ops).state;
  s.weeks[x.monday] = { week: x.monday, status: "brouillon", shifts: x.shifts.map((t, i) => ({ id: "t" + i, emp: t.emp, date: C.addDays(x.monday, t.dow), segs: t.segs })) };
  for (const [emp, h] of Object.entries(x.totalsOnPaper)) assert.equal(C.weekMinutes(s, x.monday, emp) / 60, h, emp);
  assert.equal(C.blockingIssues(C.validateWeek(s, x.monday)).length, 0);
});

test("règles personnelles : horaires fixes et jours de repos signalés, respectés par les remplaçants", () => {
  const s = withWeek1();
  assert.deepEqual(C.empById(s, "sebastien").rules.fixedHours, { s: "07:00", e: "14:30" });
  const r = apply(s, [{ type: "setShift", emp: "sebastien", date: "2026-10-19", segs: [{ s: "13:30", e: "21:00", z: "ZP" }] }]);
  assert.ok(r.ok); // alerte, pas blocage
  assert.ok(C.validateWeek(r.state, W1).some((i) => i.code === "FIXED_HOURS" && i.emp === "sebastien"));
  const r2 = apply(s, [{ type: "setShift", emp: "eric", date: "2026-10-24", segs: [{ s: "07:00", e: "14:30", z: "ZP" }] }]);
  assert.ok(C.validateWeek(r2.state, W1).some((i) => i.code === "FIXED_DAYOFF" && i.emp === "eric"));
  // Eric (repos samedi-dimanche) jamais proposé un samedi ; Sebastien jamais sur un poste d'après-midi
  const sat = C.findCandidates(s, "2026-10-24", [{ s: "07:00", e: "14:30", z: "ZP" }]).map((c) => c.emp);
  assert.ok(!sat.includes("eric"));
  const pm = C.findCandidates(s, "2026-10-19", [{ s: "13:30", e: "21:00", z: "ZP" }]).map((c) => c.emp);
  assert.ok(!pm.includes("sebastien"));
  for (const id of ["fleur", "camilian", "lucas"]) assert.equal(C.empById(s, id).calendarId, "bts-mco1");
  assert.deepEqual(C.empById(s, "eric").rules.fixedHours, { s: "07:00", e: "14:30" });
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
    { type: "addAdjustment", adjustment: { emp: "fleur", date: "2026-10-19", type: "journee_sup", minutes: C.parseDuration("7h") } },
  ]);
  assert.ok(r.ok, r.errors && r.errors.join());
  assert.equal(r.changes.filter((c) => c.col === "adjustments").length, 3);
  s = r.state;
  x = C.hoursSummary(s, "fleur", W1, "2026-10-25");
  assert.deepEqual([x.extra, x.late, x.extraDays, x.extraDayCount, x.total], [90, 20, 420, 1, 35 * 60 + 90 + 420 - 20]);
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
