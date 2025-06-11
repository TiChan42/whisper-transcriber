# Beschreibung
# Job-Management-Endpunkte für Transkriptions-Jobs

# Abhängigkeiten
import os
import shutil
from datetime import datetime
from fastapi import FastAPI, File, UploadFile, Form, BackgroundTasks, HTTPException, Depends
from fastapi.responses import PlainTextResponse
from utils.database import db_manager  # ✅ Neue Database Utils

# Endpunkte
def register_job_endpoints(app: FastAPI, get_current_user, loaded_models, max_upload_size_mb, max_upload_size_bytes, db_path, process_job, available_api_languages):
    
    @app.post("/jobs")
    async def create_job(
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...),
        model: str = Form(...),
        alias: str = Form(""),
        language: str = Form("auto"),
        user = Depends(get_current_user)
    ):
        # Dateigrößen-Validierung
        content = await file.read()
        if len(content) > max_upload_size_bytes:
            raise HTTPException(
                status_code=413, 
                detail=f"Datei zu groß. Maximum: {max_upload_size_mb} MB"
            )
        
        # Modell-Validierung
        if model not in loaded_models:
            raise HTTPException(status_code=400, detail=f"Modell '{model}' nicht verfügbar")
        
        # Temporäre Datei erstellen
        os.makedirs("temp", exist_ok=True)
        temp_path = f"temp/{file.filename}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        with open(temp_path, "wb") as f:
            f.write(content)
        
        # Job in DB erstellen
        job_id = db_manager.create_job(
            filename=file.filename,
            model=model,
            user_id=user["id"],
            alias=alias,
            language_hint=language
        )
        
        # Background-Verarbeitung starten
        background_tasks.add_task(process_job, job_id, temp_path, model, user["id"], language)
        
        return {
            "message": "Job erfolgreich erstellt",
            "job_id": job_id,
            "filename": file.filename,
            "model": model
        }
    
    @app.get("/jobs")
    async def get_jobs(user = Depends(get_current_user)):
        """Alle Jobs des aktuellen Users abrufen"""
        jobs = db_manager.get_jobs_by_user(user["id"])
        return jobs
    
    @app.get("/jobs/{job_id}")
    async def get_job(job_id: int, user = Depends(get_current_user)):
        """Einzelnen Job abrufen"""
        job = db_manager.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job nicht gefunden")
        
        # Nur eigene Jobs anzeigen
        if job["user_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Zugriff verweigert")
        
        return job
    
    @app.get("/jobs/{job_id}/download")
    async def download_transcript(job_id: int, user = Depends(get_current_user)):
        """Transkription als Textdatei herunterladen"""
        job = db_manager.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job nicht gefunden")
        
        # Nur eigene Jobs
        if job["user_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Zugriff verweigert")
        
        if job["status"] != "completed" or not job["result"]:
            raise HTTPException(status_code=400, detail="Transkription noch nicht verfügbar")
        
        filename = job.get("alias") or job.get("filename", f"transcript_{job_id}")
        if not filename.endswith('.txt'):
            filename += '.txt'
        
        return PlainTextResponse(
            content=job["result"],
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    
    @app.delete("/jobs/{job_id}")
    async def delete_job(job_id: int, user = Depends(get_current_user)):
        """Job löschen"""
        success = db_manager.delete_job(job_id, user["id"])
        if not success:
            raise HTTPException(status_code=404, detail="Job nicht gefunden")
        
        return {"message": "Job erfolgreich gelöscht"}

# Rückgabe für die API-Doku
def get_jobs_api_docs(available_models=None, model_labels=None, max_upload_size_mb=None, 
                      available_api_languages=None):
    """Gibt die API-Dokumentation für Job-Endpunkte zurück"""
    return {
        "title": "Job-Management", 
        "endpoints": [
            {
                "id": "create_job",
                "title": "Transkriptions-Job erstellen",
                "method": "POST",
                "path": "/jobs",
                "description": "Startet eine neue Audio-Transkription",
                "requires_auth": True,
                "icon": "upload",
                "parameters": [
                    {
                        "name": "file",
                        "type": "file",
                        "required": True,
                        "description": f"Audio-Datei (max. {max_upload_size_mb or 500} MB)"
                    },
                    {
                        "name": "model", 
                        "type": "string",
                        "required": True,
                        "description": "Whisper-Modell",
                        "options": available_models or []
                    },
                    {
                        "name": "language",
                        "type": "string", 
                        "required": False,
                        "description": "Sprache (auto für automatische Erkennung)"
                    }
                ]
            },
            {
                "id": "get_jobs",
                "title": "Jobs auflisten",
                "method": "GET",
                "path": "/jobs",
                "description": "Zeigt alle eigenen Transkriptions-Jobs",
                "requires_auth": True,
                "icon": "list",
                "parameters": []
            },
            {
                "id": "get_job",
                "title": "Job-Details",
                "method": "GET", 
                "path": "/jobs/{id}",
                "description": "Zeigt Details eines spezifischen Jobs",
                "requires_auth": True,
                "icon": "info",
                "parameters": [
                    {
                        "name": "id",
                        "type": "integer",
                        "required": True,
                        "description": "Job-ID"
                    }
                ]
            },
            {
                "id": "delete_job",
                "title": "Job löschen",
                "method": "DELETE",
                "path": "/jobs/{id}",
                "description": "Löscht einen Job und seine Daten",
                "requires_auth": True,
                "icon": "delete",
                "parameters": [
                    {
                        "name": "id",
                        "type": "integer", 
                        "required": True,
                        "description": "Job-ID"
                    }
                ]
            },
            {
                "id": "download_job",
                "title": "Transkript herunterladen",
                "method": "GET",
                "path": "/jobs/{id}/download",
                "description": "Lädt das Transkript als Textdatei herunter",
                "requires_auth": True,
                "icon": "download",
                "parameters": [
                    {
                        "name": "id",
                        "type": "integer",
                        "required": True,
                        "description": "Job-ID"
                    }
                ]
            }
        ]
    }