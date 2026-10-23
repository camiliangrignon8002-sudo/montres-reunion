// Test de bout en bout dans Chromium : node planning/test/e2e.js [dossier-captures]
// 1) mode navigateur (stockage local) ; 2) environnement Claude simulé (base de données + modèle factices).
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const FILE = "file://" + path.join(__dirname, "..", "dist", "standalone.html");
const SHOTS = process.argv[2] || null;
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok: !!ok }); console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`); };

// Environnement claude.ai simulé : db en mémoire, utilisateur, et un « modèle » qui appelle les outils de la page.
const MOCK = `
(() => {
  const store = new Map();
  const snap = (id, v) => ({ id, exists: v !== undefined, data: () => v === undefined ? undefined : JSON.parse(JSON.stringify(v)), metadata: { fromCache: false, hasPendingWrites: false } });
  const coll = (p, ord, lim) => ({
    path: p,
    doc: (id) => docRef(p + "/" + id),
    orderBy: (f, d) => coll(p, [f, d], lim), limit: (n) => coll(p, ord, n),
    get: async () => {
      let docs = [...store.entries()].filter(([k]) => k.startsWith(p + "/") && k.slice(p.length + 1).indexOf("/") < 0).map(([k, v]) => snap(k.slice(p.length + 1), v));
      if (ord) docs.sort((a, b) => (a.data()[ord[0]] < b.data()[ord[0]] ? -1 : 1) * (ord[1] === "desc" ? -1 : 1));
      if (lim) docs = docs.slice(0, lim);
      return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} };
    },
    onSnapshot: () => () => {},
  });
  const docRef = (p) => ({ id: p.split("/").pop(), path: p,
    get: async () => snap(p.split("/").pop(), store.get(p)),
    set: async (v) => { if (JSON.stringify(v).length > 262144) throw { code: "invalid_argument", message: "too big" }; store.set(p, JSON.parse(JSON.stringify(v))); },
    update: async (v) => { if (!store.has(p)) throw { code: "invalid_argument" }; store.set(p, { ...store.get(p), ...v }); },
    delete: async () => { store.delete(p); } });
  window.__mockStore = store;
  window.__aiCalls = [];
  const sample = async (turns, opts) => {
    const last = turns[turns.length - 1].content;
    window.__aiCalls.push({ turns: turns.length, tools: (opts.tools || []).map((t) => t.name), context: turns[0].content.slice(0, 400) });
    const tool = (n) => opts.tools.find((t) => t.name === n);
    if (/zone réservée samedi/i.test(last)) {
      const r = await tool("qui_travaille").execute({ date: "2026-10-24", zone: "ZR" }, {});
      const text = "En zone réservée samedi : " + r.personnes.map((p) => p.prenom).join(", ") + ".";
      opts.onText && opts.onText({ text, delta: text });
      return { text, truncated: false };
    }
    if (/Fleur.*jeudi 29/i.test(last)) {
      const r = await tool("proposer_modifications").execute({ resume: "Fleur jeudi 29", operations: [{ type: "definir_creneau", prenom: "Fleur", date: "2026-10-29", segments: [{ debut: "14:00", fin: "21:00", zone: "ZR" }] }] }, {});
      const text = r.ok ? "Proposition prête." : "Impossible : " + r.erreurs.join(" ");
      return { text, truncated: false };
    }
    if (/Fleur.*mardi/i.test(last)) {
      const r = await tool("proposer_modifications").execute({ resume: "Fleur mardi 20 de 14 h à 21 h", operations: [{ type: "definir_creneau", prenom: "Fleur", date: "2026-10-20", segments: [{ debut: "14:00", fin: "21:00", zone: "ZR" }] }] }, {});
      const text = r.ok ? "La modification est prête : cliquez sur Appliquer." : "Impossible : " + r.erreurs.join(" ");
      return { text, truncated: false };
    }
    return { text: "Je n'ai pas compris.", truncated: false };
  };
  sample.limits = async () => ({ maxPromptBytes: 262144, tools: { maxCount: 16 }, images: { maxCount: 5, maxInputBytes: 1e7, mediaTypes: ["image/png"] } });
  sample.json = async () => ({});
  const user = { id: async () => "user-test", can: async () => true, isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: "Camilian (test)" }])) };
  const db = { doc: docRef, collection: (p) => coll(p) };
  window.claude = { use: async (n) => (n === "db" ? db : n === "user" ? user : n === "sample" ? sample : null) };
})();`;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const errors = [];
  const watch = (page) => { page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); }); };
  // Horloge figée au jeudi 22 octobre 2026 pour des tests reproductibles.
  const fixClock = (ctx) => ctx.addInitScript(() => { const T = new Date("2026-10-22T09:30:00").getTime(); const D = Date; class FD extends D { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } } window.Date = FD; });

  // ---------------- 1. Mode navigateur ----------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    await fixClock(ctx);
    const page = await ctx.newPage(); watch(page);
    await page.goto(FILE);
    await page.waitForSelector("table.plan");
    check("premier lancement : import automatique, sans confirmation à donner", await page.evaluate(() => !!PlanningApp.state && PlanningApp.ui.screen === "week"));
    await page.waitForTimeout(300);
    const st0 = await page.evaluate(() => ({ s19: PlanningApp.state.weeks["2026-10-19"].status, s26: PlanningApp.state.weeks["2026-10-26"].status, doubts: Object.values(PlanningApp.state.weeks).flatMap((w) => w.shifts).filter((x) => x.segs.some((g) => g.doute)).length, banner: !!document.querySelector(".card h3") && /Informations à confirmer/.test(document.body.textContent) }));
    const oct = await page.evaluate(() => { const st = PlanningApp.state; const m = (k) => st.weeks[k] ? { n: st.weeks[k].shifts.reduce((a, x) => a + PlanningCore.shiftMinutes(x.segs), 0) / 60, s: st.weeks[k].status, err: PlanningCore.validateWeek(st, k).filter((i) => i.level === "erreur").length } : null; const so = st.employees.find((e) => e.id === "sophie"); return { w5: m("2026-10-05"), w12: m("2026-10-12"), sophie: so && { active: so.active, left: so.leftOn }, sophieOct: PlanningCore.hoursSummary(st, "sophie", "2026-10-01", "2026-10-31").total / 60 }; });
    check("semaines du 05/10 et 12/10 ajoutées, validées, sans erreur ; heures de Sophie gardées", oct.w5 && oct.w5.n === 339.5 && oct.w5.s === "validé" && oct.w5.err === 0 && oct.w12.n === 380 && oct.w12.s === "validé" && oct.w12.err === 0 && oct.sophie.active === false && oct.sophieOct === 91, JSON.stringify(oct));
    const sept = await page.evaluate(() => { const st = PlanningApp.state; const ws = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]; return { hours: ws.map((k) => st.weeks[k] ? st.weeks[k].shifts.reduce((a, x) => a + PlanningCore.shiftMinutes(x.segs), 0) / 60 : null), status: ws.map((k) => st.weeks[k] && st.weeks[k].status), err: ws.map((k) => PlanningCore.validateWeek(st, k).filter((i) => i.level === "erreur").length), cp: Object.values(st.absences).filter((a) => a.type === "conges").length, former: ["sonia", "sylvie", "sophie"].map((id) => { const e = st.employees.find((x) => x.id === id); return e ? (e.active === false ? e.leftOn : "actif") : "absent"; }), lydia: !!st.employees.find((e) => e.id === "lydia"), amZones: Object.keys((st.employees.find((e) => e.id === "amandine") || {}).zones || {}).sort().join() }; });
    check("septembre ajouté : 455/478/415/408 h, validé, sans erreur, CP, anciens employés, sans Lydia", sept.hours.join() === "455,478,415,408" && sept.status.every((x) => x === "validé") && sept.err.join() === "0,0,0,0" && sept.cp === 3 && sept.former.join() === "2026-09-21,2026-10-05,2026-10-19" && !sept.lydia && sept.amZones === "ZP,ZR", JSON.stringify(sept));
    const pm = await page.evaluate(() => { const st = PlanningApp.state; const f = (emp, d) => { const x = Object.values(st.weeks).flatMap((w) => w.shifts).find((y) => y.emp === emp && y.date === d); return x ? x.segs[0].s + "-" + x.segs[x.segs.length - 1].e : null; }; return { fleur: f("fleur", "2026-10-26"), charlotte: f("charlotte", "2026-10-26"), nath: f("nathalie", "2026-10-26"), old: f("fleur", "2026-10-21"), tpl: st.template.shifts.find((t) => t.emp === "camilian").segs.map((g) => g.s + "-" + g.e).join(" "), s26: st.weeks["2026-10-26"].status }; });
    check("après-midi à partir du 26/10 : ZP 14:30–22:00, ZR 15:30–23:00 (modèle compris), avant le 26/10 inchangé", pm.fleur === "15:30-23:00" && pm.charlotte === "14:30-22:00" && pm.nath === "06:00-13:30" && pm.old === "14:30-22:00" && pm.tpl === "14:30-18:00 18:30-22:00", JSON.stringify(pm));
    check("tout confirmé : semaines papier validées, aucun point en attente", st0.s19 === "validé" && st0.s26 === "validé" && st0.doubts === 0, JSON.stringify(st0));
    await page.evaluate(() => PlanningApp.go("import"));
    check("écran Importation : plus rien en attente", (await page.isVisible("text=Importés et confirmés")) && (await page.isVisible("text=Aucun : toutes les informations sont confirmées.")) && !(await page.isVisible("text=En attente de votre confirmation")));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-import.png`, fullPage: false });
    await page.evaluate(() => PlanningApp.go("dashboard"));
    check("tableau de bord : plus de bandeau « Informations à confirmer »", !(await page.isVisible("text=Informations à confirmer")));
    await page.evaluate(() => PlanningApp.go("week"));
    await page.waitForSelector("table.plan");
    const cells = await page.$$eval("table.plan td.cell .blk", (b) => b.length);
    check("semaine du 19/10 importée : 100 blocs (50 journées, sans Lydia)", cells === 100, String(cells));
    check("légende visible", await page.isVisible(".legend"));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/2-semaine.png` });

    // édition : Fleur mercredi
    await page.click('td.cell[aria-label^="Fleur, Mercredi 21"]');
    await page.waitForSelector(".dialog");
    const zrEnabled = await page.$$eval(".zone-pick button", (bs) => bs.map((b) => b.textContent + (b.disabled ? ":off" : ":on")));
    check("Fleur : ZP verrouillée, ZR autorisée", zrEnabled.includes("ZP:off") && zrEnabled.includes("ZR:on"), zrEnabled.join(","));
    await page.fill('input[aria-label="Fin du bloc 2"]', "21:30");
    await page.dispatchEvent('input[aria-label="Fin du bloc 2"]', "change");
    await page.click(".dialog footer >> text=Enregistrer");
    await page.waitForTimeout(150);
    check("modification d'un horaire enregistrée", await page.isVisible('td.cell[aria-label*="Fleur, Mercredi 21 octobre : 14:30–17:00 · 17:30–21:30"]'));

    // fiche heures : clic sur un prénom
    await page.click('td.name button:has(b:text-is("Fleur"))');
    await page.waitForSelector(".dialog >> text=prévues au planning");
    check("clic sur le prénom : heures de la semaine", /34 h 30/.test(await page.textContent(".dialog .kpis")));
    await page.selectOption("#aj-type", "heures_sup");
    await page.fill("#aj-date", "2026-10-21"); await page.fill("#aj-dur", "1h30");
    await page.click('.dialog button[type="submit"]:text("Ajouter")');
    await page.waitForSelector(".dialog >> text=+1 h 30");
    await page.selectOption("#aj-type", "retard");
    await page.fill("#aj-date", "2026-10-22"); await page.dispatchEvent("#aj-date", "change");
    await page.fill("#aj-real", "14:33");
    await page.click('.dialog button[type="submit"]:text("Ajouter")');
    await page.waitForSelector("text=/rien n'est compté/");
    check("retard de 3 min : pas compté (seuil 5 min)", true);
    await page.fill("#aj-real", "");
    await page.fill("#aj-dur", "0:15");
    await page.click('.dialog button[type="submit"]:text("Ajouter")');
    await page.waitForSelector(".dialog >> text=−0 h 15");
    await page.waitForTimeout(100);
    const kp = await page.textContent(".dialog .kpis");
    check("heures sup et retard ajoutés : total réel recalculé", /35 h 45/.test(kp), kp.replace(/\s+/g, " "));
    await page.click('.dialog .seg-ctl button:text("Mois")');
    await page.waitForTimeout(100);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/12-heures.png` });
    await page.click('.dialog footer >> text=Fermer');
    await page.click('.side [data-screen="month"]');
    await page.waitForSelector("text=Heures du mois");
    const row = await page.textContent('tr:has(button:text-is("Fleur"))');
    check("mois : heures sup, retards et total de Fleur", /\+1 h 30/.test(row) && /−0 h 15/.test(row), row.replace(/\s+/g, " "));
    await page.click('.side [data-screen="week"]');

    // accès aux 2 mois précédents
    await page.click('.side [data-screen="dashboard"]');
    await page.waitForSelector("text=Les 2 derniers mois");
    await page.click(".card:has-text('Les 2 derniers mois') button:has-text('septembre 2026')");
    await page.waitForSelector('h1:has-text("septembre 2026")');
    check("septembre : planning et heures affichés", !(await page.isVisible("text=Aucun planning enregistré pour septembre 2026")) && (await page.isVisible("text=Heures du mois")));
    const chips = await page.$$eval(".content > .stack > .row:first-child button", (b) => b.map((x) => x.textContent));
    check("accès direct aux 2 mois précédents", chips.join("|") === "Ce mois-ci|septembre 2026|août 2026", chips.join("|"));
    await page.click('.side [data-screen="week"]');

    // semaine du 26/10 : planning papier ajouté automatiquement
    await page.click('button[aria-label="Semaine suivante"]');
    await page.waitForSelector('td.cell[aria-label^="Lucas, Mercredi 28"]');
    const w2 = await page.evaluate(() => { const w = PlanningApp.state.weeks["2026-10-26"]; return { n: w.shifts.length, min: w.shifts.reduce((a, x) => a + PlanningCore.shiftMinutes(x.segs), 0), err: PlanningCore.validateWeek(PlanningApp.state, "2026-10-26").filter((i) => i.level === "erreur").length }; });
    check("semaine du 26/10 ajoutée : 338 h (366 h − 28 h de Lydia), aucune erreur", w2.min === 338 * 60 && w2.err === 0, JSON.stringify(w2));
    // cours : Camilian et Fleur ne peuvent pas être placés le 12 et le 13 novembre
    await page.click('button[aria-label="Semaine suivante"]');
    await page.click('button[aria-label="Semaine suivante"]');
    await page.waitForSelector("text=Aucun horaire pour cette semaine.");
    await page.click(".empty >> text=Générer à partir du modèle");
    await page.click("text=Préparer la proposition");
    await page.waitForSelector("text=Proposition de planning");
    const notPlaced = await page.textContent(".dialog");
    check("génération : 4 postes non attribués (CFA les 12-13 nov.)", /4 poste\(s\) non attribué/.test(notPlaced) && (notPlaced.match(/(formation|cours) au CFA/g) || []).length === 4);
    await page.click(".dialog footer >> text=/Enregistrer 1 semaine/");
    await page.waitForSelector("text=Postes à pourvoir");
    const coursTags = await page.$$eval('tr:has(td.name b:text-is("Fleur")) td', (tds) => tds.filter((t) => t.querySelector(".tag-cours:not(.pause)")).length);
    const pauseTags = await page.$$eval('tr:has(td.name b:text-is("Fleur")) td', (tds) => tds.map((t) => [...t.querySelectorAll(".seg-cours > span:first-child")].map((e) => e.textContent).join("|")).filter(Boolean));
    check("Fleur affichée en cours jeudi et vendredi", coursTags === 2, String(coursTags));
    check("cours affichés en blocs, sans le midi", pauseTags.length === 2 && pauseTags.every((t) => /^\d\d:\d\d–12:30\|13:30–\d\d:\d\d$/.test(t)), pauseTags.join(","));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/3-generation.png`, fullPage: true });

    // tentative interdite : placer Fleur le 29
    await page.click('td.cell[aria-label^="Fleur, Jeudi 12"]');
    await page.waitForSelector(".dialog");
    await page.click("text=Ajouter un horaire");
    await page.waitForTimeout(100);
    const saveDisabled = await page.$eval(".dialog footer button.primary", (b) => b.disabled);
    const why = await page.textContent("#ed-check");
    check("pendant les cours : enregistrement bloqué avec explication", saveDisabled && /formation|cours au CFA/.test(why), why.slice(0, 80));
    await page.keyboard.press("Escape");

    // absence ajoutée après coup
    await page.click('.side [data-screen="absences"]');
    await page.selectOption("#abs-emp", "eric");
    await page.selectOption("#abs-type", "arret");
    await page.fill("#abs-from", "2026-11-10"); await page.fill("#abs-to", "2026-11-11");
    await page.click("text=Enregistrer l'absence");
    await page.waitForSelector("text=Créneaux déjà planifiés pendant cette absence");
    const imp = await page.$$eval(".dialog .item", (x) => x.length);
    check("absence : 2 créneaux concernés listés, rien modifié en silence", imp === 2, String(imp));
    await page.click(".dialog .item >> nth=0 >> text=Libérer le créneau");
    await page.waitForTimeout(150);
    await page.click(".dialog footer >> text=Plus tard");

    // annulation
    const before = await page.evaluate(() => PlanningApp.state.weeks["2026-11-09"].shifts.length);
    await page.click("#undo-btn");
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => PlanningApp.state.weeks["2026-11-09"].shifts.length);
    check("annuler la dernière modification", after === before + 1, `${before} → ${after}`);

    // rafraîchir
    await page.click("#refresh-btn");
    await page.waitForSelector("text=/Planning actualisé à/");
    const persisted = await page.evaluate(() => PlanningApp.state.weeks["2026-11-09"].shifts.length);
    check("bouton actualiser : données relues depuis le stockage", persisted === after);

    // ajout d'un employé
    await page.click('.side [data-screen="team"]');
    await page.fill("#team-name", "Inès");
    await page.click('label.check:has-text("Zone publique") input');
    await page.click("text=Ajouter >> nth=-1");
    await page.waitForTimeout(150);
    await page.click('.side [data-screen="week"]');
    check("nouvel employé : une ligne de plus dans le planning", await page.isVisible('td.name b:text-is("Inès")'));

    // bouton de téléchargement à côté du titre
    await page.click('.side [data-screen="week"]');
    { const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dl-week")]); check("bouton ⬇︎ de la semaine : PDF", /^planning-semaine-.*\.pdf$/.test(dl.suggestedFilename()), dl.suggestedFilename()); }
    await page.click('.side [data-screen="month"]');
    await page.click('button:text-is("Ce mois-ci")');
    { const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dl-month")]); const p = await dl.path(); check("bouton ⬇︎ du mois : PDF", dl.suggestedFilename() === "planning-2026-10.pdf" && require("fs").statSync(p).size > 2000, dl.suggestedFilename()); }

    // exports
    await page.click('.side [data-screen="export"]');
    for (const [label, ext] of [["Télécharger le PDF", "pdf"], ["Télécharger le fichier Excel", "xlsx"], ["Télécharger le CSV", "csv"]]) {
      const [dl] = await Promise.all([page.waitForEvent("download"), page.click(`text=${label}`)]);
      const p = await dl.path(); const size = require("fs").statSync(p).size;
      check(`export ${ext}`, dl.suggestedFilename().endsWith(ext) && size > 500, `${dl.suggestedFilename()} ${size} o`);
      if (SHOTS) require("fs").copyFileSync(p, `${SHOTS}/export.${ext}`);
    }

    // autres écrans sans erreur
    for (const sc of ["dashboard", "month", "alternants", "zones", "history", "import"]) { await page.click(`.side [data-screen="${sc}"]`); await page.waitForTimeout(100); }
    check("tous les écrans s'affichent", true);
    if (SHOTS) { await page.click('.side [data-screen="dashboard"]'); await page.screenshot({ path: `${SHOTS}/4-dashboard.png` }); await page.click('.side [data-screen="alternants"]'); await page.screenshot({ path: `${SHOTS}/5-alternants.png` }); }

    // mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('.tabbar [data-screen="week"]');
    await page.waitForTimeout(100);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    check("mobile : pas de défilement horizontal de la page", scrollW <= 390, String(scrollW));
    // menu ☰ → Heures par personne
    await page.click('.tabbar [data-screen="more"]');
    await page.click('.dialog .nav:has-text("Heures par personne")');
    await page.waitForSelector('h1:has-text("2026")');
    const hw = await page.textContent('tr:has(button:text-is("Fleur"))');
    await page.click('.seg-ctl button:text("Mois")');
    await page.waitForTimeout(100);
    const hm = await page.textContent('tr:has(button:text-is("Fleur"))');
    check("menu ☰ : heures par personne, semaine et mois", /h/.test(hw) && /h/.test(hm) && hw !== hm, `${hw.replace(/\s+/g, " ")} | ${hm.replace(/\s+/g, " ")}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/13-heures-mobile.png` });
    await page.click('.tabbar [data-screen="week"]');
    await page.click('.seg-ctl button:text("Jour")');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/6-mobile-jour.png` });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.click('.seg-ctl button:text("Semaine")');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/7-mobile-sombre.png` });
    await ctx.close();
  }

  // ---------------- 2. Environnement Claude simulé ----------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await fixClock(ctx);
    await ctx.addInitScript(MOCK);
    const page = await ctx.newPage(); watch(page);
    await page.goto(FILE);
    await page.waitForSelector("table.plan");
    check("db : mode base de données partagée", await page.evaluate(() => PlanningStore.mode) === "db");
    const docs = await page.evaluate(() => [...window.__mockStore.keys()].sort());
    check("db : config, semaine et historique écrits", docs.includes("config/employees") && docs.includes("weeks/2026-10-19") && docs.some((k) => k.startsWith("history/")), docs.length + " documents");
    // rechargement : les données reviennent de la base
    const n1 = await page.evaluate(async () => { await PlanningApp.refresh(); return PlanningApp.state.weeks["2026-10-19"].shifts.length; });
    check("db : relecture après actualisation", n1 === 50);

    await page.click("text=Assistant");
    await page.waitForSelector("#ai-input:not([disabled])");
    await page.fill("#ai-input", "Qui travaille en zone réservée samedi ?");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".msg.assistant >> text=/En zone réservée samedi/");
    const ans = await page.textContent(".msg.assistant >> nth=-1");
    check("IA : lecture via outil (qui_travaille)", /Fleur/.test(ans) && /Murielle/.test(ans) && /Reine Claude/.test(ans) && /Sebastien/.test(ans), ans);

    await page.fill("#ai-input", "Mets Fleur de 14 h à 21 h mardi prochain");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".proposal");
    const notYet = await page.evaluate(() => !PlanningApp.state.weeks["2026-10-19"].shifts.some((x) => x.emp === "fleur" && x.date === "2026-10-20"));
    check("IA : proposition affichée, rien appliqué avant confirmation", notYet);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/8-assistant.png` });
    await page.click(".proposal >> text=Appliquer");
    await page.waitForSelector("text=/Appliqué :/");
    const applied = await page.evaluate(() => PlanningApp.state.weeks["2026-10-19"].shifts.find((x) => x.emp === "fleur" && x.date === "2026-10-20"));
    check("IA : modification appliquée après clic", applied && applied.segs[0].s === "14:00" && applied.segs[0].z === "ZR");
    const hist = await page.evaluate(() => PlanningApp.history[0].source);
    check("IA : historisée comme « assistant IA »", hist === "assistant IA");

    await page.fill("#ai-input", "Mets Fleur jeudi 29 de 14 h à 21 h");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".msg.assistant >> text=/Impossible/");
    const refused = await page.textContent(".msg.assistant >> nth=-1");
    check("IA : contrainte des cours non contournable", /formation|cours au CFA/.test(refused), refused.slice(0, 100));
    const calls = await page.evaluate(() => window.__aiCalls);
    check("IA : outils fournis au modèle", calls[0].tools.includes("proposer_modifications") && calls[0].tools.length >= 6, calls[0].tools.join(","));
    const chat = await page.evaluate(() => window.__mockStore.get("data/users/user-test/chat"));
    check("IA : conversation enregistrée en privé", chat && chat.messages.length >= 4);
    await ctx.close();
  }

  // ---------------- 3. Appli téléphone (docs/planning, données chiffrées) ----------------
  {
    const http = require("http"), fs = require("fs");
    const root = path.join(__dirname, "..", "..", "docs", "planning");
    const types = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json" };
    const srv = http.createServer((q, r) => { const f = path.join(root, q.url === "/" ? "index.html" : q.url.split("?")[0]); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); }).listen(0);
    const url = `http://localhost:${srv.address().port}/`;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await fixClock(ctx);
    const page = await ctx.newPage(); watch(page);
    await page.goto(url);
    check("appli téléphone : pas de code demandé", !(await page.$("#unlock-code")));
    await page.waitForSelector(".daybar");
    check("appli téléphone : import puis planning du jour", await page.isVisible(".shift-row"));
    await page.reload();
    await page.waitForSelector(".daybar");
    check("appli téléphone : données gardées après rechargement", await page.isVisible(".shift-row"));
    // Données importées avant l'ajout des règles : elles doivent les recevoir à l'ouverture
    await page.evaluate(() => { const k = "planning-equipe:config/employees"; const v = JSON.parse(localStorage.getItem(k)); for (const e of v) { delete e.rules; delete e.rulesApplied; } localStorage.setItem(k, JSON.stringify(v)); });
    await page.reload();
    await page.waitForSelector(".daybar");
    await page.waitForTimeout(300);
    const rules = await page.evaluate(() => { const e = (id) => PlanningApp.state.employees.find((x) => x.id === id); return { seb: e("sebastien").rules, eric: e("eric").rules, nat: e("nathalie").rules }; });
    check("règles ajoutées aux données déjà sur le téléphone", rules.seb && rules.seb.fixedHours.s === "07:00" && rules.eric.daysOff.join() === "5,6" && rules.eric.fixedHours.s === "07:00" && rules.nat.fixedHours.e === "13:30" && rules.nat.daysOff.join() === "5,6", JSON.stringify(rules).slice(0, 120));
    await page.evaluate(() => PlanningApp.go("team"));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/11-regles.png`, fullPage: true });
    // Données d'un téléphone qui avait encore Lydia (avant qu'elle soit retirée) : elle doit disparaître partout
    await page.evaluate(() => {
      const k = "planning-equipe:config/employees"; const v = JSON.parse(localStorage.getItem(k));
      v.push({ id: "lydia", name: "Lydia", role: "salarie", zones: { ZP: "confirme" }, active: false, leftOn: "2026-10-23" }); localStorage.setItem(k, JSON.stringify(v));
      const wk = "planning-equipe:weeks/2026-10-19"; const w = JSON.parse(localStorage.getItem(wk));
      w.shifts.push({ id: "x1", emp: "lydia", date: "2026-10-22", segs: [{ s: "05:30", e: "11:00", z: "ZP" }, { s: "11:30", e: "13:00", z: "ZP" }] });
      w.vacated = [{ date: "2026-10-23", emp: "lydia", segs: [{ s: "05:30", e: "13:00", z: "ZP" }], reason: "départ de Lydia" }]; localStorage.setItem(wk, JSON.stringify(w));
      const sk = "planning-equipe:config/settings"; const st = JSON.parse(localStorage.getItem(sk)); st.appliedUpdates = st.appliedUpdates.filter((x) => x !== "patronne-lydia"); localStorage.setItem(sk, JSON.stringify(st));
    });
    await page.reload(); await page.waitForFunction(() => window.PlanningApp && PlanningApp.ready); await page.waitForTimeout(400);
    const ly = await page.evaluate(() => { const st = PlanningApp.state; return { emp: !!st.employees.find((e) => e.id === "lydia"), sonia: (st.employees.find((e) => e.id === "sonia") || { active: false }).active !== false, shifts: Object.values(st.weeks).flatMap((w) => w.shifts).filter((x) => x.emp === "lydia").length, vac: Object.values(st.weeks).flatMap((w) => w.vacated || []).filter((x) => x.emp === "lydia").length, tpl: st.template.shifts.filter((t) => t.emp === "lydia").length, err: ["2026-10-19", "2026-10-26"].map((m) => PlanningCore.validateWeek(st, m).filter((i) => i.level === "erreur" || i.code === "UNCOVERED").length) }; });
    check("Lydia (patronne) retirée partout, Sonia et Sylvie supprimées, aucun poste à pourvoir à sa place", !ly.emp && !ly.sonia && !ly.shifts && !ly.vac && !ly.tpl && ly.err.join() === "0,0", JSON.stringify(ly));
    const am = await page.evaluate(() => { const st = PlanningApp.state; const a = st.employees.find((e) => e.id === "amandine"); return { sophie: !!st.employees.find((e) => e.id === "sophie"), leave: a && a.onLeave && a.onLeave.since, avail: PlanningCore.availability(st, "amandine", "2026-11-04", []).ok, tag: PlanningCore.weekGrid(st, "2026-10-26").rows.find((r) => r.emp.id === "amandine").cells[0].absences.length }; });
    check("Sophie partie (gardée pour l'historique) ; Amandine en vacances (jamais planifiée)", am.sophie && am.leave === "2026-09-30" && am.avail === false && am.tag === 1, JSON.stringify(am));
    await page.evaluate(() => PlanningApp.go("absences"));
    await page.waitForSelector("text=En congé, retour non renseigné");
    await page.fill('input[aria-label="Date de retour de Amandine"]', "2026-11-09");
    await page.click("text=Enregistrer le retour");
    await page.waitForTimeout(300);
    const back = await page.evaluate(() => { const st = PlanningApp.state; return { leave: st.employees.find((e) => e.id === "amandine").onLeave, abs: Object.values(st.absences).filter((a) => a.emp === "amandine" && a.type === "vacances").map((a) => a.from + ">" + a.to), ok: PlanningCore.availability(st, "amandine", "2026-11-09", []).block.length }; });
    check("retour d'Amandine : congé du 30/09 au 08/11, disponible le 09/11", !back.leave && back.abs.join() === "2026-09-30>2026-11-08" && back.ok === 0, JSON.stringify(back));
    const conf = await page.evaluate(() => { const st = PlanningApp.state; return { rules: st.settings.rulesConfirmed, day: st.settings.maxDayHours, week: st.settings.maxWeekHours, pause: st.settings.minPauseMinutes, uncertain: st.employees.filter((e) => Object.values(e.zones || {}).some((v) => v !== "confirme")).length, doubts: Object.values(st.weeks).flatMap((w) => w.shifts).filter((x) => x.segs.some((g) => g.doute)).length }; });
    check("informations confirmées (35 h, 7 h + 30 min, zones, couleurs)", conf.rules && conf.day === 7 && conf.week === 35 && conf.pause === 30 && conf.uncertain === 0 && conf.doubts === 0, JSON.stringify(conf));
    const man = await page.evaluate(async () => (await fetch("manifest.webmanifest")).json());
    check("appli téléphone : manifeste installable", man.display === "standalone" && man.icons.length === 2);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/10-pwa.png` });
    await ctx.close(); srv.close();
  }

  check("aucune erreur JavaScript", errors.length === 0, errors.slice(0, 3).join(" | "));
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} vérifications réussies`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
