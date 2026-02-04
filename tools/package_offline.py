import os
import shutil
import subprocess
import sys
import argparse
from pathlib import Path

def package_app():
    parser = argparse.ArgumentParser(description='Package LogLayer for offline use')
    parser.add_argument('--exe', action='store_true', help='Bundle backend into a standalone executable using PyInstaller')
    args = parser.parse_args()

    root_dir = Path(__file__).parent.parent
    dist_dir = root_dir / "dist_offline"
    frontend_dir = root_dir / "frontend"
    backend_dir = root_dir / "backend"
    
    print(f"[1/4] Building Frontend (cwd={root_dir})...")
    try:
        # Check if node_modules exists in ROOT
        if not (root_dir / "node_modules").exists():
            print("Installing dependencies...")
            subprocess.check_call("npm install", shell=True, cwd=root_dir)
            
        subprocess.check_call("npm run build", shell=True, cwd=root_dir)
    except subprocess.CalledProcessError as e:
        print("Frontend build failed!")
        sys.exit(1)

    print(f"[2/4] Cleaning dist directory: {dist_dir}...")
    if dist_dir.exists():
        shutil.rmtree(dist_dir)
    dist_dir.mkdir(parents=True)

    print("[3/4] Copying Backend and Assets...")
    # Create app directory
    app_dir = dist_dir / "app"
    try:
        shutil.copytree(
            backend_dir, 
            app_dir, 
            ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "venv", ".env")
        )
        # Copy README.md to dist_dir
        if (root_dir / "README.md").exists():
            shutil.copy2(root_dir / "README.md", dist_dir / "README.md")
            print("Copied README.md")
    except Exception as e:
        print(f"Failed to copy backend/README: {e}")
        sys.exit(1)

    print("[3.5/4] Copying Binary Dependencies (rg.exe)...")
    bin_dir = root_dir / "bin"
    target_bin = app_dir / "bin"
    if bin_dir.exists():
        shutil.copytree(
            bin_dir, 
            target_bin,
            ignore=shutil.ignore_patterns("ripgrep-*") # Exclude source folders and archives
        )
    else:
        print("Warning: bin directory not found! Global search features will fail.")

    print("[4/4] Copying Frontend Build...")
    # Vite build goes to projects root in updated config
    frontend_dist = root_dir / "dist"

    target_www = app_dir / "www"
    
    if not frontend_dist.exists():
        print(f"Error: Frontend dist folder not found at {frontend_dist}!")
        sys.exit(1)
        
    shutil.copytree(frontend_dist, target_www)

    # PyInstaller Step
    if args.exe:
        print("\n" + "-"*20)
        print("[EXTRA] Bundling with PyInstaller...")
        print("-"*20)
        
        try:
            # Check if pyinstaller is installed
            subprocess.check_call("pyinstaller --version", shell=True)
            add_data_sep = ";" if sys.platform == "win32" else ":"
            
            # Using browser-based architecture, no Qt binding detections needed
            print(f"Bundling FastAPI + pywebview stack...")
            
            # Use root_dir for data paths since we are running from there
            pyinst_cmd = [
                "pyinstaller",
                "--noconfirm",
                "--onedir",
                "--windowed",
                f"--add-data=dist{add_data_sep}www", # Bundle the built static files
                f"--add-data=dist_offline/app/bin{add_data_sep}bin",   # Bundle filtered ripgrep
                "--paths=backend",
                "--name=LogLayer",
                "--clean" # Clean cache for a fresh build
            ]

            # Since we removed Qt, we can explicitly exclude those large modules to reduce size
            excluded_modules = ["PyQt6", "PySide6", "PyQt5", "PySide2", "matplotlib", "PIL", "tkinter"]
            for mod in excluded_modules:
                pyinst_cmd.append(f"--exclude-module={mod}")
            
            pyinst_cmd.append("backend/main.py")
            
            print(f"Running: {' '.join(pyinst_cmd)}")
            subprocess.check_call(" ".join(pyinst_cmd), shell=True, cwd=root_dir)
            
            # Move results to dist_offline
            frozen_dist = root_dir / "dist" / "LogLayer"
            frozen_target = dist_dir / "LogLayer_Standalone"
            if frozen_target.exists():
                shutil.rmtree(frozen_target)
            
            print(f"Moving frozen output to {frozen_target}...")
            shutil.move(str(frozen_dist), str(frozen_target))
            
        except Exception as e:
            print(f"PyInstaller build failed: {e}")
            print("Continuing with source-based bundle only.")

    # Create Run Script
    print("\nCreating Launcher (Windows)...")
    bat_content = """@echo off
setlocal
cd /d "%~dp0"

if exist LogLayer_Standalone\\LogLayer.exe (
    start "" LogLayer_Standalone\\LogLayer.exe %*
    exit /b
)

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found and standalone executable not found!
    echo Please install Python 3.10+ or run the standalone version if available.
    pause
    exit /b 1
)

:: Ensure dependencies are installed if running from source
:: We don't do this automatically to avoid startup lag, but here for reference
:: python -m pip install fastapi uvicorn websockets pywebview

start "LogLayer" /B pythonw app\\main.py %*
"""
    
    with open(dist_dir / "LogLayer.bat", "w", encoding="utf-8") as f:
        f.write(bat_content)

    print("Creating Launcher (Linux)...")
    sh_content = """#!/bin/bash
cd "$(dirname "$0")"

# Ensure ripgrep has execute permissions
if [ -f "app/bin/linux/rg" ]; then
    chmod +x app/bin/linux/rg 2>/dev/null
fi

if [ -f "LogLayer_Standalone/LogLayer" ]; then
    chmod +x LogLayer_Standalone/LogLayer 2>/dev/null
    if [ -f "LogLayer_Standalone/bin/linux/rg" ]; then
        chmod +x LogLayer_Standalone/bin/linux/rg 2>/dev/null
    fi
    ./LogLayer_Standalone/LogLayer "$@"
    exit 0
fi

if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python 3 not found and standalone executable not found!"
    exit 1
fi

# Start application
python3 app/main.py "$@"
"""
    
    sh_path = dist_dir / "LogLayer.sh"
    with open(sh_path, "w", encoding="utf-8", newline='\n') as f:
        f.write(sh_content)
    
    try:
        current_perms = os.stat(sh_path).st_mode
        os.chmod(sh_path, current_perms | 0o111)
    except:
        pass

    print("\n" + "="*40)
    print(f"Done! Offline package created at:\n{dist_dir.absolute()}")
    if args.exe:
        print(f"Standalone version: {dist_dir.absolute()}/LogLayer_Standalone")
    print("="*40)

if __name__ == "__main__":
    package_app()
