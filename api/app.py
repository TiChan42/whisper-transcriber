import os, shutil, sqlite3, secrets, json
from datetime import datetime
from fastapi import (
    FastAPI, File, UploadFile, Form, BackgroundTasks,
    HTTPException, Depends, Security, Request
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from fastapi.security import APIKeyHeader
from passlib.context import CryptContext
from faster_whisper import WhisperModel
import config

# ——— Konfiguration ———
DB_PATH = "data/whisper_jobs.db"

# ✅ Upload-Größe aus Umgebungsvariable
MAX_UPLOAD_SIZE_MB = int(os.environ.get("MAX_UPLOAD_SIZE_MB", "500"))
MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024

# Dynamische Modell-Konfiguration aus Umgebungsvariablen
WHISPER_MODELS_STR = os.environ.get("WHISPER_MODELS")
WHISPER_MODEL_LABELS_STR = os.environ.get("WHISPER_MODEL_LABELS")

AVAILABLE_MODELS = WHISPER_MODELS_STR.split(",")
MODEL_LABELS = WHISPER_MODEL_LABELS_STR.split(",")

# Fallback falls Labels nicht genug sind
while len(MODEL_LABELS) < len(AVAILABLE_MODELS):
    MODEL_LABELS.append(f"Modell {len(MODEL_LABELS) + 1}")

DEVICE = "cuda" if os.environ.get("CUDA_AVAILABLE") == "1" else "cpu"
COMPUTE_TYPE = "int8" if DEVICE == "cpu" else "float16"

print(f"🗂️  Maximale Upload-Größe: {MAX_UPLOAD_SIZE_MB} MB ({MAX_UPLOAD_SIZE_BYTES:,} Bytes)")

# ——— Security / Hashing ———
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
api_key_scheme = APIKeyHeader(name="X-API-Key", auto_error=False)

def get_current_user(api_key: str = Security(api_key_scheme)):
    """Verifiziert den API-Key und liefert den User aus der DB."""
    if not api_key:
        raise HTTPException(status_code=403, detail="API-Key fehlt")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT id, username FROM users WHERE api_key_plain=?", (api_key,))
    user = cur.fetchone()
    conn.close()
    if user:
        return {"id": user[0], "username": user[1]}
    raise HTTPException(status_code=401, detail="Ungültiger API-Key")

# ——— FastAPI & CORS ———
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[f"https://{os.environ.get('WHISPER_WEB_DOMAIN')}"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ——— Datenbank & Migrationen ———
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
conn = sqlite3.connect(DB_PATH)
# 1) users-Tabelle
conn.execute("""
CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    username       TEXT UNIQUE,
    password_hash  TEXT,
    api_key_hash   TEXT,
    created_at     TEXT
)
""")

# 2) jobs-Tabelle (bestehend) + migrations
conn.execute("""
CREATE TABLE IF NOT EXISTS jobs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    filename        TEXT,
    model           TEXT,
    status          TEXT,
    result          TEXT,
    created_at      TEXT
)
""")

cols = [r[1] for r in conn.execute("PRAGMA table_info(jobs)").fetchall()]
migs = []
if "alias"             not in cols: migs.append("ALTER TABLE jobs ADD COLUMN alias TEXT DEFAULT ''")
if "start_timestamp"   not in cols: migs.append("ALTER TABLE jobs ADD COLUMN start_timestamp TEXT")
if "progress"          not in cols: migs.append("ALTER TABLE jobs ADD COLUMN progress REAL DEFAULT 0.0")
if "duration"          not in cols: migs.append("ALTER TABLE jobs ADD COLUMN duration REAL")
if "user_id"           not in cols: migs.append("ALTER TABLE jobs ADD COLUMN user_id INTEGER")
if "detected_language" not in cols: migs.append("ALTER TABLE jobs ADD COLUMN detected_language TEXT")
if "audio_duration"    not in cols: migs.append("ALTER TABLE jobs ADD COLUMN audio_duration REAL")
if "file_size"         not in cols: migs.append("ALTER TABLE jobs ADD COLUMN file_size INTEGER")
if "error_message"     not in cols: migs.append("ALTER TABLE jobs ADD COLUMN error_message TEXT")
if "language_hint"     not in cols: migs.append("ALTER TABLE jobs ADD COLUMN language_hint TEXT")
for sql in migs:
    conn.execute(sql)

# Migration für API-Key im Klartext
user_cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
if "api_key_plain" not in user_cols:
    conn.execute("ALTER TABLE users ADD COLUMN api_key_plain TEXT")

conn.commit()
conn.close()

# ——— Whisper-Modelle dynamisch laden ———
loaded_models = {}
print(f"Lade Whisper-Modelle auf {DEVICE} mit {COMPUTE_TYPE}...")
for model_name in AVAILABLE_MODELS:
    print(f"  Lade Modell '{model_name}'...")
    try:
        loaded_models[model_name] = WhisperModel(model_name, device=DEVICE, compute_type=COMPUTE_TYPE)
        print(f"  ✓ Modell '{model_name}' erfolgreich geladen")
    except Exception as e:
        print(f"  ✗ Fehler beim Laden von '{model_name}': {e}")
        
print(f"Verfügbare Modelle: {list(loaded_models.keys())}")

def transcribe_file(filepath: str, model_choice: str) -> str:
    if model_choice not in loaded_models:
        raise ValueError(f"Modell '{model_choice}' nicht verfügbar")
    
    model = loaded_models[model_choice]
    segments, _ = model.transcribe(filepath)
    return "".join(s.text for s in segments)

def process_job(job_id: int, file_path: str, model_choice: str, user_id: int, language: str = "auto"):
    start = datetime.utcnow()
    conn = sqlite3.connect(DB_PATH)
    
    try:
        # Job als "processing" markieren
        conn.execute(
            "UPDATE jobs SET status=?, start_timestamp=?, progress=? WHERE id=?",
            ("processing", start.isoformat(), 0.1, job_id)  # ✅ Start mit 10%
        )
        conn.commit()

        # Datei-Info ermitteln
        file_size = os.path.getsize(file_path)
        
        # ✅ Progress: 20% nach Datei-Analyse
        conn.execute("UPDATE jobs SET progress=? WHERE id=?", (0.2, job_id))
        conn.commit()
        
        # Transkription mit verbessertem Fortschritts-Tracking
        model = loaded_models[model_choice]
        
        # ✅ Progress: 30% vor Transkription
        conn.execute("UPDATE jobs SET progress=? WHERE id=?", (0.3, job_id))
        conn.commit()
        
        # Whisper mit Sprach-Parameter
        segments, info = model.transcribe(
            file_path,
            beam_size=5,
            language=None if language == "auto" else language,
            task="transcribe"
        )
        
        # ✅ Segmentweise Fortschritts-Updates (30% bis 90%)
        all_segments = list(segments)
        total_segments = max(len(all_segments), 1)  # Verhindert Division durch 0
        text_parts = []
        
        for i, segment in enumerate(all_segments):
            text_parts.append(segment.text)
            
            # Fortschritt von 30% bis 90%
            segment_progress = 0.3 + (0.6 * (i + 1) / total_segments)
            
            # ✅ Nur alle 5 Segmente updaten für bessere Performance
            if i % 5 == 0 or i == total_segments - 1:
                conn_update = sqlite3.connect(DB_PATH)
                conn_update.execute(
                    "UPDATE jobs SET progress=? WHERE id=?",
                    (segment_progress, job_id)
                )
                conn_update.commit()
                conn_update.close()
        
        # ✅ Progress: 95% vor Finalisierung
        conn.execute("UPDATE jobs SET progress=? WHERE id=?", (0.95, job_id))
        conn.commit()
        
        # Finale Transkription zusammenfügen
        text = "".join(text_parts)
        
        # Zusätzliche Metadaten sammeln
        detected_language = info.language if hasattr(info, 'language') else 'unknown'
        audio_duration = info.duration if hasattr(info, 'duration') else None
        
        end = datetime.utcnow()
        duration = (end - start).total_seconds()
        
        # ✅ Job als abgeschlossen markieren (100%)
        conn.execute(
            """UPDATE jobs SET 
               status=?, result=?, progress=?, duration=?, 
               detected_language=?, audio_duration=?, file_size=?
               WHERE id=?""",
            ("completed", text, 1.0, duration, detected_language, audio_duration, file_size, job_id)
        )
        conn.commit()
        
    except Exception as e:
        end = datetime.utcnow()
        duration = (end - start).total_seconds()
        error_message = f"Error: {str(e)}"
        
        # ✅ Fehler mit aktuellem Fortschritt
        current_progress = conn.execute(
            "SELECT progress FROM jobs WHERE id=?", (job_id,)
        ).fetchone()
        progress_at_error = current_progress[0] if current_progress else 0.0
        
        conn.execute(
            "UPDATE jobs SET status=?, result=?, duration=?, error_message=? WHERE id=?",
            ("failed", error_message, duration, error_message, job_id)
        )
        conn.commit()
        
    finally:
        conn.close()
        try: 
            os.remove(file_path)
        except OSError: 
            pass

# ——— Auth & Registration ———

@app.post("/register")
def register(
    username: str = Form(...),
    password: str = Form(...),
    reg_key: str  = Form(...)
):
    """Neuen Benutzer anlegen (mit Registrierungsschlüssel)."""
    if reg_key != config.REGISTRATION_KEY:
        raise HTTPException(status_code=403, detail="Ungültiger Registrierungsschlüssel")
    pwd_hash = pwd_context.hash(password)
    api_plain = secrets.token_hex(16)
    api_hash  = pwd_context.hash(api_plain)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            "INSERT INTO users (username, password_hash, api_key_hash, api_key_plain, created_at) VALUES (?, ?, ?, ?, ?)",
            (username, pwd_hash, api_hash, api_plain, datetime.utcnow().isoformat())
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Benutzer existiert bereits")
    conn.close()
    return {"api_key": api_plain}

@app.post("/login")
async def login(request: Request):
    """Benutzer anmelden und festen API-Key zurückgeben."""
    content_type = request.headers.get("content-type", "")
    
    if "application/json" in content_type:
        body = await request.json()
        username = body.get("username")
        password = body.get("password")
    else:
        form = await request.form()
        username = form.get("username")
        password = form.get("password")
    
    if not username or not password:
        raise HTTPException(status_code=400, detail="Benutzername und Passwort erforderlich")
    
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT id, username, password_hash, api_key_plain FROM users WHERE username=?", (username,))
    user = cur.fetchone()
    conn.close()
    
    if not user:
        raise HTTPException(status_code=401, detail="Ungültiger Benutzername oder Passwort")
    
    user_id, stored_username, password_hash, api_key_plain = user
    
    if not pwd_context.verify(password, password_hash):
        raise HTTPException(status_code=401, detail="Ungültiger Benutzername oder Passwort")
    
    return {"api_key": api_key_plain, "username": stored_username}

# ——— Job-Endpoints (nur authentifizierte User) ———

@app.post("/jobs")
async def submit_job(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    model: str        = Form("base"),
    alias: str        = Form(""),
    language: str     = Form("auto"),
    current_user: dict = Depends(get_current_user)
):
    """Job asynchron anlegen."""
    
    # ✅ Dynamische Datei-Validierung
    if file.size > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=413, 
            detail=f"Datei zu groß (max. {MAX_UPLOAD_SIZE_MB} MB, erhalten: {file.size / (1024*1024):.1f} MB)"
        )
    
    # ✅ Erweiterte Audio-Format Validierung
    allowed_types = [
        'audio/mpeg',       # MP3
        'audio/mp3',        # MP3 (alternative)
        'audio/wav',        # WAV
        'audio/wave',       # WAV (alternative)
        'audio/x-wav',      # WAV (alternative)
        'audio/mp4',        # M4A
        'audio/m4a',        # M4A
        'audio/x-m4a',      # M4A (alternative)
        'audio/aac',        # M4A/AAC
        'audio/flac',       # FLAC
        'audio/x-flac',     # FLAC (alternative)
        'audio/ogg',        # OGG
        'audio/ogg; codecs=vorbis',  # OGG Vorbis
        'application/ogg'   # OGG (alternative)
    ]
    
    # Zusätzliche Dateiendung-Prüfung für bessere Kompatibilität
    file_extension = file.filename.lower().split('.')[-1] if file.filename else ''
    allowed_extensions = ['mp3', 'wav', 'm4a', 'flac', 'ogg']
    
    if file.content_type not in allowed_types and file_extension not in allowed_extensions:
        raise HTTPException(
            status_code=415, 
            detail=f"Nicht unterstütztes Audio-Format. Erlaubt: MP3, WAV, M4A, FLAC, OGG (erkannt: {file.content_type})"
        )
    
    # Sprach-Parameter validieren
    valid_languages = [
        'auto', 'de', 'en', 'fr', 'es', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 
        'ar', 'hi', 'nl', 'sv', 'da', 'no', 'pl', 'tr', 'uk', 'cs', 'el', 
        'fi', 'he', 'hu', 'is', 'id', 'lv', 'lt', 'mt', 'ro', 'sk', 'sl'
    ]
    if language not in valid_languages:
        raise HTTPException(status_code=400, detail=f"Nicht unterstützte Sprache: {language}")
    
    #  Aktive Jobs pro User begrenzen
    conn = sqlite3.connect(DB_PATH)
    active_jobs = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE user_id=? AND status IN ('processing', 'queued')",
        (current_user["id"],)
    ).fetchone()[0]
    
    if active_jobs >= 3:  # Max 3 gleichzeitige Jobs
        conn.close()
        raise HTTPException(status_code=429, detail="Zu viele aktive Jobs (max. 3)")
    
    #  Modell-Verfügbarkeit prüfen
    if model not in loaded_models:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Modell '{model}' nicht verfügbar")
    
    os.makedirs("data/uploads", exist_ok=True)
    fn = file.filename
    timestamp = datetime.utcnow().timestamp()
    path = f"data/uploads/{timestamp}_{fn}"
    
    # Datei speichern
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    file.file.close()

    #  Job in Datenbank erstellen mit Sprach-Parameter
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO jobs (
             filename, model, status, result, created_at, 
             alias, progress, user_id, file_size, language_hint
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (fn, model, "queued", "", datetime.utcnow().isoformat(), 
         alias, 0.0, current_user["id"], file.size, language if language != 'auto' else None)
    )
    job_id = cur.lastrowid
    conn.commit()
    conn.close()

    #  Hintergrund-Task mit Sprach-Parameter starten
    background_tasks.add_task(process_job, job_id, path, model, current_user["id"], language)
    
    return {
        "job_id": job_id, 
        "status": "queued", 
        "alias": alias,
        "language": language,
        "estimated_time": estimate_processing_time(file.size, model)
    }

