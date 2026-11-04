import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Chip, CircularProgress, Paper, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { useTheme } from '@mui/material/styles';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip as ChartTooltip, Legend } from 'chart.js';
import { api } from '../api';
import { ALERTA } from '../tema';
import { duracao, fmtDataHora, haQuanto, litros, num } from '../formatar';

ChartJS.register(BarElement, CategoryScale, LinearScale, ChartTooltip, Legend);

const ATUALIZAR_MS = 60_000;

/** Selo de "há quanto tempo": verde se recente, amarelo se o dado está parado. */
function Frescor({ ts, agora, limiteMs }) {
  if (!ts) return <Chip size="small" label="sem dados" sx={{ bgcolor: ALERTA.offline, color: '#111' }} />;
  const velho = agora - ts > limiteMs;
  return (
    <Tooltip title={`Último registro: ${fmtDataHora(ts)}`}>
      <Chip
        size="small"
        variant={velho ? 'filled' : 'outlined'}
        label={velho ? `parado · último ${haQuanto(ts, agora)}` : `atualizado ${haQuanto(ts, agora)}`}
        sx={velho ? { bgcolor: ALERTA.atencao, color: '#111', fontWeight: 600 } : { borderColor: ALERTA.ok }}
      />
    </Tooltip>
  );
}

function Bloco({ titulo, extra, children }) {
  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} mb={1.5} flexWrap="wrap" useFlexGap>
        <Typography variant="h2" component="h2">{titulo}</Typography>
        {extra}
      </Stack>
      {children}
    </Paper>
  );
}

const ErroParte = ({ parte }) => <Alert severity="error">Não foi possível ler esta parte do banco: {parte.erro}</Alert>;

// ---------- Recepção ----------

function Recepcao({ r, agora }) {
  if (!r.ok) return <Bloco titulo="Recepção de leite"><ErroParte parte={r} /></Bloco>;
  const q = r.qualidade;
  const gravacaoQuebrada = q.semHora > 0 && (!q.ultimaComHora || agora - q.ultimaComHora > 7 * 86_400_000);
  return (
    <Bloco titulo="Recepção de leite" extra={<Frescor ts={q.ultimaComHora} agora={agora} limiteMs={2 * 86_400_000} />}>
      {gravacaoQuebrada && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {num(q.semHora)} de {num(q.total)} descargas estão gravadas <b>sem horário</b> e {num(q.semVolumeMedido)} <b>sem volume medido</b>.
          {q.ultimaComHora && <> A última descarga com horário é de {fmtDataHora(q.ultimaComHora)}.</>}
          {' '}Sem esses dados não é possível fechar a recepção por dia/turno — verifique a gravação na IHM da plataforma.
        </Alert>
      )}
      {r.plataforma && (
        <Stack direction="row" spacing={3} mb={1.5} flexWrap="wrap" useFlexGap>
          <Box>
            <Typography variant="overline" color="text.secondary">Na plataforma agora</Typography>
            <Typography sx={{ fontWeight: 700 }}>{r.plataforma.placa || '—'} · romaneio {r.plataforma.romaneio}</Typography>
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">Volume estimado</Typography>
            <Typography sx={{ fontWeight: 700 }}>{litros(r.plataforma.volumeEstimado)}</Typography>
          </Box>
        </Stack>
      )}
      <TableContainer sx={{ maxHeight: 340 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Romaneio</TableCell>
              <TableCell>Placa</TableCell>
              <TableCell align="right">Estimado</TableCell>
              <TableCell align="right">Medido</TableCell>
              <TableCell>Horário</TableCell>
              <TableCell>Balança</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {r.ultimas.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{d.romaneio}</TableCell>
                <TableCell>{d.placa}</TableCell>
                <TableCell align="right">{num(d.volumeEstimado)}</TableCell>
                <TableCell align="right" sx={{ color: d.volumeMedido ? undefined : 'text.disabled' }}>{d.volumeMedido ? num(d.volumeMedido) : '—'}</TableCell>
                <TableCell sx={{ color: d.inicio ? undefined : 'text.disabled' }}>{d.inicio ? fmtDataHora(d.inicio) : 'sem horário'}</TableCell>
                <TableCell>{d.balanca}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Bloco>
  );
}

// ---------- Ultrafiltração ----------

function Ultrafiltracao({ u, agora }) {
  if (!u.ok) return <Bloco titulo={u.parte?.toUpperCase()}><ErroParte parte={u} /></Bloco>;
  const rotulo = (s) => s.nome ?? `Código ${s.codigo}`;
  const parada = u.atual?.codigo === 0;
  return (
    <Bloco titulo={u.nome} extra={<Frescor ts={u.atual?.ts} agora={agora} limiteMs={24 * 3_600_000} />}>
      {u.atual ? (
        <Stack direction="row" spacing={1.5} alignItems="center" mb={2}>
          <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: parada ? ALERTA.offline : ALERTA.ok }} />
          <Box>
            <Typography sx={{ fontSize: '1.4rem', fontWeight: 700, lineHeight: 1.2 }}>{rotulo(u.atual)}</Typography>
            <Typography variant="caption" color="text.secondary">desde {fmtDataHora(u.atual.ts)}</Typography>
          </Box>
        </Stack>
      ) : <Typography color="text.secondary" mb={2}>Sem registros de status.</Typography>}

      {u.producao && (
        <Stack direction="row" spacing={3} mb={2} flexWrap="wrap" useFlexGap>
          <Box>
            <Typography variant="overline" color="text.secondary">Campanha (receita {u.producao.receita})</Typography>
            <Typography sx={{ fontWeight: 700 }}>{duracao(u.producao.campanhaSegundos / 3600)}</Typography>
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">Alimentação</Typography>
            <Typography sx={{ fontWeight: 700 }}>{num(u.producao.alimentacao)}</Typography>
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">Concentrado / Permeado</Typography>
            <Typography sx={{ fontWeight: 700 }}>{num(u.producao.concentrado)} / {num(u.producao.permeado)}</Typography>
          </Box>
        </Stack>
      )}

      <Typography variant="overline" color="text.secondary">Últimas mudanças de status</Typography>
      <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
        {u.linhaTempo.slice(0, 12).map((s, i) => (
          <Stack key={`${s.ts}-${i}`} direction="row" justifyContent="space-between" sx={{ py: 0.4, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="body2">{rotulo(s)}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDataHora(s.ts)}</Typography>
          </Stack>
        ))}
      </Box>
      {u.linhaTempo.some((s) => !s.nome) && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Para mostrar nomes no lugar dos códigos, preencha "statusUF" em config/fabrica.json.
        </Typography>
      )}
    </Bloco>
  );
}

