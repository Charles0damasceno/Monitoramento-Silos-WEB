'use strict';

// Banco local (SQLite embutido no Node) para histórico, eventos e sessões.
// O MySQL da IHM é apenas lido; nada é gravado lá.

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ESQUEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS amostras (
    ts      INTEGER NOT NULL,
    silo_id INTEGER NOT NULL,
    litros  INTEGER NOT NULL,
    PRIMARY KEY (silo_id, ts)
  ) WITHOUT ROWID;

  CREATE TABLE IF NOT EXISTS amostras_temperatura (
    ts      INTEGER NOT NULL,
    silo_id INTEGER NOT NULL,
    celsius REAL NOT NULL,
    PRIMARY KEY (silo_id, ts)
  ) WITHOUT ROWID;

  CREATE TABLE IF NOT EXISTS eventos (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    ts               INTEGER NOT NULL,
    silo_id          INTEGER,
    tipo             TEXT NOT NULL,      -- 'nivel' | 'comunicacao' | 'sistema'
    estado           TEXT NOT NULL,      -- ex.: 'alto', 'normal', 'offline'
    severidade       TEXT,               -- 'critico' | 'atencao' | null (informativo)
    mensagem         TEXT NOT NULL,
    reconhecido_em   INTEGER,
    reconhecido_por  TEXT
  );
  CREATE INDEX IF NOT EXISTS eventos_ts ON eventos (ts DESC);

  CREATE TABLE IF NOT EXISTS auditoria (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    ts       INTEGER NOT NULL,
    usuario  TEXT,
    ip       TEXT,
    acao     TEXT NOT NULL,
    detalhe  TEXT
  );
  CREATE INDEX IF NOT EXISTS auditoria_ts ON auditoria (ts DESC);

  CREATE TABLE IF NOT EXISTS sessoes (
    token_hash TEXT PRIMARY KEY,
    usuario    TEXT NOT NULL,
    criada_em  INTEGER NOT NULL,
    expira_em  INTEGER NOT NULL
  );
