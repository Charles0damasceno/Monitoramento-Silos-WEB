# Changelog

## 2.4.0 — 2026-11-03

### Novo
- **Instaladores:** Windows (`instalar.bat` → assistente com instalação do Node.js pelo winget, `.env` com acesso restrito, diagnóstico, administrador, firewall, serviço e atalho) e Linux (`instalar.sh` → usuário de sistema, serviço systemd com proteções, ufw/firewalld). Ambos atualizam sem apagar dados e aceitam instalação automatizada (`CFG_*`, `PAINEL_SENHA`). Desinstaladores para os dois.
- **Pacotes de distribuição:** `npm run pacote` gera `.zip` (Windows) e `.tar.gz` (Linux) com o site já compilado, sem `.env`, dados ou usuários.
- **`npm run diagnostico`:** confere conexão, permissões do usuário do banco, tabela e colunas, valores atuais, temperatura, porta, usuários, pastas e Telegram antes de entrar em produção.
- `docs/mysql-usuario-somente-leitura.sql`: cria o usuário `painel_silos` só com `SELECT`.
- **Silo vazio** deixa de ser alarme: estados *Vazio* e *Enchendo* (informativos); alarmes de nível baixo só quando o nível desce a partir do normal (`SILO_VAZIO_PCT`).
- `npm run usuario -- papel <usuario> admin|operador`.

### Correções
- Atualizar extraindo um pacote por cima não apaga mais o cadastro de silos feito pela tela (`config/*.padrao.json`).

## 2.3.0 — 2026-11-03

### Novo
- **Tela de Configurações** (somente administradores): silos (cadastro aplicado na hora, sem reiniciar, com cópia da versão anterior), usuários (criar, editar, trocar senha, remover, com travas do último admin e do próprio usuário), alertas (status e teste do Telegram), sistema (parâmetros e backup manual) e auditoria.
- **Auditoria:** registra logins, senhas incorretas, alterações de silos e usuários, testes do Telegram, backups manuais e reconhecimento de alarmes, com usuário e IP.
- `npm run dev` sobe a API e o site juntos; `.claude/launch.json` com a configuração "painel".
- O cadastro recusa dois silos usando a mesma coluna e a reutilização do id de um silo removido que tem histórico.

## 2.2.0 — 2026-11-03

### Novo
- **Alertas no Telegram:** alarmes críticos e falta de comunicação chegam num grupo, com botão "Reconhecer", lembrete enquanto ninguém reconhece, aviso de normalização e comando `/status`. Fila de reenvio quando falta internet. Configuração com `npm run telegram -- descobrir | testar`.
- **Temperatura dos silos** (tabela `temperatura_silo`): valor no cartão, alarme crítico acima de `maxC` com histerese de 0,5 °C, histórico e gráfico de temperatura; leitura velha aparece como desatualizada.
- **Anomalias:** "leitura suspeita" (salto impossível entre leituras) e "níveis congelados" (IHM pode ter parado de gravar).
- **Relatórios** por turno/dia: início, fim, mín./máx., entrada e saída estimadas, temperatura, alarmes, cobertura dos dados; exportação para Excel (CSV) e impressão/PDF.
- **Painel da fábrica:** ultrafiltração 1/2, queijomáticas e recepção de leite, sempre com a idade de cada dado e diagnóstico da qualidade da gravação.
- **Backup diário** do histórico e dos usuários (`VACUUM INTO`), com retenção e pasta de rede opcional.
- Navegação por abas (Silos · Relatórios · Fábrica) com endereço próprio (`#/relatorios`).
- **Identidade visual HE Laticínios + Althium Ingredients:** logos no cabeçalho (versão branca no tema escuro), na tela de login (com as ondas verde/vinho) e no relatório impresso; verde HE `#00782c` como cor principal e vinho Althium `#a40044` como destaque. Os alarmes continuam em âmbar e vermelho-alaranjado, distintos do vinho. Tema claro passa a ser o padrão.
- **Tela adaptável do celular à TV 4K:** fonte base fluida (14 px no celular até ~25 px em 4K), cartões em 1/2/3 colunas conforme a largura, tanque e números proporcionais à tela, cabeçalho e abas que se reorganizam no celular, sem rolagem lateral. Ícones para instalar o painel na tela inicial do celular/tablet.
- Documentação de monitoramento externo (`/api/saude`) e acesso remoto por VPN.

## 2.1.0 — 2026-11-03

### Novo
- **Leitura independente por silo:** uma coluna inexistente ou com valor inválido deixa só aquele silo como "Sem leitura"; antes, derrubava a leitura de todos.
- **Detecção de silo novo:** o painel relê a estrutura da tabela a cada 5 min e avisa (faixa para admins + evento) quando há coluna numérica no banco que não está em `config/silos.json`.
- `ARQUIVO_SILOS` no `.env` permite apontar outro arquivo de cadastro (útil para testes).

### Correções
- O resumo geral somava a capacidade de silos sem leitura no "espaço livre".
- Com a porta ocupada, o log mostrava "Painel de silos em …" antes do erro (o callback do `listen` do Express 5 também é chamado em erro).

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
