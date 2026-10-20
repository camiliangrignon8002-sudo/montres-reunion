# ⌚ Montres homme – La Réunion (< 250 €)

Chaque matin vers **10h (heure de La Réunion)**, GitHub lance une recherche, garde
uniquement les **montres pour homme** (pas de montres connectées, pas de montres de sport,
pas de femme ou enfant, pas d'accessoires), publie une page avec **photo, prix, ville, carte
Google Maps et bouton « Contacter le vendeur »**, puis t'envoie une **notification** sur ton téléphone.

## Installation (une seule fois, environ 10 minutes)

1. **Notification sur le téléphone** : installe l'appli gratuite **ntfy** (App Store ou Google Play).
   Appuie sur **+** et abonne-toi à un nom de sujet difficile à deviner, par exemple
   `montres974-` suivi de chiffres au hasard (ex. `montres974-83k2p9`).
2. **Crée un dépôt GitHub** (compte gratuit sur github.com) et envoie-y les fichiers de ce dossier.
3. Dans le dépôt : **Settings → Secrets and variables → Actions → New repository secret**
   - Name : `NTFY_TOPIC`
   - Secret : le nom de sujet choisi à l'étape 1
4. **Settings → Pages** : Source = *Deploy from a branch*, Branch = `main`, dossier = `/docs`.
5. **Actions → Montres Réunion → Run workflow** pour un premier essai tout de suite.

La page sera visible sur `https://TON-PSEUDO.github.io/NOM-DU-DEPOT/`. La notification ouvre cette page.

## Réglages

- Prix maximum : change `PRIX_MAX` dans `montres.py` (250 par défaut).
- Heure : ligne `cron` dans `.github/workflows/montres.yml` (`0 6 * * *` = 10h Réunion).
- Mots exclus et marques reconnues : listes `EXCLURE`, `FEMME` et `MONTRE` dans `montres.py`.

## Limites à connaître

- **Source actuelle : Leboncoin (département 974).** Facebook Marketplace exige d'être
  connecté et interdit la collecte automatique ; ce n'est donc pas inclus.
- Leboncoin peut bloquer les serveurs de GitHub. Si c'est le cas, tu reçois une notification
  « Recherche impossible ». La solution est alors de lancer `python montres.py` depuis ton propre ordinateur.
- La position sur la carte correspond à la **commune** indiquée par le vendeur, pas à son adresse exacte.
- Pour contacter le vendeur, le bouton ouvre l'annonce Leboncoin (messagerie ou téléphone, selon le vendeur).
- GitHub peut lancer la tâche avec quelques minutes de retard, et la met en pause après 60 jours
  sans activité sur le dépôt. Les mises à jour quotidiennes de la page suffisent normalement à l'éviter.