`;

/** Resolução do histórico conforme o período pedido, para o gráfico ter ~300–700 pontos. */
const PERIODOS = Object.freeze({
  '1h': { ms: 3_600_000, baldeMs: 0 },
  '6h': { ms: 6 * 3_600_000, baldeMs: 60_000 },
  '24h': { ms: 24 * 3_600_000, baldeMs: 3 * 60_000 },
  '7d': { ms: 7 * 86_400_000, baldeMs: 20 * 60_000 },
  '30d': { ms: 30 * 86_400_000, baldeMs: 60 * 60_000 },
});

function abrirArmazenamento(arquivo) {
  if (arquivo !== ':memory:') fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const db = new DatabaseSync(arquivo);
  db.exec(ESQUEMA);

  const st = {
    inserirAmostra: db.prepare('INSERT OR REPLACE INTO amostras (ts, silo_id, litros) VALUES (?, ?, ?)'),
    amostrasDesde: db.prepare('SELECT ts, litros FROM amostras WHERE silo_id = ? AND ts >= ? ORDER BY ts'),
    amostrasBalde: db.prepare(`
      SELECT (ts / ?) * ? AS ts, CAST(ROUND(AVG(litros)) AS INTEGER) AS litros,
             MIN(litros) AS minimo, MAX(litros) AS maximo
        FROM amostras WHERE silo_id = ? AND ts >= ?
       GROUP BY ts / ? ORDER BY 1`),
    inserirTemperatura: db.prepare('INSERT OR REPLACE INTO amostras_temperatura (ts, silo_id, celsius) VALUES (?, ?, ?)'),
    temperaturasDesde: db.prepare('SELECT ts, celsius FROM amostras_temperatura WHERE silo_id = ? AND ts >= ? ORDER BY ts'),
    temperaturasBalde: db.prepare(`
      SELECT (ts / ?) * ? AS ts, ROUND(AVG(celsius), 1) AS celsius, MIN(celsius) AS minimo, MAX(celsius) AS maximo
        FROM amostras_temperatura WHERE silo_id = ? AND ts >= ?
       GROUP BY ts / ? ORDER BY 1`),
    limparTemperaturas: db.prepare('DELETE FROM amostras_temperatura WHERE ts < ?'),
    amostrasEntre: db.prepare('SELECT ts, litros FROM amostras WHERE silo_id = ? AND ts >= ? AND ts < ? ORDER BY ts'),
    temperaturasEntre: db.prepare('SELECT ts, celsius FROM amostras_temperatura WHERE silo_id = ? AND ts >= ? AND ts < ? ORDER BY ts'),
    eventosEntre: db.prepare('SELECT * FROM eventos WHERE ts >= ? AND ts < ? ORDER BY ts, id'),
    inserirAuditoria: db.prepare('INSERT INTO auditoria (ts, usuario, ip, acao, detalhe) VALUES (?, ?, ?, ?, ?)'),
    auditoria: db.prepare('SELECT * FROM auditoria ORDER BY ts DESC, id DESC LIMIT ?'),
    idsComHistorico: db.prepare('SELECT DISTINCT silo_id AS id FROM amostras'),
    inserirEvento: db.prepare(`
      INSERT INTO eventos (ts, silo_id, tipo, estado, severidade, mensagem)
      VALUES (?, ?, ?, ?, ?, ?)`),
    eventos: db.prepare('SELECT * FROM eventos WHERE ts >= ? ORDER BY ts DESC, id DESC LIMIT ?'),
    reconhecer: db.prepare(`
      UPDATE eventos SET reconhecido_em = ?, reconhecido_por = ?
       WHERE id = ? AND reconhecido_em IS NULL AND severidade IS NOT NULL`),
    limparAmostras: db.prepare('DELETE FROM amostras WHERE ts < ?'),
    limparEventos: db.prepare('DELETE FROM eventos WHERE ts < ?'),
    criarSessao: db.prepare('INSERT INTO sessoes (token_hash, usuario, criada_em, expira_em) VALUES (?, ?, ?, ?)'),
    buscarSessao: db.prepare('SELECT usuario, expira_em FROM sessoes WHERE token_hash = ?'),
    renovarSessao: db.prepare('UPDATE sessoes SET expira_em = ? WHERE token_hash = ?'),
    apagarSessao: db.prepare('DELETE FROM sessoes WHERE token_hash = ?'),
    apagarSessoesDe: db.prepare('DELETE FROM sessoes WHERE usuario = ?'),
    limparSessoes: db.prepare('DELETE FROM sessoes WHERE expira_em < ?'),
  };

  return {
    gravarAmostras(ts, leituras) {
      db.exec('BEGIN');
      try {
        for (const { siloId, litros } of leituras) st.inserirAmostra.run(ts, siloId, litros);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },

    amostrasDesde(siloId, desde) {
      return st.amostrasDesde.all(siloId, desde);
    },

    historico(siloId, periodo, agora = Date.now()) {
      const p = PERIODOS[periodo];
      if (!p) throw new Error(`período inválido: ${periodo}`);
      const desde = agora - p.ms;
      if (!p.baldeMs) return st.amostrasDesde.all(siloId, desde);
      return st.amostrasBalde.all(p.baldeMs, p.baldeMs, siloId, desde, p.baldeMs);
    },

    gravarTemperaturas(ts, leituras) {
      db.exec('BEGIN');
      try {
        for (const { siloId, celsius } of leituras) st.inserirTemperatura.run(ts, siloId, celsius);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },

    historicoTemperatura(siloId, periodo, agora = Date.now()) {
      const p = PERIODOS[periodo];
      if (!p) throw new Error(`período inválido: ${periodo}`);
      const desde = agora - p.ms;
      if (!p.baldeMs) return st.temperaturasDesde.all(siloId, desde);
      return st.temperaturasBalde.all(p.baldeMs, p.baldeMs, siloId, desde, p.baldeMs);
    },

    /** Dados brutos de um intervalo [inicio, fim), para relatórios. */
    intervalo(siloId, inicio, fim) {
      return {
        amostras: st.amostrasEntre.all(siloId, inicio, fim),
        temperaturas: st.temperaturasEntre.all(siloId, inicio, fim),
      };
    },

    eventosEntre: (inicio, fim) => st.eventosEntre.all(inicio, fim),

    /** Quem fez o quê: mudanças de configuração, usuários, logins. Não é apagado pela limpeza automática. */
    registrarAuditoria({ ts = Date.now(), usuario = null, ip = null, acao, detalhe = null }) {
      st.inserirAuditoria.run(ts, usuario, ip, acao, detalhe === null ? null : String(detalhe).slice(0, 2000));
    },
    auditoria: (limite = 200) => st.auditoria.all(Math.min(Math.max(limite, 1), 1000)),

    /** Ids de silo que já têm histórico gravado (um silo novo não deve reaproveitá-los). */
    idsComHistorico: () => st.idsComHistorico.all().map((l) => l.id),

    /** Cópia consistente do banco (mesmo com o painel rodando), para backup. */
    copiarPara(destino) {
      db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
    },

    registrarEvento({ ts, siloId = null, tipo, estado, severidade = null, mensagem }) {
      const r = st.inserirEvento.run(ts, siloId, tipo, estado, severidade, mensagem);
      return Number(r.lastInsertRowid);
    },

    eventos({ desde = 0, limite = 100 } = {}) {
      return st.eventos.all(desde, Math.min(Math.max(limite, 1), 500));
    },

    reconhecerEvento(id, usuario, ts = Date.now()) {
      return st.reconhecer.run(ts, usuario, id).changes > 0;
    },

    limparAntigos(retencaoDias, agora = Date.now()) {
      const limite = agora - retencaoDias * 86_400_000;
      st.limparAmostras.run(limite);
      st.limparTemperaturas.run(limite);
      st.limparEventos.run(limite);
      st.limparSessoes.run(agora);
    },

    sessoes: {
      criar: (hash, usuario, criada, expira) => st.criarSessao.run(hash, usuario, criada, expira),
      buscar: (hash) => st.buscarSessao.get(hash),
      renovar: (hash, expira) => st.renovarSessao.run(expira, hash),
      apagar: (hash) => st.apagarSessao.run(hash),
      apagarDoUsuario: (usuario) => st.apagarSessoesDe.run(usuario),
    },

    fechar() {
      db.close();
    },
  };
}

module.exports = { abrirArmazenamento, PERIODOS };
