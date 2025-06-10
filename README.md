# Whisper Transcriber

Ein Docker-basiertes Whisper Audio-Transkriptions-System mit FastAPI Backend und React Frontend.

## Features

- 🎵 **Audio-Transkription** mit OpenAI Whisper
- 👥 **Multi-User System** mit Registrierung und API-Keys
- 🔄 **Asynchrone Verarbeitung** von Audio-Dateien
- 📊 **Job-Management** mit Status-Tracking
- 🌐 **Responsive Web-Interface** mit Material-UI
- 🐳 **Docker-basierte Bereitstellung** mit Traefik
- 🔒 **SSL/TLS-Verschlüsselung** über Let's Encrypt

## Architektur

```
├── api/                    # FastAPI Backend
│   ├── app.py             # Haupt-API
│   ├── config.py          # Konfiguration
│   ├── Dockerfile         # API Container
│   └── requirements.txt   # Python Dependencies
├── frontend/              # React Frontend
│   ├── src/
│   │   ├── App.jsx       # Haupt-App
│   │   └── components/   # UI-Komponenten
│   ├── Dockerfile        # Frontend Container
│   └── package.json      # Node Dependencies
├── docker-compose.yml    # Container-Orchestrierung
├── .env                  # Umgebungsvariablen
└── reset_database.sh     # Database Reset Script
```

## Quick Start

### 1. Repository klonen

```bash
git clone <repository-url>
cd whisper-transcriber
```

### 2. Umgebungsvariablen konfigurieren

Kopieren Sie `.env.example` zu `.env` und passen Sie die Werte an:

```bash
cp .env.example .env
```

Bearbeiten Sie die [`.env`](.env) Datei:

```bash
# Sicherer Registrierungsschlüssel
REGISTRATION_KEY=ihr_sicherer_schluessel_hier

# Ihre Domains
WHISPER_API_DOMAIN=transcribe-api.yourdomain.com
WHISPER_WEB_DOMAIN=transcribe.yourdomain.com

# Verfügbare Whisper-Modelle
WHISPER_MODELS=tiny,base,medium,large
WHISPER_MODEL_LABELS=Schnell,Standard,Präzise,Exakt
```

### 3. Docker Container starten

```bash
docker compose up -d
```

### 4. Erste Registrierung

1. Öffnen Sie `https://transcribe.yourdomain.com`
2. Klicken Sie auf "Registrieren"
3. Verwenden Sie den `REGISTRATION_KEY` aus der [`.env`](.env)

## API Endpoints

### Authentifizierung

| Endpoint | Method | Beschreibung |
|----------|--------|--------------|
| `/register` | POST | Benutzer registrieren |
| `/login` | POST | Benutzer anmelden |

### Job-Management

| Endpoint | Method | Beschreibung |
|----------|--------|--------------|
| `/jobs` | POST | Neue Transkription starten |
| `/jobs` | GET | Alle eigenen Jobs auflisten |
| `/jobs/{id}` | GET | Job-Details abrufen |
| `/jobs/{id}` | DELETE | Job löschen |
| `/jobs/{id}/download` | GET | Transkription herunterladen |
| `/transcribe` | POST | Synchrone Transkription |

### Modelle

| Endpoint | Method | Beschreibung |
|----------|--------|--------------|
| `/models` | GET | Verfügbare Whisper-Modelle |

## Konfiguration

### Whisper-Modelle

Die verfügbaren Modelle werden über Umgebungsvariablen in der [`.env`](.env) Datei konfiguriert:

```bash
# Modell-Namen (kommasepariert)
WHISPER_MODELS=tiny,base,medium,large

# Benutzerfreundliche Labels
WHISPER_MODEL_LABELS=Schnell,Standard,Präzise,Exakt
```

**Verfügbare Whisper-Modelle:**

