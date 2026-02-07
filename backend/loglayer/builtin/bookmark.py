import bisect
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
        # bookmarks is now a dict: {line_index: comment_str}
        raw_bookmarks = config.get("bookmarks", []) if config else []
        if isinstance(raw_bookmarks, list):
            # Compatibility: convert old list format to dict
            self.bookmarks = {int(idx): "" for idx in raw_bookmarks}
        else:
            # Ensure keys are integers even if loaded from JSON as strings
            self.bookmarks = {int(k): v for k, v in raw_bookmarks.items()}

    def get_row_style(self, content: str, index: int = -1) -> dict:
        """如果当前行是书签，返回左边框样式和注释"""
        if index in self.bookmarks:
            return {
                "borderLeft": f"3px solid {self.color}",
                "isMarked": True,
                "bookmarkComment": self.bookmarks[index]
            }
        return {}
    
    def highlight_line(self, content: str) -> list:
        """书签不高亮文字，返回空"""
        return []

    def toggle(self, line_index: int):
        """切换特定行的书签状态"""
        if line_index in self.bookmarks:
            del self.bookmarks[line_index]
        else:
            self.bookmarks[line_index] = ""

    def set_comment(self, line_index: int, comment: str):
        """设置书签注释"""
        if line_index in self.bookmarks:
            self.bookmarks[line_index] = comment

    def clear_all(self):
        """清除所有书签"""
        self.bookmarks.clear()

    def get_nearest_index(self, current_index: int, direction: str, visual_indices: list, physical_to_visual_func) -> int:
        """获取最近的书签索引（处理虚拟/物理索引映射）"""
        if not self.bookmarks:
            return -1
        
        sorted_bookmarks = sorted(list(self.bookmarks.keys()))
        
        # 确定当前物理索引
        current_physical = current_index
        if visual_indices is not None:
            if not visual_indices: return -1
            if 0 <= current_index < len(visual_indices):
                current_physical = visual_indices[current_index]
            elif current_index >= len(visual_indices):
                current_physical = visual_indices[-1] + 1
            else:
                current_physical = 0
        
        # 查找最近的物理索引
        if direction == 'next':
            idx = bisect.bisect_right(sorted_bookmarks, current_physical)
            target_physical = sorted_bookmarks[idx] if idx < len(sorted_bookmarks) else sorted_bookmarks[0]
        else:
            idx = bisect.bisect_left(sorted_bookmarks, current_physical) - 1
            target_physical = sorted_bookmarks[idx] if idx >= 0 else sorted_bookmarks[-1]
            
        return physical_to_visual_func(target_physical)
