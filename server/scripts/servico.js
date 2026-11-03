'use strict';

// Instala/remove o painel como serviço do Windows (inicia com o computador e
// reinicia sozinho se cair). Precisa de um terminal "Executar como administrador".
//   npm run servico -- instalar | remover | reiniciar

const path = require('node:path');

let Service;
try {
  ({ Service } = require('node-windows'));
} catch {
  console.error('O pacote node-windows não está instalado (só funciona no Windows). Rode "npm install" no Windows.');
  process.exit(1);
}

const svc = new Service({
  name: 'Painel de Silos',
  description: 'Monitoramento de nível dos silos de leite (servidor web).',
  script: path.resolve(__dirname, '..', 'src', 'index.js'),
  workingDirectory: path.resolve(__dirname, '..', '..'),
  nodeOptions: ['--disable-warning=ExperimentalWarning'],
  wait: 5,
  grow: 0.5,
  maxRestarts: 100,
});

const comando = process.argv[2];
svc.on('install', () => { console.log('Serviço instalado. Iniciando...'); svc.start(); });
svc.on('alreadyinstalled', () => console.log('O serviço já está instalado. Use "reiniciar" para aplicar mudanças.'));
svc.on('start', () => console.log('Serviço em execução.'));
svc.on('uninstall', () => console.log('Serviço removido.'));
svc.on('error', (e) => { console.error('Erro:', e); process.exitCode = 1; });

switch (comando) {
  case 'instalar': svc.install(); break;
  case 'remover': svc.uninstall(); break;
  case 'reiniciar': svc.restart(); break;
  default:
    console.log('Uso: npm run servico -- instalar | remover | reiniciar');
}
