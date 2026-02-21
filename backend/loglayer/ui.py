
class Input:
    """
    UI 输入项基类。
    用于定义图层在前端配置面板中显示的表单控件。
    """
    def __init__(self, name, display_name, value=None, info=None, **kwargs):
        self.name = name           # 在 config 中的 key
        self.display_name = display_name # 前端显示的标签文本
        self.value = value         # 默认值
        self.info = info           # 提示信息 (Tooltip)
        self.kwargs = kwargs       # 其他扩展参数 (如 min, max, options)

    def to_dict(self):
        """序列化为字典，供前端动态渲染 UI"""
        return {
            "name": self.name,
            "type": self.__class__.__name__.replace("Input", "").lower(),
            "display_name": self.display_name,
            "value": self.value,
            "info": self.info,
            **self.kwargs
        }

class StrInput(Input): pass
class IntInput(Input): pass
class RangeInput(Input):
    """数值范围/滑动条输入项"""
    def __init__(self, name, display_name, min=0, max=100, value=100, info=None):
        super().__init__(name, display_name, value, info, min=min, max=max)
class BoolInput(Input): pass
class DropdownInput(Input):
    """单选下拉列表"""
    def __init__(self, name, display_name, options, value=None, info=None):
        super().__init__(name, display_name, value, info, options=options)

class ColorInput(Input): pass
class MultiSelectInput(Input):
    """多选列表"""
    def __init__(self, name, display_name, options, value=None, info=None):
        super().__init__(name, display_name, value or [], info, options=options)

class SearchInput(Input):
    """专门用于搜索查询的输入项（支持正则、大小写敏感等开关）"""
    def __init__(self, name, display_name, value="", regex=False, caseSensitive=False, wholeWord=False, info=None):
        super().__init__(name, display_name, value, info, regex=regex, caseSensitive=caseSensitive, wholeWord=wholeWord)

class Component:
    """
    UI 组件基类。
    BaseLayer 继承自此类，实现了后端配置项与前端 UI 的自动映射。
    """
    display_name = "Base Component" # 在图层列表中显示的名称
    description = ""               # 描述文案
    inputs = []                    # 该组件所需的输入项列表
    is_system_managed = False      # 是否为系统托管图层（隐藏在图层列表中）


    def __init__(self, config=None):
        self.config = config or {}
        # 自动将 config 中的值绑定到实例属性上，方便在 process_line 中使用 self.xxx 访问
        for inp in self.inputs:
            if isinstance(inp, SearchInput):
                # Bind the main query value
                setattr(self, inp.name, self.config.get(inp.name, inp.value))
                # Bind specific flags with a prefix to avoid collisions if multiple search inputs exist
                # and to prevent partial config from overwriting established values with defaults.
                setattr(self, f"{inp.name}_regex", self.config.get("regex", inp.kwargs.get("regex")))
                setattr(self, f"{inp.name}_caseSensitive", self.config.get("caseSensitive", inp.kwargs.get("caseSensitive")))
                setattr(self, f"{inp.name}_wholeWord", self.config.get("wholeWord", inp.kwargs.get("wholeWord")))
                
                # Maintain legacy names for single-search components (backward compatibility)
                if not hasattr(self, "regex"): setattr(self, "regex", getattr(self, f"{inp.name}_regex"))
                if not hasattr(self, "caseSensitive"): setattr(self, "caseSensitive", getattr(self, f"{inp.name}_caseSensitive"))
                if not hasattr(self, "wholeWord"): setattr(self, "wholeWord", getattr(self, f"{inp.name}_wholeWord"))
            else:
                setattr(self, inp.name, self.config.get(inp.name, inp.value))

    @classmethod
    def get_ui_schema(cls):
        """返回该组件的 UI 描述架构"""
        return [inp.to_dict() for inp in cls.inputs]
