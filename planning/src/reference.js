// Données extraites des deux calendriers fournis (photos du 22/10/2026).
// Lecture : planning papier « Planning à partir du 19/10/2026 – Semaine 1 – Page 1/2 »
// et « BTS MCO 1 – CFA Levavasseur – Calendrier d'alternance 2026-2027 ».
// Chaque information porte son niveau de confiance ; rien n'est confirmé tant que
// l'utilisateur ne l'a pas validé dans l'écran « Importation ».
(function (root) {
  const ZP = "ZP", ZR = "ZR";
  const day = (a, b, za, c, d, zb, uncertain) => [
    { s: a, e: b, z: za },
    { s: c, e: d, z: zb, ...(uncertain ? { doute: uncertain } : {}) },
  ];
  // Motifs relevés (2 colonnes « De / A » par jour : 1er bloc, pause, 2e bloc).
  const soir7 = (z) => day("13:30", "17:00", z, "17:30", "21:00", z);
  const soir7b = (z) => day("13:30", "17:30", z, "18:00", "21:00", z);
  const nuit7 = (z) => day("14:30", "17:00", z, "17:30", "22:00", z);
  const ouv7 = (z2, d) => day("05:30", "11:00", ZP, "11:30", "13:00", z2, d);
  const mat7 = (z2, d) => day("07:00", "12:00", ZP, "12:30", "14:30", z2, d);
  const aube7 = (z) => day("06:00", "10:30", z, "11:00", "13:30", z);
  const soir6 = (z) => day("15:30", "17:30", z, "18:00", "22:00", z);
  const MIX = "Couleur mélangée (vert recouvert d'orange) sur la photo : zone réservée probable, à confirmer.";

  const T = []; // {emp, dow (0 = lundi), segs}
  const put = (emp, dows, segs) => dows.forEach((d) => T.push({ emp, dow: d, segs: typeof segs === "function" ? segs(d) : segs }));
  put("camilian", [2, 3, 4, 5, 6], soir7(ZP));
  put("charlotte", [0, 5, 6], ouv7(ZP));
  put("charlotte", [1, 2], ouv7(ZR, MIX));
  put("eric", [0, 1, 2, 4], mat7(ZP));
  put("eric", [3], mat7(ZR, MIX));
  put("fleur", [2, 3, 4, 5, 6], nuit7(ZR));
  put("lydia", [3, 4], ouv7(ZP));
  put("maelle", [0, 1], soir7(ZP));
  put("maelle", [2, 3, 6], soir7b(ZP));
  put("mathilde", [0, 1, 3, 4], soir6(ZR));
  put("mathilde", [5], day("14:30", "17:30", ZP, "18:00", "21:00", ZP));
  put("murielle", [0, 1], soir7b(ZP));
  put("murielle", [2], day("14:30", "17:30", ZR, "18:00", "22:00", ZR));
  put("murielle", [5, 6], aube7(ZR));
  put("nathalie", [0, 1, 2, 3, 4], aube7(ZR));
  put("reine-claude", [0, 1, 5, 6], nuit7(ZR));
  put("reine-claude", [4], soir7b(ZP));
  put("sebastien", [4, 6], mat7(ZR));
  put("sebastien", [1, 2, 5], mat7(ZR, MIX));

  const E = (id, name, role, zones, note, extra) => ({
    id, name, role, zones, zoneNote: note || "", active: true, aliases: [], ...(extra || {}),
  });
  const employees = [
    E("amandine", "Amandine", "salarie", {}, "Aucun horaire sur la semaine 1 : zone inconnue."),
    E("camilian", "Camilian", "alternant", { ZP: "deduit", ZR: "deduit" }, "Vert la semaine du 19/10 ; orange le dimanche 1er novembre.",
      { calendarId: "bts-mco1", aliases: ["Kamiliane", "Kamilian", "Camiliane"], aliasNote: "« Kamiliane » dans la demande, « CAMILIAN » sur le planning : même personne ? À confirmer." }),
    E("charlotte", "Charlotte", "salarie", { ZP: "deduit", ZR: "incertain" }, "Vert partout ; fin de service mardi et mercredi surlignée en orange par-dessus le vert."),
    E("eric", "Eric", "salarie", { ZP: "deduit", ZR: "incertain" }, "Vert partout ; fin de service jeudi surlignée en orange par-dessus le vert."),
    E("fleur", "Fleur", "alternant", { ZR: "deduit" }, "5 jours sur 5 en orange (zone réservée).", { calendarId: "bts-mco1" }),
    E("lydia", "Lydia", "salarie", { ZP: "deduit", ZR: "deduit" }, "Vert (ouverture 05:30) ; orange jeudi et vendredi de la semaine du 26/10 (06:00)."),
    E("maelle", "Maelle", "salarie", { ZP: "deduit" }, "5 jours sur 5 en vert."),
    E("mathilde", "Mathilde", "salarie", { ZR: "deduit", ZP: "deduit" }, "Orange lundi, mardi, jeudi, vendredi ; vert samedi."),
    E("murielle", "Murielle", "salarie", { ZP: "deduit", ZR: "deduit" }, "Vert lundi et mardi ; orange mercredi, samedi, dimanche."),
    E("nathalie", "Nathalie", "salarie", { ZR: "deduit" }, "5 jours sur 5 en orange."),
    E("reine-claude", "Reine Claude", "salarie", { ZR: "deduit", ZP: "deduit" }, "Orange 4 jours ; vert vendredi."),
    E("sebastien", "Sebastien", "salarie", { ZP: "deduit", ZR: "deduit" }, "Début de service en vert ; fin de service en orange (nette vendredi et dimanche, mélangée mardi, mercredi, samedi)."),
    E("sonia", "Sonia", "salarie", {}, "Aucun horaire sur la semaine 1 : zone inconnue."),
    E("sophie", "Sophie", "salarie", {}, "Aucun horaire sur la semaine 1 : zone inconnue."),
    E("sylvie", "Sylvie", "salarie", {}, "Aucun horaire sur la semaine 1 : zone inconnue."),
    E("lucas", "Lucas", "alternant", { ZP: "deduit" }, "Absent de la semaine du 19/10 ; en vert les 3 jours de la semaine du 26/10.", { calendarId: "bts-mco1" }),
  ];

  // Calendrier d'alternance, un caractère par jour du mois :
  // E = entreprise, P = formation au CFA, W = week-end, F = jour férié, ? = inconnu.
  const months = {
    "2026-08": "WWEEEEEWWEEEEEWWEEEEEWWEEEEEWWE",
    "2026-09": "EEEEWWEEEEEWWEEEEEWWEEEEEWWEEE",
    "2026-10": "EEWWPPPPPWWEEEEEWWEEEEEWWEEEPPW",
    "2026-11": "WPPEEEWWEEFPPWWPPEEEWWEEEPPWWP",
    "2026-12": "PEEEWWEEEPPWWPPPPPWWEEEEFWWEEEE",
    "2027-01": "FWWEEEEEWWPPEEEWWEEPPPWWPPEEEWW",
    "2027-02": "EEEPPWWPPEEEWWEEEPPWWPPEEEWW",
    "2027-03": "EEEPPWWPPEEEWWEEEEEWWPPPPPWWFPE",
    "2027-04": "EEWWEEEPPWWPPEEEWWPPPPPWWPPEEE",
    "2027-05": "WWEEEFPWWEEEEEWWFEEPPWWPPEEEWWP",
    "2027-06": "PPPPWWEEEPPWWPPEEEWWEEEPPWWPPP",
    "2027-07": "PPWWPPPPPWWEEFEEWWEEEEEWWEEEEEW",
  };

  // Semaine du 26/10/2026 (photo du planning papier). Totaux relus : 366 h, identiques à la feuille.
  const W2 = [];
  const put2 = (emp, dows, segs) => dows.forEach((d) => W2.push({ emp, dow: d, segs }));
  const OLIVE = "Case entièrement vert foncé/orange sur la photo : zone publique probable, à confirmer.";
  const soirB = (z) => day("13:30", "17:30", z, "18:00", "21:00", z);
  const ouvB = (z) => day("05:30", "10:30", z, "11:00", "13:00", z);
  const aubeB = (z) => day("06:00", "11:00", z, "11:30", "13:30", z);
  const nuitB = (z) => day("14:30", "17:30", z, "18:00", "22:00", z);
  const withDoubt = (segs, d) => segs.map((g) => ({ ...g, doute: d }));
  put2("camilian", [0], withDoubt(soir7(ZP), OLIVE));
  put2("camilian", [1], soir7(ZP));
  put2("camilian", [6], mat7(ZR).map((g) => ({ ...g, z: ZR })));
  put2("charlotte", [0], withDoubt(soirB(ZP), OLIVE));
  put2("charlotte", [1, 3], soirB(ZP));
  put2("charlotte", [5, 6], ouvB(ZP));
  put2("eric", [0, 3, 4], ouvB(ZP));
  put2("eric", [1, 2], mat7(ZP));
  put2("fleur", [0, 1, 2], nuit7(ZR));
  put2("lucas", [2], soir7(ZP));
  put2("lucas", [5, 6], aubeB(ZP));
  put2("lydia", [1, 2], ouvB(ZP));
  put2("lydia", [3, 4], aubeB(ZR));
  put2("maelle", [2], soirB(ZP));
  put2("maelle", [3, 4, 5, 6], soir7(ZP));
  put2("mathilde", [2, 3, 4, 5, 6], soir6(ZR));
  put2("murielle", [0], mat7(ZR).map((g) => ({ ...g, z: ZR })));
  put2("murielle", [1], nuitB(ZR));
  put2("murielle", [4, 5, 6], soir7(ZP));
  put2("nathalie", [0, 1, 2, 5, 6], aubeB(ZR));
  put2("reine-claude", [0], nuitB(ZR));
  put2("reine-claude", [3, 4, 5, 6], nuit7(ZR));
  put2("sebastien", [0], mat7(ZP).map((g) => ({ ...g, z: ZP })));
  put2("sebastien", [1, 2, 3, 4], mat7(ZR));
  const extraWeeks = [{
    refId: "papier-2026-10-26", monday: "2026-10-26", source: "planning papier (photo)", shifts: W2,
    zonesAdd: { camilian: ["ZR"], lucas: ["ZP"], lydia: ["ZR"] },
    totalsOnPaper: { camilian: 21, charlotte: 35, eric: 35, fleur: 21, lucas: 21, lydia: 28, maelle: 35, mathilde: 30, murielle: 35, nathalie: 35, "reine-claude": 35, sebastien: 35 },
    notes: ["Lydia, samedi 31/10 : ajout manuscrit « 06H / 13H » surligné en orange, hors des totaux imprimés : non ajouté, à confirmer."],
  }];

  root.PlanningReference = {
    extraWeeks,
    source: {
      planning: "Planning à partir du 19/10/2026 – Semaine 1 – Page 1/2 (photo)",
      alternance: "BTS MCO 1 – CFA Levavasseur – Calendrier d'alternance 2026-2027 (capture)",
      importedOn: "2026-10-22",
    },
    zones: [
      { id: "ZP", name: "Zone publique", short: "ZP", color: "#34C759", pattern: "plein", confidence: "haute", note: "Légende manuscrite « ZP » surlignée en vert sous le tableau." },
      { id: "ZR", name: "Zone réservée", short: "ZR", color: "#FF9500", pattern: "hachures", confidence: "haute", note: "Légende manuscrite « ZR » surlignée en orange sous le tableau." },
    ],
    employees,
    template: { label: "Semaine 1 (planning du 19/10/2026)", referenceWeek: "2026-10-19", shifts: T },
    calendars: [{
      id: "bts-mco1", name: "BTS MCO 1 – CFA Levavasseur 2026-2027", from: "2026-08-01", to: "2027-07-31", months,
      note: "Rose = formation au CFA, blanc « ENTREPRISE » = en entreprise, gris foncé = week-end, gris clair = jour férié.",
    }],
    totalsOnPaper: { camilian: 35, charlotte: 35, eric: 35, fleur: 35, lydia: 14, maelle: 35, mathilde: 30, murielle: 35, nathalie: 35, "reine-claude": 35, sebastien: 35, amandine: 0, sonia: 0, sophie: 0, sylvie: 0 },
    questions: [
      "« Kamiliane » (alternante citée dans la demande) est-elle bien « CAMILIAN » sur le planning ?",
      "Lucas n'apparaît pas sur le planning modèle : quelles zones et quels horaires habituels ?",
      "Les fins de service surlignées vert + orange (Charlotte mar./mer., Eric jeu., Sebastien mar./mer./sam.) sont-elles en zone réservée ?",
      "Le planning indique « Page 1/2 » : la page 2 contient-elle une semaine 2 (rotation) ou d'autres employés ?",
      "Amandine, Sonia, Sophie et Sylvie n'ont aucun horaire : sont-elles encore dans l'équipe, et dans quelle zone ?",
      "Le calendrier « BTS MCO 1 » vaut-il pour les trois alternants (Fleur, Camilian, Lucas) ?",
      "Semaine du 26/10 : Lydia a un ajout manuscrit le samedi (« 06H / 13H » en orange). Faut-il l'ajouter ?",
      "Les règles de repos et de durée (11 h de repos, 10 h/jour, 48 h/semaine) sont celles du Code du travail : y a-t-il des règles plus strictes (convention, contrat) ?",
    ],
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
