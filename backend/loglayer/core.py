
from .ui import Component

class LayerCategory:
    """图层分类：处理层 vs 渲染层"""
    PROCESSING = "processing"  # 数据处理层 (改变日志内容/可见性)
    RENDERING = "rendering"    # 渲染增强层 (仅改变显示效果)

class LayerStage:
    """图层执行阶段 (用于处理层内部细分)"""
    NATIVE = "native"  # 使用 ripgrep 执行 (极速)
    LOGIC = "logic"    # 使用 Python 执行 (灵活)

# ============================================================
# 数据处理层基类
# ============================================================

class DataProcessingLayer(Component):
    """
    数据处理层基类。
    这类图层会改变日志的可见性或内容。
    - 修改后需要重新运行 PipelineWorker。
    - 严格模式下，始终在渲染层之前执行。
    """
    category = LayerCategory.PROCESSING
    stage = LayerStage.LOGIC
    icon = "filter"
    
    def filter_line(self, content: str, index: int = -1) -> bool:
        """
        决定是否保留某行。
        返回 True: 保留; 返回 False: 丢弃
        """
        return True

    def process_line(self, content: str) -> str:
        """
        变换行内容 (例如替换文本、脱敏)。
        返回新的行内容。
        """
        return content

    def reset(self):
        """在新的流水线开始前被调用，用于重置内部状态 (例如计数器)。"""
        pass


class NativeProcessingLayer(DataProcessingLayer):
    """
    原生处理层基类。
    使用 ripgrep 参数进行高性能过滤。
    """
    stage = LayerStage.NATIVE
    
    def get_rg_args(self) -> list:
        """返回 ripgrep 的命令行参数列表。"""
        return []


# ============================================================
# 渲染增强层基类
# ============================================================

class RenderingLayer(Component):
    """
    渲染增强层基类。
    这类图层只改变显示效果，不影响日志内容或可见性。
    - 修改后只需刷新渲染缓存，无需重跑 PipelineWorker。
    - 严格模式下，始终在处理层之后执行。
    """
    category = LayerCategory.RENDERING
    icon = "highlight"
    
    def highlight_line(self, content: str) -> list:
        """
        返回该行的高亮区域列表。
        格式: [{"start": 0, "end": 5, "color": "#ff0000", "opacity": 100}]
        """
        return []

    def get_row_style(self, content: str) -> dict:
        """
        返回该行的样式配置。
        格式: {"backgroundColor": "#ff000020", "borderLeft": "3px solid #ff0000"}
        """
        return {}


# ============================================================
# UI 扩展基类 (UI Extensions)
# ============================================================

class UIWidget(Component):
    """
    UI 挂件基类。
    允许插件向主界面槽位（状态栏、侧边栏等）注入动态内容。
    """
    role = "statusbar"           # 位置: statusbar, sidebar, editor_toolbar
    refresh_interval = 5.0      # 自动刷新间隔 (秒)，0 表示不自动刷新
    
    def get_data(self) -> dict:
        """返回要在 UI 中渲染的数据"""
        return {}

# ============================================================
# 向后兼容别名 (将在后续版本移除)
# ============================================================

# 旧的 BaseLayer 现在指向 DataProcessingLayer
BaseLayer = DataProcessingLayer

# 旧的 NativeLayer 现在指向 NativeProcessingLayer
NativeLayer = NativeProcessingLayer

# 旧的 PluginLayer 现在指向 DataProcessingLayer
PluginLayer = DataProcessingLayer

