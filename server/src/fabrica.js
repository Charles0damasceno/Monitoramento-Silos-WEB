'use strict';

// Painel da fábrica: queijomáticas, ultrafiltração (UF1/UF2) e recepção de leite.
// Só leitura no banco da IHM. Cada consulta fica em cache para não pesar no MySQL.

const mysql = require('mysql2/promise');
const { lerDataHora } = require('./temperatura');

const CACHE_MS = 60_000;
const DIAS_PRODUCAO = 30;

// Datas da IHM vêm como texto "dd/mm/aaaa hh:mm:ss".
const comoData = (coluna) => `STR_TO_DATE(${coluna}, '%d/%m/%Y %H:%i:%s')`;

function criarFabrica({ db, nomes = {}, agora = Date.now }) {
  const pool = mysql.createPool({
    host: db.host, port: db.port, user: db.user, password: db.password, database: db.database,
    connectionLimit: 2, connectTimeout: 5000, dateStrings: true,
  });
  let cache = null;
  let carregando = null;

  const consultar = async (sql, params = []) => (await pool.query({ sql, timeout: 8000 }, params))[0];
  const nomeStatus = (uf, codigo) => nomes.statusUF?.[uf]?.[String(codigo)] ?? nomes.statusUF?.['*']?.[String(codigo)] ?? null;

  /** Executa uma parte do painel isolada: uma tabela com problema não derruba as outras. */
  async function parte(nome, fn) {
    try {
      return { ok: true, ...(await fn()) };
    } catch (e) {
      return { ok: false, erro: e.code === 'ER_NO_SUCH_TABLE' ? 'tabela não existe' : (e.code || e.message), parte: nome };
    }
  }

  async function queijomaticas() {
    const [ultimo] = await consultar(`SELECT ID, Hora_Fim FROM queijomaticas ORDER BY ID DESC LIMIT 1`);
    if (!ultimo) return { ultimoRegistro: null, porDia: [], ultimosLotes: [] };
    const ultimoTs = lerDataHora(ultimo.Hora_Fim);
    // Agrega os 30 dias que terminam no último registro (se a gravação parou, ainda mostra algo útil).
    const fimJanela = new Date(ultimoTs ?? agora());
    fimJanela.setHours(23, 59, 59, 999);
    const iniJanela = new Date(fimJanela.getTime() - DIAS_PRODUCAO * 86_400_000 + 1);
    const porDia = await consultar(`
      SELECT DATE_FORMAT(${comoData('Hora_Inicio')}, '%Y-%m-%d') AS dia, Queijomaticas AS equipamento,
             COUNT(*) AS lotes, SUM(Volume_Medido) AS volume
        FROM queijomaticas
       WHERE ${comoData('Hora_Inicio')} BETWEEN ? AND ?
       GROUP BY dia, equipamento ORDER BY dia, equipamento`, [iniJanela, fimJanela]);
    const ultimosLotes = await consultar(`
      SELECT ID AS id, Lote AS lote, Produto AS produto, Teor_Gordura AS gordura, Queijomaticas AS equipamento,
             Volume_Selecionado AS volumeSelecionado, Volume_Medido AS volumeMedido, Hora_Inicio AS inicio, Hora_Fim AS fim, OP AS op
        FROM queijomaticas ORDER BY ID DESC LIMIT 15`);
    return {
      ultimoRegistro: ultimoTs,
      janela: { inicio: iniJanela.getTime(), fim: fimJanela.getTime() },
      porDia: porDia.map((l) => ({ dia: l.dia, equipamento: l.equipamento, lotes: Number(l.lotes), volume: Number(l.volume) })),
      ultimosLotes: ultimosLotes.map((l) => ({
        ...l,
        nomeEquipamento: nomes.queijomaticas?.[String(l.equipamento)] ?? `Queijomática ${l.equipamento}`,
        inicio: lerDataHora(l.inicio),
        fim: lerDataHora(l.fim),
      })),
    };
  }

  async function ultrafiltracao(uf) {
    const tabStatus = mysql.escapeId(`historico_${uf}_status`);
    const tabProd = mysql.escapeId(`historico_${uf}_prod`);
    const status = await consultar(`SELECT data_hora_gravacao AS ts, status FROM ${tabStatus} ORDER BY id DESC LIMIT 40`);
    const [producao] = await consultar(`SELECT * FROM ${tabProd} ORDER BY id DESC LIMIT 1`);
    const ts = (v) => (v ? new Date(v.replace(' ', 'T')).getTime() : null);
    const linhaTempo = status.map((s) => ({ ts: ts(s.ts), codigo: s.status, nome: nomeStatus(uf, s.status) }));
    return {
      id: uf,
      nome: nomes.uf?.[uf] ?? uf.toUpperCase(),
      atual: linhaTempo[0] ?? null,
      linhaTempo,
      producao: producao ? {
        ts: ts(producao.data_hora_gravacao),
        receita: producao.recipe,
        campanhaSegundos: producao.campanha_hora * 3600 + producao.campanha_minuto * 60 + producao.campanha_segundo,
        alimentacao: producao.totalizer_feed,
        concentrado: producao.totalizer_concent,
        permeado: producao.totalizer_permeado,
      } : null,
    };
  }

  async function recepcao() {
    const ultimas = await consultar(`
      SELECT id, romaneio, TRIM(placa) AS placa, volume_estimado AS volumeEstimado, volume_medido AS volumeMedido,
             status, hora_inicio AS inicio, hora_fim AS fim, temperatura_med AS temperatura, User_Balanca AS balanca
        FROM descargas ORDER BY id DESC LIMIT 15`);
    const [qualidade] = await consultar(`
      SELECT SUM(hora_inicio IS NULL OR hora_inicio = '') AS semHora, SUM(volume_medido = 0) AS semVolume,
             COUNT(*) AS total, MAX(CASE WHEN hora_inicio <> '' THEN id END) AS ultimoComHora FROM descargas`);
    let ultimaComHora = null;
    if (qualidade.ultimoComHora) {
      const [l] = await consultar('SELECT hora_inicio FROM descargas WHERE id = ?', [qualidade.ultimoComHora]);
      ultimaComHora = lerDataHora(l?.hora_inicio);
    }
    const [plataforma] = await consultar(`
      SELECT romaneio, TRIM(placa) AS placa, volume_estimado AS volumeEstimado, status FROM plataforma ORDER BY id DESC LIMIT 1`).catch(() => []);
    return {
      plataforma: plataforma ?? null,
      ultimas: ultimas.map((d) => ({ ...d, inicio: lerDataHora(d.inicio), fim: lerDataHora(d.fim) })),
      qualidade: {
        total: Number(qualidade.total),
        semHora: Number(qualidade.semHora),
        semVolumeMedido: Number(qualidade.semVolume),
        ultimaComHora,
      },
    };
  }

  async function carregar() {
    const [q, uf1, uf2, r] = await Promise.all([
      parte('queijomaticas', queijomaticas),
      parte('uf1', () => ultrafiltracao('uf1')),
      parte('uf2', () => ultrafiltracao('uf2')),
      parte('recepcao', recepcao),
    ]);
    return { ts: agora(), queijomaticas: q, ultrafiltracao: [uf1, uf2], recepcao: r };
  }

  return {
    async painel() {
      if (cache && agora() - cache.ts < CACHE_MS) return cache;
      carregando ??= carregar().finally(() => { carregando = null; });
      cache = await carregando;
      return cache;
    },
    fechar: () => pool.end(),
  };
}

module.exports = { criarFabrica };
