import { useState } from 'react';
import {
  Box, Button, List, ListItem, Paper, Stack, Tab, Tabs, Tooltip, Typography,
} from '@mui/material';
import ErrorIcon from '@mui/icons-material/Error';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { ALERTA } from '../tema';
import { fmtDataHora } from '../formatar';

const ICONE = {
  critico: <ErrorIcon fontSize="small" sx={{ color: ALERTA.critico }} />,
  atencao: <WarningAmberIcon fontSize="small" sx={{ color: ALERTA.atencao }} />,
};

export const pendente = (e) => e.severidade && !e.reconhecido_em;

export default function PainelEventos({ eventos, aoReconhecer, altura = 420 }) {
  const [aba, setAba] = useState('alarmes');
  const pendentes = eventos.filter(pendente);
  const lista = aba === 'alarmes' ? pendentes : eventos;

  return (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h2" component="h2">Alarmes e eventos</Typography>
      </Stack>
      <Tabs value={aba} onChange={(_, v) => setAba(v)} sx={{ minHeight: 36, mb: 1 }}>
        <Tab value="alarmes" label={`Não reconhecidos (${pendentes.length})`} sx={{ minHeight: 36, textTransform: 'none' }} />
        <Tab value="todos" label="Registro" sx={{ minHeight: 36, textTransform: 'none' }} />
      </Tabs>
      <Box sx={{ overflowY: 'auto', maxHeight: altura, flex: 1 }}>
        {lista.length === 0 ? (
          <Stack alignItems="center" spacing={1} sx={{ py: 5, color: 'text.secondary' }}>
            <CheckCircleOutlineIcon />
            <Typography variant="body2">
              {aba === 'alarmes' ? 'Nenhum alarme aguardando reconhecimento.' : 'Nenhum evento registrado.'}
            </Typography>
          </Stack>
        ) : (
          <List dense disablePadding>
            {lista.map((e) => (
              <ListItem
                key={e.id}
                divider
                sx={{ alignItems: 'flex-start', px: 0.5, opacity: e.reconhecido_em && aba === 'todos' ? 0.75 : 1 }}
                secondaryAction={pendente(e) && (
                  <Button size="small" variant="outlined" onClick={() => aoReconhecer(e.id)}>Reconhecer</Button>
                )}
              >
                <Stack direction="row" spacing={1} sx={{ pr: pendente(e) ? 13 : 0 }}>
                  <Box sx={{ pt: 0.25 }}>{ICONE[e.severidade] ?? <InfoOutlinedIcon fontSize="small" color="disabled" />}</Box>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: e.severidade ? 600 : 400 }}>{e.mensagem}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {fmtDataHora(e.ts)}
                      {e.reconhecido_em && (
                        <Tooltip title={fmtDataHora(e.reconhecido_em)}>
                          <span> · reconhecido por {e.reconhecido_por}</span>
                        </Tooltip>
                      )}
                    </Typography>
                  </Box>
                </Stack>
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </Paper>
  );
}
