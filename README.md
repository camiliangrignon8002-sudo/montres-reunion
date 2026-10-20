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
