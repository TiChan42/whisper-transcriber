import os, shutil, sqlite3, secrets
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
DB_PATH                = "data/whisper_jobs.db"
FAST_MODEL_NAME        = "tiny"
ACCURATE_MODEL_NAME    = "small"
DEVICE                 = "cuda" if os.environ.get("CUDA_AVAILABLE") == "1" else "cpu"
FAST_MODEL_COMPUTE     = "int8" if DEVICE == "cpu" else "float16"
ACCURATE_MODEL_COMPUTE = "int8" if DEVICE == "cpu" else "float16"

# ——— Security / Hashing ———
pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
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
    allow_origins=["https://whisper.shape-z.de"],
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
if "alias"           not in cols: migs.append("ALTER TABLE jobs ADD COLUMN alias TEXT DEFAULT ''")
if "start_timestamp" not in cols: migs.append("ALTER TABLE jobs ADD COLUMN start_timestamp TEXT")
if "progress"        not in cols: migs.append("ALTER TABLE jobs ADD COLUMN progress REAL DEFAULT 0.0")
if "duration"        not in cols: migs.append("ALTER TABLE jobs ADD COLUMN duration REAL")
if "user_id"         not in cols: migs.append("ALTER TABLE jobs ADD COLUMN user_id INTEGER")
for sql in migs:
    conn.execute(sql)

# Migration für API-Key im Klartext
user_cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
if "api_key_plain" not in user_cols:
    conn.execute("ALTER TABLE users ADD COLUMN api_key_plain TEXT")

conn.commit()
conn.close()

# ——— Whisper-Modelle laden ———
print(f"Lade schnelles Modell '{FAST_MODEL_NAME}' auf {DEVICE} …")
model_fast     = WhisperModel(FAST_MODEL_NAME,     device=DEVICE, compute_type=FAST_MODEL_COMPUTE)
print(f"Lade präzises Modell '{ACCURATE_MODEL_NAME}' auf {DEVICE} …")
model_accurate = WhisperModel(ACCURATE_MODEL_NAME, device=DEVICE, compute_type=ACCURATE_MODEL_COMPUTE)
print("Modelle geladen.")

def transcribe_file(filepath: str, model_choice: str) -> str:
    m = model_fast if model_choice == "fast" else model_accurate
    segments, _ = m.transcribe(filepath)
    return "".join(s.text for s in segments)

def process_job(job_id: int, file_path: str, model_choice: str, user_id: int):
    start = datetime.utcnow()
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "UPDATE jobs SET status=?, start_timestamp=?, progress=?, user_id=? WHERE id=?",
        ("processing", start.isoformat(), 0.0, user_id, job_id)
    )
    conn.commit()

    try:
        text = transcribe_file(file_path, model_choice)
        end = datetime.utcnow()
        duration = (end - start).total_seconds()
        conn.execute(
            "UPDATE jobs SET status=?, result=?, progress=?, duration=? WHERE id=?",
            ("completed", text, 1.0, duration, job_id)
        )
        conn.commit()
    except Exception as e:
        end = datetime.utcnow()
        duration = (end - start).total_seconds()
        conn.execute(
            "UPDATE jobs SET status=?, result=?, progress=?, duration=? WHERE id=?",
            ("failed", f"Error: {e}", 1.0, duration, job_id)
        )
        conn.commit()
    finally:
        conn.close()
        try: os.remove(file_path)
        except OSError: pass

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
    model: str        = Form("fast"),
    alias: str        = Form(""),
    current_user: dict = Depends(get_current_user)
):
    """Job asynchron anlegen."""
    os.makedirs("data/uploads", exist_ok=True)
    fn   = file.filename
    path = f"data/uploads/{datetime.utcnow().timestamp()}_{fn}"
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    file.file.close()

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO jobs (
             filename, model, status, result,
             created_at, alias, progress, user_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (fn, model, "queued", "", datetime.utcnow().isoformat(), alias, 0.0, current_user["id"])
    )
    job_id = cur.lastrowid
    conn.commit()
    conn.close()

    background_tasks.add_task(process_job, job_id, path, model, current_user["id"])
    return {"job_id": job_id, "status": "queued", "alias": alias}

@app.get("/jobs")
def list_all_jobs(current_user: dict = Depends(get_current_user)):
    """Alle Jobs des aktuellen Users zurückliefern."""
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT id, alias, status, progress, duration FROM jobs WHERE user_id=? ORDER BY created_at DESC",
        (current_user["id"],)
    ).fetchall()
    conn.close()
    return [
        {"id": r[0], "alias": r[1], "status": r[2], "progress": r[3], "duration": r[4]}
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
                  alias, start_timestamp, progress, duration
           FROM jobs WHERE id=? AND user_id=?""",
        (job_id, current_user["id"])
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Job nicht gefunden")
    return {
        "id":              row[0],
        "filename":        row[1],
        "model":           row[2],
        "status":          row[3],
        "result":          row[4],
        "created_at":      row[5],
        "alias":           row[6],
        "start_timestamp": row[7],
        "progress":        row[8],
        "duration":        row[9],
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
