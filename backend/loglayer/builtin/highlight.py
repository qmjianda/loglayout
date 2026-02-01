
from loglayer.ui import SearchInput, ColorInput, RangeInput
from loglayer.core import BaseLayer, LayerStage

class HighlightLayer(BaseLayer):
    stage = LayerStage.DECOR
    display_name = "高亮图层"
    description = "对匹配文本进行着色"
    icon = "highlight"
    
    inputs = [
        SearchInput("query", "高亮模式"),
        ColorInput("color", "颜色", value="#3b82f6"),
        RangeInput("opacity", "不透明度", value=100)
    ]

    def highlight_line(self, content: str):
        # Implementation will be handled in decoration stage
        return []
