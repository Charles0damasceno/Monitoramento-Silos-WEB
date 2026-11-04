'use strict';

// Confere se o painel está pronto para rodar com dados reais.
//   npm run diagnostico
// Sai com código 1 se houver algum problema que impede o funcionamento.

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { carregarConfig, carregarEnv, RAIZ } = require('../src/config');
const { criarCadastro } = require('../src/autenticacao');
const { planejarConsulta } = require('../src/fontes');
const { lerDataHora } = require('../src/temperatura');

const cor = process.stdout.isTTY && !process.env.NO_COLOR;
const pinta = (c, t) => (cor ? `\x1b[${c}m${t}\x1b[0m` : t);
let erros = 0;
let avisos = 0;
const ok = (t) => console.log(`  ${pinta(32, '✔')} ${t}`);
const aviso = (t) => { avisos += 1; console.log(`  ${pinta(33, '⚠')} ${t}`); };
const erro = (t) => { erros += 1; console.log(`  ${pinta(31, '✖')} ${t}`); };
const info = (t) => console.log(`    ${pinta(90, t)}`);
const titulo = (t) => console.log(`\n${pinta(1, t)}`);

function portaLivre(porta, host) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(porta, host === '0.0.0.0' ? undefined : host);
  });
}

function gravavel(pasta) {
  try {
    fs.mkdirSync(pasta, { recursive: true });
    const teste = path.join(pasta, `.teste-escrita-${process.pid}`);
    fs.writeFileSync(teste, 'ok');
    fs.rmSync(teste);
    return true;
  } catch {
    return false;
  }
}

