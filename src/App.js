import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Typography, 
  Box, 
  Paper, 
  Grid,
  Card,
  CardContent,
  LinearProgress,
  Tooltip,
  CircularProgress,
  Snackbar,
  Alert,
  List,
  ListItem,
  ListItemText,
  Switch,
  FormControlLabel
} from '@mui/material';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js';
import api from './services/api';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  Legend
);

function App() {
  const [silos, setSilos] = useState([]);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [serverStatus, setServerStatus] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [mock, setMock] = useState(false);
  const [alerta, setAlerta] = useState(null);
  const [alertasRecentes, setAlertasRecentes] = useState([]);
  const [notificacoesAtivas, setNotificacoesAtivas] = useState(true);

  // Função para buscar status do servidor
  const fetchServerStatus = async () => {
    try {
      const response = await api.get('/status');
      if (response.status === 200) {
        setServerStatus(response.data);
      }
    } catch (err) {
      console.error('Erro ao buscar status:', err);
    }
  };

  // Função para verificar alertas
  const checarAlertas = (silos) => {
    if (!notificacoesAtivas) return;
    const novosAlertas = [];
    silos.forEach((silo) => {
      const percent = (silo.quantidade / silo.capacidade) * 100;
      if (percent >= 90) {
        novosAlertas.push({
          tipo: 'cheio',
          mensagem: `Silo ${silo.id} está quase cheio (${percent.toFixed(1)}%)`,
          data: new Date().toLocaleString()
        });
      } else if (percent <= 10) {
        novosAlertas.push({
          tipo: 'vazio',
          mensagem: `Silo ${silo.id} está quase vazio (${percent.toFixed(1)}%)`,
          data: new Date().toLocaleString()
        });
      }
    });
    if (novosAlertas.length > 0) {
      setAlerta(novosAlertas[0]);
      setAlertasRecentes(prev => [...novosAlertas, ...prev].slice(0, 5));
    }
  };

  useEffect(() => {
    const fetchData = async (isInitial = false) => {
      try {
        if (isInitial) setInitialLoading(true);
        // Testa primeiro a conexão básica
        const testResponse = await api.get('/test');
        console.log('Teste de conexão:', testResponse.data);

        // Se o teste passou, busca os dados dos silos
        const silosResponse = await api.get('/silos');
        console.log('Dados recebidos:', silosResponse.data);
        setSilos(silosResponse.data);
        setLastUpdate(new Date());
        setError(null);
        fetchServerStatus();
        // Detecta se são dados mockados (valores exatos dos mocks)
        const isMock = Array.isArray(silosResponse.data) && silosResponse.data.length === 3 &&
          silosResponse.data[0].quantidade === 75000 &&
          silosResponse.data[1].quantidade === 50000 &&
          silosResponse.data[2].quantidade === 25000;
        setMock(isMock);
        if (!isMock) checarAlertas(silosResponse.data);
      } catch (err) {
        console.error('Erro detalhado:', err);
        setError('Erro ao conectar com o servidor: ' + err.message);
        setMock(true); // Se der erro, assume mock
      } finally {
        if (isInitial) setInitialLoading(false);
      }
    };

    fetchData(true); // Carregamento inicial
    const interval = setInterval(() => fetchData(false), 4000); // Atualização sem loading
    return () => clearInterval(interval);
  }, []);

  const data = {
    labels: silos.map(silo => `Silo ${silo.id}`),
    datasets: [
      {
        label: 'Capacidade Total (litros)',
        data: silos.map(silo => silo.capacidade),
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
      },
      {
        label: 'Quantidade Atual (litros)',
        data: silos.map(silo => silo.quantidade),
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1,
      }
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Monitoramento de Silos de Leite',
        font: {
          size: 20
        }
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Litros',
          font: {
            size: 14
          }
        }
      }
    }
  };

  const getProgressColor = (percent) => {
    if (percent >= 90) return '#f44336';
    if (percent >= 70) return '#ff9800';
    return '#4caf50';
  };

  return (
    <Container maxWidth="lg" sx={{ px: { xs: 1, sm: 2, md: 4 } }}>
      <Box sx={{ 
        my: 4,
        background: '#fff',
        borderRadius: '16px',
        p: { xs: 2, sm: 3 },
        boxShadow: '0 3px 5px 2px rgba(33, 203, 243, .1)',
        color: '#0B8742'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
          <Typography variant="h2" sx={{ mr: 2, fontSize: { xs: '2.5rem', sm: '3rem', md: '3.75rem' }, color: '#0B8742' }}>🥛</Typography>
          <Typography variant="h4" component="h1" align="center" sx={{ fontSize: { xs: '1.3rem', sm: '2rem', md: '2.5rem' }, color: '#0B8742' }}>
            Sistema de Monitoramento de Silos
          </Typography>
        </Box>
        {lastUpdate && (
          <Typography variant="body2" align="center" sx={{ mt: 1, color: '#0B8742' }}>
            Última atualização: {lastUpdate.toLocaleTimeString()}
          </Typography>
        )}
        {serverStatus && (
          <Typography variant="body2" align="center" sx={{ mt: 1, fontSize: '0.8rem', color: '#0B8742' }}>
            Modo: {serverStatus.mode} | 
            MySQL: {serverStatus.mysqlConnected ? '✅ Conectado' : '❌ Desconectado'}
          </Typography>
        )}
      </Box>

      {error && (
        <Paper sx={{ 
          mt: 2, 
          p: 2, 
          bgcolor: '#fff3e0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Typography color="error">{error}</Typography>
        </Paper>
      )}
      {initialLoading ? (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '200px' 
        }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Grid container spacing={2}>
            {silos.map((silo) => {
              const percent = (silo.quantidade / silo.capacidade) * 100;
              return (
                <Grid item xs={12} sm={6} md={4} key={silo.id}>
                  <Card 
                    elevation={3} 
                    sx={{ 
                      height: '100%',
                      transition: 'transform 0.2s',
                      '&:hover': {
                        transform: { md: 'scale(1.02)', xs: 'none' }
                      },
                      mb: { xs: 2, md: 0 }
                    }}
                  >
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h5" component="h2" color="primary" sx={{ color: '#0B8742' }}>
                          Silo {silo.id}
                        </Typography>
                        <Tooltip title="Informações do Silo">
                          <Typography variant="h6" sx={{ cursor: 'help' }}>ℹ️</Typography>
                        </Tooltip>
                      </Box>
                      
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="body1" color="text.secondary">
                          Capacidade Total
                        </Typography>
                        <Typography variant="h6">
                          {silo.capacidade.toLocaleString()} litros
                        </Typography>
                      </Box>

                      <Box sx={{ mb: 2 }}>
                        <Typography variant="body1" color="text.secondary">
                          Quantidade Atual
                        </Typography>
                        <Typography variant="h6">
                          {silo.quantidade.toLocaleString()} litros
                        </Typography>
                      </Box>

                      <Box sx={{ mb: 2 }}>
                        <Typography variant="body1" color="text.secondary">
                          Espaço Disponível
                        </Typography>
                        <Typography variant="h6">
                          {(silo.capacidade - silo.quantidade).toLocaleString()} litros
                        </Typography>
                      </Box>

                      <Box sx={{ mt: 2 }}>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          Nível de Preenchimento: {percent.toFixed(1)}%
                        </Typography>
                        <LinearProgress 
                          variant="determinate" 
                          value={percent} 
                          sx={{ 
                            height: 10,
                            borderRadius: 5,
                            backgroundColor: '#e0e0e0',
                            '& .MuiLinearProgress-bar': {
                              backgroundColor: getProgressColor(percent),
                              borderRadius: 5
                            }
                          }}
                        />
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>

          <Paper 
            elevation={3} 
            sx={{ 
              mt: 4, 
              p: { xs: 1, sm: 3 },
              borderRadius: 2,
              background: 'linear-gradient(45deg, #ffffff 30%, #f5f5f5 90%)',
              width: '100%',
              overflowX: 'auto'
            }}
          >
            <Box sx={{ minWidth: { xs: 300, sm: 500, md: 700 } }}>
              <Bar data={data} options={options} />
            </Box>
          </Paper>

          {/* AVISO DE DADOS MOCKADOS OU REAIS */}
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
            {mock ? (
              <Typography variant="caption" color="warning.main">
                Dados exibidos são fictícios (mockados)
              </Typography>
            ) : (
              <Typography variant="caption" sx={{ color: '#fff' }}>
                Dados exibidos são reais do banco
              </Typography>
            )}
          </Box>

          {/* BOTÃO DE ATIVAR/DESATIVAR NOTIFICAÇÕES */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={notificacoesAtivas}
                  onChange={() => setNotificacoesAtivas(v => !v)}
                  color="primary"
                />
              }
              label={notificacoesAtivas ? 'Notificações ativadas' : 'Notificações desativadas'}
            />
          </Box>

          {/* ALERTA VISUAL */}
          <Snackbar open={!!alerta && notificacoesAtivas} autoHideDuration={6000} onClose={() => setAlerta(null)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
            {alerta && (
              <Alert onClose={() => setAlerta(null)} severity={alerta.tipo === 'cheio' ? 'warning' : 'info'} sx={{ width: '100%' }}>
                {alerta.mensagem}
              </Alert>
            )}
          </Snackbar>

          {/* PAINEL DE ALERTAS RECENTES */}
          <Paper elevation={1} sx={{ mt: 2, mb: 2, p: 2, background: '#fffbe6' }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Alertas Recentes
            </Typography>
            {alertasRecentes.length === 0 ? (
              <Typography variant="body2" color="text.secondary">Nenhum alerta recente.</Typography>
            ) : (
              <List dense>
                {alertasRecentes.map((a, idx) => (
                  <ListItem key={idx}>
                    <ListItemText primary={a.mensagem} secondary={a.data} />
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        </>
      )}
    </Container>
  );
}

export default App; 