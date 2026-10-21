@echo off
title Actualizar Trade Journal
cd /d "%~dp0"
echo Antes de seguir, cierra la ventana del Trade Journal si la tienes abierta.
echo Tus datos no se tocan: solo se actualiza el programa.
pause

git pull
if errorlevel 1 (
  echo No se ha podido descargar la actualizacion. Revisa tu conexion a internet.
  pause
  exit /b 1
)
call pnpm install
call pnpm build
if errorlevel 1 (
  echo Algo ha fallado al preparar el journal. Haz una captura de esta ventana.
  pause
  exit /b 1
)

echo.
echo Listo. Ya puedes abrir el journal con "Abrir Trade Journal".
pause
