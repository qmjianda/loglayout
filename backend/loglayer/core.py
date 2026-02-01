
from .ui import Component

class LayerStage:
    NATIVE = "native" # Runs via ripgrep
    LOGIC = "logic"   # Runs via Python logic
    DECOR = "decor"   # Highlighting / Decoration

class BaseLayer(Component):
    stage = LayerStage.LOGIC
    icon = "default"
    
    def filter_line(self, content: str, index: int = -1) -> bool:
        return True

    def highlight_line(self, content: str):
        return []

    def process_line(self, content: str) -> str:
        """Transforms line content. Returns new content."""
        return content

    def reset(self):
        """Called before a new pipeline run starts."""
        pass

class NativeLayer(BaseLayer):
    stage = LayerStage.NATIVE
    
    def get_rg_args(self) -> list:
        """Returns ripgrep arguments for this layer."""
        return []

class PluginLayer(BaseLayer):
    stage = LayerStage.LOGIC
