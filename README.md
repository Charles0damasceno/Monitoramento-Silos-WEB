# Painel de Silos

Painel web de **nível dos silos de leite**, em tempo real, para a sala de controle e para qualquer computador ou celular da rede da fábrica.

Ele lê o nível que a IHM Weintek grava no MySQL (só leitura), mostra cada silo como um tanque, calcula a vazão e a previsão de cheio/vazio, guarda o histórico e registra alarmes com reconhecimento pelo operador.

| | |
|---|---|
| **Tempo real** | Leitura a cada 2 s, enviada às telas por *Server-Sent Events* (sem recarregar a página) |
| **Alarmes** | Muito baixo / Baixo / Alto / Muito alto por silo, com histerese e reconhecimento |
| **Tendência** | Vazão em L/h e "cheio em 2 h 15 min (≈ 22:40)" |
| **Histórico** | Gráfico de 1 h a 30 dias, guardado localmente por 180 dias |
| **Comunicação** | Se o banco da IHM cair, o painel avisa e marca os valores como congelados — nunca mostra dado inventado |
| **Acesso** | Login com usuário e senha, sessão de 30 dias (a TV não precisa logar de novo) |
| **Modo TV** | Tela cheia só com os tanques, para o monitor da sala de controle |

---

## Como funciona

```
 IHM Weintek ──grava──▶ MySQL (weintek.silo)          (o painel só LÊ este banco)
                              │  1 consulta a cada 2 s
                              ▼
                     Servidor do painel (Node.js)
                     ├─ regras de nível e alarme
                     ├─ histórico/eventos/sessões ──▶ data/historico.db (SQLite)
                     └─ site + API, porta 12322
                              │  Server-Sent Events
                              ▼
               Navegadores: sala de controle, escritório, celular
```

Todas as telas recebem a mesma leitura: com 1 ou 20 navegadores abertos, o banco da IHM recebe **uma** consulta por intervalo.

## Instalação (Windows)

Pré-requisito: **Node.js 22 LTS** (22.13 ou mais novo) — https://nodejs.org/

1. Copie a pasta do projeto para o computador servidor (ex.: `C:\PainelSilos`).
2. Abra o **PowerShell como administrador** nessa pasta e rode:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\instalar.ps1
   ```
3. Na primeira vez ele cria o `.env` e abre o Bloco de Notas: preencha `DB_USER` e `DB_PASSWORD` do MySQL da IHM, salve e rode o instalador de novo.
4. O instalador compila o site, roda os testes, pede o primeiro usuário, libera a porta no firewall e instala o **serviço "Painel de Silos"**, que inicia junto com o Windows e reinicia sozinho se cair.

Acesse `http://<ip-do-servidor>:12322`.

> **Usuário do MySQL:** use um usuário com permissão **somente de SELECT** na tabela `silo`. O painel não precisa (e não deve) poder gravar no banco da IHM.

## Uso do dia a dia

| Tarefa | Comando (na pasta do projeto) |
|---|---|
| Listar usuários | `npm run usuario -- listar` |
| Criar operador | `npm run usuario -- adicionar maria --nome "Maria Souza"` |
| Criar administrador | `npm run usuario -- adicionar joao --admin` |
| Trocar senha | `npm run usuario -- senha maria` (encerra as sessões abertas) |
| Remover usuário | `npm run usuario -- remover maria` |
| Reiniciar o serviço | `npm run servico -- reiniciar` (como administrador) |
| Remover o serviço | `npm run servico -- remover` (como administrador) |

Os logs ficam em `logs\AAAA-MM-DD.log` (30 dias).

## Configuração

**`.env`** — conexão com o banco, porta, intervalos, retenção e login. Todas as opções estão comentadas no [.env.example](.env.example). Depois de alterar, reinicie o serviço.

**`config/silos.json`** — cadastro dos silos: nome, coluna do MySQL, capacidade e limites de alarme (em %):

```json
{ "id": 1, "nome": "Silo 1", "coluna": "Silo1", "capacidadeLitros": 100000,
  "limites": { "muitoBaixo": 5, "baixo": 10, "alto": 90, "muitoAlto": 95 } }
```