async function principal() {
  console.log(pinta(1, 'Painel de Silos — diagnóstico'));

  // ---------- Ambiente ----------
  titulo('Ambiente');
  const [maior, menor] = process.versions.node.split('.').map(Number);
  if (maior > 22 || (maior === 22 && menor >= 13)) ok(`Node.js ${process.version}`);
  else erro(`Node.js ${process.version} é antigo: instale a versão 22.13 ou mais nova`);

  const arquivoEnv = path.join(RAIZ, '.env');
  if (fs.existsSync(arquivoEnv)) ok('Arquivo .env encontrado');
  else erro('Arquivo .env não existe (copie .env.example para .env e preencha)');
  carregarEnv(arquivoEnv);

  let config;
  try {
    config = carregarConfig();
    ok(`Configuração válida (${config.silos.length} silo(s) em ${path.relative(RAIZ, config.arquivoSilos)})`);
  } catch (e) {
    erro(`Configuração inválida: ${e.message}`);
    return;
  }

  if (fs.existsSync(path.join(config.pastaWeb, 'index.html'))) ok('Site compilado (web/dist)');
  else erro('Site não compilado: rode "npm run build"');

  // ---------- Banco da IHM ----------
  titulo('Banco da IHM');
  if (config.fonte === 'simulador') {
    aviso('FONTE_DADOS=simulador: o painel mostra DADOS FICTÍCIOS. Para produção use FONTE_DADOS=mysql');
  } else {
    let mysql;
    try {
      mysql = require('mysql2/promise');
    } catch {
      erro('Dependências não instaladas: rode "npm ci"');
      return;
    }
    let c;
    try {
      c = await mysql.createConnection({
        host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password,
        database: config.db.database, connectTimeout: 6000, dateStrings: true,
      });
      ok(`Conectou em ${config.db.host}:${config.db.port}/${config.db.database} como "${config.db.user}"`);
    } catch (e) {
      erro(`Não conectou em ${config.db.host}:${config.db.port} (${e.code || e.message})`);
      if (e.code === 'ER_ACCESS_DENIED_ERROR') info('Usuário ou senha do banco incorretos (DB_USER / DB_PASSWORD no .env).');
      if (['ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH'].includes(e.code)) info('Servidor inalcançável: confira DB_HOST, a rede e o firewall da porta 3306.');
    }

    if (c) {
      try {
        // Permissões: o painel só precisa de SELECT.
        const [grants] = await c.query('SHOW GRANTS FOR CURRENT_USER()');
        const texto = grants.map((g) => Object.values(g)[0]).join(' ').toUpperCase();
        if (/ALL PRIVILEGES|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bALTER\b|\bCREATE\b/.test(texto)) {
          aviso(`O usuário "${config.db.user}" pode ALTERAR o banco. Recomendado: um usuário só com SELECT`);
          info('Veja docs/mysql-usuario-somente-leitura.sql');
        } else {
          ok('Usuário do banco é somente leitura');
        }
      } catch {
        aviso('Não foi possível conferir as permissões do usuário do banco');
      }

      try {
        const [colunas] = await c.query(`SHOW COLUMNS FROM ${mysql.escapeId(config.db.tabela)}`);
        const plano = planejarConsulta(colunas, config.silos);
        ok(`Tabela "${config.db.tabela}" encontrada`);
        for (const [id, motivo] of plano.faltando) {
          const s = config.silos.find((x) => x.id === id);
          erro(`${s.nome}: a coluna "${s.coluna}" não existe na tabela (${motivo})`);
        }
        if (plano.naoCadastradas.length) aviso(`Colunas no banco sem silo cadastrado: ${plano.naoCadastradas.join(', ')}`);
        if (plano.existentes.length) {
          const cols = plano.existentes.map((e) => mysql.escapeId(e.coluna)).join(', ');
          const ordem = plano.colunaOrdem ? ` ORDER BY ${mysql.escapeId(plano.colunaOrdem)} DESC` : '';
          const [linhas] = await c.query(`SELECT ${cols} FROM ${mysql.escapeId(config.db.tabela)}${ordem} LIMIT 1`);
          if (!linhas.length) {
            erro(`A tabela "${config.db.tabela}" está vazia: a IHM ainda não gravou nenhuma leitura`);
          } else {
            for (const e of plano.existentes) {
              const s = config.silos.find((x) => x.id === e.siloId);
              const v = Number(linhas[0][e.coluna]);
              if (!Number.isFinite(v)) erro(`${s.nome}: valor inválido no banco (${linhas[0][e.coluna]})`);
              else if (v < 0 || v > s.capacidadeLitros * 1.1) aviso(`${s.nome}: ${v} L está fora da capacidade (${s.capacidadeLitros} L) — confira a unidade e a capacidade`);
              else ok(`${s.nome}: ${v.toLocaleString('pt-BR')} L (${((v / s.capacidadeLitros) * 100).toFixed(1).replace('.', ',')}%)`);
            }
            if (plano.existentes.every((e) => Number(linhas[0][e.coluna]) === 0)) {
              aviso('Todos os silos estão em 0 L. Se não estiverem vazios de verdade, a IHM pode não estar gravando');
            }
          }
        }
      } catch (e) {
        erro(`Não foi possível ler a tabela "${config.db.tabela}" (${e.code || e.message})`);
      }

      const comTemp = config.silos.filter((s) => s.temperatura);
      if (config.temperatura.tabela && comTemp.length) {
        try {
          const t = mysql.escapeId(config.temperatura.tabela);
          const [[{ n }]] = await c.query(`SELECT COUNT(*) AS n FROM ${t}`);
          if (!Number(n)) {
            aviso(`Tabela "${config.temperatura.tabela}" está vazia: a temperatura aparecerá como "sem sensor"`);
          } else {
            const [[ultima]] = await c.query(`SELECT data_hora FROM ${t} ORDER BY id DESC LIMIT 1`);
            const ts = lerDataHora(ultima?.data_hora);
            if (ts === null) aviso(`Temperatura: data_hora "${ultima?.data_hora}" em formato não reconhecido`);
            else if (Date.now() - ts > config.temperatura.validadeMs) aviso(`Temperatura: última leitura em ${new Date(ts).toLocaleString('pt-BR')} (desatualizada)`);
            else ok(`Temperatura: última leitura em ${new Date(ts).toLocaleString('pt-BR')}`);
          }
        } catch (e) {
          aviso(`Tabela de temperatura "${config.temperatura.tabela}" indisponível (${e.code || e.message})`);
        }
      }
      await c.end();
    }
  }

  // ---------- Servidor ----------
  titulo('Servidor do painel');
  if (await portaLivre(config.porta, config.host)) {
    ok(`Porta ${config.porta} livre`);
  } else {
    try {
      const r = await fetch(`http://127.0.0.1:${config.porta}/api/saude`, { signal: AbortSignal.timeout(3000) });
      const d = await r.json();
      ok(`Porta ${config.porta} em uso pelo próprio painel (versão ${d.versao}, comunicação: ${d.comunicacao})`);
    } catch {
      erro(`Porta ${config.porta} ocupada por outro programa (mude PORT no .env)`);
    }
  }
  if (config.host === '127.0.0.1') aviso('HOST=127.0.0.1: o painel só abre neste computador (use 0.0.0.0 para a rede)');

  const cadastro = criarCadastro(path.join(config.pastaDados, 'usuarios.json'));
  const usuarios = cadastro.listar();
  if (!config.loginObrigatorio) aviso('LOGIN_OBRIGATORIO=false: qualquer pessoa na rede acessa o painel');
  else if (!usuarios.length) erro('Nenhum usuário cadastrado: rode "npm run usuario -- adicionar admin --admin"');
  else if (!usuarios.some((u) => u.papel === 'admin')) aviso('Nenhum administrador: rode "npm run usuario -- papel <usuario> admin"');
  else ok(`${usuarios.length} usuário(s), ${usuarios.filter((u) => u.papel === 'admin').length} administrador(es)`);

  if (gravavel(config.pastaDados)) ok(`Pasta de dados gravável (${config.pastaDados})`);
  else erro(`Sem permissão de escrita em ${config.pastaDados}`);
  if (gravavel(config.backup.destino)) ok(`Pasta de backup gravável (${config.backup.destino})`);
  else erro(`Sem permissão de escrita na pasta de backup ${config.backup.destino}`);

  // ---------- Alertas ----------
  titulo('Alertas no celular');
  if (!config.telegram) {
    aviso('Telegram desligado: alarmes só aparecem nas telas abertas');
  } else {
    try {
      const r = await fetch(`https://api.telegram.org/bot${config.telegram.token}/getMe`, { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      if (d.ok) ok(`Telegram: bot @${d.result.username} respondendo`);
      else erro(`Telegram recusou o token (${d.description})`);
    } catch {
      erro('Sem acesso a api.telegram.org (o servidor precisa de saída para a internet na porta 443)');
    }
  }

  console.log(`\n${erros ? pinta(31, `${erros} problema(s)`) : pinta(32, 'Nenhum problema')}${avisos ? `, ${pinta(33, `${avisos} aviso(s)`)}` : ''}.`);
}

principal()
  .catch((e) => { erro(`Falha inesperada: ${e.message}`); })
  .finally(() => { process.exitCode = erros ? 1 : 0; });
