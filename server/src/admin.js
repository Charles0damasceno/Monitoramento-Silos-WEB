'use strict';

// Rotas da tela de Configurações. Todas exigem usuário com papel "admin".

const fs = require('node:fs');
const { validarSilos } = require('./config');
const { COOKIE } = require('./autenticacao');

const VERSAO = require('../package.json').version;

function gravarJsonAtomico(arquivo, dados) {
  const tmp = `${arquivo}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(dados, null, 2)}\n`);
  fs.renameSync(tmp, arquivo);
}

function registrarRotasAdmin(app, {
  config, monitor, armazenamento, cadastro, sessoes, notificador, backup, fonte, log,
  exigirLogin, mesmaOrigem, opcoesCookie, agora = Date.now,
}) {
  const exigirAdmin = [exigirLogin, (req, res, next) => {
    if (req.usuario.papel !== 'admin') return res.status(403).json({ erro: 'apenas_admin', mensagem: 'Somente administradores.' });
    next();
  }];
  const alterar = [mesmaOrigem, ...exigirAdmin];

  const auditar = (req, acao, detalhe = null) => {
    armazenamento.registrarAuditoria({ ts: agora(), usuario: req.usuario.usuario, ip: req.ip, acao, detalhe });
    log.info(`[auditoria] ${req.usuario.usuario}: ${acao}${detalhe ? ` — ${detalhe}` : ''}`);
  };
  const erro400 = (res, e) => res.status(400).json({ erro: 'invalido', mensagem: e.message });

  // ---------- Silos ----------

  app.get('/api/admin/silos', exigirAdmin, (req, res) => {
    res.json({
      silos: config.silos,
      idsComHistorico: armazenamento.idsComHistorico(),
      colunasDisponiveis: fonte.colunasDisponiveis?.() ?? [],
      temperaturaTabela: config.temperatura?.tabela ?? null,
    });
  });

  app.put('/api/admin/silos', alterar, async (req, res) => {
    let novos;
    try {
      novos = validarSilos(req.body?.silos);
      // Um id que já tem histórico só pode continuar sendo do mesmo silo: reaproveitar
      // misturaria o histórico de um silo removido com o de um silo novo.
      const atuais = new Set(config.silos.map((s) => s.id));
      const comHistorico = new Set(armazenamento.idsComHistorico());
      const reaproveitado = novos.find((s) => !atuais.has(s.id) && comHistorico.has(s.id));
      if (reaproveitado) throw new Error(`o id ${reaproveitado.id} já pertenceu a outro silo (tem histórico); use um id novo`);
    } catch (e) {
      return erro400(res, e);
    }

    const antes = new Map(config.silos.map((s) => [s.id, s]));
    const mudancas = [];
    for (const s of novos) {
      if (!antes.has(s.id)) mudancas.push(`+ ${s.nome} (${s.coluna})`);
      else if (JSON.stringify(antes.get(s.id)) !== JSON.stringify(s)) mudancas.push(`~ ${s.nome}`);
    }
    for (const s of config.silos) if (!novos.some((n) => n.id === s.id)) mudancas.push(`− ${s.nome}`);

    // Guarda a versão anterior antes de sobrescrever.
    const arquivo = config.arquivoSilos;
    const original = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    gravarJsonAtomico(arquivo.replace(/\.json$/, '.anterior.json'), original);
    gravarJsonAtomico(arquivo, { ...original, silos: novos.map(({ temperatura, ...s }) => (temperatura ? { ...s, temperatura } : s)) });

    config.silos = novos;
    await monitor.atualizarSilos();
    auditar(req, 'silos_alterados', mudancas.join('; ') || 'sem mudanças');
    res.json({ silos: config.silos });
  });

  // ---------- Usuários ----------

  const admins = () => cadastro.listar().filter((u) => u.papel === 'admin');

  app.get('/api/admin/usuarios', exigirAdmin, (req, res) => res.json(cadastro.listar()));

  app.post('/api/admin/usuarios', alterar, (req, res) => {
    const { usuario, nome, papel = 'operador', senha } = req.body ?? {};
    const id = String(usuario ?? '').trim().toLowerCase();
    if (cadastro.buscar(id)) return res.status(409).json({ erro: 'ja_existe', mensagem: `O usuário "${id}" já existe.` });
    try {
      cadastro.salvar({ usuario: id, nome, papel, senha });
    } catch (e) {
      return erro400(res, e);
    }
    auditar(req, 'usuario_criado', `${id} (${papel})`);
    res.status(201).json(cadastro.listar().find((u) => u.usuario === id));
  });

  app.patch('/api/admin/usuarios/:usuario', alterar, (req, res) => {
    const alvo = req.params.usuario;
    const atual = cadastro.buscar(alvo);
    if (!atual) return res.status(404).json({ erro: 'inexistente' });
    const { nome, papel, senha } = req.body ?? {};
    if (papel === 'operador' && atual.papel === 'admin' && admins().length <= 1) {
      return res.status(409).json({ erro: 'ultimo_admin', mensagem: 'Precisa existir pelo menos um administrador.' });
    }
    try {
      cadastro.atualizar(alvo, { nome, papel, senha: senha || undefined });
    } catch (e) {
      return erro400(res, e);
    }
    if (senha) {
      // Troca de senha derruba as sessões abertas daquele usuário (inclusive em outros aparelhos).
      armazenamento.sessoes.apagarDoUsuario(alvo);
      if (alvo === req.usuario.usuario) res.cookie(COOKIE, sessoes.criar(alvo), opcoesCookie(req));
    }
    if (papel && papel !== atual.papel) armazenamento.sessoes.apagarDoUsuario(alvo);
    const partes = [nome !== undefined && nome !== atual.nome && 'nome', papel && papel !== atual.papel && `papel → ${papel}`, senha && 'senha'].filter(Boolean);
    auditar(req, 'usuario_alterado', `${alvo}: ${partes.join(', ') || 'sem mudanças'}`);
    res.json(cadastro.listar().find((u) => u.usuario === alvo));
  });

  app.delete('/api/admin/usuarios/:usuario', alterar, (req, res) => {
    const alvo = req.params.usuario;
    const atual = cadastro.buscar(alvo);
    if (!atual) return res.status(404).json({ erro: 'inexistente' });
    if (alvo === req.usuario.usuario) return res.status(409).json({ erro: 'proprio_usuario', mensagem: 'Você não pode remover o próprio usuário.' });
    if (atual.papel === 'admin' && admins().length <= 1) {
      return res.status(409).json({ erro: 'ultimo_admin', mensagem: 'Precisa existir pelo menos um administrador.' });
    }
    cadastro.remover(alvo);
    armazenamento.sessoes.apagarDoUsuario(alvo);
    auditar(req, 'usuario_removido', alvo);
    res.status(204).end();
  });

  // ---------- Alertas, sistema e auditoria ----------

  app.post('/api/admin/telegram/teste', alterar, async (req, res) => {
    if (!notificador) return res.status(409).json({ erro: 'desligado', mensagem: 'Telegram não configurado (TELEGRAM_TOKEN vazio no .env).' });
    try {
      await notificador.testar(req.usuario.nome);
      auditar(req, 'telegram_teste', 'ok');
      res.status(204).end();
    } catch (e) {
      auditar(req, 'telegram_teste', `falhou: ${e.message}`);
      res.status(502).json({ erro: 'telegram', mensagem: `O Telegram recusou: ${e.message}` });
    }
  });

  app.get('/api/admin/sistema', exigirAdmin, (req, res) => {
    const r = monitor.retrato();
    res.json({
      versao: VERSAO,
      node: process.version,
      iniciadoEm: Date.now() - Math.round(process.uptime() * 1000),
      fonte: { descricao: r.fonte.descricao, simulada: r.fonte.simulada, comunicacao: r.comunicacao.status },
      leituraS: config.leituraMs / 1000,
      historicoS: config.historicoMs / 1000,
      retencaoDias: config.retencaoDias,
      loginObrigatorio: config.loginObrigatorio,
      sessaoDias: config.sessaoDias,
      turnos: config.turnos.map((t) => t.nome),
      notificacoes: notificador?.status() ?? { canal: 'telegram', status: 'desligado' },
      notificacoesConfig: config.notificacoes,
      backup: { ...config.backup, ultimo: backup?.status() ?? null },
      painelFabrica: Boolean(config.fabrica),
    });
  });

  app.post('/api/admin/backup', alterar, (req, res) => {
    if (!backup) return res.status(409).json({ erro: 'indisponivel' });
    backup.executar();
    const s = backup.status();
    auditar(req, 'backup_manual', s?.erro ? `falhou: ${s.erro}` : s?.arquivo);
    if (s?.erro) return res.status(500).json({ erro: 'backup', mensagem: s.erro });
    res.json(s);
  });

  app.get('/api/admin/auditoria', exigirAdmin, (req, res) => {
    res.json(armazenamento.auditoria(Number.parseInt(req.query.limite, 10) || 200));
  });
}

module.exports = { registrarRotasAdmin };
