import sqlite3
import os
from datetime import datetime
from typing import Optional, Dict, Any, List

DB_PATH = "data/whisper_jobs.db"

class DatabaseManager:
    """Zentrale Datenbank-Verwaltung für die Whisper API"""
    
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self.ensure_database_exists()
    
    def ensure_database_exists(self):
        """Stellt sicher, dass das Datenbank-Verzeichnis existiert"""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
    
    def get_connection(self) -> sqlite3.Connection:
        """Gibt eine neue Datenbankverbindung zurück"""
        return sqlite3.connect(self.db_path)
    
    def initialize_database(self):
        """Initialisiert die Datenbank mit allen Tabellen und Migrationen"""
        conn = self.get_connection()
        try:
            self._create_tables(conn)
            self._run_migrations(conn)
            conn.commit()
        finally:
            conn.close()
    
    def _create_tables(self, conn: sqlite3.Connection):
        """Erstellt alle benötigten Tabellen"""
        # Users-Tabelle
        conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            username       TEXT UNIQUE,
            password_hash  TEXT,
            api_key_hash   TEXT,
            created_at     TEXT
        )
        """)
        
        # Jobs-Tabelle
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
    
    def _run_migrations(self, conn: sqlite3.Connection):
        """Führt alle Datenbankmigrationen aus"""
        # Jobs-Tabelle Migrationen
        self._migrate_jobs_table(conn)
        # Users-Tabelle Migrationen
        self._migrate_users_table(conn)
    
    def _migrate_jobs_table(self, conn: sqlite3.Connection):
        """Migriert die Jobs-Tabelle"""
        cols = [r[1] for r in conn.execute("PRAGMA table_info(jobs)").fetchall()]
        migrations = []
        
        if "alias" not in cols:
            migrations.append("ALTER TABLE jobs ADD COLUMN alias TEXT DEFAULT ''")
        if "start_timestamp" not in cols:
            migrations.append("ALTER TABLE jobs ADD COLUMN start_timestamp TEXT")
        if "progress" not in cols:
            migrations.append("ALTER TABLE jobs ADD COLUMN progress REAL DEFAULT 0.0")
        if "duration" not in cols:
            migrations.append("ALTER TABLE jobs ADD COLUMN duration REAL")
        if "user_id" not in cols:
            migrations.append("ALTER TABLE jobs ADD COLUMN user_id INTEGER")
        if "detected_language" not in cols:
            migrations.append("ALTER TABLE jobs ADD COLUMN detected_language TEXT")
        if "audio_duration" not in cols:
            migrations.append("ALTER TABLE jobs ADD COLUMN audio_duration REAL")
        if "file_size" not in cols:
            migrations.append("ALTER TABLE jobs ADD COLUMN file_size INTEGER")
        if "error_message" not in cols:
            migrations.append("ALTER TABLE jobs ADD COLUMN error_message TEXT")
        if "language_hint" not in cols:
            migrations.append("ALTER TABLE jobs ADD COLUMN language_hint TEXT")
        
        for sql in migrations:
            conn.execute(sql)
    
    def _migrate_users_table(self, conn: sqlite3.Connection):
        """Migriert die Users-Tabelle"""
        user_cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
        if "api_key_plain" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN api_key_plain TEXT")

    # ——— User-Operationen ———
    def get_user_by_api_key(self, api_key: str) -> Optional[Dict[str, Any]]:
        """Findet einen User anhand des API-Keys"""
        conn = self.get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT id, username FROM users WHERE api_key_plain=?", (api_key,))
            user = cur.fetchone()
            if user:
                return {"id": user[0], "username": user[1]}
            return None
        finally:
            conn.close()
    
    def create_user(self, username: str, password_hash: str, api_key_hash: str, api_key_plain: str) -> int:
        """Erstellt einen neuen User"""
        conn = self.get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                """INSERT INTO users (username, password_hash, api_key_hash, api_key_plain, created_at) 
                   VALUES (?, ?, ?, ?, ?)""",
                (username, password_hash, api_key_hash, api_key_plain, datetime.utcnow().isoformat())
            )
            conn.commit()
            return cur.lastrowid
        finally:
            conn.close()
    
    def get_user_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        """Findet einen User anhand des Usernamens"""
        conn = self.get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT id, username, password_hash FROM users WHERE username=?", (username,))
            user = cur.fetchone()
            if user:
                return {"id": user[0], "username": user[1], "password_hash": user[2]}
            return None
        finally:
            conn.close()

    def get_user_api_key(self, user_id: int) -> Optional[str]:
        """Holt den API-Key eines Users"""
        conn = self.get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT api_key_plain FROM users WHERE id=?", (user_id,))
            result = cur.fetchone()
            return result[0] if result else None
        finally:
            conn.close()

    # ——— Job-Operationen ———
    def create_job(self, filename: str, model: str, user_id: int, alias: str = "", language_hint: str = "auto") -> int:
        """Erstellt einen neuen Job"""
        conn = self.get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                """INSERT INTO jobs (filename, model, status, created_at, user_id, alias, language_hint) 
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (filename, model, "pending", datetime.utcnow().isoformat(), user_id, alias, language_hint)
            )
            conn.commit()
            return cur.lastrowid
        finally:
            conn.close()
    
    def update_job_status(self, job_id: int, status: str, **kwargs):
        """Aktualisiert den Status und weitere Felder eines Jobs"""
        conn = self.get_connection()
        try:
            # Dynamisches Update basierend auf übergebenen kwargs
            set_clauses = ["status = ?"]
            values = [status]
            
            for key, value in kwargs.items():
                if key in ["progress", "start_timestamp", "duration", "result", 
                          "detected_language", "audio_duration", "file_size", "error_message"]:
                    set_clauses.append(f"{key} = ?")
                    values.append(value)
            
            values.append(job_id)
            sql = f"UPDATE jobs SET {', '.join(set_clauses)} WHERE id = ?"
            
            conn.execute(sql, values)
            conn.commit()
        finally:
            conn.close()
    
    def get_job(self, job_id: int) -> Optional[Dict[str, Any]]:
        """Holt einen einzelnen Job"""
        conn = self.get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT * FROM jobs WHERE id=?", (job_id,))
            row = cur.fetchone()
            if row:
                columns = [description[0] for description in cur.description]
                return dict(zip(columns, row))
            return None
        finally:
            conn.close()
    
    def get_jobs_by_user(self, user_id: int) -> List[Dict[str, Any]]:
        """Holt alle Jobs eines Users"""
        conn = self.get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT * FROM jobs WHERE user_id=? ORDER BY created_at DESC", (user_id,))
            rows = cur.fetchall()
            columns = [description[0] for description in cur.description]
            return [dict(zip(columns, row)) for row in rows]
        finally:
            conn.close()
    
    def delete_job(self, job_id: int, user_id: int) -> bool:
        """Löscht einen Job (nur wenn er dem User gehört)"""
        conn = self.get_connection()
        try:
            cur = conn.cursor()
            cur.execute("DELETE FROM jobs WHERE id=? AND user_id=?", (job_id, user_id))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()
    
    def get_job_progress(self, job_id: int) -> Optional[float]:
        """Holt den aktuellen Fortschritt eines Jobs"""
        conn = self.get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT progress FROM jobs WHERE id=?", (job_id,))
            result = cur.fetchone()
            return result[0] if result else None
        finally:
            conn.close()
    
    def delete_all_user_jobs(self, user_id: int):
        """Löscht alle Jobs eines Benutzers"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM jobs WHERE user_id = ?",
                (user_id,)
            )
            conn.commit()
    
    def delete_user(self, user_id: int):
        """Löscht einen Benutzer"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM users WHERE id = ?",
                (user_id,)
            )
            conn.commit()

# Globale Instanz für einfache Verwendung
db_manager = DatabaseManager()