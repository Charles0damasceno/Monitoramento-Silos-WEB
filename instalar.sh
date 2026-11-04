#!/usr/bin/env bash
# Instalador do Painel de Silos para Linux (Debian/Ubuntu, RHEL/Rocky/Alma, Arch e derivados com systemd).
#
#   sudo bash instalar.sh                 instala em /opt/painel-silos como serviço systemd
#   sudo bash instalar.sh --destino /srv/silos
#   bash instalar.sh --sem-servico --destino ~/painel   só prepara (sem root, sem serviço)
#
# Rodar de novo atualiza a instalação sem apagar dados, usuários ou configuração.
#
# Opções:
#   --destino DIR      pasta de instalação (padrão /opt/painel-silos)
#   --usuario NOME     usuário de sistema do serviço (padrão painel-silos)
#   --sem-servico      não cria usuário de sistema nem serviço systemd
#   --sem-firewall     não abre a porta no ufw/firewalld
#   --nao-interativo   não pergunta nada: usa o .env existente ou variáveis CFG_* (ver README)
set -euo pipefail

DESTINO=/opt/painel-silos
USUARIO=painel-silos
SERVICO=1
FIREWALL=1
INTERATIVO=1
NODE_MINIMO=22.13.0
ORIGEM="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

while [ $# -gt 0 ]; do
  case "$1" in
    --destino) DESTINO="$2"; shift 2 ;;
    --usuario) USUARIO="$2"; shift 2 ;;
    --sem-servico) SERVICO=0; shift ;;
    --sem-firewall) FIREWALL=0; shift ;;
    --nao-interativo) INTERATIVO=0; shift ;;
    -h|--ajuda) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "Opção desconhecida: $1 (use --ajuda)"; exit 2 ;;
  esac
done

if [ -t 1 ]; then V='\033[32m'; A='\033[33m'; R='\033[31m'; C='\033[36m'; N='\033[0m'; else V=; A=; R=; C=; N=; fi
etapa() { printf "\n${C}==> %s${N}\n" "$1"; }
ok() { printf "    ${V}OK${N}  %s\n" "$1"; }
aviso() { printf "    ${A}!${N}   %s\n" "$1"; }
falha() { printf "\n${R}ERRO:${N} %s\n" "$1" >&2; exit 1; }
perguntar() { # perguntar "texto" "padrão" -> resposta em $RESPOSTA
  if [ "$INTERATIVO" = 0 ]; then RESPOSTA="$2"; return; fi
  read -r -p "$1${2:+ [$2]}: " RESPOSTA </dev/tty || true
  RESPOSTA="${RESPOSTA:-$2}"
}
confirmar() { # confirmar "texto" s|n
  if [ "$INTERATIVO" = 0 ]; then [ "$2" = s ]; return; fi
  local op='[s/N]'; [ "$2" = s ] && op='[S/n]'
  read -r -p "$1 $op " r </dev/tty || true
  r="${r:-$2}"; case "$r" in [sSyY]*) return 0 ;; *) return 1 ;; esac
}
ler_env() { # ler_env CHAVE padrão
  local v=''
  [ -f "$DESTINO/.env" ] && v="$(grep -E "^\s*$1\s*=" "$DESTINO/.env" | head -1 | sed -E "s/^\s*$1\s*=\s*//; s/^['\"]//; s/['\"]\s*$//")"
  echo "${v:-$2}"
}
como_servico() { # roda um comando como o usuário do serviço (ou o atual, sem serviço)
  if [ "$SERVICO" = 1 ]; then
    if command -v runuser >/dev/null; then runuser -u "$USUARIO" -- "$@"; else sudo -u "$USUARIO" -- "$@"; fi
  else
    "$@"
  fi
}

printf "\n  ${V}Painel de Silos${N} — HE Laticínios / Althium Ingredients\n  Instalador para Linux → %s\n" "$DESTINO"

# ---------- 0. Permissões ----------
if [ "$SERVICO" = 1 ] && [ "$(id -u)" != 0 ]; then
  falha "Rode como root (sudo bash instalar.sh) ou use --sem-servico."
fi
if [ "$SERVICO" = 1 ] && ! command -v systemctl >/dev/null; then
  aviso "systemd não encontrado: instalando sem serviço."
  SERVICO=0
fi

# ---------- 1. Node.js ----------
etapa "Node.js"
NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  cat <<EOF
    Node.js não encontrado. Instale a versão LTS (22 ou mais nova), por exemplo:
      Debian/Ubuntu:  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt install -y nodejs
      RHEL/Rocky:     curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash - && sudo dnf install -y nodejs
      Arch:           sudo pacman -S nodejs-lts-jod npm
    e rode este instalador de novo.
EOF
  exit 1
