
from loglayer.ui import SearchInput, BoolInput
from loglayer.core import NativeProcessingLayer

class FilterLayer(NativeProcessingLayer):
    """过滤图层：使用 ripgrep 进行高效文本过滤"""
    display_name = "过滤图层"
    description = "使用 ripgrep 进行高效文本过滤"
    icon = "filter"
    
    inputs = [
        SearchInput("query", "搜索模式", info="支持正则表达式"),
        BoolInput("invert", "排除模式", value=False)
    ]

    def get_rg_args(self) -> list:
        if not self.query: return []
        args = []
        if self.regex: args.append("-e")
        else: args.append("-F")
        
        if not self.caseSensitive: args.append("-i")
        if self.wholeWord: args.append("-w")
        if self.invert: args.insert(0, "-v")
        
        # 使用 -e 显式指定模式，防止 query 以 - 开头导致 rg 解析错误
        if "-e" not in args:
            args.append("-e")
        
        args.append(self.query)
        return args
