# Beschreibung
# Authentifizierungs-Endpunkte für Benutzerregistrierung und -anmeldung

# Abhängigkeiten
import os
import sqlite3
import secrets
from datetime import datetime
from fastapi import FastAPI, Form, HTTPException, Request, Depends
from passlib.context import CryptContext
import config
from utils.database import db_manager  # ✅ Neue Database Utils

# Endpunkte
def register_auth_endpoints(app: FastAPI, pwd_context: CryptContext, db_path: str):
    """Registriert alle Auth-Endpunkte"""
    
    # ✅ get_current_user aus app.py importieren
    from app import get_current_user
    
    @app.post("/register")
    async def register_user(request: Request):
        """Neuen Benutzer anlegen (mit Registrierungsschlüssel)."""
        try:
            # JSON-Daten aus Request Body lesen
            data = await request.json()
            username = data.get('username')
            password = data.get('password')
            reg_key = data.get('reg_key')
            
            if not username or not password or not reg_key:
                raise HTTPException(status_code=422, detail="Username, Passwort und Registrierungsschlüssel sind erforderlich")
                
        except Exception as e:
            raise HTTPException(status_code=422, detail="Ungültige JSON-Daten")
        
        # Registrierungsschlüssel prüfen
        if reg_key != config.REGISTRATION_KEY:
            raise HTTPException(status_code=400, detail="Ungültiger Registrierungsschlüssel")
        
        # Prüfen ob Username bereits existiert
        existing_user = db_manager.get_user_by_username(username)
        if existing_user:
            raise HTTPException(status_code=400, detail="Benutzername bereits vergeben")
        
        # API-Key generieren
        api_key = secrets.token_urlsafe(32)
        
        # Passwort hashen
        password_hash = pwd_context.hash(password)
        api_key_hash = pwd_context.hash(api_key)
        
        # User erstellen
        user_id = db_manager.create_user(username, password_hash, api_key_hash, api_key)
        
        return {
            "message": "Benutzer erfolgreich registriert", 
            "api_key": api_key,
            "user_id": user_id
        }
    
    @app.post("/login")
    async def login_user(request: Request):
        """Benutzer anmelden und festen API-Key zurückgeben."""
        try:
            # JSON-Daten aus Request Body lesen
            data = await request.json()
            username = data.get('username')
            password = data.get('password')
            
            if not username or not password:
                raise HTTPException(status_code=422, detail="Username und Passwort sind erforderlich")
                
        except Exception as e:
            raise HTTPException(status_code=422, detail="Ungültige JSON-Daten")
        
        # User finden
        user = db_manager.get_user_by_username(username)
        if not user:
            raise HTTPException(status_code=401, detail="Ungültige Anmeldedaten")
        
        # Passwort prüfen
        if not pwd_context.verify(password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Ungültige Anmeldedaten")
        
        # API-Key aus DB holen
        api_key = db_manager.get_user_api_key(user["id"])
        if not api_key:
            raise HTTPException(status_code=500, detail="API-Key nicht gefunden")
        
        return {
            "message": "Anmeldung erfolgreich",
            "api_key": api_key,
            "user_id": user["id"]
        }
    
    @app.delete("/user/delete")
    async def delete_user_account(current_user: dict = Depends(get_current_user)):
        """Löscht das eigene Benutzerkonto und alle zugehörigen Daten."""
        try:
            user_id = current_user["id"]
            
            # Alle Jobs des Benutzers löschen
            db_manager.delete_all_user_jobs(user_id)
            
            # Benutzer löschen
            db_manager.delete_user(user_id)
            
            return {
                "message": "Benutzerkonto erfolgreich gelöscht",
                "deleted_user_id": user_id
            }
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Fehler beim Löschen des Kontos: {str(e)}")

# Rückgabe für die API-Doku
def get_auth_api_docs():
    """Gibt die API-Dokumentation für Auth-Endpunkte zurück"""
    return {
        "title": "Authentifizierung",
        "endpoints": [
            {
                "id": "register",
                "title": "Benutzer registrieren",
                "method": "POST",
                "path": "/register",
                "description": "Erstellt einen neuen Benutzer mit API-Key (JSON)",
                "requires_auth": False,
                "icon": "person_add",
                "content_type": "application/json",
                "parameters": [
                    {
                        "name": "username",
                        "type": "text",
                        "required": True,
                        "description": "Gewünschter Benutzername (mindestens 3 Zeichen)"
                    },
                    {
                        "name": "password", 
                        "type": "password",
                        "required": True,
                        "description": "Sicheres Passwort"
                    },
                    {
                        "name": "reg_key",
                        "type": "password", 
                        "required": True,
                        "description": "Registrierungsschlüssel vom Administrator"
                    }
                ]
            },
            {
                "id": "login",
                "title": "Benutzer anmelden", 
                "method": "POST",
                "path": "/login",
                "description": "Authentifizierung mit Benutzername und Passwort (JSON)",
                "requires_auth": False,
                "icon": "login",
                "content_type": "application/json",
                "parameters": [
                    {
                        "name": "username",
                        "type": "text", 
                        "required": True,
                        "description": "Ihr Benutzername"
                    },
                    {
                        "name": "password",
                        "type": "password",
                        "required": True, 
                        "description": "Ihr Passwort"
                    }
                ]
            },
            {
                "id": "delete_account",
                "title": "Konto löschen",
                "method": "DELETE", 
                "path": "/user/delete",
                "description": "Löscht das eigene Benutzerkonto und alle zugehörigen Daten permanent",
                "requires_auth": True,
                "icon": "delete_forever",
                "content_type": "application/json",
                "parameters": []
            }
        ]
    }