# LogLayer Backend Server

This is a lightweight Node.js server designed to handle large log files (800MB+) efficiently using streams and sparse indexing.

## Setup

1. Open a terminal in this directory:
   ```bash
   cd server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

The server will run on `http://localhost:3001`.

## Usage

Currently, this server operates as a standalone "Performance Kit". 
Future updates to the LogLayer Frontend will integrate this server directly.

### testing
You can test the server using `curl`:

**Upload a larger file:**
```bash
curl -F "file=@/path/to/large.log" http://localhost:3001/upload
```

**Get Lines (Paging):**
```bash
# file-id is returned in the upload response
curl "http://localhost:3001/files/<file-id>/lines?start=0&end=100"
```

## Architecture
- **Streaming**: Uploads are streamed to disk.
- **Indexing**: A sparse index is built during upload (every 100 lines) to allow fast random access.
- **Memory**: Memory usage is O(1) relative to file size, allowing 800MB+ files to be processed on constrained hosts.
