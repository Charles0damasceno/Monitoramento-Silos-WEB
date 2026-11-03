# Sistema de Monitoramento de Silos de Leite

Este projeto é um sistema web completo para monitoramento em tempo real da quantidade de leite em silos, com visualização gráfica, alertas e painel responsivo.

## Funcionalidades
- Visualização em tempo real da quantidade de leite em cada silo
- Gráfico comparativo entre capacidade total e quantidade atual
- Indicadores visuais de preenchimento
- Alertas automáticos para silos quase cheios ou quase vazios
- Painel de alertas recentes
- Interface responsiva (funciona em desktop, tablet e celular)
- Backend integrado com banco de dados MySQL

---

## Estrutura do Projeto

```
medidor-silos-leite/
├── server/           # Backend Node.js (Express + MySQL)
│   └── index.js      # Código principal do servidor
├── src/              # Frontend React
│   ├── App.js        # Componente principal da interface
│   └── services/
│       └── api.js    # Configuração do Axios para chamadas à API
├── package.json      # Configuração do frontend React
├── README.md         # Este arquivo
└── ...
```

---

## Pré-requisitos
- Node.js (versão 14 ou superior)
- npm (gerenciador de pacotes do Node.js)
- MySQL (banco de dados já configurado e acessível)

---

## Instalação e Execução

### 1. Clone o repositório
```bash
git clone <url-do-repositorio>
cd medidor-silos-leite
```

### 2. Instalação das dependências necessárias

#### **Windows**
- Baixe e instale o Node.js (inclui o npm): [https://nodejs.org/](https://nodejs.org/)
- Instale o MySQL: [https://dev.mysql.com/downloads/installer/](https://dev.mysql.com/downloads/installer/)
- Após instalar, siga os passos abaixo:

```bash
cd server
npm install
cd ..
npm install
```

#### **Linux (Ubuntu/Debian)**
- Instale o Node.js e npm:
```bash
sudo apt update
sudo apt install nodejs npm -y
```
- Instale o MySQL Server:
```bash
sudo apt install mysql-server -y
```
- Siga os passos abaixo para instalar as dependências do projeto:
```bash
cd server
npm install
cd ..
npm install
```

---

### 3. Configuração do Backend (Node.js)

- Configure as variáveis de ambiente (opcional):
  - Você pode criar um arquivo `.env` na pasta `server` para definir porta, host, usuário e senha do banco.
  - Por padrão, o sistema já está configurado para um banco MySQL local.

- Inicie o backend:
```bash
node index.js
```
- O servidor irá rodar na porta 12322 (ou próxima disponível).

### 4. Configuração do Frontend (React)

Abra outro terminal na raiz do projeto:
```bash
npm start
```
- O frontend irá rodar em `http://localhost:3000` (ou próxima porta disponível).
- O proxy já está configurado para redirecionar as chamadas `/api` para o backend.

---

## Banco de Dados
- O sistema espera uma tabela chamada `silo` com os campos `Silo1`, `Silo2`, `Silo3` (quantidade de cada silo).
- A capacidade máxima de cada silo está definida no código (100.000 litros por padrão).
- Se quiser alterar a capacidade, edite o array de silos no backend.

---

## Detalhes Técnicos e Manutenção

### Backend (`server/index.js`)
- **Express**: Servidor HTTP e rotas da API.
- **MySQL2**: Conexão com banco de dados.
- **CORS**: Permite acesso do frontend.
- **Rotas principais:**
  - `/api/test` — Teste de funcionamento do backend
  - `/api/silos` — Retorna os dados atuais dos silos
  - `/api/status` — Status do servidor e conexão com o banco
- **Alertas**: O backend retorna os dados dos silos e o frontend gera alertas visuais se algum silo estiver quase cheio ou quase vazio.
- **Mock de dados**: Se houver erro de conexão, dados fictícios são retornados.

### Frontend (`src/App.js`)
- **React**: Interface principal.
- **Material-UI**: Componentes visuais e responsividade.
- **Chart.js**: Gráficos de barras para visualização dos silos.
- **Axios**: Comunicação com o backend.
- **Alertas**: Exibe alertas visuais e painel de alertas recentes.
- **Responsividade**: Layout adaptado para mobile e desktop.

### Como funciona a atualização dos dados
- A cada 4 segundos, o frontend consulta o backend para atualizar os dados dos silos.
- O loading só aparece no carregamento inicial, evitando "piscar" na tela.
- Se algum silo estiver quase cheio (≥90%) ou quase vazio (≤10%), um alerta visual é exibido e registrado no painel de alertas recentes.

### Como alterar configurações
- **Porta do backend**: Edite a variável `PORT` no `server/index.js` ou defina no `.env`.
- **Proxy do frontend**: Edite o campo `proxy` no `package.json`.
- **Capacidade dos silos**: Edite o array de silos no backend.
- **Intervalo de atualização**: Altere o valor do `setInterval` no `App.js`.

### Como adicionar novas funcionalidades
- Siga o padrão de componentes React para novas telas.
- Adicione novas rotas no backend conforme necessário.
- Use o Material-UI para manter o visual consistente.

---

## Dicas para manutenção
- Sempre reinicie o backend após alterar rotas ou lógica do servidor.
- O frontend recarrega automaticamente ao salvar arquivos, mas reinicie se mudar o `package.json`.
- Mantenha as dependências atualizadas com `npm update`.
- Documente qualquer alteração importante neste README.

---

## Suporte
Se tiver dúvidas ou precisar de ajuda, consulte este README ou entre em contato com o desenvolvedor responsável.

---

**Bom uso e boa manutenção!** 