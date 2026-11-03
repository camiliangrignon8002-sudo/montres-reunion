#!/bin/bash
# Mes appareils : envoie la batterie du Mac et des AirPods connectés vers l'appli (canal ntfy).
#   Installer (toutes les 5 min) : curl -fsSL https://camiliangrignon8002-sudo.github.io/montres-reunion/appareils/mac.sh | bash -s -- installer <canal>
#   Désinstaller                 : curl -fsSL https://camiliangrignon8002-sudo.github.io/montres-reunion/appareils/mac.sh | bash -s -- desinstaller
#   Envoyer une fois             : bash mac.sh envoyer <canal>
set -u
DOSSIER="$HOME/Library/Application Support/MesAppareils"
PLIST="$HOME/Library/LaunchAgents/io.github.mesappareils.plist"
ACTION="${1:-envoyer}"
SUJET="${2:-appareils-24qr4o3v0pox}"
case "$SUJET" in *[!a-zA-Z0-9_-]*) echo "Canal invalide : lettres, chiffres, - et _ seulement." >&2; exit 1;; esac

envoyer() {
  local batt pct charge os ioreg_out maxcap design cycles sante bt ap
  batt=$(pmset -g batt)
  pct=$(printf '%s' "$batt" | grep -Eo '[0-9]+%' | head -1 | tr -d '%')
  charge=false; printf '%s' "$batt" | grep -q "AC Power" && charge=true
  os=$(sw_vers -productVersion)
  modele=$(sysctl -n hw.model 2>/dev/null)
  ioreg_out=$(ioreg -rn AppleSmartBattery 2>/dev/null)
  maxcap=$(printf '%s' "$ioreg_out" | awk -F'= ' '/"AppleRawMaxCapacity"/{print $2; exit}')
  [ -z "$maxcap" ] && maxcap=$(printf '%s' "$ioreg_out" | awk -F'= ' '/"MaxCapacity"/{print $2; exit}')
  design=$(printf '%s' "$ioreg_out" | awk -F'= ' '/"DesignCapacity"/{print $2; exit}')
  cycles=$(printf '%s' "$ioreg_out" | awk -F'= ' '/"CycleCount"/{print $2; exit}')
  sante=null
  if [ -n "$maxcap" ] && [ -n "$design" ] && [ "$design" -gt 0 ] 2>/dev/null && [ "$maxcap" -gt 100 ] 2>/dev/null; then
    sante=$(( maxcap * 100 / design ))
  fi
  # AirPods : niveaux gauche / droite / boîtier, visibles seulement quand ils sont connectés au Mac.
  bt=$(system_profiler SPBluetoothDataType 2>/dev/null)
  ap=$(printf '%s\n' "$bt" | awk '
    /:[[:space:]]*$/ && !/Battery|Level/ { if (l!="" || r!="") exit; nom=$0; fw=""; c=""; l=""; r="" }
    /Left Battery Level/  { gsub(/[^0-9]/,"",$0); l=$0 }
    /Right Battery Level/ { gsub(/[^0-9]/,"",$0); r=$0 }
    /Case Battery Level/  { gsub(/[^0-9]/,"",$0); c=$0 }
    /Firmware Version/    { sub(/.*: */,"",$0); fw=$0 }
    END { if (l!="" || r!="") printf "{\"g\":%s,\"d\":%s,\"boitier\":%s,\"firmware\":\"%s\"}", (l==""?"null":l), (r==""?"null":r), (c==""?"null":c), fw }')
  [ -z "$ap" ] && ap=null
  curl -fsS -m 20 -o /dev/null -H "Title: batterie" \
    -d "{\"appareil\":\"mac\",\"batterie\":${pct:-null},\"charge\":$charge,\"os\":\"$os\",\"modele\":\"$modele\",\"sante\":$sante,\"cycles\":${cycles:-null},\"airpods\":$ap}" \
    "https://ntfy.sh/$SUJET"
}

case "$ACTION" in
  envoyer) envoyer ;;
  installer)
    mkdir -p "$DOSSIER" "$HOME/Library/LaunchAgents"
    if [ -f "${BASH_SOURCE[0]:-}" ]; then cp "${BASH_SOURCE[0]}" "$DOSSIER/mac.sh"
    else curl -fsSL https://camiliangrignon8002-sudo.github.io/montres-reunion/appareils/mac.sh -o "$DOSSIER/mac.sh"; fi
    chmod +x "$DOSSIER/mac.sh"
    cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>io.github.mesappareils</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$DOSSIER/mac.sh</string><string>envoyer</string><string>$SUJET</string></array>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
</dict></plist>
PL
    launchctl unload "$PLIST" 2>/dev/null; launchctl load "$PLIST"
    echo "C'est installé : le Mac envoie sa batterie toutes les 5 minutes sur le canal $SUJET." ;;
  desinstaller)
    launchctl unload "$PLIST" 2>/dev/null; rm -f "$PLIST"; rm -rf "$DOSSIER"
    echo "Désinstallé." ;;
  *) echo "Usage : mac.sh [envoyer|installer|desinstaller] [canal]" >&2; exit 1 ;;
esac
