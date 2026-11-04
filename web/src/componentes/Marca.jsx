import { Box, Stack } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { MARCA } from '../tema';

/** Logos HE Laticínios + Althium Ingredients. Versão branca no tema escuro. */
export function Logos({ altura = { xs: 28, md: 36 }, separador = true, somenteHe = false, sempreColorido = false }) {
  const escuro = useTheme().palette.mode === 'dark';
  const sufixo = escuro && !sempreColorido ? '-branco' : '';
  // O logo HE é mais alto que largo; o Althium é largo e baixo. Ajusta para pesos visuais parecidos.
  // Aceita número (px) ou texto CSS (ex.: '3rem').
  const reduzir = (v) => (typeof v === 'number' ? v * 0.72 : `calc(${v} * 0.72)`);
  const alturaAlthium = typeof altura === 'object'
    ? Object.fromEntries(Object.entries(altura).map(([k, v]) => [k, reduzir(v)]))
    : reduzir(altura);
  return (
    <Stack direction="row" alignItems="center" spacing={{ xs: 1.25, md: 2 }} sx={{ minWidth: 0 }}>
      <Box
        component="img"
        src={`/marca/logo-he${sufixo}.png`}
        alt="HE Laticínios"
        sx={{ height: altura, width: 'auto', display: 'block', flexShrink: 0 }}
      />
      {!somenteHe && (
        <>
          {separador && <Box sx={{ width: '1px', alignSelf: 'stretch', my: 0.5, bgcolor: 'divider', flexShrink: 0 }} />}
          <Box
            component="img"
            src={`/marca/logo-althium${sufixo}.png`}
            alt="Althium Ingredients"
            sx={{ height: alturaAlthium, width: 'auto', display: 'block', minWidth: 0, objectFit: 'contain' }}
          />
        </>
      )}
    </Stack>
  );
}

/** Faixa fina com o degradê verde HE → vinho Althium. */
export function FaixaMarca({ altura = 3 }) {
  return (
    <Box
      aria-hidden
      sx={{ height: altura, background: `linear-gradient(90deg, ${MARCA.verde} 0%, ${MARCA.verde} 35%, ${MARCA.vinho} 65%, ${MARCA.vinho} 100%)` }}
    />
  );
}

/** Ondas de fundo no estilo da identidade visual (verde à esquerda, vinho à direita). */
export function OndasMarca() {
  const escuro = useTheme().palette.mode === 'dark';
  return (
    <Box
      aria-hidden
      component="svg"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      sx={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}
    >
      <defs>
        <linearGradient id="ondaVerde" x1="0" y1="1" x2="0.8" y2="0">
          <stop offset="0" stopColor={MARCA.verde} stopOpacity={escuro ? 0.55 : 0.5} />
          <stop offset="1" stopColor={MARCA.verde} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ondaVinho" x1="1" y1="1" x2="0.3" y2="0.2">
          <stop offset="0" stopColor={MARCA.vinho} stopOpacity="1" />
          <stop offset="0.6" stopColor={MARCA.vinhoClaro} stopOpacity="0.9" />
          <stop offset="1" stopColor={MARCA.vinho} stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <path d="M0 900 L0 250 C 220 420, 420 720, 900 900 Z" fill="url(#ondaVerde)" />
      <path d="M0 900 L0 420 C 260 560, 520 820, 760 900 Z" fill={MARCA.verde} opacity={escuro ? 0.25 : 0.18} />
      <path d="M1600 380 C 1480 640, 1240 820, 980 900 L1600 900 Z" fill="url(#ondaVinho)" />
      <path d="M1600 520 C 1500 720, 1340 840, 1180 900 L1600 900 Z" fill={MARCA.vinhoEscuro} opacity="0.55" />
      {[0, 1, 2, 3].map((i) => (
        <path
          key={i}
          d={`M${-100 + i * 40} ${120 + i * 30} C 400 ${-60 + i * 50}, 900 ${300 + i * 40}, 1700 ${80 + i * 60}`}
          fill="none"
          stroke={escuro ? '#ffffff' : '#ffffff'}
          strokeOpacity={escuro ? 0.05 : 0.6}
          strokeWidth="2"
        />
      ))}
    </Box>
  );
}
