
import re
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
    
    def __init__(self, config=None):
        super().__init__(config)
        self.pattern_re = None
        
        # Compile Regex
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
            print(f"HighlightLayer Regex Error: {e}")

    def highlight_line(self, content: str):
        if not self.pattern_re:
            return []
            
        highlights = []
        try:
            for m in self.pattern_re.finditer(content):
                highlights.append({
                    "start": m.start(),
                    "end": m.end(),
                    "color": self.color,
                    "opacity": self.opacity
                })
        except Exception:
            pass
            
        return highlights
