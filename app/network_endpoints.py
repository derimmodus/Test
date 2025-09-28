import os
import subprocess
from flask import request, jsonify

# These are network-related endpoint functions for the Flask application
# They should be imported and used in the main backend.py file

def register_network_endpoints(app):
    """Register all network-related endpoints with the Flask app"""
    
    @app.route('/api/network/open-path', methods=['POST'])
    def open_network_path():
        """Open a network path in the file explorer."""
        try:
            data = request.get_json()
            if not data or 'path' not in data:
                return jsonify({"error": "Kein Netzwerkpfad angegeben"}), 400
                
            path = data['path']
            
            # Open network path using the explorer
            # For Windows
            try:
                subprocess.Popen(['explorer', path])
                return jsonify({"success": True})
            except Exception as e:
                return jsonify({"error": f"Fehler beim Öffnen des Pfads: {str(e)}"}), 500
                
        except Exception as e:
            print(f"Error in open_network_path: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route('/api/network/open-dual-explorer', methods=['POST'])
    def open_dual_explorer_with_device():
        """Open Dual Explorer with a specific device."""
        try:
            data = request.get_json()
            if not data or 'deviceId' not in data:
                return jsonify({"error": "Keine Geräte-ID angegeben"}), 400
                
            device_id = data['deviceId']
            
            # Create network path from device ID
            network_path = f"\\\\{device_id.lower()}\\c$"
            
            # Open dual explorer with the device
            # This opens two explorer windows - one for local C: drive and one for the remote path
            try:
                # Open local C: drive
                subprocess.Popen(['explorer', 'C:'])
                # Open remote path
                subprocess.Popen(['explorer', network_path])
                return jsonify({"success": True})
            except Exception as e:
                return jsonify({"error": f"Fehler beim Öffnen des Dual-Explorers: {str(e)}"}), 500
                
        except Exception as e:
            print(f"Error in open_dual_explorer_with_device: {str(e)}")
            return jsonify({"error": str(e)}), 500
            
    @app.route('/api/network/open-tool', methods=['POST'])
    def open_network_tool():
        """Open various network tools."""
        try:
            data = request.get_json()
            if not data or 'tool' not in data:
                return jsonify({"error": "Kein Tool angegeben"}), 400
                
            tool = data['tool']
            
            if tool == 'network-explorer':
                # Open Windows Explorer
                subprocess.Popen(['explorer'])
                return jsonify({"success": True})
            elif tool == 'dual-explorer':
                # Open two Explorer windows (local and network)
                subprocess.Popen(['explorer', 'C:'])
                subprocess.Popen(['explorer', 'Network'])
                return jsonify({"success": True})
            else:
                return jsonify({"error": f"Unbekanntes Tool: {tool}"}), 400
                
        except Exception as e:
            print(f"Error in open_network_tool: {str(e)}")
            return jsonify({"error": str(e)}), 500

    # Return the functions to make them available for testing or direct import
    return {
        "open_network_path": open_network_path,
        "open_dual_explorer_with_device": open_dual_explorer_with_device,
        "open_network_tool": open_network_tool
    }
