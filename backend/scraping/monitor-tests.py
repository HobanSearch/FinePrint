#!/usr/bin/env python3
"""
Monitor the progress of model tests running in background
"""

import subprocess
import time
import json
import os

def check_process(pid):
    """Check if a process is still running"""
    try:
        result = subprocess.run(['ps', '-p', str(pid)], capture_output=True, text=True)
        return result.returncode == 0
    except:
        return False

def monitor_tests():
    """Monitor test progress"""
    print("📊 Model Testing Monitor")
    print("=" * 50)
    
    # Check comprehensive test
    comprehensive_pid = 51712
    gpt_oss_pid = 50074
    
    print("\n🔄 Test Status:")
    
    # Check comprehensive test
    if check_process(comprehensive_pid):
        print(f"  ⏳ Comprehensive test (PID {comprehensive_pid}): Running...")
    else:
        print(f"  ✅ Comprehensive test (PID {comprehensive_pid}): Completed")
    
    # Check GPT-OSS test
    if check_process(gpt_oss_pid):
        print(f"  ⏳ GPT-OSS test (PID {gpt_oss_pid}): Running...")
    else:
        print(f"  ✅ GPT-OSS test (PID {gpt_oss_pid}): Completed")
    
    # Check log files
    print("\n📄 Log Files:")
    
    logs = [
        ("comprehensive-model-test.log", "Comprehensive Test"),
        ("gpt-oss-test.log", "GPT-OSS Test"),
        ("quick-comparison-results.json", "Quick Results")
    ]
    
    for log_file, name in logs:
        if os.path.exists(log_file):
            size = os.path.getsize(log_file)
            modified = time.ctime(os.path.getmtime(log_file))
            print(f"  📝 {name}: {size} bytes, modified {modified}")
            
            # Show last few lines of log
            if log_file.endswith('.log'):
                try:
                    with open(log_file, 'r') as f:
                        lines = f.readlines()
                        if lines:
                            print(f"     Last entry: {lines[-1].strip()[:80]}")
                except:
                    pass
    
    # Check if results are ready
    print("\n📈 Results:")
    
    if os.path.exists("quick-comparison-results.json"):
        try:
            with open("quick-comparison-results.json", 'r') as f:
                results = json.load(f)
                
            if results.get("recommendation"):
                print(f"  🏆 Recommended Model: {results['recommendation']}")
                
            for result in results.get("results", []):
                model = result.get("model", "Unknown")
                successful = result.get("successful", 0)
                failed = result.get("failed", 0)
                avg_time = result.get("avg_time", 0)
                
                print(f"\n  {model}:")
                print(f"    Success: {successful}, Failed: {failed}")
                if avg_time > 0:
                    print(f"    Avg Time: {avg_time:.2f}s")
        except:
            print("  ⏳ Results not yet available")
    
    # Check model availability
    print("\n🤖 Available Models:")
    result = subprocess.run(['ollama', 'list'], capture_output=True, text=True)
    if result.returncode == 0:
        for line in result.stdout.split('\n')[1:]:
            if 'fine-print' in line:
                parts = line.split()
                if parts:
                    model_name = parts[0]
                    size = parts[2] if len(parts) > 2 else "?"
                    print(f"  ✓ {model_name} ({size})")

if __name__ == "__main__":
    monitor_tests()
    
    print("\n💡 Tips:")
    print("  - Tests may take up to 30 minutes per model")
    print("  - GPT-OSS 20B is the largest and slowest model")
    print("  - Llama 3.2 (2GB) should be the fastest")
    print("\n📝 To view full logs:")
    print("  tail -f comprehensive-model-test.log")
    print("  tail -f gpt-oss-test.log")