import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, CircularProgress, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { api } from '../api';
import { fmtDataHora, fmtHora, num } from '../formatar';

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const PERIODOS = [
  ['1h', '1 h'], ['6h', '6 h'], ['24h', '24 h'], ['7d', '7 dias'], ['30d', '30 dias'],
];
// Cores sóbrias e distinguíveis (inclusive para daltonismo), sem usar amarelo/vermelho de alarme.
const CORES_SERIES = ['#5b9bd5', '#9b7fd1', '#3fb5a3', '#c78f5b', '#8c9fb0'];
const ATUALIZAR_MS = 60_000;

export default function GraficoTendencia({ silos }) {
  const tema = useTheme();
  const [periodo, setPeriodo] = useState('24h');
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let ativo = true;
    const carregar = () => api.historico(periodo)
      .then((d) => { if (ativo) { setDados(d); setErro(null); } })
      .catch((e) => ativo && setErro(e.message));
    carregar();
    const t = setInterval(carregar, ATUALIZAR_MS);
    return () => { ativo = false; clearInterval(t); };
  }, [periodo]);

  const capacidade = useMemo(() => new Map(silos.map((s) => [s.id, s.capacidadeLitros])), [silos]);
  const curto = periodo === '1h' || periodo === '6h' || periodo === '24h';

  const grafico = useMemo(() => {
    if (!dados) return null;
    const cor = tema.palette.text.secondary;
    const grade = tema.palette.divider;
    return {
      data: {
        datasets: dados.silos.map((s, i) => ({
          label: s.nome,
          data: s.pontos.map((p) => ({ x: p.ts, y: (p.litros / (capacidade.get(s.id) || 1)) * 100, litros: p.litros })),
          borderColor: CORES_SERIES[i % CORES_SERIES.length],
          backgroundColor: CORES_SERIES[i % CORES_SERIES.length],
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.25,
          spanGaps: false,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        parsing: false,
        normalized: true,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            type: 'linear',
            min: dados.ts - { '1h': 3.6e6, '6h': 2.16e7, '24h': 8.64e7, '7d': 6.048e8, '30d': 2.592e9 }[periodo],
            max: dados.ts,
            // Passo em horas "redondas" (múltiplos de UTC, que no Brasil caem em horas cheias).
            ticks: {
              color: cor,
              stepSize: { '1h': 6e5, '6h': 3.6e6, '24h': 1.08e7, '7d': 8.64e7, '30d': 4.32e8 }[periodo],
              callback: (v) => (curto ? fmtHora(v) : fmtDataHora(v)),
            },
            grid: { color: grade },
          },
          y: {
            min: 0,
            max: 100,
            ticks: { color: cor, callback: (v) => `${v}%`, stepSize: 25 },
            grid: { color: grade },
          },
        },
        plugins: {
          legend: { labels: { color: tema.palette.text.primary, usePointStyle: true, boxHeight: 6 } },
          tooltip: {
            callbacks: {
              title: (itens) => (itens.length ? fmtDataHora(itens[0].parsed.x) : ''),
              label: (c) => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)}% (${num(c.raw.litros)} L)`,
            },
          },
        },
      },
    };
  }, [dados, tema, capacidade, periodo, curto]);

  const vazio = dados && dados.silos.every((s) => s.pontos.length === 0);

  return (
    <Paper sx={{ p: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1} mb={1.5}>
        <Typography variant="h2" component="h2">Tendência de nível</Typography>
        <ToggleButtonGroup size="small" exclusive value={periodo} onChange={(_, v) => v && setPeriodo(v)} aria-label="Período">
          {PERIODOS.map(([v, r]) => <ToggleButton key={v} value={v}>{r}</ToggleButton>)}
        </ToggleButtonGroup>
      </Stack>
      {erro && <Alert severity="error" sx={{ mb: 1 }}>Não foi possível carregar o histórico: {erro}</Alert>}
      <Box sx={{ height: { xs: 260, md: 320 }, position: 'relative' }}>
        {!grafico && !erro && (
          <Stack alignItems="center" justifyContent="center" height="100%"><CircularProgress size={28} /></Stack>
        )}
        {grafico && <Line data={grafico.data} options={grafico.options} />}
        {vazio && (
          <Stack alignItems="center" justifyContent="center" sx={{ position: 'absolute', inset: 0 }}>
            <Typography color="text.secondary" variant="body2">
              Ainda não há histórico neste período. O servidor grava um ponto a cada 30 s.
            </Typography>
          </Stack>
        )}
      </Box>
    </Paper>
  );
}
