@echo off
title Apoio Tecnico - DJ Schedule (:5173)
cd /d "%~dp0"
netstat -ano | findstr ":5173 " | findstr LISTENING >nul
if %errorlevel%==0 (
  echo Servidor DJ Schedule ja a correr - a abrir a app Apoio Tecnico...
  start "" http://localhost:5173/apoiot/login
) else (
  echo A iniciar DJ Schedule e a abrir a app Apoio Tecnico...
  call npm run dev -- --open /apoiot/login
  pause
)
