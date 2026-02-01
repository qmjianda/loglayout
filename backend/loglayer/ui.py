
class Input:
    def __init__(self, name, display_name, value=None, info=None, **kwargs):
        self.name = name
        self.display_name = display_name
        self.value = value
        self.info = info
        self.kwargs = kwargs

    def to_dict(self):
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
    def __init__(self, name, display_name, min=0, max=100, value=100, info=None):
        super().__init__(name, display_name, value, info, min=min, max=max)
class BoolInput(Input): pass
class DropdownInput(Input):
    def __init__(self, name, display_name, options, value=None, info=None):
        super().__init__(name, display_name, value, info, options=options)

class ColorInput(Input): pass
class MultiSelectInput(Input):
    def __init__(self, name, display_name, options, value=None, info=None):
        super().__init__(name, display_name, value or [], info, options=options)

class SearchInput(Input):
    def __init__(self, name, display_name, value="", regex=False, caseSensitive=False, wholeWord=False, info=None):
        # We store defaults in kwargs so they reach the frontend schema
        super().__init__(name, display_name, value, info, regex=regex, caseSensitive=caseSensitive, wholeWord=wholeWord)

class Component:
    display_name = "Base Component"
    description = ""
    inputs = []

    def __init__(self, config=None):
        self.config = config or {}
        # Auto-bind inputs to self
        for inp in self.inputs:
            if isinstance(inp, SearchInput):
                # SearchInput maps to multiple keys in config: name, regex, caseSensitive, wholeWord
                setattr(self, inp.name, self.config.get(inp.name, inp.value))
                setattr(self, "regex", self.config.get("regex", inp.kwargs.get("regex")))
                setattr(self, "caseSensitive", self.config.get("caseSensitive", inp.kwargs.get("caseSensitive")))
                setattr(self, "wholeWord", self.config.get("wholeWord", inp.kwargs.get("wholeWord")))
            else:
                setattr(self, inp.name, self.config.get(inp.name, inp.value))

    @classmethod
    def get_ui_schema(cls):
        return [inp.to_dict() for inp in cls.inputs]
