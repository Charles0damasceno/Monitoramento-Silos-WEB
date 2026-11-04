'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { lerTurnos } = require('./relatorios');

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

/** "03:00" → minutos desde a meia-noite. */
function lerHora(texto, nome) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(texto).trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`${nome} inválido: "${texto}" (use HH:MM)`);
  return Number(m[1]) * 60 + Number(m[2]);
}

function lerJsonOpcional(arquivo) {
  if (!fs.existsSync(arquivo)) return {};
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch (e) {
    throw new Error(`${path.basename(arquivo)} com erro de sintaxe: ${e.message}`);
  }
}

const IDENTIFICADOR_SQL = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

function validarSilos(lista) {
  if (!Array.isArray(lista) || lista.length === 0) throw new Error('config/silos.json: lista "silos" vazia');
  const ids = new Set();
  const colunas = new Set();
  return lista.map((s, i) => {
    const onde = `config/silos.json: silos[${i}]`;
    if (!Number.isInteger(s.id) || ids.has(s.id)) throw new Error(`${onde}: "id" deve ser inteiro e único`);
    ids.add(s.id);
    if (typeof s.nome !== 'string' || !s.nome.trim()) throw new Error(`${onde}: "nome" obrigatório`);
    // A coluna entra no SQL como identificador, então só aceitamos nomes simples.
    if (!IDENTIFICADOR_SQL.test(s.coluna ?? '')) throw new Error(`${onde}: "coluna" inválida`);
    if (colunas.has(s.coluna.toLowerCase())) throw new Error(`${onde}: a coluna "${s.coluna}" já está em outro silo`);
    colunas.add(s.coluna.toLowerCase());
    if (!(s.capacidadeLitros > 0)) throw new Error(`${onde}: "capacidadeLitros" deve ser > 0`);
    const l = s.limites ?? {};
    const ordem = [l.muitoBaixo, l.baixo, l.alto, l.muitoAlto];
    if (ordem.some((v) => typeof v !== 'number' || v < 0 || v > 100) ||
        !(l.muitoBaixo <= l.baixo && l.baixo < l.alto && l.alto <= l.muitoAlto)) {
      throw new Error(`${onde}: "limites" devem ser 0–100 e muitoBaixo ≤ baixo < alto ≤ muitoAlto`);
    }
    let temperatura = null;
    if (s.temperatura !== undefined && s.temperatura !== null) {
      const { sensor = s.id, maxC = null } = s.temperatura;
      if (!Number.isInteger(sensor)) throw new Error(`${onde}: "temperatura.sensor" deve ser inteiro`);
      if (maxC !== null && (typeof maxC !== 'number' || maxC < -10 || maxC > 100)) {
        throw new Error(`${onde}: "temperatura.maxC" deve ser um número entre -10 e 100 (ou null)`);
      }
      temperatura = { sensor, maxC };
    }
    return {
      id: s.id,
      nome: s.nome.trim(),
      coluna: s.coluna,
      capacidadeLitros: s.capacidadeLitros,
      limites: { muitoBaixo: l.muitoBaixo, baixo: l.baixo, alto: l.alto, muitoAlto: l.muitoAlto },
      temperatura,
    };
  });
}

