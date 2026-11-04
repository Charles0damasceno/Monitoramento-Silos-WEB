import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, CircularProgress, Container, CssBaseline, GlobalStyles, Snackbar, Stack, Tab, Tabs,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { ThemeProvider } from '@mui/material/styles';
import { criarTema } from './tema';
import { api } from './api';
import { useAgora, useAoVivo } from './useAoVivo';
import { haQuanto } from './formatar';
import PaginaRelatorios from './paginas/PaginaRelatorios';
import PaginaFabrica from './paginas/PaginaFabrica';
import PaginaConfiguracoes from './paginas/PaginaConfiguracoes';
import SettingsIcon from '@mui/icons-material/SettingsOutlined';
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

const PAGINAS = ['silos', 'relatorios', 'fabrica', 'configuracoes'];

/** Página atual guardada no endereço (#/relatorios): dá para favoritar e voltar com o botão do navegador. */
function usePagina() {
  const ler = () => {
    const p = window.location.hash.replace(/^#\/?/, '');
    return PAGINAS.includes(p) ? p : 'silos';
  };
  const [pagina, setPagina] = useState(ler);
  useEffect(() => {
    const aoMudar = () => setPagina(ler());
    window.addEventListener('hashchange', aoMudar);
    return () => window.removeEventListener('hashchange', aoMudar);
  }, []);
  const irPara = (p) => { window.location.hash = p === 'silos' ? '' : `/${p}`; setPagina(p); };
  return [pagina, irPara];
}

function Painel({ usuario, aoSair, modoTema, aoTrocarTema }) {
  const agora = useAgora();
  const [modoTv, setModoTv] = useState(false);
  const [aviso, setAviso] = useState(null);
  const { retrato, eventos, servidorOnline } = useAoVivo({ ativo: true, aoDeslogar: aoSair });
  const [pagina, irPara] = usePagina();

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
      <Container
        maxWidth={false}
        sx={{
          py: { xs: 1.5, sm: 2, md: 3 },
          px: { xs: 1.5, sm: 2, md: 3, xl: 4 },
          // Limite em rem: cresce junto com a fonte, então telas 4K não ficam com bordas vazias.
          maxWidth: modoTv ? 'none' : '140rem',
        }}
      >
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

        {usuario.papel === 'admin' && retrato?.colunasNaoCadastradas?.length > 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {retrato.colunasNaoCadastradas.length === 1 ? 'A coluna ' : 'As colunas '}
            <strong>{retrato.colunasNaoCadastradas.join(', ')}</strong>
            {retrato.colunasNaoCadastradas.length === 1 ? ' existe' : ' existem'} no banco da IHM e não{' '}
            {retrato.colunasNaoCadastradas.length === 1 ? 'está cadastrada' : 'estão cadastradas'}.
            {' '}Se for um silo novo, inclua em <code>config/silos.json</code> e reinicie o serviço.
          </Alert>
        )}

        {retrato?.congelado && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Os níveis estão exatamente iguais {haQuanto(retrato.congelado.desde, agora).replace('há', 'há mais de')}.
            {' '}A IHM pode ter parado de gravar no banco — confira se os valores batem com o indicador local.
          </Alert>
        )}

        {!modoTv && (
          <Tabs
            value={pagina}
            onChange={(_, v) => irPara(v)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
            className="nao-imprimir"
          >
            <Tab value="silos" label="Silos" />
            <Tab value="relatorios" label="Relatórios" />
            <Tab value="fabrica" label="Fábrica" />
            {usuario.papel === 'admin' && <Tab value="configuracoes" label="Configurações" icon={<SettingsIcon fontSize="small" />} iconPosition="start" />}
          </Tabs>
        )}

        {pagina === 'relatorios' && !modoTv && <PaginaRelatorios />}
        {pagina === 'fabrica' && !modoTv && <PaginaFabrica agora={agora} />}
        {pagina === 'configuracoes' && !modoTv && <PaginaConfiguracoes usuario={usuario} />}

        {(pagina === 'silos' || modoTv) && (!retrato ? (
          <Stack alignItems="center" py={10}><CircularProgress /></Stack>
        ) : (
          <Stack spacing={2}>
            <Grid container spacing={2}>
              {silos.map((s) => (
                <Grid key={s.id} size={{ xs: 12, sm: 6, lg: colunas, xl: silos.length > 3 ? 3 : colunas }}>
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
        ))}
      </Container>
      <Snackbar open={Boolean(aviso)} autoHideDuration={6000} onClose={() => setAviso(null)}>
        <Alert severity="error" onClose={() => setAviso(null)}>{aviso}</Alert>
      </Snackbar>
    </>
  );
}

export default function App() {
  const [modoTema, setModoTema] = useState(() => lerPreferencia('silos.tema', 'light'));
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
      <GlobalStyles styles={{
        // Impressão do relatório: só a área do relatório, fundo branco, sem menus.
        '@media print': {
          'header, .nao-imprimir, .MuiSnackbar-root': { display: 'none !important' },
          body: { background: '#fff !important', color: '#000 !important' },
          '.area-impressao': { border: 'none !important', boxShadow: 'none !important', background: '#fff !important', color: '#000 !important', padding: '0 !important' },
          '.area-impressao *': { color: '#000 !important', borderColor: '#999 !important' },
          '.so-impressao': { display: 'block !important' },
          '@page': { size: 'A4 landscape', margin: '12mm' },
        },
      }}
      />
      {usuario === undefined && <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>}
      {usuario === null && <TelaLogin aoEntrar={verificar} />}
      {usuario && <Painel usuario={usuario} aoSair={sair} modoTema={modoTema} aoTrocarTema={trocarTema} />}
    </ThemeProvider>
  );
}
