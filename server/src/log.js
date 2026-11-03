'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** Log em console e em arquivo diário (logs/AAAA-MM-DD.log), apagando arquivos com mais de 30 dias. */
function criarLog(pasta, { manterDias = 30, console: saida = console } = {}) {
  if (pasta) fs.mkdirSync(pasta, { recursive: true });
  let diaAtual = null;
  let fluxo = null;

  function arquivoDoDia(agora) {
    const dia = agora.toISOString().slice(0, 10);
    if (dia === diaAtual) return fluxo;
    fluxo?.end();
    diaAtual = dia;
    fluxo = fs.createWriteStream(path.join(pasta, `${dia}.log`), { flags: 'a' });
    limparAntigos(agora);
    return fluxo;
  }

  function limparAntigos(agora) {
    const limite = agora.getTime() - manterDias * 86_400_000;
    for (const nome of fs.readdirSync(pasta)) {
      const t = Date.parse(nome.slice(0, 10));
      if (nome.endsWith('.log') && Number.isFinite(t) && t < limite) fs.rmSync(path.join(pasta, nome), { force: true });
    }
  }

  const escrever = (nivel) => (msg) => {
    const agora = new Date();
    const linha = `${agora.toISOString()} ${nivel.toUpperCase().padEnd(5)} ${msg}`;
    (nivel === 'error' ? saida.error : saida.log)(linha);
    if (pasta) arquivoDoDia(agora).write(`${linha}\n`);
  };

  return { info: escrever('info'), warn: escrever('warn'), error: escrever('error'), fechar: () => fluxo?.end() };
}

const logSilencioso = { info() {}, warn() {}, error() {}, fechar() {} };

module.exports = { criarLog, logSilencioso };
