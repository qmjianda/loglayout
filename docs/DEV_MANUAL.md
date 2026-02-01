
# LogLayer 开发手册 (Developer Manual)

本手册旨在指导开发者（特别是熟悉 Python 的开发者）如何理解和修改 LogLayer 项目。

## 1. 环境搭建 (Setup)

### 依赖
*   **Python**: 3.8+
*   **Node.js**: 16+ (用于构建前端，如果你只修改 Python 逻辑，只需安装一次即可)

### 安装步骤
1.  **安装 Python 依赖**:
    ```bash
    pip install PyQt6 PyQt6-WebEngine
    ```
    *(注意：项目根目录可能有 `requirements.txt`，请查看)*

2.  **安装前端依赖** (首次运行需要):
    ```bash
    cd frontend
    npm install
    ```

## 2. 运行项目 (Running)

为了极致的开发体验，建议同时开启两个终端：

**终端 1 (前端热更新)**:
```bash
# 在项目根目录
npm run dev
# 这会启动 Vite 服务器 (http://localhost:3000)，支持前端代码热修改。
```

**终端 2 (后端主程序)**:
```bash
# 在项目根目录
python backend/main.py
# 启动桌面应用窗口。
```

## 3. 如何修改代码？

### 3.1 修改 Python 后端逻辑
*   **代码位置**: `backend/` 目录。
*   **生效方式**: 修改后通常需要**重启 `main.py`** 才能生效。

### 3.2 添加一个新的图层 (Layer)
这是最常见的扩展方式。

1.  **创建文件**: 在 `backend/loglayer/builtin/` 下新建一个 `.py` 文件 (例如 `my_layer.py`)。
2.  **继承基类**:
    ```python
    from loglayer.core import BaseLayer, LayerStage
    from loglayer.ui import TextInput

    class MyLayer(BaseLayer):
        stage = LayerStage.LOGIC  # 运行阶段
        display_name = "我的自定义图层"
        
        # 定义前端显示的配置项
        inputs = [
            TextInput("prefix", "前缀内容")
        ]

        def filter_line(self, line, index):
            # 返回 True 保留行，False 丢弃行
            return self.prefix in line
    ```
3.  **注册图层**: 打开 `backend/loglayer/registry.py`，导入并注册你的类。
    ```python
    from loglayer.builtin.my_layer import MyLayer
    # ...
    self.register_builtin("MY_LAYER", MyLayer)
    ```
4.  **重启应用**: 新图层将出现在"添加图层"菜单中。

## 4. 关键文件导读 (Key Files)

*   `backend/bridge.py`: **必须读懂**。这是 Python 和 JS 对话的地方。
    *   `sync_layers`: 接收前端传来的图层配置列表。
    *   `read_processed_lines`: 前端请求读取日志行时调用此函数。
*   `backend/loglayer/core.py`: 图层的基类定义。
    *   `inputs`: 定义了配置项如何映射到前端 UI。
    *   `config`: 字典，存储用户在 UI 上填写的实际值。

## 5. 调试技巧 (Debugging)

*   **Python print()**: 所有 `print()` 输出都会显示在运行 `main.py` 的终端中。
*   **前端 Console**: 在应用窗口按 `F12` 或右键 -> Inspect，可以打开 Chrome 开发者工具，查看前端日志。

## 6. 常见问题
*   **Q: 修改了 Python 代码没生效？**
    *   A: 请重启 `python backend/main.py`。
*   **Q: 前端显示 "Connection lost"？**
    *   A: 可能是 Python 后端崩溃了，检查终端报错信息。