| Modell | Größe | VRAM | Geschwindigkeit | Genauigkeit |
|--------|-------|------|----------------|-------------|
| `tiny` | 39 MB | ~1 GB | Sehr schnell | Grundlegend |
| `base` | 74 MB | ~1 GB | Schnell | Gut |
| `small` | 244 MB | ~2 GB | Mittel | Sehr gut |
| `medium` | 769 MB | ~5 GB | Langsam | Hoch |
| `large-v2` | 1550 MB | ~10 GB | Sehr langsam | Sehr hoch |
| `large-v3` | 1550 MB | ~10 GB | Sehr langsam | Höchste |

**Beispiel-Konfigurationen:**

```bash
# Nur schnelle Modelle für begrenzte Ressourcen
WHISPER_MODELS=tiny,base
WHISPER_MODEL_LABELS=Schnell,Standard

# Ausgewogene Auswahl
WHISPER_MODELS=tiny,small,medium
WHISPER_MODEL_LABELS=Schnell,Gut,Präzise

# Alle Modelle für maximale Flexibilität
WHISPER_MODELS=tiny,base,small,medium,large-v3
WHISPER_MODEL_LABELS=Sehr schnell,Schnell,Standard,Präzise,Höchste Qualität

# GPU-optimierte Konfiguration
WHISPER_MODELS=small,medium,large-v3
WHISPER_MODEL_LABELS=Standard,Präzise,Premium
```

**Wichtige Hinweise:**
- Die Modelle werden beim Container-Start heruntergeladen und geladen
- Größere Modelle benötigen mehr RAM und Speicherplatz
- Die Labels werden in der gleichen Reihenfolge wie die Modelle verwendet
- Bei GPU-Nutzung können größere Modelle effizienter verarbeitet werden
- Änderungen an den Modellen erfordern einen Container-Neustart

### GPU-Unterstützung

Für GPU-Acceleration setzen Sie in [`docker-compose.yml`](docker-compose.yml):

```yaml
environment:
  - CUDA_AVAILABLE=1
```

### Domains

Konfigurieren Sie Ihre Domains in der [`.env`](.env):

- `WHISPER_API_DOMAIN`: Backend-API Domain
- `WHISPER_WEB_DOMAIN`: Frontend Web-Domain

## Traefik Integration

Das System ist für Traefik als Reverse Proxy konfiguriert:

- Automatische SSL-Zertifikate über Let's Encrypt
- HTTP zu HTTPS Weiterleitung
- Load Balancing

Stellen Sie sicher, dass ein Traefik-Netzwerk `web` existiert:

```bash
docker network create web
```

## Entwicklung

### Frontend entwickeln

```bash
cd frontend
npm install
npm run dev
```

### Backend entwickeln

```bash
cd api
pip install -r requirements.txt
uvicorn app:app --reload
```

## Wartung

### Datenbank zurücksetzen

```bash
./reset_database.sh
```

### Logs anzeigen

```bash
# Alle Services
docker compose logs -f

# Nur API
docker compose logs -f whisper-api

# Nur Frontend
docker compose logs -f whisper-web
```

### Container neu starten

```bash
docker compose restart
```

## Sicherheit

- Ändern Sie den `REGISTRATION_KEY` in der [`.env`](.env)
- Verwenden Sie sichere Passwörter
- API-Keys werden automatisch generiert
- Alle Daten sind benutzerspezifisch isoliert

## System-Anforderungen

### Minimum
- 4 GB RAM
- 2 CPU Cores
- 10 GB Speicher

### Empfohlen
- 8 GB RAM
- 4 CPU Cores
- 50 GB Speicher
- NVIDIA GPU (optional)

## Unterstützte Audio-Formate

- MP3, WAV, M4A, FLAC
- OGG, WEBM, MP4
- Alle von FFmpeg unterstützten Formate

## Lizenz

MIT License - siehe [LICENSE](LICENSE) für Details.

## Beitragen

1. Fork des Repositories
2. Feature-Branch erstellen (`git checkout -b feature/amazing-feature`)
3. Änderungen committen (`git commit -m 'Add amazing feature'`)
4. Branch pushen (`git push origin feature/amazing-feature`)
5. Pull Request erstellen

## Support

Bei Problemen erstellen Sie ein Issue im Repository oder kontaktieren Sie den Maintainer.