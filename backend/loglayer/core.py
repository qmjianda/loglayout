
from .ui import Component

class LayerStage:
    """定义图层运行的阶段"""
    NATIVE = "native" # 运行在 ripgrp 阶段 (速度极快，用于初筛)
    LOGIC = "logic"   # 运行在 Python 逻辑阶段 (灵活但处理能力有限)
    DECOR = "decor"   # 装饰阶段 (仅高亮，不修改内容)

class BaseLayer(Component):
    """
    所有内置图层和插件图层的基类。
    继承自 Component 以支持自动 UI 绑定。
    """
    stage = LayerStage.LOGIC
    icon = "default"  # 在前端 UI 显示的图标
    
    def filter_line(self, content: str, index: int = -1) -> bool:
        """
        决定是否保留某行。
        返回 True: 保留
        返回 False: 丢弃
        """
        return True

    def highlight_line(self, content: str):
        """
        返回该行的高亮区域列表。
        格式: [{"start": 0, "end": 5, "color": "#ff0000"}]
        """
        return []

    def process_line(self, content: str) -> str:
        """
        变换行内容 (例如替换文本、脱敏)。
        返回新的行内容。
        """
        return content

    def reset(self):
        """在新的流水线开始前被调用，用于重置内部状态 (例如计数器)。"""
        pass

class NativeLayer(BaseLayer):
    """
    原生图层基类。
    这类图层不直接处理字符串，而是生成 ripgrep 参数来利用底层的高性能搜索。
    """
    stage = LayerStage.NATIVE
    
    def get_rg_args(self) -> list:
        """返回 ripgrep 的命令行参数列表。"""
        return []

class PluginLayer(BaseLayer):
    """插件图层基类"""
    stage = LayerStage.LOGIC
