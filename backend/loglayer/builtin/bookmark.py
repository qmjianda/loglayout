
from loglayer.ui import ColorInput
from loglayer.core import RenderingLayer

class BookmarkLayer(RenderingLayer):
    """
    书签图层：在指定行号添加书签标记。
    书签信息存储在配置中，由前端管理添加/删除。
    """
    display_name = "书签图层"
    description = "为特定行添加书签标记"
    icon = "bookmark"
    is_system_managed = True  # 系统托管，不在图层列表显示
    
    inputs = [
        ColorInput("color", "书签颜色", value="#f59e0b"),
    ]
    
    def __init__(self, config=None):
        super().__init__(config)
        # bookmarks 是一个行号列表，例如 [10, 25, 100]
        self.bookmarks = set(config.get("bookmarks", []) if config else [])

    def get_row_style(self, content: str, index: int = -1) -> dict:
        """如果当前行是书签，返回左边框样式"""
        if index in self.bookmarks:
            return {
                "borderLeft": f"3px solid {self.color}",
                "isBookmarked": True
            }
        return {}
    
    def highlight_line(self, content: str) -> list:
        """书签不高亮文字，返回空"""
        return []
