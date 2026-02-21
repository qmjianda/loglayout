
from loglayer.ui import MultiSelectInput
from loglayer.core import NativeProcessingLayer

class LevelLayer(NativeProcessingLayer):
    """等级图层：按日志等级进行过滤"""
    display_name = "等级图层"
    description = "按日志等级进行过滤"
    icon = "level"
    
    inputs = [
        MultiSelectInput("levels", "选择等级", options=["INFO", "WARN", "ERROR", "DEBUG", "FATAL"], value=["INFO", "WARN", "ERROR", "DEBUG", "FATAL"])
    ]

    def get_rg_args(self) -> list:
        if not self.levels: return ["-v", ".*"]  # Hide all if none selected
        # Combine levels into an OR regex
        pattern = "|".join(self.levels)
        return ["-i", "-e", pattern]
