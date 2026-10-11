@echo off
title Trade Journal (no cierres esta ventana mientras lo uses)
cd /d "%~dp0"

rem Si todavia no se ha preparado la version rapida, se hace una sola vez.
if not exist "apps\web\.next\BUILD_ID" (
  echo Preparando el journal por primera vez, tarda unos minutos...
  call pnpm install
  call pnpm build
)

rem Abre el navegador unos segundos despues, cuando el journal ya esta listo.
start "" cmd /c "timeout /t 5 >nul & start http://localhost:3000"

echo Trade Journal funcionando en http://localhost:3000
echo Para cerrarlo, cierra esta ventana.
call pnpm start
