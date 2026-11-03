# Changelog

## 2.0.0 — 2026-11-03

Reescrita completa, mantendo a mesma fonte de dados (tabela `silo` da IHM no MySQL).

### Segurança
- Senha do MySQL removida do código (estava em `server/index.js` e `server/testMySQL.js`); agora só no `.env`.
- Login com usuário e senha (`scrypt`), sessões revogáveis, limite de tentativas e proteção CSRF.
- `/api/status` não expõe mais IP e nome do banco; cabeçalhos de segurança (Helmet/CSP).

### Correções
- **Dados fictícios nunca mais aparecem como reais.** Antes, uma falha no banco fazia o painel mostrar 75 000 / 50 000 / 25 000 L. Agora mostra "SEM COMUNICAÇÃO" com o último valor real congelado.
- O botão de notificações não desligava os alertas (estado capturado no `setInterval`), e o mesmo alerta era repetido a cada 4 s. Alarmes agora são gerados no servidor, só na mudança de estado, com histerese.
- O servidor trocava de porta sozinho quando a 12322 estava ocupada, deixando o site apontando para a porta errada. Agora a porta é fixa e o erro é claro.
- Consulta com `ORDER BY` explícito (antes pegava "a última de 50 linhas" sem ordem definida).
- Instruções de instalação mandavam rodar `npm install` dentro de `src/`.

### Novo
- Visual industrial (ISA-101): tanques em SVG com marcas de limite, tema escuro/claro, modo TV.
- Vazão (L/h) e previsão de quando cada silo enche ou esvazia.
- Histórico local (SQLite) com gráfico de 1 h a 30 dias.
- Registro de alarmes/eventos com reconhecimento pelo operador.
- Atualização em tempo real por Server-Sent Events: uma consulta ao banco por intervalo, qualquer que seja o número de telas abertas.
- Capacidades e limites configuráveis em `config/silos.json`.
- Serviço do Windows, instalador `instalar.ps1`, logs diários, rota de saúde para monitoramento.
- Testes automáticos do servidor (22 casos).
- Migração de Create React App (descontinuado) para Vite; React 19, MUI 7, Express 5.

## 1.0.0 — 2025-05

Versão original (React + Express), importada no primeiro commit.
