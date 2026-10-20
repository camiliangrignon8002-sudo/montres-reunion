#!/bin/bash
# Installation sur Mac : recherche des montres chaque jour à 10h + notifications ntfy.
# Usage : curl -fsSL https://raw.githubusercontent.com/camiliangrignon8002-sudo/montres-reunion/main/install.sh | bash
set -e

DIR="$HOME/montres-reunion"
TOPIC="${NTFY_TOPIC:-montres974-ut9qstgpdc}"
PLIST="$HOME/Library/LaunchAgents/re.montres.reunion.plist"
ZIP_URL="https://github.com/camiliangrignon8002-sudo/montres-reunion/archive/refs/heads/main.zip"

echo ""
echo "⌚ Installation de l'alerte Montres Réunion"
echo ""

# 1. Trouver Python 3
PY=""
for p in /Library/Frameworks/Python.framework/Versions/Current/bin/python3 /opt/homebrew/bin/python3 /usr/local/bin/python3; do
  if [ -x "$p" ]; then PY="$p"; break; fi
done
if [ -z "$PY" ] && xcode-select -p >/dev/null 2>&1; then PY=/usr/bin/python3; fi
if [ -z "$PY" ]; then
  echo "👉 Python n'est pas encore installé."
  echo "   Une fenêtre va s'ouvrir : clique sur « Installer » et attends la fin (5 à 15 min),"
  echo "   puis colle de nouveau la même commande dans le Terminal."
  xcode-select --install >/dev/null 2>&1 || true
  exit 0
fi
echo "✓ Python trouvé : $("$PY" --version 2>&1)"

# 2. Télécharger le programme (en gardant la liste des annonces déjà vues)
TMP="$(mktemp -d)"
curl -fsSL "$ZIP_URL" -o "$TMP/app.zip"
unzip -q "$TMP/app.zip" -d "$TMP"
mkdir -p "$DIR/data" "$DIR/docs"
cp "$TMP"/montres-reunion-main/montres.py "$TMP"/montres-reunion-main/requirements.txt "$DIR/"
rm -rf "$TMP"
echo "✓ Programme téléchargé dans $DIR"

# 3. Installer les dépendances
"$PY" -m venv "$DIR/.venv"
"$DIR/.venv/bin/python" -m pip install -q --upgrade pip
"$DIR/.venv/bin/python" -m pip install -q -r "$DIR/requirements.txt"
echo "✓ Dépendances installées"

# 4. Script de lancement + tâche quotidienne à 10h
cat > "$DIR/lancer.sh" <<SCRIPT
#!/bin/bash
cd "$DIR"
export NTFY_TOPIC="$TOPIC"
echo "--- \$(date)" >> "$DIR/journal.txt"
"$DIR/.venv/bin/python" montres.py >> "$DIR/journal.txt" 2>&1
SCRIPT
chmod +x "$DIR/lancer.sh"

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLISTXML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>re.montres.reunion</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$DIR/lancer.sh</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>10</integer><key>Minute</key><integer>0</integer></dict>
</dict>
</plist>
PLISTXML
launchctl unload "$PLIST" >/dev/null 2>&1 || true
launchctl load -w "$PLIST"
echo "✓ Recherche programmée tous les jours à 10h"

# 5. Premier essai tout de suite
echo ""
echo "🔎 Première recherche en cours…"
bash "$DIR/lancer.sh" || true
tail -n 3 "$DIR/journal.txt"
ln -sf "$DIR/docs/index.html" "$HOME/Desktop/Montres Réunion.html" 2>/dev/null || true
open "$DIR/docs/index.html" 2>/dev/null || true

echo ""
echo "✅ C'est installé !"
echo "   • Page des montres : fichier « Montres Réunion » sur ton Bureau"
echo "   • Notifications : appli ntfy sur ton téléphone, sujet  $TOPIC"
echo "   • Le Mac doit être allumé (ou se réveiller) pour la recherche de 10h."
