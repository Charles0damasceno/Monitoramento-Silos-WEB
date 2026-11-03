'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { validarSilos, carregarConfig } = require('../src/config');
const { abrirArmazenamento } = require('../src/armazenamento');
const { criarMonitor } = require('../src/monitor');
const { criarCadastro, criarSessoes, criarLimitador, conferirSenha, gerarHash } = require('../src/autenticacao');
const { criarApp } = require('../src/app');
const { logSilencioso } = require('../src/log');

const SILOS = validarSilos([
  { id: 1, nome: 'Silo 1', coluna: 'Silo1', capacidadeLitros: 100_000, limites: { muitoBaixo: 5, baixo: 10, alto: 90, muitoAlto: 95 } },
  { id: 2, nome: 'Silo 2', coluna: 'Silo2', capacidadeLitros: 50_000, limites: { muitoBaixo: 5, baixo: 10, alto: 90, muitoAlto: 95 } },
]);

function fonteControlada(inicial) {
  let valores = new Map(inicial);
  let erro = null;
  return {
    descricao: 'teste',
    definir: (m) => { valores = new Map(m); },
    falhar: (e) => { erro = e; },
    async ler() { if (erro) throw erro; return valores; },
    fechar: async () => {},
  };
}

function montar({ loginObrigatorio = true } = {}) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'silos-teste-'));
  let relogio = 1_000_000;
  const agora = () => relogio;
  const config = {
    silos: SILOS, historicoMs: 30_000, leituraMs: 2000, falhasParaOffline: 2, retencaoDias: 30,
    loginObrigatorio, pastaWeb: path.join(pasta, 'sem-site'),
  };
  const fonte = fonteControlada([[1, 50_000], [2, 25_000]]);
  const armazenamento = abrirArmazenamento(':memory:');
  const cadastro = criarCadastro(path.join(pasta, 'usuarios.json'));
  cadastro.salvar({ usuario: 'operador', nome: 'Operador Teste', senha: 'senha-segura-1' });
  const sessoes = criarSessoes(armazenamento, { dias: 30, agora });
  const monitor = criarMonitor({ config, fonte, armazenamento, log: logSilencioso, agora });
  const app = criarApp({ config, monitor, armazenamento, cadastro, sessoes, log: logSilencioso, agora });
  return { config, fonte, armazenamento, monitor, app, avancar: (ms) => { relogio += ms; }, pasta };
}

async function iniciarHttp(app) {
  const servidor = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  let cookie = '';
  const req = async (metodo, rota, corpo, cab = {}) => {
    const r = await fetch(base + rota, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }), ...cab },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const texto = await r.text();
    return { status: r.status, corpo: texto ? JSON.parse(texto) : null, headers: r.headers };
  };
  return { req, fechar: () => { servidor.closeAllConnections(); servidor.close(); } };
}

// ---------- Configuração ----------

test('config rejeita coluna com SQL e limites fora de ordem', () => {
  const base = { id: 1, nome: 'X', coluna: 'Silo1', capacidadeLitros: 1, limites: { muitoBaixo: 5, baixo: 10, alto: 90, muitoAlto: 95 } };
  assert.throws(() => validarSilos([{ ...base, coluna: 'Silo1; DROP TABLE silo' }]), /coluna/);
  assert.throws(() => validarSilos([{ ...base, limites: { muitoBaixo: 5, baixo: 95, alto: 90, muitoAlto: 99 } }]), /limites/);
  assert.throws(() => validarSilos([base, base]), /único/);
});

test('config exige credenciais quando a fonte é mysql', () => {
  assert.throws(() => carregarConfig({ env: { FONTE_DADOS: 'mysql' } }), /DB_HOST/);
  const c = carregarConfig({ env: { FONTE_DADOS: 'simulador', PORT: '8080' } });
  assert.equal(c.porta, 8080);
  assert.throws(() => carregarConfig({ env: { FONTE_DADOS: 'simulador', PORT: 'abc' } }), /PORT/);
});

// ---------- Senhas e limitador ----------

test('hash de senha confere e não aceita senha errada', () => {
  const h = gerarHash('minha-senha');
  assert.ok(conferirSenha('minha-senha', h));
  assert.ok(!conferirSenha('outra-senha', h));
  assert.ok(!conferirSenha('x', 'lixo'));
});

test('limitador bloqueia após 5 falhas e libera após a janela', () => {
  let t = 0;
  const lim = criarLimitador({ agora: () => t });
  for (let i = 0; i < 5; i++) lim.falhou('ip|u');
  assert.ok(lim.bloqueado('ip|u'));
  t += 15 * 60_000 + 1;
  assert.ok(!lim.bloqueado('ip|u'));
});

// ---------- Monitor ----------

test('monitor gera evento ao entrar e sair de alarme, sem repetir', async () => {
  const { fonte, armazenamento, monitor, avancar } = montar();
  await monitor.ciclo();
  fonte.definir([[1, 91_000], [2, 25_000]]);
  for (let i = 0; i < 5; i++) { avancar(2000); await monitor.ciclo(); }
  fonte.definir([[1, 85_000], [2, 25_000]]);
  avancar(2000); await monitor.ciclo();

  const ev = armazenamento.eventos().filter((e) => e.tipo === 'nivel').map((e) => e.estado);
  assert.deepEqual(ev, ['normal', 'alto']); // mais recente primeiro
  assert.equal(monitor.retrato().silos[0].estado, 'normal');
});

