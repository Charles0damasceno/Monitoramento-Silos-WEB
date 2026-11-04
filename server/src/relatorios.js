'use strict';

// Relatórios por turno ou por dia, calculados a partir do histórico local.

const BALDE_MOVIMENTO_MS = 5 * 60_000;

/** "06:00-14:00,14:00-22:00,22:00-06:00" → [{ nome, inicioMin, fimMin }] */
function lerTurnos(texto) {
  const turnos = String(texto).split(',').map((t, i) => {
    const m = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/.exec(t);
    if (!m) throw new Error(`TURNOS inválido: "${t.trim()}" (use HH:MM-HH:MM separados por vírgula)`);
    const [h1, m1, h2, m2] = m.slice(1).map(Number);
    if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) throw new Error(`TURNOS inválido: "${t.trim()}"`);
    return { numero: i + 1, nome: `${i + 1}º turno (${m[1].padStart(2, '0')}:${m[2]}–${m[3].padStart(2, '0')}:${m[4]})`, inicioMin: h1 * 60 + m1, fimMin: h2 * 60 + m2 };
  });
  if (!turnos.length) throw new Error('TURNOS vazio');
  return turnos;
}

/** Intervalo [inicio, fim) em horário local para uma data (AAAA-MM-DD) e um turno (número ou 'dia'). */
function intervaloDo(data, turno, turnos) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data));
  if (!m) throw new Error('data inválida (use AAAA-MM-DD)');
  const [ano, mes, dia] = m.slice(1).map(Number);
  const base = new Date(ano, mes - 1, dia);
  if (base.getMonth() !== mes - 1) throw new Error('data inválida');
  const em = (minutos, diasDepois = 0) => new Date(ano, mes - 1, dia + diasDepois, 0, minutos).getTime();

  if (turno === 'dia') {
    // O "dia de produção" começa no início do 1º turno (ex.: 06:00 até 06:00 do dia seguinte).
    const ini = turnos[0].inicioMin;
    return { inicio: em(ini), fim: em(ini, 1), nome: `Dia ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}` };
  }
  const t = turnos.find((x) => x.numero === Number(turno));
  if (!t) throw new Error('turno inválido');
  const fimMesmoDia = t.fimMin > t.inicioMin;
  return { inicio: em(t.inicioMin), fim: em(t.fimMin, fimMesmoDia ? 0 : 1), nome: t.nome };
}

/** Média por baldes de 5 min: tira o ruído antes de somar entradas e saídas. */
function suavizar(amostras) {
  const baldes = new Map();
  for (const a of amostras) {
    const k = Math.floor(a.ts / BALDE_MOVIMENTO_MS);
    const b = baldes.get(k) ?? { soma: 0, n: 0 };
    b.soma += a.litros; b.n += 1;
    baldes.set(k, b);
  }
  return [...baldes.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b.soma / b.n);
}

function resumoSilo(silo, { amostras, temperaturas }, eventos, { inicio, fim, historicoMs }) {
  const litros = amostras.map((a) => a.litros);
  const serie = suavizar(amostras);
  let entrada = 0;
  let saida = 0;
  for (let i = 1; i < serie.length; i++) {
    const d = serie[i] - serie[i - 1];
    if (d > 0) entrada += d; else saida -= d;
  }
  const esperadas = Math.max(1, Math.floor((Math.min(fim, Date.now()) - inicio) / historicoMs));
  const temps = temperaturas.map((t) => t.celsius);
  const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  const doSilo = eventos.filter((e) => e.silo_id === silo.id && e.severidade);

  return {
    id: silo.id,
    nome: silo.nome,
    capacidadeLitros: silo.capacidadeLitros,
    amostras: amostras.length,
    cobertura: Math.min(100, Math.round((amostras.length / esperadas) * 100)),
    inicioLitros: litros.length ? litros[0] : null,
    fimLitros: litros.length ? litros[litros.length - 1] : null,
    minimoLitros: litros.length ? Math.min(...litros) : null,
    maximoLitros: litros.length ? Math.max(...litros) : null,
    entradaLitros: litros.length ? Math.round(entrada) : null,
    saidaLitros: litros.length ? Math.round(saida) : null,
    temperatura: temps.length
      ? { minima: Math.min(...temps), maxima: Math.max(...temps), media: Math.round(media(temps) * 10) / 10 }
      : null,
    alarmes: doSilo.length,
    alarmesSemReconhecer: doSilo.filter((e) => !e.reconhecido_em).length,
  };
}

function gerarRelatorio({ config, armazenamento, data, turno, turnos }) {
  const intervalo = intervaloDo(data, turno, turnos);
  const eventos = armazenamento.eventosEntre(intervalo.inicio, intervalo.fim);
  const silos = config.silos.map((s) => resumoSilo(
    s, armazenamento.intervalo(s.id, intervalo.inicio, intervalo.fim), eventos,
    { ...intervalo, historicoMs: config.historicoMs },
  ));
  const soma = (campo) => (silos.some((s) => s[campo] !== null) ? silos.reduce((a, s) => a + (s[campo] ?? 0), 0) : null);
  return {
    titulo: intervalo.nome,
    data,
    turno: String(turno),
    inicio: intervalo.inicio,
    fim: intervalo.fim,
    geradoEm: Date.now(),
    silos,
    totais: {
      inicioLitros: soma('inicioLitros'),
      fimLitros: soma('fimLitros'),
      entradaLitros: soma('entradaLitros'),
      saidaLitros: soma('saidaLitros'),
      alarmes: silos.reduce((a, s) => a + s.alarmes, 0),
    },
    eventos: eventos.filter((e) => e.tipo !== 'sistema'),
  };
}

// ---------- CSV (abre direto no Excel em português) ----------

const fmtDataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

function celula(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v).replace('.', ',');
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function relatorioCsv(r) {
  const linhas = [];
  const add = (...c) => linhas.push(c.map(celula).join(';'));
  add('Painel de Silos', r.titulo);
  add('Período', `${fmtDataHora.format(r.inicio)} até ${fmtDataHora.format(r.fim)}`);
  add('Gerado em', fmtDataHora.format(r.geradoEm));
  add();
  add('Silo', 'Início (L)', 'Fim (L)', 'Mínimo (L)', 'Máximo (L)', 'Entrada estimada (L)', 'Saída estimada (L)',
    'Temp. mín (°C)', 'Temp. máx (°C)', 'Temp. média (°C)', 'Alarmes', 'Sem reconhecer', 'Cobertura dos dados (%)');
  for (const s of r.silos) {
    add(s.nome, s.inicioLitros, s.fimLitros, s.minimoLitros, s.maximoLitros, s.entradaLitros, s.saidaLitros,
      s.temperatura?.minima, s.temperatura?.maxima, s.temperatura?.media, s.alarmes, s.alarmesSemReconhecer, s.cobertura);
  }
  add('TOTAL', r.totais.inicioLitros, r.totais.fimLitros, '', '', r.totais.entradaLitros, r.totais.saidaLitros, '', '', '', r.totais.alarmes);
  add();
  add('Data/hora', 'Evento', 'Severidade', 'Reconhecido por', 'Reconhecido em');
  for (const e of r.eventos) {
    add(fmtDataHora.format(e.ts), e.mensagem, e.severidade ?? 'informativo', e.reconhecido_por,
      e.reconhecido_em ? fmtDataHora.format(e.reconhecido_em) : '');
  }
  // BOM: faz o Excel reconhecer UTF-8 (acentos).
  return `﻿${linhas.join('\r\n')}\r\n`;
}

module.exports = { lerTurnos, intervaloDo, gerarRelatorio, relatorioCsv, suavizar };
