import { useState } from 'react';
import {
  AppBar, Box, Chip, IconButton, ListItemIcon, Menu, MenuItem, Stack, Toolbar, Tooltip, Typography,
} from '@mui/material';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import DarkModeIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeIcon from '@mui/icons-material/LightModeOutlined';
import AccountCircleIcon from '@mui/icons-material/AccountCircleOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import NotificationsIcon from '@mui/icons-material/NotificationsOutlined';
import { ALERTA } from '../tema';
import { FaixaMarca, Logos } from './Marca';

const ROTULO_NOTIFICACAO = { ok: 'ativos', aguardando: 'ativos', falha: 'com falha', desligado: 'desligados' };
const COR_NOTIFICACAO = { ok: ALERTA.ok, aguardando: ALERTA.ok, falha: ALERTA.critico, desligado: ALERTA.offline };
import { fmtHoraSeg, haQuanto } from '../formatar';

function StatusComunicacao({ retrato, servidorOnline, agora }) {
  let cor; let texto; let dica;
  if (!servidorOnline) {
    cor = ALERTA.critico; texto = 'Servidor inacessível';
    dica = 'O navegador não alcança o servidor do painel. Tentando reconectar…';
  } else if (!retrato || retrato.comunicacao.status === 'iniciando') {
    cor = ALERTA.offline; texto = 'Conectando…'; dica = 'Aguardando a primeira leitura.';
  } else if (retrato.comunicacao.status === 'falha') {
    cor = ALERTA.critico;
    texto = `Sem comunicação · ${haQuanto(retrato.comunicacao.ultimaLeituraOk, agora)}`;
    dica = `O servidor não consegue ler o banco da IHM (${retrato.comunicacao.erro ?? 'erro'}).`;
  } else {
    cor = ALERTA.ok;
    texto = `Online · ${haQuanto(retrato.comunicacao.ultimaLeituraOk, agora)}`;
    dica = `Fonte: ${retrato.fonte.descricao}`;
  }
  return (
    <Tooltip title={dica}>
      <Chip
        size="small"
        variant="outlined"
        icon={<Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: cor, ml: '8px !important' }} />}
        label={texto}
        sx={{ borderColor: cor, fontVariantNumeric: 'tabular-nums' }}
      />
    </Tooltip>
  );
}

export default function Cabecalho({
  usuario, retrato, servidorOnline, agora, modoTema, aoTrocarTema, modoTv, aoTrocarTv, aoSair,
}) {
  const [menu, setMenu] = useState(null);

  return (
    <AppBar position="sticky" color="inherit" elevation={0} sx={{ bgcolor: 'background.paper' }}>
      <Toolbar
        sx={{
          columnGap: { xs: 1, sm: 2 },
          rowGap: 1,
          minHeight: { xs: 56, md: 68, xl: '4.6rem' },
          flexWrap: { xs: 'wrap', md: 'nowrap' },
          py: { xs: 1, md: 0.5 },
          px: { xs: 1.5, sm: 2, md: 3 },
        }}
      >
        <Stack direction="row" spacing={{ xs: 1.25, md: 2 }} alignItems="center" sx={{ flexGrow: 1, minWidth: 0 }}>
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
            <Logos altura={{ sm: 34, md: 40, xl: '2.9rem' }} />
          </Box>
          <Box sx={{ display: { xs: 'block', sm: 'none' }, minWidth: 0 }}>
            <Logos altura={32} />
          </Box>
          {/* No celular o título sai para os dois logos caberem (ele continua na aba do navegador). */}
          <Box sx={{ minWidth: 0, pl: 1, borderLeft: 1, borderColor: 'divider', display: { xs: 'none', sm: 'block' } }}>
            <Typography variant="h1" noWrap sx={{ fontSize: { xs: '1.05rem', md: '1.2rem' } }}>Painel de Silos</Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: { xs: 'none', lg: 'block' } }}>
              Monitoramento de nível · leite cru
            </Typography>
          </Box>
        </Stack>

        <Box sx={{ order: { xs: 3, md: 0 }, width: { xs: '100%', md: 'auto' }, display: 'flex', justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
          <StatusComunicacao retrato={retrato} servidorOnline={servidorOnline} agora={agora} />
        </Box>

        <Typography sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, display: { xs: 'none', md: 'block' }, fontSize: { xl: '1.25rem' } }}>
          {fmtHoraSeg(agora)}
        </Typography>

        <Stack direction="row" spacing={0.5}>
          <Tooltip title={modoTema === 'dark' ? 'Tema claro' : 'Tema escuro'}>
            <IconButton onClick={aoTrocarTema} aria-label="Trocar tema">
              {modoTema === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title={modoTv ? 'Sair do modo TV' : 'Modo TV (tela cheia)'}>
            <IconButton onClick={aoTrocarTv} aria-label="Modo TV">
              {modoTv ? <FullscreenExitIcon /> : <FullscreenIcon />}
            </IconButton>
          </Tooltip>
          {usuario && (
            <>
              <Tooltip title={usuario.nome}>
                <IconButton onClick={(e) => setMenu(e.currentTarget)} aria-label="Conta">
                  <AccountCircleIcon />
                </IconButton>
              </Tooltip>
              <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
                <MenuItem disabled sx={{ opacity: '1 !important' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{usuario.nome}</Typography>
                    <Typography variant="caption" color="text.secondary">{usuario.papel} · v{usuario.versao}</Typography>
                  </Box>
                </MenuItem>
                {usuario.notificacoes && (
                  <MenuItem disabled sx={{ opacity: '1 !important' }}>
                    <ListItemIcon><NotificationsIcon fontSize="small" /></ListItemIcon>
                    <Typography variant="body2">
                      Alertas no Telegram:{' '}
                      <Box component="span" sx={{ fontWeight: 600, color: COR_NOTIFICACAO[usuario.notificacoes.status] }}>
                        {ROTULO_NOTIFICACAO[usuario.notificacoes.status]}
                      </Box>
                    </Typography>
                  </MenuItem>
                )}
                {usuario.loginObrigatorio && (
                  <MenuItem onClick={() => { setMenu(null); aoSair(); }}>
                    <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>Sair
                  </MenuItem>
                )}
              </Menu>
            </>
          )}
        </Stack>
      </Toolbar>
      <FaixaMarca />
    </AppBar>
  );
}
