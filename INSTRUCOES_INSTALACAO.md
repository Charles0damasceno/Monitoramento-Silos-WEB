# Instruções de Instalação - Sistema Medidor de Silos

## Pré-requisitos

Antes de iniciar a instalação, certifique-se de ter instalado:

1. **Node.js** (versão 14 ou superior)
   - Download: https://nodejs.org/
   - Durante a instalação, mantenha as opções padrão

2. **MySQL** (versão 8.0 ou superior)
   - Download: https://dev.mysql.com/downloads/installer/
   - Durante a instalação:
     - Escolha "Server only" ou "Custom" installation
     - Defina uma senha para o usuário root
     - Mantenha as outras opções padrão

## Instalação Automática

1. Execute o arquivo `install.bat` com duplo clique
2. O instalador irá:
   - Verificar se o Node.js e MySQL estão instalados
   - Instalar todas as dependências do frontend e backend
   - Criar o arquivo de configuração .env

## Instalação Manual

Se preferir instalar manualmente:

1. Abra o terminal na pasta do projeto
2. Instale as dependências do frontend:
   ```bash
   cd src
   npm install
   ```
3. Instale as dependências do backend:
   ```bash
   cd ../server
   npm install
   ```
4. Crie um arquivo `.env` na pasta `server` com o seguinte conteúdo:
   ```
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=sua_senha_mysql
   DB_NAME=medidor_silos
   PORT=12322
   ```

## Configuração do Banco de Dados

1. Abra o MySQL Workbench ou linha de comando do MySQL
2. Execute os seguintes comandos:
   ```sql
   CREATE DATABASE medidor_silos;
   USE medidor_silos;
   ```
3. Importe o arquivo de estrutura do banco de dados (se disponível)

## Iniciando o Sistema

1. Inicie o MySQL (se não estiver rodando)
2. Inicie o backend:
   ```bash
   cd server
   npm start
   ```
3. Em outro terminal, inicie o frontend:
   ```bash
   cd src
   npm start
   ```
4. Acesse o sistema em: http://localhost:3000

## Solução de Problemas

Se encontrar algum erro durante a instalação:

1. Verifique se o Node.js e MySQL estão instalados corretamente
2. Certifique-se de que as portas 3000 (frontend) e 12322 (backend) estão disponíveis
3. Verifique se o MySQL está rodando
4. Verifique se as credenciais no arquivo .env estão corretas

## Suporte

Em caso de problemas, entre em contato com o suporte técnico. 