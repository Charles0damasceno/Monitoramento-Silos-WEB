import { useId } from 'react';
import { useTheme } from '@mui/material/styles';
import { ALERTA } from '../tema';

/**
 * Silo vertical em SVG. O líquido é neutro; só a borda e as marcas de limite
 * ganham cor quando o nível está em alarme. Dado desatualizado aparece hachurado.
 */
export default function Tanque({ percentual, limites, severidade, desatualizado, altura = 220 }) {
  const tema = useTheme();
  const c = tema.silos;
  const idHachura = useId();
  const idRecorte = useId();

  const L = 120; // largura do viewBox
  const A = 240; // altura do viewBox
  const topo = 26;
  const base = A - 14;
  const corpoAltura = base - topo;
  const nivel = Math.min(Math.max(percentual ?? 0, 0), 100);
  const yNivel = base - (corpoAltura * nivel) / 100;
  const yLimite = (p) => base - (corpoAltura * p) / 100;

  const corAlerta = desatualizado ? ALERTA.offline : severidade ? ALERTA[severidade] : null;
  const contorno = corAlerta ?? c.liquidoBorda;

  const formato = `M14 ${topo} Q14 10 30 8 L90 8 Q106 10 106 ${topo} L106 ${base - 6} Q106 ${base} 100 ${base} L20 ${base} Q14 ${base} 14 ${base - 6} Z`;

  return (
    <svg
      viewBox={`0 0 ${L} ${A}`}
      height={altura}
      role="img"
      aria-label={`Nível ${percentual === null ? 'desconhecido' : `${nivel.toFixed(1)}%`}`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <clipPath id={idRecorte}><path d={formato} /></clipPath>
        <pattern id={idHachura} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill={c.tanque} />
          <line x1="0" y1="0" x2="0" y2="8" stroke={ALERTA.offline} strokeWidth="3" opacity="0.5" />
        </pattern>
      </defs>

      <path d={formato} fill={c.tanque} />
      <g clipPath={`url(#${idRecorte})`}>
        <rect
          x="0"
          y={yNivel}
          width={L}
          height={base - yNivel}
          fill={desatualizado ? `url(#${idHachura})` : c.liquido}
          style={{ transition: 'y 900ms ease, height 900ms ease' }}
        />
        {!desatualizado && nivel > 0 && (
          <line x1="0" x2={L} y1={yNivel} y2={yNivel} stroke={c.liquidoBorda} strokeWidth="1.5"
            style={{ transition: 'y1 900ms ease, y2 900ms ease' }} />
        )}
      </g>
      <path d={formato} fill="none" stroke={contorno} strokeWidth={corAlerta ? 3 : 2} />

      {limites && [
        ['muitoAlto', ALERTA.critico], ['alto', ALERTA.atencao],
        ['baixo', ALERTA.atencao], ['muitoBaixo', ALERTA.critico],
      ].map(([chave, cor]) => (
        <g key={chave}>
          <line x1="106" x2="116" y1={yLimite(limites[chave])} y2={yLimite(limites[chave])} stroke={cor} strokeWidth="2" />
        </g>
      ))}
      {[0, 25, 50, 75, 100].map((p) => (
        <line key={p} x1="4" x2="12" y1={yLimite(p)} y2={yLimite(p)} stroke={c.liquidoBorda} strokeWidth="1" opacity="0.6" />
      ))}
    </svg>
  );
}
