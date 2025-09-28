#!/usr/bin/env python3
"""
HelpTool Backend - Docker-optimierte Version
Ersetzt das komplexe backend.py (117k Zeichen) durch eine schlanke Flask-App
"""
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import os
import json
import time
import subprocess
from typing import Any, Dict, List, Tuple

# Flask App initialisieren
app = Flask(__name__)
CORS(app)

# Basis-Konfiguration
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
STATIC_DIR = os.path.join(BASE_DIR, 'static')

# Sicherstellen, dass Datenverzeichnis existiert
os.makedirs(DATA_DIR, exist_ok=True)


def get_timestamp_iso():
    """Gibt aktuellen Zeitstempel im ISO-Format zurück"""
    return time.strftime('%Y-%m-%dT%H:%M:%S.000Z')

def load_json(filename: str) -> Any:
    """Lädt JSON-Datei sicher oder gibt leere Liste zurück"""
    filepath = os.path.join(DATA_DIR, f"{filename}.json")
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Warnung: {filename}.json nicht gefunden oder beschädigt: {e}")
        return []

def save_json(filename: str, data: Any):
    """Speichert Daten als JSON-Datei"""
    filepath = os.path.join(DATA_DIR, f"{filename}.json")
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Fehler beim Speichern von {filename}.json: {e}")
        return False

