#!/usr/bin/env bash
# Remove o serviço systemd do Painel de Silos. Dados, .env e programa são MANTIDOS,
# a menos que se use --apagar-tudo.
#   sudo bash desinstalar.sh [--apagar-tudo] [--usuario painel-silos]
set -euo pipefail

USUARIO=painel-silos
APAGAR=0
DESTINO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
while [ $# -gt 0 ]; do
  case "$1" in
    --apagar-tudo) APAGAR=1; shift ;;
    --usuario) USUARIO="$2"; shift 2 ;;
    *) echo "Opção desconhecida: $1"; exit 2 ;;
  esac
done
[ "$(id -u)" = 0 ] || { echo "Rode como root: sudo bash desinstalar.sh"; exit 1; }

read -r -p "Remover o serviço do Painel de Silos ($DESTINO)? [s/N] " r </dev/tty || true
case "$r" in [sS]*) ;; *) echo "Cancelado."; exit 0 ;; esac

if [ -f /etc/systemd/system/painel-silos.service ]; then
  systemctl disable --now painel-silos.service >/dev/null 2>&1 || true
  rm -f /etc/systemd/system/painel-silos.service
  systemctl daemon-reload
  echo "OK  Serviço removido"
else
  echo "-   Serviço não estava instalado"
fi

if [ "$APAGAR" = 1 ]; then
  read -r -p "APAGAR $DESTINO inteiro (histórico, usuários, backups, .env)? Digite APAGAR: " r </dev/tty || true
  if [ "$r" = APAGAR ]; then
    rm -rf "$DESTINO"
    id "$USUARIO" >/dev/null 2>&1 && userdel "$USUARIO" && echo "OK  Usuário de sistema removido"
    echo "OK  Tudo apagado"
  else
    echo "-   Nada foi apagado"
  fi
else
  echo "Os dados continuam em $DESTINO/data. Para reinstalar: sudo bash $DESTINO/instalar.sh"
fi
