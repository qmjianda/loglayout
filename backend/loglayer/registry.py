
import os
import importlib.util
import inspect
from loglayer.core import DataProcessingLayer, RenderingLayer, LayerCategory

class LayerRegistry:
    """
    图层注册表。
    管理所有内置图层和动态加载的插件图层。
    支持按类别 (Processing/Rendering) 分组返回。
    """
    def __init__(self, plugin_dir=None):
        self.builtin_layers = {}  # type_id -> class
        self.plugin_layers = {}   # type_id -> class
        self.plugin_dir = plugin_dir
        
        # 加载内置图层 - 处理层
        from loglayer.builtin.filter import FilterLayer
        from loglayer.builtin.level import LevelLayer
        from loglayer.builtin.replace import ReplaceLayer
        from loglayer.builtin.range import RangeLayer
        from loglayer.builtin.time import TimeLayer
        
        # 加载内置图层 - 渲染层
        from loglayer.builtin.highlight import HighlightLayer
        from loglayer.builtin.rowtint import RowTintLayer
        from loglayer.builtin.bookmark import BookmarkLayer
        
        # 注册处理层
        self.register_builtin("FILTER", FilterLayer)
        self.register_builtin("LEVEL", LevelLayer)
        self.register_builtin("TRANSFORM", ReplaceLayer)
        self.register_builtin("RANGE", RangeLayer)
        self.register_builtin("TIME_RANGE", TimeLayer)
        
        # 注册渲染层
        self.register_builtin("HIGHLIGHT", HighlightLayer)
        self.register_builtin("ROWTINT", RowTintLayer)
        self.register_builtin("BOOKMARK", BookmarkLayer)

    def register_builtin(self, type_id, cls):
        """注册内置图层"""
        self.builtin_layers[type_id] = cls

    def discover_plugins(self):
        """
        扫描 plugin_dir 目录下的 Python 文件，尝试发现并加载插件图层。
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
                    
                    for attr_name in dir(module):
                        attr = getattr(module, attr_name)
                        # 检查是否为 DataProcessingLayer 或 RenderingLayer 的子类
                        if inspect.isclass(attr):
                            is_processing = issubclass(attr, DataProcessingLayer) and attr is not DataProcessingLayer
                            is_rendering = issubclass(attr, RenderingLayer) and attr is not RenderingLayer
                            if is_processing or is_rendering:
                                plugin_type = f"PYTHON_{name}_{attr_name}".upper()
                                self.plugin_layers[plugin_type] = attr
                                print(f"[Registry] Found plugin: {plugin_type}")
                except Exception as e:
                    print(f"[Registry] Error loading plugin {filename}: {e}")

    def _get_layer_info(self, tid, cls, is_builtin):
        """生成单个图层的元信息"""
        return {
            "type": tid,
            "display_name": cls.display_name,
            "description": cls.description,
            "icon": getattr(cls, "icon", "default"),
            "category": getattr(cls, "category", LayerCategory.PROCESSING),
            "ui_schema": cls.get_ui_schema(),
            "is_builtin": is_builtin
        }

    def get_all_types(self):
        """返回所有可用图层类型的详细描述（供前端动态生成 UI 使用）"""
        results = []
        for tid, cls in self.builtin_layers.items():
            results.append(self._get_layer_info(tid, cls, True))
        for tid, cls in self.plugin_layers.items():
            results.append(self._get_layer_info(tid, cls, False))
        return results

    def get_types_by_category(self):
        """按类别分组返回图层类型"""
        all_types = self.get_all_types()
        return {
            "processing": [t for t in all_types if t["category"] == LayerCategory.PROCESSING],
            "rendering": [t for t in all_types if t["category"] == LayerCategory.RENDERING]
        }

    def create_layer_instance(self, type_id, config):
        """根据类型 ID 和配置参数创建一个图层实例"""
        cls = self.builtin_layers.get(type_id) or self.plugin_layers.get(type_id)
        if not cls: return None
        return cls(config)
    
    def is_rendering_layer(self, type_id):
        """判断给定类型是否为渲染层"""
        cls = self.builtin_layers.get(type_id) or self.plugin_layers.get(type_id)
        if not cls: return False
        return getattr(cls, "category", None) == LayerCategory.RENDERING
