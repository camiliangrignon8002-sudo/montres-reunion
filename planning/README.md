# Planning équipe

Application de gestion des plannings d'une équipe de commerce en zone aéroportuaire : zones de travail
(zone publique / zone réservée), alternants et leurs jours de CFA, congés, génération à partir d'un
planning modèle, historique, exports et assistant IA.

**Ouvrir l'application** : le lien claude.ai donné dans la conversation (artifact « Planning équipe »).
Elle marche sur ordinateur, tablette et téléphone. Sur iPhone, dans l'application Claude ou dans Safari.

## Comment c'est construit

Une seule page web (HTML + JavaScript sans framework, ~250 Ko) publiée comme artifact claude.ai :

| Partie | Fichier | Rôle |
| --- | --- | --- |
| Données de référence | `src/reference.js` | Ce qui a été lu sur les deux photos (planning du 19/10/2026, calendrier BTS MCO 1), avec niveau de confiance et questions |
| Logique métier | `src/core.js` | Dates, horaires (pauses, nuit), règles, vérification, générateur, remplaçants, opérations, CSV |
| Base de données | `src/store.js` | Base partagée de l'artifact (`db`), historique, versions, conversation privée ; repli sur le stockage du navigateur hors de Claude |
| Exports | `src/exports.js` | PDF et Excel (.xlsx) écrits à la main, sans bibliothèque |
| IA | `src/ai.js` | Claude via la capacité `sample` de l'artifact, avec 7 outils contrôlés |
| Interface | `src/app.js`, `src/styles.css` | Les 12 écrans |

`node planning/build.js` assemble `dist/planning.html` (publié) et `dist/standalone.html` (à ouvrir
dans un navigateur, données sur l'appareil, sans IA).

Pourquoi un artifact plutôt qu'un serveur à installer : rien à faire tourner sur le MacBook Air,
l'accès se partage depuis claude.ai, les données sont dans une base partagée et sauvegardées côté
serveur, et l'IA utilise le compte Claude de la personne connectée : **aucune clé API à créer ni à
stocker**. Toute modification (manuelle, générateur ou IA) passe par la même fonction `applyOps`
qui vérifie les règles avant d'enregistrer.

### Données

- `config/employees|zones|settings|template|calendars` : équipe, zones et couleurs, règles, modèle, calendriers d'alternance
- `weeks/<lundi>` : une semaine (créneaux = personne, date, blocs `{début, fin, zone}` ; les pauses sont les écarts entre blocs)
- `absences/<id>` : personne (ou `*` = fermeture), type, du, au, note
- `history/<id>` : chaque modification avec valeurs avant/après, date, auteur, origine (manuel, générateur, assistant IA, import, annulation) — 300 dernières gardées
- `versions/<id>` : copies de semaines (à la validation, avant régénération, restauration…) — 120 dernières
- `data/users/<id>/chat` : conversation avec l'assistant, visible par la personne seule

Migration : chaque section est lue avec des valeurs par défaut (`DEFAULT_SETTINGS`…), un champ
ajouté plus tard ne casse pas les anciennes données. Une nouvelle publication de la page ne touche pas
la base.

## Règles appliquées

Bloquant (refusé partout, y compris par l'IA) : horaire illisible, blocs qui se chevauchent,
deux services qui se chevauchent (horaires de nuit inclus), zone non autorisée, alternant un jour
de CFA, personne absente, personne désactivée.

Alertes (à cocher avant de valider une semaine) : zone « à confirmer », statut d'alternance
inconnu, repos < 11 h, > 10 h par jour, > 48 h par semaine (valeurs réglables, à confirmer),
poste du modèle non pourvu.

Le générateur recopie le modèle jour par jour et ne place jamais quelqu'un en cours, absent, hors
de ses zones ou un jour au statut inconnu : ces postes restent « à pourvoir » avec des remplaçants
proposés (même zone, libres, repos et durée respectés) que l'on attribue d'un clic.

## Assistant IA

Ouvrez « Assistant ». Il comprend le français courant, lit le planning par des outils
(`lire_planning`, `qui_travaille`, `disponibilites`, `lire_absences`, `verifier_semaine`,
`chercher_remplacants`) et prépare les changements avec `proposer_modifications`. Il ne peut rien
enregistrer : la proposition s'affiche avec le détail et les alertes, vous cliquez sur
« Appliquer ». La première utilisation demande l'autorisation d'utiliser Claude.

Transmis à Claude : date du jour, prénoms, statut, zones, et à la demande les horaires, congés
(type et dates) et points à vérifier. Jamais : les notes, l'historique.

## Tests

```
node --test planning/test/          # 23 tests de logique métier
node planning/build.js
NODE_PATH=$(npm root -g) node planning/test/e2e.js   # 28 vérifications dans Chromium
```

## Limites connues

- Une seule semaine de modèle (« Semaine 1, page 1/2 ») : pas de rotation sur plusieurs semaines tant que la page 2 n'est pas fournie.
- Les besoins en personnel sont supposés égaux aux postes du modèle (option désactivable).
- La lecture de nouvelles photos par l'IA est à vérifier ligne à ligne dans l'écran de correction.
- Hors de claude.ai (`standalone.html`), les données restent sur l'appareil et l'IA est indisponible.
- Le glisser-déposer marche à la souris ; sur téléphone, utilisez « Déplacer ou copier » dans la fiche du créneau.

## Appli téléphone (GitHub Pages)

`docs/planning/` est l'appli installable (même interface), sans code d'accès : les données de l'équipe sont
dans la page, lisibles par toute personne qui a le lien (le dépôt est public). Les données saisies restent sur
le téléphone ; l'assistant IA est dans la version Claude.