fi
VERSAO="$("$NODE" -p 'process.versions.node')"
if ! "$NODE" -e "const [a,b,c]=process.versions.node.split('.').map(Number),[x,y,z]='$NODE_MINIMO'.split('.').map(Number);process.exit(a>x||(a===x&&(b>y||(b===y&&c>=z)))?0:1)"; then
  falha "Node.js $VERSAO é antigo (mínimo $NODE_MINIMO). Atualize e rode de novo."
fi
command -v npm >/dev/null || falha "npm não encontrado (no Debian/Ubuntu: apt install npm, ou use o pacote da NodeSource)."
ok "Node.js $VERSAO ($NODE)"

# ---------- 2. Arquivos ----------
etapa "Arquivos"
mkdir -p "$DESTINO"
DESTINO="$(cd "$DESTINO" && pwd)"
if [ "$ORIGEM" != "$DESTINO" ]; then
  # Copia o programa sem levar dados, logs, .env nem node_modules (preserva os do destino).
  (cd "$ORIGEM" && tar --exclude=./node_modules --exclude=./data --exclude=./logs --exclude=./.env \
      --exclude=./.git --exclude=./dist-pacote -cf - .) | (cd "$DESTINO" && tar -xf -)
  ok "Programa copiado para $DESTINO"
else
  ok "Instalando na própria pasta ($DESTINO)"
fi
cd "$DESTINO"
mkdir -p data logs

if [ "$SERVICO" = 1 ]; then
  if ! id "$USUARIO" >/dev/null 2>&1; then
    useradd --system --home-dir "$DESTINO" --no-create-home --shell "$(command -v nologin || echo /bin/false)" "$USUARIO"
    ok "Usuário de sistema '$USUARIO' criado (sem login)"
  else
    ok "Usuário de sistema '$USUARIO' já existe"
  fi
fi

# ---------- 3. Dependências ----------
etapa "Dependências"
if [ -f web/dist/index.html ]; then
  npm ci --omit=dev --no-audit --no-fund --loglevel=error
  ok "Dependências instaladas (site já vem compilado no pacote)"
else
  npm ci --no-audit --no-fund --loglevel=error
  npm run build --silent
  ok "Dependências instaladas e site compilado"
fi

# ---------- 4. Configuração ----------
etapa "Configuração (.env)"
RECONFIGURAR=1
if [ -f .env ]; then
  ok ".env já existe (mantido)"
  RECONFIGURAR=0
  if [ "$INTERATIVO" = 1 ] && confirmar "    Quer revisar a conexão com o banco da IHM?" n; then RECONFIGURAR=1; fi
fi
if [ "$RECONFIGURAR" = 1 ]; then
  echo "    Dados do banco MySQL onde a IHM grava o nível dos silos:"
  export CFG_FONTE_DADOS="${CFG_FONTE_DADOS:-mysql}"
  perguntar "    Endereço (IP) do banco" "${CFG_DB_HOST:-$(ler_env DB_HOST 10.5.0.111)}"; export CFG_DB_HOST="$RESPOSTA"
  perguntar "    Porta" "${CFG_DB_PORT:-$(ler_env DB_PORT 3306)}"; export CFG_DB_PORT="$RESPOSTA"
  perguntar "    Nome do banco" "${CFG_DB_NAME:-$(ler_env DB_NAME weintek)}"; export CFG_DB_NAME="$RESPOSTA"
  perguntar "    Tabela dos silos" "${CFG_DB_TABELA:-$(ler_env DB_TABELA silo)}"; export CFG_DB_TABELA="$RESPOSTA"
  perguntar "    Usuário do banco (recomendado: só leitura)" "${CFG_DB_USER:-$(ler_env DB_USER painel_silos)}"; export CFG_DB_USER="$RESPOSTA"
  if [ "$INTERATIVO" = 1 ]; then
    read -r -s -p "    Senha do banco: " SENHA </dev/tty || true; echo
    [ -n "$SENHA" ] && export CFG_DB_PASSWORD="$SENHA"
    unset SENHA
  fi
  perguntar "    Porta do painel na rede" "${CFG_PORT:-$(ler_env PORT 12322)}"; export CFG_PORT="$RESPOSTA"
  "$NODE" scripts/configurar-env.js >/dev/null || falha "Não foi possível gravar o .env."
  unset CFG_DB_PASSWORD
  ok ".env gravado"
fi
chmod 600 .env

if [ "$SERVICO" = 1 ]; then
  # O serviço só escreve em data/, logs/ e config/ (cadastro de silos pela tela).
  chown -R root:root "$DESTINO"
  chown -R "$USUARIO:$USUARIO" data logs config
  chown "root:$USUARIO" .env && chmod 640 .env
fi

# ---------- 5. Usuário administrador ----------
etapa "Usuários"
if "$NODE" -e "try{const u=require('$DESTINO/data/usuarios.json').usuarios||[];process.exit(u.some(x=>x.papel==='admin')?0:1)}catch{process.exit(1)}"; then
  ok "Já existe administrador cadastrado"
