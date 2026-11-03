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
import { ALERTA } from '../tema';
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
      <Toolbar sx={{ gap: 2, minHeight: { xs: 56, md: 60 }, flexWrap: { xs: 'wrap', sm: 'nowrap' }, py: { xs: 1, sm: 0 } }}>
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ flexGrow: 1, minWidth: 0 }}>
          <Box component="img" src="/favicon.svg" alt="" sx={{ width: 30, height: 30 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h1" noWrap>Painel de Silos</Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: { xs: 'none', sm: 'block' } }}>
              Monitoramento de nível · leite cru
            </Typography>
          </Box>
        </Stack>

        <StatusComunicacao retrato={retrato} servidorOnline={servidorOnline} agora={agora} />

        <Typography sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, display: { xs: 'none', md: 'block' } }}>
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
    </AppBar>
  );
}
