#!/bin/bash
# filepath: /docker-deployments/whisper-transcriber/reset_database_volume.sh

set -e

PROJECT_DIR=$(basename "$PWD")

echo "🔄 Whisper-Volume wird komplett zurückgesetzt..."

echo "⚠️  WARNUNG: Das komplette Volume wird gelöscht!"
read -p "Sind Sie sicher? (ja/nein): " confirm

if [ "$confirm" != "ja" ]; then
    echo "❌ Abgebrochen."
    exit 0
fi

# Container stoppen
echo "🛑 Container werden gestoppt..."
docker compose down

# Volume löschen
echo "💾 Volume wird gelöscht..."
docker volume rm ${PROJECT_DIR}_whisper_data 2>/dev/null || true

echo " Volume wurde komplett gelöscht!"
echo "💡 Beim nächsten Start wird eine neue Datenbank erstellt."
echo "🚀 Container wieder starten mit: docker compose up -d"