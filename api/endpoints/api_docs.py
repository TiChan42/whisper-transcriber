# Beschreibung
# API-Dokumentations-Endpunkt für dynamische Swagger-ähnliche Dokumentation

# Abhängigkeiten
import os
from fastapi import FastAPI
from utils.api_docs_manager import api_docs_manager

# Endpunkte
def register_api_docs_endpoints(app: FastAPI):
    
    @app.get("/api-docs")
    async def get_api_documentation():
        """Vollständige API-Dokumentation abrufen"""
        return api_docs_manager.get_complete_documentation()

# Rückgabe für die API-Doku
def get_api_docs_api_docs():
    """Gibt die API-Dokumentation für API-Docs-Endpunkte zurück"""
    return {
        "title": "API-Dokumentation",
        "endpoints": [
            {
                "id": "get_api_docs",
                "title": "Vollständige API-Dokumentation",
                "method": "GET",
                "path": "/api-docs", 
                "description": "Zeigt die komplette Dokumentation aller verfügbaren Endpunkte",
                "requires_auth": False,
                "icon": "info",
                "parameters": []
            }
        ]
    }