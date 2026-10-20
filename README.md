# ⌚ Montres homme – La Réunion (< 250 €)

Chaque matin à **10h**, ton Mac cherche les annonces de **montres pour homme** à moins de 250 €
sur Leboncoin (974). Il écarte les montres connectées, les montres de sport, les montres pour
femme ou enfant et les accessoires. Ensuite :

- ton téléphone reçoit **une notification par nouvelle montre**, avec sa photo, son prix, sa ville
  et deux boutons, **Contacter le vendeur** et **Google Maps** ;
- une page avec toutes les montres (photos, carte, description) est mise à jour sur le Mac :
  c'est le fichier **« Montres Réunion »** sur le Bureau.

## Installation sur Mac (une seule fois)

1. Sur ton téléphone, installe l'appli gratuite **ntfy**, appuie sur **+** et abonne-toi au sujet
   **`montres974-ut9qstgpdc`**.
2. Sur le Mac, ouvre **Terminal** (Cmd + Espace, tape « Terminal », puis Entrée).
3. Copie-colle cette ligne, puis appuie sur Entrée :

   ```
   curl -fsSL https://raw.githubusercontent.com/camiliangrignon8002-sudo/montres-reunion/main/install.sh | bash
   ```

   S'il te demande d'installer les « outils de ligne de commande », clique sur **Installer**,
   attends la fin, puis colle la même ligne une seconde fois.

La même ligne sert aussi à mettre l'appli à jour.

## Bon à savoir

- Le Mac doit être allumé ou en veille à 10h. S'il était éteint, la recherche se lance à son prochain réveil.
- Journal des recherches : `~/montres-reunion/journal.txt`.
- Lancer une recherche à la main : `bash ~/montres-reunion/lancer.sh`
- Désinstaller : `launchctl unload ~/Library/LaunchAgents/re.montres.reunion.plist && rm -rf ~/montres-reunion ~/Library/LaunchAgents/re.montres.reunion.plist`
- La carte montre la commune du vendeur, pas son adresse exacte.
- Seul Leboncoin est inclus. Facebook Marketplace demande d'être connecté et interdit la collecte automatique.
- Les serveurs GitHub sont bloqués par Leboncoin, d'où l'installation sur le Mac.
