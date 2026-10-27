# ⌚ Montres homme – La Réunion (< 250 €)

Chaque matin vers **10h (heure de La Réunion)**, GitHub cherche (puis toutes les 2 h dans la journée, sans notification) les **montres pour homme**
à moins de 250 € sur **ParuVendu** (.re et .fr) et dans les magasins **Cash Express** de Saint-Pierre et Sainte-Clotilde. Il écarte les montres connectées, les montres de
sport, les montres pour femme ou enfant et les accessoires, puis :

- met à jour l'appli (onglets « Sélection 974 » et « Omega » : toutes les Omega homme en vente à La Réunion et en métropole, sur ParuVendu, Cash Express et Collector Square) : https://cam-grignon.pages.dev/
- envoie une **notification sur le téléphone** (appli ntfy, sujet `montres974-ut9qstgpdc`) :
  un résumé, puis une notification par nouvelle montre avec sa photo et deux boutons,
  **Contacter le vendeur** et **Google Maps**.

## Installer sur le téléphone

1. **Notifications** : installe l'appli gratuite **ntfy**, appuie sur **+** et abonne-toi
   au sujet `montres974-ut9qstgpdc`.
2. **Appli** : ouvre le lien ci-dessus dans **Safari**, appuie sur **Partager** (le carré avec
   une flèche), puis **Sur l'écran d'accueil**. Sur Android, ouvre-le dans Chrome, menu ⋮,
   puis **Ajouter à l'écran d'accueil**.

## Réglages

- Prix maximum : `PRIX_MAX` dans `montres.py`.
- Heure : ligne `cron` dans `.github/workflows/montres.yml` (`0 6 * * *` = 10h Réunion).
- Mots exclus et marques reconnues : listes `EXCLURE`, `FEMME` et `MONTRE` dans `montres.py`.
- Lancer une recherche tout de suite : onglet **Actions → Montres Réunion → Run workflow**.

## Limites

- Annonces publiées ou mises à jour depuis 2024 (réglable avec `DEPUIS` dans `montres.py`).
- Leboncoin, Facebook Marketplace et Vinted bloquent la lecture automatique : ils ne sont pas inclus.
- La carte montre la commune du vendeur, pas son adresse exacte.

---

# 🏠 Logements Nord Réunion (studio à T3, jusqu'à 740 €)

Appli : https://cam-grignon.pages.dev/logements/

**Toutes les heures, jour et nuit**, GitHub cherche les **appartements à louer**
(studio, T1, T2, T3) à **740 € maximum** à Saint-Denis (avec Sainte-Clotilde et La Montagne), Sainte-Marie,
Sainte-Suzanne, La Possession et Le Port, sur **Bien'ici**, **ParuVendu**, **Zimo**
(qui reprend aussi des annonces de Leboncoin), **EntreParticuliers**, **Figaro Immobilier**, **Superimmo**,
**Immobilier entre particuliers**, **Immo Transac** et les sites des agences du nord (Getim, Guy Hoquet, Les Flamboyants,
Urbanis, La Nouvelle Agence, GTI, Herren, Isautier, Sorim, OFIM). Sites d'agences : liste `SITES` dans `logements.py`.

Il garde seulement les logements qui peuvent ouvrir droit aux **aides au logement de la CAF** (AL ou APL) :
il écarte les locations de vacances ou de courte durée, les colocations, les chambres, et les annonces
où le propriétaire refuse la CAF. La pastille « CAF citée » indique que l'annonce parle des aides.

Chaque annonce montre les photos, le prix, le type, la surface, la commune et le quartier, les
caractéristiques (meublé, parking, varangue…), la description et un lien vers l'annonce d'origine.
Une même annonce publiée sur plusieurs sites n'apparaît qu'une fois.

- Prix maximum : `PRIX_MAX` dans `logements.py`. Communes : `COMMUNES` dans `logements.py`.
- Lancer une recherche tout de suite : onglet **Actions → Logements Nord Réunion → Run workflow**.
- Leboncoin, SeLoger, PAP et Logic-Immo bloquent la lecture automatique. Une partie de leurs annonces arrive
  quand même par Zimo et Bien'ici.
- Les pages d'annonce de Zimo sont protégées : pour ces annonces, l'appli montre une photo et le résumé,
  et le reste est sur le site d'origine.

## Notifications des nouveaux logements

Dès qu'un nouveau logement apparaît, une notification arrive sur le téléphone (appli gratuite **ntfy**,
sujet `logements974-w9y80xhxga`), avec la photo, le prix et les boutons « Voir l'annonce », « Appeler » et
« Ouvrir l'appli ». Rien n'est envoyé quand il n'y a pas de nouveau logement.

---

# 🍏 Apple 974 – produits Apple à La Réunion

Appli : https://cam-grignon.pages.dev/apple/

