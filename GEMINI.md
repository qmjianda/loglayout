# Gemini Code Assistant Context

This document provides context for the Gemini Code Assistant to understand the LogLayer project.

## Project Overview

LogLayer is a high-performance log analysis tool designed for large log files. It features a Python backend and a React frontend.

- **Backend:** The backend is built with Python and FastAPI, serving a web-based UI. It uses `pywebview` to create a native desktop window for the frontend. A key feature is its ability to handle large files efficiently using `mmap` and multi-threaded indexing. It also integrates with `ripgrep` for fast searching.

- **Frontend:** The frontend is a single-page application built with React, TypeScript, and Vite. It uses Tailwind CSS for styling. The UI is designed to be fast and responsive, with features like virtual scrolling to handle large amounts of data.

- **Architecture:** The application runs as a desktop application. The Python backend starts a web server and a native window, which loads the React frontend. The frontend and backend communicate via WebSockets.

## Building and Running

### Prerequisites

- **Node.js**: v18+
- **Python**: v3.10+

### Installation

1.  **Install frontend dependencies:**
    ```bash
    npm install
    ```

2.  **Install backend dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

### Running the Application

The application is run in development mode by starting the frontend and backend servers separately.

1.  **Start the frontend server:**
    ```bash
    npm run dev
    ```

2.  **Start the backend server:**
    ```bash
    python backend/main.py
    ```

### Building for Production

The application can be packaged into a standalone distribution.

- **Build the frontend:**
  ```bash
  npm run build
  ```
- **Package the application:**
  ```bash
  python tools/package_offline.py
  ```

## Development Conventions

- **Backend:**
  - The backend code is located in the `backend/` directory.
  - It follows standard Python coding conventions.
  - Dependencies are managed with `pip` and `requirements.txt`.

- **Frontend:**
  - The frontend code is in the `frontend/` directory.
  - It uses TypeScript and follows standard React best practices.
  - Dependencies are managed with `npm` and `package.json`.
  - The project uses Vite for development and building.

- **Testing:**
  - The project includes a `tests/` directory, suggesting a suite of tests.
  - The tests appear to be a mix of unit, integration, and benchmark tests, written using `pytest`.
  - To run tests, use the `pytest` command.
