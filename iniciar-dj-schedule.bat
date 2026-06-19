@echo off
title DJ Schedule - http://localhost:5173/
cd /d "%~dp0"
netstat -ano | findstr ":5173 " | findstr LISTENING >nul
if %errorlevel%==0 (
  echo Servidor DJ Schedule ja a correr - a abrir...
  start "" http://localhost:5173/
) else (
  echo Iniciando DJ Schedule em http://localhost:5173/ ...
  call npm run dev -- --open
  pause
)
