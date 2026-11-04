'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { criarNotificador } = require('../src/notificador');
const { carregarConfig } = require('../src/config');
const { logSilencioso } = require('../src/log');

const CHAT = '-100123';

function telegramFalso() {
  const enviadas = [];
  const editadas = [];
  const cliques = [];
  let proximoId = 1;
  let falhar = null;
  return {
    enviadas, editadas, cliques,
    falhar: (e) => { falhar = e; },
    async enviar(chat, texto, botoes) {
      if (falhar) throw falhar;
      enviadas.push({ chat, texto, botoes });
      return proximoId++;
    },
    async editar(chat, id, texto) { editadas.push({ id, texto }); },
    async responderClique(id, texto) { cliques.push(texto); },
    async atualizacoes() { return new Promise(() => {}); },
  };
}

function montar({ severidadeMinima = 'critico', repetirMs = 15 * 60_000, reconhecer = true } = {}) {
  let relogio = 1_700_000_000_000;
  const agora = () => relogio;
  const monitor = {
    eventos: new EventEmitter(),
    retrato: () => ({
      comunicacao: { status: 'ok' },
      silos: [{ nome: 'Silo 1', percentual: 51.1, litros: 51_100, estado: 'normal', desatualizado: false }],
    }),
  };
  const reconhecidos = new Map();
  const armazenamento = {
    reconhecerEvento(id, por) {
      if (reconhecidos.has(id)) return false;
      reconhecidos.set(id, por);
      return true;
    },
  };
  const cliente = telegramFalso();
  const config = { telegram: { chatId: CHAT, reconhecer }, notificacoes: { severidadeMinima, repetirMs } };
  const n = criarNotificador({ config, monitor, armazenamento, cliente, log: logSilencioso, agora });
  n.iniciar();
  const emitir = async (e) => { monitor.eventos.emit('evento', { ts: relogio, ...e }); await n.processarFila(); };
  return { n, cliente, monitor, emitir, reconhecidos, avancar: (ms) => { relogio += ms; } };
}

const alarme = (id, extra = {}) => ({
  id, siloId: 2, tipo: 'nivel', estado: 'muito_alto', severidade: 'critico', mensagem: 'Silo 2: nível MUITO ALTO (95,2%)', ...extra,
});
const normal = (id) => ({ id, siloId: 2, tipo: 'nivel', estado: 'normal', severidade: null, mensagem: 'Silo 2: voltou ao nível normal (85,0%)' });

test('alarme crítico vai para o chat com botão de reconhecer', async (t) => {
  const { n, cliente, emitir } = montar();
  t.after(n.parar);
  await emitir(alarme(10));
  assert.equal(cliente.enviadas.length, 1);
  assert.match(cliente.enviadas[0].texto, /ALARME CRÍTICO/);
  assert.match(cliente.enviadas[0].texto, /MUITO ALTO/);
  assert.equal(cliente.enviadas[0].chat, CHAT);
  assert.equal(cliente.enviadas[0].botoes[0][0].callback_data, 'ack:10');
});

test('respeita a severidade mínima e ignora eventos de sistema', async (t) => {
  const { n, cliente, emitir } = montar({ severidadeMinima: 'critico' });
  t.after(n.parar);
  await emitir({ id: 1, siloId: 1, tipo: 'nivel', estado: 'alto', severidade: 'atencao', mensagem: 'Silo 1: nível alto' });
  await emitir({ id: 2, tipo: 'sistema', estado: 'inicio', mensagem: 'Monitor iniciado' });
  await emitir({ id: 3, siloId: 1, tipo: 'nivel', estado: 'normal', mensagem: 'Silo 1: voltou ao normal' });
  assert.equal(cliente.enviadas.length, 0, 'nada notificado, então "normalizado" também não é enviado');
});

test('avisa quando normaliza, só se o alarme tinha sido enviado', async (t) => {
  const { n, cliente, emitir } = montar();
  t.after(n.parar);
  await emitir(alarme(10));
  await emitir(normal(11));
  assert.equal(cliente.enviadas.length, 2);
  assert.match(cliente.enviadas[1].texto, /Normalizado/);
  assert.equal(cliente.enviadas[1].botoes, undefined);
});

test('repete o lembrete enquanto ninguém reconhece', async (t) => {
  const { n, cliente, emitir, avancar } = montar({ repetirMs: 15 * 60_000 });
  t.after(n.parar);
  await emitir(alarme(10));
  avancar(10 * 60_000); n.ciclo(); await n.processarFila();
  assert.equal(cliente.enviadas.length, 1, 'antes de 15 min não repete');
  avancar(6 * 60_000); n.ciclo(); await n.processarFila();
  assert.equal(cliente.enviadas.length, 2);
  assert.match(cliente.enviadas[1].texto, /Lembrete.*16 min/);
});

