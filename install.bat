@echo off
echo Instalador do Sistema Medidor de Silos
echo ====================================
echo.

REM Verificar se o Node.js está instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js nao encontrado. Por favor, instale o Node.js antes de continuar.
    echo Voce pode baixar o Node.js em: https://nodejs.org/
    pause
    exit /b 1
)

REM Verificar se o MySQL está instalado
where mysql >nul 2>nul
if %errorlevel% neq 0 (
    echo MySQL nao encontrado. Por favor, instale o MySQL antes de continuar.
    echo Voce pode baixar o MySQL em: https://dev.mysql.com/downloads/installer/
    pause
    exit /b 1
)

echo Instalando dependencias do frontend...
cd src
call npm install
if %errorlevel% neq 0 (
    echo Erro ao instalar dependencias do frontend
    pause
    exit /b 1
)

echo Instalando dependencias do backend...
cd ../server
call npm install
if %errorlevel% neq 0 (
    echo Erro ao instalar dependencias do backend
    pause
    exit /b 1
)

echo Criando arquivo .env...
echo DB_HOST=localhost > .env
echo DB_USER=root >> .env
echo DB_PASSWORD= >> .env
echo DB_NAME=medidor_silos >> .env
echo PORT=12322 >> .env

echo.
echo Instalacao concluida com sucesso!
echo.
echo Para iniciar o sistema:
echo 1. Inicie o MySQL
echo 2. Execute 'npm start' na pasta src para iniciar o frontend
echo 3. Execute 'npm start' na pasta server para iniciar o backend
echo.
pause 