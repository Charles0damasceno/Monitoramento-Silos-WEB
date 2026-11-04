import { createTheme, responsiveFontSizes } from '@mui/material/styles';

// Identidade visual: HE Laticínios (verde) e Althium Ingredients (vinho).
export const MARCA = {
  verde: '#00782c',
  verdeEscuro: '#005a21',
  verdeClaro: '#4cbf72', // para fundo escuro (contraste)
  vinho: '#a40044',
  vinhoEscuro: '#7d0034',
  vinhoClaro: '#e0477f',
};

// Paleta de processo no estilo ISA-101: neutra; cor forte só para condição anormal.
const CORES = {
  escuro: {
    fundo: '#14171a',
    painel: '#1d2125',
    painelAlto: '#252a30',
    borda: '#333a41',
    texto: '#e8ebee',
    textoSec: '#9ba4ad',
    liquido: '#dfe7ee',
    liquidoBorda: '#aebccb',
    tanque: '#2a3036',
  },
  claro: {
    fundo: '#f3f4f2',
    painel: '#ffffff',
    painelAlto: '#f7f8f6',
    borda: '#dde1dc',
    texto: '#1b2420',
    textoSec: '#56625b',
    liquido: '#d3dee8',
    liquidoBorda: '#8ea3b8',
    tanque: '#eef1f3',
  },
};

// Alarmes: vermelho puxado para o laranja, bem diferente do vinho da marca.
export const ALERTA = {
  atencao: '#f2a900',
  critico: '#e5322d',
  ok: '#2e9e57',
  offline: '#7d8791',
};

// Séries dos gráficos: começam pelas cores da marca, sem amarelo/vermelho de alarme.
export const CORES_SERIES = ['#00782c', '#a40044', '#4a7fb5', '#c78f5b', '#6b5fa8', '#3fa7a0'];
export const CORES_SERIES_ESCURO = ['#4cbf72', '#e0477f', '#7fb0e0', '#e0ad7a', '#a89ce0', '#62cfc6'];

export const FONTE = '"Segoe UI", "Segoe UI Variable", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';

export function criarTema(modo) {
  const escuro = modo === 'dark';
  const c = escuro ? CORES.escuro : CORES.claro;
  const tema = createTheme({
    palette: {
      mode: modo,
      primary: { main: escuro ? MARCA.verdeClaro : MARCA.verde, dark: MARCA.verdeEscuro, contrastText: '#fff' },
      secondary: { main: escuro ? MARCA.vinhoClaro : MARCA.vinho, dark: MARCA.vinhoEscuro, contrastText: '#fff' },
      warning: { main: ALERTA.atencao },
      error: { main: ALERTA.critico },
      success: { main: ALERTA.ok },
      background: { default: c.fundo, paper: c.painel },
      text: { primary: c.texto, secondary: c.textoSec },
      divider: c.borda,
    },
    shape: { borderRadius: 12 },
    breakpoints: { values: { xs: 0, sm: 600, md: 900, lg: 1280, xl: 1800 } },
    typography: {
      fontFamily: FONTE,
      h1: { fontSize: '1.25rem', fontWeight: 700, letterSpacing: 0.1 },
      h2: { fontSize: '1.05rem', fontWeight: 650 },
      overline: { letterSpacing: 1.1, fontWeight: 650, fontSize: '0.68rem' },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          // Escala fluida: a fonte base acompanha a largura da tela (celular → TV 4K).
          html: {
            // 375–1366 px: 14 px · 1920: ~16,6 px · 2560: ~19,5 px · 3840 (4K a 100%): ~25 px
            fontSize: 'clamp(14px, 8px + 0.45vw, 30px)',
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
            textRendering: 'optimizeLegibility',
          },
          body: { fontVariantNumeric: 'tabular-nums', overflowX: 'hidden' },
          'img, svg': { maxWidth: '100%' },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            border: `1px solid ${c.borda}`,
            ...(escuro ? {} : { boxShadow: '0 1px 2px rgba(16, 40, 24, 0.04), 0 2px 8px rgba(16, 40, 24, 0.04)' }),
          },
        },
      },
      MuiAppBar: { styleOverrides: { root: { border: 'none', boxShadow: 'none' } } },
      MuiButton: { defaultProps: { disableElevation: true } },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            paddingTop: 4,
            paddingBottom: 4,
            '&.Mui-selected': {
              color: escuro ? MARCA.verdeClaro : MARCA.verde,
              backgroundColor: escuro ? 'rgba(76,191,114,0.14)' : 'rgba(0,120,44,0.09)',
            },
          },
        },
      },
      MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 44 } } },
      MuiTabs: { styleOverrides: { indicator: { height: 3, borderRadius: 3 } } },
      MuiTableCell: { styleOverrides: { head: { fontWeight: 650, color: c.textoSec, whiteSpace: 'nowrap' } } },
    },
    silos: c,
    marca: MARCA,
    seriesGrafico: escuro ? CORES_SERIES_ESCURO : CORES_SERIES,
  });
  return responsiveFontSizes(tema, { factor: 2.2 });
}
