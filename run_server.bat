@echo off
cd /d "F:\SIGAP 2025"
echo Installing node modules (if missing)...
if not exist node_modules (
  npm init -y
  npm install express multer unzipper cors uuid pg
)
echo Starting server...
start cmd /k "node server.js"
timeout /t 1 > nul
echo Opening browser...
start "" "http://localhost:3000/index.html"
pause
