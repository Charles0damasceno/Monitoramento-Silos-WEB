'use strict';

// Gera os pacotes de instalação em dist-pacote/:
//   painel-silos-<versão>-windows.zip   (instalar.bat)
//   painel-silos-<versão>-linux.tar.gz  (sudo bash instalar.sh)
// Inclui o site já compilado; nunca inclui .env, dados, logs ou node_modules.
//   npm run pacote

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const versao = require(path.join(raiz, 'package.json')).version;
const nome = `painel-silos-${versao}`;
const saida = path.join(raiz, 'dist-pacote');
const preparo = path.join(saida, nome);

// Nunca vão para o pacote, mesmo que estejam no git por engano.
const PROIBIDOS = [/^\.env$/, /^data\//, /^logs\//, /node_modules\//, /^\.claude\//, /^dist-pacote\//, /^\.git/];

function rodar(cmd, args, opcoes = {}) {
  return execFileSync(cmd, args, { cwd: raiz, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', shell: process.platform === 'win32', ...opcoes });
}

console.log(`Empacotando ${nome}...`);

const pendentes = rodar('git', ['status', '--porcelain']).trim();
if (pendentes) console.warn('Atenção: há alterações não commitadas; elas ENTRAM no pacote (arquivos da pasta de trabalho).');

console.log('- compilando o site');
rodar('npm', ['run', 'build', '--silent'], { stdio: 'inherit' });

fs.rmSync(saida, { recursive: true, force: true });
fs.mkdirSync(preparo, { recursive: true });

// Arquivos versionados + novos não ignorados (respeita o .gitignore).
const arquivos = rodar('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
  .split('\0').filter(Boolean)
  .filter((f) => fs.existsSync(path.join(raiz, f)))
  .filter((f) => !PROIBIDOS.some((re) => re.test(f)));

// Cadastros editáveis pela tela viram "*.padrao.json": atualizar por cima não apaga o que foi cadastrado.
const RENOMEAR = { 'config/silos.json': 'config/silos.padrao.json', 'config/fabrica.json': 'config/fabrica.padrao.json' };

const copiar = (rel) => {
  const destino = path.join(preparo, RENOMEAR[rel] ?? rel);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(path.join(raiz, rel), destino);
};
arquivos.forEach(copiar);

// Site compilado (fica fora do git).
const dist = path.join(raiz, 'web', 'dist');
const listar = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? listar(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const doSite = listar(dist).map((f) => path.relative(raiz, f).split(path.sep).join('/'));
doSite.forEach(copiar);

// Conferência de segurança.
for (const f of [...arquivos, ...doSite]) {
  if (PROIBIDOS.some((re) => re.test(f))) throw new Error(`arquivo proibido no pacote: ${f}`);
}
console.log(`- ${arquivos.length} arquivos do projeto + ${doSite.length} do site compilado`);

const zip = path.join(saida, `${nome}-windows.zip`);
const tgz = path.join(saida, `${nome}-linux.tar.gz`);

if (process.platform === 'win32') {
  execFileSync('powershell.exe', ['-NoProfile', '-Command',
    `Compress-Archive -Path '${preparo.replace(/'/g, "''")}' -DestinationPath '${zip.replace(/'/g, "''")}' -CompressionLevel Optimal`], { stdio: 'inherit' });
} else {
  execFileSync('zip', ['-qr', zip, nome], { cwd: saida, stdio: 'inherit' });
}
// tar com caminhos relativos (funciona com o tar do Windows e do Linux); scripts .sh executáveis.
for (const sh of ['instalar.sh', 'desinstalar.sh']) {
  try { fs.chmodSync(path.join(preparo, sh), 0o755); } catch { /* Windows */ }
}
execFileSync('tar', ['-czf', path.basename(tgz), nome], { cwd: saida, stdio: 'inherit' });

fs.rmSync(preparo, { recursive: true, force: true });
for (const f of [zip, tgz]) {
  console.log(`✔ ${path.relative(raiz, f)}  (${(fs.statSync(f).size / 1024 / 1024).toFixed(1)} MB)`);
}
