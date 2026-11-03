'use strict';

// Gerencia os usuários do painel.
//   npm run usuario -- listar
//   npm run usuario -- adicionar joao --nome "João Silva" [--admin]
//   npm run usuario -- senha joao
//   npm run usuario -- remover joao

const path = require('node:path');
const readline = require('node:readline');
const { carregarEnv, RAIZ } = require('../src/config');
const { criarCadastro } = require('../src/autenticacao');
const { abrirArmazenamento } = require('../src/armazenamento');

carregarEnv(path.join(RAIZ, '.env'));
const pastaDados = process.env.PASTA_DADOS || path.join(RAIZ, 'data');
const cadastro = criarCadastro(path.join(pastaDados, 'usuarios.json'));

function perguntarSenha(rotulo) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(rotulo) || s.includes('\n')) process.stdout.write(s); };
    rl.question(rotulo, (resp) => { rl.close(); process.stdout.write('\n'); resolve(resp); });
  });
}

async function novaSenha() {
  const a = await perguntarSenha('Senha (mín. 8 caracteres): ');
  const b = await perguntarSenha('Repita a senha: ');
  if (a !== b) throw new Error('as senhas não conferem');
  return a;
}

function opcao(args, nome) {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
}

async function principal() {
  const [comando, usuarioBruto, ...resto] = process.argv.slice(2);
  const usuario = usuarioBruto?.toLowerCase();

  switch (comando) {
    case 'listar': {
      const lista = cadastro.listar();
      if (!lista.length) console.log('Nenhum usuário cadastrado.');
      else console.table(lista);
      break;
    }
    case 'adicionar': {
      if (!usuario) throw new Error('informe o nome de usuário');
      if (cadastro.buscar(usuario)) throw new Error(`"${usuario}" já existe (use "senha" para trocar a senha)`);
      const senha = await novaSenha();
      cadastro.salvar({ usuario, nome: opcao(resto, '--nome'), papel: resto.includes('--admin') ? 'admin' : 'operador', senha });
      console.log(`Usuário "${usuario}" criado.`);
      break;
    }
    case 'senha': {
      const u = cadastro.buscar(usuario);
      if (!u) throw new Error(`"${usuario}" não existe`);
      cadastro.salvar({ usuario, nome: u.nome, papel: u.papel, senha: await novaSenha() });
      encerrarSessoes(usuario);
      console.log(`Senha de "${usuario}" alterada; sessões abertas foram encerradas.`);
      break;
    }
    case 'remover': {
      if (!cadastro.remover(usuario)) throw new Error(`"${usuario}" não existe`);
      encerrarSessoes(usuario);
      console.log(`Usuário "${usuario}" removido.`);
      break;
    }
    default:
      console.log('Uso: npm run usuario -- listar | adicionar <usuario> [--nome "Nome"] [--admin] | senha <usuario> | remover <usuario>');
      process.exitCode = comando ? 1 : 0;
  }
}

function encerrarSessoes(usuario) {
  const arm = abrirArmazenamento(path.join(pastaDados, 'historico.db'));
  arm.sessoes.apagarDoUsuario(usuario);
  arm.fechar();
}

principal().catch((e) => {
  console.error(`Erro: ${e.message}`);
  process.exit(1);
});
