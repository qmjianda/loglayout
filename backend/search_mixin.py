import json
import bisect

class SearchMixin:
    """
    Mixin for FileBridge to handle Search and Bookmark operations.
    Expected to be mixed into a class with:
    - self._sessions
    - self._registry
    - self.pipelineFinished (Signal)
    """

    def get_search_match_index(self, file_id: str, rank: int) -> int:
        if file_id not in self._sessions: return -1
        session = self._sessions[file_id]
        if session.search_matches is None or len(session.search_matches) == 0: return -1
        if rank < 0 or rank >= len(session.search_matches): return -1
        return session.search_matches[rank]

    def get_nearest_search_rank(self, file_id: str, current_index: int, direction: str) -> int:
        """Find the rank of the nearest search match based on the current visible index."""
        if file_id not in self._sessions: return -1
        session = self._sessions[file_id]
        matches = session.search_matches
        if matches is None or len(matches) == 0: return -1
        
        # search_matches contains indices in the visible list
        rank = bisect.bisect_right(matches, current_index)
        
        if direction == 'next':
            # rank is the index of the first element > current_index
            if rank < len(matches):
                return rank
            else:
                return 0 # Loop to start
        else: # prev
            # rank is the index of the first element > current_index
            # so rank-1 is the first element <= current_index
            target_rank = rank - 1
            if target_rank >= 0:
                if matches[target_rank] == current_index:
                    target_rank -= 1
                
                if target_rank >= 0:
                    return target_rank
                else:
                    return len(matches) - 1 # Loop to end
            else:
                return len(matches) - 1 # Loop to end

    def get_search_matches_range(self, file_id: str, start_rank: int, count: int) -> str:
        if file_id not in self._sessions: return "[]"
        session = self._sessions[file_id]
        if session.search_matches is None: return "[]"
        start = max(0, start_rank); end = min(len(session.search_matches), start + count)
        if start >= end: return "[]"
        return json.dumps(session.search_matches[start:end].tolist())

    def toggle_bookmark(self, file_id: str, line_index: int) -> str:
        """
        切换指定行的书签状态。
        如果没有书签图层，自动创建一个。
        返回当前书签列表的 JSON。
        """
        if file_id not in self._sessions:
            return "[]"
        
        session = self._sessions[file_id]
        
        # 查找现有的书签图层
        bookmark_layer = None
        for layer in session.rendering_instances:
            if layer.__class__.__name__ == 'BookmarkLayer':
                bookmark_layer = layer
                break
        
        # 如果没有书签图层，创建一个
        if bookmark_layer is None:
            bookmark_layer = self._registry.create_layer_instance('BOOKMARK', {'color': '#f59e0b', 'bookmarks': []})
            if bookmark_layer:
                bookmark_layer.id = f"system-bookmark-{file_id}"
                session.rendering_instances.append(bookmark_layer)
                # 同步到 layers 配置
                session.layers.append({
                    'id': bookmark_layer.id,
                    'type': 'BOOKMARK',
                    'name': '书签',
                    'enabled': True,
                    'isSystemManaged': True,
                    'config': {'color': '#f59e0b', 'bookmarks': []}
                })
        
        if bookmark_layer is None:
            return "[]"
        
        # 切换书签
        if line_index in bookmark_layer.bookmarks:
            bookmark_layer.bookmarks.remove(line_index)
        else:
            bookmark_layer.bookmarks.add(line_index)
        
        # 更新配置中的书签列表
        for l_conf in session.layers:
            if l_conf.get('id') == bookmark_layer.id:
                l_conf['config']['bookmarks'] = list(bookmark_layer.bookmarks)
                break
        
        # 清除缓存并刷新
        session.cache.clear()
        indices_len = len(session.visible_indices) if session.visible_indices is not None else len(session.line_offsets)
        matches_len = len(session.search_matches) if session.search_matches is not None else 0
        self.pipelineFinished.emit(file_id, indices_len, matches_len)
        
        return json.dumps(sorted(list(bookmark_layer.bookmarks)))

    def get_bookmarks(self, file_id: str) -> str:
        """返回当前文件的书签列表 JSON"""
        if file_id not in self._sessions:
            return "[]"
        
        session = self._sessions[file_id]
        
        for layer in session.rendering_instances:
            if layer.__class__.__name__ == 'BookmarkLayer':
                return json.dumps(sorted(list(layer.bookmarks)))
        
        return "[]"

    def get_nearest_bookmark_index(self, file_id: str, current_index: int, direction: str) -> int:
        """查找最近的书签索引"""
        if file_id not in self._sessions:
            return -1
        
        session = self._sessions[file_id]
        bookmarks = []
        
        for layer in session.rendering_instances:
            if layer.__class__.__name__ == 'BookmarkLayer':
                bookmarks = sorted(list(layer.bookmarks))
                break
        
        if not bookmarks:
            return -1
            
        # 1. 将输入的虚拟索引转换为物理索引
        current_physical = current_index
        if session.visible_indices is not None:
            # 如果 visible_indices 为空（全过滤），没有可见行可以导航
            if len(session.visible_indices) == 0:
                return -1
            if current_index >= 0 and current_index < len(session.visible_indices):
                current_physical = session.visible_indices[current_index]
            elif current_index >= len(session.visible_indices):
                current_physical = session.visible_indices[-1] + 1
            else:
                current_physical = 0
        
        target_physical = -1
        if direction == 'next':
            idx = bisect.bisect_right(bookmarks, current_physical)
            if idx < len(bookmarks):
                target_physical = bookmarks[idx]
            else:
                target_physical = bookmarks[0]  # 循环到开头
        else:  # prev
            idx = bisect.bisect_left(bookmarks, current_physical) - 1
            if idx >= 0:
                target_physical = bookmarks[idx]
            else:
                target_physical = bookmarks[-1]  # 循环到末尾
                
        if target_physical == -1:
            return -1
            
        # 2. 将目标物理索引转换回虚拟索引返回
        return self.physical_to_visual_index(file_id, target_physical)

    def clear_bookmarks(self, file_id: str) -> str:
        """清除指定文件的所有书签"""
        if file_id not in self._sessions:
            return "[]"
        
        session = self._sessions[file_id]
        
        for layer in session.rendering_instances:
            if layer.__class__.__name__ == 'BookmarkLayer':
                layer.bookmarks.clear()
                # 更新配置
                for l_conf in session.layers:
                    if l_conf.get('id') == layer.id:
                        l_conf['config']['bookmarks'] = []
                        break
                break
        
        # 清除缓存并刷新
        session.cache.clear()
        indices_len = len(session.visible_indices) if session.visible_indices is not None else len(session.line_offsets)
        matches_len = len(session.search_matches) if session.search_matches is not None else 0
        self.pipelineFinished.emit(file_id, indices_len, matches_len)
        
        return "[]"

    def physical_to_visual_index(self, file_id: str, physical_index: int) -> int:
        """将物理行索引转换为虚拟行索引（考虑过滤后的可见行）"""
        if file_id not in self._sessions:
            return physical_index
        
        session = self._sessions[file_id]
        
        # 如果没有过滤（visible_indices 为 None），物理索引 = 虚拟索引
        if session.visible_indices is None:
            return physical_index
        
        # 在 visible_indices 中二分查找物理索引对应的虚拟索引
        visual_idx = bisect.bisect_left(session.visible_indices, physical_index)
        
        # 检查是否找到完全匹配
        if visual_idx < len(session.visible_indices) and session.visible_indices[visual_idx] == physical_index:
            return visual_idx
        
        # 如果物理行被过滤掉了，返回最近的可见行
        if visual_idx > 0:
            return visual_idx - 1
        return 0
