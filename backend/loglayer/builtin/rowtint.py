
import re
from loglayer.ui import SearchInput, ColorInput, RangeInput
from loglayer.core import RenderingLayer

class RowTintLayer(RenderingLayer):
    """
    行背景图层：为匹配行添加背景色。
    与 HighlightLayer 不同，这里着色的是整行背景而非匹配文字。
    """
    display_name = "行背景图层"
    description = "为匹配行添加背景色"
    icon = "rowtint"
    
    inputs = [
        SearchInput("query", "匹配模式"),
        ColorInput("color", "背景颜色", value="#ef4444"),
        RangeInput("opacity", "不透明度", value=20, min=5, max=50)
    ]
    
    def __init__(self, config=None):
        super().__init__(config)
        self.pattern_re = None
        
        try:
            if self.query:
                flags = 0
                if not getattr(self, "caseSensitive", False):
                    flags |= re.IGNORECASE
                
                pat = self.query
                if not getattr(self, "regex", False):
                    pat = re.escape(pat)
                    
                self.pattern_re = re.compile(pat, flags)
        except Exception as e:
            print(f"RowTintLayer Regex Error: {e}")

    def get_row_style(self, content: str) -> dict:
        """如果行匹配模式，返回背景色样式"""
        if not self.pattern_re:
            return {}
            
        try:
            if self.pattern_re.search(content):
                # Convert hex color to rgba with opacity
                hex_color = self.color.lstrip('#')
                r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
                alpha = self.opacity / 100
                return {
                    "backgroundColor": f"rgba({r}, {g}, {b}, {alpha})"
                }
        except Exception:
            pass
            
        return {}