test('reconhecer pelo painel para os lembretes e edita as mensagens', async (t) => {
  const { n, cliente, emitir, monitor, avancar } = montar();
  t.after(n.parar);
  await emitir(alarme(10));
  avancar(16 * 60_000); n.ciclo(); await n.processarFila();
  monitor.eventos.emit('reconhecido', { id: 10, por: 'Maria', em: Date.UTC(2026, 10, 3, 21, 30) });
  await new Promise((ok) => setImmediate(ok));
  assert.equal(cliente.editadas.length, 2, 'alarme original e lembrete');
  assert.match(cliente.editadas[0].texto, /Reconhecido por Maria/);

  avancar(60 * 60_000); n.ciclo(); await n.processarFila();
  assert.equal(cliente.enviadas.length, 2, 'sem novos lembretes');
});

test('alarme que normaliza para de gerar lembretes', async (t) => {
  const { n, cliente, emitir, avancar } = montar();
  t.after(n.parar);
  await emitir(alarme(10));
  await emitir(normal(11));
  avancar(60 * 60_000); n.ciclo(); await n.processarFila();
  assert.equal(cliente.enviadas.length, 2);
});

test('botão do Telegram reconhece, só no chat configurado e só uma vez', async (t) => {
  const { n, cliente, emitir, reconhecidos } = montar();
  t.after(n.parar);
  await emitir(alarme(10));
  const clique = (chatId) => ({
    callback_query: { id: 'c1', data: 'ack:10', from: { first_name: 'João', last_name: 'Silva' }, message: { chat: { id: chatId } } },
  });
  await n.tratarAtualizacao(clique(-999));
  assert.equal(reconhecidos.size, 0, 'outro chat não reconhece');
  await n.tratarAtualizacao(clique(Number(CHAT)));
  assert.equal(reconhecidos.get(10), 'João Silva (Telegram)');
  await n.tratarAtualizacao(clique(Number(CHAT)));
  assert.deepEqual(cliente.cliques, ['Não autorizado.', 'Alarme reconhecido.', 'Este alarme já estava reconhecido.']);
});

test('comando /status responde com o nível atual', async (t) => {
  const { n, cliente } = montar();
  t.after(n.parar);
  await n.tratarAtualizacao({ message: { text: '/status@PainelSilosBot', chat: { id: Number(CHAT) } } });
  await n.processarFila();
  assert.match(cliente.enviadas[0].texto, /Silo 1<\/b>: 51,1% \(51\.100 L\)/);
});

test('sem internet: guarda na fila e envia quando voltar', async (t) => {
  const { n, cliente, emitir } = montar();
  t.after(n.parar);
  cliente.falhar(Object.assign(new Error('sem conexão com api.telegram.org'), { codigo: null }));
  await emitir(alarme(10));
  assert.equal(n.status().status, 'falha');
  assert.equal(n.status().naFila, 1);
  cliente.falhar(null);
  n.ciclo(); await n.processarFila();
  assert.equal(cliente.enviadas.length, 1);
  assert.equal(n.status().status, 'ok');
});

test('mensagem do banco é escapada (HTML do Telegram)', async (t) => {
  const { n, cliente, emitir } = montar();
  t.after(n.parar);
  await emitir(alarme(10, { mensagem: 'Silo <b>&' }));
  assert.match(cliente.enviadas[0].texto, /Silo &lt;b&gt;&amp;/);
});

test('config do Telegram: exige token e chat juntos e valida formato', () => {
  const base = { FONTE_DADOS: 'simulador' };
  assert.equal(carregarConfig({ env: base }).telegram, null);
  assert.throws(() => carregarConfig({ env: { ...base, TELEGRAM_TOKEN: '123:' + 'a'.repeat(35) } }), /TELEGRAM_CHAT_ID/);
  assert.throws(() => carregarConfig({ env: { ...base, TELEGRAM_TOKEN: 'xyz', TELEGRAM_CHAT_ID: '1' } }), /formato/);
  assert.throws(() => carregarConfig({ env: { ...base, TELEGRAM_TOKEN: '123:' + 'a'.repeat(35), TELEGRAM_CHAT_ID: '@grupo' } }), /número/);
  const c = carregarConfig({ env: { ...base, TELEGRAM_TOKEN: '123:' + 'a'.repeat(35), TELEGRAM_CHAT_ID: '-100123', NOTIFICAR_REPETIR_MIN: '0' } });
  assert.equal(c.telegram.chatId, '-100123');
  assert.equal(c.notificacoes.repetirMs, 0);
});
