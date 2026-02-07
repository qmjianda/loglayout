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

    def _get_bookmark_layer(self, session):
        """Find the BookmarkLayer instance in a session."""
        for layer in session.rendering_instances:
            if layer.__class__.__name__ == 'BookmarkLayer':
                return layer
        return None

    def _ensure_bookmark_layer(self, session, file_id: str):
        """Ensure a BookmarkLayer exists for the session."""
        layer = self._get_bookmark_layer(session)
        if layer is None:
            # Create a new system-managed bookmark layer
            layer = self._registry.create_layer_instance('BOOKMARK', {'color': '#f59e0b', 'bookmarks': {}})
            if layer:
                layer.id = f"system-bookmark-{file_id}"
                session.rendering_instances.append(layer)
                # Sync to session configuration for persistence
                session.layers.append({
                    'id': layer.id,
                    'type': 'BOOKMARK',
                    'name': '书签',
                    'enabled': True,
                    'isSystemManaged': True,
                    'config': {'color': '#f59e0b', 'bookmarks': {}}
                })
        return layer

    def _sync_bookmark_config_and_refresh(self, session, layer, file_id):
        """Synchronize layer state to session config and trigger a refresh."""
        for l_conf in session.layers:
            if l_conf.get('id') == layer.id:
                l_conf['config']['bookmarks'] = layer.bookmarks
                break
        
        session.cache.clear()
        indices_len = len(session.visible_indices) if session.visible_indices is not None else len(session.line_offsets)
        matches_len = len(session.search_matches) if session.search_matches is not None else 0
        self.pipelineFinished.emit(file_id, indices_len, matches_len)

    def toggle_bookmark(self, file_id: str, line_index: int) -> str:
        if file_id not in self._sessions: return "{}"
        session = self._sessions[file_id]
        layer = self._ensure_bookmark_layer(session, file_id)
        if not layer: return "{}"
        
        layer.toggle(line_index)
        self._sync_bookmark_config_and_refresh(session, layer, file_id)
        return json.dumps(layer.bookmarks)

    def get_bookmarks(self, file_id: str) -> str:
        if file_id not in self._sessions: return "{}"
        session = self._sessions[file_id]
        layer = self._get_bookmark_layer(session)
        return json.dumps(layer.bookmarks if layer else {})

    def update_bookmark_comment(self, file_id: str, line_index: int, comment: str) -> str:
        if file_id not in self._sessions: return "{}"
        session = self._sessions[file_id]
        layer = self._get_bookmark_layer(session)
        if layer:
            layer.set_comment(line_index, comment)
            self._sync_bookmark_config_and_refresh(session, layer, file_id)
        return json.dumps(layer.bookmarks if layer else {})

    def get_nearest_bookmark_index(self, file_id: str, current_index: int, direction: str) -> int:
        if file_id not in self._sessions: return -1
        session = self._sessions[file_id]
        layer = self._get_bookmark_layer(session)
        if not layer: return -1
        
        return layer.get_nearest_index(
            current_index, 
            direction, 
            session.visible_indices, 
            lambda pi: self.physical_to_visual_index(file_id, pi)
        )

    def clear_bookmarks(self, file_id: str) -> str:
        if file_id not in self._sessions: return "{}"
        session = self._sessions[file_id]
        layer = self._get_bookmark_layer(session)
        if layer:
            layer.clear_all()
            self._sync_bookmark_config_and_refresh(session, layer, file_id)
        return "{}"

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
