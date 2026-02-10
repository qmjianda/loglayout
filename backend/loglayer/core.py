
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
from .ui import Component

@dataclass
class ProcessedLine:
    """处理后的行信息，包含内容和坐标映射"""
    content: str
    # 偏移量映射表 (可选): 用于处理高亮错位。
    # 格式: {new_pos: old_pos}
    offset_map: Optional[Dict[int, int]] = None

class LayerCategory:
    """图层分类：处理层 vs 渲染层"""
    FILTERING = "filtering"      # 过滤层: 决定可见性 (只读内容)
    TRANSFORM = "transform"      # 转换层: 修改内容 (如脱敏、替换)
    RENDERING = "rendering"      # 渲染层: 增加装饰 (如高亮、样式)
    # 兼容旧代码
    PROCESSING = "transform"

class LayerStage:
    """图层执行阶段"""
    NATIVE = "native"  # 使用 ripgrep 执行 (极速)
    LOGIC = "logic"    # 使用 Python 执行 (灵活)

# ============================================================
# 1. 过滤层 (Filtering Layer) - 仅决定可见性
# ============================================================

class FilterLayer(Component):
    """
    过滤图层基类。
    职责：决定一行日志是否应该被保留。
    """
    category = LayerCategory.FILTERING
    stage = LayerStage.LOGIC
    icon = "filter"

    def filter_line(self, content: str, index: int = -1) -> bool:
        """返回 True: 保留; 返回 False: 丢弃"""
        return True

    def reset(self):
        pass

class NativeFilterLayer(FilterLayer):
    """高性能原生过滤层 (ripgrep)"""
    stage = LayerStage.NATIVE

    def get_rg_args(self) -> list:
        return []

# ============================================================
# 2. 转换层 (Transformation Layer) - 修改内容
# ============================================================

class TransformLayer(Component):
    """
    转换图层基类。
    职责：修改日志内容 (脱敏、格式化等)。
    """
    category = LayerCategory.TRANSFORM
    icon = "replace"

    def process_line(self, content: str) -> ProcessedLine:
        """返回处理后的对象"""
        return ProcessedLine(content=content)

# ============================================================
# 3. 渲染层 (Rendering Layer) - 视觉装饰
# ============================================================

class RenderingLayer(Component):
    """
    渲染增强层基类。
    职责：不改变内容，仅提供装饰信息。
    """
    category = LayerCategory.RENDERING
    icon = "highlight"

    def highlight_line(self, content: str) -> list:
        """返回高亮区域列表"""
        return []

    def get_row_style(self, content: str) -> dict:
        """返回整行样式"""
        return {}

# ============================================================
# 向后兼容定义
# ============================================================

class DataProcessingLayer(FilterLayer, TransformLayer):
    """旧的处理层基类 (合并了过滤和转换)"""
    category = "processing"

    def process_line(self, content: str) -> Any:
        # 为了兼容旧代码，这里可能返回 str 或 ProcessedLine
        return content

class NativeProcessingLayer(DataProcessingLayer):
    stage = LayerStage.NATIVE
    def get_rg_args(self) -> list: return []

BaseLayer = DataProcessingLayer
NativeLayer = NativeProcessingLayer
PluginLayer = DataProcessingLayer

# ============================================================
# UI 挂件
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

