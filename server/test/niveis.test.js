'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ESTADOS: E, classificar, vazaoLitrosPorHora, previsao, percentual } = require('../src/niveis');

const LIM = { muitoBaixo: 5, baixo: 10, alto: 90, muitoAlto: 95 };

test('percentual trata capacidade inválida', () => {
  assert.equal(percentual(50_000, 100_000), 50);
  assert.equal(percentual(10, 0), null);
  assert.equal(percentual(NaN, 100), null);
});

test('classifica as cinco faixas a partir do normal', () => {
  assert.equal(classificar(50, LIM), E.NORMAL);
  assert.equal(classificar(90, LIM), E.ALTO);
  assert.equal(classificar(95, LIM), E.MUITO_ALTO);
  assert.equal(classificar(10, LIM), E.BAIXO);
  assert.equal(classificar(5, LIM), E.MUITO_BAIXO);
  assert.equal(classificar(0, LIM), E.MUITO_BAIXO);
});

test('histerese: oscilar em torno do limite não troca de estado', () => {
  let estado = classificar(90.1, LIM, E.NORMAL);
  assert.equal(estado, E.ALTO);
  for (const pct of [89.9, 90.2, 88.5, 89.0]) {
    estado = classificar(pct, LIM, estado);
    assert.equal(estado, E.ALTO, `em ${pct}% deveria continuar ALTO`);
  }
  assert.equal(classificar(87.9, LIM, estado), E.NORMAL);
});

test('histerese do muito alto desce para alto, não direto para normal', () => {
  assert.equal(classificar(93.5, LIM, E.MUITO_ALTO), E.MUITO_ALTO);
  assert.equal(classificar(92, LIM, E.MUITO_ALTO), E.ALTO);
  assert.equal(classificar(89, LIM, E.MUITO_ALTO), E.ALTO);
  assert.equal(classificar(87, LIM, E.MUITO_ALTO), E.NORMAL);
});

test('histerese na parte baixa', () => {
  assert.equal(classificar(11, LIM, E.BAIXO), E.BAIXO);
  assert.equal(classificar(12.5, LIM, E.BAIXO), E.NORMAL);
  assert.equal(classificar(6, LIM, E.MUITO_BAIXO), E.MUITO_BAIXO);
  assert.equal(classificar(8, LIM, E.MUITO_BAIXO), E.BAIXO);
});

test('silo vazio: informativo, e encher a partir do vazio não dispara alarme de nível baixo', () => {
  const V = 0.5;
  assert.equal(classificar(0, LIM, E.NORMAL, 2, V), E.VAZIO, 'vazio na partida não é alarme');
  assert.equal(classificar(0.7, LIM, E.VAZIO, 2, V), E.VAZIO, 'histerese de 0,5 ponto na saída do vazio');
  let estado = E.VAZIO;
  for (const pct of [1.5, 4, 8, 10]) {
    estado = classificar(pct, LIM, estado, 2, V);
    assert.equal(estado, E.ENCHENDO, `em ${pct}% enchendo, sem alarme`);
  }
  estado = classificar(30, LIM, estado, 2, V);
  assert.equal(estado, E.NORMAL);
  // Descendo a partir do normal, os alarmes de nível baixo valem.
  assert.equal(classificar(9, LIM, estado, 2, V), E.BAIXO);
  assert.equal(classificar(3, LIM, E.BAIXO, 2, V), E.MUITO_BAIXO);
  assert.equal(classificar(0.2, LIM, E.MUITO_BAIXO, 2, V), E.VAZIO, 'esvaziou: o alarme termina');
});

test('com vazioPct = 0 o comportamento antigo é mantido', () => {
  assert.equal(classificar(0, LIM, E.NORMAL, 2, 0), E.MUITO_BAIXO);
  assert.equal(classificar(4, LIM, E.VAZIO, 2, 0), E.MUITO_BAIXO);
});

test('leitura nula mantém o estado anterior', () => {
  assert.equal(classificar(null, LIM, E.ALTO), E.ALTO);
});

const serie = (litrosIniciais, lPorMin, minutos) =>
  Array.from({ length: minutos + 1 }, (_, m) => ({ ts: m * 60_000, litros: litrosIniciais + lPorMin * m }));

test('vazão por regressão: 100 L/min = 6000 L/h', () => {
  assert.equal(Math.round(vazaoLitrosPorHora(serie(10_000, 100, 10))), 6000);
  assert.equal(Math.round(vazaoLitrosPorHora(serie(50_000, -50, 10))), -3000);
});

test('vazão resiste a uma leitura com ruído', () => {
  const pontos = serie(10_000, 100, 10);
  pontos[5].litros += 5_000; // pico isolado
  const v = vazaoLitrosPorHora(pontos);
  assert.ok(v > 4000 && v < 8000, `vazão ${v} deveria ficar perto de 6000`);
});

test('vazão exige pontos e janela mínimos', () => {
  assert.equal(vazaoLitrosPorHora([]), null);
  assert.equal(vazaoLitrosPorHora(serie(0, 10, 1)), null);
  assert.equal(vazaoLitrosPorHora([{ ts: 0, litros: 1 }, { ts: 30_000, litros: 2 }, { ts: 60_000, litros: 3 }]), null);
});

test('previsão de enchimento e esvaziamento', () => {
  assert.deepEqual(previsao(40_000, 100_000, 6000), { tendencia: 'enchendo', horas: 10 });
  assert.deepEqual(previsao(30_000, 100_000, -10_000), { tendencia: 'esvaziando', horas: 3 });
  assert.deepEqual(previsao(30_000, 100_000, 100), { tendencia: 'estavel', horas: null });
  assert.deepEqual(previsao(30_000, 100_000, null), { tendencia: 'desconhecida', horas: null });
});
