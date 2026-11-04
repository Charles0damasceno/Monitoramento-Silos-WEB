'use strict';

// Cliente mínimo da Bot API do Telegram (https://core.telegram.org/bots/api), sem dependências.
// Só conexões de SAÍDA para api.telegram.org: não é preciso abrir porta no roteador.

class ErroTelegram extends Error {
  constructor(mensagem, codigo) {
    super(mensagem);
    this.codigo = codigo;
  }
}

function criarClienteTelegram({ token, fetch = globalThis.fetch }) {
  const base = `https://api.telegram.org/bot${token}/`;

  async function chamar(metodo, corpo = {}, timeoutMs = 15_000) {
    let resposta;
    try {
      resposta = await fetch(base + metodo, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      // Nunca repassa a mensagem original: ela pode conter a URL com o token.
      throw new ErroTelegram(e.name === 'TimeoutError' ? 'tempo esgotado' : 'sem conexão com api.telegram.org', null);
    }
    const dados = await resposta.json().catch(() => null);
    if (!dados?.ok) throw new ErroTelegram(dados?.description || `HTTP ${resposta.status}`, dados?.error_code ?? resposta.status);
    return dados.result;
  }

  return {
    eu: () => chamar('getMe'),
    enviar: (chatId, texto, botoes) => chamar('sendMessage', {
      chat_id: chatId,
      text: texto,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(botoes && { reply_markup: { inline_keyboard: botoes } }),
    }).then((m) => m.message_id),
    editar: (chatId, messageId, texto) => chamar('editMessageText', {
      chat_id: chatId, message_id: messageId, text: texto, parse_mode: 'HTML',
    }),
    responderClique: (id, texto) => chamar('answerCallbackQuery', { callback_query_id: id, text: texto }),
    atualizacoes: (offset, esperaS = 50) => chamar(
      'getUpdates',
      { offset, timeout: esperaS, allowed_updates: ['callback_query', 'message', 'my_chat_member'] },
      (esperaS + 15) * 1000,
    ),
  };
}

const escaparHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

module.exports = { criarClienteTelegram, ErroTelegram, escaparHtml };
