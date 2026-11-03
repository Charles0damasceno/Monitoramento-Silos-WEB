'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..', '..');

function carregarEnv(arquivo) {
  if (fs.existsSync(arquivo)) process.loadEnvFile(arquivo);
}

function inteiro(env, nome, padrao, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const bruto = env[nome];
  if (bruto === undefined || bruto === '') return padrao;
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${nome} inválido: "${bruto}" (esperado inteiro entre ${min} e ${max})`);
  }
  return n;
}

function booleano(env, nome, padrao) {
  const bruto = (env[nome] ?? '').trim().toLowerCase();
  if (bruto === '') return padrao;
  if (['true', '1', 'sim'].includes(bruto)) return true;
  if (['false', '0', 'nao', 'não'].includes(bruto)) return false;
  throw new Error(`${nome} inválido: "${env[nome]}" (use true ou false)`);
}

const IDENTIFICADOR_SQL = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

function validarSilos(lista) {
  if (!Array.isArray(lista) || lista.length === 0) throw new Error('config/silos.json: lista "silos" vazia');
  const ids = new Set();
  return lista.map((s, i) => {
    const onde = `config/silos.json: silos[${i}]`;
    if (!Number.isInteger(s.id) || ids.has(s.id)) throw new Error(`${onde}: "id" deve ser inteiro e único`);
    ids.add(s.id);
    if (typeof s.nome !== 'string' || !s.nome.trim()) throw new Error(`${onde}: "nome" obrigatório`);
    // A coluna entra no SQL como identificador, então só aceitamos nomes simples.
    if (!IDENTIFICADOR_SQL.test(s.coluna ?? '')) throw new Error(`${onde}: "coluna" inválida`);
    if (!(s.capacidadeLitros > 0)) throw new Error(`${onde}: "capacidadeLitros" deve ser > 0`);
    const l = s.limites ?? {};
    const ordem = [l.muitoBaixo, l.baixo, l.alto, l.muitoAlto];
    if (ordem.some((v) => typeof v !== 'number' || v < 0 || v > 100) ||
        !(l.muitoBaixo <= l.baixo && l.baixo < l.alto && l.alto <= l.muitoAlto)) {
      throw new Error(`${onde}: "limites" devem ser 0–100 e muitoBaixo ≤ baixo < alto ≤ muitoAlto`);
    }
    return {
      id: s.id,
      nome: s.nome.trim(),
      coluna: s.coluna,
      capacidadeLitros: s.capacidadeLitros,
      limites: { muitoBaixo: l.muitoBaixo, baixo: l.baixo, alto: l.alto, muitoAlto: l.muitoAlto },
    };
  });
}

function carregarConfig({ env = process.env, arquivoSilos = path.join(RAIZ, 'config', 'silos.json') } = {}) {
  const fonte = (env.FONTE_DADOS || 'mysql').trim().toLowerCase();
  if (!['mysql', 'simulador'].includes(fonte)) throw new Error(`FONTE_DADOS inválida: "${env.FONTE_DADOS}"`);

  const tabela = env.DB_TABELA || 'silo';
  if (!IDENTIFICADOR_SQL.test(tabela)) throw new Error(`DB_TABELA inválida: "${tabela}"`);

  if (fonte === 'mysql') {
    const faltando = ['DB_HOST', 'DB_USER', 'DB_NAME'].filter((k) => !env[k]);
    if (faltando.length) throw new Error(`Faltam no .env: ${faltando.join(', ')}`);
  }

  const silos = validarSilos(JSON.parse(fs.readFileSync(arquivoSilos, 'utf8')).silos);

  return {
    raiz: RAIZ,
    porta: inteiro(env, 'PORT', 12322, { min: 1, max: 65535 }),
    host: env.HOST || '0.0.0.0',
    fonte,
    db: {
      host: env.DB_HOST,
      port: inteiro(env, 'DB_PORT', 3306, { min: 1, max: 65535 }),
      user: env.DB_USER,
      password: env.DB_PASSWORD ?? '',
      database: env.DB_NAME,
      tabela,
    },
    leituraMs: inteiro(env, 'LEITURA_INTERVALO_S', 2, { min: 1, max: 300 }) * 1000,
    historicoMs: inteiro(env, 'HISTORICO_INTERVALO_S', 30, { min: 5, max: 3600 }) * 1000,
    retencaoDias: inteiro(env, 'HISTORICO_RETENCAO_DIAS', 180, { min: 1, max: 3650 }),
    falhasParaOffline: inteiro(env, 'FALHAS_PARA_OFFLINE', 3, { min: 1, max: 100 }),
    loginObrigatorio: booleano(env, 'LOGIN_OBRIGATORIO', true),
    sessaoDias: inteiro(env, 'SESSAO_DIAS', 30, { min: 1, max: 365 }),
    pastaDados: env.PASTA_DADOS || path.join(RAIZ, 'data'),
    pastaWeb: path.join(RAIZ, 'web', 'dist'),
    silos,
  };
}

module.exports = { carregarConfig, carregarEnv, validarSilos, RAIZ };
