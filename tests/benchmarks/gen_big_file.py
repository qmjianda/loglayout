import os

def generate_test_file(path, size_gb=1.2):
    """Generates a dummy log file of approx size_gb."""
    target_size = int(size_gb * 1024 * 1024 * 1024)
    current_size = 0
    buffer_lines = []
    
    # Pre-generate some sample lines
    samples = [
        "[INFO] User logged in from IP 192.168.1.{i}",
        "[DEBUG] Memory usage: {i} MB, Threads: 12",
        "[WARNING] Disk space low on /dev/sda{i}",
        "[ERROR] Database connection failed for user_id={i}",
        "[FATAL] System shutdown initiated by kernel. Panic code: 0x{i:04x}",
        "2026-01-29 20:52:{i:02d} [LOGLAYER] Processing large data chunk {i}..."
    ]
    
    print(f"Generating {size_gb}GB test file at {path}...")
    
    with open(path, 'w', encoding='utf-8') as f:
        i = 0
        while current_size < target_size:
            line = samples[i % len(samples)].format(i=i) + "\n"
            f.write(line)
            current_size += len(line)
            i += 1
            if i % 100000 == 0:
                print(f"Progress: {current_size / 1024 / 1024:.2f} MB / {size_gb * 1024:.2f} MB", end='\r')

    print(f"\nDone! Generated {path} ({current_size / 1024 / 1024 / 1024:.2f} GB)")

if __name__ == "__main__":
    import sys
    file_path = "large_test.log"
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
    
    generate_test_file(file_path, 1.2)
