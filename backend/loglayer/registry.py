
import os
import importlib.util
import inspect
from loglayer.core import BaseLayer

class LayerRegistry:
    """
    图层注册表。
    管理所有内置图层和动态加载的插件图层。
    """
    def __init__(self, plugin_dir=None):
        self.builtin_layers = {} # type_id -> class，内置图层
        self.plugin_layers = {}  # type_id -> class，外部插件图层
        self.plugin_dir = plugin_dir
        
        # 加载内置图层
        # 这些图层经过优化，性能最佳且核心功能完备
        from loglayer.builtin.filter import FilterLayer
        from loglayer.builtin.level import LevelLayer
        from loglayer.builtin.highlight import HighlightLayer
        from loglayer.builtin.replace import ReplaceLayer
        from loglayer.builtin.range import RangeLayer
        from loglayer.builtin.time import TimeLayer
        
        self.register_builtin("FILTER", FilterLayer)
        self.register_builtin("LEVEL", LevelLayer)
        self.register_builtin("HIGHLIGHT", HighlightLayer)
        self.register_builtin("TRANSFORM", ReplaceLayer)
        self.register_builtin("RANGE", RangeLayer)
        self.register_builtin("TIME_RANGE", TimeLayer)

    def register_builtin(self, type_id, cls):
        """注册内置图层"""
        self.builtin_layers[type_id] = cls

    def discover_plugins(self):
        """
        扫描 plugin_dir 目录下的 Python 文件，尝试发现并加载插件图层。
        只要是 BaseLayer 的子类且文件名不以 _ 开头，就会被自动识别。
        """
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
                    
                    # 查找该模块中定义的 BaseLayer 子类
                    for attr_name in dir(module):
                        attr = getattr(module, attr_name)
                        if inspect.isclass(attr) and issubclass(attr, BaseLayer) and attr is not BaseLayer:
                            plugin_type = f"PYTHON_{name}_{attr_name}".upper()
                            self.plugin_layers[plugin_type] = attr
                            print(f"[Registry] Found plugin: {plugin_type}")
                except Exception as e:
                    print(f"[Registry] Error loading plugin {filename}: {e}")

    def get_all_types(self):
        """返回所有可用图层类型的详细描述（供前端动态生成 UI 使用）"""
        results = []
        # 内置
        for tid, cls in self.builtin_layers.items():
            results.append({
                "type": tid,
                "display_name": cls.display_name,
                "description": cls.description,
                "icon": getattr(cls, "icon", "default"),
                "ui_schema": cls.get_ui_schema(),
                "is_builtin": True
            })
        # 插件
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
        """根据类型 ID 和配置参数创建一个图层实例"""
        cls = self.builtin_layers.get(type_id) or self.plugin_layers.get(type_id)
        if not cls: return None
        return cls(config)