// ---------- Queijomáticas ----------

function Queijomaticas({ q, agora }) {
  const tema = useTheme();
  const grafico = useMemo(() => {
    if (!q.ok || !q.porDia?.length) return null;
    const dias = [...new Set(q.porDia.map((l) => l.dia))].sort();
    const equipamentos = [...new Set(q.porDia.map((l) => l.equipamento))].sort((a, b) => a - b);
    const cor = tema.palette.text.secondary;
    return {
      data: {
        labels: dias.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`),
        datasets: equipamentos.map((eq, i) => ({
          label: `Queijomática ${eq}`,
          data: dias.map((d) => q.porDia.find((l) => l.dia === d && l.equipamento === eq)?.volume ?? 0),
          backgroundColor: tema.seriesGrafico[i % tema.seriesGrafico.length],
          stack: 'v',
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: { stacked: true, ticks: { color: cor }, grid: { display: false } },
          y: { stacked: true, ticks: { color: cor, callback: (v) => `${num(v / 1000)} mil L` }, grid: { color: tema.palette.divider } },
        },
        plugins: {
          legend: { labels: { color: tema.palette.text.primary, usePointStyle: true, boxHeight: 6 } },
          tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${litros(c.parsed.y)}` } },
        },
      },
    };
  }, [q, tema]);

  if (!q.ok) return <Bloco titulo="Queijomáticas"><ErroParte parte={q} /></Bloco>;
  return (
    <Bloco titulo="Queijomáticas" extra={<Frescor ts={q.ultimoRegistro} agora={agora} limiteMs={2 * 86_400_000} />}>
      {q.ultimoRegistro && agora - q.ultimoRegistro > 2 * 86_400_000 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Nenhuma produção registrada desde {fmtDataHora(q.ultimoRegistro)}. O gráfico mostra os 30 dias até o último registro.
        </Alert>
      )}
      {grafico && (
        <Box sx={{ height: 260, mb: 2 }}>
          <Bar data={grafico.data} options={grafico.options} />
        </Box>
      )}
      <TableContainer sx={{ maxHeight: 320 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Equipamento</TableCell>
              <TableCell>Produto</TableCell>
              <TableCell>Lote / OP</TableCell>
              <TableCell align="right">Selecionado</TableCell>
              <TableCell align="right">Medido</TableCell>
              <TableCell>Início</TableCell>
              <TableCell align="right">Duração</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {q.ultimosLotes.map((l) => (
              <TableRow key={l.id}>
                <TableCell>{l.nomeEquipamento}</TableCell>
                <TableCell>{l.produto} {l.gordura}</TableCell>
                <TableCell>{l.lote} / {l.op}</TableCell>
                <TableCell align="right">{l.volumeSelecionado ? num(l.volumeSelecionado) : '—'}</TableCell>
                <TableCell align="right">{num(l.volumeMedido)}</TableCell>
                <TableCell>{l.inicio ? fmtDataHora(l.inicio) : '—'}</TableCell>
                <TableCell align="right">{l.inicio && l.fim ? duracao((l.fim - l.inicio) / 3_600_000) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Bloco>
  );
}

export default function PaginaFabrica({ agora }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let ativo = true;
    const carregar = () => api.fabrica()
      .then((d) => { if (ativo) { setDados(d); setErro(null); } })
      .catch((e) => ativo && setErro(e.message));
    carregar();
    const t = setInterval(carregar, ATUALIZAR_MS);
    return () => { ativo = false; clearInterval(t); };
  }, []);

  if (erro) return <Alert severity="error">Não foi possível carregar o painel da fábrica: {erro}</Alert>;
  if (!dados) return <Stack alignItems="center" py={10}><CircularProgress /></Stack>;
  if (!dados.disponivel) {
    return <Alert severity="info">O painel da fábrica só funciona com FONTE_DADOS=mysql e PAINEL_FABRICA=true.</Alert>;
  }

  return (
    <Stack spacing={2}>
      <Typography variant="caption" color="text.secondary">
        Dados lidos do banco da IHM às {fmtDataHora(dados.ts)} (atualiza a cada minuto).
      </Typography>
      <Grid container spacing={2}>
        {dados.ultrafiltracao.map((u, i) => (
          <Grid key={u.id ?? i} size={{ xs: 12, md: 6 }}><Ultrafiltracao u={u} agora={agora} /></Grid>
        ))}
        <Grid size={{ xs: 12, xl: 6 }}><Queijomaticas q={dados.queijomaticas} agora={agora} /></Grid>
        <Grid size={{ xs: 12, xl: 6 }}><Recepcao r={dados.recepcao} agora={agora} /></Grid>
      </Grid>
    </Stack>
  );
}
