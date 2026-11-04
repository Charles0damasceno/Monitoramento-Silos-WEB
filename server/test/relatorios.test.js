'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { lerTurnos, intervaloDo, gerarRelatorio, relatorioCsv } = require('../src/relatorios');
const { abrirArmazenamento } = require('../src/armazenamento');

const TURNOS = lerTurnos('06:00-14:00,14:00-22:00,22:00-06:00');
const local = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime();

test('lerTurnos valida o formato', () => {
  assert.equal(TURNOS.length, 3);
  assert.equal(TURNOS[2].nome, '3º turno (22:00–06:00)');
  assert.throws(() => lerTurnos('6h-14h'), /TURNOS/);
  assert.throws(() => lerTurnos('25:00-06:00'), /TURNOS/);
});

test('intervalos: turno que cruza a meia-noite e dia de produção', () => {
  assert.deepEqual(
    [intervaloDo('2026-11-03', 1, TURNOS).inicio, intervaloDo('2026-11-03', 1, TURNOS).fim],
    [local(3, 6), local(3, 14)],
  );
  const t3 = intervaloDo('2026-11-03', 3, TURNOS);
  assert.deepEqual([t3.inicio, t3.fim], [local(3, 22), local(4, 6)]);
  const dia = intervaloDo('2026-11-03', 'dia', TURNOS);
  assert.deepEqual([dia.inicio, dia.fim], [local(3, 6), local(4, 6)]);
  assert.throws(() => intervaloDo('03/11/2026', 1, TURNOS), /data/);
  assert.throws(() => intervaloDo('2026-11-03', 9, TURNOS), /turno/);
});

function armazenamentoComDados() {
  const arm = abrirArmazenamento(':memory:');
  // Silo 1 no 1º turno: começa 20.000 L, enche até 80.000 L (07:00–09:00), esvazia até 30.000 L (11:00–13:00).
  for (let ts = local(3, 6); ts < local(3, 14); ts += 30_000) {
    const h = (ts - local(3, 6)) / 3_600_000;
    let litros = 20_000;
    if (h >= 1 && h < 3) litros = 20_000 + (h - 1) * 30_000;
    else if (h >= 3 && h < 5) litros = 80_000;
    else if (h >= 5 && h < 7) litros = 80_000 - (h - 5) * 25_000;
    else if (h >= 7) litros = 30_000;
    litros += ((ts / 30_000) % 3) * 40 - 40; // ruído de ±40 L
    arm.gravarAmostras(ts, [{ siloId: 1, litros: Math.round(litros) }]);
    arm.gravarTemperaturas(ts, [{ siloId: 1, celsius: 3 + (h > 4 ? 1.5 : 0) }]);
  }
  arm.registrarEvento({ ts: local(3, 9), siloId: 1, tipo: 'nivel', estado: 'alto', severidade: 'atencao', mensagem: 'Silo 1: nível alto; "teste"' });
  return arm;
}

test('relatório do turno: início, fim, entrada e saída estimadas sem somar ruído', () => {
  const arm = armazenamentoComDados();
  const config = {
    historicoMs: 30_000,
    silos: [
      { id: 1, nome: 'Silo 1', capacidadeLitros: 100_000 },
      { id: 2, nome: 'Silo 2', capacidadeLitros: 100_000 },
    ],
  };
  const r = gerarRelatorio({ config, armazenamento: arm, data: '2026-11-03', turno: '1', turnos: TURNOS });
  const s1 = r.silos[0];
  assert.ok(Math.abs(s1.inicioLitros - 20_000) <= 40);
  assert.ok(Math.abs(s1.fimLitros - 30_000) <= 40);
  assert.ok(Math.abs(s1.entradaLitros - 60_000) < 1_500, `entrada ${s1.entradaLitros}`);
  assert.ok(Math.abs(s1.saidaLitros - 50_000) < 1_500, `saída ${s1.saidaLitros}`);
  assert.equal(s1.cobertura, 100);
  assert.deepEqual(s1.temperatura, { minima: 3, maxima: 4.5, media: s1.temperatura.media });
  assert.equal(s1.alarmes, 1);
  assert.equal(r.silos[1].inicioLitros, null, 'silo sem dados aparece vazio, não zerado');
  assert.equal(r.silos[1].cobertura, 0);
  assert.equal(r.eventos.length, 1);

  const csv = relatorioCsv(r);
  assert.ok(csv.startsWith('﻿'));
  assert.match(csv, /Silo 1;\d+;\d+/);
  assert.match(csv, /"Silo 1: nível alto; ""teste"""/, 'escapa ; e aspas');
  assert.match(csv, /;3;4,5;/, 'decimal com vírgula');
});
