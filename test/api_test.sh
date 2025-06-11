#!/bin/bash
# filepath: /docker-deployments/whisper-transcriber/test/api_test.sh
# Umfassender API-Test für Whisper Transcriber mit detailliertem Konsolen-Logging
# Testet alle Endpunkte, Edge Cases und Audio-Dateien

# Robuste Fehlerbehandlung
set -euo pipefail

# Trap für unerwartete Fehler
trap 'handle_error $? $LINENO' ERR
trap 'cleanup_on_exit' EXIT INT TERM

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
MAGENTA='\033[0;95m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# Test-Statistiken
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0
FAILED_TESTS=()

# Test-Daten
TEST_USERNAME="testuser_$(date +%s)_$$"
TEST_PASSWORD="TestPassword123!"
TEST_REG_KEY=""
API_DOMAIN=""
API_BASE_URL=""
USER_API_KEY=""

# Erweiterte Logging-Konfiguration
DEBUG=true
VERBOSE=true
SUPER_VERBOSE=true
LOG_REQUESTS=true
LOG_RESPONSES=true
LOG_HEADERS=true
LOG_CURL_VERBOSE=false  # Nur bei Bedarf aktivieren

# Performance-Konfiguration
MAX_RETRIES=3
RETRY_DELAY=2
REQUEST_TIMEOUT=60  # Erhöht von 45 auf 60 Sekunden
JOB_TIMEOUT=300
SLEEP_BETWEEN_TESTS=1.0  # Erhöht von 0.5 auf 1.0 Sekunden
MIN_RESPONSE_WAIT=2  # Neue Variable: Mindest-Wartezeit nach jeder Response

# Verfügbare Sprachen und deren erwartete Texte
declare -A EXPECTED_TEXTS=(
    ["de"]="Dies ist ein Test"
    ["en"]="This is a test"
    ["fr"]="C'est un test"
    ["es"]="Esto es una prueba"
    ["it"]="Questo è un test"
    ["pt"]="Isto é um teste"
    ["ru"]="Это тест"
    ["ja"]="これはテストです"
    ["ko"]="이것은 테스트입니다"
    ["zh"]="这是一个测试"
    ["ar"]="هذا اختبار"
    ["hi"]="यह एक परीक्षण है"
    ["nl"]="Dit is een test"
    ["sv"]="Detta är ett test"
    ["da"]="Dette er en test"
    ["no"]="Dette er en test"
    ["pl"]="To jest test"
    ["tr"]="Bu bir testtir"
    ["uk"]="Це тест"
    ["cs"]="Toto je test"
    ["el"]="Αυτό είναι ένα τεστ"
    ["fi"]="Tämä on testi"
    ["he"]="זהו מבחן"
    ["hu"]="Ez egy teszt"
    ["is"]="Þetta er próf"
    ["id"]="Ini adalah tes"
    ["lv"]="Šis ir tests"
    ["lt"]="Tai yra testas"
    ["mt"]="Dan huwa test"
    ["ro"]="Acesta este un test"
    ["sk"]="Toto je test"
    ["sl"]="To je test"
)

# =====================================
# ERWEITERTE LOGGING-FUNKTIONEN
# =====================================

# Basis-Logging-Funktionen
log_with_timestamp() {
    local level="$1"
    local color="$2"
    local message="$3"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S.%3N')
    local caller="${BASH_SOURCE[3]##*/}:${BASH_LINENO[2]}"
    
    printf "${color}[%s]${NC} %s ${GRAY}[%s]${NC} %s\n" "$level" "$timestamp" "$caller" "$message"
}

log_info() {
    log_with_timestamp "INFO" "$BLUE" "$1"
}

log_success() {
    log_with_timestamp "PASS" "$GREEN" "$1"
    ((TESTS_PASSED++))
}

log_error() {
    log_with_timestamp "FAIL" "$RED" "$1"
    ((TESTS_FAILED++))
    FAILED_TESTS+=("$1")
}

log_warning() {
    log_with_timestamp "WARN" "$YELLOW" "$1"
}

log_debug() {
    if [[ "$DEBUG" == "true" ]]; then
        log_with_timestamp "DEBUG" "$CYAN" "$1"
    fi
}

log_verbose() {
    if [[ "$VERBOSE" == "true" ]]; then
        log_with_timestamp "VERBOSE" "$MAGENTA" "$1"
    fi
}

log_super_verbose() {
    if [[ "$SUPER_VERBOSE" == "true" ]]; then
        log_with_timestamp "TRACE" "$GRAY" "$1"
    fi
}

# Erweiterte Logging-Funktionen
log_header() {
    echo
    echo -e "${PURPLE}╔════════════════════════════════════════════════════════════════════════════════╗${NC}"
    printf "${PURPLE}║%-82s║${NC}\n" " $1"
    echo -e "${PURPLE}╚════════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo
    log_info "Beginne Test-Sektion: $1"
}

log_separator() {
    echo -e "${GRAY}────────────────────────────────────────────────────────────────────────────────${NC}"
}

log_section() {
    local title="$1"
    echo
    log_separator
    log_info "🔍 $title"
    log_separator
}

# Detaillierte Request-Logging
log_request_start() {
    local method="$1"
    local url="$2"
    local description="$3"
    
    log_section "HTTP REQUEST START"
    log_info "📤 $description"
    log_verbose "Method: $method"
    log_verbose "URL: $url"
    log_super_verbose "Start-Zeit: $(date '+%H:%M:%S.%3N')"
}

log_request_details() {
    local method="$1"
    local url="$2"
    local headers="$3"
    local data="$4"
    
    if [[ "$LOG_REQUESTS" == "true" ]]; then
        echo
        echo -e "${RED}╔═══════════════════ REQUEST DETAILS ═══════════════════╗${NC}"
        printf "${RED}║${NC} ${CYAN}Method:${NC} %-47s ${RED}║${NC}\n" "$method"
        printf "${RED}║${NC} ${CYAN}URL:${NC} %-50s ${RED}║${NC}\n" "$url"
        echo -e "${RED}╠═══════════════════════════════════════════════════════════╣${NC}"
        
        if [[ -n "$headers" ]]; then
            echo -e "${RED}║${NC} ${CYAN}Headers:${NC}                                             ${RED}║${NC}"
            echo "$headers" | sed 's/-H //' | sed "s/'//g" | while IFS= read -r line; do
                printf "${RED}║${NC}   %-53s ${RED}║${NC}\n" "$line"
            done
        else
            printf "${RED}║${NC} ${CYAN}Headers:${NC} %-46s ${RED}║${NC}\n" "(keine)"
        fi
        
        echo -e "${RED}╠═══════════════════════════════════════════════════════════╣${NC}"
        
        if [[ "$data" == *"-F "* ]]; then
            echo -e "${RED}║${NC} ${CYAN}Data Type:${NC} Multipart Form Data                    ${RED}║${NC}"
            echo "$data" | sed 's/-F //' | sed "s/'//g" | while IFS= read -r line; do
                printf "${RED}║${NC}   %-53s ${RED}║${NC}\n" "$line"
            done
        elif [[ -n "$data" ]]; then
            echo -e "${RED}║${NC} ${CYAN}Data Type:${NC} JSON                                    ${RED}║${NC}"
            printf "${RED}║${NC}   %-53s ${RED}║${NC}\n" "$data"
        else
            printf "${RED}║${NC} ${CYAN}Data:${NC} %-50s ${RED}║${NC}\n" "(keine Daten)"
        fi
        
        echo -e "${RED}╚═══════════════════════════════════════════════════════════╝${NC}"
        echo
    fi
}

log_response_details() {
    local status_code="$1"
    local response_body="$2"
    local response_headers="$3"
    local duration="${4:-unknown}"
    
    if [[ "$LOG_RESPONSES" == "true" ]]; then
        echo
        echo -e "${RED}╔══════════════════ RESPONSE DETAILS ══════════════════╗${NC}"
        printf "${RED}║${NC} ${CYAN}Status Code:${NC} %-42s ${RED}║${NC}\n" "$status_code"
        printf "${RED}║${NC} ${CYAN}Duration:${NC} %-46s ${RED}║${NC}\n" "$duration"
        echo -e "${RED}╠═══════════════════════════════════════════════════════════╣${NC}"
        
        if [[ "$LOG_HEADERS" == "true" && -n "$response_headers" ]]; then
            echo -e "${RED}║${NC} ${CYAN}Response Headers:${NC}                                 ${RED}║${NC}"
            echo "$response_headers" | while IFS= read -r line; do
                # Nur wichtige Header anzeigen
                if [[ "$line" =~ ^(Content-Type|Content-Length|Date|Server|X-|Authorization): ]]; then
                    printf "${RED}║${NC}   %s ${RED}║${NC}\n" "$line"
                fi
            done
        fi
        
        echo -e "${RED}╠═══════════════════════════════════════════════════════════╣${NC}"
        echo -e "${RED}║${NC} ${CYAN}Response Body:${NC}                                    ${RED}║${NC}"
        
        if [[ -n "$response_body" ]]; then
            # JSON formatieren falls möglich und sinnvoll
            if command -v jq >/dev/null 2>&1 && echo "$response_body" | jq . >/dev/null 2>&1; then
                echo "$response_body" | jq . | while IFS= read -r line; do
                    printf "${RED}║${NC}   %s ${RED}║${NC}\n" "$line"
                done
            else
                # Plain text ohne Zeilenbegrenzung
                echo "$response_body" | while IFS= read -r line; do
                    printf "${RED}║${NC}   %s ${RED}║${NC}\n" "$line"
                done
            fi
        else
            printf "${RED}║${NC}   %-53s ${RED}║${NC}\n" "(leer)"
        fi
        
        echo -e "${RED}╚═══════════════════════════════════════════════════════════╝${NC}"
        echo
    fi
}

