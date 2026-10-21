# ⌚ Montres homme – La Réunion (< 250 €)

Chaque matin vers **10h (heure de La Réunion)**, GitHub cherche (puis toutes les 2 h dans la journée, sans notification) les **montres pour homme**
à moins de 250 € sur **ParuVendu** (.re et .fr) et dans les magasins **Cash Express** de Saint-Pierre et Sainte-Clotilde. Il écarte les montres connectées, les montres de
sport, les montres pour femme ou enfant et les accessoires, puis :

- met à jour l'appli (onglets « Sélection 974 » et « Omega » : toutes les Omega homme en vente à La Réunion et en métropole, sur ParuVendu, Cash Express et Collector Square) : https://camiliangrignon8002-sudo.github.io/montres-reunion/
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

Appli : https://camiliangrignon8002-sudo.github.io/montres-reunion/logements/

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

Appli : https://camiliangrignon8002-sudo.github.io/montres-reunion/apple/

**Toutes les 3 heures, de 6h à 22h (heure de La Réunion)**, GitHub relève les produits Apple **neufs,
reconditionnés et d'occasion** en vente sur l'île : **iShop**, **Microstor**, **Phenix Store**, **Darty Réunion**,
les magasins **Cash Express** de Saint-Pierre et Sainte-Clotilde, et les annonces **ParuVendu** (particuliers).

- Catégories façon Apple Store (iPhone, Apple Watch, iPad, Mac, AirPods, TV et Maison, Accessoires) qui défilent
  de droite à gauche, puces d'accessoires (MagSafe, coques, bracelets, chargeurs, Apple Pencil…) et rangée des magasins.
- Annonces 2 par ligne, filtres **Neuf / Reconditionné / Occasion**, **prix** (min, max ou tranches),
  **rayon autour de moi** (position du téléphone ou commune choisie), vendeur, capacité, magasins ou particuliers, tri.
- **Recherche** (bouton loupe), menu **☰** avec favoris, panier et magasins, **actualiser** avec le bouton
  ou en tirant la page vers le bas.
- Fiche de chaque produit : photos, prix, état, caractéristiques (capacité, puce, écran, couleur, batterie…),
  description, magasins où le trouver avec distance et itinéraire, le même modèle chez les autres vendeurs,
  et le lien vers l'annonce d'origine.
- Favoris et panier restent sur le téléphone. Le panier sert à comparer : l'achat se fait chez le vendeur.

Réglages : liste `SOURCES` et fonctions de chaque site dans `apple.py`, page dans `apple_page.html`.
Lancer une recherche tout de suite : onglet **Actions → Apple Réunion → Run workflow**.

Limites : Leboncoin et Facebook Marketplace bloquent la lecture automatique. Le prix affiché « dès » est celui de la
version la moins chère. Pour Microstor et ParuVendu, la carte montre la commune, pas l'adresse exacte.

