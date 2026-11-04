import { Box, Chip, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import Tanque from './Tanque';
import { ALERTA } from '../tema';
import { celsius, duracao, fmtHora, haQuanto, litros, num, pct, ROTULO_ESTADO } from '../formatar';

const piscar = keyframes`50% { box-shadow: 0 0 0 3px ${ALERTA.critico}55; }`;

const SEM_LEITURA = {
  sem_comunicacao: {
    texto: 'Valor congelado (sem comunicação)',
    dica: 'O servidor não consegue ler o banco da IHM. O valor mostrado é a última leitura válida.',
  },
  coluna_inexistente: {
    texto: 'Coluna não encontrada no banco',
    dica: 'A coluna cadastrada em config/silos.json não existe na tabela da IHM. Confira o nome ou se a IHM já grava este silo.',
  },
  valor_invalido: {
    texto: 'Valor inválido no banco',
    dica: 'A IHM gravou um valor vazio ou não numérico para este silo.',
  },
};

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

function LinhaTemperatura({ t, agora }) {
  if (t.estado === 'desatualizada') {
    return (
      <Tooltip title={t.ts ? `Última leitura de temperatura ${haQuanto(t.ts, agora)}` : 'A IHM ainda não gravou temperatura para este silo'}>
        <Stack direction="row" justifyContent="space-between">
          <Typography variant="body2" color="text.secondary">Temperatura</Typography>
          <Typography variant="body2" sx={{ color: ALERTA.offline }}>{t.ts ? 'desatualizada' : 'sem sensor'}</Typography>
        </Stack>
      </Tooltip>
    );
  }
  const alta = t.estado === 'alta';
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="baseline">
      <Typography variant="body2" color="text.secondary">Temperatura</Typography>
      <Tooltip title={t.maxC !== null ? `Limite: ${celsius(t.maxC)}` : 'Sem limite de alarme'}>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 700, fontVariantNumeric: 'tabular-nums',
            ...(alta && { bgcolor: ALERTA.critico, color: '#fff', px: 0.75, borderRadius: 1 }),
          }}
        >
          {celsius(t.celsius)}
        </Typography>
      </Tooltip>
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
  const temperaturaAlta = silo.temperatura?.estado === 'alta';
  const corNivel = silo.desatualizado ? ALERTA.offline : silo.severidade ? ALERTA[silo.severidade] : null;
  const corEstado = silo.desatualizado ? ALERTA.offline
    : silo.severidade ? ALERTA[silo.severidade]
      : temperaturaAlta ? ALERTA.critico : null;
  const critico = (silo.severidade === 'critico' || temperaturaAlta) && !silo.desatualizado;

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
        <Typography variant="h2" component="h2" noWrap sx={{ fontSize: modoTv ? 'clamp(1.3rem, 3vh, 2.6rem)' : undefined, minWidth: 0 }}>
          {silo.nome}
        </Typography>
        <Chip
          size="small"
          label={silo.desatualizado ? 'Sem leitura' : ROTULO_ESTADO[silo.estado]}
          sx={{
            // O selo é do NÍVEL; a temperatura alta já aparece na borda e no valor em °C.
            fontWeight: 700,
            bgcolor: corNivel ?? 'action.selected',
            color: corNivel ? '#111' : 'text.secondary',
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
            altura={modoTv ? 'clamp(220px, 38vh, 900px)' : 'clamp(150px, 9vw + 70px, 520px)'}
          />
        </Box>
        <Stack spacing={1.25} sx={{ flex: 1, minWidth: 0 }}>
          <Box>
            <Typography
              sx={{
                fontSize: modoTv ? 'clamp(3rem, 7vh, 7rem)' : { xs: '2.2rem', md: '2.5rem' },
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
              {silo.temperatura && <LinhaTemperatura t={silo.temperatura} agora={agora} />}
            </Stack>
          </Box>
          <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 1.25 }}>
            {silo.desatualizado ? (
              <Tooltip title={(SEM_LEITURA[silo.motivoSemLeitura] ?? SEM_LEITURA.sem_comunicacao).dica}>
                <Typography variant="body2" sx={{ color: ALERTA.offline, fontWeight: 600 }}>
                  {(SEM_LEITURA[silo.motivoSemLeitura] ?? SEM_LEITURA.sem_comunicacao).texto}
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
