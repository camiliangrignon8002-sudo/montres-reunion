---
name: public-apis
description: Catalogue de ~2 100 API publiques et gratuites (51 catégories : météo, géocodage, devises, shopping, transport, open data, etc.) tiré de github.com/public-apis/public-apis. À utiliser quand il faut trouver une API pour une nouvelle fonction (ex. convertir un prix, géolocaliser une commune, ajouter une source de données) ou quand l'utilisateur demande « quelle API pour… ».
---

# API publiques

Le catalogue complet est dans [apis.md](apis.md), une section `## Catégorie` par domaine.
Chaque ligne : `| [Nom](lien) | Description | Auth | HTTPS | CORS |`.

- **Auth** : `No` = aucune clé, `apiKey` / `OAuth` = inscription nécessaire.
- **CORS** : `Yes` = appelable directement depuis le navigateur (utile pour `docs/index.html`).

## Comment l'utiliser

1. Chercher dans `apis.md` avec Grep (nom de catégorie ou mot-clé, insensible à la casse)
   plutôt que de lire tout le fichier.
2. Préférer les API sans clé (`Auth` = `No`) et en HTTPS : le workflow GitHub Actions
   n'a pas de secrets configurés pour des clés tierces.
3. Avant d'intégrer une API, vérifier qu'elle répond toujours (la liste peut contenir
   des liens morts) et lire sa documentation officielle pour les limites d'usage.
4. Si une clé est indispensable, la passer par un secret GitHub (`secrets.X` dans
   `.github/workflows/montres.yml`), jamais en dur dans `montres.py`.

Catégories souvent utiles pour ce projet : Currency Exchange, Geocoding, Shopping,
Open Data, Government, Weather, Photography.
