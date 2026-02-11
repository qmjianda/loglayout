import os
import shutil
import subprocess
import sys
import argparse
import platform
from pathlib import Path

def check_dependencies():
    """验证打包所需的 Python 依赖是否安装"""
    required = ["fastapi", "uvicorn", "websockets", "webview", "psutil"]
    missing = []
    for mod in required:
        try:
            __import__(mod)
        except ImportError:
            missing.append(mod)
    
    if missing:
        print(f"[ERROR] 缺少必要依赖: {', '.join(missing)}")
        print("请运行: pip install " + " ".join(missing))
        sys.exit(1)

def package_app():
    parser = argparse.ArgumentParser(description='Package LogLayer for offline use')
    parser.add_argument('--exe', action='store_true', help='Bundle backend into a standalone executable using PyInstaller')
    args = parser.parse_args()

    check_dependencies()

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
            ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "venv", ".env", ".git")
        )
        # Copy README.md to dist_dir
        if (root_dir / "README.md").exists():
            shutil.copy2(root_dir / "README.md", dist_dir / "README.md")
            print("Copied README.md")
        # Copy requirements.txt to dist_dir
        if (root_dir / "requirements.txt").exists():
            shutil.copy2(root_dir / "requirements.txt", dist_dir / "requirements.txt")
            print("Copied requirements.txt")
    except Exception as e:
        print(f"Failed to copy backend/README: {e}")
        sys.exit(1)

    print("[3.5/4] Copying and Filtering Binary Dependencies...")
    bin_dir = root_dir / "bin"
    target_bin = app_dir / "bin"
    if bin_dir.exists():
        # Only copy the current platform's binaries to the 'bin' folder for the offline app
        current_platform = "windows" if platform.system() == "Windows" else "linux"
        target_bin.mkdir(parents=True, exist_ok=True)
        
        source_platform_bin = bin_dir / current_platform
        if source_platform_bin.exists():
            print(f"Bundling {current_platform} binaries...")
            shutil.copytree(source_platform_bin, target_bin / current_platform, dirs_exist_ok=True)
        else:
            # Fallback for old structure if platform folder doesn't exist
            shutil.copytree(bin_dir, target_bin, ignore=shutil.ignore_patterns("ripgrep-*", "*.zip", "*.tar.gz"), dirs_exist_ok=True)
    else:
        print("Warning: bin directory not found! Global search features will fail.")

    print("[4/4] Copying Frontend Build...")
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
            subprocess.check_call("pyinstaller --version", shell=True)
            add_data_sep = ";" if sys.platform == "win32" else ":"
            
            # Note: We include plugins directory explicitly for UI widgets discovery
            pyinst_cmd = [
                "pyinstaller",
                "--noconfirm",
                "--onedir",
                "--windowed",
                f"--add-data=dist{add_data_sep}www", 
                f"--add-data=backend/plugins{add_data_sep}plugins", # Include plugins
                f"--add-data=dist_offline/app/bin{add_data_sep}bin", 
                "--paths=backend",
                "--name=LogLayer",
                "--clean",
                "--exclude-module=PyQt6",
                "--exclude-module=PyQt5",
                "--exclude-module=matplotlib",
                "--exclude-module=tkinter",
                "backend/main.py"
            ]
            
            print(f"Running: {' '.join(pyinst_cmd)}")
            subprocess.check_call(" ".join(pyinst_cmd), shell=True, cwd=root_dir)
            
            frozen_dist = root_dir / "dist" / "LogLayer"
            frozen_target = dist_dir / "LogLayer_Standalone"
            if frozen_target.exists():
                shutil.rmtree(frozen_target)
            
            print(f"Moving frozen output to {frozen_target}...")
            shutil.move(str(frozen_dist), str(frozen_target))
            
        except Exception as e:
            print(f"PyInstaller build failed: {e}")

    # Create Run Script
    print("\nCreating Launchers...")
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
    pause
    exit /b 1
)
start "LogLayer" /B pythonw app\\main.py %*
"""
    with open(dist_dir / "LogLayer.bat", "w", encoding="utf-8") as f:
        f.write(bat_content)

    sh_content = """#!/bin/bash
cd "$(dirname "$0")"
# Fix permissions for ripgrep
find app/bin -name "rg" -exec chmod +x {} \\; 2>/dev/null
if [ -f "LogLayer_Standalone/LogLayer" ]; then
    chmod +x LogLayer_Standalone/LogLayer 2>/dev/null
    find LogLayer_Standalone/bin -name "rg" -exec chmod +x {} \\; 2>/dev/null
    ./LogLayer_Standalone/LogLayer "$@"
    exit 0
fi
python3 app/main.py "$@"
"""
    sh_path = dist_dir / "LogLayer.sh"
    with open(sh_path, "w", encoding="utf-8", newline='\n') as f:
        f.write(sh_content)
    os.chmod(sh_path, os.stat(sh_path).st_mode | 0o111)

    print("\n" + "="*40)
    print(f"Done! Offline package created at:\n{dist_dir.absolute()}")
    print("="*40)

if __name__ == "__main__":
    package_app()