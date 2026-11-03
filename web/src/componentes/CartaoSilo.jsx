import { Box, Chip, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import Tanque from './Tanque';
import { ALERTA } from '../tema';
import { duracao, fmtHora, litros, num, pct, ROTULO_ESTADO } from '../formatar';

const piscar = keyframes`50% { box-shadow: 0 0 0 3px ${ALERTA.critico}55; }`;

function Linha({ rotulo, valor, destaque }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
      <Typography variant="body2" color="text.secondary">{rotulo}</Typography>
      <Typography variant="body2" sx={{ fontWeight: destaque ? 700 : 500, fontVariantNumeric: 'tabular-nums' }}>
        {valor}
      </Typography>
    </Stack>
  );
}

function Tendencia({ silo, agora }) {
  const { tendencia, horas } = silo.previsao;
  if (tendencia === 'desconhecida') {
    return <Typography variant="body2" color="text.secondary">Calculando tendência…</Typography>;
  }
  if (tendencia === 'estavel') {
    return (
      <Stack direction="row" spacing={0.5} alignItems="center" color="text.secondary">
        <TrendingFlatIcon fontSize="small" /><Typography variant="body2">Estável</Typography>
      </Stack>
    );
  }
  const enchendo = tendencia === 'enchendo';
  const Icone = enchendo ? TrendingUpIcon : TrendingDownIcon;
  const quando = horas !== null ? fmtHora(agora + horas * 3_600_000) : null;
  return (
    <Stack spacing={0.25}>
      <Stack direction="row" spacing={0.5} alignItems="center">
        <Icone fontSize="small" />
        <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {enchendo ? '+' : '−'}{num(Math.abs(silo.vazaoLh))} L/h
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {enchendo ? 'Cheio' : 'Vazio'} em {duracao(horas)}{quando && horas < 48 ? ` (≈ ${quando})` : ''}
      </Typography>
    </Stack>
  );
}

export default function CartaoSilo({ silo, agora, alarmeSemReconhecer, modoTv }) {
  const corEstado = silo.desatualizado ? ALERTA.offline : silo.severidade ? ALERTA[silo.severidade] : null;
  const critico = silo.severidade === 'critico' && !silo.desatualizado;

  return (
    <Paper
      component="section"
      aria-label={silo.nome}
      sx={{
        p: { xs: 2, md: 2.5 },
        height: '100%',
        borderColor: corEstado ?? 'divider',
        borderWidth: corEstado ? 2 : 1,
        animation: critico && alarmeSemReconhecer ? `${piscar} 1.2s ease-in-out infinite` : 'none',
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
        <Typography variant="h2" component="h2" sx={{ fontSize: modoTv ? '1.4rem' : undefined }}>{silo.nome}</Typography>
        <Chip
          size="small"
          label={silo.desatualizado ? 'Sem leitura' : ROTULO_ESTADO[silo.estado]}
          sx={{
            fontWeight: 700,
            bgcolor: corEstado ?? 'action.selected',
            color: corEstado ? '#111' : 'text.secondary',
          }}
        />
      </Stack>

      <Stack direction="row" spacing={{ xs: 2, md: 3 }} alignItems="center">
        <Box sx={{ flexShrink: 0 }}>
          <Tanque
            percentual={silo.percentual}
            limites={silo.limites}
            severidade={silo.severidade}
            desatualizado={silo.desatualizado}
            altura={modoTv ? 280 : 200}
          />
        </Box>
        <Stack spacing={1.25} sx={{ flex: 1, minWidth: 0 }}>
          <Box>
            <Typography
              sx={{
                fontSize: modoTv ? '3.4rem' : { xs: '2.3rem', md: '2.6rem' },
                fontWeight: 700,
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
                color: silo.desatualizado ? 'text.secondary' : 'text.primary',
              }}
            >
              {pct(silo.percentual)}
            </Typography>
            <Typography variant="body1" sx={{ fontVariantNumeric: 'tabular-nums', mt: 0.5 }}>
              {litros(silo.litros)}
            </Typography>
          </Box>
          <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 1.25 }}>
            <Stack spacing={0.5}>
              <Linha rotulo="Capacidade" valor={litros(silo.capacidadeLitros)} />
              <Linha
                rotulo="Espaço livre"
                valor={litros(silo.litros === null ? null : Math.max(silo.capacidadeLitros - silo.litros, 0))}
              />
            </Stack>
          </Box>
          <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 1.25 }}>
            {silo.desatualizado ? (
              <Tooltip title="O servidor não consegue ler o banco da IHM. O valor mostrado é a última leitura válida.">
                <Typography variant="body2" sx={{ color: ALERTA.offline, fontWeight: 600 }}>
                  Valor congelado (sem comunicação)
                </Typography>
              </Tooltip>
            ) : (
              <Tendencia silo={silo} agora={agora} />
            )}
          </Box>
        </Stack>
      </Stack>
    </Paper>
  );
}
