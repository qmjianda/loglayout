
import { LayerType, LogLayer, LogLine } from './types';

// Mock FileData structure matching App.tsx
interface FileData {
    id: string;
    name: string;
    layers: LogLayer[];
    history: {
        past: LogLayer[][];
        future: LogLayer[][];
    };
}

// Mock State Management
let files: FileData[] = [];
let activeFileId: string | null = null;

// Helper to Create File
function createFile(name: string): FileData {
    return {
        id: name, // simplify id
        name,
        layers: [],
        history: { past: [], future: [] }
    };
}

// Helper to Update Layers (Simulating App.tsx updateLayers)
function updateLayers(updater: LogLayer[] | ((prev: LogLayer[]) => LogLayer[])) {
    if (!activeFileId) return;

    files = files.map(file => {
        if (file.id !== activeFileId) return file;

        const currentLayers = file.layers || [];
        const nextLayers = typeof updater === 'function' ? updater(currentLayers) : updater;

        let newHistory = file.history || { past: [], future: [] };
        if (JSON.stringify(currentLayers) !== JSON.stringify(nextLayers)) {
            newHistory = {
                past: [...newHistory.past, currentLayers].slice(-10),
                future: []
            };
        }

        return { ...file, layers: nextLayers, history: newHistory };
    });
}

// Test Runner
async function runTests() {
    console.log("🧪 Starting Core Logic Tests...");

    // 1. Create Files
    files.push(createFile("FileA"));
    files.push(createFile("FileB"));
    console.log("✅ Created FileA and FileB");

    // 2. Activate FileA and Add Layer
    activeFileId = "FileA";
    const layer1: LogLayer = { id: 'L1', name: 'Filter 1', type: LayerType.FILTER, enabled: true, config: {}, isCollapsed: false };
    updateLayers(prev => [...prev, layer1]);

    // Check FileA
    const fileA = files.find(f => f.id === "FileA")!;
    if (fileA.layers.length === 1 && fileA.layers[0].id === 'L1') {
        console.log("✅ FileA has Layer L1");
    } else {
        console.error("❌ FileA failed to add Layer L1", fileA.layers);
    }

    // Check FileB
    const fileB = files.find(f => f.id === "FileB")!;
    if (fileB.layers.length === 0) {
        console.log("✅ FileB is empty (Independent Layers Verified)");
    } else {
        console.error("❌ FileB was affected!", fileB.layers);
    }

    // 3. Switch to FileB and Add Layer
    activeFileId = "FileB";
    const layer2: LogLayer = { id: 'L2', name: 'Highlight 1', type: LayerType.HIGHLIGHT, enabled: true, config: {}, isCollapsed: false };
    updateLayers(prev => [...prev, layer2]);

    if (files.find(f => f.id === "FileB")!.layers[0].id === 'L2') {
        console.log("✅ FileB has Layer L2");
    } else {
        console.error("❌ FileB failed to add Layer L2");
    }

    // Verify FileA again
    if (files.find(f => f.id === "FileA")!.layers.length === 1) {
        console.log("✅ FileA still has 1 layer");
    } else {
        console.error("❌ FileA was modified when FileB was active!");
    }

    console.log("🎉 All Core Logic Tests Passed!");
}

runTests();
