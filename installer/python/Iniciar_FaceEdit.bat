@echo off
rem Inicia FaceEdit sin ventana de consola (pythonw). Los mensajes van a
rem %LOCALAPPDATA%\FaceEdit\faceedit.log
set "FE=%LOCALAPPDATA%\FaceEdit"
if not exist "%FE%\venv\Scripts\pythonw.exe" (
  echo FaceEdit no esta instalado. Ejecuta Instalar.bat primero.
  pause
  exit /b 1
)
start "" "%FE%\venv\Scripts\pythonw.exe" "%FE%\app\run_app.py"