### Tela de Configurações (administradores)

A aba **Configurações** só aparece para usuários com papel *admin*:

| Seção | O que faz |
|---|---|
| **Silos** | Adicionar, editar e remover silos (nome, coluna, capacidade, limites, temperatura). Vale **na hora, sem reiniciar**; a versão anterior fica em `config/silos.anterior.json` |
| **Usuários** | Criar, editar, trocar senha e remover. Trocar a senha desconecta o usuário em todos os aparelhos. Não é possível remover a si mesmo nem o último administrador |
| **Alertas** | Situação do Telegram e botão *Enviar teste* |
| **Sistema** | Versão, origem dos dados, parâmetros do `.env` e *Fazer backup agora* |
| **Auditoria** | Quem entrou, quem errou a senha, quem alterou silos/usuários e quem reconheceu alarmes |

Token do Telegram, senha do banco e demais parâmetros do `.env` continuam só no servidor — de propósito, não são editáveis pelo navegador.

### Adicionar um silo novo

> Pelo navegador: **Configurações → Silos → Adicionar silo**. O passo a passo abaixo é a alternativa pelo arquivo.

1. **Na IHM:** crie a coluna do silo na tabela `silo` (ex.: `Silo4`) e configure a IHM para gravar o nível em litros nela.
2. **O painel avisa sozinho:** em até 5 minutos aparece, para usuários *admin*, a faixa azul *"A coluna Silo4 existe no banco e não está cadastrada"*, e o evento fica no registro.
3. **Cadastre** em `config/silos.json` (vírgula depois do item anterior):
   ```json
   { "id": 4, "nome": "Silo 4", "coluna": "Silo4", "capacidadeLitros": 150000,
     "limites": { "muitoBaixo": 5, "baixo": 10, "alto": 90, "muitoAlto": 95 } }
   ```
   Use um `id` novo — nunca reaproveite o de um silo removido, pois o histórico fica ligado a ele.
4. **Reinicie:** `npm run servico -- reiniciar` (PowerShell como administrador).

Cada silo é lido de forma independente: se a coluna cadastrada não existir (ou tiver valor inválido), **só aquele silo** fica cinza com *"Coluna não encontrada no banco"*; os demais continuam funcionando normalmente. O nome da coluna não diferencia maiúsculas de minúsculas.

### Alarmes

| Estado | Condição padrão | Severidade |
|---|---|---|
| Muito alto | ≥ 95 % | crítico (borda vermelha piscando até alguém reconhecer) |
| Alto | ≥ 90 % | atenção |
| Normal | entre 10 % e 90 % | — |
| Baixo | ≤ 10 % | atenção |
| Muito baixo | ≤ 5 % | crítico |

Para sair de um alarme o nível precisa recuar **2 pontos** além do limite (histerese), evitando alarmes repetidos quando o nível oscila em cima da linha.

### Alertas no celular (Telegram)

Os alarmes críticos (e a perda de comunicação) chegam num grupo do Telegram, com botão **✅ Reconhecer**. Se ninguém reconhecer, o painel repete o aviso a cada 15 min; quando o nível normaliza, manda "✅ Normalizado". No grupo, o comando `/status` responde com o nível atual de todos os silos.

1. No Telegram, fale com **@BotFather** → `/newbot` → escolha um nome (ex.: *Painel Silos Fábrica*). Ele devolve um **token**.
2. Cole o token em `TELEGRAM_TOKEN` no `.env`.
3. Crie um grupo (ex.: *Alarmes Silos*), adicione o bot e as pessoas que devem receber os alertas, e mande qualquer mensagem no grupo.
4. Descubra o número do grupo e coloque em `TELEGRAM_CHAT_ID`:
   ```
   npm run telegram -- descobrir
   npm run telegram -- testar
   ```
5. Reinicie o serviço. No menu do usuário (admin) aparece *Alertas no Telegram: ativos*.

