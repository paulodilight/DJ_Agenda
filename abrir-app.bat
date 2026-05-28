@echo off
cd /d "C:\Users\dj\OneDrive\Claude\dj-schedule"
start "DJ Schedule" cmd /k npm run dev
timeout /t 4 /nobreak > nul
start http://localhost:5173
