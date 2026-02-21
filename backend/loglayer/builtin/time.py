
import re
from datetime import datetime
from loglayer.ui import StrInput
from loglayer.core import DataProcessingLayer

class TimeLayer(DataProcessingLayer):
    """时间范围图层：按时间戳筛选日志"""
    display_name = "时间范围"
    description = "按时间戳筛选日志"
    icon = "time"
    
    inputs = [
        StrInput("pattern", "时间正则", value=r"^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})", info="需包含一个捕获组"),
        StrInput("format", "时间格式", value="%Y-%m-%d %H:%M:%S", info="Python strptime 格式"),
        StrInput("start", "开始时间", value="2026-01-01 00:00:00"),
        StrInput("end", "结束时间", value="2026-01-01 23:59:59"),
    ]

    def __init__(self, config=None):
        super().__init__(config)
        self.pattern_re = None
        self.start_dt = None
        self.end_dt = None
        
        try:
            if self.pattern:
                self.pattern_re = re.compile(self.pattern)
            
            if self.start:
                self.start_dt = datetime.strptime(self.start, self.format)
            if self.end:
                self.end_dt = datetime.strptime(self.end, self.format)
        except Exception as e:
            pass

    def filter_line(self, content: str, index: int = -1) -> bool:
        if not self.pattern_re: return True
        if not self.start_dt and not self.end_dt: return True
        
        match = self.pattern_re.search(content)
        if not match: 
            return False 
        
        try:
            ts_str = match.group(1)
            ts = datetime.strptime(ts_str, self.format)
            
            if self.start_dt and ts < self.start_dt: return False
            if self.end_dt and ts > self.end_dt: return False
            
            return True
        except:
            return False
