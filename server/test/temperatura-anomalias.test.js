'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { lerDataHora, classificarTemperatura } = require('../src/temperatura');
const { validarSilos } = require('../src/config');
const { abrirArmazenamento } = require('../src/armazenamento');
const { criarMonitor } = require('../src/monitor');
const { logSilencioso } = require('../src/log');

test('lerDataHora entende os formatos da IHM e rejeita lixo', () => {
  assert.equal(lerDataHora('03/11/2026 21:10:05'), new Date(2026, 10, 3, 21, 10, 5).getTime());
  assert.equal(lerDataHora('2026-11-03 21:10'), new Date(2026, 10, 3, 21, 10, 0).getTime());
  assert.equal(lerDataHora('31/02/2026 10:00:00'), null);
  assert.equal(lerDataHora(''), null);
  assert.equal(lerDataHora(null), null);
});

test('classificarTemperatura: limite, histerese e dado velho', () => {
  const op = { maxC: 4, validadeMs: 600_000, agora: 1_000_000 };
  assert.equal(classificarTemperatura({ celsius: 3.9, ts: 1_000_000 }, op), 'normal');
  assert.equal(classificarTemperatura({ celsius: 4.1, ts: 1_000_000 }, op), 'alta');
  assert.equal(classificarTemperatura({ celsius: 3.7, ts: 1_000_000 }, { ...op, anterior: 'alta' }), 'alta');
  assert.equal(classificarTemperatura({ celsius: 3.4, ts: 1_000_000 }, { ...op, anterior: 'alta' }), 'normal');
  assert.equal(classificarTemperatura({ celsius: 3, ts: 1_000_000 - 700_000 }, op), 'desatualizada');
  assert.equal(classificarTemperatura({ celsius: 9, ts: 1_000_000 }, { ...op, maxC: null }), 'normal');
});

test('cadastro valida o bloco de temperatura', () => {
  const base = { id: 1, nome: 'S', coluna: 'Silo1', capacidadeLitros: 10, limites: { muitoBaixo: 5, baixo: 10, alto: 90, muitoAlto: 95 } };
  assert.equal(validarSilos([base])[0].temperatura, null);
  assert.deepEqual(validarSilos([{ ...base, temperatura: {} }])[0].temperatura, { sensor: 1, maxC: null });
  assert.throws(() => validarSilos([{ ...base, temperatura: { maxC: 'quatro' } }]), /maxC/);
});

// ---------- Monitor ----------

const SILOS = validarSilos([
  { id: 1, nome: 'Silo 1', coluna: 'Silo1', capacidadeLitros: 100_000, limites: { muitoBaixo: 5, baixo: 10, alto: 90, muitoAlto: 95 }, temperatura: { sensor: 1, maxC: 4 } },
  { id: 2, nome: 'Silo 2', coluna: 'Silo2', capacidadeLitros: 100_000, limites: { muitoBaixo: 5, baixo: 10, alto: 90, muitoAlto: 95 } },
]);

