'use strict';

// Envia os alarmes do monitor para um chat do Telegram e, opcionalmente,
// permite reconhecê-los por um botão na própria mensagem.

const { escaparHtml: esc } = require('./telegram');

const PESO = { atencao: 1, critico: 2 };
const ICONE = { critico: '🔴', atencao: '🟠' };
const TITULO = { critico: 'ALARME CRÍTICO', atencao: 'Atenção' };
const VALIDADE_FILA_MS = 2 * 3_600_000; // mensagem que não saiu em 2 h já não ajuda ninguém
const CICLO_MS = 30_000;

const fmtDataHora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fmtNum = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

function minutos(ms) {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

function criarNotificador({ config, monitor, armazenamento, cliente, log, agora = Date.now, esperaS = 50 }) {
  const { chatId, reconhecer } = config.telegram;
  const { severidadeMinima, repetirMs } = config.notificacoes;

  const notificavel = (e) => Boolean(e.severidade) && PESO[e.severidade] >= PESO[severidadeMinima];
  // Eventos com a mesma chave descrevem a mesma condição (ex.: o nível do Silo 2).
  const chaveDe = (e) => (e.tipo === 'comunicacao' ? 'comunicacao' : `${e.tipo}:${e.siloId}`);

  const pendentes = new Map(); // eventoId → { chave, evento, ultimoEnvio }   (aguardando reconhecimento)
  const mensagens = new Map(); // eventoId → { ids, texto, criado }            (para editar ao reconhecer)
  const chavesEmAlarme = new Set(); // condições notificadas que ainda não voltaram ao normal
  const fila = [];
  const estado = { ultimoErro: null, ultimoEnvioOk: null };
  let processando = false;
  let parado = false;
  let timer = null;

  const botoes = (e) => (reconhecer && e.id ? [[{ text: '✅ Reconhecer', callback_data: `ack:${e.id}` }]] : undefined);

  function textoAlarme(e, atrasoMs) {
    const cabecalho = atrasoMs
      ? `🔁 <b>Lembrete</b> · sem reconhecimento há ${minutos(atrasoMs)}`
      : `${ICONE[e.severidade]} <b>${TITULO[e.severidade]}</b>`;
    return `${cabecalho}\n${esc(e.mensagem)}\n<i>${fmtDataHora.format(e.ts)}</i>`;
  }

  function enfileirar(item) {
    fila.push({ ...item, criado: agora() });
    processarFila();
  }

  async function processarFila() {
    if (processando) return;
    processando = true;
    try {
      while (fila.length && !parado) {
        const item = fila[0];
        if (agora() - item.criado > VALIDADE_FILA_MS) {
          log.warn('[telegram] mensagem descartada após 2 h sem conseguir enviar');
          fila.shift();
          continue;
        }
        try {
          const id = await cliente.enviar(chatId, item.texto, item.botoes);
          if (item.eventoId) {
            const m = mensagens.get(item.eventoId) ?? { ids: [], texto: item.texto, criado: agora() };
            m.ids.push(id);
            mensagens.set(item.eventoId, m);
          }
          if (estado.ultimoErro) log.info('[telegram] envio restabelecido');
          estado.ultimoErro = null;
          estado.ultimoEnvioOk = agora();
          fila.shift();
        } catch (e) {
          // 400/403: mensagem recusada ou bot fora do grupo. Repetir não resolve; descarta.
          if (e.codigo === 400 || e.codigo === 403) fila.shift();
          if (estado.ultimoErro !== e.message) log.warn(`[telegram] falha ao enviar: ${e.message}`);
          estado.ultimoErro = e.message;
          break; // tenta de novo no próximo ciclo
        }
      }
    } finally {
      processando = false;
    }
  }

  function aoEvento(e) {
    if (e.tipo === 'sistema') return;
    const chave = chaveDe(e);
    // Qualquer evento novo da mesma condição substitui o anterior: para de lembrar o antigo.
    for (const [id, p] of pendentes) if (p.chave === chave) pendentes.delete(id);

    if (notificavel(e)) {
      chavesEmAlarme.add(chave);
      if (repetirMs > 0 && e.id) pendentes.set(e.id, { chave, evento: e, ultimoEnvio: agora() });
      enfileirar({ texto: textoAlarme(e), botoes: botoes(e), eventoId: e.id });
    } else if (!e.severidade && chavesEmAlarme.delete(chave)) {
      // Alarme de nível baixo que terminou com o silo vazio: aviso neutro, não "normalizado".
      const [icone, titulo] = e.estado === 'vazio' ? ['⚪', 'Silo esvaziado']
        : e.tipo === 'comunicacao' ? ['🟢', 'Normalizado'] : ['✅', 'Normalizado'];
      enfileirar({ texto: `${icone} <b>${titulo}</b>\n${esc(e.mensagem)}\n<i>${fmtDataHora.format(e.ts)}</i>` });
    }
  }

  function aoReconhecido({ id, por, em }) {
    pendentes.delete(id);
    const m = mensagens.get(id);
    if (!m) return;
    mensagens.delete(id);
    const texto = `${m.texto}\n\n✅ Reconhecido por ${esc(por)} às ${fmtHora.format(em)}`;
    for (const msgId of m.ids) {
      cliente.editar(chatId, msgId, texto).catch((e) => {
        if (!/not modified/i.test(e.message)) log.warn(`[telegram] não foi possível atualizar a mensagem: ${e.message}`);
      });
    }
  }

  function ciclo() {
    const t = agora();
    for (const p of pendentes.values()) {
      if (t - p.ultimoEnvio >= repetirMs) {
        p.ultimoEnvio = t;
        enfileirar({ texto: textoAlarme(p.evento, t - p.evento.ts), botoes: botoes(p.evento), eventoId: p.evento.id });
      }
    }
    for (const [id, m] of mensagens) if (t - m.criado > 2 * 86_400_000) mensagens.delete(id);
    processarFila();
  }

  // ---------- Recebendo cliques e comandos ----------

  function resumo() {
    const r = monitor.retrato();
    const linhas = r.silos.map((s) => {
      if (s.desatualizado) return `• <b>${esc(s.nome)}</b>: sem leitura`;
      const pct = s.percentual === null ? '—' : `${fmtNum.format(s.percentual)}%`;
      return `• <b>${esc(s.nome)}</b>: ${pct} (${fmtNum.format(s.litros)} L) · ${s.estado.replace('_', ' ')}`;
    });
    const com = r.comunicacao.status === 'ok' ? '🟢 comunicação OK' : '🔴 SEM COMUNICAÇÃO com a IHM';
    return `📊 <b>Silos agora</b> (${fmtHora.format(agora())})\n${linhas.join('\n')}\n${com}`;
  }

  async function tratarAtualizacao(u) {
    const cq = u.callback_query;
    if (cq) {
      if (String(cq.message?.chat?.id) !== String(chatId)) {
        await cliente.responderClique(cq.id, 'Não autorizado.');
        return;
      }
      const id = Number(/^ack:(\d+)$/.exec(cq.data ?? '')?.[1]);
      if (!id) return;
      const nome = `${[cq.from?.first_name, cq.from?.last_name].filter(Boolean).join(' ') || 'Usuário'} (Telegram)`;
      const em = agora();
      const ok = armazenamento.reconhecerEvento(id, nome, em);
      if (ok) {
        log.info(`Evento ${id} reconhecido pelo Telegram por ${nome}`);
        monitor.eventos.emit('reconhecido', { id, por: nome, em });
      }
      await cliente.responderClique(cq.id, ok ? 'Alarme reconhecido.' : 'Este alarme já estava reconhecido.');
      return;
    }
    const msg = u.message;
    if (!msg?.text || String(msg.chat?.id) !== String(chatId)) return;
    if (/^\/(status|silos)(@\w+)?\b/i.test(msg.text)) {
      enfileirar({ texto: resumo() });
    } else if (/^\/(start|ajuda|help)(@\w+)?\b/i.test(msg.text)) {
      enfileirar({ texto: 'Sou o bot do <b>Painel de Silos</b>.\n/status — nível atual dos silos\nOs alarmes chegam aqui automaticamente.' });
    }
  }

  async function receber() {
    let offset;
    let avisouConflito = false;
    while (!parado) {
      try {
        const lista = await cliente.atualizacoes(offset, esperaS);
        for (const u of lista) {
          offset = u.update_id + 1;
          await tratarAtualizacao(u).catch((e) => log.warn(`[telegram] erro ao tratar mensagem: ${e.message}`));
        }
        avisouConflito = false;
      } catch (e) {
        if (parado) break;
        if (e.codigo === 409) {
          if (!avisouConflito) log.warn('[telegram] outro programa está lendo este bot (o painel está rodando duas vezes?)');
          avisouConflito = true;
        }
        await new Promise((ok) => { setTimeout(ok, e.codigo === 409 ? 60_000 : 10_000).unref(); });
      }
    }
  }

  return {
    iniciar() {
      monitor.eventos.on('evento', aoEvento);
      monitor.eventos.on('reconhecido', aoReconhecido);
      timer = setInterval(ciclo, CICLO_MS);
      timer.unref();
      if (reconhecer) receber();
      log.info(`Alertas no Telegram ativos (mínimo: ${severidadeMinima}${repetirMs ? `, lembrete a cada ${minutos(repetirMs)}` : ''})`);
    },
    parar() {
      parado = true;
      clearInterval(timer);
      monitor.eventos.off('evento', aoEvento);
      monitor.eventos.off('reconhecido', aoReconhecido);
    },
    /** Mensagem de teste direta (sem fila), para a tela de configurações mostrar o erro na hora. */
    async testar(quem) {
      await cliente.enviar(chatId, `✅ <b>Painel de Silos</b>\nMensagem de teste enviada por ${esc(quem)}. Os alarmes chegam neste chat.`);
      estado.ultimoErro = null;
      estado.ultimoEnvioOk = agora();
    },
    status: () => ({
      canal: 'telegram',
      status: estado.ultimoErro ? 'falha' : estado.ultimoEnvioOk ? 'ok' : 'aguardando',
      erro: estado.ultimoErro,
      ultimoEnvioOk: estado.ultimoEnvioOk,
      naFila: fila.length,
    }),
    // expostos para testes
    ciclo,
    tratarAtualizacao,
    processarFila,
  };
}

module.exports = { criarNotificador };