**Toutes les 3 heures, de 6h à 22h (heure de La Réunion)**, GitHub relève les produits Apple **neufs,
reconditionnés et d'occasion** en vente **à La Réunion**, sur 14 sites de l'île : **iShop**, **Microstor**, **Phenix Store**,
**Darty Réunion**, **Leclerc (Leclic.re)**, **Delbos Informatique**, **TelROI**, **OrdiROI**, **Isleden**, **Zeop Store**,
**smart974**, **Pineapple**,
les magasins **Cash Express** de Saint-Pierre et Sainte-Clotilde, et les annonces **ParuVendu**.

**Notification de midi** : chaque jour vers 12h, une notification donne le nombre de produits Apple sortis en vente
dans les dernières 24 h et les liste (appli gratuite **ntfy**, sujet `apple974-hcmkgo9gki`).

- Catégories façon Apple Store (iPhone, Apple Watch, iPad, Mac, AirPods, TV et Maison, Accessoires) qui défilent
  de droite à gauche, puces d'accessoires (MagSafe, coques, bracelets, chargeurs, Apple Pencil…) et rangée des magasins.
- Annonces 2 par ligne, filtres **Neuf / Reconditionné / Occasion**, **prix** (min, max ou tranches),
  **rayon autour de moi** (position du téléphone ou commune choisie), vendeur, capacité, magasins ou particuliers, tri.
- **Recherche** (bouton loupe), menu **☰** avec favoris, panier et magasins, **actualiser** avec le bouton
  ou en tirant la page vers le bas.
- Fiche de chaque produit : photos, prix, état, caractéristiques (capacité, puce, écran, couleur, batterie…),
  description, magasins où le trouver avec distance et itinéraire, le même modèle chez les autres vendeurs,
  et le lien vers l'annonce d'origine.
- **Comparaison** (menu ☰) : 2 ou 3 produits côte à côte (puce, écran, appareil photo, autonomie, poids, prise,
  stockage, état, garantie, prix, vendeur), avec une explication simple de chaque ligne et un résumé « En bref ».
  Les composants viennent de la fiche technique de référence `apple_specs.json` (iPhone 11 à 17, AirPods, Apple Watch).
- Favoris et panier restent sur le téléphone. Le panier sert à comparer : l'achat se fait chez le vendeur.

Réglages : liste `SOURCES` et fonctions de chaque site dans `apple.py`, page dans `apple_page.html`.
Lancer une recherche tout de suite : onglet **Actions → Apple Réunion → Run workflow**.

Limites : Leboncoin (captcha anti-robot) et Facebook Marketplace (connexion obligatoire) bloquent la lecture
automatique ; la rubrique « Aussi sur » de l'appli ouvre directement leur recherche à La Réunion. SFR Réunion, Orange Réunion
et Easy Cash refusent aussi les robots. Le prix affiché « dès » est celui de la
version la moins chère. Pour Microstor et ParuVendu, la carte montre la commune, pas l'adresse exacte.


---

# ✈️ Vols 974 – vols directs France → La Réunion

Appli : https://cam-grignon.pages.dev/vols/

**Toutes les 2 heures, jour et nuit**, GitHub relève sur **Google Flights** les **vols sans escale** de la France
vers La Réunion (Saint-Denis Roland-Garros), **aller simple**, sur toutes les compagnies (Air France, Air Austral,
Corsair, French bee…), jour par jour sur environ 11 mois, au départ de Paris-CDG, Paris-Orly, Lyon, Marseille,
Bordeaux, Toulouse, Nantes, Montpellier, Nice, Lille et Strasbourg. Les prix demandés comprennent
**1 valise en soute et 1 valise cabine** par personne.

- Chaque vol : date, heures de départ et d'arrivée, aéroport, compagnie et numéro de vol, durée, avion, prix,
  et la baisse ou la hausse depuis le relevé précédent.
