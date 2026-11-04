@echo off
rem Desinstala o servico do Painel de Silos (os dados sao mantidos).
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0desinstalar.ps1" %*