function carregarConfig({
  env = process.env,
  arquivoSilos = env.ARQUIVO_SILOS || path.join(RAIZ, 'config', 'silos.json'),
} = {}) {
  const fonte = (env.FONTE_DADOS || 'mysql').trim().toLowerCase();
  if (!['mysql', 'simulador'].includes(fonte)) throw new Error(`FONTE_DADOS inválida: "${env.FONTE_DADOS}"`);

  const tabela = env.DB_TABELA || 'silo';
  if (!IDENTIFICADOR_SQL.test(tabela)) throw new Error(`DB_TABELA inválida: "${tabela}"`);

  if (fonte === 'mysql') {
    const faltando = ['DB_HOST', 'DB_USER', 'DB_NAME'].filter((k) => !env[k]);
    if (faltando.length) throw new Error(`Faltam no .env: ${faltando.join(', ')}`);
  }

  const token = (env.TELEGRAM_TOKEN ?? '').trim();
  const chatId = (env.TELEGRAM_CHAT_ID ?? '').trim();
  if (Boolean(token) !== Boolean(chatId)) {
    throw new Error('Para os alertas no Telegram preencha TELEGRAM_TOKEN e TELEGRAM_CHAT_ID (ou deixe os dois vazios)');
  }
  if (token && !/^\d+:[\w-]{30,}$/.test(token)) throw new Error('TELEGRAM_TOKEN com formato inválido');
  if (chatId && !/^-?\d+$/.test(chatId)) {
    throw new Error('TELEGRAM_CHAT_ID deve ser o número do chat (descubra com: npm run telegram -- descobrir)');
  }
  const severidadeMinima = (env.NOTIFICAR_SEVERIDADE || 'critico').trim().toLowerCase();
  if (!['critico', 'atencao'].includes(severidadeMinima)) {
    throw new Error(`NOTIFICAR_SEVERIDADE inválida: "${env.NOTIFICAR_SEVERIDADE}" (use critico ou atencao)`);
  }

  const silos = validarSilos(JSON.parse(fs.readFileSync(arquivoSilos, 'utf8')).silos);

  const tabelaTemperatura = (env.TEMPERATURA_TABELA ?? 'temperatura_silo').trim();
  if (tabelaTemperatura && !IDENTIFICADOR_SQL.test(tabelaTemperatura)) {
    throw new Error(`TEMPERATURA_TABELA inválida: "${tabelaTemperatura}"`);
  }

  return {
    raiz: RAIZ,
    arquivoSilos,
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
    temperatura: {
      // Desligada se a tabela estiver vazia no .env. Só é lida se algum silo tiver "temperatura" no cadastro.
      tabela: tabelaTemperatura || null,
      intervaloMs: inteiro(env, 'TEMPERATURA_INTERVALO_S', 30, { min: 5, max: 3600 }) * 1000,
      validadeMs: inteiro(env, 'TEMPERATURA_VALIDADE_MIN', 10, { min: 1, max: 1440 }) * 60_000,
    },
    fabrica: fonte === 'mysql' && booleano(env, 'PAINEL_FABRICA', true)
      ? { nomes: lerJsonOpcional(path.join(RAIZ, 'config', 'fabrica.json')) }
      : null,
    turnos: lerTurnos(env.TURNOS || '06:00-14:00,14:00-22:00,22:00-06:00'),
    anomalias: {
      saltoPct: inteiro(env, 'ANOMALIA_SALTO_PCT', 5, { min: 0, max: 100 }),
      congeladoMs: inteiro(env, 'ANOMALIA_CONGELADO_H', 4, { min: 0, max: 168 }) * 3_600_000,
    },
    telegram: token ? { token, chatId, reconhecer: booleano(env, 'TELEGRAM_RECONHECER', true) } : null,
    notificacoes: {
      severidadeMinima,
      repetirMs: inteiro(env, 'NOTIFICAR_REPETIR_MIN', 15, { min: 0, max: 1440 }) * 60_000,
    },
    pastaDados: env.PASTA_DADOS || path.join(RAIZ, 'data'),
    backup: {
      destino: env.BACKUP_PASTA || path.join(env.PASTA_DADOS || path.join(RAIZ, 'data'), 'backups'),
      manterDias: inteiro(env, 'BACKUP_MANTER_DIAS', 14, { min: 1, max: 3650 }),
      hora: lerHora(env.BACKUP_HORA || '03:00', 'BACKUP_HORA'),
    },
    pastaWeb: path.join(RAIZ, 'web', 'dist'),
    silos,
  };
}

module.exports = { carregarConfig, carregarEnv, validarSilos, RAIZ };
