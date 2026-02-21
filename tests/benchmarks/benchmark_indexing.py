import time
import mmap
import array
import re
import os
import threading
from concurrent.futures import ThreadPoolExecutor

def current_indexing(mmap_obj, size, num_threads=8):
    chunk_size = size // num_threads
    results = []
    
    def _index_chunk(start, end):
        offsets = array.array('Q')
        pos = start
        while True:
            pos = mmap_obj.find(b'\n', pos, end)
            if pos == -1: break
            pos += 1
            if pos < size: offsets.append(pos)
            else: break
        return offsets

    start_time = time.time()
    with ThreadPoolExecutor(max_workers=num_threads) as executor:
        futures = [executor.submit(_index_chunk, i * chunk_size, size if i == num_threads - 1 else (i + 1) * chunk_size) for i in range(num_threads)]
        for f in futures:
            results.append(f.result())
    
    total_offsets = array.array('Q', [0])
    for chunk_offsets in results:
        total_offsets.extend(chunk_offsets)
    
    duration = time.time() - start_time
    return len(total_offsets), duration

def fast_indexing(mmap_obj, size):
    start_time = time.time()
    # re.finditer on b'\n' is very fast as it's implemented in C
    # We use a memoryview to avoid copies if necessary, but finditer handles mmap directly
    offsets = array.array('Q', [0])
    # However, re.finditer returns match objects which are Python objects.
    # For 10M lines, 10M match objects might be heavy.
    # Let's see.
    for m in re.finditer(b'\n', mmap_obj):
        offsets.append(m.start() + 1)
    
    if len(offsets) > 1 and offsets[-1] >= size:
        offsets.pop()
        
    duration = time.time() - start_time
    return len(offsets), duration

def regex_all_offsets(mmap_obj, size):
    start_time = time.time()
    # Another trick: find all but just return start positions
    # re.finditer is generally the best we have in pure python without loop overhead
    offsets = array.array('Q', [0] + [m.start() + 1 for m in re.finditer(b'\n', mmap_obj)])
    if len(offsets) > 1 and offsets[-1] >= size:
        offsets.pop()
    duration = time.time() - start_time
    return len(offsets), duration

if __name__ == "__main__":
    # Path to test log
    test_file = r"tests/logs/large_test.log"
    if not os.path.exists(test_file):
        print(f"Test file {test_file} not found. Creating a 100MB one.")
        with open(test_file, "wb") as f:
            for i in range(1000000):
                f.write(f"Line {i} - This is a test log message for benchmarking indexing performance.\n".encode())
    
    size = os.path.getsize(test_file)
    with open(test_file, "rb") as f:
        m = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        
        print(f"Benchmarking indexing for {test_file} ({size/1024/1024:.1f} MB)...")
        
        count1, dur1 = current_indexing(m, size)
        print(f"Current Threaded Indexing: {count1} lines, {dur1:.4f}s")
        
        count2, dur2 = fast_indexing(m, size)
        print(f"Fast Indexing (finditer loop): {count2} lines, {dur2:.4f}s")

        count3, dur3 = regex_all_offsets(m, size)
        print(f"Regex List Comp: {count3} lines, {dur3:.4f}s")
        
        m.close()