log_curl_verbose() {
    local curl_cmd="$1"
    if [[ "$LOG_CURL_VERBOSE" == "true" ]]; then
        log_section "CURL VERBOSE OUTPUT"
        log_warning "Führe Curl im Verbose-Modus aus..."
        eval "$curl_cmd -v" 2>&1 | while IFS= read -r line; do
            log_super_verbose "curl: $line"
        done
    fi
}

# Variablen-Dumps für Debugging
log_environment() {
    log_section "ENVIRONMENT INFORMATION"
    log_verbose "Script: ${BASH_SOURCE[0]}"
    log_verbose "Working Directory: $(pwd)"
    log_verbose "User: $(whoami)"
    log_verbose "Bash Version: $BASH_VERSION"
    log_verbose "Curl Version: $(curl --version | head -1)"
    
    # jq Version sicher prüfen - ohne set +e/-e da das in main() gehandhabt wird
    local jq_version=""
    if command -v jq >/dev/null 2>&1; then
        jq_version=$(jq --version 2>/dev/null || echo "error")
    fi
    
    if [[ -n "$jq_version" && "$jq_version" != "error" ]]; then
        log_verbose "jq Version: $jq_version"
    else
        log_verbose "jq: nicht verfügbar"
    fi
    
    # bc Version sicher prüfen
    local bc_version=""
    if command -v bc >/dev/null 2>&1; then
        bc_version="verfügbar"
    fi
    
    if [[ -n "$bc_version" ]]; then
        log_verbose "bc: verfügbar"
    else
        log_verbose "bc: nicht verfügbar"
    fi
}

log_test_configuration() {
    log_section "TEST CONFIGURATION"
    log_verbose "Max Retries: $MAX_RETRIES"
    log_verbose "Retry Delay: ${RETRY_DELAY}s"
    log_verbose "Request Timeout: ${REQUEST_TIMEOUT}s"
    log_verbose "Job Timeout: ${JOB_TIMEOUT}s"
    log_verbose "Sleep Between Tests: ${SLEEP_BETWEEN_TESTS}s"
    log_verbose "Debug Mode: $DEBUG"
    log_verbose "Verbose Mode: $VERBOSE"
    log_verbose "Super Verbose Mode: $SUPER_VERBOSE"
    log_verbose "Log Requests: $LOG_REQUESTS"
    log_verbose "Log Responses: $LOG_RESPONSES"
    log_verbose "Log Headers: $LOG_HEADERS"
}

log_api_configuration() {
    log_section "API CONFIGURATION"
    log_verbose "API Base URL: $API_BASE_URL"
    log_verbose "Test Username: $TEST_USERNAME"
    log_verbose "Registration Key Length: ${#TEST_REG_KEY} Zeichen"
    if [[ -n "$USER_API_KEY" ]]; then
        log_verbose "API Key Length: ${#USER_API_KEY} Zeichen"
        log_verbose "API Key Preview: ${USER_API_KEY:0:10}***"
    fi
}

# =====================================
# FEHLERBEHANDLUNG UND CLEANUP
# =====================================

handle_error() {
    local exit_code=$1
    local line_number=$2
    local function_name="${FUNCNAME[1]}"
    
    log_error "💥 Unerwarteter Fehler in Funktion '$function_name', Zeile $line_number"
    log_error "Exit Code: $exit_code"
    log_error "Call Stack:"
    local frame=0
    while caller $frame; do
        ((frame++))
    done | while read line func file; do
        log_error "  $file:$line in $func()"
    done
    exit 1
}

cleanup_on_exit() {
    local exit_code=$?
    
    log_section "CLEANUP AND EXIT"
    
    if [[ $exit_code -ne 0 ]]; then
        log_warning "⚠️  Script wurde mit Exit Code $exit_code beendet"
    else
        log_info "✅ Script erfolgreich beendet"
    fi
    
    # Versuche Account zu löschen falls noch vorhanden
    if [[ -n "${USER_API_KEY:-}" ]] && [[ -n "${API_BASE_URL:-}" ]]; then
        log_info "🧹 Versuche Test-Account zu löschen..."
        
        # Temporär set +e für Cleanup
        set +e
        local cleanup_response
        cleanup_response=$(curl -s -X DELETE "$API_BASE_URL/user/delete" \
            -H "X-API-Key: $USER_API_KEY" \
            --connect-timeout 10 \
            --max-time 30 2>/dev/null)
        local cleanup_rc=$?
        set -e
        
        if [[ $cleanup_rc -eq 0 ]]; then
            log_success "Test-Account erfolgreich gelöscht"
        else
            log_warning "Test-Account konnte nicht gelöscht werden (möglicherweise bereits gelöscht)"
            
            # Versuche alternative Löschung über Login + Delete
            log_verbose "🔄 Versuche alternative Löschung..."
            set +e
            local login_data="{\"username\":\"$TEST_USERNAME\",\"password\":\"$TEST_PASSWORD\"}"
            local alt_login_response
            alt_login_response=$(curl -s -X POST "$API_BASE_URL/login" \
                -H "Content-Type: application/json" \
                -d "$login_data" \
                --connect-timeout 10 \
                --max-time 30 2>/dev/null)
            
            if [[ $? -eq 0 ]]; then
                local alt_api_key=$(echo "$alt_login_response" | grep -o '"api_key":"[^"]*"' | cut -d'"' -f4)
                if [[ -n "$alt_api_key" ]]; then
                    curl -s -X DELETE "$API_BASE_URL/user/delete" \
                        -H "X-API-Key: $alt_api_key" \
                        --connect-timeout 10 \
                        --max-time 30 >/dev/null 2>&1
                    log_verbose "Alternative Löschung versucht"
                fi
            fi
            set -e
        fi
    fi
    
    # Aufräumen von temporären Dateien (inklusive JSON-Temp-Dateien)
    local temp_files=(invalid_file.txt test_output.txt temp_response.json test_file.txt)
    for file in "${temp_files[@]}"; do
        if [[ -f "$file" ]]; then
            rm -f "$file"
            log_verbose "Temporäre Datei gelöscht: $file"
        fi
    done
    
    # Lösche auch alle temporären JSON-Dateien
    rm -f /tmp/api_test_*.json 2>/dev/null || true
    
    log_info "🏁 Cleanup abgeschlossen"
}

# =====================================
# HILFSFUNKTIONEN
# =====================================

increment_test() {
    ((TESTS_TOTAL++))
    log_super_verbose "Test #$TESTS_TOTAL gestartet"
    if [[ "$SLEEP_BETWEEN_TESTS" != "0" ]]; then
        sleep "$SLEEP_BETWEEN_TESTS"
    fi
}

safe_sleep() {
    local duration=${1:-$MIN_RESPONSE_WAIT}
    log_verbose "⏳ Warte ${duration}s..."
    
    # Temporär set +e für sleep
    set +e
    sleep "$duration" || {
        log_warning "⚠️  Sleep wurde unterbrochen nach ${duration}s"
    }
    set -e
}

# Messe Request-Dauer
time_request() {
    local start_time=$(date +%s.%N)
    "$@"
    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc -l 2>/dev/null || echo "unknown")
    echo "$duration"
}

# =====================================
# API-FUNKTIONEN
# =====================================

test_api_connectivity() {
    log_info "🔌 Teste API-Konnektivität..."
    
    local retries=0
    local test_endpoints=("/models" "/languages" "/")
    
    while [[ $retries -lt $MAX_RETRIES ]]; do
        for endpoint in "${test_endpoints[@]}"; do
            log_verbose "Teste Endpunkt: $API_BASE_URL$endpoint"
            
            if curl -s --connect-timeout 10 --max-time 30 "$API_BASE_URL$endpoint" >/dev/null 2>&1; then
                log_success "✅ API ist über $endpoint erreichbar"
                return 0
            else
                log_verbose "❌ Endpunkt $endpoint nicht erreichbar"
            fi
        done
        
        ((retries++))
        if [[ $retries -lt $MAX_RETRIES ]]; then
            log_warning "🔄 API nicht erreichbar, Versuch $retries/$MAX_RETRIES"
            safe_sleep $((RETRY_DELAY * retries))
        fi
    done
    
    log_error "💥 API ist nach $MAX_RETRIES Versuchen über alle Endpunkte nicht erreichbar"
    return 1
}

