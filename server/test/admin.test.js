'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { validarSilos } = require('../src/config');
const { abrirArmazenamento } = require('../src/armazenamento');
const { criarMonitor } = require('../src/monitor');
const { criarCadastro, criarSessoes } = require('../src/autenticacao');
const { criarApp } = require('../src/app');
const { criarFonteSimulador } = require('../src/fontes');
const { logSilencioso } = require('../src/log');

const LIM = { muitoBaixo: 5, baixo: 10, alto: 90, muitoAlto: 95 };
const SILO = (id, extra = {}) => ({ id, nome: `Silo ${id}`, coluna: `Silo${id}`, capacidadeLitros: 100_000, limites: LIM, ...extra });

async function montar() {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'silos-admin-'));
  const arquivoSilos = path.join(pasta, 'silos.json');
  fs.writeFileSync(arquivoSilos, JSON.stringify({ $comentario: 'teste', silos: [SILO(1), SILO(2)] }));
  const config = {
    silos: validarSilos([SILO(1), SILO(2)]), arquivoSilos, historicoMs: 30_000, leituraMs: 2000, falhasParaOffline: 3,
    loginObrigatorio: true, pastaWeb: path.join(pasta, 'sem-site'), turnos: [], retencaoDias: 30, sessaoDias: 30,
    notificacoes: { severidadeMinima: 'critico', repetirMs: 0 }, backup: {},
  };
  const armazenamento = abrirArmazenamento(':memory:');
  const cadastro = criarCadastro(path.join(pasta, 'usuarios.json'));
  cadastro.salvar({ usuario: 'chefe', nome: 'Chefe', papel: 'admin', senha: 'senha-admin-1' });
  cadastro.salvar({ usuario: 'oper', nome: 'Operador', papel: 'operador', senha: 'senha-oper-1' });
  const sessoes = criarSessoes(armazenamento, { dias: 30 });
  const fonte = criarFonteSimulador(config.silos);
  const monitor = criarMonitor({ config, fonte, armazenamento, log: logSilencioso });
  await monitor.ciclo();
  const app = criarApp({ config, monitor, armazenamento, cadastro, sessoes, log: logSilencioso, fonte });

  const servidor = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const cliente = () => {
    let cookie = '';
    return async (metodo, rota, corpo) => {
      const r = await fetch(base + rota, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      const set = r.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const texto = await r.text();
      return { status: r.status, corpo: texto ? JSON.parse(texto) : null };
    };
  };
  const admin = cliente();
  const oper = cliente();
  await admin('POST', '/api/login', { usuario: 'chefe', senha: 'senha-admin-1' });
  await oper('POST', '/api/login', { usuario: 'oper', senha: 'senha-oper-1' });
  return {
    config, armazenamento, monitor, cadastro, arquivoSilos, admin, oper, cliente,
    fechar: () => { servidor.closeAllConnections(); servidor.close(); },
  };
}

test('operador não acessa nenhuma rota de administração', async (t) => {
  const m = await montar();
  t.after(m.fechar);
  for (const [metodo, rota] of [['GET', '/api/admin/silos'], ['PUT', '/api/admin/silos'], ['GET', '/api/admin/usuarios'],
    ['POST', '/api/admin/usuarios'], ['DELETE', '/api/admin/usuarios/chefe'], ['GET', '/api/admin/sistema'], ['GET', '/api/admin/auditoria']]) {
    assert.equal((await m.oper(metodo, rota, metodo === 'GET' ? undefined : {})).status, 403, `${metodo} ${rota}`);
  }
  assert.equal((await m.cliente()('GET', '/api/admin/silos')).status, 401, 'sem login');
});

test('adicionar silo pela tela: grava o arquivo, guarda a versão anterior e aparece na hora', async (t) => {
  const m = await montar();
  t.after(m.fechar);
  const r = await m.admin('PUT', '/api/admin/silos', {
    silos: [SILO(1), SILO(2, { nome: 'Silo 2 - Pasteurizado' }), SILO(3, { capacidadeLitros: 150_000, temperatura: { sensor: 3, maxC: 4 } })],
  });
  assert.equal(r.status, 200);

  const gravado = JSON.parse(fs.readFileSync(m.arquivoSilos, 'utf8'));
  assert.equal(gravado.$comentario, 'teste', 'preserva o comentário do arquivo');
  assert.equal(gravado.silos.length, 3);
  assert.deepEqual(gravado.silos[2].temperatura, { sensor: 3, maxC: 4 });
  assert.equal(gravado.silos[0].temperatura, undefined, 'não grava "temperatura: null"');
  const anterior = JSON.parse(fs.readFileSync(m.arquivoSilos.replace('.json', '.anterior.json'), 'utf8'));
  assert.equal(anterior.silos.length, 2);

  const retrato = m.monitor.retrato();
  assert.deepEqual(retrato.silos.map((s) => s.nome), ['Silo 1', 'Silo 2 - Pasteurizado', 'Silo 3']);
  assert.notEqual(retrato.silos[2].litros, null, 'silo novo já lido, sem reiniciar');

  const aud = (await m.admin('GET', '/api/admin/auditoria')).corpo.find((a) => a.acao === 'silos_alterados');
  assert.match(aud.detalhe, /\+ Silo 3 \(Silo3\)/);
  assert.match(aud.detalhe, /~ Silo 2 - Pasteurizado/);
  assert.equal(aud.usuario, 'chefe');
});

