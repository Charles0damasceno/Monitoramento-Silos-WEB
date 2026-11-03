'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const COOKIE = 'silos_sessao';
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const NOME_USUARIO = /^[a-z0-9._-]{3,32}$/;

// ---------- Senhas ----------

function gerarHash(senha) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(senha.normalize('NFKC'), sal, SCRYPT.keylen, SCRYPT);
  return `scrypt$${sal.toString('base64')}$${hash.toString('base64')}`;
}

function conferirSenha(senha, armazenado) {
  const [alg, salB64, hashB64] = String(armazenado).split('$');
  if (alg !== 'scrypt' || !salB64 || !hashB64) return false;
  const esperado = Buffer.from(hashB64, 'base64');
  const obtido = crypto.scryptSync(senha.normalize('NFKC'), Buffer.from(salB64, 'base64'), esperado.length, SCRYPT);
  return crypto.timingSafeEqual(esperado, obtido);
}

// Hash fixo para comparar quando o usuário não existe: o tempo de resposta fica igual
// e não revela quais nomes de usuário são válidos.
const HASH_FALSO = gerarHash(crypto.randomBytes(16).toString('hex'));

// ---------- Cadastro de usuários (data/usuarios.json) ----------

function criarCadastro(arquivo) {
  function ler() {
    if (!fs.existsSync(arquivo)) return [];
    return JSON.parse(fs.readFileSync(arquivo, 'utf8')).usuarios ?? [];
  }
  function gravar(usuarios) {
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    const tmp = `${arquivo}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ usuarios }, null, 2));
    fs.renameSync(tmp, arquivo);
  }
  return {
    listar: () => ler().map(({ usuario, nome, papel }) => ({ usuario, nome, papel })),
    buscar: (usuario) => ler().find((u) => u.usuario === usuario) ?? null,
    salvar({ usuario, nome, papel = 'operador', senha }) {
      if (!NOME_USUARIO.test(usuario)) throw new Error('usuário deve ter 3–32 caracteres: a-z, 0-9, . _ -');
      if (!['admin', 'operador'].includes(papel)) throw new Error('papel deve ser admin ou operador');
      if (typeof senha !== 'string' || senha.length < 8) throw new Error('senha deve ter ao menos 8 caracteres');
      const usuarios = ler().filter((u) => u.usuario !== usuario);
      usuarios.push({ usuario, nome: nome || usuario, papel, senha: gerarHash(senha) });
      gravar(usuarios);
    },
    remover(usuario) {
      const usuarios = ler();
      const resto = usuarios.filter((u) => u.usuario !== usuario);
      gravar(resto);
      return resto.length !== usuarios.length;
    },
  };
}

// ---------- Limite de tentativas ----------

function criarLimitador({ maxFalhas = 5, janelaMs = 15 * 60_000, agora = Date.now } = {}) {
  const falhas = new Map();
  const limpar = (chave) => {
    const t = agora();
    const lista = (falhas.get(chave) ?? []).filter((ts) => t - ts < janelaMs);
    if (lista.length) falhas.set(chave, lista); else falhas.delete(chave);
    return lista;
  };
  return {
    bloqueado: (chave) => limpar(chave).length >= maxFalhas,
    falhou: (chave) => falhas.set(chave, [...limpar(chave), agora()]),
    sucesso: (chave) => falhas.delete(chave),
  };
}

// ---------- Sessões ----------

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function criarSessoes(armazenamento, { dias, agora = Date.now }) {
  const duracao = dias * 86_400_000;
  return {
    criar(usuario) {
      const token = crypto.randomBytes(32).toString('base64url');
      const t = agora();
      armazenamento.sessoes.criar(hashToken(token), usuario, t, t + duracao);
      return token;
    },
    /** Valida e renova (expiração deslizante: a TV que fica aberta não é deslogada). */
    validar(token) {
      if (!token) return null;
      const h = hashToken(token);
      const s = armazenamento.sessoes.buscar(h);
      if (!s) return null;
      const t = agora();
      if (s.expira_em < t) {
        armazenamento.sessoes.apagar(h);
        return null;
      }
      if (s.expira_em - t < duracao / 2) armazenamento.sessoes.renovar(h, t + duracao);
      return s.usuario;
    },
    encerrar: (token) => token && armazenamento.sessoes.apagar(hashToken(token)),
    duracaoMs: duracao,
  };
}

function lerCookie(req, nome) {
  const cab = req.headers.cookie;
  if (!cab) return null;
  for (const parte of cab.split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

module.exports = {
  COOKIE, gerarHash, conferirSenha, HASH_FALSO,
  criarCadastro, criarLimitador, criarSessoes, lerCookie,
};
