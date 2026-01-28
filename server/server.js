const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const app = express();
const PORT = 3001;

// Configuration
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

app.use(cors());
app.use(express.json());

// Storage
const upload = multer({ dest: UPLOAD_DIR });

// In-memory line indexes: { fileId: [byteOffset0, byteOffset1, ...] }
// For very large files, this should be stored on disk or sparse (every 100th line).
// optimizing to store every 100th line to save memory.
const fileIndexes = new Map();
const INDEX_INTERVAL = 100; // Store offset every 100 lines

// File Metadata
const fileMeta = new Map();

// Helper: Build Index
const buildIndex = async (filePath, fileId) => {
    console.log(`Building index for ${fileId}...`);
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const offsets = [0]; // Line 1 starts at 0
    let currentByte = 0;
    let lineCount = 0;

    // Note: readline strips newlines, so we need to add length + 1 (or 2 for CRLF)
    // Precise byte counting with readline is tricky because encoding/stripping.
    // Better approach: Read raw buffer and scan for \n.

    // Switching to Buffer scan for precision
    fileStream.destroy();

    return new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath);
        let byteOffset = 0;
        let lineCounter = 0;
        const index = [0]; // Offset for Line 0

        stream.on('data', (chunk) => {
            for (let i = 0; i < chunk.length; i++) {
                if (chunk[i] === 10) { // \n
                    lineCounter++;
                    byteOffset++; // Include \n in current line, next line starts after
                    if (lineCounter % INDEX_INTERVAL === 0) {
                        index.push(byteOffset);
                    }
                } else {
                    byteOffset++;
                }
            }
        });

        stream.on('end', () => {
            fileIndexes.set(fileId, index);
            fileMeta.set(fileId, { lineCount: lineCounter, size: byteOffset });
            console.log(`Index built for ${fileId}: ${lineCounter} lines`);
            resolve();
        });

        stream.on('error', reject);
    });
};

// API: Upload
app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded');

    const fileId = req.file.filename;
    const filePath = req.file.path;

    try {
        await buildIndex(filePath, fileId);
        res.json({
            id: fileId,
            name: req.file.originalname,
            size: req.file.size,
            lineCount: fileMeta.get(fileId).lineCount
        });
    } catch (e) {
        console.error(e);
        res.status(500).send('Indexing failed');
    }
});

// API: Get Lines (Paging)
app.get('/files/:id/lines', (req, res) => {
    const { id } = req.params;
    const startLine = parseInt(req.query.start) || 0;
    const endLine = parseInt(req.query.end) || 100;

    if (!fileIndexes.has(id)) return res.status(404).send('File not found');

    const index = fileIndexes.get(id);
    const meta = fileMeta.get(id);

    // Calculate Byte Range
    // Index stores every 100th line.
    // Find nearest checkpoint BEFORE startLine
    const startIndexIdx = Math.floor(startLine / INDEX_INTERVAL);
    const startByte = index[startIndexIdx]; // This is offset of line (startIndexIdx * 100)

    // We need to support reading exact lines. 
    // This simple sparse index implementation requires reading from checkpoint and counting \n.

    const filePath = path.join(UPLOAD_DIR, id);
    const stream = fs.createReadStream(filePath, { start: startByte });

    let currentLine = startIndexIdx * INDEX_INTERVAL;
    let lines = [];
    let buffer = '';

    stream.on('data', (chunk) => {
        const str = buffer + chunk.toString(); // Naive string conversion (utf8 assumed)
        const parts = str.split('\n');
        buffer = parts.pop(); // Keep partial

        for (let line of parts) {
            if (currentLine >= startLine && currentLine < endLine) {
                lines.push(line);
            }
            currentLine++;
            if (currentLine >= endLine) {
                stream.destroy();
                return res.json({ lines, total: meta.lineCount });
            }
        }
    });

    stream.on('end', () => {
        if (currentLine >= startLine && currentLine < endLine && buffer) {
            lines.push(buffer);
        }
        res.json({ lines, total: meta.lineCount });
    });
});

// API: Search (Streamed)
app.get('/files/:id/search', (req, res) => {
    const { id } = req.params;
    const query = req.query.q;
    const regex = req.query.regex === 'true';

    if (!fileIndexes.has(id)) return res.status(404).send('File not found');

    const filePath = path.join(UPLOAD_DIR, id);
    const stream = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    res.setHeader('Content-Type', 'application/json');
    res.write('{"matches":['); // Stream JSON manually

    let first = true;
    let lineIdx = 0;
    let re;
    try {
        re = new RegExp(regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); // Case insensitive default
    } catch (e) { return res.status(400).send('Invalid Regex'); }

    rl.on('line', (line) => {
        if (re.test(line)) {
            if (!first) res.write(',');
            res.write(JSON.stringify({ index: lineIdx, content: line.substring(0, 500) })); // Truncate content for search results
            first = false;
        }
        lineIdx++;
    });

    rl.on('close', () => {
        res.write(']}');
        res.end();
    });
});

app.listen(PORT, () => {
    console.log(`LogLayer Server running on port ${PORT}`);
});
