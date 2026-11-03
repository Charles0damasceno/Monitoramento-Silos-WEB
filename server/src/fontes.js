'use strict';

// Origem das leituras. Toda fonte expõe `ler()` → Map(siloId → litros) e `fechar()`.

const mysql = require('mysql2/promise');

/**
 * Lê a linha mais recente da tabela da IHM. Hoje a IHM sobrescreve uma única linha,
 * mas ORDER BY garante o valor certo se ela passar a inserir linhas novas.
 */
function criarFonteMysql(db, silos) {
  const pool = mysql.createPool({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.database,
    connectionLimit: 2,
    connectTimeout: 5000,
    enableKeepAlive: true,
  });
  const colunas = silos.map((s) => mysql.escapeId(s.coluna)).join(', ');
  const sql = `SELECT ${colunas} FROM ${mysql.escapeId(db.tabela)} ORDER BY 1 DESC LIMIT 1`;
  const sqlComId = `SELECT ${colunas} FROM ${mysql.escapeId(db.tabela)} ORDER BY ${mysql.escapeId('ID')} DESC LIMIT 1`;
  let consulta = sqlComId;

  return {
    descricao: `MySQL ${db.host}/${db.database}.${db.tabela}`,
    async ler() {
      let linhas;
      try {
        [linhas] = await pool.query({ sql: consulta, timeout: 4000 });
      } catch (e) {
        // Tabela sem coluna ID: cai para a ordenação pela primeira coluna lida.
        if (e.code !== 'ER_BAD_FIELD_ERROR' || consulta === sql) throw e;
        consulta = sql;
        [linhas] = await pool.query({ sql: consulta, timeout: 4000 });
      }
      if (linhas.length === 0) throw new Error(`tabela ${db.tabela} está vazia`);
      const linha = linhas[0];
      const leitura = new Map();
      for (const s of silos) {
        const v = Number(linha[s.coluna]);
        if (!Number.isFinite(v)) throw new Error(`valor inválido na coluna ${s.coluna}: ${linha[s.coluna]}`);
        leitura.set(s.id, v);
      }
      return leitura;
    },
    fechar: () => pool.end(),
  };
}

/** Dados de demonstração: cada silo enche e esvazia em ciclos diferentes. */
function criarFonteSimulador(silos, { agora = Date.now } = {}) {
  const inicio = agora();
  return {
    descricao: 'Simulador (dados fictícios)',
    simulado: true,
    async ler() {
      const horas = (agora() - inicio) / 3_600_000;
      const leitura = new Map();
      silos.forEach((s, i) => {
        const periodoH = 1.5 + i * 0.7;
        const fase = (i * Math.PI) / 1.7;
        const fracao = 0.5 + 0.47 * Math.sin((2 * Math.PI * horas) / periodoH + fase);
        leitura.set(s.id, Math.round(s.capacidadeLitros * fracao));
      });
      return leitura;
    },
    fechar: async () => {},
  };
}

module.exports = { criarFonteMysql, criarFonteSimulador };
