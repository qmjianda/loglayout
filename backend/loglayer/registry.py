
import os
import importlib.util
import inspect
from loglayer.core import BaseLayer

class LayerRegistry:
    def __init__(self, plugin_dir=None):
        self.builtin_layers = {} # type_id -> class
        self.plugin_layers = {}  # type_id -> class
        self.plugin_dir = plugin_dir
        
        # Load built-ins manually to ensure they are always there
        from loglayer.builtin.filter import FilterLayer
        from loglayer.builtin.level import LevelLayer
        from loglayer.builtin.highlight import HighlightLayer
        from loglayer.builtin.replace import ReplaceLayer
        from loglayer.builtin.range import RangeLayer
        
        self.register_builtin("FILTER", FilterLayer)
        self.register_builtin("LEVEL", LevelLayer)
        self.register_builtin("HIGHLIGHT", HighlightLayer)
        self.register_builtin("TRANSFORM", ReplaceLayer)
        self.register_builtin("RANGE", RangeLayer)

    def register_builtin(self, type_id, cls):
        self.builtin_layers[type_id] = cls

    def discover_plugins(self):
        if not self.plugin_dir or not os.path.exists(self.plugin_dir):
            return
        
        self.plugin_layers.clear()
        for filename in os.listdir(self.plugin_dir):
            if filename.endswith(".py") and not filename.startswith("_"):
                path = os.path.join(self.plugin_dir, filename)
                name = filename[:-3]
                try:
                    spec = importlib.util.spec_from_file_location(name, path)
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)
                    
                    # Look for subclasses of BaseLayer
                    for attr_name in dir(module):
                        attr = getattr(module, attr_name)
                        if inspect.isclass(attr) and issubclass(attr, BaseLayer) and attr is not BaseLayer:
                            plugin_type = f"PYTHON_{name}_{attr_name}".upper()
                            self.plugin_layers[plugin_type] = attr
                            print(f"[Registry] Found plugin: {plugin_type}")
                except Exception as e:
                    print(f"[Registry] Error loading plugin {filename}: {e}")

    def get_all_types(self):
        results = []
        # Built-ins
        for tid, cls in self.builtin_layers.items():
            results.append({
                "type": tid,
                "display_name": cls.display_name,
                "description": cls.description,
                "icon": getattr(cls, "icon", "default"),
                "ui_schema": cls.get_ui_schema(),
                "is_builtin": True
            })
        # Plugins
        for tid, cls in self.plugin_layers.items():
            results.append({
                "type": tid,
                "display_name": cls.display_name,
                "description": cls.description,
                "icon": getattr(cls, "icon", "default"),
                "ui_schema": cls.get_ui_schema(),
                "is_builtin": False
            })
        return results

    def create_layer_instance(self, type_id, config):
        cls = self.builtin_layers.get(type_id) or self.plugin_layers.get(type_id)
        if not cls: return None
        return cls(config)