function montar({ saltoPct = 5, congeladoH = 4 } = {}) {
  let relogio = new Date(2026, 10, 3, 12, 0, 0).getTime();
  const agora = () => relogio;
  let valores = new Map([[1, 50_000], [2, 30_000]]);
  let temps = new Map();
  const fonte = {
    descricao: 'teste',
    async ler() { return { valores, faltando: new Map(), naoCadastradas: [] }; },
    async lerTemperaturas() { return temps; },
    fechar: async () => {},
  };
  const config = {
    silos: SILOS, historicoMs: 30_000, leituraMs: 2000, falhasParaOffline: 3,
    temperatura: { tabela: 'temperatura_silo', intervaloMs: 30_000, validadeMs: 10 * 60_000 },
    anomalias: { saltoPct, congeladoMs: congeladoH * 3_600_000 },
  };
  const armazenamento = abrirArmazenamento(':memory:');
  const monitor = criarMonitor({ config, fonte, armazenamento, log: logSilencioso, agora });
  const fmt = (ms) => {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  return {
    monitor, armazenamento,
    definir: (m) => { valores = new Map(m); },
    temperatura: (c, idadeMs = 0) => { temps = new Map([[1, { celsius: c, dataHora: fmt(relogio - idadeMs) }]]); },
    avancar: (ms) => { relogio += ms; },
    eventos: (tipo) => armazenamento.eventos().filter((e) => e.tipo === tipo).reverse(),
  };
}

test('temperatura alta gera alarme crítico e normaliza com histerese', async () => {
  const m = montar();
  m.temperatura(3.5); await m.monitor.ciclo();
  assert.equal(m.monitor.retrato().silos[0].temperatura.estado, 'normal');
  assert.equal(m.monitor.retrato().silos[1].temperatura, null, 'silo sem sensor cadastrado');

  m.avancar(30_000); m.temperatura(4.6); await m.monitor.ciclo();
  m.avancar(30_000); m.temperatura(3.8); await m.monitor.ciclo(); // dentro da histerese
  m.avancar(30_000); m.temperatura(3.2); await m.monitor.ciclo();
  const ev = m.eventos('temperatura');
  assert.deepEqual(ev.map((e) => e.estado), ['alta', 'normal']);
  assert.equal(ev[0].severidade, 'critico');
  assert.match(ev[0].mensagem, /4,6 °C/);
});

test('temperatura com data velha aparece como desatualizada, sem alarme', async () => {
  const m = montar();
  m.temperatura(9, 30 * 60_000); await m.monitor.ciclo();
  assert.equal(m.monitor.retrato().silos[0].temperatura.estado, 'desatualizada');
  assert.equal(m.eventos('temperatura').length, 0);
});

test('tabela de temperatura inexistente desliga a função sem derrubar o nível', async () => {
  const fonte = {
    descricao: 't',
    async ler() { return { valores: new Map([[1, 1], [2, 2]]), faltando: new Map(), naoCadastradas: [] }; },
    async lerTemperaturas() { throw Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE' }); },
    fechar: async () => {},
  };
  const mon = criarMonitor({
    config: {
      silos: SILOS, historicoMs: 30_000, falhasParaOffline: 3,
      temperatura: { tabela: 'x', intervaloMs: 1, validadeMs: 1 }, anomalias: { saltoPct: 0, congeladoMs: 0 },
    },
    fonte, armazenamento: abrirArmazenamento(':memory:'), log: logSilencioso,
  });
  await mon.ciclo();
  const r = mon.retrato();
  assert.equal(r.comunicacao.status, 'ok');
  assert.equal(r.silos[0].temperatura, null);
});

test('salto impossível entre leituras gera "leitura suspeita" (uma vez a cada 10 min)', async () => {
  const m = montar({ saltoPct: 5 });
  await m.monitor.ciclo();
  m.avancar(2000); m.definir([[1, 58_000], [2, 30_000]]); await m.monitor.ciclo(); // +8.000 L em 2 s
  m.avancar(2000); m.definir([[1, 50_000], [2, 30_000]]); await m.monitor.ciclo(); // volta
  m.avancar(2000); m.definir([[1, 51_000], [2, 30_000]]); await m.monitor.ciclo(); // variação normal
  const ev = m.eventos('anomalia');
  assert.equal(ev.length, 1);
  assert.match(ev[0].mensagem, /Silo 1: leitura suspeita — variou 8\.000 L/);
});

test('níveis intermediários parados por horas = possível IHM travada', async () => {
  const m = montar({ congeladoH: 4 });
  await m.monitor.ciclo();
  for (let h = 0; h < 5; h++) { m.avancar(3_600_000); await m.monitor.ciclo(); }
  assert.ok(m.monitor.retrato().congelado);
  m.avancar(2000); m.definir([[1, 50_500], [2, 30_000]]); await m.monitor.ciclo();
  assert.equal(m.monitor.retrato().congelado, null);
  assert.deepEqual(m.eventos('anomalia').map((e) => e.estado), ['congelado', 'ok']);
});

test('silos vazios parados não contam como congelado', async () => {
  const m = montar({ congeladoH: 1 });
  m.definir([[1, 0], [2, 0]]);
  await m.monitor.ciclo();
  for (let h = 0; h < 5; h++) { m.avancar(3_600_000); await m.monitor.ciclo(); }
  assert.equal(m.eventos('anomalia').length, 0);
});
