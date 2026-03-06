@echo off
echo ============================================
echo   FaceNet Pro - React + Python + Neon
echo ============================================
echo.

echo [1/2] Starting Python API Engine...
start "FaceNet API" cmd /k "cd /d C:\Users\Trinity\Desktop\projects\vibe_code && pip install -r requirements.txt -q && python main.py"

echo [2/2] Launching React Pro UI...
start "FaceNet UI" cmd /k "cd /d C:\Users\Trinity\Desktop\projects\faceapp\FaceNet-app-main && npm run dev"

echo.
echo --------------------------------------------
echo   UI:  http://localhost:3000
echo   API: http://localhost:5000
echo --------------------------------------------
pause
