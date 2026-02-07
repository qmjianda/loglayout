import os
import mmap
from abc import ABC, abstractmethod

class BaseStorageProvider(ABC):
    """
    存储提供者基类。
    定义了如何打开文件、获取大小和名称的标准接口。
    """
    scheme = "file" # 默认协议

    @abstractmethod
    def open(self, uri: str):
        """返回一个 file-like 对象"""
        pass

    @abstractmethod
    def get_size(self, uri: str) -> int:
        """获取文件大小"""
        pass

    @abstractmethod
    def get_name(self, uri: str) -> str:
        """从 URI 中提取显示名称"""
        pass

    def get_mmap(self, uri: str):
        """
        获取 mmap 对象（如果支持）。
        默认返回 None，仅 LocalStorageProvider 支持。
        """
        return None

class LocalStorageProvider(BaseStorageProvider):
    """本地文件存储提供者 (Default)"""
    scheme = "file"

    def open(self, uri: str):
        path = self._to_path(uri)
        return open(path, 'rb')

    def get_size(self, uri: str) -> int:
        path = self._to_path(uri)
        return os.path.getsize(path)

    def get_name(self, uri: str) -> str:
        path = self._to_path(uri)
        return os.path.basename(path)

    def get_mmap(self, uri: str):
        path = self._to_path(uri)
        fd = os.open(path, os.O_RDONLY)
        try:
            size = os.path.getsize(path)
            if size == 0: return None
            return mmap.mmap(fd, 0, access=mmap.ACCESS_READ)
        finally:
            os.close(fd)

    def _to_path(self, uri: str) -> str:
        if uri.startswith("file://"):
            return uri[7:]
        return uri

class MemoryStorageProvider(BaseStorageProvider):
    """内存模拟存储提供者 (用于测试)"""
    scheme = "mem"

    def open(self, uri: str):
        import io
        return io.BytesIO(b"Memory file content\nLine 2\n")

    def get_size(self, uri: str) -> int:
        return 32

    def get_name(self, uri: str) -> str:
        return "memory_buffer.log"

class StorageRegistry:
    """存储提供者注册表"""
    def __init__(self):
        self._providers = {}
        # 默认注册
        self.register(LocalStorageProvider())
        self.register(MemoryStorageProvider())

    def register(self, provider: BaseStorageProvider):
        self._providers[provider.scheme] = provider

    def get_provider(self, uri: str) -> BaseStorageProvider:
        if "://" in uri:
            scheme = uri.split("://", 1)[0]
            return self._providers.get(scheme, self._providers["file"])
        return self._providers["file"]
