"""
test_backend_core.py - 后端核心功能测试

测试覆盖：
- IndexingWorker: 验证大文件行索引的正确性
- PipelineWorker: 验证过滤管道的可扩展性

已从 PyQt6 迁移至纯 threading 实现。
"""

import os
import sys
import mmap
import array
import threading
from pathlib import Path

# 添加后端路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from bridge import PipelineWorker, IndexingWorker
from loglayer.core import LayerStage


class MockFilterLayer:
    """模拟过滤图层，用于测试 Pipeline"""
    stage = LayerStage.NATIVE
    
    def __init__(self, query):
        self.query = query
        self.regex = False
        self.caseSensitive = True
    
    def get_rg_args(self):
        args = []
        if not self.regex:
            args.append("-F")
        if not self.caseSensitive:
            args.append("-i")
        args.append(self.query)
        return args


def run_pipeline_test(rg_path, file_path, line_count):
    """验证 PipelineWorker 能处理大规模结果集"""
    print(f"--- Running Pipeline Scalability Test ({line_count} lines) ---")
    
    layer = MockFilterLayer('ERROR')
    worker = PipelineWorker(rg_path, str(file_path), [layer])
    
    results = {}
    finished_event = threading.Event()
    
    def on_finished(indices, matches):
        results['indices'] = indices
        finished_event.set()
    
    def on_error(msg):
        print(f"Error: {msg}")
        results['error'] = msg
        finished_event.set()

    worker.finished.connect(on_finished)
    worker.error.connect(on_error)
    worker.start()
    
    # 等待最多 120 秒
    finished_event.wait(timeout=120)
    
    if 'indices' in results:
        actual_count = len(results['indices'])
        print(f"Result: {actual_count} lines returned.")
        return actual_count == line_count
    
    if 'error' in results:
        print(f"Pipeline failed with error: {results['error']}")
        
    return False


def run_indexing_test(file_path, line_count):
    """验证 IndexingWorker 能正确计数行"""
    print(f"--- Running Indexing Integrity Test ---")
    
    size = os.path.getsize(file_path)
    fd = os.open(file_path, os.O_RDONLY)
    mm = mmap.mmap(fd, 0, access=mmap.ACCESS_READ)
    
    worker = IndexingWorker(mm, size)
    results = {}
    finished_event = threading.Event()
    
    def on_finished(offsets):
        results['offsets'] = offsets
        finished_event.set()
    
    def on_error(msg):
        print(f"Error: {msg}")
        results['error'] = msg
        finished_event.set()
        
    worker.finished.connect(on_finished)
    worker.error.connect(on_error)
    worker.start()
    
    # 等待最多 60 秒
    finished_event.wait(timeout=60)
    
    mm.close()
    os.close(fd)
    
    if 'offsets' in results:
        actual_count = len(results['offsets'])
        print(f"Result: {actual_count} lines indexed.")
        return actual_count == line_count
        
    return False


def main():
    # 设置测试文件
    test_file = Path("tests/test_temp.log")
    line_count = 50000  # 使用适中的测试规模（5万行）
    
    print(f"Generating test file: {test_file} ({line_count} lines)...")
    with open(test_file, "w") as f:
        for i in range(line_count):
            f.write(f"Line {i} ERROR message content\n")
    
    # 查找 ripgrep
    import platform
    rg_dir = "windows" if platform.system() == "Windows" else "linux"
    rg_name = "rg.exe" if platform.system() == "Windows" else "rg"
    rg_path = Path("bin") / rg_dir / rg_name
    
    if not rg_path.exists():
        rg_path = Path(os.getcwd()) / "bin" / rg_dir / rg_name
    
    if not rg_path.exists():
        print(f"Error: ripgrep not found at {rg_path}")
        sys.exit(1)
    
    p_success = run_pipeline_test(str(rg_path), test_file, line_count)
    i_success = run_indexing_test(str(test_file), line_count)
    
    # 清理
    if test_file.exists():
        test_file.unlink()
        
    print("\n--- Summary ---")
    print(f"Pipeline Test: {'PASS' if p_success else 'FAIL'}")
    print(f"Indexing Test: {'PASS' if i_success else 'FAIL'}")
    
    sys.exit(0 if (p_success and i_success) else 1)


if __name__ == "__main__":
    main()
