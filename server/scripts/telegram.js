'use strict';

// Configuração dos alertas no Telegram.
//   npm run telegram -- descobrir   mostra o número (chat id) dos grupos/conversas com o bot
//   npm run telegram -- testar      envia uma mensagem de teste para TELEGRAM_CHAT_ID

const path = require('node:path');
const { carregarEnv, RAIZ } = require('../src/config');
const { criarClienteTelegram } = require('../src/telegram');

carregarEnv(path.join(RAIZ, '.env'));
const token = (process.env.TELEGRAM_TOKEN ?? '').trim();
const chatId = (process.env.TELEGRAM_CHAT_ID ?? '').trim();

async function principal() {
  const comando = process.argv[2];
  if (!['descobrir', 'testar'].includes(comando)) {
    console.log('Uso: npm run telegram -- descobrir | testar');
    process.exitCode = comando ? 1 : 0;
    return;
  }
  if (!token) throw new Error('preencha TELEGRAM_TOKEN no .env (o token que o @BotFather enviou)');

  const tg = criarClienteTelegram({ token });
  const bot = await tg.eu();
  console.log(`Bot: @${bot.username} (${bot.first_name})`);

  if (comando === 'descobrir') {
    let lista;
    try {
      lista = await tg.atualizacoes(undefined, 0);
    } catch (e) {
      if (e.codigo === 409) throw new Error('o serviço do painel está lendo o bot agora. Pare o serviço e tente de novo.');
      throw e;
    }
    const chats = new Map();
    for (const u of lista) {
      const chat = u.message?.chat ?? u.my_chat_member?.chat ?? u.callback_query?.message?.chat;
      if (chat) chats.set(chat.id, chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(' '));
    }
    if (!chats.size) {
      console.log('\nNenhuma conversa encontrada. Adicione o bot ao grupo (ou mande "oi" para ele) e rode de novo.');
      return;
    }
    console.log('\nConversas encontradas — copie o número para TELEGRAM_CHAT_ID no .env:');
    for (const [id, nome] of chats) console.log(`  ${String(id).padEnd(16)} ${nome}`);
    return;
  }

  if (!chatId) throw new Error('preencha TELEGRAM_CHAT_ID no .env (descubra com: npm run telegram -- descobrir)');
  await tg.enviar(chatId, '✅ <b>Painel de Silos</b>\nMensagem de teste: os alarmes vão chegar neste chat.');
  console.log('Mensagem de teste enviada. Confira o Telegram.');
}

principal().catch((e) => {
  console.error(`Erro: ${e.message}`);
  process.exit(1);
});
