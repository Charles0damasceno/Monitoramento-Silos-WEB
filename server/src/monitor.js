'use strict';

const { EventEmitter } = require('node:events');
const { ESTADOS, SEVERIDADE, percentual, classificar, vazaoLitrosPorHora, previsao } = require('./niveis');
const { lerDataHora, classificarTemperatura } = require('./temperatura');

const JANELA_VAZAO_MS = 15 * 60_000;
const INTERVALO_AVISO_SALTO_MS = 10 * 60_000;
const fmtC = (c) => `${c.toFixed(1).replace('.', ',')} °C`;

const MOTIVO = {
  coluna_inexistente: 'a coluna não existe na tabela do banco',
  valor_invalido: 'o banco tem um valor que não é número',
};

const ROTULO = {
  [ESTADOS.VAZIO]: 'vazio',
  [ESTADOS.ENCHENDO]: 'começou a encher',
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

  // Estado por silo, criado sob demanda: silos cadastrados pela tela de configurações
  // entram sem reiniciar o serviço.
  const estado = new Map();
  const estadoDe = (id) => {
    if (!estado.has(id)) {
      estado.set(id, {
        estado: ESTADOS.NORMAL, litros: null, janela: [], semLeitura: null,
        temperatura: null, // { celsius, ts, estado }
        ultimoAvisoSalto: 0,
      });
    }
    return estado.get(id);
  };
  const temp = config.temperatura ?? { tabela: null };
  const anomalias = config.anomalias ?? { saltoPct: 0, congeladoMs: 0 };
  let temperaturaAtiva = Boolean(temp.tabela && fonte.lerTemperaturas);
  let ultimaLeituraTemp = 0;
  let ultimaGravacaoTemp = 0;
  let ultimaMudanca = agora(); // última vez que algum silo mudou de valor
  let congelado = false;
  const colunasAvisadas = new Set();
  let colunasNaoCadastradas = [];
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
      colunasNaoCadastradas,
      congelado: congelado ? { desde: ultimaMudanca } : null,
      silos: config.silos.map((s) => {
        const st = estadoDe(s.id);
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
          previsao: st.semLeitura ? { tendencia: 'desconhecida', horas: null } : previsao(st.litros, s.capacidadeLitros, vazao),
          desatualizado: offline || Boolean(st.semLeitura),
          motivoSemLeitura: offline ? 'sem_comunicacao' : st.semLeitura,
          temperatura: s.temperatura && temperaturaAtiva
            ? { ...(st.temperatura ?? { celsius: null, ts: null, estado: 'desatualizada' }), maxC: s.temperatura.maxC }
            : null,
        };
      }),
    };
  }

  function processarLeitura({ valores, faltando, naoCadastradas }, ts) {
    for (const s of config.silos) {
      const st = estadoDe(s.id);
      const motivo = faltando.get(s.id) ?? null;
      if (motivo !== st.semLeitura) {
        registrar(motivo
          ? { ts, siloId: s.id, tipo: 'leitura', estado: 'sem_leitura', severidade: 'atencao',
            mensagem: `${s.nome}: sem leitura — ${MOTIVO[motivo]} (coluna "${s.coluna}")` }
          : { ts, siloId: s.id, tipo: 'leitura', estado: 'ok', mensagem: `${s.nome}: leitura restabelecida` });
        st.semLeitura = motivo;
      }
      if (motivo) continue; // mantém o último valor válido (se houver), marcado como desatualizado

      const litros = valores.get(s.id);
      const anterior = st.litros;
      if (anterior !== null && litros !== anterior) ultimaMudanca = ts;

      // Salto impossível entre duas leituras seguidas: sensor ou gravação com problema.
      const salto = anterior === null ? 0 : Math.abs(litros - anterior);
      if (anomalias.saltoPct > 0 && salto > (s.capacidadeLitros * anomalias.saltoPct) / 100
          && ts - st.ultimoAvisoSalto > INTERVALO_AVISO_SALTO_MS) {
        st.ultimoAvisoSalto = ts;
        registrar({
          ts, siloId: s.id, tipo: 'anomalia', estado: 'salto', severidade: 'atencao',
          mensagem: `${s.nome}: leitura suspeita — variou ${salto.toLocaleString('pt-BR')} L entre duas leituras `
            + `(${anterior.toLocaleString('pt-BR')} → ${litros.toLocaleString('pt-BR')} L)`,
        });
      }

      st.litros = litros;
      st.janela.push({ ts, litros });
      while (st.janela.length && st.janela[0].ts < ts - JANELA_VAZAO_MS) st.janela.shift();

      const novo = classificar(percentual(litros, s.capacidadeLitros), s.limites, st.estado, undefined, config.vazioPct ?? 0);
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

    for (const coluna of naoCadastradas) {
      if (colunasAvisadas.has(coluna)) continue;
      colunasAvisadas.add(coluna);
      registrar({
        ts, tipo: 'sistema', estado: 'coluna_nova',
        mensagem: `Coluna "${coluna}" encontrada no banco e não cadastrada em config/silos.json (silo novo?)`,
      });
    }
    colunasNaoCadastradas = naoCadastradas;
    verificarCongelamento(ts);

    if (ts - ultimaGravacao >= config.historicoMs) {
      const lidos = config.silos.filter((s) => valores.has(s.id));
      if (lidos.length) armazenamento.gravarAmostras(ts, lidos.map((s) => ({ siloId: s.id, litros: valores.get(s.id) })));
      ultimaGravacao = ts;
    }
  }

  /**
   * A tabela da IHM não tem data/hora: se a IHM parar de gravar, o valor fica igual para sempre
   * e parece real. Silo vazio ou cheio parado é normal; nível intermediário idêntico por horas não é.
   */
  function verificarCongelamento(ts) {
    if (!anomalias.congeladoMs) return;
    const intermediario = config.silos.some((s) => {
      const st = estadoDe(s.id);
      const pct = st.semLeitura ? null : percentual(st.litros, s.capacidadeLitros);
      return pct !== null && pct > 1 && pct < 99;
    });
    const agoraCongelado = intermediario && ts - ultimaMudanca >= anomalias.congeladoMs;
    if (agoraCongelado === congelado) return;
    congelado = agoraCongelado;
    const horas = Math.round(anomalias.congeladoMs / 3_600_000);
    registrar(congelado
      ? { ts, tipo: 'anomalia', estado: 'congelado', severidade: 'atencao',
        mensagem: `Os níveis não mudam há mais de ${horas} h — a IHM pode ter parado de gravar no banco` }
      : { ts, tipo: 'anomalia', estado: 'ok', mensagem: 'Os níveis voltaram a variar' });
  }

  async function lerTemperaturas(ts) {
    let leituras;
    try {
      leituras = await fonte.lerTemperaturas(temp.tabela);
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR') {
        temperaturaAtiva = false;
        log.warn(`Temperatura desligada: tabela "${temp.tabela}" inexistente ou com colunas diferentes (${e.code})`);
      } else {
        log.warn(`Falha ao ler temperaturas: ${e.message}`);
      }
      return;
    }
    const gravar = [];
    for (const s of config.silos) {
      if (!s.temperatura) continue;
      const st = estadoDe(s.id);
      const bruto = leituras.get(s.temperatura.sensor);
      const leitura = bruto ? { celsius: bruto.celsius, ts: lerDataHora(bruto.dataHora) } : { celsius: null, ts: null };
      const anterior = st.temperatura?.estado ?? 'normal';
      const novo = classificarTemperatura(leitura, {
        maxC: s.temperatura.maxC, validadeMs: temp.validadeMs, agora: ts, anterior,
      });
      if (novo === 'alta' && anterior !== 'alta') {
        registrar({
          ts, siloId: s.id, tipo: 'temperatura', estado: 'alta', severidade: 'critico',
          mensagem: `${s.nome}: temperatura ALTA (${fmtC(leitura.celsius)}, limite ${fmtC(s.temperatura.maxC)})`,
        });
      } else if (novo === 'normal' && anterior === 'alta') {
        registrar({
          ts, siloId: s.id, tipo: 'temperatura', estado: 'normal',
          mensagem: `${s.nome}: temperatura normalizada (${fmtC(leitura.celsius)})`,
        });
      }
      st.temperatura = { celsius: leitura.celsius, ts: leitura.ts, estado: novo };
      if (novo !== 'desatualizada') gravar.push({ siloId: s.id, celsius: leitura.celsius });
    }
    if (gravar.length && ts - ultimaGravacaoTemp >= config.historicoMs) {
      armazenamento.gravarTemperaturas(ts, gravar);
      ultimaGravacaoTemp = ts;
    }
  }

  async function ciclo() {
    const ts = agora();
    try {
      const leitura = await fonte.ler();
      processarLeitura(leitura, ts);
      if (temperaturaAtiva && config.silos.some((s) => s.temperatura) && ts - ultimaLeituraTemp >= temp.intervaloMs) {
        ultimaLeituraTemp = ts;
        await lerTemperaturas(ts);
      }
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
      estadoDe(s.id).janela = armazenamento.amostrasDesde(s.id, desde);
    }
  }

  /**
   * Aplica um novo cadastro de silos (já validado e gravado em config.silos) sem reiniciar.
   * Silos que saíram perdem o estado em memória; o histórico gravado continua no banco local.
   */
  async function atualizarSilos() {
    const ids = new Set(config.silos.map((s) => s.id));
    for (const id of estado.keys()) if (!ids.has(id)) estado.delete(id);
    fonte.atualizarSilos?.(config.silos);
    ultimaLeituraTemp = 0; // relê temperaturas na próxima leitura
    const desde = agora() - JANELA_VAZAO_MS;
    for (const s of config.silos) {
      const st = estadoDe(s.id);
      if (!st.janela.length) st.janela = armazenamento.amostrasDesde(s.id, desde);
    }
    await ciclo();
  }

  return {
    eventos,
    retrato: () => retrato,
    ciclo,
    atualizarSilos,
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
