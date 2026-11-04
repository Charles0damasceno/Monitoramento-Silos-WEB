const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const horaSeg = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dataHora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export const litros = (v) => (v === null || v === undefined ? '—' : `${numero.format(v)} L`);
export const num = (v) => (v === null || v === undefined ? '—' : numero.format(v));
export const pct = (v) => (v === null || v === undefined ? '—' : `${decimal.format(v)}%`);
export const celsius = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${decimal.format(v)} °C`);
export const fmtHora = (ts) => hora.format(ts);
export const fmtHoraSeg = (ts) => horaSeg.format(ts);
export const fmtDataHora = (ts) => dataHora.format(ts);

/** "há 5 s", "há 3 min", "há 2 h". */
export function haQuanto(ts, agora = Date.now()) {
  if (!ts) return 'nunca';
  const s = Math.max(0, Math.round((agora - ts) / 1000));
  if (s < 60) return `há ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
}

/** 2.25 → "2 h 15 min" */
export function duracao(horas) {
  if (horas === null || !Number.isFinite(horas)) return '—';
  const totalMin = Math.round(horas * 60);
  if (totalMin < 1) return 'menos de 1 min';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (h >= 48) return `${Math.round(h / 24)} dias`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const ROTULO_ESTADO = {
  vazio: 'Vazio',
  enchendo: 'Enchendo',
  muito_baixo: 'Muito baixo',
  baixo: 'Baixo',
  normal: 'Normal',
  alto: 'Alto',
  muito_alto: 'Muito alto',
};