| Opção no `.env` | Padrão | Efeito |
|---|---|---|
| `NOTIFICAR_SEVERIDADE` | `critico` | `atencao` também envia nível alto/baixo e silo sem leitura |
| `NOTIFICAR_REPETIR_MIN` | `15` | Lembrete enquanto ninguém reconhece (`0` = não repete) |
| `TELEGRAM_RECONHECER` | `true` | Botão de reconhecer na mensagem (fica registrado "Fulano (Telegram)") |

O servidor só precisa de acesso de **saída** à internet (`api.telegram.org`, porta 443) — nada é aberto no roteador. Sem internet, as mensagens ficam na fila por até 2 h e saem quando a conexão voltar. Qualquer pessoa no grupo pode reconhecer alarmes: mantenha o grupo restrito.

### Falta de comunicação

Após 3 leituras seguidas com erro (`FALHAS_PARA_OFFLINE`), o painel mostra **SEM COMUNICAÇÃO**, deixa os tanques cinza e hachurados com o último valor válido, e registra o evento. A rota `GET /api/saude` responde `503` nesse caso — útil para ferramentas de monitoramento (Zabbix, PRTG, Uptime Kuma).

### Temperatura dos silos

O painel lê a tabela `temperatura_silo` da IHM (`id`, `Silo`, `Temperatura`, `data_hora`) e mostra a temperatura em cada tanque, com alarme **crítico** acima do limite. O limite fica em `config/silos.json`:

```json
"temperatura": { "sensor": 1, "maxC": 4 }
```

`sensor` é o valor da coluna `Silo` na tabela (padrão: o `id` do silo); `maxC: null` mostra a temperatura sem alarme. Leitura com `data_hora` mais velha que `TEMPERATURA_VALIDADE_MIN` aparece como *desatualizada* (nunca como valor atual).

> **Hoje a tabela `temperatura_silo` está vazia** — os cartões mostram "Temperatura: sem sensor" até a IHM passar a gravar nela.

### Detecção de anomalias

| Anomalia | Quando dispara | Por quê |
|---|---|---|
| **Leitura suspeita** | O nível varia mais de 5 % da capacidade entre duas leituras seguidas (2 s) | Nenhum silo enche 5.000 L em 2 s: é sensor, cabo ou gravação com problema |
| **Níveis congelados** | Algum silo em nível intermediário e **todos** os valores idênticos por 4 h | A tabela da IHM não tem data/hora; se a IHM parar de gravar, o valor velho parece real. Silo vazio ou cheio parado não conta |

Ajuste em `ANOMALIA_SALTO_PCT` e `ANOMALIA_CONGELADO_H` (0 desliga).

### Relatórios

Aba **Relatórios**: escolha a data e o turno (ou o dia inteiro) e veja, por silo, o nível no início e no fim, mínimo/máximo, **entrada e saída estimadas**, temperatura mínima/máxima e os alarmes com quem reconheceu. Botões **Excel** (CSV com acentos e vírgula decimal) e **Imprimir / PDF** (A4 paisagem, com linhas de assinatura).

A coluna *Dados* mostra a cobertura: abaixo de 90 % significa que o painel ficou desligado ou sem comunicação parte do período. Os turnos são configurados em `TURNOS` no `.env`.

### Painel da fábrica

Aba **Fábrica** (só com `FONTE_DADOS=mysql`), lendo as outras tabelas da IHM — sempre com o selo de **há quanto tempo** cada dado foi gravado:

- **Ultrafiltração 1 e 2:** status atual, histórico de mudanças e a última campanha (duração e totalizadores). Os códigos de status (ex.: 1035) ganham nome em `config/fabrica.json` → `statusUF`.
- **Queijomáticas:** volume por dia e por equipamento (30 dias) e os últimos lotes.
- **Recepção de leite:** caminhão na plataforma e últimas descargas, com diagnóstico da qualidade da gravação.

> **Achados no banco (03/11/2026):** desde 04/04/2025 as descargas são gravadas **sem horário e sem volume medido**; a última produção de queijomática registrada é de 31/07/2026; as tabelas `temp_queijomatica` e `temperaturas` estão **corrompidas** no MySQL ("doesn't exist in engine").

