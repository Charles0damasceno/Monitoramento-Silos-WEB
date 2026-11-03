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

Para incluir um 4º silo, basta acrescentar um item com a coluna correspondente na tabela da IHM.

### Alarmes

| Estado | Condição padrão | Severidade |
|---|---|---|
| Muito alto | ≥ 95 % | crítico (borda vermelha piscando até alguém reconhecer) |
| Alto | ≥ 90 % | atenção |
| Normal | entre 10 % e 90 % | — |
| Baixo | ≤ 10 % | atenção |
| Muito baixo | ≤ 5 % | crítico |

Para sair de um alarme o nível precisa recuar **2 pontos** além do limite (histerese), evitando alarmes repetidos quando o nível oscila em cima da linha.

### Falta de comunicação

Após 3 leituras seguidas com erro (`FALHAS_PARA_OFFLINE`), o painel mostra **SEM COMUNICAÇÃO**, deixa os tanques cinza e hachurados com o último valor válido, e registra o evento. A rota `GET /api/saude` responde `503` nesse caso — útil para ferramentas de monitoramento (Zabbix, PRTG, Uptime Kuma).

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
