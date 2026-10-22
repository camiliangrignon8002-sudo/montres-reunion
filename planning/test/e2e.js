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
    await page.waitForSelector("text=Calendriers analysés");
    check("premier lancement : écran d'import avec résumé", await page.isVisible("text=Points incertains à vérifier"));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-import.png`, fullPage: false });
    await page.click("text=Importer ces données");
    await page.waitForSelector("table.plan");
    const cells = await page.$$eval("table.plan td.cell .blk", (b) => b.length);
    check("semaine du 19/10 importée : 102 blocs (51 journées, Lydia retirée le 23/10)", cells === 102, String(cells));
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
    await page.fill("#aj-date", "2026-10-22"); await page.fill("#aj-dur", "0:15");
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
    await page.waitForSelector("text=Aucun planning enregistré pour septembre 2026");
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
    check("génération : 6 postes non attribués (4 CFA les 12-13 nov. + 2 de Lydia)", /6 poste\(s\) non attribué/.test(notPlaced) && (notPlaced.match(/formation au CFA/g) || []).length === 4 && (notPlaced.match(/employé désactivé/g) || []).length === 2);
    await page.click(".dialog footer >> text=/Enregistrer 1 semaine/");
    await page.waitForSelector("text=Postes à pourvoir");
    const coursTags = await page.$$eval('tr:has(td.name b:text-is("Fleur")) .tag-cours', (x) => x.length);
    check("Fleur affichée en cours jeudi et vendredi", coursTags === 2, String(coursTags));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/3-generation.png`, fullPage: true });

    // tentative interdite : placer Fleur le 29
    await page.click('td.cell[aria-label^="Fleur, Jeudi 12"]');
    await page.waitForSelector(".dialog");
    await page.click("text=Ajouter un horaire");
    await page.waitForTimeout(100);
    const saveDisabled = await page.$eval(".dialog footer button.primary", (b) => b.disabled);
    const why = await page.textContent("#ed-check");
    check("pendant les cours : enregistrement bloqué avec explication", saveDisabled && /formation/.test(why), why.slice(0, 80));
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
    await page.waitForSelector("text=Importer ces données");
    check("db : mode base de données partagée", await page.evaluate(() => PlanningStore.mode) === "db");
    await page.click("text=Importer ces données");
    await page.waitForSelector("table.plan");
    const docs = await page.evaluate(() => [...window.__mockStore.keys()].sort());
    check("db : config, semaine et historique écrits", docs.includes("config/employees") && docs.includes("weeks/2026-10-19") && docs.some((k) => k.startsWith("history/")), docs.length + " documents");
    // rechargement : les données reviennent de la base
    const n1 = await page.evaluate(async () => { await PlanningApp.refresh(); return PlanningApp.state.weeks["2026-10-19"].shifts.length; });
    check("db : relecture après actualisation", n1 === 51);

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
    check("IA : contrainte des cours non contournable", /formation/.test(refused), refused.slice(0, 100));
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
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/9-pwa-import.png` });
    await page.waitForSelector("text=Importer ces données");
    await page.click("text=Importer ces données");
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
    const team = await page.evaluate(() => { const st = PlanningApp.state; const ly = st.employees.find((e) => e.id === "lydia"); return { sonia: !!st.employees.find((e) => e.id === "sonia"), sylvie: !!st.employees.find((e) => e.id === "sylvie"), lydiaActive: ly && ly.active, lydiaAfter: Object.values(st.weeks).flatMap((w) => w.shifts).filter((x) => x.emp === "lydia" && x.date >= "2026-10-23").length, lydiaBefore: Object.values(st.weeks).flatMap((w) => w.shifts).filter((x) => x.emp === "lydia" && x.date < "2026-10-23").length }; });
    check("Sonia et Sylvie supprimées, Lydia retirée à partir du 23/10", !team.sonia && !team.sylvie && team.lydiaActive === false && team.lydiaAfter === 0 && team.lydiaBefore === 1, JSON.stringify(team));
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
