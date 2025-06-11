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

# Endpoint-Module importieren
from endpoints.auth import register_auth_endpoints
from endpoints.jobs import register_job_endpoints
from endpoints.info import register_info_endpoints
from endpoints.transcribe import register_transcribe_endpoints
from endpoints.api_docs import register_api_docs_endpoints
from utils.api_language_utils import load_available_api_languages
from utils.database import db_manager
from utils.api_docs_manager import api_docs_manager  # ✅ Neue API-Docs-Manager

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

# ✅ Zentrale API-Sprachdaten laden (für zukünftiges UI-Sprachsystem vorbereitet)
AVAILABLE_API_LANGUAGES = load_available_api_languages()
print(f"🌐 Geladene API-Sprachen: {len(AVAILABLE_API_LANGUAGES)} verfügbar")

# ——— Security / Hashing ———
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
api_key_scheme = APIKeyHeader(name="X-API-Key", auto_error=False)

def get_current_user(api_key: str = Security(api_key_scheme)):
    """Verifiziert den API-Key und liefert den User aus der DB."""
    if not api_key:
        raise HTTPException(status_code=403, detail="API-Key fehlt")
    
    user = db_manager.get_user_by_api_key(api_key)
    if user:
        return user
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

# ——— Datenbank initialisieren ———
db_manager.initialize_database()

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

# ✅ API-Dokumentations-Manager konfigurieren
api_docs_manager.configure(
    available_models=AVAILABLE_MODELS,
    model_labels=MODEL_LABELS,
    loaded_models=loaded_models,
    max_upload_size_mb=MAX_UPLOAD_SIZE_MB,
    max_upload_size_bytes=MAX_UPLOAD_SIZE_BYTES,
    available_api_languages=AVAILABLE_API_LANGUAGES,
    base_url=f"https://{os.environ.get('WHISPER_API_DOMAIN')}"
)

def transcribe_file(filepath: str, model_choice: str) -> str:
    if model_choice not in loaded_models:
        raise ValueError(f"Modell '{model_choice}' nicht verfügbar")
    
    model = loaded_models[model_choice]
    segments, _ = model.transcribe(filepath)
    return "".join(s.text for s in segments)

def process_job(job_id: int, file_path: str, model_choice: str, user_id: int, language: str = "auto"):
    start = datetime.utcnow()
    
    try:
        # Job als "processing" markieren
        db_manager.update_job_status(
            job_id, 
            "processing", 
            start_timestamp=start.isoformat(), 
            progress=0.1
        )

        # Datei-Info ermitteln
        file_size = os.path.getsize(file_path)
        
        # Progress: 20% nach Datei-Analyse
        db_manager.update_job_status(job_id, "processing", progress=0.2)
        
        # Transkription mit verbessertem Fortschritts-Tracking
        model = loaded_models[model_choice]
        
        # Progress: 30% vor Transkription
        db_manager.update_job_status(job_id, "processing", progress=0.3)
        
        # Whisper mit Sprach-Parameter
        segments, info = model.transcribe(
            file_path,
            beam_size=5,
            language=None if language == "auto" else language,
            task="transcribe"
        )
        
        # Segmentweise Fortschritts-Updates (30% bis 90%)
        all_segments = list(segments)
        total_segments = max(len(all_segments), 1)
        text_parts = []
        
        for i, segment in enumerate(all_segments):
            text_parts.append(segment.text)
            
            # Fortschritt von 30% bis 90%
            segment_progress = 0.3 + (0.6 * (i + 1) / total_segments)
            
            # Nur alle 5 Segmente updaten für bessere Performance
            if i % 5 == 0 or i == total_segments - 1:
                db_manager.update_job_status(job_id, "processing", progress=segment_progress)
        
        # Progress: 95% vor Finalisierung
        db_manager.update_job_status(job_id, "processing", progress=0.95)
        
        # Finale Transkription zusammenfügen
        text = "".join(text_parts)
        
        # Zusätzliche Metadaten sammeln
        detected_language = info.language if hasattr(info, 'language') else 'unknown'
        audio_duration = info.duration if hasattr(info, 'duration') else None
        
        end = datetime.utcnow()
        duration = (end - start).total_seconds()
        
        # Job als abgeschlossen markieren (100%)
        db_manager.update_job_status(
            job_id,
            "completed",
            result=text,
            progress=1.0,
            duration=duration,
            detected_language=detected_language,
            audio_duration=audio_duration,
            file_size=file_size
        )
        
    except Exception as e:
        end = datetime.utcnow()
        duration = (end - start).total_seconds()
        error_message = f"Error: {str(e)}"
        
        # Fehler mit aktuellem Fortschritt
        current_progress = db_manager.get_job_progress(job_id) or 0.0
        
        db_manager.update_job_status(
            job_id,
            "failed",
            result=error_message,
            duration=duration,
            error_message=error_message
        )
        
    finally:
        try: 
            os.remove(file_path)
        except OSError: 
            pass

# ——— Endpunkte registrieren ———
# Auth-Endpunkte
register_auth_endpoints(app, pwd_context, DB_PATH)

# Job-Endpunkte
register_job_endpoints(app, get_current_user, loaded_models, MAX_UPLOAD_SIZE_MB, MAX_UPLOAD_SIZE_BYTES, DB_PATH, process_job, AVAILABLE_API_LANGUAGES)

# Info-Endpunkte
register_info_endpoints(app, AVAILABLE_MODELS, MODEL_LABELS, loaded_models, MAX_UPLOAD_SIZE_MB, MAX_UPLOAD_SIZE_BYTES, AVAILABLE_API_LANGUAGES)

# Transkriptions-Endpunkte
register_transcribe_endpoints(app, get_current_user, transcribe_file)

# API-Dokumentations-Endpunkt (✅ Vereinfacht)
register_api_docs_endpoints(app)



