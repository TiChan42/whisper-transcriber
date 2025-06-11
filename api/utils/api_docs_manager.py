class ApiDocsManager:
    """Zentrale Verwaltung der API-Dokumentation"""
    
    def __init__(self):
        self.available_models = []
        self.model_labels = []
        self.loaded_models = {}
        self.max_upload_size_mb = 500
        self.max_upload_size_bytes = 500 * 1024 * 1024
        self.available_api_languages = []
        self.base_url = "https://api.yourdomain.com"
    
    def configure(self, available_models, model_labels, loaded_models, 
                  max_upload_size_mb, max_upload_size_bytes, available_api_languages, 
                  base_url=None):
        """Konfiguriert alle API-Dokumentationsdaten"""
        self.available_models = available_models
        self.model_labels = model_labels
        self.loaded_models = loaded_models
        self.max_upload_size_mb = max_upload_size_mb
        self.max_upload_size_bytes = max_upload_size_bytes
        self.available_api_languages = available_api_languages
        if base_url:
            self.base_url = base_url
    
    def get_complete_documentation(self):
        """Sammelt die komplette API-Dokumentation aus allen Modulen"""
        from endpoints.auth import get_auth_api_docs
        from endpoints.jobs import get_jobs_api_docs
        from endpoints.info import get_info_api_docs
        from endpoints.transcribe import get_transcribe_api_docs
        from endpoints.api_docs import get_api_docs_api_docs
        
        # Basis-Informationen
        documentation = {
            "title": "Whisper Transcription API",
            "version": "1.0.0",
            "description": "KI-gestützte Audio-Transkription mit OpenAI Whisper",
            "base_url": self.base_url,
            "limits": {
                "max_upload_size_mb": self.max_upload_size_mb,
                "max_upload_size_bytes": self.max_upload_size_bytes,
                "max_concurrent_jobs": 5,
                "supported_formats": ["MP3", "WAV", "M4A", "FLAC", "OGG"]
            },
            "models": {
                "available": self.available_models,
                "labels": self.model_labels,
                "loaded_count": len(self.loaded_models)
            },
            "languages": {
                "supported": len(self.available_api_languages),
                "auto_detect": True
            },
            "endpoints": []
        }
        
        # Dokumentation von allen Endpoint-Modulen sammeln mit Parametern
        docs_functions = [
            (get_auth_api_docs, {}),
            (get_jobs_api_docs, {
                "available_models": self.available_models,
                "model_labels": self.model_labels,
                "max_upload_size_mb": self.max_upload_size_mb,
                "available_api_languages": self.available_api_languages
            }),
            (get_info_api_docs, {
                "available_models": self.available_models,
                "model_labels": self.model_labels,
                "loaded_models": self.loaded_models,
                "max_upload_size_mb": self.max_upload_size_mb,
                "available_api_languages": self.available_api_languages
            }),
            (get_transcribe_api_docs, {}),
            (get_api_docs_api_docs, {})
        ]
        
        for get_docs_func, params in docs_functions:
            try:
                module_docs = get_docs_func(**params) if params else get_docs_func()
                if module_docs and "endpoints" in module_docs:
                    documentation["endpoints"].extend(module_docs["endpoints"])
            except Exception as e:
                print(f"Fehler beim Laden der API-Docs von {get_docs_func.__name__}: {e}")
        
        return documentation

# Globale Instanz
api_docs_manager = ApiDocsManager()