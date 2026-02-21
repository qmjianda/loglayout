import psutil
from loglayer.core import DataProcessingLayer, UIWidget
from loglayer.ui import SearchInput

class AnonymizerLayer(DataProcessingLayer):
    """
    脱敏图层示例。
    发现并替换敏感词（如 IP 地址）。
    """
    display_name = "Anonymizer"
    description = "Mask sensitive data (demonstrating Python logic layer)"
    icon = "transform"
    
    inputs = [
        SearchInput("pattern", "Pattern to Mask", value=r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}", regex=True)
    ]

    def process_line(self, content: str) -> str:
        import re
        # Example: Mask IPv4 addresses with [INTERNAL_IP]
        pattern = self.config.get("pattern", r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}")
        return re.sub(pattern, "[MASKED]", content)

class SystemStatsWidget(UIWidget):
    """
    系统状态挂件示例。
    在状态栏显示 CPU 和内存占用。
    """
    display_name = "System Stats"
    role = "statusbar"
    refresh_interval = 2.0
    
    def get_data(self) -> dict:
        cpu = psutil.cpu_percent()
        mem = psutil.virtual_memory().percent
        return {
            "text": f"CPU: {cpu}% | MEM: {mem}%",
            "color": "rgb(59, 130, 246)" if cpu < 70 else "rgb(239, 68, 68)",
            "tooltip": f"System resources usage\nCPU: {cpu}%\nMemory: {mem}%"
        }
