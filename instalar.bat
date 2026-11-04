@echo off
rem Instalador do Painel de Silos: dois cliques neste arquivo.
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1" %*
if errorlevel 1 pause
