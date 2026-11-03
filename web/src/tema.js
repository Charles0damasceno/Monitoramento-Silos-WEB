import { createTheme } from '@mui/material/styles';

// Paleta no estilo ISA-101: fundo neutro, cor só para condições anormais.
const CORES = {
  escuro: {
    fundo: '#16191d',
    painel: '#1f2328',
    painelAlto: '#272c33',
    borda: '#343a42',
    texto: '#e6e9ed',
    textoSec: '#9aa3ad',
    liquido: '#d9e2ea',
    liquidoBorda: '#aebccb',
    tanque: '#2b3138',
  },
  claro: {
    fundo: '#eceff2',
    painel: '#ffffff',
    painelAlto: '#f6f7f9',
    borda: '#d5dae0',
    texto: '#1d2329',
    textoSec: '#5b6670',
    liquido: '#c9d6e3',
    liquidoBorda: '#8ea3b8',
    tanque: '#f1f3f5',
  },
};

export const ALERTA = {
  atencao: '#f2a900',
  critico: '#e5322d',
  ok: '#3fae6a',
  offline: '#7d8791',
};

export function criarTema(modo) {
  const c = modo === 'dark' ? CORES.escuro : CORES.claro;
  return createTheme({
    palette: {
      mode: modo,
      primary: { main: modo === 'dark' ? '#8fb3d9' : '#2f5d8a' },
      warning: { main: ALERTA.atencao },
      error: { main: ALERTA.critico },
      success: { main: ALERTA.ok },
      background: { default: c.fundo, paper: c.painel },
      text: { primary: c.texto, secondary: c.textoSec },
      divider: c.borda,
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif',
      h1: { fontSize: '1.25rem', fontWeight: 600, letterSpacing: 0.2 },
      h2: { fontSize: '1.05rem', fontWeight: 600 },
      overline: { letterSpacing: 1.2, fontWeight: 600 },
    },
    components: {
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { backgroundImage: 'none', border: `1px solid ${c.borda}` } },
      },
      MuiAppBar: { styleOverrides: { root: { border: 'none', borderBottom: `1px solid ${c.borda}` } } },
      MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
      MuiToggleButton: { styleOverrides: { root: { textTransform: 'none', paddingTop: 4, paddingBottom: 4 } } },
    },
    silos: c,
  });
}
