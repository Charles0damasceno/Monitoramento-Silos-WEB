'use strict';

// Regras de temperatura dos silos. Funções puras.

/** Faixa que a temperatura precisa baixar abaixo do limite para sair do alarme. */
const HISTERESE_C = 0.5;

/**
 * A IHM grava data_hora como texto. Aceita "dd/mm/aaaa hh:mm[:ss]" e "aaaa-mm-dd hh:mm[:ss]"
 * (horário local do servidor). Retorna milissegundos ou null.
 */
function lerDataHora(texto) {
  if (texto instanceof Date) return Number.isNaN(texto.getTime()) ? null : texto.getTime();
  const s = String(texto ?? '').trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  let partes;
  if (m) partes = [m[3], m[2], m[1], m[4], m[5], m[6]];
  else if ((m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s))) partes = m.slice(1, 7);
  else return null;
  const [ano, mes, dia, h, min, seg] = partes.map((p) => Number(p ?? 0));
  const d = new Date(ano, mes - 1, dia, h, min, seg);
  // Rejeita datas impossíveis (31/02 vira 03/03 no Date).
  if (d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
  return d.getTime();
}

/** 'normal' | 'alta' | 'desatualizada' */
function classificarTemperatura({ celsius, ts }, { maxC, validadeMs, agora, anterior = 'normal' }) {
  if (!Number.isFinite(celsius) || ts === null || agora - ts > validadeMs) return 'desatualizada';
  if (maxC === null || maxC === undefined) return 'normal';
  if (celsius > maxC) return 'alta';
  if (anterior === 'alta' && celsius > maxC - HISTERESE_C) return 'alta';
  return 'normal';
}

module.exports = { HISTERESE_C, lerDataHora, classificarTemperatura };
