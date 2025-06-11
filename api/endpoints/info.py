# Beschreibung
# Informations-Endpunkte für Modelle, Sprachen und System-Limits

# Abhängigkeiten
from utils.api_language_utils import load_available_api_languages

# Endpunkte
def register_info_endpoints(app, AVAILABLE_MODELS, MODEL_LABELS, loaded_models, MAX_UPLOAD_SIZE_MB, MAX_UPLOAD_SIZE_BYTES, AVAILABLE_API_LANGUAGES):
    """Registriert alle Info-Endpunkte"""
    
    @app.get("/models")
    def get_available_models():
        """Liefert verfügbare Modelle und ihre Labels zurück."""
        return get_models_info(AVAILABLE_MODELS, MODEL_LABELS, loaded_models)

    @app.get("/languages")
    def get_available_api_languages():
        """Liefert verfügbare Sprachen für die Transkription zurück."""
        return get_api_languages_info(AVAILABLE_API_LANGUAGES)

    @app.get("/upload-limits")
    def get_upload_limits():
        """Liefert Upload-Beschränkungen zurück."""
        return get_limits_info(MAX_UPLOAD_SIZE_MB, MAX_UPLOAD_SIZE_BYTES)

# Rückgabe für die API-Doku
def get_info_api_docs(available_models=None, model_labels=None, loaded_models=None, 
                      max_upload_size_mb=None, available_api_languages=None):
    """Gibt die API-Dokumentation für Info-Endpunkte zurück"""
    return {
        "title": "System-Informationen",
        "endpoints": [
            {
                "id": "get_models",
                "title": "Verfügbare Modelle",
                "method": "GET",
                "path": "/models",
                "description": "Zeigt alle verfügbaren Whisper-Modelle",
                "requires_auth": False,
                "icon": "model",
                "parameters": [],
                "response_example": {
                    "models": available_models or []
                }
            },
            {
                "id": "get_languages",
                "title": "Unterstützte Sprachen",
                "method": "GET", 
                "path": "/languages",
                "description": "Zeigt alle unterstützten Sprachen für die Transkription",
                "requires_auth": False,
                "icon": "language",
                "parameters": []
            },
            {
                "id": "get_upload_limits", 
                "title": "Upload-Limits",
                "method": "GET",
                "path": "/upload-limits",
                "description": "Zeigt aktuelle Upload-Beschränkungen",
                "requires_auth": False,
                "icon": "upload",
                "parameters": [],
                "response_example": {
                    "max_size_mb": max_upload_size_mb or 500
                }
            }
        ]
    }

# Logik
def get_models_info(AVAILABLE_MODELS, MODEL_LABELS, loaded_models):
    """Verfügbare Modelle abrufen"""
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

def get_api_languages_info(AVAILABLE_API_LANGUAGES):
    """Verfügbare API-Sprachen abrufen"""
    return {"languages": AVAILABLE_API_LANGUAGES}

def get_limits_info(MAX_UPLOAD_SIZE_MB, MAX_UPLOAD_SIZE_BYTES):
    """Upload-Limits abrufen"""
    return {
        "max_size_mb": MAX_UPLOAD_SIZE_MB,
        "max_size_bytes": MAX_UPLOAD_SIZE_BYTES,
        "supported_formats": ["MP3", "WAV", "M4A", "FLAC", "OGG"],
        "max_concurrent_jobs": 3
    }