#!/usr/bin/env bash
# JARVIS'ни Mac'да доимий ишлайдиган қилиб ўрнатиш (компьютер ёқилганда ўзи ишга тушади).
# Фойдаланиш:  ./install-macos.sh          — ўрнатиш/янгилаш
#              ./install-macos.sh uninstall — автоишга туширишни олиб ташлаш (маълумотлар ўчирилмайди)
set -euo pipefail
cd "$(dirname "$0")"
DIR="$(pwd)"
LABEL="uz.jarvis.personal"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ "${1:-}" = "uninstall" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Автоишга тушириш олиб ташланди. Маълумотлар ($DIR/data) сақланиб қолди."
  exit 0
fi

[ "$(uname)" = "Darwin" ] || { echo "Бу скрипт фақат macOS учун. Бошқа тизимда: ./start.sh"; exit 1; }
NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  echo "Node.js топилмади. Ўрнатинг: https://nodejs.org (LTS) ёки 'brew install node', кейин скриптни қайта ишга туширинг."
  exit 1
fi
MAJOR="$("$NODE" -p 'process.versions.node.split(".")[0]')"
[ "$MAJOR" -ge 20 ] || { echo "Node.js 20+ керак (ҳозир: $("$NODE" -v))."; exit 1; }
echo "✓ Node.js $("$NODE" -v) ($NODE)"
# macOS махфийлик ҳимояси (TCC) фон хизматига Documents/Desktop/Downloads/iCloud папкаларини очишга рухсат бермаслиги мумкин
case "$DIR" in
  "$HOME/Documents"*|"$HOME/Desktop"*|"$HOME/Downloads"*|"$HOME/Library/Mobile Documents"*)
    echo "⚠️  JARVIS $DIR ичида турибди. macOS фон хизматларига бу папкаларга киришни чеклайди."
    echo "   Тавсия: репозиторийни уй папкасига кўчиринг, масалан: mv \"$(dirname "$DIR")\" ~/olmosriver && cd ~/olmosriver/jarvis && ./install-macos.sh"
    echo "   Барибир давом этилмоқда; агар JARVIS ишга тушмаса, лог: $DIR/data/logs/jarvis.err.log";;
esac

echo "→ Кутубхоналар ўрнатилмоқда…"; npm install --no-fund --no-audit
echo "→ Интерфейс йиғилмоқда…"; npm run build
[ -f .env ] || cp .env.example .env
mkdir -p data/logs "$HOME/Library/LaunchAgents"
PORT="$(grep -E '^PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '[:space:]' || true)"; PORT="${PORT:-3333}"

cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$DIR/node_modules/tsx/dist/cli.mjs</string>
    <string>$DIR/server/index.ts</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/data/logs/jarvis.log</string>
  <key>StandardErrorPath</key><string>$DIR/data/logs/jarvis.err.log</string>
</dict>
</plist>
PL

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load "$PLIST"
OK=""
for i in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:$PORT/api/auth/status" >/dev/null 2>&1; then OK=1; break; fi
  sleep 1
done
if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
  echo "✓ Автоишга тушириш рўйхатдан ўтди: $LABEL ($PLIST) — Mac’га кирганда ўзи ишга тушади."
else
  echo "⚠️  Автоишга тушириш хизмати топилмади (launchctl print). Скриптни қайта ишга туширинг."
fi
if [ -n "$OK" ]; then
  echo "✓ JARVIS ишлаяпти: http://127.0.0.1:$PORT"
  open "http://127.0.0.1:$PORT" 2>/dev/null || true
else
  echo "✗ JARVIS 20 сонияда жавоб бермади. Лог: $DIR/data/logs/jarvis.err.log"
  tail -20 "$DIR/data/logs/jarvis.err.log" 2>/dev/null || true
  exit 1
fi
echo "Эслатма: Mac ухлаб қолса, JARVIS ва режалаштирилган ишлар ҳам тўхтайди (кейин «ўтказиб юборилди» деб белгиланади)."
