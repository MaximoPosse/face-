@echo off
setlocal
chcp 65001 >nul
title Desinstalar FaceEdit
set "DEST=%LOCALAPPDATA%\FaceEdit"
echo Se borrara FaceEdit y su configuracion de camara de:
echo   %DEST%
echo.
choice /m "Continuar"
if errorlevel 2 goto :fin

taskkill /f /im pythonw.exe /fi "WINDOWTITLE eq FaceEdit*" >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5000 " ^| findstr LISTENING') do taskkill /f /pid %%P >nul 2>&1

rd /s /q "%DEST%"
del /q "%USERPROFILE%\Desktop\FaceEdit.bat" 2>nul
if exist "%OneDrive%\Desktop\FaceEdit.bat" del /q "%OneDrive%\Desktop\FaceEdit.bat"
echo FaceEdit desinstalado.
:fin
pause
endlocal
