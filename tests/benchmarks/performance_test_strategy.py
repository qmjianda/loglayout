import mmap
import os
import time
import array
from pathlib import Path

class LargeFileProcessor:
    def __init__(self, file_path):
        self.file_path = Path(file_path)
        self.size = self.file_path.stat().st_size
        self.line_offsets = array.array('Q')
        self._mmap = None
        self._fd = None

    def open(self):
        self._fd = os.open(self.file_path, os.O_RDONLY)
        self._mmap = mmap.mmap(self._fd, 0, access=mmap.ACCESS_READ)
        print(f"File mapped: {self.size / 1024 / 1024:.2f} MB")

    def index_lines(self):
        """Indexes line start offsets for O(1) random access."""
        start_time = time.time()
        self.line_offsets = array.array('Q')
        self.line_offsets.append(0)
        
        # Fast scan for newlines
        pos = 0
        while True:
            pos = self._mmap.find(b'\n', pos)
            if pos == -1:
                break
            pos += 1
            if pos < self.size:
                self.line_offsets.append(pos)
        
        end_time = time.time()
        print(f"Indexed {len(self.line_offsets)} lines in {end_time - start_time:.4f}s")

    def get_line(self, line_number):
        if line_number < 0 or line_number >= len(self.line_offsets):
            return None
        
        start = self.line_offsets[line_number]
        end = self.line_offsets[line_number + 1] if line_number + 1 < len(self.line_offsets) else self.size
        
        return self._mmap[start:end].decode('utf-8', errors='replace').rstrip('\r\n')

    def close(self):
        if self._mmap:
            self._mmap.close()
        if self._fd:
            os.close(self._fd)

def generate_test_file(path, size_gb=1):
    """Generates a dummy log file of approx size_gb."""
    target_size = size_gb * 1024 * 1024 * 1024
    current_size = 0
    with open(path, 'w') as f:
        while current_size < target_size:
            line = f"2023-10-27 10:00:{current_size % 60:02d} [INFO] This is a dummy log entry with some data attached {current_size}\n"
            f.write(line)
            current_size += len(line)
    print(f"Generated {path} ({size_gb}GB)")

if __name__ == "__main__":
    test_file = "test_large.log"
    if not os.path.exists(test_file):
        generate_test_file(test_file, 0.1) # Starting with 100MB for safe demo
    
    processor = LargeFileProcessor(test_file)
    processor.open()
    processor.index_lines()
    
    # Test random access
    middle_line = len(processor.line_offsets) // 2
    print(f"Line {middle_line}: {processor.get_line(middle_line)}")
    
    processor.close()