def ensure_list(data: Any) -> List[Dict[str, Any]]:
    """Stellt sicher, dass die geladene JSON-Struktur eine Liste ist."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return list(data.values())
    return []


def assign_incremental_id(items: List[Dict[str, Any]]) -> int:
    """Ermittelt eine neue fortlaufende ID für Listenobjekte."""
    return max([item.get('id', 0) for item in items], default=0) + 1


def log_tool_usage(tool):
    """Protokolliert Tool-Nutzung"""
    log_entry = {
        "timestamp": get_timestamp_iso(),
        "tool_id": tool.get('id'),
        "tool_name": tool.get('name', 'Unbekanntes Tool'),
        "tool_path": tool.get('path', '')
    }

    log_data = load_json('tool_usage_log')
    log_data.append(log_entry)

    # Nur die letzten 1000 Einträge behalten
    if len(log_data) > 1000:
        log_data = log_data[-1000:]

    save_json('tool_usage_log', log_data)

# =============================================================================
# STATIC FILE ROUTES (Ersetzt komplexe Frontend-Logik)
# =============================================================================

@app.route('/')
def index():
    """Hauptseite ausliefern"""
    return send_from_directory(STATIC_DIR, 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    """Statische Dateien ausliefern"""
    return send_from_directory(STATIC_DIR, filename)

# =============================================================================
# TOOLS API (Ersetzt komplexe Tool-Management-Logik)
# =============================================================================

@app.route('/api/tools', methods=['GET'])
def get_tools():
    """Alle Tools laden"""
    return jsonify(load_json('tools'))


@app.route('/api/tools', methods=['POST'])
def add_tool():
    """Neues Tool hinzufügen"""
    data = request.get_json(force=True, silent=True) or {}
    tools = ensure_list(load_json('tools'))

    new_id = assign_incremental_id(tools)
    data.setdefault('created', get_timestamp_iso())
    data['id'] = new_id
    data.setdefault('autostart', False)
    data.setdefault('requiresAdmin', False)

    tools.append(data)
    save_json('tools', tools)

    return jsonify({"success": True, "tool": data}), 201


@app.route('/api/tools/<int:tool_id>', methods=['GET', 'PUT', 'DELETE'])
def tool_item(tool_id: int):
    """Tool abrufen, aktualisieren oder löschen."""
    tools = ensure_list(load_json('tools'))
    idx = next((i for i, tool in enumerate(tools) if tool.get('id') == tool_id), None)

    if idx is None:
        return jsonify({"error": "Tool nicht gefunden"}), 404

    if request.method == 'GET':
        return jsonify(tools[idx])

    if request.method == 'DELETE':
        deleted = tools.pop(idx)
        save_json('tools', tools)
        return jsonify({"success": True, "tool": deleted})

    payload = request.get_json(force=True, silent=True) or {}
    tools[idx].update(payload)
    tools[idx]['id'] = tool_id
    save_json('tools', tools)
    return jsonify({"success": True, "tool": tools[idx]})


def _update_tool_flag(tool_id: int, field: str, value: bool) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    tools = ensure_list(load_json('tools'))
    idx = next((i for i, tool in enumerate(tools) if tool.get('id') == tool_id), None)
    if idx is None:
        return {}, tools
    tools[idx][field] = bool(value)
    save_json('tools', tools)
    return tools[idx], tools


@app.route('/api/tools/<int:tool_id>/autostart', methods=['PUT'])
def toggle_tool_autostart(tool_id: int):
    payload = request.get_json(force=True, silent=True) or {}
    tool, _ = _update_tool_flag(tool_id, 'autostart', payload.get('autostart', True))
    if not tool:
        return jsonify({"error": "Tool nicht gefunden"}), 404
    return jsonify({"success": True, "tool": tool})


@app.route('/api/tools/<int:tool_id>/admin', methods=['PUT'])
def toggle_tool_admin(tool_id: int):
    payload = request.get_json(force=True, silent=True) or {}
    tool, _ = _update_tool_flag(tool_id, 'requiresAdmin', payload.get('admin', payload.get('requiresAdmin', True)))
    if not tool:
        return jsonify({"error": "Tool nicht gefunden"}), 404
    return jsonify({"success": True, "tool": tool})

def _execute_tool(tool: Dict[str, Any]) -> Dict[str, Any]:
    """Führt ein Tool aus oder simuliert die Ausführung."""
    try:
        tool_path = tool.get('path', '')
        log_tool_usage(tool)

        if tool_path and os.path.exists(tool_path):
            result = subprocess.run(['python', tool_path], capture_output=True, text=True, timeout=30)
            return {
                "success": True,
                "message": f"Tool '{tool.get('name')}' gestartet",
                "output": result.stdout[:500],
            }

        return {
            "success": True,
            "message": f"Tool '{tool.get('name')}' simuliert gestartet (Docker-Modus)",
        }

    except subprocess.TimeoutExpired:
        return {"error": "Tool-Ausführung Zeitüberschreitung"}
    except Exception as exc:  # pragma: no cover - defensive logging
        return {"error": f"Fehler beim Starten: {exc}"}


def _find_tool(tool_id: int) -> Dict[str, Any]:
    tools = ensure_list(load_json('tools'))
    return next((t for t in tools if t.get('id') == tool_id), {})


@app.route('/api/tools/<int:tool_id>/start', methods=['POST'])
def start_tool(tool_id: int):
    tool = _find_tool(tool_id)
    if not tool:
        return jsonify({"error": "Tool nicht gefunden"}), 404

    result = _execute_tool(tool)
    status = 200 if result.get('success') else 500
    return jsonify(result), status


@app.route('/api/start-tool', methods=['POST'])
def start_tool_by_body():
    payload = request.get_json(force=True, silent=True) or {}
    tool_id = int(payload.get('id', 0))
    tool = _find_tool(tool_id)
    if not tool:
        return jsonify({"error": "Tool nicht gefunden"}), 404

    result = _execute_tool(tool)
    status = 200 if result.get('success') else 500
    return jsonify(result), status

# =============================================================================
# TICKETS API (Ersetzt komplexes Ticket-System)
# =============================================================================

@app.route('/api/tickets', methods=['GET'])
def get_tickets():
    """Alle Tickets laden"""
    return jsonify(load_json('tickets'))

@app.route('/api/tickets', methods=['POST'])
def add_ticket():
    """Neues Ticket erstellen"""
    data = request.get_json()
    tickets = load_json('tickets')

    new_id = max([ticket.get('id', 0) for ticket in tickets], default=0) + 1
    data.update({
        'id': new_id,
        'created': get_timestamp_iso(),
        'status': data.get('status', 'open')
    })

    tickets.append(data)
    save_json('tickets', tickets)

    return jsonify({"success": True, "ticket": data}), 201

@app.route('/api/tickets/<int:ticket_id>', methods=['PUT'])
def update_ticket(ticket_id):
    """Ticket aktualisieren"""
    data = request.get_json()
    tickets = load_json('tickets')

    for i, ticket in enumerate(tickets):
        if ticket.get('id') == ticket_id:
            tickets[i].update(data)
            tickets[i]['updated'] = get_timestamp_iso()
            save_json('tickets', tickets)
            return jsonify({"success": True, "ticket": tickets[i]})

    return jsonify({"error": "Ticket nicht gefunden"}), 404

@app.route('/api/tickets/<int:ticket_id>', methods=['DELETE'])
def delete_ticket(ticket_id):
    """Ticket löschen"""
    tickets = load_json('tickets')
    
    for i, ticket in enumerate(tickets):
        if ticket.get('id') == ticket_id:
            deleted_ticket = tickets.pop(i)
            save_json('tickets', tickets)
            return jsonify({"success": True, "deleted_ticket": deleted_ticket})
    
    return jsonify({"error": "Ticket nicht gefunden"}), 404

# =============================================================================
# CONTACTS API (Ersetzt komplexes Telefonbuch)
# =============================================================================

def _load_contacts() -> List[Dict[str, Any]]:
    return ensure_list(load_json('telefonbuch'))


def _save_contacts(contacts: List[Dict[str, Any]]):
    save_json('telefonbuch', contacts)


@app.route('/api/telefonbuch', methods=['GET'])
def get_phonebook():
    return jsonify(_load_contacts())


@app.route('/api/telefonbuch', methods=['POST'])
def add_phonebook_entry():
    data = request.get_json(force=True, silent=True) or {}
    contacts = _load_contacts()

    new_id = assign_incremental_id(contacts)
    data['id'] = new_id
    data.setdefault('created', get_timestamp_iso())

    contacts.append(data)
    _save_contacts(contacts)
    return jsonify({"success": True, "contact": data}), 201


@app.route('/api/telefonbuch/<int:contact_id>', methods=['PUT', 'DELETE'])
def modify_phonebook_entry(contact_id: int):
    contacts = _load_contacts()
    idx = next((i for i, contact in enumerate(contacts) if contact.get('id') == contact_id), None)

    if idx is None:
        return jsonify({"error": "Kontakt nicht gefunden"}), 404

    if request.method == 'DELETE':
        removed = contacts.pop(idx)
        _save_contacts(contacts)
        return jsonify({"success": True, "contact": removed})

    payload = request.get_json(force=True, silent=True) or {}
    contacts[idx].update(payload)
    contacts[idx]['id'] = contact_id
    _save_contacts(contacts)
    return jsonify({"success": True, "contact": contacts[idx]})


@app.route('/api/contacts', methods=['GET'])
def get_contacts_alias():
    """Alias für Legacy-Frontend-Aufrufe."""
    return jsonify(_load_contacts())


@app.route('/api/contacts', methods=['POST'])
def create_contact_alias():
    return add_phonebook_entry()

# =============================================================================
# NETWORK API (Ersetzt komplexe Netzwerk-Funktionen)
# =============================================================================

@app.route('/api/network/settings', methods=['GET'])
def get_network_settings():
    """Netzwerk-Einstellungen laden"""
    return jsonify(load_json('network_settings'))

@app.route('/api/network/devices', methods=['GET'])
def get_network_devices():
    """Netzwerk-Geräte laden"""
    return jsonify(load_json('network_devices'))

@app.route('/api/network/ping', methods=['POST'])
def ping_device():
    """Gerät anpingen (Docker-kompatibel)"""
    data = request.get_json()
    host = data.get('host', '')

    if not host:
        return jsonify({"error": "Host-Parameter fehlt"}), 400

    try:
        # Vereinfachter Ping für Docker
        result = subprocess.run(['ping', '-c', '1', host],
                              capture_output=True, text=True, timeout=5)

        success = result.returncode == 0
        return jsonify({
            "success": success,
            "host": host,
            "message": "Ping erfolgreich" if success else "Ping fehlgeschlagen",
            "output": result.stdout[:200]
        })

    except subprocess.TimeoutExpired:
        return jsonify({"error": "Ping Zeitüberschreitung"}), 500
    except Exception as e:
        return jsonify({"error": f"Ping-Fehler: {str(e)}"}), 500

# =============================================================================
# FAQ API (Ersetzt komplexe FAQ-Verwaltung)
# =============================================================================

@app.route('/api/faq', methods=['GET'])
def get_faq():
    """FAQ-Einträge laden"""
    return jsonify(load_json('faq'))

@app.route('/api/faq', methods=['POST'])
def add_faq():
    """FAQ-Eintrag hinzufügen"""
    data = request.get_json()
    faq = load_json('faq')

    new_id = max([item.get('id', 0) for item in faq], default=0) + 1
    data.update({
        'id': new_id,
        'created': get_timestamp_iso()
    })

    faq.append(data)
    save_json('faq', faq)

    return jsonify({"success": True, "faq_item": data}), 201

# =============================================================================
# WORKSPACES API (Ersetzt komplexe Workspace-Verwaltung)
# =============================================================================

@app.route('/api/workspaces', methods=['GET'])
def get_workspaces():
    """Alle Workspaces mit ihren zugeordneten Tools abrufen"""
    try:
        print("DEBUG: get_workspaces called")
        tools = load_json('tools')
        working_sets = load_json('working_sets')
        print(f"DEBUG: Loaded {len(tools)} tools")
        
        # Filtere nur Workspaces
        workspaces = [tool for tool in tools if tool.get('type') == 'workspace']
        print(f"DEBUG: Found {len(workspaces)} workspaces")
        
        # Füge zugeordnete Tools zu jedem Workspace hinzu
        for workspace in workspaces:
            workspace_id = workspace.get('id')
            # Finde das entsprechende Working Set
            working_set = next((ws for ws in working_sets if ws.get('workspace_id') == workspace_id), None)
            if working_set and 'tools' in working_set:
                # Lade die vollständigen Tool-Informationen
                tool_ids = working_set['tools']
                workspace_tools = []
                for tool_id in tool_ids:
                    tool = next((t for t in tools if t.get('id') == tool_id), None)
                    if tool:
                        workspace_tools.append(tool)
                workspace['tools'] = workspace_tools
            else:
                workspace['tools'] = []
        
        print(f"DEBUG: Returning {len(workspaces)} workspaces")
        return jsonify(workspaces)
    except Exception as e:
        print(f"Fehler in get_workspaces: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/workspaces', methods=['POST'])
def create_workspace():
    """Workspace erstellen"""
    data = request.get_json()
    workspaces = load_json('workspaces')

    new_id = max([ws.get('id', 0) for ws in workspaces], default=0) + 1
    data.update({
        'id': new_id,
        'created': get_timestamp_iso()
    })

    workspaces.append(data)
    save_json('workspaces', workspaces)

    return jsonify({"success": True, "workspace": data}), 201


# =============================================================================
# WORKSETS API (Für Tool-Gruppierungen)
# =============================================================================

@app.route('/api/worksets', methods=['GET'])
def get_worksets():
    """Alle Worksets mit ihren zugeordneten Tools abrufen"""
    try:
        print("DEBUG: get_worksets called")
        tools = load_json('tools')
        worksets = load_json('worksets')
        print(f"DEBUG: Loaded {len(tools)} tools and {len(worksets)} worksets")
        
        # Füge zugeordnete Tools zu jedem Workset hinzu
        for workset in worksets:
            if 'tools' in workset and workset['tools']:
                # Lade die vollständigen Tool-Informationen
                tool_ids = workset['tools']
                workset_tools = []
                for tool_id in tool_ids:
                    tool = next((t for t in tools if t.get('id') == tool_id), None)
                    if tool:
                        workset_tools.append(tool)
                workset['tools'] = workset_tools
            else:
                workset['tools'] = []
        
        print(f"DEBUG: Returning {len(worksets)} worksets")
        return jsonify(worksets)
    except Exception as e:
        print(f"Fehler in get_worksets: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/worksets', methods=['POST'])
def create_workset():
    """Workset erstellen"""
    data = request.get_json()
    worksets = load_json('worksets')

    new_id = max([ws.get('id', 0) for ws in worksets], default=0) + 1
    data.update({
        'id': new_id,
        'created': get_timestamp_iso(),
        'tools': data.get('tools', [])  # Liste der zugewiesenen Tool-IDs
    })

    worksets.append(data)
    save_json('worksets', worksets)

    return jsonify({"success": True, "workset": data}), 201

@app.route('/api/worksets/<int:workset_id>/tools', methods=['POST'])
def add_tool_to_workset(workset_id: int):
    """Tool zu Workset hinzufügen"""
    data = request.get_json()
    tool_id = data.get('tool_id')
    
    if not tool_id:
        return jsonify({"error": "tool_id erforderlich"}), 400
    
    worksets = load_json('worksets')
    workset = next((ws for ws in worksets if ws.get('id') == workset_id), None)
    
    if not workset:
        return jsonify({"error": "Workset nicht gefunden"}), 404
    
    if 'tools' not in workset:
        workset['tools'] = []
    
    if tool_id not in workset['tools']:
        workset['tools'].append(tool_id)
        save_json('worksets', worksets)
    
    return jsonify({"success": True, "workset": workset})

@app.route('/api/worksets/<int:workset_id>/tools/<int:tool_id>', methods=['DELETE'])
def remove_tool_from_workset(workset_id: int, tool_id: int):
    """Tool aus Workset entfernen"""
    worksets = load_json('worksets')
    workset = next((ws for ws in worksets if ws.get('id') == workset_id), None)
    
    if not workset:
        return jsonify({"error": "Workset nicht gefunden"}), 404
    
    if 'tools' in workset and tool_id in workset['tools']:
        workset['tools'].remove(tool_id)
        save_json('worksets', worksets)
    
    return jsonify({"success": True, "workset": workset})


@app.route('/api/drucker', methods=['GET'])
def get_printers_legacy():
    """Liefert Drucker-Daten für das Frontend."""
    return jsonify(load_json('drucker'))


@app.route('/api/printers', methods=['GET'])
def get_printers():
    return jsonify(load_json('printers'))


@app.route('/api/netzwerk', methods=['GET'])
def get_netzwerk():
    return jsonify(load_json('netzwerk'))

# =============================================================================
# SYSTEM INFO API (Ersetzt komplexe System-Checks)
# =============================================================================

@app.route('/api/system/info', methods=['GET'])
def get_system_info():
    """System-Informationen (Docker-optimiert)"""
    return jsonify({
        "version": "1.0.0-docker",
        "environment": "Docker Container",
        "data_dir": DATA_DIR,
        "base_dir": BASE_DIR,
        "uptime": get_timestamp_iso(),
        "features": {
            "tools": True,
            "tickets": True,
            "contacts": True,
            "network": True,
            "faq": True,
            "workspaces": True
        }
    })

# =============================================================================
# ERROR HANDLERS
# =============================================================================

@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Endpunkt nicht gefunden"}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "Interner Server-Fehler"}), 500

# =============================================================================

@app.route('/api/worksets/<int:workset_id>/tools', methods=['GET'])
def api_get_workset_tools(workset_id):
    """Tools eines bestimmten Worksets abrufen"""
    try:
        tools = load_json('tools')
        working_sets = load_json('working_sets')
        
        # Finde das Working Set
        working_set = next((ws for ws in working_sets if ws.get('workspace_id') == workset_id), None)
        if not working_set:
            return jsonify([])
        
        # Lade die vollständigen Tool-Informationen
        tool_ids = working_set.get('tools', [])
        workset_tools = []
        for tool_id in tool_ids:
            tool = next((t for t in tools if t.get('id') == tool_id), None)
            if tool:
                workset_tools.append(tool)
        
        return jsonify(workset_tools)
    except Exception as e:
        print(f"Fehler in api_get_workset_tools: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/worksets/<int:workset_id>/tools', methods=['POST'])
def api_add_tool_to_workset(workset_id):
    """Tool zu einem Workset hinzufügen"""
    try:
        data = request.get_json()
        tool_id = data.get('tool_id')
        
        if not tool_id:
            return jsonify({"error": "Tool-ID erforderlich"}), 400
        
        # Überprüfe ob Tool existiert
        tools = load_json('tools')
        tool = next((t for t in tools if t.get('id') == tool_id), None)
        if not tool:
            return jsonify({"error": "Tool nicht gefunden"}), 404
        
        # Überprüfe ob Workspace existiert
        workspace = next((t for t in tools if t.get('id') == workset_id and t.get('type') == 'workspace'), None)
        if not workspace:
            return jsonify({"error": "Workspace nicht gefunden"}), 404
        
        # Lade Working Sets
        working_sets = load_json('working_sets')
        
        # Finde oder erstelle Working Set für diesen Workspace
        working_set = next((ws for ws in working_sets if ws.get('workspace_id') == workset_id), None)
        if not working_set:
            working_set = {
                'workspace_id': workset_id,
                'tools': []
            }
            working_sets.append(working_set)
        
        # Füge Tool hinzu, falls noch nicht vorhanden
        if tool_id not in working_set['tools']:
            working_set['tools'].append(tool_id)
            save_json('working_sets', working_sets)
            return jsonify({"success": True, "message": "Tool erfolgreich hinzugefügt"})
        else:
            return jsonify({"error": "Tool bereits im Workset vorhanden"}), 400
        
    except Exception as e:
        print(f"Fehler in api_add_tool_to_workset: {e}")
        return jsonify({"error": str(e)}), 500

# Doppelter DELETE Endpoint entfernt - wird vom ersten remove_tool_from_workset behandelt

# MAIN APPLICATION
# =============================================================================

if __name__ == '__main__':
    print("=" * 60)
    print("🛠️  HelpTool Backend - Docker-optimierte Version")
    print("=" * 60)
    print(f"📁 Basis-Verzeichnis: {BASE_DIR}")
    print(f"📊 Daten-Verzeichnis: {DATA_DIR}")
    print(f"🌐 Statische Dateien: {STATIC_DIR}")
    print("🚀 Server startet auf http://0.0.0.0:5411")
    print("=" * 60)

    # Entwicklung: debug=True, Produktion: debug=False
    app.run(
        host='0.0.0.0',
        port=5411,
        debug=False,  # Für Docker-Produktion
        threaded=True
    )