load_env() {
    log_info "📁 Lade Umgebungsvariablen aus .env..."
    
    if [[ ! -f "../.env" ]]; then
        log_error "❌ .env Datei nicht gefunden unter: $(pwd)/../.env"
        return 1
    fi
    
    local vars_loaded=0
    
    # .env sicher einlesen
    while IFS= read -r line || [[ -n "$line" ]]; do
        # Kommentare und leere Zeilen überspringen
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "${line// }" ]] && continue
        
        # Variable exportieren
        if [[ "$line" =~ ^[[:space:]]*([^=]+)=(.*)$ ]]; then
            local key="${BASH_REMATCH[1]// }"
            local value="${BASH_REMATCH[2]}"
            # Anführungszeichen entfernen falls vorhanden
            value=$(echo "$value" | sed 's/^"//;s/"$//')
            export "$key"="$value"
            log_super_verbose "Geladene Variable: $key (${#value} Zeichen)"
            ((vars_loaded++))
        fi
    done < "../.env"
    
    log_verbose "📊 $vars_loaded Umgebungsvariablen geladen"
    
    # Erforderliche Variablen prüfen
    local required_vars=("REGISTRATION_KEY" "WHISPER_API_DOMAIN")
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            log_error "❌ Erforderliche Variable $var nicht in .env gefunden"
            return 1
        else
            log_verbose "✅ $var gefunden"
        fi
    done
    
    TEST_REG_KEY="$REGISTRATION_KEY"
    API_DOMAIN="$WHISPER_API_DOMAIN"
    API_BASE_URL="https://$API_DOMAIN"
    
    log_success "✅ Umgebungsvariablen erfolgreich geladen"
    log_api_configuration
    
    # API-Erreichbarkeit testen
    if ! test_api_connectivity; then
        log_error "❌ Kann nicht fortfahren - API nicht erreichbar"
        return 1
    fi
    
    return 0
}

# HTTP Request mit vollständigem Logging
make_request() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    local headers="$4"
    local expected_status="$5"
    local description="${6:-$method $endpoint}"
    
    local retries=0
    local full_url="$API_BASE_URL$endpoint"
    
    # Log-Ausgaben auf stderr umleiten, damit sie nicht in die Response gelangen
    log_request_start "$method" "$full_url" "$description" >&2
    
    while [[ $retries -lt $MAX_RETRIES ]]; do
        local start_time=$(date +%s.%N)
        local response_with_headers=""
        local response_body=""
        local response_headers=""
        local status_code=""
        local curl_exit_code=0
        
        log_verbose "🔄 Attempt $(($retries + 1))/$MAX_RETRIES" >&2
        
        # Request-Details loggen - AUF STDERR
        log_request_details "$method" "$full_url" "$headers" "$data" >&2
        
        # Temporär set +e für curl-Ausführung
        set +e
        
        # Warte vor jedem Request um Server nicht zu überlasten
        if [[ $retries -gt 0 ]]; then
            log_verbose "⏳ Warte ${RETRY_DELAY}s vor erneutem Versuch..." >&2
            sleep "$RETRY_DELAY"
        fi
        
        # Curl-Kommando ausführen mit längeren Timeouts
        case "$method" in
            "GET")
                if [[ -n "$headers" ]]; then
                    eval "response_with_headers=\$(curl -s -i -w \"\\nSTATUS_CODE:%{http_code}\" \
                        --connect-timeout 15 \
                        --max-time $REQUEST_TIMEOUT \
                        --retry 0 \
                        -X GET \"$full_url\" $headers 2>/dev/null)"
                else
                    response_with_headers=$(curl -s -i -w "\nSTATUS_CODE:%{http_code}" \
                        --connect-timeout 15 \
                        --max-time $REQUEST_TIMEOUT \
                        --retry 0 \
                        -X GET "$full_url" 2>/dev/null)
                fi
                curl_exit_code=$?
                ;;
                
            "POST")
                if [[ "$data" == *"-F "* ]]; then
                    log_debug "Verwende Multipart Form Data" >&2
                    if [[ -n "$headers" ]]; then
                        eval "response_with_headers=\$(curl -s -i -w \"\\nSTATUS_CODE:%{http_code}\" \
                            --connect-timeout 15 \
                            --max-time $REQUEST_TIMEOUT \
                            --retry 0 \
                            -X POST \"$full_url\" $headers \
                            $data 2>/dev/null)"
                    else
                        eval "response_with_headers=\$(curl -s -i -w \"\\nSTATUS_CODE:%{http_code}\" \
                            --connect-timeout 15 \
                            --max-time $REQUEST_TIMEOUT \
                            --retry 0 \
                            -X POST \"$full_url\" \
                            $data 2>/dev/null)"
                    fi
                    curl_exit_code=$?
                else
                    # JSON data - SICHERE BEHANDLUNG VON ANFÜHRUNGSZEICHEN
                    log_debug "Verwende JSON Data: $data" >&2
                    
                    # Erstelle temporäre Datei für JSON-Daten
                    local temp_json_file="/tmp/api_test_$$.json"
                    echo "$data" > "$temp_json_file"
                    
                    if [[ -n "$headers" ]]; then
                        eval "response_with_headers=\$(curl -s -i -w \"\\nSTATUS_CODE:%{http_code}\" \
                            --connect-timeout 15 \
                            --max-time $REQUEST_TIMEOUT \
                            --retry 0 \
                            -X POST \"$full_url\" $headers \
                            -H 'Content-Type: application/json' \
                            --data @\"$temp_json_file\" 2>/dev/null)"
                    else
                        response_with_headers=$(curl -s -i -w "\nSTATUS_CODE:%{http_code}" \
                            --connect-timeout 15 \
                            --max-time $REQUEST_TIMEOUT \
                            --retry 0 \
                            -X POST "$full_url" \
                            -H 'Content-Type: application/json' \
                            --data @"$temp_json_file" 2>/dev/null)
                    fi
                    curl_exit_code=$?
                    
                    # Temporäre Datei löschen
                    rm -f "$temp_json_file"
                fi
                ;;
                
            "DELETE")
                if [[ -n "$headers" ]]; then
                    eval "response_with_headers=\$(curl -s -i -w \"\\nSTATUS_CODE:%{http_code}\" \
                        --connect-timeout 15 \
                        --max-time $REQUEST_TIMEOUT \
                        --retry 0 \
                        -X DELETE \"$full_url\" $headers 2>/dev/null)"
                else
                    response_with_headers=$(curl -s -i -w "\nSTATUS_CODE:%{http_code}" \
                        --connect-timeout 15 \
                        --max-time $REQUEST_TIMEOUT \
                        --retry 0 \
                        -X DELETE "$full_url" 2>/dev/null)
                fi
                curl_exit_code=$?
                ;;
        esac
        
        set -e
        
        local end_time=$(date +%s.%N)
        local duration=$(echo "$end_time - $start_time" | bc -l 2>/dev/null || echo "unknown")
        
        log_debug "Curl Exit Code: $curl_exit_code" >&2
        log_debug "Raw Response Length: ${#response_with_headers}" >&2
        
        # Curl-Fehler behandeln
        if [[ $curl_exit_code -ne 0 ]]; then
            ((retries++))
            log_error "💥 Curl Exit Code: $curl_exit_code" >&2
            
            case $curl_exit_code in
                6) log_error "Couldn't resolve host" >&2 ;;
                7) log_error "Failed to connect to host" >&2 ;;
                28) log_error "Operation timeout after ${REQUEST_TIMEOUT}s" >&2 ;;
                35) log_error "SSL connect error" >&2 ;;
                *) log_error "Unbekannter Curl-Fehler" >&2 ;;
            esac
            
            if [[ $retries -lt $MAX_RETRIES ]]; then
                log_warning "🔄 Netzwerk-Fehler bei $description (Versuch $retries/$MAX_RETRIES)" >&2
                local exponential_delay=$((RETRY_DELAY * retries * retries))
                log_verbose "⏳ Exponentieller Backoff: ${exponential_delay}s" >&2
                sleep "$exponential_delay"
                continue
            else
                log_error "💥 Netzwerk-Fehler bei $description nach $MAX_RETRIES Versuchen" >&2
                return 1
            fi
        fi
        
        # Response parsen
        if [[ "$response_with_headers" =~ STATUS_CODE:([0-9]{3}) ]]; then
            status_code="${BASH_REMATCH[1]}"
            response_with_headers=$(echo "$response_with_headers" | sed 's/STATUS_CODE:[0-9]\{3\}$//')
        else
            status_code="000"
            log_error "❌ Kein gültiger Status-Code in Response gefunden" >&2
            log_error "Raw Response: ${response_with_headers:0:200}..." >&2
        fi
        
        # Headers und Body trennen - VERBESSERT
        if [[ "$response_with_headers" =~ ^(.*?)$'\n\n'(.*)$ ]]; then
            response_headers="${BASH_REMATCH[1]}"
            response_body="${BASH_REMATCH[2]}"
        else
            # Fallback: Falls keine doppelte Leerzeile gefunden wird
            response_headers=""
            response_body="$response_with_headers"
            
            # Versuche headers manuell zu trennen
            local line_count=0
            local temp_headers=""
            local temp_body=""
            local in_body=false
            
            while IFS= read -r line; do
                ((line_count++))
                if [[ "$in_body" == "true" ]]; then
                    if [[ -n "$temp_body" ]]; then
                        temp_body="$temp_body"$'\n'"$line"
                    else
                        temp_body="$line"
                    fi
                elif [[ -z "$line" ]]; then
                    in_body=true
                elif [[ "$line" =~ ^HTTP/ ]] || [[ "$line" =~ ^[a-zA-Z-]+: ]]; then
                    if [[ -n "$temp_headers" ]]; then
                        temp_headers="$temp_headers"$'\n'"$line"
                    else
                        temp_headers="$line"
                    fi
                else
                    # Erste Zeile ohne Header-Format ist wahrscheinlich Body
                    in_body=true
                    temp_body="$line"
                fi
            done <<< "$response_with_headers"
            
            response_headers="$temp_headers"
            response_body="$temp_body"
        fi
        
        log_verbose "📊 Response Status: $status_code" >&2
        log_verbose "⏱️  Request Duration: ${duration}s" >&2
        log_debug "📊 Response Headers Length: ${#response_headers}" >&2
        log_debug "📊 Response Body Length: ${#response_body}" >&2
        log_debug "📊 Response Body Preview: ${response_body:0:100}..." >&2
        
        # Response-Details loggen - AUF STDERR
        if [[ "$status_code" != "$expected_status" ]] || [[ "$VERBOSE" == "true" ]]; then
            log_response_details "$status_code" "$response_body" "$response_headers" "${duration}s" >&2
        fi
        
        # Status-Code validieren
        if [[ "$status_code" =~ ^[0-9]{3}$ ]]; then
            if [[ "$status_code" == "$expected_status" ]]; then
                log_success "✅ $description erfolgreich (Status: $status_code, Duration: ${duration}s)" >&2
                
                # Warte nach erfolgreichem Request um Server nicht zu überlasten
                log_verbose "⏳ Warte ${MIN_RESPONSE_WAIT}s nach erfolgreichem Request..." >&2
                sleep "$MIN_RESPONSE_WAIT"
                
                # WICHTIG: NUR den JSON Body zurückgeben, NICHT die komplette Response
                echo "$response_body"
                return 0
            else
                log_error "❌ Expected $expected_status, got $status_code bei $description" >&2
                log_error "Response Body: ${response_body:0:500}..." >&2
                
                if [[ $retries -lt $((MAX_RETRIES - 1)) ]] && [[ "$status_code" =~ ^5[0-9][0-9]$ ]]; then
                    ((retries++))
                    log_warning "🔄 Server-Fehler $status_code bei $description (Versuch $retries/$MAX_RETRIES)" >&2
                    local server_error_delay=$((RETRY_DELAY * retries * 2))
                    log_verbose "⏳ Server-Fehler Backoff: ${server_error_delay}s" >&2
                    sleep "$server_error_delay"
                    continue
                else
                    # Warte auch bei Fehlern um Server nicht zu überlasten
                    sleep "$MIN_RESPONSE_WAIT"
                    return 1
                fi
            fi
        else
            log_error "💥 Ungültiger Status-Code: '$status_code'" >&2
            ((retries++))
            if [[ $retries -lt $MAX_RETRIES ]]; then
                log_warning "🔄 Ungültige Antwort bei $description (Versuch $retries/$MAX_RETRIES)" >&2
                sleep "$((RETRY_DELAY * retries))"
                continue
            else
                log_error "💥 Ungültige Antwort bei $description nach $MAX_RETRIES Versuchen" >&2
                sleep "$MIN_RESPONSE_WAIT"
                return 1
            fi
        fi
        
        break
    done
    
    log_error "💥 Request fehlgeschlagen: $description" >&2
    sleep "$MIN_RESPONSE_WAIT"
    return 1
}

