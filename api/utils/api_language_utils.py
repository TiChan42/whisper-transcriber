import json
import os

def get_valid_language_codes():
    """
    Liefert eine Liste gültiger Sprachcodes für die Transkription zurück.
    Diese Codes stammen aus der JSON-Datei mit verfügbaren API-Sprachen.
    """
    available_api_languages = load_available_api_languages()
    return [lang['code'] for lang in available_api_languages if 'code' in lang and lang['code']]
    

def load_available_api_languages():
    """
    Lädt verfügbare API-Sprachen für Whisper-Transkription.
    Vorbereitet für zukünftiges UI-Sprachsystem.
    """
    try:
        # Pfad zur JSON-Datei mit API-Sprachen
        json_path = os.path.join(os.path.dirname(__file__), '..', 'settings', 'available_api_languages.json')
        
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data.get('api_languages', [])
    except FileNotFoundError:
        print("⚠️  available_api_languages.json nicht gefunden, verwende Fallback-Sprachen")
        return get_fallback_api_languages()
    except json.JSONDecodeError as e:
        print(f"⚠️  Fehler beim Laden der API-Sprachen: {e}")
        return get_fallback_api_languages()

def get_fallback_api_languages():
    """Fallback-API-Sprachen falls JSON-Datei nicht verfügbar ist"""
    return [
        {"code": "auto", "name": "Automatisch erkennen", "flag": "🌐"}
    ]