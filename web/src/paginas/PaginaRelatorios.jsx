import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, MenuItem, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import { api } from '../api';
import { Logos } from '../componentes/Marca';
import { ALERTA } from '../tema';
import { celsius, fmtDataHora, num } from '../formatar';

const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const L = (v) => (v === null || v === undefined ? '—' : num(v));

function Cobertura({ valor }) {
  const baixa = valor < 90;
  return (
    <Tooltip title="Quanto do período tem leitura gravada. Abaixo de 90%, o servidor ficou desligado ou sem comunicação parte do tempo.">
      <Box component="span" sx={{ color: baixa ? ALERTA.atencao : 'text.secondary', fontWeight: baixa ? 700 : 400 }}>
        {valor}%
      </Box>
    </Tooltip>
  );
}

export default function PaginaRelatorios() {
  const [turnos, setTurnos] = useState([]);
  const [data, setData] = useState(hoje);
  const [turno, setTurno] = useState('dia');
  const [rel, setRel] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => { api.turnos().then(setTurnos).catch(() => {}); }, []);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    api.relatorio(data, turno)
      .then((r) => { if (ativo) { setRel(r); setErro(null); } })
      .catch((e) => ativo && setErro(e.message))
      .finally(() => ativo && setCarregando(false));
    return () => { ativo = false; };
  }, [data, turno]);

  const temTemp = rel?.silos.some((s) => s.temperatura);

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }} className="nao-imprimir">
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} useFlexGap flexWrap="wrap">
          <Typography variant="h2" component="h1" sx={{ flexGrow: 1 }}>Relatório de silos</Typography>
          <TextField
            type="date" size="small" label="Data" value={data}
            onChange={(e) => e.target.value && setData(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField select size="small" label="Período" value={turno} onChange={(e) => setTurno(e.target.value)} sx={{ minWidth: 220 }}>
            <MenuItem value="dia">Dia inteiro</MenuItem>
            {turnos.map((t) => <MenuItem key={t.numero} value={String(t.numero)}>{t.nome}</MenuItem>)}
          </TextField>
          <Button variant="outlined" startIcon={<DownloadIcon />} href={api.urlRelatorioCsv(data, turno)} disabled={!rel}>
            Excel
          </Button>
          <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()} disabled={!rel}>
            Imprimir / PDF
          </Button>
        </Stack>
      </Paper>

      {erro && <Alert severity="error">{erro}</Alert>}
      {carregando && !rel && <Stack alignItems="center" py={6}><CircularProgress /></Stack>}

      {rel && (
        <Paper sx={{ p: { xs: 2, md: 3 }, opacity: carregando ? 0.6 : 1 }} className="area-impressao">
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" mb={2} spacing={1}>
            <Box>
              <Box className="so-impressao" sx={{ display: 'none', mb: 2 }}>
                <Logos altura={44} sempreColorido />
              </Box>
              <Typography variant="overline" color="text.secondary">Painel de Silos · Relatório</Typography>
              <Typography variant="h2">{rel.titulo}</Typography>
              <Typography variant="body2" color="text.secondary">
                {fmtDataHora(rel.inicio)} até {fmtDataHora(rel.fim)}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">Gerado em {fmtDataHora(rel.geradoEm)}</Typography>
          </Stack>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Silo</TableCell>
                  <TableCell align="right">Início (L)</TableCell>
                  <TableCell align="right">Fim (L)</TableCell>
                  <TableCell align="right">Mín. (L)</TableCell>
                  <TableCell align="right">Máx. (L)</TableCell>
                  <TableCell align="right">Entrada est. (L)</TableCell>
                  <TableCell align="right">Saída est. (L)</TableCell>
                  {temTemp && <TableCell align="right">Temp. mín–máx</TableCell>}
                  <TableCell align="right">Alarmes</TableCell>
                  <TableCell align="right">Dados</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rel.silos.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{s.nome}</TableCell>
                    <TableCell align="right">{L(s.inicioLitros)}</TableCell>
                    <TableCell align="right">{L(s.fimLitros)}</TableCell>
                    <TableCell align="right">{L(s.minimoLitros)}</TableCell>
                    <TableCell align="right">{L(s.maximoLitros)}</TableCell>
                    <TableCell align="right">{L(s.entradaLitros)}</TableCell>
                    <TableCell align="right">{L(s.saidaLitros)}</TableCell>
                    {temTemp && (
                      <TableCell align="right">
                        {s.temperatura ? `${celsius(s.temperatura.minima)} – ${celsius(s.temperatura.maxima)}` : '—'}
                      </TableCell>
                    )}
                    <TableCell align="right">
                      {s.alarmes}
                      {s.alarmesSemReconhecer > 0 && (
                        <Box component="span" sx={{ color: ALERTA.critico }}> ({s.alarmesSemReconhecer} sem rec.)</Box>
                      )}
                    </TableCell>
                    <TableCell align="right"><Cobertura valor={s.cobertura} /></TableCell>
                  </TableRow>
                ))}
                <TableRow sx={{ '& td': { fontWeight: 700, borderTop: 2, borderColor: 'divider' } }}>
                  <TableCell>Total</TableCell>
                  <TableCell align="right">{L(rel.totais.inicioLitros)}</TableCell>
                  <TableCell align="right">{L(rel.totais.fimLitros)}</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell align="right">{L(rel.totais.entradaLitros)}</TableCell>
                  <TableCell align="right">{L(rel.totais.saidaLitros)}</TableCell>
                  {temTemp && <TableCell />}
                  <TableCell align="right">{rel.totais.alarmes}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Entrada e saída são estimadas pela variação do nível (médias de 5 min). Movimentos simultâneos de entrada e saída no mesmo silo se compensam.
          </Typography>

          <Typography variant="h2" sx={{ mt: 3, mb: 1 }}>Alarmes e eventos do período</Typography>
          {rel.eventos.length === 0 ? (
            <Typography variant="body2" color="text.secondary">Nenhum evento no período.</Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Data/hora</TableCell>
                    <TableCell>Evento</TableCell>
                    <TableCell>Reconhecido</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rel.eventos.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDataHora(e.ts)}</TableCell>
                      <TableCell sx={{ color: e.severidade ? ALERTA[e.severidade] : undefined, fontWeight: e.severidade ? 600 : 400 }}>
                        {e.mensagem}
                      </TableCell>
                      <TableCell>
                        {e.reconhecido_em ? `${e.reconhecido_por} · ${fmtDataHora(e.reconhecido_em)}` : e.severidade ? 'Não' : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <Box className="so-impressao" sx={{ display: 'none', mt: 6 }}>
            <Stack direction="row" spacing={8}>
              <Box sx={{ borderTop: 1, pt: 0.5, width: 260 }}><Typography variant="caption">Responsável pelo turno</Typography></Box>
              <Box sx={{ borderTop: 1, pt: 0.5, width: 260 }}><Typography variant="caption">Supervisão</Typography></Box>
            </Stack>
          </Box>
        </Paper>
      )}
    </Stack>
  );
}
