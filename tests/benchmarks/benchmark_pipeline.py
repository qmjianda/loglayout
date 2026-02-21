import time
import subprocess
import os

def current_parsing(rg_path, file_path, query):
    cmd = [rg_path, "-n", "--no-heading", "--no-filename", "--color", "never", query, file_path]
    start_time = time.time()
    count = 0
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, bufsize=1024*1024)
    for line in p.stdout:
        line_str = line.decode('utf-8', errors='ignore')
        parts = line_str.split(':', 1)
        if len(parts) >= 2:
            idx = int(parts[0])
            count += 1
    p.stdout.close()
    p.wait()
    return count, time.time() - start_time

def fast_parsing(rg_path, file_path, query):
    # Use -o to only get the line number part
    # We match the line number at the start of the line: ^[0-9]+:
    # This works because we use -n in rg.
    # Wait, rg -o ignores the line number prefix? No, -n adds it.
    
    # Actually, a better way is to use a regex that matches the line number plus a bit:
    # rg -n -o "^" -e "query" returns "123:" if query matches.
    cmd = [rg_path, "-n", "--no-heading", "--no-filename", "--color", "never", "-o", "^", "-e", query, file_path]
    start_time = time.time()
    count = 0
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, bufsize=1024*1024)
    for line in p.stdout:
        # line is b"123:\n"
        colon_idx = line.find(b':')
        if colon_idx != -1:
            try:
                idx = int(line[:colon_idx])
                count += 1
            except: pass
    p.stdout.close()
    p.wait()
    return count, time.time() - start_time

if __name__ == "__main__":
    rg_path = r"bin/windows/rg.exe"
    test_file = r"tests/logs/large_test.log"
    query = "test" 
    
    if os.path.exists(test_file):
        print(f"Benchmarking Pipeline for {test_file}...")
        # Make sure query exists
        with open(test_file, "r", encoding="utf-8", errors="ignore") as f:
            head = f.read(1000)
            if query not in head:
                print("Query not in head, using empty query to match everything")
                query = ""

        c1, d1 = current_parsing(rg_path, test_file, query)
        print(f"Current Parsing: {c1} matches, {d1:.4f}s")
        
        c2, d2 = fast_parsing(rg_path, test_file, query)
        print(f"Fast Parsing: {c2} matches, {d2:.4f}s")