def estimate_processing_time(file_size_bytes: int, model_name: str) -> int:
    """Schätzt die Verarbeitungszeit in Sekunden."""
    # Grobe Schätzung basierend auf Dateigröße und Modell
    size_mb = file_size_bytes / (1024 * 1024)
    
    # Zeit-Faktoren pro Modell
    time_factors = {
        'tiny': 0.1,
        'base': 0.2,
        'small': 0.5,
        'medium': 1.0,
        'large': 2.0,
        'large-v2': 2.0,
        'large-v3': 2.5
    }
    
    factor = time_factors.get(model_name, 1.0)
    estimated_seconds = int(size_mb * factor * 10)  # Grobe Formel
    
    return max(30, estimated_seconds)  # Mindestens 30 Sekunden

@app.get("/jobs")
def list_all_jobs(current_user: dict = Depends(get_current_user)):
    """Alle Jobs des aktuellen Users zurückliefern."""
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        """SELECT id, alias, status, progress, duration, filename, model, 
                  created_at, detected_language, audio_duration, file_size
           FROM jobs WHERE user_id=? ORDER BY created_at DESC""",
        (current_user["id"],)
    ).fetchall()
    conn.close()
    return [
        {
            "id": r[0], 
            "alias": r[1], 
            "status": r[2], 
            "progress": r[3], 
            "duration": r[4],
            "filename": r[5],
            "model": r[6],
            "created_at": r[7],
            "detected_language": r[8],
            "audio_duration": r[9],
            "file_size": r[10]
        }
        for r in rows
    ]

