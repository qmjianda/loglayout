import subprocess
import sys
import os

def run_tests():
    print("=== LogLayer Test Suite Runner ===")
    
    # Define test files to run
    test_files = [
        "tests/test_search_mixin.py",
        "tests/test_api_endpoints.py",
        "tests/test_stats_worker_pytest.py",
        "tests/test_unified_pipeline_pytest.py"
    ]
    
    cmd = [sys.executable, "-m", "pytest", "-v"] + test_files
    
    print(f"Running: {' '.join(cmd)}")
    
    result = subprocess.run(cmd)
    
    if result.returncode == 0:
        print("\n✅ ALL TESTS PASSED")
    else:
        print("\n❌ SOME TESTS FAILED")
        
    return result.returncode

if __name__ == "__main__":
    sys.exit(run_tests())
