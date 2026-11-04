'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { COOKIE, conferirSenha, HASH_FALSO, criarLimitador, lerCookie } = require('./autenticacao');
const { PERIODOS } = require('./armazenamento');
const { gerarRelatorio, relatorioCsv } = require('./relatorios');
const { registrarRotasAdmin } = require('./admin');

const VERSAO = require('../package.json').version;

function criarApp({
  config, monitor, armazenamento, cadastro, sessoes, log, notificador = null, fabrica = null, backup = null,
  fonte = {}, agora = Date.now,
}) {
  const app = express();
  const limitador = criarLimitador({ agora });

  app.disable('x-powered-by');
  app.set('trust proxy', false);

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // MUI (Emotion) injeta estilos em tempo de execução.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
    // Rede local em HTTP: HSTS e upgrade forçado quebrariam o acesso.
    strictTransportSecurity: false,
    crossOriginOpenerPolicy: false,
    originAgentCluster: false,
  }));
  app.use(express.json({ limit: '10kb' }));

  // ---- Utilidades ----

  const usuarioDaRequisicao = (req) => {
    if (!config.loginObrigatorio) return { usuario: 'anonimo', nome: 'Acesso livre', papel: 'operador' };
    const usuario = sessoes.validar(lerCookie(req, COOKIE));
    if (!usuario) return null;
    const u = cadastro.buscar(usuario);
    return u ? { usuario: u.usuario, nome: u.nome, papel: u.papel } : null;
  };

  const exigirLogin = (req, res, next) => {
    const u = usuarioDaRequisicao(req);
    if (!u) return res.status(401).json({ erro: 'nao_autenticado' });
    req.usuario = u;
    next();
  };

  // Bloqueia POST de outros sites (CSRF): o navegador sempre envia Origin em POST.
  const mesmaOrigem = (req, res, next) => {
    const origem = req.headers.origin;
    if (origem) {
      let host;
      try { host = new URL(origem).host; } catch { host = null; }
      if (host !== req.headers.host) return res.status(403).json({ erro: 'origem_invalida' });
    }
    next();
  };

  const opcoesCookie = (req) => ({
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: '/',
    maxAge: sessoes.duracaoMs,
  });

  // ---- Rotas públicas ----

  app.get('/api/saude', (req, res) => {
    const r = monitor.retrato();
    const ok = r.comunicacao.status === 'ok';
    res.status(ok ? 200 : 503).json({ ok, versao: VERSAO, comunicacao: r.comunicacao.status, ts: agora() });
  });

  app.post('/api/login', mesmaOrigem, (req, res) => {
    const usuario = String(req.body?.usuario ?? '').trim().toLowerCase();
    const senha = String(req.body?.senha ?? '');
    const chave = `${req.ip}|${usuario}`;
    if (limitador.bloqueado(chave)) {
      return res.status(429).json({ erro: 'muitas_tentativas', mensagem: 'Muitas tentativas. Aguarde 15 minutos.' });
    }
    const u = cadastro.buscar(usuario);
    const ok = conferirSenha(senha, u ? u.senha : HASH_FALSO) && Boolean(u);
    if (!ok) {
      limitador.falhou(chave);
      log.warn(`Login recusado para "${usuario}" de ${req.ip}`);
      armazenamento.registrarAuditoria({ ts: agora(), usuario: usuario.slice(0, 40) || null, ip: req.ip, acao: 'login_recusado' });
      return res.status(401).json({ erro: 'credenciais_invalidas', mensagem: 'Usuário ou senha incorretos.' });
    }
    limitador.sucesso(chave);
    res.cookie(COOKIE, sessoes.criar(u.usuario), opcoesCookie(req));
    log.info(`Login de "${u.usuario}" de ${req.ip}`);
    armazenamento.registrarAuditoria({ ts: agora(), usuario: u.usuario, ip: req.ip, acao: 'login' });
    res.json({ usuario: u.usuario, nome: u.nome, papel: u.papel });
  });

  app.post('/api/logout', mesmaOrigem, (req, res) => {
    sessoes.encerrar(lerCookie(req, COOKIE));
    res.clearCookie(COOKIE, { path: '/' });
    res.status(204).end();
  });

  app.get('/api/eu', (req, res) => {
    const u = usuarioDaRequisicao(req);
    if (!u) return res.status(401).json({ erro: 'nao_autenticado', loginObrigatorio: true });
    res.json({
      ...u,
      loginObrigatorio: config.loginObrigatorio,
      versao: VERSAO,
      // Só o admin precisa saber se os alertas externos estão saindo.
      notificacoes: u.papel === 'admin' ? (notificador?.status() ?? { canal: 'telegram', status: 'desligado' }) : undefined,
    });
  });

  // ---- Rotas protegidas ----

  app.get('/api/retrato', exigirLogin, (req, res) => res.json(monitor.retrato()));

  app.get('/api/historico', exigirLogin, (req, res) => {
    const periodo = String(req.query.periodo ?? '24h');
    if (!PERIODOS[periodo]) return res.status(400).json({ erro: 'periodo_invalido', validos: Object.keys(PERIODOS) });
    const grandeza = req.query.grandeza === 'temperatura' ? 'temperatura' : 'nivel';
    const t = agora();
    res.json({
      periodo,
      grandeza,
      ts: t,
      silos: config.silos.map((s) => ({
        id: s.id,
        nome: s.nome,
        pontos: grandeza === 'temperatura'
          ? armazenamento.historicoTemperatura(s.id, periodo, t)
          : armazenamento.historico(s.id, periodo, t),
      })),
    });
  });

  app.get('/api/fabrica', exigirLogin, async (req, res, next) => {
    if (!fabrica) return res.json({ disponivel: false });
    try {
      res.json({ disponivel: true, ...(await fabrica.painel()) });
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/turnos', exigirLogin, (req, res) => res.json(config.turnos));

  const relatorioDaRequisicao = (req) => gerarRelatorio({
    config, armazenamento, data: String(req.query.data ?? ''), turno: String(req.query.turno ?? 'dia'), turnos: config.turnos,
  });

  app.get('/api/relatorio', exigirLogin, (req, res) => {
    try {
      res.json(relatorioDaRequisicao(req));
    } catch (e) {
      res.status(400).json({ erro: 'parametro_invalido', mensagem: e.message });
    }
  });

  app.get('/api/relatorio.csv', exigirLogin, (req, res) => {
    let r;
    try {
      r = relatorioDaRequisicao(req);
    } catch (e) {
      return res.status(400).type('text').send(e.message);
    }
    const nome = `silos_${r.data}_${r.turno === 'dia' ? 'dia' : `turno${r.turno}`}.csv`;
    res.set('Content-Disposition', `attachment; filename="${nome}"`);
    res.type('text/csv; charset=utf-8').send(relatorioCsv(r));
  });

  app.get('/api/eventos', exigirLogin, (req, res) => {
    const limite = Number.parseInt(req.query.limite, 10) || 100;
    res.json(armazenamento.eventos({ limite }));
  });

  app.post('/api/eventos/:id/reconhecer', mesmaOrigem, exigirLogin, (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ erro: 'id_invalido' });
    const ok = armazenamento.reconhecerEvento(id, req.usuario.nome, agora());
    if (!ok) return res.status(409).json({ erro: 'ja_reconhecido_ou_inexistente' });
    log.info(`Evento ${id} reconhecido por ${req.usuario.usuario}`);
    armazenamento.registrarAuditoria({ ts: agora(), usuario: req.usuario.usuario, ip: req.ip, acao: 'alarme_reconhecido', detalhe: `evento ${id}` });
    monitor.eventos.emit('reconhecido', { id, por: req.usuario.nome, em: agora() });
    res.status(204).end();
  });

  // Server-Sent Events: o servidor empurra cada leitura; o navegador reconecta sozinho.
  app.get('/api/fluxo', exigirLogin, (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const enviar = (tipo, dados) => res.write(`event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`);
    res.write('retry: 3000\n\n');
    enviar('retrato', monitor.retrato());

    const aoRetrato = (r) => enviar('retrato', r);
    const aoEvento = (e) => enviar('evento', e);
    const aoReconhecido = (e) => enviar('reconhecido', e);
    monitor.eventos.on('retrato', aoRetrato);
    monitor.eventos.on('evento', aoEvento);
    monitor.eventos.on('reconhecido', aoReconhecido);
    const pulso = setInterval(() => res.write(': pulso\n\n'), 25_000);

    req.on('close', () => {
      clearInterval(pulso);
      monitor.eventos.off('retrato', aoRetrato);
      monitor.eventos.off('evento', aoEvento);
      monitor.eventos.off('reconhecido', aoReconhecido);
    });
  });

  registrarRotasAdmin(app, {
    config, monitor, armazenamento, cadastro, sessoes, notificador, backup, fonte, log,
    exigirLogin, mesmaOrigem, opcoesCookie, agora,
  });

  app.use('/api', (req, res) => res.status(404).json({ erro: 'rota_inexistente' }));

  // ---- Site (build do Vite) ----

  const indice = path.join(config.pastaWeb, 'index.html');
  if (fs.existsSync(indice)) {
    app.use(express.static(config.pastaWeb, { index: false, maxAge: '7d', immutable: true }));
    app.get('/{*caminho}', (req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(indice);
    });
  } else {
    app.get('/', (req, res) => res.type('text').send('Site não compilado. Rode "npm run build" na raiz do projeto.'));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'json_invalido' });
    log.error(`Erro em ${req.method} ${req.path}: ${err.stack || err}`);
    res.status(500).json({ erro: 'erro_interno' });
  });

  return app;
}

module.exports = { criarApp };
