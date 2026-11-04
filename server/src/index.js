'use strict';

const path = require('node:path');
const { carregarConfig, carregarEnv, RAIZ } = require('./config');
const { criarLog } = require('./log');
const { abrirArmazenamento } = require('./armazenamento');
const { criarFonteMysql, criarFonteSimulador } = require('./fontes');
const { criarMonitor } = require('./monitor');
const { criarCadastro, criarSessoes } = require('./autenticacao');
const { criarApp } = require('./app');
const { criarClienteTelegram } = require('./telegram');
const { criarNotificador } = require('./notificador');
const { criarFabrica } = require('./fabrica');
const { criarBackup } = require('./backup');

async function principal() {
  carregarEnv(path.join(RAIZ, '.env'));
  const config = carregarConfig();
  const log = criarLog(path.join(config.raiz, 'logs'));

  const armazenamento = abrirArmazenamento(path.join(config.pastaDados, 'historico.db'));
  const cadastro = criarCadastro(path.join(config.pastaDados, 'usuarios.json'));
  const sessoes = criarSessoes(armazenamento, { dias: config.sessaoDias });

  if (config.loginObrigatorio && cadastro.listar().length === 0) {
    log.warn('Nenhum usuário cadastrado. Crie um com:  npm run usuario -- adicionar <usuario> --admin');
  }
  if (!config.loginObrigatorio) log.warn('LOGIN_OBRIGATORIO=false: qualquer pessoa na rede acessa o painel.');

  const fonte = config.fonte === 'simulador'
    ? criarFonteSimulador(config.silos)
    : criarFonteMysql(config.db, config.silos);
  if (fonte.simulado) log.warn('FONTE_DADOS=simulador: o painel mostra DADOS FICTÍCIOS.');

  const monitor = criarMonitor({ config, fonte, armazenamento, log });

  // O notificador assina os eventos antes do monitor começar, para não perder os alarmes da 1ª leitura.
  let notificador = null;
  if (config.telegram) {
    notificador = criarNotificador({
      config, monitor, armazenamento, log, cliente: criarClienteTelegram({ token: config.telegram.token }),
    });
    notificador.iniciar();
  } else {
    log.info('Alertas no Telegram desligados (TELEGRAM_TOKEN vazio).');
  }

  await monitor.iniciar();

  const backup = criarBackup({
    armazenamento, log, pastaDados: config.pastaDados, ...config.backup,
  });
  backup.iniciar();

  const limpeza = setInterval(() => armazenamento.limparAntigos(config.retencaoDias), 6 * 3_600_000);
  armazenamento.limparAntigos(config.retencaoDias);

  const fabrica = config.fabrica ? criarFabrica({ db: config.db, nomes: config.fabrica.nomes }) : null;
  const app = criarApp({ config, monitor, armazenamento, cadastro, sessoes, log, notificador, fabrica, backup, fonte });
  // No Express 5 este callback também é chamado em caso de erro (tratado no 'error' abaixo).
  const servidor = app.listen(config.porta, config.host, (erro) => {
    if (erro) return;
    log.info(`Painel de silos em http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.porta}`);
  });
  servidor.on('error', (e) => {
    // Porta fixa de propósito: trocar de porta sozinho deixaria as telas apontando para o lugar errado.
    log.error(e.code === 'EADDRINUSE'
      ? `A porta ${config.porta} já está em uso. Feche o outro programa ou mude PORT no .env.`
      : `Erro no servidor: ${e.message}`);
    process.exit(1);
  });

  let encerrando = false;
  const encerrar = async (sinal) => {
    if (encerrando) return;
    encerrando = true;
    log.info(`Encerrando (${sinal})...`);
    clearInterval(limpeza);
    notificador?.parar();
    servidor.closeAllConnections();
    servidor.close();
    backup.parar();
    await fabrica?.fechar().catch(() => {});
    await monitor.parar().catch(() => {});
    armazenamento.fechar();
    log.fechar();
    process.exit(0);
  };
  process.on('SIGINT', () => encerrar('SIGINT'));
  process.on('SIGTERM', () => encerrar('SIGTERM'));
}

principal().catch((e) => {
  console.error(`Falha ao iniciar: ${e.message}`);
  process.exit(1);
});
