"""
test_unified_pipeline.py - 统一管道测试

验证 Native (ripgrep) + Logic (Python) 图层的混合管道能正确工作。
已从 PyQt6 迁移至纯 threading 实现。
"""

import os
import sys
import threading
from pathlib import Path

# 添加后端路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from bridge import PipelineWorker, FileBridge
from loglayer.builtin.filter import FilterLayer
from loglayer.builtin.level import LevelLayer
from loglayer.core import BaseLayer, LayerStage


class CustomLogicLayer(BaseLayer):
    """自定义 Python 逻辑图层，用于测试混合管道"""
    stage = LayerStage.LOGIC
    display_name = "Custom Logic"
    description = "Test logic layer"
    
    def filter_line(self, content, index=-1):
        return "failure" in content.lower()


def test_unified_pipeline():
    print("--- Testing Unified Backend Pipeline ---")
    
    # 1. 创建测试日志文件
    log_path = Path("tests/unified_test.log")
    content = [
        "2026-02-01 10:00:01 INFO  [System] Started",
        "2026-02-01 10:00:02 WARN  [Engine] Temperature high",
        "2026-02-01 10:00:03 ERROR [Engine] Critical failure",
        "2026-02-01 10:00:04 DEBUG [System] Heartbeat",
        "2026-02-01 10:00:05 INFO  [Engine] Recovery success"
    ]
    with open(log_path, "w", encoding="utf-8") as f:
        f.write("\n".join(content) + "\n")
    
    # 2. 设置图层实例
    # 图层 1: Native 过滤 "Engine"
    filter_layer = FilterLayer({
        "query": "Engine", 
        "regex": False, 
        "caseSensitive": False, 
        "invert": False
    })
    
    # 图层 2: Native Level 过滤 "ERROR" 和 "WARN"
    level_layer = LevelLayer({"levels": ["ERROR", "WARN"]})
    
    # 图层 3: Python 逻辑过滤
    logic_layer = CustomLogicLayer({})
    
    layers = [filter_layer, level_layer, logic_layer]
    
    # 3. 运行 PipelineWorker
    bridge = FileBridge()
    rg_path = bridge._get_rg_path()
    
    worker = PipelineWorker(rg_path, str(log_path), layers)
    
    results = {"visible": None, "matches": None}
    finished_event = threading.Event()
    
    def on_finished(visible, matches):
        results["visible"] = visible
        results["matches"] = matches
        finished_event.set()

    def on_error(msg):
        print(f"Error: {msg}")
        results["error"] = msg
        finished_event.set()

    worker.finished.connect(on_finished)
    worker.error.connect(on_error)
    
    print("Starting pipeline...")
    worker.start()
    
    # 等待最多 30 秒
    finished_event.wait(timeout=30)
    
    # 4. 验证结果
    # 预期流程:
    # rg "Engine" -> 行 2, 3, 5 (0-indexed: 1, 2, 4)
    # rg "ERROR|WARN" -> 行 2, 3 (0-indexed: 1, 2)
    # Python "failure" -> 行 3 (index 2)
    
    visible = results["visible"]
    print(f"Visible Indices: {list(visible) if visible else None}")
    
    success = (visible is not None and len(visible) == 1 and visible[0] == 2)
    
    if success:
        print("--- Verification PASS ---")
    else:
        print("--- Verification FAIL ---")
        if visible is not None:
            print(f"Expected: [2], Got: {list(visible)}")
        
    # 清理
    try:
        log_path.unlink()
    except:
        pass
    
    return success


if __name__ == "__main__":
    success = test_unified_pipeline()
    sys.exit(0 if success else 1)
