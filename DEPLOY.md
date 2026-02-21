# LogLayer 部署指南 (Deployment Guide)

本指南介绍如何在不同环境下部署和运行 LogLayer。

## 1. 软件打包 (Packaging)

使用项目提供的 `tools/package_offline.py` 脚本可以生成离线分发包。

### 运行打包脚本
```bash
# 生成基础离线包 (包含前端静态文件和后端源码)
python tools/package_offline.py

# 生成独立可执行文件 (Standalone EXE/ELF, 需安装 PyInstaller)
python tools/package_offline.py --exe
```

生成的包位于 `dist_offline/` 目录。

---

## 2. Windows 平台部署

### A. 使用独立可执行文件 (推荐)
1. 进入 `dist_offline/` 目录。
2. 运行 `LogLayer.bat`。它会自动检测并启动 `LogLayer_Standalone` 目录下的可执行程序。

### B. 从源码运行 (需 Python 环境)
1. 确保已安装 Python 3.10+。
2. 安装依赖：
   ```bash
   pip install -r requirements.txt
   ```
3. 运行 `python backend/main.py`。

---

## 3. Linux 平台部署

### A. 环境准备
确保系统已安装 `webkit2gtk` (用于 pywebview 渲染)：
- **Ubuntu/Debian**: `sudo apt install python3-gi python3-gi-cairo gir1.2-gtk-3.0 gir1.2-webkit2-4.0`
- **Fedora**: `sudo dnf install python3-gobject webkit2gtk3`

### B. 运行程序
1. 进入 `dist_offline/` 目录。
2. 赋予脚本执行权限：`chmod +x LogLayer.sh`
3. 运行 `./LogLayer.sh`。

---

## 4. 插件扩展 (Plugins)

LogLayer 自动加载 `app/plugins/` (源码模式) 或集成在可执行文件中的插件。
- 所有的 `.py` 插件文件应放置在 `backend/plugins/` 目录下。
- 打包脚本会自动将该目录包含在分发包中。

## 5. 常见问题 (FAQ)

- **全局搜索失效**：检查 `app/bin/` 目录下是否包含对应平台的 `rg` (ripgrep) 二进制文件。
- **界面无法打开**：确保没有防火墙拦截后端端口 (默认 12345/12346)。
- **依赖冲突**：建议在虚拟环境 (venv) 中进行打包操作。