test('monitor declara SEM COMUNICAÇÃO e marca dados como desatualizados', async () => {
  const { fonte, armazenamento, monitor, avancar } = montar();
  await monitor.ciclo();
  fonte.falhar(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
  avancar(2000); await monitor.ciclo();
  assert.equal(monitor.retrato().comunicacao.status, 'ok', 'uma falha só ainda não é offline');
  avancar(2000); await monitor.ciclo();

  const r = monitor.retrato();
  assert.equal(r.comunicacao.status, 'falha');
  assert.equal(r.silos[0].desatualizado, true);
  assert.equal(r.silos[0].litros, 50_000, 'mantém o último valor real, nunca inventa');

  fonte.falhar(null);
  avancar(2000); await monitor.ciclo();
  const tipos = armazenamento.eventos().filter((e) => e.tipo === 'comunicacao').map((e) => e.estado);
  assert.deepEqual(tipos, ['ok', 'offline']);
});

test('monitor grava histórico no intervalo configurado e calcula vazão', async () => {
  const { fonte, armazenamento, monitor, avancar } = montar();
  for (let m = 0; m <= 10; m++) {
    fonte.definir([[1, 20_000 + m * 100], [2, 25_000]]); // +100 L/min
    for (let s = 0; s < 30; s++) { await monitor.ciclo(); avancar(2000); }
  }
  const pontos = armazenamento.amostrasDesde(1, 0);
  // 11 minutos simulados, um ponto a cada 30 s.
  assert.ok(pontos.length >= 21 && pontos.length <= 23, `pontos gravados: ${pontos.length}`);
  const silo = monitor.retrato().silos[0];
  assert.ok(Math.abs(silo.vazaoLh - 6000) < 800, `vazão ${silo.vazaoLh}`);
  assert.equal(silo.previsao.tendencia, 'enchendo');
});

// ---------- HTTP ----------

test('rotas exigem login; login, retrato, histórico e logout', async (t) => {
  const { app, monitor } = montar();
  await monitor.ciclo();
  const http = await iniciarHttp(app);
  t.after(http.fechar);

  assert.equal((await http.req('GET', '/api/retrato')).status, 401);
  assert.equal((await http.req('GET', '/api/saude')).status, 200);

  const errado = await http.req('POST', '/api/login', { usuario: 'operador', senha: 'errada' });
  assert.equal(errado.status, 401);
  const inexistente = await http.req('POST', '/api/login', { usuario: 'ninguem', senha: 'x' });
  assert.equal(inexistente.corpo.erro, errado.corpo.erro, 'não revela se o usuário existe');

  const ok = await http.req('POST', '/api/login', { usuario: 'OPERADOR', senha: 'senha-segura-1' });
  assert.equal(ok.status, 200);
  assert.equal(ok.corpo.nome, 'Operador Teste');

  const r = await http.req('GET', '/api/retrato');
  assert.equal(r.status, 200);
  assert.equal(r.corpo.silos.length, 2);
  assert.equal(r.corpo.silos[1].percentual, 50);
  assert.equal(JSON.stringify(r.corpo).includes('password'), false);

  assert.equal((await http.req('GET', '/api/historico?periodo=24h')).status, 200);
  assert.equal((await http.req('GET', '/api/historico?periodo=1ano')).status, 400);

  assert.equal((await http.req('POST', '/api/logout')).status, 204);
  assert.equal((await http.req('GET', '/api/retrato')).status, 401);
});

test('POST de outra origem é recusado (CSRF)', async (t) => {
  const { app } = montar();
  const http = await iniciarHttp(app);
  t.after(http.fechar);
  const r = await http.req('POST', '/api/login', { usuario: 'operador', senha: 'senha-segura-1' }, { Origin: 'http://site-malicioso.com' });
  assert.equal(r.status, 403);
});

test('reconhecer alarme registra quem reconheceu e não reconhece duas vezes', async (t) => {
  const { app, monitor, fonte, armazenamento, avancar } = montar();
  await monitor.ciclo();
  fonte.definir([[1, 99_000], [2, 25_000]]);
  avancar(2000); await monitor.ciclo();
  const alarme = armazenamento.eventos().find((e) => e.estado === 'muito_alto');

  const http = await iniciarHttp(app);
  t.after(http.fechar);
  await http.req('POST', '/api/login', { usuario: 'operador', senha: 'senha-segura-1' });
  assert.equal((await http.req('POST', `/api/eventos/${alarme.id}/reconhecer`)).status, 204);
  assert.equal((await http.req('POST', `/api/eventos/${alarme.id}/reconhecer`)).status, 409);
  const ev = (await http.req('GET', '/api/eventos')).corpo.find((e) => e.id === alarme.id);
  assert.equal(ev.reconhecido_por, 'Operador Teste');
});

test('cabeçalhos de segurança presentes', async (t) => {
  const { app } = montar();
  const http = await iniciarHttp(app);
  t.after(http.fechar);
  const r = await http.req('GET', '/api/saude');
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('saúde responde 503 quando o banco está fora', async (t) => {
  const { app, monitor, fonte, avancar } = montar();
  fonte.falhar(new Error('fora'));
  await monitor.ciclo(); avancar(2000); await monitor.ciclo();
  const http = await iniciarHttp(app);
  t.after(http.fechar);
  const r = await http.req('GET', '/api/saude');
  assert.equal(r.status, 503);
  assert.equal(r.corpo.comunicacao, 'falha');
});
