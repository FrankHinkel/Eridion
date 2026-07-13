@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0eridionWindowsBuild.ps1"
exit /b %ERRORLEVEL%

