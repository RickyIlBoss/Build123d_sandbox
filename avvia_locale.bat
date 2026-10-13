@echo off
title Build123d Sandbox
cd /d "%~dp0\frontend"

echo =======================================================
echo    Avvio Build123d Sandbox (WebAssembly in-browser)
echo    Nessun backend Python locale richiesto!
echo =======================================================
echo.

echo Avvio del server di sviluppo Vite...
timeout /t 2 /nobreak >nul
start http://localhost:5173
npm run dev
