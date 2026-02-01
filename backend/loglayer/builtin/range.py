
from loglayer.ui import IntInput
from loglayer.core import PluginLayer

class RangeLayer(PluginLayer):
    display_name = "范围图层"
    description = "显示指定行号范围内的内容"
    icon = "range"

    inputs = [
        IntInput("start", "开始行号", value=1, info="起始行（包含）"),
        IntInput("end", "结束行号", value=100, info="结束行（包含）"),
    ]

    def __init__(self, config=None):
        super().__init__(config)
        self.current_count = 0
        # Ensure values are integers/defaults
        try:
            self.start_line = int(self.config.get("start", 1))
        except:
            self.start_line = 1
            
        try:
            self.end_line = int(self.config.get("end", 100))
        except:
            self.end_line = 100

    def reset(self):
        self.current_count = 0

    def filter_line(self, content: str, index: int = -1) -> bool:
        # We ignore the physical 'index' and communicate based on 
        # how many lines have reached this layer so far.
        self.current_count += 1
        
        return self.start_line <= self.current_count <= self.end_line
