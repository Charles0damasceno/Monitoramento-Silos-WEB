'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { criarBackup } = require('../src/backup');
const { abrirArmazenamento } = require('../src/armazenamento');
const { logSilencioso } = require('../src/log');

test('backup gera cópia legível, não repete no mesmo dia e apaga os antigos', () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'silos-backup-'));
  const destino = path.join(pasta, 'backups');
  const arm = abrirArmazenamento(path.join(pasta, 'historico.db'));
  arm.gravarAmostras(1000, [{ siloId: 1, litros: 1234 }]);
  fs.writeFileSync(path.join(pasta, 'usuarios.json'), '{"usuarios":[]}');
  fs.mkdirSync(destino);
  fs.writeFileSync(path.join(destino, 'historico-2020-01-01.db'), 'velho');
  fs.writeFileSync(path.join(destino, 'outro-arquivo.txt'), 'não mexer');

  let relogio = new Date(2026, 10, 3, 2, 0).getTime(); // 02:00, antes da hora marcada
  const b = criarBackup({ armazenamento: arm, pastaDados: pasta, destino, manterDias: 14, hora: 3 * 60, log: logSilencioso, agora: () => relogio });
  b.iniciar();
  assert.equal(fs.existsSync(path.join(destino, 'historico-2026-11-03.db')), false, 'antes das 03:00 não faz');
  b.parar();

  relogio = new Date(2026, 10, 3, 3, 5).getTime();
  b.iniciar();
  b.parar();
  const copia = path.join(destino, 'historico-2026-11-03.db');
  assert.ok(fs.existsSync(copia));
  assert.ok(fs.existsSync(path.join(destino, 'usuarios-2026-11-03.json')));
  assert.equal(fs.existsSync(path.join(destino, 'historico-2020-01-01.db')), false, 'antigo apagado');
  assert.ok(fs.existsSync(path.join(destino, 'outro-arquivo.txt')), 'arquivos de outros programas ficam');

  const db = new DatabaseSync(copia, { readOnly: true });
  assert.equal(db.prepare('SELECT litros FROM amostras').get().litros, 1234);
  db.close();
  assert.equal(b.status().arquivo, copia);
  arm.fechar();
});
