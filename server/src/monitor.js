'use strict';

const { EventEmitter } = require('node:events');
const { ESTADOS, SEVERIDADE, percentual, classificar, vazaoLitrosPorHora, previsao } = require('./niveis');

const JANELA_VAZAO_MS = 15 * 60_000;

const ROTULO = {
  [ESTADOS.MUITO_BAIXO]: 'nível MUITO BAIXO',
  [ESTADOS.BAIXO]: 'nível baixo',
  [ESTADOS.NORMAL]: 'nível normal',
  [ESTADOS.ALTO]: 'nível alto',
  [ESTADOS.MUITO_ALTO]: 'nível MUITO ALTO',
};

/**
 * Laço único de leitura. Todas as telas recebem o mesmo "retrato" (snapshot), então o banco
 * da IHM recebe uma consulta por intervalo, não importa quantos navegadores estejam abertos.
 */
function criarMonitor({ config, fonte, armazenamento, log, agora = Date.now }) {
  const eventos = new EventEmitter();
  eventos.setMaxListeners(200);

  const estado = new Map(config.silos.map((s) => [s.id, { estado: ESTADOS.NORMAL, litros: null, janela: [] }]));
  let ultimaLeituraOk = null;
  let falhasSeguidas = 0;
  let online = null; // null = ainda não sabemos
  let ultimoErro = null;
  let ultimaGravacao = 0;
  let timer = null;
  let parado = false;
  let retrato = montarRetrato();

  function registrar(evento) {
    const id = armazenamento.registrarEvento(evento);
    eventos.emit('evento', { id, ...evento, reconhecido_em: null, reconhecido_por: null });
    const nivel = evento.severidade === 'critico' ? 'warn' : 'info';
    log[nivel](`[evento] ${evento.mensagem}`);
  }

  function montarRetrato() {
    const offline = online === false;
    return {
      ts: agora(),
      fonte: { descricao: fonte.descricao, simulada: Boolean(fonte.simulado) },
      comunicacao: {
        status: online === null ? 'iniciando' : online ? 'ok' : 'falha',
        ultimaLeituraOk,
        falhasSeguidas,
        erro: offline ? ultimoErro : null,
      },
      silos: config.silos.map((s) => {
        const st = estado.get(s.id);
        const pct = st.litros === null ? null : percentual(st.litros, s.capacidadeLitros);
        const vazao = vazaoLitrosPorHora(st.janela);
        return {
          id: s.id,
          nome: s.nome,
          capacidadeLitros: s.capacidadeLitros,
          limites: s.limites,
          litros: st.litros,
          percentual: pct === null ? null : Math.round(pct * 10) / 10,
          estado: st.estado,
          severidade: SEVERIDADE[st.estado],
          vazaoLh: vazao === null ? null : Math.round(vazao),
          previsao: previsao(st.litros, s.capacidadeLitros, vazao),
          desatualizado: offline,
        };
      }),
    };
  }

  function processarLeitura(leitura, ts) {
    for (const s of config.silos) {
      const st = estado.get(s.id);
      const litros = leitura.get(s.id);
      st.litros = litros;
      st.janela.push({ ts, litros });
      while (st.janela.length && st.janela[0].ts < ts - JANELA_VAZAO_MS) st.janela.shift();

      const novo = classificar(percentual(litros, s.capacidadeLitros), s.limites, st.estado);
      if (novo !== st.estado) {
        const pct = percentual(litros, s.capacidadeLitros).toFixed(1).replace('.', ',');
        registrar({
          ts, siloId: s.id, tipo: 'nivel', estado: novo, severidade: SEVERIDADE[novo],
          mensagem: novo === ESTADOS.NORMAL
            ? `${s.nome}: voltou ao nível normal (${pct}%)`
            : `${s.nome}: ${ROTULO[novo]} (${pct}%)`,
        });
        st.estado = novo;
      }
    }

    if (ts - ultimaGravacao >= config.historicoMs) {
      armazenamento.gravarAmostras(ts, config.silos.map((s) => ({ siloId: s.id, litros: estado.get(s.id).litros })));
      ultimaGravacao = ts;
    }
  }

  async function ciclo() {
    const ts = agora();
    try {
      const leitura = await fonte.ler();
      processarLeitura(leitura, ts);
      ultimaLeituraOk = ts;
      falhasSeguidas = 0;
      ultimoErro = null;
      if (online !== true) {
        if (online === false) {
          registrar({ ts, tipo: 'comunicacao', estado: 'ok', mensagem: 'Comunicação com o banco da IHM restabelecida' });
        } else {
          log.info(`Primeira leitura OK de ${fonte.descricao}`);
        }
        online = true;
      }
    } catch (e) {
      falhasSeguidas += 1;
      ultimoErro = e.code || e.message;
      log.warn(`Falha na leitura (${falhasSeguidas}x): ${e.message}`);
      if (online !== false && falhasSeguidas >= config.falhasParaOffline) {
        online = false;
        registrar({
          ts, tipo: 'comunicacao', estado: 'offline', severidade: 'critico',
          mensagem: `SEM COMUNICAÇÃO com o banco da IHM (${ultimoErro})`,
        });
      }
    }
    retrato = montarRetrato();
    eventos.emit('retrato', retrato);
  }

  async function laco() {
    if (parado) return;
    await ciclo();
    if (!parado) timer = setTimeout(laco, config.leituraMs);
  }

  async function aquecerJanela() {
    // Recupera a janela de vazão do histórico para não reiniciar "sem tendência" após um restart.
    const desde = agora() - JANELA_VAZAO_MS;
    for (const s of config.silos) {
      estado.get(s.id).janela = armazenamento.amostrasDesde(s.id, desde);
    }
  }

  return {
    eventos,
    retrato: () => retrato,
    ciclo,
    async iniciar() {
      await aquecerJanela();
      registrar({ ts: agora(), tipo: 'sistema', estado: 'inicio', mensagem: `Monitor iniciado (${fonte.descricao})` });
      laco();
    },
    async parar() {
      parado = true;
      clearTimeout(timer);
      await fonte.fechar();
    },
  };
}

module.exports = { criarMonitor };
