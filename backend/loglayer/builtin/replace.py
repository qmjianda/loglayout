
import re
from loglayer.ui import SearchInput, StrInput
from loglayer.core import PluginLayer
import html

class ReplaceLayer(PluginLayer):
    display_name = "替换图层"
    description = "使用正则表达式替换内容"
    icon = "transform"
    
    inputs = [
        SearchInput("find", "查找内容", info="支持正则表达式"),
        StrInput("replace", "替换为", info="支持 $1, $2 引用"),
    ]

    def process_line(self, content: str) -> str:
        if not self.find:
            return content
        
        try:
            # Check if regex is valid
            # In a real app we might want to compile this once per update, but component is re-created often
            # or we need to cache it. For now, recompiling is safer.
            # Using sub to replace
            return re.sub(self.find, self.replace or "", content)
        except Exception:
            return content
