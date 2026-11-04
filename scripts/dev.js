'use strict';

// Sobe a API (porta 12322) e o site Vite (porta 5173) juntos, para desenvolvimento.
// Ctrl+C encerra os dois. Uso: npm run dev

const { spawn } = require('node:child_process');

const processos = [
  ['api', ['run', 'dev:servidor']],
  ['web', ['run', 'dev:web']],
].map(([nome, args]) => {
  const p = spawn('npm', args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  const prefixar = (destino) => (dados) => {
    for (const linha of String(dados).split(/\r?\n/)) if (linha) destino.write(`[${nome}] ${linha}\n`);
  };
  p.stdout.on('data', prefixar(process.stdout));
  p.stderr.on('data', prefixar(process.stderr));
  p.on('exit', (codigo) => {
    console.log(`[${nome}] terminou (código ${codigo}); encerrando o outro processo.`);
    encerrar(codigo ?? 1);
  });
  return p;
});

let encerrando = false;
function encerrar(codigo = 0) {
  if (encerrando) return;
  encerrando = true;
  for (const p of processos) {
    if (p.exitCode !== null) continue;
    // No Windows o npm roda via cmd.exe; taskkill /T derruba a árvore inteira.
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
    else p.kill('SIGTERM');
  }
  setTimeout(() => process.exit(codigo), 500);
}

process.on('SIGINT', () => encerrar(0));
process.on('SIGTERM', () => encerrar(0));
