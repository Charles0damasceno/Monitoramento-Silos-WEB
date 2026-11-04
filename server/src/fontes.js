'use strict';

// Origem das leituras. Toda fonte expõe `ler()` → { valores, faltando, naoCadastradas } e `fechar()`:
//   valores        Map(siloId → litros) dos silos lidos com sucesso
//   faltando       Map(siloId → motivo) dos silos sem leitura ('coluna_inexistente' | 'valor_invalido')
//   naoCadastradas nomes de colunas numéricas do banco que nenhum silo usa (silo novo na IHM?)
// Um silo com problema não derruba os outros; só falha de conexão faz `ler()` lançar erro.

const mysql = require('mysql2/promise');

const REDESCOBRIR_MS = 5 * 60_000;
const TIPO_NUMERICO = /^(tinyint|smallint|mediumint|int|integer|bigint|decimal|numeric|float|double|real)\b/i;

/**
 * Decide o que consultar a partir das colunas que existem de fato na tabela.
 * Nomes de coluna no MySQL não diferenciam maiúsculas, então a comparação também não.
 */
function planejarConsulta(colunasBanco, silos) {
  const porNome = new Map(colunasBanco.map((c) => [c.Field.toLowerCase(), c]));
  const usadas = new Set(silos.map((s) => s.coluna.toLowerCase()));
  const chave = colunasBanco.find((c) => c.Key === 'PRI');

  const existentes = [];
  const faltando = new Map();
  for (const s of silos) {
    const col = porNome.get(s.coluna.toLowerCase());
    if (col) existentes.push({ siloId: s.id, coluna: col.Field });
    else faltando.set(s.id, 'coluna_inexistente');
  }

  const naoCadastradas = colunasBanco
    .filter((c) => c !== chave && TIPO_NUMERICO.test(c.Type) && !usadas.has(c.Field.toLowerCase()))
    .map((c) => c.Field);

  return { existentes, faltando, naoCadastradas, colunaOrdem: chave?.Field ?? null };
}

/** Converte a linha lida em valores por silo; valor não numérico afeta só aquele silo. */
function interpretarLinha(linha, plano) {
  const valores = new Map();
  const faltando = new Map(plano.faltando);
  for (const { siloId, coluna } of plano.existentes) {
    const bruto = linha[coluna];
    const v = bruto === null || bruto === undefined || bruto === '' ? NaN : Number(bruto);
    if (Number.isFinite(v)) valores.set(siloId, v);
    else faltando.set(siloId, 'valor_invalido');
  }
  return { valores, faltando, naoCadastradas: plano.naoCadastradas };
}

/**
 * Lê a linha mais recente da tabela da IHM. Hoje a IHM sobrescreve uma única linha,
 * mas ORDER BY pela chave primária garante o valor certo se ela passar a inserir linhas.
 */
function criarFonteMysql(db, silosIniciais, { agora = Date.now } = {}) {
  let silos = silosIniciais;
  let colunasBanco = [];
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
  const tabela = mysql.escapeId(db.tabela);
  let plano = null;
  let descobertoEm = 0;

  // Relê a estrutura da tabela de tempos em tempos: assim uma coluna criada na IHM
  // é percebida sem reiniciar o painel.
  async function descobrir() {
    const [colunas] = await pool.query({ sql: `SHOW COLUMNS FROM ${tabela}`, timeout: 4000 });
    colunasBanco = colunas;
    plano = planejarConsulta(colunas, silos);
    descobertoEm = agora();
  }

  /**
   * Última temperatura de cada sensor: Map(sensor → { celsius, dataHora (texto da IHM) }).
   * Usa MAX(id) por sensor, então só depende da chave primária da tabela.
   */
  async function lerTemperaturas(tabelaTemp) {
    const t = mysql.escapeId(tabelaTemp);
    const [linhas] = await pool.query({
      sql: `SELECT x.Silo AS sensor, x.Temperatura AS celsius, x.data_hora AS dataHora
              FROM ${t} x JOIN (SELECT Silo, MAX(id) AS id FROM ${t} GROUP BY Silo) u ON u.id = x.id`,
      timeout: 4000,
    });
    return new Map(linhas.map((l) => [Number(l.sensor), { celsius: Number(l.celsius), dataHora: l.dataHora }]));
  }

  return {
    descricao: `MySQL ${db.host}/${db.database}.${db.tabela}`,
    lerTemperaturas,
    atualizarSilos(novos) {
      silos = novos;
      plano = null; // replaneja a consulta na próxima leitura
    },
    /** Colunas numéricas da tabela da IHM (para a tela de configurações sugerir). */
    colunasDisponiveis: () => colunasBanco
      .filter((c) => c.Key !== 'PRI' && TIPO_NUMERICO.test(c.Type))
      .map((c) => c.Field),
    async ler() {
      if (!plano || agora() - descobertoEm > REDESCOBRIR_MS) await descobrir();
      if (plano.existentes.length === 0) {
        return { valores: new Map(), faltando: new Map(plano.faltando), naoCadastradas: plano.naoCadastradas };
      }
      const colunas = plano.existentes.map((e) => mysql.escapeId(e.coluna)).join(', ');
      const ordem = plano.colunaOrdem ? ` ORDER BY ${mysql.escapeId(plano.colunaOrdem)} DESC` : '';
      let linhas;
      try {
        [linhas] = await pool.query({ sql: `SELECT ${colunas} FROM ${tabela}${ordem} LIMIT 1`, timeout: 4000 });
      } catch (e) {
        // Coluna removida depois da última descoberta: força reler a estrutura na próxima leitura.
        if (e.code === 'ER_BAD_FIELD_ERROR') plano = null;
        throw e;
      }
      if (linhas.length === 0) throw new Error(`tabela ${db.tabela} está vazia`);
      return interpretarLinha(linhas[0], plano);
    },
    fechar: () => pool.end(),
  };
}

/** Dados de demonstração: cada silo enche e esvazia em ciclos diferentes. */
function criarFonteSimulador(silosIniciais, { agora = Date.now } = {}) {
  let silos = silosIniciais;
  const inicio = agora();
  return {
    descricao: 'Simulador (dados fictícios)',
    simulado: true,
    atualizarSilos(novos) { silos = novos; },
    colunasDisponiveis: () => silos.map((s) => s.coluna),
    async ler() {
      const horas = (agora() - inicio) / 3_600_000;
      const valores = new Map();
      silos.forEach((s, i) => {
        const periodoH = 1.5 + i * 0.7;
        const fase = (i * Math.PI) / 1.7;
        const fracao = 0.5 + 0.47 * Math.sin((2 * Math.PI * horas) / periodoH + fase);
        valores.set(s.id, Math.round(s.capacidadeLitros * fracao));
      });
      return { valores, faltando: new Map(), naoCadastradas: [] };
    },
    async lerTemperaturas() {
      const horas = (agora() - inicio) / 3_600_000;
      const d = new Date(agora());
      const dataHora = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} `
        + `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      return new Map(silos.map((s, i) => [
        s.temperatura?.sensor ?? s.id,
        { celsius: Math.round((3.4 + 1.1 * Math.sin((2 * Math.PI * horas) / (0.8 + i * 0.4) + i)) * 10) / 10, dataHora },
      ]));
    },
    fechar: async () => {},
  };
}

module.exports = { criarFonteMysql, criarFonteSimulador, planejarConsulta, interpretarLinha };
