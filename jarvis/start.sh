#!/usr/bin/env bash
# JARVIS'ни битта буйруқ билан ишга тушириш: ./start.sh
set -e
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js 20+ керак: https://nodejs.org"; exit 1; }
[ -d node_modules ] || npm install
[ -f .env ] || cp .env.example .env
npm start
