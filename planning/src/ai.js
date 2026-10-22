// Assistant IA : Claude, appelé via la capacité « sample » de l'artifact (compte Claude de la personne,
// aucune clé API dans la page). Claude lit les données par des outils et ne modifie jamais rien
// lui-même : il prépare une proposition que la personne applique d'un clic.
(function (root) {
  "use strict";
  const C = root.PlanningCore;

  const AI = {
    sample: null, toolsOk: false, imagesOk: false, status: "verification", error: "",

    async init() {
      const claude = root.claude;
      if (!claude || typeof claude.use !== "function") { this.status = "absent"; return; }
      this.sample = await claude.use("sample").catch(() => null);
      if (!this.sample) { this.status = "absent"; return; }
      const lim = await this.sample.limits().catch(() => null);
      this.toolsOk = !!(lim && lim.tools);
      this.imagesOk = !!(lim && lim.images);
      this.status = this.toolsOk ? "pret" : "sans-outils";
    },

    errorText(e) {
      const code = e && e.code;
      return ({
        not_granted: "Vous avez refusé l'accès à Claude pour cette page. Rechargez la page pour qu'on vous le redemande.",
        rate_limited: "Trop de demandes d'un coup ou limite d'utilisation atteinte. Réessayez dans un moment.",
        sampling_disabled: "L'assistant est désactivé pour votre compte ou votre organisation.",
        prompt_too_large: "La demande est trop longue. Raccourcissez-la ou effacez la conversation.",
        cancelled: "Demande arrêtée.",
        tools_unavailable: "Cette version de l'application Claude ne permet pas encore à l'assistant d'utiliser les outils du planning.",
        images_unavailable: "La lecture d'images n'est pas disponible ici.",
        invalid_json: "La réponse n'a pas pu être lue. Réessayez.",
      })[code] || "L'assistant ne répond pas pour le moment (problème réseau ou service indisponible). Réessayez dans un instant.";
    },

    // ---------- Données transmises à Claude : prénoms, rôles, zones, horaires, absences (sans notes) ----------
    context(App) {
      const s = App.state, today = App.today();
      const days = Array.from({ length: 21 }, (_, i) => C.addDays(today, i - 3)).map((d) => `${d} = ${C.DAYS[C.dow(d)].toLowerCase()}${d === today ? " (aujourd'hui)" : ""}`);
      const team = s.employees.map((e) => `- ${e.name} [id ${e.id}]${e.role === "alternant" ? " alternant(e)" : ""}${e.active === false ? " DÉSACTIVÉ(E)" : ""} · zones : ${Object.entries(e.zones || {}).map(([z, lv]) => z + (lv === "incertain" ? " (à confirmer)" : "")).join(", ") || "aucune définie"}${(e.aliases || []).length ? ` · aussi appelé(e) ${e.aliases.join(", ")}` : ""}${e.rules && e.rules.fixedHours ? ` · toujours ${e.rules.fixedHours.s}-${e.rules.fixedHours.e}` : ""}${e.rules && e.rules.daysOff ? ` · jamais le ${e.rules.daysOff.map((d) => C.DAYS[d].toLowerCase()).join(", ")}` : ""}${e.rules && e.rules.note ? ` · consigne : ${e.rules.note}` : ""}`);
      return [
        "Tu es l'assistant de l'application « Planning équipe » d'un commerce en zone aéroportuaire. Tu parles français, simplement, en phrases courtes.",
        `Repères de dates (AAAA-MM-JJ) :\n${days.join("\n")}`,
        `Semaine affichée à l'écran : lundi ${App.ui.monday}.`,
        `Zones : ${s.zones.map((z) => `${z.id} = ${z.name}`).join(" ; ")}.`,
        `Équipe :\n${team.join("\n")}`,
        "Règles impératives :",
        "1. Pour lire le planning, les absences ou les disponibilités, utilise les outils. N'invente jamais un horaire, une personne ou une règle.",
        "2. Pour toute modification, appelle « proposer_modifications ». Tu ne peux rien appliquer toi-même : la personne voit la proposition et clique sur « Appliquer ». Ne dis jamais que c'est fait ; dis que la proposition est prête à être validée.",
        "3. Si la demande est ambiguë (personne, date, horaire ou zone incertains), pose une seule question courte au lieu de deviner.",
        "4. Ne contourne jamais une contrainte (zone non autorisée, cours au CFA, absence, chevauchement). Si c'est impossible, explique pourquoi et propose 2 ou 3 solutions concrètes (par exemple avec « chercher_remplacants »).",
        "5. Un jour sans information dans le calendrier d'alternance n'est pas un jour disponible.",
        "6. Si une proposition renvoie des alertes, résume-les en une ligne chacune.",
        "7. Réponds sans titres ni tableaux Markdown ; des listes courtes sont permises.",
      ].join("\n\n");
    },

    tools(App) {
      const s = () => App.state;
      const fmtShift = (sh) => sh.segs.map((g) => `${g.s}-${g.e} ${g.z}`).join(", ");
      const mondayArg = (v) => { const d = String(v || App.ui.monday); if (!C.isISO(d)) throw new Error("Date invalide, format AAAA-MM-JJ attendu."); return C.mondayOf(d); };
      const empArg = (v) => { const f = C.findEmployee(s(), v); if (f.emp) return f.emp; throw new Error(f.matches.length ? `Plusieurs personnes correspondent à « ${v} » : ${f.matches.map((e) => e.name).join(", ")}.` : `Personne inconnue : « ${v} ».`); };
      const translate = (op) => {
        const t = op.type || op.action;
        const segs = (op.segments || []).map((g) => ({ s: g.debut, e: g.fin, z: g.zone }));
        switch (t) {
          case "definir_creneau": return { type: "setShift", emp: op.prenom, date: op.date, segs, note: op.note };
          case "supprimer_creneau": return { type: "removeShift", emp: op.prenom, date: op.date };
          case "deplacer_creneau": return { type: "moveShift", emp: op.prenom, date: op.date, toEmp: op.vers_prenom, toDate: op.vers_date, swap: !!op.echanger };
          case "copier_jour": return { type: "copyDay", from: op.du, to: op.vers, replace: !!op.remplacer };
          case "dupliquer_semaine": return { type: "duplicateWeek", from: op.de, to: op.vers, replace: !!op.remplacer };
          case "ajouter_absence": return { type: "addAbsence", absence: { emp: op.prenom === "*" ? "*" : op.prenom, type: op.type_absence || op.genre || "conges", from: op.du, to: op.au || op.du, note: op.note } };
          case "supprimer_absence": return { type: "removeAbsence", id: op.id };
          case "ajouter_employe": return { type: "addEmployee", employee: { name: op.prenom, role: op.role, zonesList: op.zones || [] } };
          case "modifier_zones": return { type: "setZones", emp: op.prenom, zones: Object.fromEntries((op.zones || []).map((z) => [String(z).toUpperCase(), "confirme"])) };
          case "valider_semaine": return { type: "setWeekStatus", monday: op.semaine, status: "validé", acknowledge: true };
          case "generer_semaine": {
            const monday = C.mondayOf(op.semaine);
            const g = C.generateWeek(App.state, monday, { now: new Date().toISOString() });
            return { type: "putWeek", monday, week: g.week, _report: g.report };
          }
          default: throw new Error(`Type d'opération inconnu : ${t}`);
        }
      };
      return [
        {
          name: "lire_planning",
          description: "Renvoie les horaires d'une semaine (lundi au dimanche) : pour chaque personne et chaque jour, les blocs horaires avec leur zone, plus les postes du modèle non pourvus et le statut (brouillon/validé). Paramètre : n'importe quelle date de la semaine.",
          inputSchema: { type: "object", properties: { semaine: { type: "string", description: "date AAAA-MM-JJ dans la semaine voulue" } } },
          execute: (i) => {
            const m = mondayArg(i.semaine); const w = C.getWeek(s(), m);
            if (!w || !w.shifts.length) return { semaine: m, statut: "vide", message: "Aucun horaire enregistré pour cette semaine." };
            const rows = {};
            for (const sh of [...w.shifts].sort((a, b) => a.date.localeCompare(b.date))) { const n = (C.empById(s(), sh.emp) || { name: sh.emp }).name; (rows[n] = rows[n] || {})[sh.date] = fmtShift(sh); }
            return { semaine: m, statut: w.status, horaires: rows, postes_non_pourvus: C.uncoveredPosts(s(), m).map((u) => ({ date: u.date, horaire: C.segLabel(u.segs), zones: u.segs.map((g) => g.z).join("/"), habituellement: (C.empById(s(), u.templateEmp) || {}).name, raison: u.reason })) };
          },
        },
        {
          name: "qui_travaille",
          description: "Liste les personnes qui travaillent à une date, avec leurs horaires et zones ; filtre facultatif par zone (ZP, ZR).",
          inputSchema: { type: "object", properties: { date: { type: "string" }, zone: { type: "string" } }, required: ["date"] },
          execute: (i) => {
            const d = String(i.date); if (!C.isISO(d)) throw new Error("Date invalide.");
            const w = C.getWeek(s(), C.mondayOf(d));
            const z = i.zone ? String(i.zone).toUpperCase() : null;
            const list = (w ? w.shifts : []).filter((sh) => sh.date === d && (!z || sh.segs.some((g) => g.z === z)));
            return { date: d, personnes: list.map((sh) => ({ prenom: (C.empById(s(), sh.emp) || {}).name, horaires: fmtShift(sh) })), remarque: w ? undefined : "Aucun planning enregistré pour cette semaine." };
          },
        },
        {
          name: "disponibilites",
          description: "Pour une date, indique pour chaque personne : travaille déjà, absente (type), en cours au CFA, statut d'alternance inconnu, ou libre ; avec ses zones autorisées.",
          inputSchema: { type: "object", properties: { date: { type: "string" } }, required: ["date"] },
          execute: (i) => {
            const d = String(i.date); if (!C.isISO(d)) throw new Error("Date invalide.");
            const w = C.getWeek(s(), C.mondayOf(d));
            return s().employees.filter((e) => e.active !== false).map((e) => {
              const sh = w && w.shifts.find((x) => x.emp === e.id && x.date === d);
              const ab = C.absencesOn(s(), e.id, d)[0]; const cs = C.calStatus(s(), e, d);
              return { prenom: e.name, zones: Object.keys(e.zones || {}).join(",") || "aucune", etat: sh ? `travaille ${fmtShift(sh)}` : ab ? `absent(e) : ${C.ABSENCE_TYPES[ab.type]}` : cs === "formation" ? "en cours au CFA" : cs === "inconnu" ? "statut d'alternance inconnu" : "libre" };
            });
          },
        },
        {
          name: "lire_absences",
          description: "Liste les congés, absences, jours de cours ajoutés et indisponibilités entre deux dates (identifiants inclus, pour pouvoir en supprimer une).",
          inputSchema: { type: "object", properties: { du: { type: "string" }, au: { type: "string" } }, required: ["du", "au"] },
          execute: (i) => Object.values(s().absences || {}).filter((a) => a.to >= i.du && a.from <= i.au).map((a) => ({ id: a.id, prenom: a.emp === "*" ? "toute l'équipe" : (C.empById(s(), a.emp) || {}).name, type: C.ABSENCE_TYPES[a.type], du: a.from, au: a.to })),
        },
        {
          name: "verifier_semaine",
          description: "Vérifie une semaine et renvoie les erreurs (bloquantes) et alertes : zones, cours des alternants, absences, chevauchements, repos, durées, postes non pourvus.",
          inputSchema: { type: "object", properties: { semaine: { type: "string" } } },
          execute: (i) => { const m = mondayArg(i.semaine); const iss = C.validateWeek(s(), m); return { semaine: m, erreurs: iss.filter((x) => x.level === "erreur").map((x) => x.msg), alertes: iss.filter((x) => x.level === "alerte").map((x) => x.msg).slice(0, 30) }; },
        },
        {
          name: "chercher_remplacants",
          description: "Cherche qui peut prendre un créneau à une date, en respectant zones, cours, absences, repos et durée hebdomadaire. Donner soit le prénom de la personne à remplacer (son créneau de ce jour est repris), soit les segments.",
          inputSchema: { type: "object", properties: { date: { type: "string" }, prenom_a_remplacer: { type: "string" }, segments: { type: "array", items: { type: "object", properties: { debut: { type: "string" }, fin: { type: "string" }, zone: { type: "string" } } } } }, required: ["date"] },
          execute: (i) => {
            const d = String(i.date); if (!C.isISO(d)) throw new Error("Date invalide.");
            let segs = (i.segments || []).map((g) => ({ s: C.normTime(g.debut), e: C.normTime(g.fin), z: String(g.zone || "").toUpperCase() }));
            const ex = [];
            if (i.prenom_a_remplacer) {
              const e = empArg(i.prenom_a_remplacer); ex.push(e.id);
              const w = C.getWeek(s(), C.mondayOf(d)); const sh = w && w.shifts.find((x) => x.emp === e.id && x.date === d);
              const tpl = C.templateFor(s(), d).find((t) => t.emp === e.id);
              if (!segs.length) segs = sh ? sh.segs : tpl ? tpl.segs.map(({ s: a, e: b, z }) => ({ s: a, e: b, z })) : [];
            }
            if (!segs.length || segs.some((g) => !g.s || !g.e || !g.z)) throw new Error("Créneau inconnu : précisez les horaires et la zone.");
            const c = C.findCandidates(s(), d, segs, { exclude: ex });
            return { creneau: segs.map((g) => `${g.s}-${g.e} ${g.z}`).join(", "), candidats: c.slice(0, 6).map((x) => ({ prenom: x.name, heures_semaine: C.fmtHours(x.weekMinutes), heures_modele: C.fmtHours(x.refMinutes), remarques: x.notes })), remarque: c.length ? undefined : "Personne ne peut prendre ce créneau sans enfreindre une contrainte (zones autorisées, cours, absences, repos ou durée)." };
          },
        },
        {
          name: "proposer_modifications",
          description: "Prépare des modifications SANS les appliquer : elles sont vérifiées puis montrées à la personne, qui clique sur « Appliquer ». Renvoie ok, erreurs (bloquantes) ou alertes. Types d'opérations : definir_creneau {prenom,date,segments:[{debut,fin,zone}]} (remplace le créneau du jour), supprimer_creneau {prenom,date}, deplacer_creneau {prenom,date,vers_prenom?,vers_date?,echanger?}, copier_jour {du,vers,remplacer?}, dupliquer_semaine {de,vers}, ajouter_absence {prenom ou \"*\",type_absence: conges|vacances|repos|arret|cours|indispo|fermeture,du,au,note?}, supprimer_absence {id}, ajouter_employe {prenom,role: salarie|alternant,zones:[ZP|ZR]}, modifier_zones {prenom,zones:[...]}, generer_semaine {semaine}, valider_semaine {semaine}, annuler_derniere {}.",
          inputSchema: {
            type: "object",
            properties: {
              resume: { type: "string", description: "une phrase qui décrit le changement pour la personne" },
              operations: { type: "array", items: { type: "object", properties: { type: { type: "string" } }, required: ["type"] } },
            },
            required: ["resume", "operations"],
          },
          execute: (i) => {
            const raw = Array.isArray(i.operations) ? i.operations : [];
            if (!raw.length) throw new Error("Aucune opération.");
            if (raw.some((o) => (o.type || o.action) === "annuler_derniere")) {
              const u = App.describeUndo();
              if (!u) return { ok: false, erreurs: ["Rien à annuler."] };
              App.showProposal({ kind: "undo", summary: `Annuler : ${u.summary}`, source: "assistant IA" });
              return { ok: true, proposition: `Annulation de « ${u.summary} » prête : la personne doit cliquer sur Appliquer.` };
            }
            let ops;
            try { ops = raw.map(translate); } catch (e) { return { ok: false, erreurs: [e.message] }; }
            const r = C.applyOps(App.state, ops.map(({ _report, ...o }) => o), { now: new Date().toISOString(), by: App.userId() });
            if (!r.ok) return { ok: false, erreurs: r.errors };
            const report = ops.find((o) => o._report);
            // Seulement les alertes liées aux créneaux modifiés (pas toute la semaine).
            const touched = new Set();
            for (const c of r.changes) if (c.col === "weeks") {
              const before = new Map(((c.before && c.before.shifts) || []).map((x) => [x.emp + "|" + x.date, C.segKey(x.segs)]));
              for (const x of (c.after && c.after.shifts) || []) if (before.get(x.emp + "|" + x.date) !== C.segKey(x.segs)) touched.add(x.emp + "|" + x.date);
            }
            const alerts = r.issues.filter((x) => x.level === "alerte" && (touched.has(x.emp + "|" + x.date) || (!x.date && [...touched].some((k) => k.startsWith(x.emp + "|"))))).map((x) => x.msg);
            App.showProposal({ kind: "ops", ops: ops.map(({ _report, ...o }) => o), summary: String(i.resume || "Modification du planning").slice(0, 300), source: "assistant IA", alerts, impacts: r.impacts, messages: r.messages, report: report && report._report, changes: r.changes });
            return { ok: true, proposition: "Prête : la personne doit cliquer sur Appliquer.", alertes: alerts.slice(0, 15), creneaux_concernes_par_absence: r.impacts.map((x) => `${(C.empById(App.state, x.emp) || {}).name} le ${x.date}`), postes_non_pourvus: report ? report._report.notPlaced.map((n) => `${(C.empById(App.state, n.emp) || {}).name} ${n.date} : ${n.reason}`) : undefined };
          },
        },
      ];
    },

    async ask(App, history, onText, signal) {
      const turns = [{ role: "user", content: this.context(App) }];
      for (const m of history.slice(-16)) turns.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.text });
      const opts = { cache: false, signal, onText };
      if (this.toolsOk) opts.tools = this.tools(App);
      return this.sample(turns, opts);
    },

    // ---------- Lecture d'une photo de planning ou de calendrier ----------
    async readPlanningImage(file, App) {
      const prompt = [
        "Cette image est une photo d'un planning d'équipe hebdomadaire (lundi à dimanche). Elle peut être tournée.",
        "Chaque ligne = un prénom. Pour chaque jour, il y a des cases « De / A » : la ligne du haut donne les débuts, la ligne du bas les fins ; chaque colonne est un bloc horaire, l'écart entre deux blocs est une pause.",
        "Des surligneurs de couleur indiquent la zone de travail ; une légende manuscrite peut donner la signification des couleurs.",
        `Zones connues : ${App.state.zones.map((z) => `${z.id} (${z.name})`).join(", ")}.`,
        "Réponds uniquement avec un JSON : {\"semaine_du\":\"AAAA-MM-JJ ou null\",\"legende\":[{\"couleur\":\"vert\",\"zone\":\"ZP\"}],\"lignes\":[{\"prenom\":\"...\",\"jours\":[{\"jour\":0,\"blocs\":[{\"debut\":\"13:30\",\"fin\":\"17:00\",\"couleur\":\"vert\",\"zone\":\"ZP\",\"doute\":\"raison si illisible ou couleur ambiguë, sinon vide\"}]}]}],\"incertitudes\":[\"...\"]}",
        "jour : 0 = lundi … 6 = dimanche. N'invente rien : si une case est illisible, mets-la dans « incertitudes » et ajoute un « doute ».",
      ].join("\n");
      return this.sample.json(prompt, { images: [file], modelTier: "complex", cache: false });
    },
    async readCalendarImage(file) {
      const prompt = [
        "Cette image est un calendrier d'alternance (école / entreprise) sur plusieurs mois.",
        "Pour chaque jour, donne un code : E = en entreprise, P = formation à l'école, W = week-end, F = jour férié, ? = illisible ou inconnu.",
        "Réponds uniquement avec un JSON : {\"nom\":\"...\",\"legende\":[{\"couleur\":\"...\",\"sens\":\"...\"}],\"mois\":{\"2026-10\":\"chaîne d'un caractère par jour du mois, du 1er au dernier\"},\"incertitudes\":[\"...\"]}",
        "N'invente rien : en cas de doute, mets « ? » et explique dans « incertitudes ».",
      ].join("\n");
      return this.sample.json(prompt, { images: [file], modelTier: "complex", cache: false });
    },
  };
  root.PlanningAI = AI;
})(typeof globalThis !== "undefined" ? globalThis : this);
