import sys
import os
import json

# Add backend to sys.path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from bridge import FileBridge

def test_plugin_discovery():
    print("--- Testing Plugin Discovery ---")
    bridge = FileBridge()
    # Explicitly trigger discovery with the current plugin dir
    bridge._registry.plugin_dir = os.path.join(os.getcwd(), 'backend', 'plugins')
    bridge._registry.discover_plugins()
    
    # Check for Anonymizer (Layer)
    layers = bridge._registry.get_all_types()
    anonymizer = next((l for l in layers if "ANONYMIZER" in l['type']), None)
    if anonymizer:
        print(f"SUCCESS: Found Anonymizer layer: {anonymizer['type']}")
    else:
        print("FAILURE: Anonymizer layer not found.")

    # Check for SystemStats (Widget)
    widgets = bridge._registry.get_ui_widgets()
    stats_widget = next((w for w in widgets if "SYSTEMSTATS" in w['type']), None)
    if stats_widget:
        print(f"SUCCESS: Found SystemStats widget: {stats_widget['type']}")
    else:
        print("FAILURE: SystemStats widget not found.")

def test_storage_router():
    print("\n--- Testing Storage Router ---")
    bridge = FileBridge()
    provider = bridge._registry.storage.get_provider("test.log")
    print(f"Provider for 'test.log': {provider.__class__.__name__}")
    
    provider_mem = bridge._registry.storage.get_provider("mem://temp")
    print(f"Provider for 'mem://temp': {provider_mem.__class__.__name__}")
    if provider_mem.__class__.__name__ == "MemoryStorageProvider":
        print("SUCCESS: URI Routing to MemoryStorageProvider works.")
    else:
        print("FAILURE: URI Routing failed.")

if __name__ == "__main__":
    test_plugin_discovery()
    test_storage_router()
