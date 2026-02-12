import compileall
import os
import sys

def run_preflight():
    print("🚀 Starting Proxy Protocol Syntax Audit...")
    print("-" * 40)
    
    # Check for syntax errors in the entire directory
    # 'force=True' ensures it re-checks even if .pyc files exist
    # 'quiet=0' ensures it prints the filenames it's checking
    success = compileall.compile_dir('.', force=True, quiet=0)
    
    print("-" * 40)
    if success:
        print("✅ PASS: All files are syntactically valid.")
        sys.exit(0)
    else:
        print("❌ FAIL: Syntax errors detected. Check the logs above.")
        sys.exit(1)

if __name__ == "__main__":
    run_preflight()