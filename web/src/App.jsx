import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, CircularProgress, Container, CssBaseline, Snackbar, Stack } from '@mui/material';
import Grid from '@mui/material/Grid';
import { ThemeProvider } from '@mui/material/styles';
import { criarTema } from './tema';
import { api } from './api';
import { useAgora, useAoVivo } from './useAoVivo';
import Cabecalho from './componentes/Cabecalho';
import CartaoSilo from './componentes/CartaoSilo';
import ResumoGeral from './componentes/ResumoGeral';
import GraficoTendencia from './componentes/GraficoTendencia';
import PainelEventos, { pendente } from './componentes/PainelEventos';
import TelaLogin from './componentes/TelaLogin';

function lerPreferencia(chave, padrao) {
  try { return localStorage.getItem(chave) ?? padrao; } catch { return padrao; }
}
function gravarPreferencia(chave, valor) {
  try { localStorage.setItem(chave, valor); } catch { /* navegador sem armazenamento */ }
}

function Painel({ usuario, aoSair, modoTema, aoTrocarTema }) {
  const agora = useAgora();
  const [modoTv, setModoTv] = useState(false);
  const [aviso, setAviso] = useState(null);
  const { retrato, eventos, servidorOnline } = useAoVivo({ ativo: true, aoDeslogar: aoSair });

  const pendentesPorSilo = useMemo(() => {
    const ids = new Set();
    for (const e of eventos) if (pendente(e) && e.silo_id) ids.add(e.silo_id);
    return ids;
  }, [eventos]);

  const trocarTv = useCallback(async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.().catch(() => {});
      setModoTv(true);
    } else {
      await document.exitFullscreen?.().catch(() => {});
      setModoTv(false);
    }
  }, []);

  useEffect(() => {
    const aoMudar = () => setModoTv(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', aoMudar);
    return () => document.removeEventListener('fullscreenchange', aoMudar);
  }, []);

  const reconhecer = async (id) => {
    try {
      await api.reconhecer(id);
    } catch (e) {
      if (e.status !== 409) setAviso(`Não foi possível reconhecer: ${e.message}`);
    }
  };

  const silos = retrato?.silos ?? [];
  const colunas = silos.length <= 3 ? 12 / Math.max(silos.length, 1) : 4;

  return (
    <>
      <Cabecalho
        usuario={usuario}
        retrato={retrato}
        servidorOnline={servidorOnline}
        agora={agora}
        modoTema={modoTema}
        aoTrocarTema={aoTrocarTema}
        modoTv={modoTv}
        aoTrocarTv={trocarTv}
        aoSair={aoSair}
      />
      <Container maxWidth={modoTv ? false : 'xl'} sx={{ py: { xs: 2, md: 3 } }}>
        {retrato?.fonte.simulada && (
          <Alert severity="warning" variant="filled" sx={{ mb: 2, fontWeight: 600 }}>
            SIMULAÇÃO — os valores abaixo são fictícios (FONTE_DADOS=simulador).
          </Alert>
        )}
        {retrato?.comunicacao.status === 'falha' && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Sem comunicação com o banco da IHM. Os tanques mostram a última leitura válida e não refletem o nível atual.
          </Alert>
        )}

        {!retrato ? (
          <Stack alignItems="center" py={10}><CircularProgress /></Stack>
        ) : (
          <Stack spacing={2}>
            <Grid container spacing={2}>
              {silos.map((s) => (
                <Grid key={s.id} size={{ xs: 12, md: 6, lg: colunas }}>
                  <CartaoSilo silo={s} agora={agora} modoTv={modoTv} alarmeSemReconhecer={pendentesPorSilo.has(s.id)} />
                </Grid>
              ))}
            </Grid>
            <ResumoGeral silos={silos} />
            {!modoTv && (
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, lg: 8 }}><GraficoTendencia silos={silos} /></Grid>
                <Grid size={{ xs: 12, lg: 4 }}><PainelEventos eventos={eventos} aoReconhecer={reconhecer} altura={340} /></Grid>
              </Grid>
            )}
          </Stack>
        )}
      </Container>
      <Snackbar open={Boolean(aviso)} autoHideDuration={6000} onClose={() => setAviso(null)}>
        <Alert severity="error" onClose={() => setAviso(null)}>{aviso}</Alert>
      </Snackbar>
    </>
  );
}

export default function App() {
  const [modoTema, setModoTema] = useState(() => lerPreferencia('silos.tema', 'dark'));
  const tema = useMemo(() => criarTema(modoTema), [modoTema]);
  const [usuario, setUsuario] = useState(undefined); // undefined = verificando

  const verificar = useCallback(() => {
    api.eu().then(setUsuario).catch(() => setUsuario(null));
  }, []);
  useEffect(verificar, [verificar]);

  const sair = useCallback(async () => {
    await api.logout().catch(() => {});
    setUsuario(null);
  }, []);

  const trocarTema = () => {
    const novo = modoTema === 'dark' ? 'light' : 'dark';
    setModoTema(novo);
    gravarPreferencia('silos.tema', novo);
  };

  return (
    <ThemeProvider theme={tema}>
      <CssBaseline />
      {usuario === undefined && <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>}
      {usuario === null && <TelaLogin aoEntrar={verificar} />}
      {usuario && <Painel usuario={usuario} aoSair={sair} modoTema={modoTema} aoTrocarTema={trocarTema} />}
    </ThemeProvider>
  );
}
