import { Box, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { litros, num, pct } from '../formatar';

function Indicador({ rotulo, valor, sub }) {
  return (
    <Box sx={{ minWidth: 140 }}>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.6 }}>{rotulo}</Typography>
      <Typography sx={{ fontSize: '1.45rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
        {valor}
      </Typography>
      {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
    </Box>
  );
}

export default function ResumoGeral({ silos }) {
  const validos = silos.filter((s) => s.litros !== null);
  const total = validos.reduce((a, s) => a + s.litros, 0);
  // Só soma a capacidade de quem tem leitura, senão o "espaço livre" inclui silos sem dado.
  const capacidade = validos.reduce((a, s) => a + s.capacidadeLitros, 0);
  const semLeitura = silos.length - validos.length;
  const ocupacao = capacidade ? (total / capacidade) * 100 : null;
  const comVazao = silos.filter((s) => s.vazaoLh !== null && !s.desatualizado);
  const vazaoTotal = comVazao.length ? comVazao.reduce((a, s) => a + s.vazaoLh, 0) : null;
  const emAlarme = silos.filter((s) => s.severidade && !s.desatualizado).length;

  return (
    <Paper sx={{ p: 2 }}>
      <Stack direction="row" flexWrap="wrap" useFlexGap spacing={{ xs: 2, md: 5 }} alignItems="flex-start">
        <Indicador rotulo="Leite armazenado" valor={litros(validos.length ? total : null)} sub={`de ${litros(capacidade)}${semLeitura ? ` · ${semLeitura} silo(s) sem leitura` : ''}`} />
        <Box sx={{ flex: 1, minWidth: 200, alignSelf: 'center' }}>
          <Stack direction="row" justifyContent="space-between" mb={0.5}>
            <Typography variant="caption" color="text.secondary">Ocupação total</Typography>
            <Typography variant="caption" sx={{ fontWeight: 700 }}>{pct(ocupacao)}</Typography>
          </Stack>
          <LinearProgress variant="determinate" value={Math.min(ocupacao ?? 0, 100)} sx={{ height: 10, borderRadius: 5 }} />
        </Box>
        <Indicador rotulo="Espaço livre" valor={litros(validos.length ? Math.max(capacidade - total, 0) : null)} />
        <Indicador
          rotulo="Vazão líquida"
          valor={vazaoTotal === null ? '—'
            : `${vazaoTotal > 0 ? '+' : vazaoTotal < 0 ? '−' : ''}${num(Math.abs(Math.round(vazaoTotal)))} L/h`}
          sub="entrada − saída"
        />
        <Indicador rotulo="Silos em alarme" valor={`${emAlarme} de ${silos.length}`} />
      </Stack>
    </Paper>
  );
}