@app.get("/jobs/{job_id}")
def get_job(
    job_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Details eines einzelnen Jobs (nur, wenn er dem User gehört)."""
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        """SELECT id, filename, model, status, result, created_at,
                  alias, start_timestamp, progress, duration,
                  detected_language, audio_duration, file_size, error_message
           FROM jobs WHERE id=? AND user_id=?""",
        (job_id, current_user["id"])
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Job nicht gefunden")
    return {
        "id":                row[0],
        "filename":          row[1],
        "model":             row[2],
        "status":            row[3],
        "result":            row[4],
        "created_at":        row[5],
        "alias":             row[6],
        "start_timestamp":   row[7],
        "progress":          row[8],
        "duration":          row[9],
        "detected_language": row[10],
        "audio_duration":    row[11],
        "file_size":         row[12],
        "error_message":     row[13]
    }

@app.get("/jobs/alias/{alias_name}")
def get_jobs_by_alias(
    alias_name: str,
    current_user: dict = Depends(get_current_user)
):
    """Jobs per Alias (nur eigene)."""
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT id, filename, model, status, created_at FROM jobs WHERE alias=? AND user_id=?",
        (alias_name, current_user["id"])
    ).fetchall()
    conn.close()
    return {
        "alias": alias_name,
        "jobs": [
            {"id": r[0], "filename": r[1], "model": r[2], "status": r[3], "created_at": r[4]}
            for r in rows
        ]
    }

@app.delete("/jobs/{job_id}")
def delete_job(
    job_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Löscht eigenen Job."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM jobs WHERE id=? AND user_id=?", (job_id, current_user["id"]))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Job nicht gefunden")
    cur.execute("DELETE FROM jobs WHERE id=? AND user_id=?", (job_id, current_user["id"]))
    conn.commit()
    conn.close()
    return {"deleted_job_id": job_id}

@app.delete("/jobs/alias/{alias_name}")
def delete_jobs_by_alias(
    alias_name: str,
    current_user: dict = Depends(get_current_user)
):
    """Löscht alle eigenen Jobs zu einem Alias."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("DELETE FROM jobs WHERE alias=? AND user_id=?", (alias_name, current_user["id"]))
    deleted = conn.total_changes
    conn.commit()
    conn.close()
    return {"alias": alias_name, "deleted_count": deleted}

@app.get("/jobs/{job_id}/download")
def download_result(
    job_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Resultat herunterladen (nur eigen)."""
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT result FROM jobs WHERE id=? AND user_id=?", (job_id, current_user["id"])
    ).fetchone()
    conn.close()
    if not row or row[0] is None:
        raise HTTPException(status_code=404, detail="Result not found")
    headers = {"Content-Disposition": f"attachment; filename=transcription_{job_id}.txt"}
    return PlainTextResponse(content=row[0], media_type="text/plain", headers=headers)

@app.post("/transcribe")
async def transcribe_sync(
    file: UploadFile = File(...),
    model: str        = Form("fast"),
    current_user: dict = Depends(get_current_user)
):
    """Synchrones Transkribieren (API-Key nötig)."""
    os.makedirs("data/temp", exist_ok=True)
    tmp = f"data/temp/{datetime.utcnow().timestamp()}_{file.filename}"
    with open(tmp, "wb") as f:
        shutil.copyfileobj(file.file, f)
    file.file.close()
    text = transcribe_file(tmp, model)
    try: os.remove(tmp)
    except: pass
    return {"text": text}

# ——— Neue Endpoint für verfügbare Modelle ———
@app.get("/models")
def get_available_models():
    """Liefert verfügbare Modelle und ihre Labels zurück."""
    models = []
    for i, model_name in enumerate(AVAILABLE_MODELS):
        if model_name in loaded_models:
            models.append({
                "value": model_name,
                "label": MODEL_LABELS[i] if i < len(MODEL_LABELS) else model_name,
                "loaded": True
            })
        else:
            models.append({
                "value": model_name,
                "label": MODEL_LABELS[i] if i < len(MODEL_LABELS) else model_name,
                "loaded": False
            })
    return {"models": models}

#  Neuer Endpoint für verfügbare Sprachen
@app.get("/languages")
def get_available_languages():
    """Liefert verfügbare Sprachen für die Transkription zurück."""
    languages = [
        {"code": "auto", "name": "Automatisch erkennen", "flag": "🌐"},
        {"code": "de", "name": "Deutsch", "flag": "🇩🇪"},
        {"code": "en", "name": "English", "flag": "🇺🇸"},
        {"code": "fr", "name": "Français", "flag": "🇫🇷"},
        {"code": "es", "name": "Español", "flag": "🇪🇸"},
        {"code": "it", "name": "Italiano", "flag": "🇮🇹"},
        {"code": "pt", "name": "Português", "flag": "🇵🇹"},
        {"code": "ru", "name": "Русский", "flag": "🇷🇺"},
        {"code": "ja", "name": "日本語", "flag": "🇯🇵"},
        {"code": "ko", "name": "한국어", "flag": "🇰🇷"},
        {"code": "zh", "name": "中文", "flag": "🇨🇳"},
        {"code": "ar", "name": "العربية", "flag": "🇸🇦"},
        {"code": "hi", "name": "हिन्दी", "flag": "🇮🇳"},
        {"code": "nl", "name": "Nederlands", "flag": "🇳🇱"},
        {"code": "sv", "name": "Svenska", "flag": "🇸🇪"},
        {"code": "da", "name": "Dansk", "flag": "🇩🇰"},
        {"code": "no", "name": "Norsk", "flag": "🇳🇴"},
        {"code": "pl", "name": "Polski", "flag": "🇵🇱"},
        {"code": "tr", "name": "Türkçe", "flag": "🇹🇷"},
        {"code": "uk", "name": "Українська", "flag": "🇺🇦"},
        {"code": "cs", "name": "Čeština", "flag": "🇨🇿"},
        {"code": "el", "name": "Ελληνικά", "flag": "🇬🇷"},
        {"code": "fi", "name": "Suomi", "flag": "🇫🇮"},
        {"code": "he", "name": "עברית", "flag": "🇮🇱"},
        {"code": "hu", "name": "Magyar", "flag": "🇭🇺"},
        {"code": "is", "name": "Íslenska", "flag": "🇮🇸"},
        {"code": "id", "name": "Bahasa Indonesia", "flag": "🇮🇩"},
        {"code": "lv", "name": "Latviešu", "flag": "🇱🇻"},
        {"code": "lt", "name": "Lietuvių", "flag": "🇱🇹"},
        {"code": "mt", "name": "Malti", "flag": "🇲🇹"},
        {"code": "ro", "name": "Română", "flag": "🇷🇴"},
        {"code": "sk", "name": "Slovenčina", "flag": "🇸🇰"},
        {"code": "sl", "name": "Slovenščina", "flag": "🇸🇮"}
    ]
    return {"languages": languages}

# ✅ Neuer Endpoint für Upload-Limits
@app.get("/upload-limits")
def get_upload_limits():
    """Liefert Upload-Beschränkungen zurück."""
    return {
        "max_size_mb": MAX_UPLOAD_SIZE_MB,
        "max_size_bytes": MAX_UPLOAD_SIZE_BYTES,
        "supported_formats": ["MP3", "WAV", "M4A", "FLAC", "OGG"],
        "max_concurrent_jobs": 3
    }

# ✅ Neuer Endpoint für API-Dokumentation
@app.get("/api-docs")
def get_api_documentation():
    """Liefert vollständige API-Dokumentation mit dynamischen Parametern zurück."""
    
    # Base URL für die API
    base_url = f"https://{os.environ.get('WHISPER_API_DOMAIN', 'localhost:5000')}"
    
    # Verfügbare Modelle abrufen
    available_models = []
    for i, model_name in enumerate(AVAILABLE_MODELS):
        if model_name in loaded_models:
            available_models.append({
                "value": model_name,
                "label": MODEL_LABELS[i] if i < len(MODEL_LABELS) else model_name
            })
    
    # Verfügbare Sprachen
    available_languages = [
        {"code": "auto", "name": "Automatisch erkennen", "flag": "🌐"},
        {"code": "de", "name": "Deutsch", "flag": "🇩🇪"},
        {"code": "en", "name": "English", "flag": "🇺🇸"},
        {"code": "fr", "name": "Français", "flag": "🇫🇷"},
        {"code": "es", "name": "Español", "flag": "🇪🇸"},
        {"code": "it", "name": "Italiano", "flag": "🇮🇹"},
        {"code": "pt", "name": "Português", "flag": "🇵🇹"},
        {"code": "ru", "name": "Русский", "flag": "🇷🇺"}
    ]
    
    # API-Endpunkte-Definition
    endpoints = [
        {
            "id": "upload",
            "title": "Upload & Transkription",
            "method": "POST",
            "path": "/jobs",
            "description": "Neue Audio-Datei hochladen und Transkription starten",
            "icon": "upload",
            "badge": "Haupt-API",
            "requires_auth": True,
            "parameters": [
                {
                    "name": "file",
                    "type": "file",
                    "required": True,
                    "description": "Audio-Datei (MP3, WAV, M4A, FLAC, OGG)",
                    "max_size_mb": MAX_UPLOAD_SIZE_MB
                },
                {
                    "name": "model",
                    "type": "string",
                    "required": False,
                    "default": "base",
                    "description": "Whisper-Modell",
                    "options": available_models
                },
                {
                    "name": "language",
                    "type": "string", 
                    "required": False,
                    "default": "auto",
                    "description": "Sprache für bessere Erkennung",
                    "options": available_languages
                },
                {
                    "name": "alias",
                    "type": "string",
                    "required": False,
                    "description": "Optionaler Name für die Transkription"
                }
            ],
            "response_example": {
                "job_id": 123,
                "status": "queued",
                "alias": "Meeting-Protokoll",
                "language": "de",
                "estimated_time": 180
            }
        },
        {
            "id": "list-jobs",
            "title": "Jobs auflisten",
            "method": "GET", 
            "path": "/jobs",
            "description": "Alle eigenen Transkriptions-Jobs abrufen",
            "icon": "history",
            "badge": "Liste",
            "requires_auth": True,
            "parameters": [],
            "response_example": [
                {
                    "id": 123,
                    "alias": "Meeting-Protokoll",
                    "status": "completed",
                    "progress": 1.0,
                    "filename": "meeting.mp3",
                    "model": "base",
                    "created_at": "2024-01-15T10:30:00",
                    "detected_language": "de",
                    "audio_duration": 1800.5,
                    "file_size": 25600000
                }
            ]
        },
        {
            "id": "get-job",
            "title": "Einzelnen Job abrufen",
            "method": "GET",
            "path": "/jobs/{id}",
            "description": "Details und Transkript eines spezifischen Jobs",
            "icon": "download",
            "badge": "Details",
            "requires_auth": True,
            "parameters": [
                {
                    "name": "id",
                    "type": "integer",
                    "required": True,
                    "description": "Job-ID"
                }
            ],
            "response_example": {
                "id": 123,
                "filename": "meeting.mp3",
                "model": "base",
                "status": "completed",
                "result": "Das ist das transkribierte Audio...",
                "created_at": "2024-01-15T10:30:00",
                "progress": 1.0,
                "duration": 45.2,
                "detected_language": "de",
                "audio_duration": 1800.5
            }
        },
        {
            "id": "download",
            "title": "Transkript herunterladen", 
            "method": "GET",
            "path": "/jobs/{id}/download",
            "description": "Transkript als Textdatei herunterladen",
            "icon": "file_download",
            "badge": "Export",
            "requires_auth": True,
            "parameters": [
                {
                    "name": "id",
                    "type": "integer",
                    "required": True,
                    "description": "Job-ID"
                }
            ],
            "response_example": "text/plain content with transcript"
        },
        {
            "id": "delete-job",
            "title": "Job löschen",
            "method": "DELETE",
            "path": "/jobs/{id}",
            "description": "Einen Job und seine Daten löschen",
            "icon": "delete",
            "badge": "Löschen",
            "requires_auth": True,
            "parameters": [
                {
                    "name": "id",
                    "type": "integer",
                    "required": True,
                    "description": "Job-ID zum Löschen"
                }
            ],
            "response_example": {
                "deleted_job_id": 123
            }
        },
        {
            "id": "models",
            "title": "Verfügbare Modelle",
            "method": "GET",
            "path": "/models",
            "description": "Liste aller verfügbaren Whisper-Modelle",
            "icon": "model_training",
            "badge": "Info",
            "requires_auth": False,
            "parameters": [],
            "response_example": {
                "models": available_models
            }
        },
        {
            "id": "languages",
            "title": "Unterstützte Sprachen",
            "method": "GET", 
            "path": "/languages",
            "description": "Liste aller unterstützten Sprachen für die Transkription",
            "icon": "language",
            "badge": "Info", 
            "requires_auth": False,
            "parameters": [],
            "response_example": {
                "languages": available_languages
            }
        },
        {
            "id": "upload-limits",
            "title": "Upload-Limits",
            "method": "GET",
            "path": "/upload-limits", 
            "description": "Aktuelle Upload-Beschränkungen abrufen",
            "icon": "info",
            "badge": "Info",
            "requires_auth": False,
            "parameters": [],
            "response_example": {
                "max_size_mb": MAX_UPLOAD_SIZE_MB,
                "max_size_bytes": MAX_UPLOAD_SIZE_BYTES,
                "supported_formats": ["MP3", "WAV", "M4A", "FLAC", "OGG"],
                "max_concurrent_jobs": 3
            }
        },
        {
            "id": "sync-transcribe",
            "title": "Synchrone Transkription",
            "method": "POST",
            "path": "/transcribe",
            "description": "Direkte Transkription ohne Job-System (für kleine Dateien)",
            "icon": "play_arrow",
            "badge": "Direkt",
            "requires_auth": True,
            "parameters": [
                {
                    "name": "file",
                    "type": "file",
                    "required": True,
                    "description": "Kleine Audio-Datei (empfohlen < 10 MB)"
                },
                {
                    "name": "model",
                    "type": "string",
                    "required": False,
                    "default": "tiny",
                    "description": "Whisper-Modell (empfohlen: tiny für Geschwindigkeit)",
                    "options": available_models
                }
            ],
            "response_example": {
                "text": "Das ist das sofort transkribierte Audio..."
            }
        }
    ]
    
    return {
        "base_url": base_url,
        "version": "1.0",
        "endpoints": endpoints,
        "authentication": {
            "type": "API-Key",
            "header": "X-API-Key",
            "description": "API-Key im Header für authentifizierte Endpunkte"
        },
        "limits": {
            "max_upload_size_mb": MAX_UPLOAD_SIZE_MB,
            "max_concurrent_jobs": 3,
            "supported_formats": ["MP3", "WAV", "M4A", "FLAC", "OGG"]
        }
    }