### Backup

Todo dia às 03:00 o painel copia o histórico (`historico-AAAA-MM-DD.db`) e o cadastro de usuários para `data\backups` e mantém os últimos 14 dias. Para guardar fora do servidor, aponte `BACKUP_PASTA` para uma pasta de rede (ex.: `\\servidor\backups\silos`) — o usuário do serviço precisa ter permissão de escrita nela.

Para restaurar: pare o serviço, copie o arquivo do dia para `data\historico.db` e inicie o serviço.

### Monitoramento externo

A rota `GET /api/saude` não exige login e responde `200` quando o painel lê o banco da IHM e `503` quando não lê. Exemplo com **Uptime Kuma**: novo monitor *HTTP(s)*, URL `http://<servidor>:12322/api/saude`, intervalo 60 s — ele avisa se o servidor do painel cair (situação em que o próprio painel não consegue mandar o Telegram).

### Acesso de fora da fábrica

Não abra a porta 12322 no roteador. Use uma VPN:

- **Tailscale** (mais simples): instale no servidor do painel e nos celulares; acesse `http://<nome-do-servidor>:12322`. Grátis para poucos usuários.
- **VPN da empresa** (WireGuard/OpenVPN/FortiClient): peça à TI para liberar o IP do servidor na VPN.

## Desenvolvimento

```bash
npm install
cp .env.example .env          # use FONTE_DADOS=simulador para trabalhar sem o banco
npm run usuario -- adicionar dev --admin
npm run dev:servidor          # API em http://localhost:12322 (reinicia ao salvar)
npm run dev:web               # site em http://localhost:5173 (recarrega ao salvar)
npm test                      # testes do servidor
```

Com `FONTE_DADOS=simulador`, os silos enchem e esvaziam sozinhos e o painel exibe uma faixa **SIMULAÇÃO** em todas as telas.

### Estrutura

```
config/silos.json          cadastro dos silos e limites
server/src/
  config.js                leitura e validação do .env e do silos.json
  fontes.js                leitura do MySQL da IHM / simulador
  niveis.js                regras puras: alarme com histerese, vazão, previsão
  monitor.js               laço de leitura, eventos e gravação do histórico
  armazenamento.js         SQLite local: histórico, eventos, sessões
  autenticacao.js          senhas (scrypt), sessões, limite de tentativas
  app.js                   rotas HTTP, SSE, cabeçalhos de segurança, site
server/test/               testes (node:test)
server/scripts/            usuario.js, servico.js
web/src/                   React + MUI (tanques, gráfico, alarmes, login)
instalar.ps1               instalador do Windows
```

### API

| Rota | Login | Descrição |
|---|---|---|
| `GET /api/saude` | não | `200` com comunicação OK, `503` sem comunicação |
| `POST /api/login` · `POST /api/logout` · `GET /api/eu` | — | sessão |
| `GET /api/retrato` | sim | leitura atual de todos os silos |
| `GET /api/fluxo` | sim | Server-Sent Events: `retrato`, `evento`, `reconhecido` |
| `GET /api/historico?periodo=1h\|6h\|24h\|7d\|30d` | sim | série por silo |
| `GET /api/eventos` · `POST /api/eventos/:id/reconhecer` | sim | registro de alarmes |

## Segurança

- Senha do banco só no `.env` (fora do git); o painel apenas lê o MySQL.
- Senhas de usuário com `scrypt`; sessões revogáveis guardadas como hash; cookie `HttpOnly` + `SameSite`.
- Bloqueio após 5 tentativas de login erradas (15 min); POST de outros sites recusado (CSRF).
- Cabeçalhos de segurança (CSP, `nosniff`, sem `X-Powered-By`) e nenhuma informação do banco exposta pela API.
- A porta é liberada no firewall apenas para redes **privada/domínio**. Para acesso de fora da fábrica, use VPN — não abra a porta no roteador.

Veja o [CHANGELOG](CHANGELOG.md) para o histórico de versões.
