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
  historico: (periodo) => chamar('GET', `/historico?periodo=${encodeURIComponent(periodo)}`),
  eventos: (limite = 100) => chamar('GET', `/eventos?limite=${limite}`),
  reconhecer: (id) => chamar('POST', `/eventos/${id}/reconhecer`),
};