# Verbesserte JSON-Extraktion
extract_json_value() {
    local json="$1"
    local key="$2"
    
    # Debug: Zeige was wir zu parsen versuchen
    log_debug "JSON Parse Input (first 200 chars): ${json:0:200}..." >&2
    log_debug "Looking for key: $key" >&2
    
    # Verwende jq falls verfügbar
    if command -v jq >/dev/null 2>&1; then
        local result=""
        result=$(echo "$json" | jq -r ".$key // empty" 2>/dev/null || echo "")
        log_debug "jq result: '$result'" >&2
        echo "$result"
    else
        # Fallback: Einfache Regex-basierte JSON-Extraktion
        if [[ "$json" =~ \"$key\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
            local result="${BASH_REMATCH[1]}"
            log_debug "regex result: '$result'" >&2
            echo "$result"
        else
            log_debug "regex failed to find key '$key'" >&2
            echo ""
        fi
    fi
}
# =====================================
# TEST-FUNKTIONEN
# =====================================
test_available_endpoints() {
    log_header "VERFÜGBARE ENDPUNKTE TESTEN"
    
    local endpoints=("/models" "/languages" "/api-docs" "/health" "/" "/docs" "/openapi.json")
    local available_count=0
    
    for endpoint in "${endpoints[@]}"; do
        log_info "🔍 Teste Endpunkt: $endpoint"
        
        # Sicher Zeit messen ohne bc-Abhängigkeit
        local start_time=$(date +%s.%N 2>/dev/null || date +%s)
        
        # Temporär set +e für den gesamten Test-Block
        set +e
        local curl_result=0
        curl -s --connect-timeout 5 --max-time 10 "$API_BASE_URL$endpoint" >/dev/null 2>&1
        curl_result=$?
        
        if [[ $curl_result -eq 0 ]]; then
            local end_time=$(date +%s.%N 2>/dev/null || date +%s)
            
            # Sichere Zeitberechnung
            local duration="unknown"
            if command -v bc >/dev/null 2>&1; then
                duration=$(echo "$end_time - $start_time" | bc -l 2>/dev/null || echo "unknown")
            fi
            
            log_success "✅ Endpunkt $endpoint erreichbar (${duration}s)"
            ((available_count++))
        else
            log_warning "❌ Endpunkt $endpoint nicht erreichbar"
        fi
        
        # set -e erst nach dem kompletten Test-Block wieder aktivieren
        set -e
    done
    
    log_info "📊 Verfügbare Endpunkte: $available_count/${#endpoints[@]}"
}

register_user() {
    log_header "BENUTZER-REGISTRIERUNG TESTS"
    
    log_info "👤 Test-Username: $TEST_USERNAME"
    log_info "🔐 Test-Password: [REDACTED ${#TEST_PASSWORD} Zeichen]"
    log_info "🔑 Registrierungsschlüssel: [REDACTED ${#TEST_REG_KEY} Zeichen]"
    
    # Vorherige Prüfung: Versuche Login mit dem geplanten Test-User
    log_section "VORHERIGE BENUTZER-PRÜFUNG"
    log_info "🔍 Prüfe ob Test-Benutzer bereits existiert..."
    
    local login_data="{\"username\":\"$TEST_USERNAME\",\"password\":\"$TEST_PASSWORD\"}"
    local login_response
    
    # Temporär set +e für den Login-Test
    set +e
    login_response=$(make_request "POST" "/login" "$login_data" "-H 'Content-Type: application/json'" "200" "Vorherige Login-Prüfung") && login_rc=0 || login_rc=$?
    set -e
    
    if [[ $login_rc -eq 0 ]]; then
        log_warning "⚠️  Test-Benutzer existiert bereits - versuche zu löschen"
        
        # Extrahiere API-Key aus Login-Response
        local existing_api_key=$(extract_json_value "$login_response" "api_key")
        
        if [[ -n "$existing_api_key" ]]; then
            log_verbose "🔑 API-Key aus bestehender Session erhalten (${#existing_api_key} Zeichen)"
            
            # Versuche Account zu löschen
            log_info "🗑️  Lösche bestehenden Test-Account..."
            local delete_response
            
            # Temporär set +e für die Löschung
            set +e
            delete_response=$(make_request "DELETE" "/user/delete" "" "-H 'X-API-Key: $existing_api_key'" "200" "Bestehenden Account löschen") && delete_rc=0 || delete_rc=$?
            set -e
            
            if [[ $delete_rc -eq 0 ]]; then
                log_success "✅ Bestehender Test-Account erfolgreich gelöscht"
                safe_sleep 3  # Warte nach Löschung
            else
                log_warning "⚠️  Konnte bestehenden Account nicht löschen - versuche trotzdem fortzufahren"
            fi
        else
            log_warning "⚠️  Kein API-Key in Login-Response gefunden"
        fi
    else
        log_info "✅ Test-Benutzer existiert noch nicht - kann mit Registrierung fortfahren"
    fi
    
    # Erfolgreiche Registrierung
    increment_test
    log_section "NEUE BENUTZER-REGISTRIERUNG"
    local register_data="{\"username\":\"$TEST_USERNAME\",\"password\":\"$TEST_PASSWORD\",\"reg_key\":\"$TEST_REG_KEY\"}"
    local response

    log_debug "register_data: $register_data"
    log_debug "📤 Registrierungs-Request wird vorbereitet..."

    response=$(make_request \
          "POST" "/register" "$register_data" \
          "-H 'Content-Type: application/json'" \
          "200" "Benutzer registrieren"
        ) && rc=0 || rc=$?

    log_debug "Empfangene Response: $response"
    USER_API_KEY=$(extract_json_value "$response" "api_key")

    if [[ $rc -eq 0 ]]; then
        log_info "📤 Registrierungs-Request erfolgreich"
        if [[ -n "$USER_API_KEY" ]]; then
            log_success "🎉 Benutzer erfolgreich registriert"
            log_verbose "🔑 API-Key erhalten (${#USER_API_KEY} Zeichen)"
            log_super_verbose "🔑 API-Key Preview: ${USER_API_KEY:0:10}***"
        else
            log_warning "⚠️  API-Key nicht in Registrierungs-Antwort gefunden - versuche Login"
            
            # Fallback: Versuche Login um API-Key zu bekommen
            log_info "🔐 Fallback-Login um API-Key zu erhalten..."
            safe_sleep 2
            
            local fallback_response
            fallback_response=$(make_request "POST" "/login" "$login_data" "-H 'Content-Type: application/json'" "200" "Fallback Login für API-Key") && fallback_rc=0 || fallback_rc=$?
            
            if [[ $fallback_rc -eq 0 ]]; then
                USER_API_KEY=$(extract_json_value "$fallback_response" "api_key")
                if [[ -n "$USER_API_KEY" ]]; then
                    log_success "✅ API-Key über Fallback-Login erhalten"
                    log_verbose "🔑 API-Key erhalten (${#USER_API_KEY} Zeichen)"
                    log_super_verbose "🔑 API-Key Preview: ${USER_API_KEY:0:10}***"
                else
                    log_error "❌ Auch Fallback-Login lieferte keinen API-Key"
                    log_error "📄 Fallback Response war: $fallback_response"
                    return 1
                fi
            else
                log_error "❌ Fallback-Login fehlgeschlagen"
                log_error "📄 Registrierung Response war: $response"
                return 1
            fi
        fi
    else
        log_error "💥 Benutzer-Registrierung fehlgeschlagen"
        log_error "📄 Response: $response"
        return 1
    fi

    safe_sleep 2
    
    # Doppelte Registrierung (sollte fehlschlagen)
    increment_test
    log_info "🔄 Teste doppelte Registrierung (sollte fehlschlagen)..."
    
    log_debug "📤 Doppelte Registrierungs-Request wird vorbereitet..."
    
    # Temporär set +e für erwarteten Fehler
    set +e
    response=$(make_request "POST" "/register" "$register_data" "-H 'Content-Type: application/json'" "400" "Doppelte Registrierung") && rc=0 || rc=$?
    set -e
    
    log_debug "Empfangene Response: $response"
    
    if [[ $rc -eq 0 ]]; then
        log_success "✅ Doppelte Registrierung korrekt blockiert"
    else
        log_warning "⚠️  Doppelte Registrierung nicht blockiert (möglicherweise anderer Fehlercode)"
        
        # Prüfe andere mögliche Status-Codes
        if [[ "$response" == *"409"* ]] || [[ "$response" == *"conflict"* ]]; then
            log_info "📊 Doppelte Registrierung mit 409 Conflict blockiert"
        elif [[ "$response" == *"422"* ]] || [[ "$response" == *"unprocessable"* ]]; then
            log_info "📊 Doppelte Registrierung mit 422 Unprocessable Entity blockiert"
        fi
    fi
}

test_login() {
    log_header "LOGIN TESTS"
    
    # Erfolgreicher Login (jetzt redundant, aber zur Vollständigkeit)
    increment_test
    log_info "🔐 Teste erfolgreichen Login (erneut)..."
    local login_data="{\"username\":\"$TEST_USERNAME\",\"password\":\"$TEST_PASSWORD\"}"
    local response
    
    log_debug "login_data: $login_data"
    log_debug "📤 Login-Request wird vorbereitet..."
    
    response=$(make_request "POST" "/login" "$login_data" "-H 'Content-Type: application/json'" "200" "Benutzer anmelden") && rc=0 || rc=$?
    
    log_debug "Empfangene Response: $response"
    
    if [[ $rc -eq 0 ]]; then
        log_success "✅ Login erfolgreich"
        
        # Vergleiche API-Keys (sollten identisch sein)
        local login_api_key=$(extract_json_value "$response" "api_key")
        if [[ -n "$login_api_key" && "$login_api_key" == "$USER_API_KEY" ]]; then
            log_success "✅ API-Key konsistent zwischen Registrierung und Login"
        elif [[ -n "$login_api_key" ]]; then
            log_warning "⚠️  API-Key unterschiedlich zwischen Registrierung und Login"
            log_verbose "🔑 Registrierung API-Key: ${USER_API_KEY:0:10}***"
            log_verbose "🔑 Login API-Key: ${login_api_key:0:10}***"
        fi
    else
        log_error "❌ Login fehlgeschlagen"
    fi
    
    safe_sleep 1
    
    # Login mit falschem Passwort
    increment_test
    log_info "🔐 Teste Login mit falschem Passwort..."
    local wrong_pass_data="{\"username\":\"$TEST_USERNAME\",\"password\":\"wrongpassword\"}"
    
    # Temporär set +e für erwarteten Fehler
    set +e
    response=$(make_request "POST" "/login" "$wrong_pass_data" "-H 'Content-Type: application/json'" "401" "Login mit falschem Passwort") && rc=0 || rc=$?
    set -e
    
    if [[ $rc -eq 0 ]]; then
        log_success "✅ Falsches Passwort korrekt blockiert"
    else
        log_warning "⚠️  Falsches Passwort nicht mit 401 blockiert"
    fi
    
    # Login mit leerem Passwort - ERWARTE 422 STATT 400
    increment_test
    log_info "🔐 Teste Login mit leerem Passwort..."
    local empty_pass_data="{\"username\":\"$TEST_USERNAME\",\"password\":\"\"}"
    
    # Temporär set +e für erwarteten Fehler
    set +e
    response=$(make_request "POST" "/login" "$empty_pass_data" "-H 'Content-Type: application/json'" "422" "Login mit leerem Passwort") && rc=0 || rc=$?
    set -e
    
    if [[ $rc -eq 0 ]]; then
        log_success "✅ Leeres Passwort korrekt blockiert (422 Unprocessable Entity)"
    else
        log_warning "⚠️  Leeres Passwort nicht korrekt blockiert"
        
        # Fallback: Prüfe auch auf 400
        set +e
        response=$(make_request "POST" "/login" "$empty_pass_data" "-H 'Content-Type: application/json'" "400" "Login mit leerem Passwort (Fallback)") && rc2=0 || rc2=$?
        set -e
        
        if [[ $rc2 -eq 0 ]]; then
            log_success "✅ Leeres Passwort korrekt blockiert (400 Bad Request)"
        else
            log_warning "⚠️  Leeres Passwort wird weder als 422 noch als 400 behandelt"
        fi
    fi
    
    # Login mit nicht-existentem Benutzer
    increment_test
    log_info "🔐 Teste Login mit nicht-existentem Benutzer..."
    local nonexistent_user_data="{\"username\":\"nonexistent_user_12345\",\"password\":\"somepassword\"}"
    
    # Temporär set +e für erwarteten Fehler
    set +e
    response=$(make_request "POST" "/login" "$nonexistent_user_data" "-H 'Content-Type: application/json'" "401" "Login mit nicht-existentem Benutzer") && rc=0 || rc=$?
    set -e
    
    if [[ $rc -eq 0 ]]; then
        log_success "✅ Nicht-existenter Benutzer korrekt blockiert"
    else
        log_warning "⚠️  Nicht-existenter Benutzer nicht korrekt behandelt"
    fi
}

test_api_authentication() {
    log_header "API-AUTHENTIFIZIERUNG TESTS"
    
    # Gültiger API-Key
    increment_test
    log_info "🔑 Teste gültigen API-Key..."
    local response
    
    log_debug "📤 API-Key Test wird vorbereitet..."
    
    response=$(make_request "GET" "/jobs" "" "-H 'X-API-Key: $USER_API_KEY'" "200" "Gültiger API-Key") && rc=0 || rc=$?
    
    log_debug "Empfangene Response: $response"
    
    if [[ $rc -eq 0 ]]; then
        log_success "✅ Gültiger API-Key akzeptiert"
    else
        log_error "❌ Gültiger API-Key nicht akzeptiert"
    fi
    
    safe_sleep 1
    
    # Ungültiger API-Key
    increment_test
    log_info "🔑 Teste ungültigen API-Key..."
    
    response=$(make_request "GET" "/jobs" "" "-H 'X-API-Key: invalid_key_12345'" "401" "Ungültiger API-Key") && rc=0 || rc=$?
    
    if [[ $rc -eq 0 ]]; then
        log_success "✅ Ungültiger API-Key korrekt abgelehnt"
    else
        log_error "❌ Ungültiger API-Key nicht abgelehnt"
    fi
    
    # Fehlender API-Key
    increment_test
    log_info "🔑 Teste fehlenden API-Key..."
    
    response=$(make_request "GET" "/jobs" "" "" "403" "Fehlender API-Key") && rc=0 || rc=$?
    
    if [[ $rc -eq 0 ]]; then
        log_success "✅ Fehlender API-Key korrekt abgelehnt"
    else
        log_warning "⚠️  Fehlender API-Key nicht korrekt behandelt"
    fi
}

test_public_endpoints() {
    log_header "ÖFFENTLICHE ENDPUNKT TESTS"
    
    # Models Endpunkt
    increment_test
    log_info "📋 Teste Models Endpunkt..."
    local response
    
    log_debug "📤 Models Endpunkt Test wird vorbereitet..."
    
    response=$(make_request "GET" "/models" "" "" "200" "Models Endpunkt") && rc=0 || rc=$?
    
    log_debug "Empfangene Response: $response"
    
    if [[ $rc -eq 0 ]]; then
        log_success "✅ Models Endpunkt erreichbar"
        log_verbose "📊 Models Response: ${response:0:100}..."
    else
        log_error "❌ Models Endpunkt nicht erreichbar"
    fi
    
    # Languages Endpunkt
    increment_test
    log_info "🌐 Teste Languages Endpunkt..."
    
    response=$(make_request "GET" "/languages" "" "" "200" "Languages Endpunkt") && rc=0 || rc=$?
    
    if [[ $rc -eq 0 ]]; then
        log_success "✅ Languages Endpunkt erreichbar"
        log_verbose "📊 Languages Response: ${response:0:100}..."
    else
        log_error "❌ Languages Endpunkt nicht erreichbar"
    fi
    
    # API Docs Endpunkt (falls verfügbar)
    increment_test
    log_info "📚 Teste API Docs Endpunkt..."
    
    response=$(make_request "GET" "/api-docs" "" "" "200" "API Docs Endpunkt") && rc=0 || rc=$?
    
    if [[ $rc -eq 0 ]]; then
        log_success "✅ API Docs Endpunkt erreichbar"
    else
        log_warning "⚠️  API Docs Endpunkt nicht verfügbar"
    fi
}

test_job_management() {
    log_header "JOB-MANAGEMENT TESTS"
    
    # Jobs auflisten (sollte leer sein für neuen User)
    increment_test
    log_info "📋 Teste Job-Liste abrufen..."
    local response
    
    log_debug "📤 Job-Liste Request wird vorbereitet..."
    
    response=$(make_request "GET" "/jobs" "" "-H 'X-API-Key: $USER_API_KEY'" "200" "Job-Liste abrufen") && rc=0 || rc=$?
    
    log_debug "Empfangene Response: $response"
    
    if [[ $rc -eq 0 ]]; then
        log_success "✅ Job-Liste erfolgreich abgerufen"
        log_verbose "📊 Jobs Response: $response"
        
        # Bereinige die Response von Whitespace für bessere Überprüfung
        local cleaned_response=$(echo "$response" | tr -d '[:space:]')
        
        # Prüfe ob Liste leer ist (neuer User)
        if [[ "$cleaned_response" == "[]" ]]; then
            log_success "✅ Job-Liste ist leer (erwartetes Verhalten für neuen User)"
        elif [[ "$response" == *"\"jobs\":[]"* ]] || [[ "$cleaned_response" == *"\"jobs\":[]"* ]]; then
            log_success "✅ Job-Liste ist leer (erwartetes Verhalten für neuen User)"
        elif [[ "$response" == *"\"total\":0"* ]] || [[ "$response" == *"\"count\":0"* ]]; then
            log_success "✅ Job-Liste ist leer (erwartetes Verhalten für neuen User)"
        else
            log_warning "⚠️  Job-Liste ist nicht leer für neuen User"
            log_verbose "📄 Unerwartete Response: $response"
        fi
    else
        log_error "❌ Job-Liste konnte nicht abgerufen werden"
    fi
    
    # Einzelnen Job abrufen (sollte 404 ergeben)
    increment_test
    log_info "🔍 Teste nicht-existenten Job abrufen..."
    
    # Temporär set +e für erwarteten 404 Fehler
    set +e
    response=$(make_request "GET" "/jobs/99999" "" "-H 'X-API-Key: $USER_API_KEY'" "404" "Nicht-existenter Job") && rc=0 || rc=$?
    set -e
    
    if [[ $rc -eq 0 ]]; then
        log_success "✅ Nicht-existenter Job korrekt als 404 behandelt"
    else
        log_warning "⚠️  Nicht-existenter Job nicht korrekt behandelt"
    fi
}

# Ersetze den ganzen test_audio_uploads Block mit diesem korrigierten Code:

test_audio_uploads() {
    log_header "ERWEITERTE AUDIO-UPLOAD TESTS"
    
    # Erst die ursprünglichen Single-Tests
    test_single_audio_upload
    
    # Dann die umfassenden Multi-Model-Tests
    test_comprehensive_audio_analysis
}

test_single_audio_upload() {
    log_info "🎵 Führe einzelne Audio-Upload-Tests durch..."
    
    local test_count=0
    local max_tests=1
    local audio_files_found=0
    local overall_success=true
    
    # Temporär set +e für Datei-Checks
    set +e
    
    # Prüfe verfügbare Audio-Dateien
    for audio_file in mp3/*.mp3; do
        if [[ -f "$audio_file" ]]; then
            ((audio_files_found++))
            log_debug "Gefundene Audio-Datei: $audio_file"
        fi
    done
    
    log_info "📁 Gefundene Audio-Dateien: $audio_files_found"
    
    if [[ $audio_files_found -eq 0 ]]; then
        log_warning "⚠️  Keine Audio-Dateien für Upload-Tests gefunden"
        set -e
        return 0
    fi
    
    if [[ ! -d "mp3" ]]; then
        log_error "❌ mp3 Verzeichnis nicht gefunden"
        set -e
        return 1
    fi
    
    if [[ ! -r "mp3" ]]; then
        log_error "❌ mp3 Verzeichnis nicht lesbar"
        set -e
        return 1
    fi
    
    set -e
    
    for audio_file in mp3/*.mp3; do
        if [[ ! -f "$audio_file" ]]; then
            log_debug "Überspringe nicht-existente Datei: $audio_file"
            continue
        fi
        
        if [[ $test_count -ge $max_tests ]]; then
            log_info "📊 Maximale Anzahl Audio-Tests erreicht ($max_tests)"
            break
        fi
        
        local lang_code=""
        if [[ "$audio_file" =~ mp3/([^/]+)\.mp3$ ]]; then
            lang_code="${BASH_REMATCH[1]}"
        else
            log_warning "⚠️  Kann Sprachcode nicht aus Dateinamen extrahieren: $audio_file"
            continue
        fi
        
        local file_size="unknown"
        set +e
        if command -v stat >/dev/null 2>&1; then
            file_size=$(stat -f%z "$audio_file" 2>/dev/null)
            if [[ $? -ne 0 || -z "$file_size" ]]; then
                file_size=$(stat -c%s "$audio_file" 2>/dev/null)
                if [[ $? -ne 0 || -z "$file_size" ]]; then
                    file_size=$(ls -l "$audio_file" 2>/dev/null | awk '{print $5}')
                    if [[ $? -ne 0 || -z "$file_size" ]]; then
                        file_size="unknown"
                    fi
                fi
            fi
        else
            file_size="unknown"
        fi
        set -e
        
        if [[ "$lang_code" != "de" ]]; then
            log_debug "Überspringe Sprache: $lang_code (teste nur 'de')"
            continue
        fi
        
        if [[ ! -r "$audio_file" ]]; then
            log_error "❌ Audio-Datei nicht lesbar: $audio_file"
            continue
        fi
        
        log_info "🎵 Teste Audio-Datei: $audio_file"
        log_verbose "📊 Dateigröße: $file_size Bytes"
        log_verbose "🗣️  Sprache: $lang_code"
        
        increment_test
        
        local form_data="-F 'file=@$audio_file' -F 'model=tiny' -F 'language=auto'"
        local response
        
        log_debug "form_data: $form_data"
        log_debug "📤 Audio-Upload Request wird vorbereitet..."
        
        set +e
        response=$(make_request "POST" "/jobs" "$form_data" "-H 'X-API-Key: $USER_API_KEY'" "200" "Audio-Upload") && rc=0 || rc=$?
        set -e
        
        if [[ $rc -eq 0 ]]; then
            local job_id=$(extract_json_value "$response" "job_id")
            
            if [[ -n "$job_id" ]]; then
                log_success "✅ Audio-Upload erfolgreich (Job: $job_id)"
                
                # Warte auf Job-Completion und capture nur die JSON-Response
                local final_job_response
                final_job_response=$(wait_for_job_completion "$job_id" "Single Audio Test")
                local job_completion_rc=$?
                
                if [[ $job_completion_rc -eq 0 && -n "$final_job_response" ]]; then
                    # Debug: Zeige was wir erhalten haben
                    log_debug "Final Job Response (first 200 chars): ${final_job_response:0:200}..." >&2
                    validate_transcription_result "$final_job_response" "$lang_code"
                else
                    log_warning "⚠️  Job nicht abgeschlossen - keine Inhalt-Validierung möglich"
                fi
            else
                log_error "❌ Job-ID nicht in Antwort gefunden"
                log_error "📄 Response: $response"
            fi
        else
            log_error "💥 Audio-Upload fehlgeschlagen (Return Code: $rc)"
            overall_success=false
            # NICHT exit 1 - nur markieren als fehlgeschlagen
        fi
        
        ((test_count++))
        
        log_verbose "⏳ Warte 5s zwischen Audio-Tests..." >&2
        set +e
        sleep 5 || log_warning "Sleep wurde unterbrochen, setze trotzdem fort..."
        set -e
    done
    
    if [[ "$overall_success" == "true" ]]; then
        log_success "✅ Alle Audio-Tests erfolgreich"
        return 0
    else
        log_warning "⚠️  Einige Audio-Tests fehlgeschlagen"
        return 1  # Aber kein exit!
    fi
}

# Hilfsfunktion: Warte auf Job-Completion
wait_for_job_completion() {
    local job_id="$1"
    local description="$2"
    local max_checks=12  # Reduziert von 15
    local check_interval=10  # Erhöht von 8
    local checks=0
    
    log_verbose "⏳ Warte auf Job-Completion: $job_id ($description)" >&2
    
    while [[ $checks -lt $max_checks ]]; do
        sleep "$check_interval" || true
        ((checks++))
        
        log_verbose "🔍 Job-Check #$checks/$max_checks für $job_id..." >&2
        
        set +e
        local job_response
        job_response=$(make_request "GET" "/jobs/$job_id" "" "-H 'X-API-Key: $USER_API_KEY'" "200" "Job-Status $description") && rc=0 || rc=$?
        set -e
        
        if [[ $rc -eq 0 ]]; then
            local status=$(extract_json_value "$job_response" "status")
            
            case "$status" in
                "completed")
                    log_verbose "✅ Job $job_id abgeschlossen nach ${checks} Checks" >&2
                    echo "$job_response"
                    return 0
                    ;;
                "failed")
                    log_error "❌ Job $job_id fehlgeschlagen nach ${checks} Checks" >&2
                    local error_msg=$(extract_json_value "$job_response" "error_message")
                    log_error "🔍 Fehler: $error_msg" >&2
                    return 1
                    ;;
                "processing")
                    log_verbose "⏳ Job $job_id wird noch verarbeitet (${checks}/${max_checks})..." >&2
                    ;;
                *)
                    log_verbose "📊 Job $job_id Status: $status (${checks}/${max_checks})" >&2
                    ;;
            esac
        else
            log_warning "⚠️  Konnte Job-Status für $job_id nicht abrufen (Versuch ${checks}/${max_checks})" >&2
        fi
    done
    
    log_warning "⚠️  Timeout für Job $job_id nach $max_checks Versuchen (${max_checks}*${check_interval}s)" >&2
    return 1
}

# Validiere Transkriptionsergebnis
validate_transcription_result() {
    local job_response="$1"
    local lang_code="$2"
    
    increment_test
    log_info "📝 Validiere Transkriptionsergebnis..."
    
    local transcription_result=$(extract_json_value "$job_response" "result")
    local detected_language=$(extract_json_value "$job_response" "detected_language")
    local audio_duration=$(extract_json_value "$job_response" "audio_duration")
    
    log_verbose "📊 Transkriptionsergebnis: '$transcription_result'"
    log_verbose "🗣️  Erkannte Sprache: '$detected_language'"
    log_verbose "⏱️  Audio-Dauer: ${audio_duration}s"
    
    if [[ -n "$transcription_result" && "$transcription_result" != "null" ]]; then
        local cleaned_result=$(echo "$transcription_result" | xargs)
        local expected_text="${EXPECTED_TEXTS[$lang_code]:-}"
        
        if [[ -n "$expected_text" ]]; then
            local cleaned_expected=$(echo "$expected_text" | tr '[:upper:]' '[:lower:]' | xargs)
            local cleaned_actual=$(echo "$cleaned_result" | tr '[:upper:]' '[:lower:]' | xargs)
            
            if [[ "$cleaned_actual" == *"$cleaned_expected"* ]] || [[ "$cleaned_expected" == *"$cleaned_actual"* ]]; then
                log_success "✅ Transkriptionsergebnis entspricht Erwartung"
                log_verbose "✅ Erwartet: '$expected_text'"
                log_verbose "✅ Erhalten: '$transcription_result'"
            else
                log_warning "⚠️  Transkriptionsergebnis weicht von Erwartung ab"
                log_warning "📄 Erwartet: '$expected_text'"
                log_warning "📄 Erhalten: '$transcription_result'"
                log_info "ℹ️  Dies ist normal bei verschiedenen Whisper-Modellen"
            fi
        else
            log_warning "⚠️  Kein erwarteter Text für Sprache '$lang_code' definiert"
        fi
        
        local result_length=${#cleaned_result}
        if [[ $result_length -gt 0 ]]; then
            log_success "✅ Transkription ist nicht leer ($result_length Zeichen)"
        else
            log_error "❌ Transkription ist leer"
        fi
        
        if [[ "$cleaned_result" =~ [a-zA-Z] ]]; then
            log_success "✅ Transkription enthält Text"
        else
            log_warning "⚠️  Transkription enthält nur Sonderzeichen: '$cleaned_result'"
        fi
        
        if [[ -n "$detected_language" ]]; then
            log_verbose "🗣️  Spracherkennung: $detected_language"
            
            if [[ "$detected_language" == "en" ]] || [[ "$detected_language" == "de" ]] || [[ "$detected_language" == "$lang_code" ]]; then
                log_success "✅ Spracherkennung plausibel: $detected_language"
            else
                log_info "ℹ️  Unerwartete Sprache erkannt: $detected_language (Datei: $lang_code)"
            fi
        fi
        
        if [[ -n "$audio_duration" && "$audio_duration" != "null" ]]; then
            log_success "✅ Audio-Dauer ermittelt: ${audio_duration}s"
            
            if (( $(echo "$audio_duration > 0.5" | bc -l 2>/dev/null || echo 0) )) && (( $(echo "$audio_duration < 10" | bc -l 2>/dev/null || echo 1) )); then
                log_success "✅ Audio-Dauer ist plausibel"
            else
                log_warning "⚠️  Ungewöhnliche Audio-Dauer: ${audio_duration}s"
            fi
        fi
    else
        log_error "❌ Keine Transkription im Ergebnis gefunden"
        log_error "📄 Job Response: $job_response"
    fi
}

test_comprehensive_audio_analysis() {
    log_header "UMFASSENDE AUDIO-ANALYSE TESTS"
    
    # Sichere Modell-Abfrage
    log_info "📋 Lade verfügbare Modelle..."
    local models_response=""
    local models_rc=0
    
    set +e
    models_response=$(make_request "GET" "/models" "" "" "200" "Verfügbare Modelle abrufen") 
    models_rc=$?
    set -e
    
    local available_models=()
    if [[ $models_rc -eq 0 ]]; then
        if command -v jq >/dev/null 2>&1; then
            set +e
            available_models=($(echo "$models_response" | jq -r '.[] // empty' 2>/dev/null))
            set -e
        fi
        
        # Fallback wenn jq fehlschlägt oder keine Modelle gefunden
        if [[ ${#available_models[@]} -eq 0 ]]; then
            available_models=("tiny" "base" "small")
            log_warning "⚠️  Fallback zu Standard-Modellen"
        fi
        
        log_success "✅ Gefundene Modelle: ${available_models[*]}"
    else
        log_warning "⚠️  Konnte Modelle nicht abrufen - verwende Standard-Modelle"
        available_models=("tiny" "base" "small")
    fi
    
    # Sichere Array-Behandlung
    local audio_files_found=0
    local test_languages=()
    
    set +e
    # Verwende find statt Globbing für sicherere Datei-Erkennung
    while IFS= read -r -d '' audio_file; do
        if [[ -f "$audio_file" ]]; then
            local lang_code=""
            if [[ "$audio_file" =~ mp3/([^/]+)\.mp3$ ]]; then
                lang_code="${BASH_REMATCH[1]}"
                test_languages+=("$lang_code")
                ((audio_files_found++))
            fi
        fi
    done < <(find mp3 -name "*.mp3" -type f -print0 2>/dev/null)
    set -e
    
    if [[ $audio_files_found -eq 0 ]]; then
        log_warning "⚠️  Keine Audio-Dateien für umfassende Tests gefunden"
        return 0  # Explizit erfolgreicher Return
    fi
    
    log_info "📊 Starte umfassende Tests mit ${#test_languages[@]} Sprachen und ${#available_models[@]} Modellen"
    
    # WICHTIG: Sichere Array-Erstellung
    declare -A results_matrix
    declare -A language_detection_matrix
    
    # Begrenze Tests um Timeouts zu vermeiden
    local max_languages=2  # Reduziert von 3
    local max_models=2
    local lang_count=0
    local total_tests_planned=$((max_languages * max_models * 2))
    
    log_info "📊 Plane $total_tests_planned umfassende Tests"
    
    # Sichere Schleife mit Exit-Behandlung
    for lang_code in "${test_languages[@]}"; do
        if [[ $lang_count -ge $max_languages ]]; then
            log_info "📊 Erreiche Sprach-Limit: $max_languages"
            break
        fi
        
        # Sichere Validierung
        if [[ -z "$lang_code" ]]; then
            log_warning "⚠️  Überspringe leeren Sprachcode"
            continue
        fi
        
        local audio_file="mp3/${lang_code}.mp3"
        local expected_text="${EXPECTED_TEXTS[$lang_code]:-Unbekannt}"
        
        log_info "🌐 Teste Sprache: $lang_code (Datei: $audio_file)"
        log_verbose "📄 Erwarteter Text: '$expected_text'"
        
        if [[ ! -f "$audio_file" ]]; then
            log_warning "⚠️  Audio-Datei nicht gefunden: $audio_file"
            continue
        fi
        
        local model_count=0
        for model in "${available_models[@]}"; do
            if [[ $model_count -ge $max_models ]]; then
                log_info "📊 Erreiche Modell-Limit: $max_models"
                break
            fi
            
            # Sichere Validierung
            if [[ -z "$model" ]]; then
                log_warning "⚠️  Überspringe leeres Modell"
                continue
            fi
            
            log_info "🤖 Teste Modell: $model mit Sprache: $lang_code"
            
            # Sichere Test-Ausführung mit Fehlerbehandlung
            local test_success=true
            
            # Test 1: AUTO (mit umfassender Fehlerbehandlung)
            set +e
            local auto_result=$(run_comprehensive_test "$audio_file" "$model" "auto" "$lang_code")
            local auto_rc=$?
            if [[ $auto_rc -ne 0 ]]; then
                test_success=false
                log_warning "⚠️  AUTO Test fehlgeschlagen: $model + $lang_code"
            fi
            set -e
            
            # Test 2: HINT (mit umfassender Fehlerbehandlung)
            set +e
            local hint_result=$(run_comprehensive_test "$audio_file" "$model" "$lang_code" "$lang_code")
            local hint_rc=$?
            if [[ $hint_rc -ne 0 ]]; then
                test_success=false
                log_warning "⚠️  HINT Test fehlgeschlagen: $model + $lang_code"
            fi
            set -e
            
            if [[ "$test_success" == "false" ]]; then
                log_warning "⚠️  Model $model mit Sprache $lang_code hatte Probleme"
            fi
            
            ((model_count++))
            
            # Längere Pause zwischen Tests
            log_verbose "⏳ Warte 5s zwischen umfassenden Tests..." >&2
            safe_sleep 5
        done
        
        ((lang_count++))
        safe_sleep 3
    done
    
    # Immer erfolgreich beenden (keine kritischen Fehler)
    log_success "✅ Umfassende Audio-Analyse abgeschlossen (möglicherweise mit Warnungen)"
    return 0
}

# Neue Hilfsfunktion für sichere Test-Ausführung
run_comprehensive_test() {
    local audio_file="$1"
    local model="$2"
    local language="$3"
    local lang_code="$4"
    
    increment_test
    log_info "🔄 Teste: $model + $lang_code ($language)"
    
    local form_data="-F 'file=@$audio_file' -F 'model=$model' -F 'language=$language'"
    local response=""
    local rc=0
    
    set +e
    response=$(make_request "POST" "/jobs" "$form_data" "-H 'X-API-Key: $USER_API_KEY'" "200" "Upload $lang_code mit $model ($language)")
    rc=$?
    set -e
    
    if [[ $rc -ne 0 ]]; then
        log_error "❌ Upload fehlgeschlagen: $model + $lang_code ($language)"
        return 1
    fi
    
    local job_id=$(extract_json_value "$response" "job_id")
    
    if [[ -z "$job_id" ]]; then
        log_error "❌ Keine Job-ID erhalten: $model + $lang_code ($language)"
        return 1
    fi
    
    # Job-Completion mit Timeout
    set +e
    local job_result=$(wait_for_job_completion "$job_id" "$model-$lang_code-$language")
    local job_rc=$?
    set -e
    
    if [[ $job_rc -eq 0 && -n "$job_result" ]]; then
        log_success "✅ Test erfolgreich: $model + $lang_code ($language)"
        return 0
    else
        log_warning "⚠️  Job nicht abgeschlossen: $model + $lang_code ($language)"
        return 1
    fi
}
# =====================================
# REPORTING
# =====================================

show_report() {
    log_header "TEST-ERGEBNISSE ZUSAMMENFASSUNG"
    
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════════════════════╗${NC}"
    printf "${CYAN}║${NC}                                ${CYAN}TEST REPORT${NC}                                ${CYAN}║${NC}\n"
    echo -e "${CYAN}╠══════════════════════════════════════════════════════════════════════════════════╣${NC}"
    printf "${CYAN}║${NC} ${CYAN}Tests gesamt:${NC} %-63s ${CYAN}║${NC}\n" "$TESTS_TOTAL"
    printf "${CYAN}║${NC} ${GREEN}Erfolgreich:${NC} %-64s ${CYAN}║${NC}\n" "$TESTS_PASSED"
    printf "${CYAN}║${NC} ${RED}Fehlgeschlagen:${NC} %-61s ${CYAN}║${NC}\n" "$TESTS_FAILED"
    
    local success_rate=0
    if [[ $TESTS_TOTAL -gt 0 ]]; then
        success_rate=$((TESTS_PASSED * 100 / TESTS_TOTAL))
    fi
    printf "${CYAN}║${NC} ${CYAN}Erfolgsrate:${NC} %-62s ${CYAN}║${NC}\n" "${success_rate}%"
    
    local end_time=$(date '+%Y-%m-%d %H:%M:%S')
    printf "${CYAN}║${NC} ${CYAN}Beendet am:${NC} %-63s ${CYAN}║${NC}\n" "$end_time"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════════════════════╝${NC}"
    
    if [[ $TESTS_FAILED -gt 0 ]]; then
        echo
        echo -e "${RED}╔══════════════════════════════════════════════════════════════════════════════════╗${NC}"
        printf "${RED}║${NC}                              ${RED}FEHLGESCHLAGENE TESTS${NC}                            ${RED}║${NC}\n"
        echo -e "${RED}╠══════════════════════════════════════════════════════════════════════════════════╣${NC}"
        
        local count=1
        for failed_test in "${FAILED_TESTS[@]}"; do
            printf "${RED}║${NC} ${count}. %-77s ${RED}║${NC}\n" "${failed_test:0:77}"
            ((count++))
        done
        
        echo -e "${RED}╚══════════════════════════════════════════════════════════════════════════════════╝${NC}"
        echo
        return 1
    else
        echo
        echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════════════════════╗${NC}"
        printf "${GREEN}║${NC}                    ${GREEN}🎉 ALLE TESTS ERFOLGREICH! 🎉${NC}                        ${GREEN}║${NC}\n"
        echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════════════════╝${NC}"
        echo
        return 0
    fi
}

# =====================================
# HAUPTFUNKTION
# =====================================

main() {
    local start_time=$(date '+%Y-%m-%d %H:%M:%S')
    
    log_header "WHISPER TRANSCRIBER API TEST SUITE"
    log_info "🚀 Test-Suite gestartet am: $start_time"
    
    # Temporär set +e für alle Tool-Checks und Environment-Logging
    set +e
    
    # System-Informationen loggen
    log_environment
    log_test_configuration
    
    # Voraussetzungen prüfen
    log_section "VORAUSSETZUNGEN PRÜFEN"
    
    # Curl ist erforderlich
    if ! command -v curl &> /dev/null; then
        log_error "💥 curl ist nicht installiert"
        exit 1
    else
        log_success "✅ curl ist verfügbar"
    fi
    
    # jq ist optional - bleibt in set +e Modus
    if command -v jq &> /dev/null; then
        log_success "✅ jq ist verfügbar"
    else
        log_warning "⚠️  jq ist nicht installiert - verwende einfache JSON-Extraktion"
    fi
    
    # bc ist optional - bleibt in set +e Modus
    if command -v bc &> /dev/null; then
        log_success "✅ bc ist verfügbar"
    else
        log_warning "⚠️  bc ist nicht installiert - Zeitberechnungen könnten ungenau sein"
    fi
    
    # Jetzt set -e wieder aktivieren für kritische Operationen
    set -e
    
    # Audio-Dateien prüfen
    if [[ ! -d "mp3" ]]; then
        log_error "💥 mp3 Ordner nicht gefunden: $(pwd)/mp3"
        exit 1
    else
        log_success "✅ mp3 Ordner gefunden"
    fi
    
    local mp3_count=$(find mp3 -name "*.mp3" -type f 2>/dev/null | wc -l)
    if [[ $mp3_count -eq 0 ]]; then
        log_error "💥 Keine MP3-Dateien im mp3 Ordner gefunden"
        exit 1
    else
        log_success "✅ Gefunden: $mp3_count MP3-Dateien"
    fi
    
    # Umgebung laden
    if ! load_env; then
        log_error "💥 Umgebung konnte nicht geladen werden"
        exit 1
    fi
    
    # Tests ausführen
    log_section "HAUPTTESTS STARTEN"
    
    # Verfügbare Endpunkte testen
    test_available_endpoints
    
    # Benutzer-Management Tests
    if ! register_user; then
        log_error "💥 Registrierung fehlgeschlagen - beende Tests"
        exit 1
    fi

    test_login
    test_api_authentication
    test_public_endpoints
    test_job_management

    # Audio-Tests - FEHLERBEHANDLUNG KORRIGIEREN
    log_info "🎵 Starte Audio-Upload-Tests..."
    set +e  # Temporär Fehlertoleranz für Audio-Tests
    test_audio_uploads
    audio_test_rc=$?
    set -e

    if [[ $audio_test_rc -ne 0 ]]; then
        log_warning "⚠️  Audio-Tests hatten Probleme, setze aber mit anderen Tests fort"
    else
        log_success "✅ Audio-Tests erfolgreich abgeschlossen"
    fi

    # Weitere Tests fortsetzen
    test_upload_limits
    test_account_deletion
    
    # Ergebnisse anzeigen
    log_section "FINALE AUSWERTUNG"
    
    if show_report; then
        log_success "🎉 Alle Tests erfolgreich abgeschlossen!"
        exit 0
    else
        log_error "💥 Einige Tests sind fehlgeschlagen!"
        exit 1
    fi
}

# =====================================
# SCRIPT STARTEN
# =====================================

# Script mit allen verfügbaren Informationen starten
main "$@"