test('cadastro inválido é recusado e nada é gravado', async (t) => {
  const m = await montar();
  t.after(m.fechar);
  const antes = fs.readFileSync(m.arquivoSilos, 'utf8');
  for (const silos of [
    [],
    [SILO(1), SILO(2, { coluna: 'Silo1' })],
    [SILO(1, { limites: { muitoBaixo: 5, baixo: 95, alto: 90, muitoAlto: 99 } })],
    [SILO(1, { coluna: 'x; DROP TABLE silo' })],
  ]) {
    const r = await m.admin('PUT', '/api/admin/silos', { silos });
    assert.equal(r.status, 400, JSON.stringify(silos).slice(0, 80));
  }
  assert.equal(fs.readFileSync(m.arquivoSilos, 'utf8'), antes);
});

test('id de silo removido que tem histórico não pode ser reaproveitado', async (t) => {
  const m = await montar();
  t.after(m.fechar);
  m.armazenamento.gravarAmostras(1000, [{ siloId: 2, litros: 10 }]);
  assert.equal((await m.admin('PUT', '/api/admin/silos', { silos: [SILO(1)] })).status, 200);
  const r = await m.admin('PUT', '/api/admin/silos', { silos: [SILO(1), SILO(2, { nome: 'Outro silo' })] });
  assert.equal(r.status, 400);
  assert.match(r.corpo.mensagem, /id 2 já pertenceu/);
});

test('usuários: criar, trocar senha (derruba a sessão), travas do último admin e do próprio usuário', async (t) => {
  const m = await montar();
  t.after(m.fechar);
  assert.equal((await m.admin('POST', '/api/admin/usuarios', { usuario: 'Joao', nome: 'João', senha: 'curta' })).status, 400);
  const criado = await m.admin('POST', '/api/admin/usuarios', { usuario: 'Joao', nome: 'João', senha: 'senha-joao-1' });
  assert.equal(criado.status, 201);
  assert.equal(criado.corpo.usuario, 'joao');
  assert.equal(criado.corpo.senha, undefined, 'hash da senha nunca sai na API');
  assert.equal((await m.admin('POST', '/api/admin/usuarios', { usuario: 'joao', senha: 'senha-joao-1' })).status, 409);

  // Troca da senha do operador derruba a sessão dele.
  assert.equal((await m.oper('GET', '/api/retrato')).status, 200);
  assert.equal((await m.admin('PATCH', '/api/admin/usuarios/oper', { senha: 'nova-senha-op' })).status, 200);
  assert.equal((await m.oper('GET', '/api/retrato')).status, 401);
  const novo = m.cliente();
  assert.equal((await novo('POST', '/api/login', { usuario: 'oper', senha: 'nova-senha-op' })).status, 200);

  // Admin troca a própria senha e continua logado.
  assert.equal((await m.admin('PATCH', '/api/admin/usuarios/chefe', { senha: 'outra-senha-chefe' })).status, 200);
  assert.equal((await m.admin('GET', '/api/admin/usuarios')).status, 200);

  assert.equal((await m.admin('DELETE', '/api/admin/usuarios/chefe')).status, 409, 'não remove a si mesmo');
  assert.equal((await m.admin('PATCH', '/api/admin/usuarios/chefe', { papel: 'operador' })).status, 409, 'último admin');
  assert.equal((await m.admin('DELETE', '/api/admin/usuarios/joao')).status, 204);
  assert.equal(m.cadastro.buscar('joao'), null);

  const acoes = (await m.admin('GET', '/api/admin/auditoria')).corpo.map((a) => a.acao);
  for (const a of ['usuario_criado', 'usuario_alterado', 'usuario_removido', 'login']) assert.ok(acoes.includes(a), a);
});

test('login recusado vai para a auditoria', async (t) => {
  const m = await montar();
  t.after(m.fechar);
  await m.cliente()('POST', '/api/login', { usuario: 'chefe', senha: 'errada' });
  const aud = (await m.admin('GET', '/api/admin/auditoria')).corpo;
  assert.ok(aud.some((a) => a.acao === 'login_recusado' && a.usuario === 'chefe'));
});

test('sistema e Telegram desligado respondem de forma clara', async (t) => {
  const m = await montar();
  t.after(m.fechar);
  const s = await m.admin('GET', '/api/admin/sistema');
  assert.equal(s.status, 200);
  assert.equal(s.corpo.notificacoes.status, 'desligado');
  assert.equal(JSON.stringify(s.corpo).includes('password'), false);
  const tg = await m.admin('POST', '/api/admin/telegram/teste');
  assert.equal(tg.status, 409);
  assert.match(tg.corpo.mensagem, /TELEGRAM_TOKEN/);
});
