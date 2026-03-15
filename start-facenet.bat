@echo off
setlocal EnableDelayedExpansion
title FaceNet Unified Launcher
color 0A

echo.
echo  ███████╗ █████╗  ██████╗███████╗███╗   ██╗███████╗████████╗
echo  ██╔════╝██╔══██╗██╔════╝██╔════╝████╗  ██║██╔════╝╚══██╔══╝
echo  █████╗  ███████║██║     █████╗  ██╔██╗ ██║█████╗     ██║
echo  ██╔══╝  ██╔══██║██║     ██╔══╝  ██║╚██╗██║██╔══╝     ██║
echo  ██║     ██║  ██║╚██████╗███████╗██║ ╚████║███████╗   ██║
echo  ╚═╝     ╚═╝  ╚═╝ ╚═════╝╚══════╝╚═╝  ╚═══╝╚══════╝   ╚═╝
echo           Unified Full-Stack AI Surveillance System
echo  =========================================================
echo.

set PYTHON=C:\Users\Trinity\AppData\Local\Programs\Python\Python313\python.exe
set FACENET_DIR=F:\FaceNet
set NODE_DIR=F:\FaceNet-Node

:: ─── 1. Flask Logger (port 5000) ───────────────────────────
echo  [1/5] Starting Flask Anomaly Logger    (port 5000)...
start "FaceNet - Flask Logger :5000" cmd /k "cd /d %FACENET_DIR% && %PYTHON% flask_logger.py"
timeout /t 2 /nobreak >nul

:: ─── 2. YOLO + Gemma inference (port 8000) ─────────────────
echo  [2/5] Starting YOLO + Gemma Server     (port 8000)...
start "FaceNet - YOLO Server :8000" cmd /k "cd /d %FACENET_DIR% && uvicorn yolo_server:app --host 0.0.0.0 --port 8000 --reload"
timeout /t 3 /nobreak >nul

:: ─── 3. MCP HTTP server (port 3333) ────────────────────────
echo  [3/5] Starting MCP HTTP Server         (port 3333)...
start "FaceNet - MCP HTTP :3333" cmd /k "cd /d %FACENET_DIR% && node facenet_https.js"
timeout /t 2 /nobreak >nul

:: ─── 4. MCP stdio (for LobeHub desktop) ────────────────────
echo  [4/5] Starting MCP stdio Server        (stdio)...
start "FaceNet - MCP stdio" cmd /k "cd /d %FACENET_DIR% && %PYTHON% facenet_mcp.py 2> %FACENET_DIR%\mcp_error.log"
timeout /t 1 /nobreak >nul

:: ─── 5. Express API + Vite dev frontend ────────────────────
echo  [5/5] Starting Express API + React UI  (port 3000 / 3001)...
start "FaceNet - Express :3001" cmd /k "cd /d %NODE_DIR% && npm run server"
timeout /t 2 /nobreak >nul
start "FaceNet - Vite Dev :3000" cmd /k "cd /d %NODE_DIR% && npm run dev"

echo.
echo  =========================================================
echo   All services launched!
echo.
echo   React UI       →  https://localhost:3000
echo   Express API    →  http://localhost:3001
echo   YOLO Server    →  http://localhost:8000
echo   Flask Logger   →  http://localhost:5000
echo   MCP HTTP       →  http://localhost:3333/mcp
echo  =========================================================
echo.
pause
