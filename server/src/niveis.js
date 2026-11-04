'use strict';

// Regras de nível, alarme e tendência. Funções puras: sem banco, sem relógio.

/** Estados possíveis, do mais vazio ao mais cheio (nomenclatura ISA: LL, L, H, HH). */
const ESTADOS = Object.freeze({
  VAZIO: 'vazio', // silo vazio parado (após descarga ou limpeza): informativo
  ENCHENDO: 'enchendo', // saindo do vazio, ainda abaixo do limite baixo: informativo
  MUITO_BAIXO: 'muito_baixo', // LL
  BAIXO: 'baixo', // L
  NORMAL: 'normal',
  ALTO: 'alto', // H
  MUITO_ALTO: 'muito_alto', // HH
});

const SEVERIDADE = Object.freeze({
  [ESTADOS.VAZIO]: null,
  [ESTADOS.ENCHENDO]: null,
  [ESTADOS.MUITO_BAIXO]: 'critico',
  [ESTADOS.BAIXO]: 'atencao',
  [ESTADOS.NORMAL]: null,
  [ESTADOS.ALTO]: 'atencao',
  [ESTADOS.MUITO_ALTO]: 'critico',
});

/** Faixa (em pontos percentuais) que o nível precisa recuar para sair de um alarme. */
const HISTERESE_PCT = 2;

function percentual(litros, capacidade) {
  if (!(capacidade > 0) || !Number.isFinite(litros)) return null;
  return (litros / capacidade) * 100;
}

/**
 * Classifica o nível considerando o estado anterior.
 *
 * Entrar num alarme é imediato ao cruzar o limite; sair exige recuar HISTERESE_PCT abaixo
 * (ou acima) dele. Sem isso, um silo oscilando em 90,0 ↔ 89,9 % gera um alarme a cada leitura.
 *
 * Com `vazioPct` (> 0): até esse nível o silo está VAZIO, sem alarme. Saindo do vazio ele fica
 * ENCHENDO até passar do limite baixo — os alarmes de nível baixo só valem quando o nível DESCE
 * a partir do normal (risco de a bomba puxar ar), não a cada enchimento.
 */
function classificar(pct, limites, anterior = ESTADOS.NORMAL, histerese = HISTERESE_PCT, vazioPct = 0) {
  if (pct === null) return anterior;
  const { muitoBaixo, baixo, alto, muitoAlto } = limites;
  const subindoDe = (estado) => anterior === estado;

  if (vazioPct > 0) {
    if (pct <= vazioPct) return ESTADOS.VAZIO;
    const saindoDoVazio = subindoDe(ESTADOS.VAZIO) || subindoDe(ESTADOS.ENCHENDO);
    if (saindoDoVazio && pct < vazioPct + 0.5 && subindoDe(ESTADOS.VAZIO)) return ESTADOS.VAZIO;
    if (saindoDoVazio && pct <= baixo) return ESTADOS.ENCHENDO;
  }

  if (pct >= muitoAlto) return ESTADOS.MUITO_ALTO;
  if (subindoDe(ESTADOS.MUITO_ALTO) && pct > muitoAlto - histerese) return ESTADOS.MUITO_ALTO;
  if (pct >= alto) return ESTADOS.ALTO;
  if ((subindoDe(ESTADOS.ALTO) || subindoDe(ESTADOS.MUITO_ALTO)) && pct > alto - histerese) return ESTADOS.ALTO;

  if (pct <= muitoBaixo) return ESTADOS.MUITO_BAIXO;
  if (subindoDe(ESTADOS.MUITO_BAIXO) && pct < muitoBaixo + histerese) return ESTADOS.MUITO_BAIXO;
  if (pct <= baixo) return ESTADOS.BAIXO;
  if ((subindoDe(ESTADOS.BAIXO) || subindoDe(ESTADOS.MUITO_BAIXO)) && pct < baixo + histerese) return ESTADOS.BAIXO;

  return ESTADOS.NORMAL;
}

/** Abaixo disso (L/h) consideramos o silo parado: ruído do sensor, não enchimento. */
const VAZAO_MINIMA_LH = 300;

/**
 * Vazão em L/h por regressão linear (mínimos quadrados) sobre os pontos [{ts, litros}].
 * Regressão em vez de (último − primeiro) para não ser enganada por uma leitura ruidosa.
 */
function vazaoLitrosPorHora(pontos) {
  if (!pontos || pontos.length < 3) return null;
  const t0 = pontos[0].ts;
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of pontos) {
    const x = (p.ts - t0) / 3_600_000; // horas
    n += 1; sx += x; sy += p.litros; sxx += x * x; sxy += x * p.litros;
  }
  const den = n * sxx - sx * sx;
  if (den === 0) return null;
  // Exige ao menos 2 minutos de janela, senão a inclinação é só ruído.
  if (pontos[pontos.length - 1].ts - t0 < 120_000) return null;
  return (n * sxy - sx * sy) / den;
}

/** Previsão de quando o silo enche (100 %) ou esvazia (0 %), na vazão atual. */
function previsao(litros, capacidade, vazaoLh) {
  if (vazaoLh === null || !Number.isFinite(litros)) return { tendencia: 'desconhecida', horas: null };
  if (Math.abs(vazaoLh) < VAZAO_MINIMA_LH) return { tendencia: 'estavel', horas: null };
  if (vazaoLh > 0) {
    const restante = Math.max(capacidade - litros, 0);
    return { tendencia: 'enchendo', horas: restante / vazaoLh };
  }
  return { tendencia: 'esvaziando', horas: Math.max(litros, 0) / -vazaoLh };
}

module.exports = {
  ESTADOS, SEVERIDADE, HISTERESE_PCT, VAZAO_MINIMA_LH,
  percentual, classificar, vazaoLitrosPorHora, previsao,
};