else
  perguntar "    Nome de usuário do administrador" "admin"; NOME_ADMIN="$RESPOSTA"
  [ "$INTERATIVO" = 0 ] && [ -z "${PAINEL_SENHA:-}" ] && falha "Modo não interativo: defina PAINEL_SENHA para criar o administrador."
  if [ "$SERVICO" = 1 ] && [ "$INTERATIVO" = 1 ]; then
    runuser -u "$USUARIO" -- npm run usuario --silent -- adicionar "$NOME_ADMIN" --admin </dev/tty
  elif [ "$SERVICO" = 1 ]; then
    runuser -u "$USUARIO" -- env PAINEL_SENHA="$PAINEL_SENHA" npm run usuario --silent -- adicionar "$NOME_ADMIN" --admin
  else
    npm run usuario --silent -- adicionar "$NOME_ADMIN" --admin
  fi
  ok "Administrador '$NOME_ADMIN' criado"
fi

# ---------- 6. Diagnóstico ----------
etapa "Diagnóstico"
if ! como_servico npm run diagnostico --silent; then
  aviso "O diagnóstico encontrou problemas (veja acima)."
  confirmar "    Continuar a instalação mesmo assim?" n || falha "Corrija os itens marcados com ✖ e rode o instalador de novo."
fi

PORTA="$(ler_env PORT 12322)"

if [ "$SERVICO" = 0 ]; then
  etapa "Pronto (sem serviço)"
  echo "    Para iniciar:   cd $DESTINO && npm start"
  echo "    Depois acesse:  http://localhost:$PORTA"
  exit 0
fi

# ---------- 7. Serviço systemd ----------
etapa "Serviço systemd"
BACKUP_PASTA="$(ler_env BACKUP_PASTA '')"
LEITURA_ESCRITA="$DESTINO/data $DESTINO/logs $DESTINO/config"
if [ -n "$BACKUP_PASTA" ]; then
  mkdir -p "$BACKUP_PASTA" && chown "$USUARIO:$USUARIO" "$BACKUP_PASTA"
  LEITURA_ESCRITA="$LEITURA_ESCRITA $BACKUP_PASTA"
fi
cat > /etc/systemd/system/painel-silos.service <<EOF
[Unit]
Description=Painel de Silos (monitoramento de nível dos silos de leite)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USUARIO
Group=$USUARIO
WorkingDirectory=$DESTINO
ExecStart=$NODE --disable-warning=ExperimentalWarning $DESTINO/server/src/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

# Proteções: o processo só escreve nas pastas de dados.
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
ReadWritePaths=$LEITURA_ESCRITA

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable painel-silos.service >/dev/null 2>&1
systemctl restart painel-silos.service
ok "Serviço painel-silos ativo (inicia com o sistema, reinicia se cair)"

# ---------- 8. Firewall ----------
if [ "$FIREWALL" = 1 ]; then
  if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
    if confirmar "    Abrir a porta $PORTA/tcp no ufw?" s; then ufw allow "$PORTA/tcp" >/dev/null && ok "ufw: porta $PORTA liberada"; fi
  elif command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
    if confirmar "    Abrir a porta $PORTA/tcp no firewalld?" s; then
      firewall-cmd --permanent --add-port="$PORTA/tcp" >/dev/null && firewall-cmd --reload >/dev/null && ok "firewalld: porta $PORTA liberada"
    fi
  fi
fi

# ---------- 9. Conferência ----------
printf "    Aguardando o painel responder"
RESPOSTA_SAUDE=''
for _ in $(seq 1 30); do
  sleep 1; printf "."
  RESPOSTA_SAUDE="$("$NODE" -e "fetch('http://127.0.0.1:$PORTA/api/saude').then(r=>r.json()).then(d=>console.log(d.comunicacao)).catch(()=>{})" 2>/dev/null || true)"
  [ -n "$RESPOSTA_SAUDE" ] && break
done
echo
if [ -n "$RESPOSTA_SAUDE" ]; then ok "Painel no ar (comunicação com a IHM: $RESPOSTA_SAUDE)"
else aviso "O serviço ainda não respondeu. Veja: journalctl -u painel-silos -n 50"; fi

printf "\n  ${V}Instalação concluída!${N}\n"
echo "  Neste computador:  http://localhost:$PORTA"
for ip in $(hostname -I 2>/dev/null || true); do case "$ip" in *:*) ;; *) echo "  Na rede:           http://$ip:$PORTA" ;; esac; done
cat <<EOF

  Comandos úteis:
    systemctl status painel-silos          situação do serviço
    journalctl -u painel-silos -f          log ao vivo
    cd $DESTINO && sudo -u $USUARIO npm run diagnostico
    sudo bash $DESTINO/desinstalar.sh      remover o serviço
EOF
