'use strict';

// Gera/atualiza o .env a partir do .env.example usando variáveis de ambiente CFG_<CHAVE>.
// Usado pelos instaladores (Windows e Linux) para não depender de sed/regex com senhas.
//   CFG_DB_HOST=10.5.0.111 CFG_DB_PASSWORD='s3nh@#x' node scripts/configurar-env.js
// Chaves sem CFG_ correspondente mantêm o valor atual do .env (ou o do exemplo).

const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const exemplo = path.join(raiz, '.env.example');
const destino = path.join(raiz, '.env');

/** Lê o .env com o mesmo leitor do Node que o painel usa (entende aspas). */
function lerValores(arquivo) {
  if (!fs.existsSync(arquivo)) return {};
  const { parseEnv } = require('node:util');
  return parseEnv(fs.readFileSync(arquivo, 'utf8'));
}

/** Coloca aspas quando o valor tem caracteres que o leitor de .env interpretaria. */
function formatar(chave, valor) {
  const v = String(valor);
  if (/[\r\n]/.test(v)) throw new Error(`${chave}: o valor não pode ter quebra de linha`);
  if (v === '' || /^[A-Za-z0-9_.,:/@%+\-\\]*$/.test(v)) return v;
  if (!v.includes("'")) return `'${v}'`;
  if (!v.includes('"') && !v.includes('\\')) return `"${v}"`;
  throw new Error(`${chave}: use um valor sem aspas simples e duplas ao mesmo tempo`);
}

const atuais = lerValores(destino);
const linhas = fs.readFileSync(exemplo, 'utf8').split(/\r?\n/);
const usadas = new Set();
const saida = linhas.map((linha) => {
  const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(linha);
  if (!m) return linha;
  const chave = m[1];
  usadas.add(chave);
  const novo = process.env[`CFG_${chave}`];
  if (novo !== undefined) return `${chave}=${formatar(chave, novo)}`;
  if (atuais[chave] !== undefined) return `${chave}=${formatar(chave, atuais[chave])}`;
  return linha;
});

// Chaves que existem no .env atual mas não no exemplo (ex.: comentadas no exemplo) são preservadas.
const extras = Object.entries(atuais).filter(([k]) => !usadas.has(k));
for (const chave of Object.keys(process.env)) {
  const k = chave.replace(/^CFG_/, '');
  if (chave.startsWith('CFG_') && !usadas.has(k) && !extras.some(([e]) => e === k)) extras.push([k, process.env[chave]]);
}
if (extras.length) {
  saida.push('', '# ---- Outras configurações ----');
  for (const [k, v] of extras) saida.push(`${k}=${formatar(k, process.env[`CFG_${k}`] ?? v)}`);
}

fs.writeFileSync(destino, `${saida.join('\n').replace(/\n+$/, '')}\n`, { mode: 0o600 });
try { fs.chmodSync(destino, 0o600); } catch { /* Windows */ }
console.log(`Configuração gravada em ${destino}`);
