'use strict';

// Backup diário do histórico (SQLite) e do cadastro de usuários.
// Usa VACUUM INTO: cópia consistente mesmo com o painel gravando ao mesmo tempo.

const fs = require('node:fs');
const path = require('node:path');

const VERIFICAR_MS = 15 * 60_000;

function criarBackup({ armazenamento, pastaDados, destino, manterDias, hora, log, agora = Date.now }) {
  let timer = null;
  let ultimo = null; // { ts, arquivo } | { ts, erro }

  const diaLocal = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  function executar() {
    const t = agora();
    const dia = diaLocal(t);
    const arquivo = path.join(destino, `historico-${dia}.db`);
    try {
      fs.mkdirSync(destino, { recursive: true });
      const tmp = `${arquivo}.tmp`;
      fs.rmSync(tmp, { force: true });
      armazenamento.copiarPara(tmp);
      fs.renameSync(tmp, arquivo);
      const usuarios = path.join(pastaDados, 'usuarios.json');
      if (fs.existsSync(usuarios)) fs.copyFileSync(usuarios, path.join(destino, `usuarios-${dia}.json`));
      limparAntigos(t);
      ultimo = { ts: t, arquivo };
      log.info(`Backup gravado em ${arquivo}`);
    } catch (e) {
      ultimo = { ts: t, erro: e.message };
      log.error(`Falha no backup para ${destino}: ${e.message}`);
    }
  }

  function limparAntigos(t) {
    const limite = diaLocal(t - manterDias * 86_400_000);
    for (const nome of fs.readdirSync(destino)) {
      const m = /^(historico|usuarios)-(\d{4}-\d{2}-\d{2})\.(db|json)$/.exec(nome);
      if (m && m[2] < limite) fs.rmSync(path.join(destino, nome), { force: true });
    }
  }

  /** Faz o backup do dia se já passou da hora marcada e ainda não existe arquivo de hoje. */
  function verificar() {
    const t = agora();
    const d = new Date(t);
    const arquivoHoje = path.join(destino, `historico-${diaLocal(t)}.db`);
    if (d.getHours() * 60 + d.getMinutes() >= hora && !fs.existsSync(arquivoHoje)) executar();
  }

  return {
    iniciar() {
      verificar();
      timer = setInterval(verificar, VERIFICAR_MS);
      timer.unref();
    },
    parar: () => clearInterval(timer),
    executar,
    status: () => ultimo,
  };
}

module.exports = { criarBackup };
