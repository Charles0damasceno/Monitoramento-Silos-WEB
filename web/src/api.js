export class ErroApi extends Error {
  constructor(status, corpo) {
    super(corpo?.mensagem || corpo?.erro || `HTTP ${status}`);
    this.status = status;
    this.codigo = corpo?.erro;
  }
}

async function chamar(metodo, rota, corpo) {
  const r = await fetch(`/api${rota}`, {
    method: metodo,
    credentials: 'same-origin',
    headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await r.text();
  const dados = texto ? JSON.parse(texto) : null;
  if (!r.ok) throw new ErroApi(r.status, dados);
  return dados;
}

export const api = {
  eu: () => chamar('GET', '/eu'),
  login: (usuario, senha) => chamar('POST', '/login', { usuario, senha }),
  logout: () => chamar('POST', '/logout'),
  historico: (periodo, grandeza = 'nivel') => chamar('GET', `/historico?periodo=${encodeURIComponent(periodo)}&grandeza=${grandeza}`),
  turnos: () => chamar('GET', '/turnos'),
  relatorio: (data, turno) => chamar('GET', `/relatorio?data=${encodeURIComponent(data)}&turno=${encodeURIComponent(turno)}`),
  urlRelatorioCsv: (data, turno) => `/api/relatorio.csv?data=${encodeURIComponent(data)}&turno=${encodeURIComponent(turno)}`,
  fabrica: () => chamar('GET', '/fabrica'),
  admin: {
    silos: () => chamar('GET', '/admin/silos'),
    salvarSilos: (silos) => chamar('PUT', '/admin/silos', { silos }),
    usuarios: () => chamar('GET', '/admin/usuarios'),
    criarUsuario: (dados) => chamar('POST', '/admin/usuarios', dados),
    alterarUsuario: (usuario, dados) => chamar('PATCH', `/admin/usuarios/${encodeURIComponent(usuario)}`, dados),
    removerUsuario: (usuario) => chamar('DELETE', `/admin/usuarios/${encodeURIComponent(usuario)}`),
    testarTelegram: () => chamar('POST', '/admin/telegram/teste'),
    sistema: () => chamar('GET', '/admin/sistema'),
    backup: () => chamar('POST', '/admin/backup'),
    auditoria: () => chamar('GET', '/admin/auditoria?limite=300'),
  },
  eventos: (limite = 100) => chamar('GET', `/eventos?limite=${limite}`),
  reconhecer: (id) => chamar('POST', `/eventos/${id}/reconhecer`),
};