- **Qui part ?** : âge de chaque voyageur (adulte, enfant 2-11 ans, bébé), valises en plus, animaux (chat, chien,
  poids : cabine jusqu'à 8 kg avec le sac, soute au-delà). L'appli calcule le **prix total** pour tout le groupe.
- **French bee** est la compagnie affichée par défaut (puce « Toutes » pour voir les autres).
- **Calendrier** des prix (vert = moins cher), « le moins cher » en haut, filtres départ, compagnie, mois,
  heure de départ, tri par prix, date, heure ou durée.
- **Favoris** (cœur) et **panier** (total des vols choisis), gardés sur le téléphone. **Actualiser** avec le bouton
  ou en tirant la page vers le bas.
- **Prix exact** ouvre Google Flights avec les vrais voyageurs et les valises ; **Réserver** ouvre le site de la compagnie.

Réglages dans `vols.py` : aéroports `DEPARTS`, règles des compagnies `COMPAGNIES` (part enfant et bébé,
prix d'une valise en plus, animal en cabine ou en soute), nombre de jours `JOURS`. Page dans `vols_page.html`.
Lancer un relevé tout de suite : onglet **Actions → Vols Réunion → Run workflow**.

Limites : les prix viennent de Google Flights et peuvent avoir changé depuis le relevé. Les montants
enfants, bébés, valises en plus et animaux sont des **estimations** d'après les règles des compagnies, à vérifier
avant de payer. Le premier relevé complet du calendrier prend quelques passages (Paris d'abord).

---

# 📅 Planning équipe

Appli : https://cam-grignon.pages.dev/planning/

Plannings de l'équipe (zone publique / zone réservée), jours de CFA des alternants, congés et absences,
génération à partir du planning modèle, historique, exports PDF / Excel / CSV.

- Au premier lancement, touchez **Importer ces données** : l'équipe, les zones, le modèle et le calendrier
  du CFA s'installent, puis les données restent sur le téléphone. Pas de code d'accès.
- L'**assistant IA** et le partage avec l'équipe sont dans la version Claude :
  https://claude.ai/artifact/GqCvGUNogmGmept7ND8mdY
- Installer : ouvrir le lien dans **Safari** → **Partager** → **Sur l'écran d'accueil**.
- Code source, tests et détails : dossier `planning/` (voir `planning/README.md`).

---

# 🏡 Seb Immo

Appli : https://cam-grignon.pages.dev/immo/
(version Claude : https://claude.ai/artifact/2Bg3yFCpd15pLLDdHewmzm)

Gestion des dossiers clients en immobilier, sur téléphone et sur PC (menu ☰ en haut à gauche sur téléphone,
menu fixe à gauche sur PC).

- **Dossiers** à l'infini : client (téléphone, email), type (achat, vente, location), le bien. La liste des
  papiers à réunir (carte d'identité, livret de famille, bulletins de salaire, titre de propriété…) se crée
  toute seule selon le type ; on peut en ajouter ou en retirer.
- **Cocher** un papier quand il est reçu, ou le ranger en photo / PDF avec le trombone (il se coche tout seul).
- Classement automatique : **à traiter** (rien reçu), **en cours** (une partie reçue), **finis** (tout reçu ou clôturé).
- **Relances** : message prêt avec la liste des papiers manquants, envoyé en un appui par SMS, WhatsApp ou email.
  L'accueil liste les clients à relancer (sans nouvelles depuis 7 jours, réglable).
- **Relances automatiques** (menu ☰) : avec un compte **Brevo** (clé API collée dans l'appli), l'appli envoie elle-même
  les SMS (et les mails une fois l'adresse d'envoi remplie) aux clients à qui il manque des papiers, quand elle est ouverte
  sur l'adresse cam-grignon.pages.dev. 3 relances au plus par client, de 8h à 19h, pas le dimanche (réglable).
- **Importer mes dossiers** (menu ☰) : on dépose son dossier clients existant (sous-dossiers, photos, PDF, tableau CSV).
  L'appli range chaque fichier dans le bon client et le bon papier (par l'IA dans la version Claude, sinon d'après les noms),
  montre le résultat à corriger, puis « Tout ranger » crée les dossiers, qui se classent tout seuls.
- **Dossiers en attente** : bouton « Mettre en attente » dans un dossier (raison, date de reprise) ; plus de relances,
  le dossier revient sur l'accueil à la date de reprise.
- **Terrains à acheter** (menu ☰) : les terrains à vendre de la semaine, à part des maisons et appartements.
- Filtres des biens et des terrains : zone (Nord, Ouest, Sud, Est, d'après le code postal), commune, prix minimum et maximum,
  surface, pièces, tri (bonnes affaires, prix, prix au m², plus récentes). Les filtres restent en mémoire sur l'appareil.
- **Assistant IA** (version Claude) : répond aux questions sur l'appli et les dossiers, et peut cocher un papier,
  ajouter un papier, noter un rendez-vous, créer un dossier ou chercher un bien. Il ne supprime rien et n'envoie rien.
- **Aide** : les questions courantes, réponse en un appui.
- **Agent de maintenance** : une tâche planifiée Claude vérifie chaque lundi que la recherche des biens marche,
  répare `immo.py` si besoin et propose la correction.
- **Mes biens** : prix affiché, prix d'achat, frais, prix de vente, commission, ce que chaque
  vente a rapporté, total de l'année.
- **Biens achetables** : chaque lundi vers 10h, `immo.py` lit les maisons, appartements et terrains à vendre à
  La Réunion sur Bien'ici et met en tête les moins chers au m² par rapport à leur commune (`docs/immo/biens.json`).
  Lancer tout de suite : onglet **Actions → Biens à vendre Réunion → Run workflow**.

Les dossiers restent sur l'appareil (menu Réglages → Sauvegarde pour les copier vers un autre appareil).
Page dans `immo_page.html` ; `docs/immo/index.html` est la même page avec l'en-tête de l'appli installable.
