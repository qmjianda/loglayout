
import os
import sys
import threading
from pathlib import Path

# 添加后端路径
sys.path.insert(0, os.path.join(os.getcwd(), 'backend'))

from bridge import PipelineWorker, FileBridge
from loglayer.builtin.filter import FilterLayer

def test_special_char_filter():
    print("--- Running Special Character Filter Regression Test ---")
    
    # 1. 准备包含特殊字符的日志文件
    log_path = Path("tests/special_char_test.log")
    content = [
        "Normal line",
        "[2024-01-01 11:00:02] [FATAL] Crash- 'in file 2",
        "Another normal line"
    ]
    with open(log_path, "w", encoding="utf-8") as f:
        f.write("\n".join(content) + "\n")
    
    # 2. 设置包含特殊字符（以 - 开头）的图层
    # 这里的关键是 query 以 - 开头
    filter_layer = FilterLayer({
        "query": "- 'in", 
        "regex": False, 
        "caseSensitive": True, 
        "invert": False
    })
    
    # 3. 运行 PipelineWorker
    bridge = FileBridge()
    rg_path = bridge._get_rg_path()
    
    worker = PipelineWorker(rg_path, str(log_path), [filter_layer])
    
    results = {"visible": None, "matches": None}
    finished_event = threading.Event()
    
    def on_finished(visible, matches):
        results["visible"] = visible
        results["matches"] = matches
        finished_event.set()

    def on_error(msg):
        print(f"Error: {msg}")
        finished_event.set()

    worker.finished.connect(on_finished)
    worker.error.connect(on_error)
    
    print(f"Testing filter with query: \"{filter_layer.query}\"")
    worker.start()
    
    # 等待最多 10 秒
    finished_event.wait(timeout=10)
    
    # 4. 验证结果
    visible = results["visible"]
    print(f"Visible Indices: {list(visible) if visible else None}")
    
    # 预期第 2 行（索引 1）被选中
    success = (visible is not None and len(visible) == 1 and visible[0] == 1)
    
    if success:
        print("--- Regression Test PASS ---")
    else:
        print("--- Regression Test FAIL ---")
        
    # 清理
    try: log_path.unlink()
    except: pass
    
    return success

if __name__ == "__main__":
    success = test_special_char_filter()
    sys.exit(0 if success else 1)
