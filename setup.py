"""
Verbessertes HelpTool Setup - Installiert Flask direkt
"""
import os
import sys
import subprocess
import shutil

def setup():
    """Installiert Flask direkt"""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    lib_dir = os.path.join(base_dir, "lib")
    
    print("=== HelpTool verbessertes Setup ===")
    print(f"Basis-Verzeichnis: {base_dir}")
    
    # Verzeichnisse vorbereiten
    if os.path.exists(lib_dir):
        print("Entferne altes lib-Verzeichnis...")
        shutil.rmtree(lib_dir)
    
    os.makedirs(lib_dir, exist_ok=True)
    
    # Verbesserter lib-Pfad in PYTHONPATH
    os.environ["PYTHONPATH"] = lib_dir
    
    # Installation direkt mit pip
    print("Installiere Flask und Abhängigkeiten...")
    try:
        subprocess.check_call([
            sys.executable, '-m', 'pip', 'install',
            '--target', lib_dir,
            'flask==2.0.1'
        ])
        print("✓ Flask erfolgreich installiert")
        
        # Verbesserte Batch-Datei mit zusätzlichem PYTHONPATH
        batch_path = os.path.join(base_dir, "start_fixed.bat")
        with open(batch_path, 'w') as f:
            f.write('@echo off\n')
            f.write('cd /d "%~dp0"\n')
            f.write('echo Starte HelpTool...\n')
            f.write('set PYTHONPATH=%~dp0lib\n')
            f.write(f'start "" "http://localhost:5411"\n')
            f.write(f'"{sys.executable}" "{os.path.join(base_dir, "backend", "backend.py")}"\n')
            f.write('if %ERRORLEVEL% neq 0 pause\n')
        
        print(f"✓ Startdatei erstellt: {batch_path}")
        print("Setup abgeschlossen. Bitte starten Sie die Anwendung mit start_fixed.bat")
        
        # Teste, ob Flask nun importierbar ist
        sys.path.insert(0, lib_dir)
        try:
            import flask
            print(f"✓ Test-Import von Flask erfolgreich (Version {flask.__version__})")
        except ImportError as e:
            print(f"✗ Flask konnte trotz Installation nicht importiert werden: {e}")
            return False
        
        return True
    
    except subprocess.CalledProcessError as e:
        print(f"✗ Fehler bei der Installation: {e}")
        return False

if __name__ == "__main__":
    setup()