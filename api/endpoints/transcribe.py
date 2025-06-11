# Beschreibung
# Direkte Transkriptions-Endpunkte für synchrone Verarbeitung

# Abhängigkeiten
import os
import shutil
from datetime import datetime
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Depends

# Endpunkte
def register_transcribe_endpoints(app: FastAPI, get_current_user, transcribe_file):
    """Registriert alle Transkriptions-Endpunkte"""
    
    @app.post("/transcribe")
    async def transcribe_sync(
        file: UploadFile = File(...),
        model: str = Form("tiny"),
        user = Depends(get_current_user)
    ):
        """Synchrone Transkription für kleinere Dateien"""
        
        # Dateigrößen-Limit für synchrone Verarbeitung (max. 25 MB)
        content = await file.read()
        if len(content) > 25 * 1024 * 1024:
            raise HTTPException(
                status_code=413, 
                detail="Datei zu groß für synchrone Verarbeitung. Verwenden Sie /jobs für größere Dateien."
            )
        
        # Temporäre Datei erstellen
        import os
        import tempfile
        from datetime import datetime
        
        os.makedirs("temp", exist_ok=True)
        temp_path = f"temp/sync_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
        
        try:
            with open(temp_path, "wb") as f:
                f.write(content)
            
            # Direkte Transkription
            result = transcribe_file(temp_path, model)
            
            return {
                "result": result,
                "filename": file.filename,
                "model": model,
                "status": "completed"
            }
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Transkription fehlgeschlagen: {str(e)}")
        
        finally:
            # Temporäre Datei löschen
            try:
                os.remove(temp_path)
            except OSError:
                pass

# Rückgabe für die API-Doku
def get_transcribe_api_docs():
    """Gibt die API-Dokumentation für Transcribe-Endpunkte zurück"""
    return {
        "title": "Direkte Transkription",
        "endpoints": [
            {
                "id": "transcribe_sync",
                "title": "Synchrone Transkription",
                "method": "POST",
                "path": "/transcribe",
                "description": "Sofortige Transkription für kleinere Dateien (max. 25 MB)",
                "requires_auth": True,
                "icon": "play_arrow",
                "badge": "Schnell",
                "parameters": [
                    {
                        "name": "file",
                        "type": "file",
                        "required": True,
                        "description": "Audio-Datei (max. 25 MB für synchrone Verarbeitung)"
                    },
                    {
                        "name": "model",
                        "type": "select",
                        "required": False,
                        "description": "Whisper-Modell",
                        "default": "tiny",
                        "options": [
                            {"value": "tiny", "label": "Tiny (schnellste)"},
                            {"value": "small", "label": "Small (ausgewogen)"}
                        ]
                    }
                ]
            }
        ]
    }