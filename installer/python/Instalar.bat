@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Instalador de FaceEdit

set "SRC=%~dp0"
set "DEST=%LOCALAPPDATA%\FaceEdit"
set "PY="

echo ============================================================
echo   Instalador de FaceEdit
echo ============================================================
echo.
echo Se instalara en: %DEST%
echo Necesita internet solo durante esta instalacion.
echo.

rem ---- 1. Buscar Python 3.11 o superior -------------------------------
for %%C in (py python) do (
  if not defined PY (
    %%C -c "import sys; sys.exit(0 if sys.version_info>=(3,11) else 1)" >nul 2>&1 && set "PY=%%C"
  )
)

if not defined PY (
  echo No se encontro Python 3.11 o superior. Instalando Python con winget...
  winget install -e --id Python.Python.3.14 --scope user --silent --accept-package-agreements --accept-source-agreements
  for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python3*") do (
    if exist "%%D\python.exe" set "PY=%%D\python.exe"
  )
)

if not defined PY (
  echo.
  echo [ERROR] No se pudo encontrar ni instalar Python.
  echo Instala Python 3.11 o superior desde https://www.python.org/downloads/
  echo ^(marca "Add python.exe to PATH"^) y vuelve a ejecutar este instalador.
  goto :fin
)
echo Python encontrado: %PY%

rem ---- 2. Copiar la aplicacion ----------------------------------------
echo.
echo [1/3] Copiando archivos...
robocopy "%SRC%." "%DEST%\app" /E /XF Instalar.bat Desinstalar.bat /XD __pycache__ /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (
  echo [ERROR] No se pudieron copiar los archivos.
  goto :fin
)

rem ---- 3. Entorno virtual y librerias ---------------------------------
echo [2/3] Preparando Python y librerias ^(unos minutos^)...
if not exist "%DEST%\venv\Scripts\python.exe" (
  "%PY%" -m venv "%DEST%\venv"
  if errorlevel 1 (
    echo [ERROR] No se pudo crear el entorno de Python.
    goto :fin
  )
)
"%DEST%\venv\Scripts\python.exe" -m pip install --upgrade pip -q
"%DEST%\venv\Scripts\python.exe" -m pip install -r "%DEST%\app\requirements.txt" -q
if errorlevel 1 (
  echo [ERROR] Fallo la instalacion de las librerias. Revisa tu conexion a internet.
  goto :fin
)

rem ---- 4. Lanzador en el escritorio -----------------------------------
echo [3/3] Creando acceso en el escritorio...
copy /y "%SRC%Iniciar_FaceEdit.bat" "%DEST%\FaceEdit.bat" >nul
set "DESK=%USERPROFILE%\Desktop"
if exist "%OneDrive%\Desktop" set "DESK=%OneDrive%\Desktop"
copy /y "%SRC%Iniciar_FaceEdit.bat" "%DESK%\FaceEdit.bat" >nul

echo.
echo ============================================================
echo   Instalacion completada.
echo   Abre FaceEdit con el archivo "FaceEdit" de tu escritorio.
echo   La primera vez te pedira los datos de tu camara Tapo
echo   ^(IP, usuario y contrasena de la cuenta de camara^).
echo ============================================================
if not "%FACEDIT_NOLAUNCH%"=="1" call "%DEST%\FaceEdit.bat"

:fin
echo.
if not "%FACEDIT_SILENT%"=="1" pause
endlocal
