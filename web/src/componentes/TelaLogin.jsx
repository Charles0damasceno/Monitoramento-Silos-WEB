import { useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { api } from '../api';
import { Logos, OndasMarca } from './Marca';

export default function TelaLogin({ aoEntrar }) {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await api.login(usuario.trim(), senha);
      aoEntrar();
    } catch (err) {
      setErro(err.status === 429 || err.status === 401 ? err.message : 'Não foi possível conectar ao servidor.');
      setSenha('');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 2, position: 'relative', overflow: 'hidden' }}>
      <OndasMarca />
      <Paper
        component="form"
        onSubmit={enviar}
        sx={{
          position: 'relative',
          zIndex: 1,
          p: { xs: 3, sm: 5 },
          width: '100%',
          maxWidth: 440,
          borderRadius: 4,
          backdropFilter: 'blur(6px)',
          boxShadow: '0 20px 60px rgba(20, 40, 25, 0.18)',
        }}
      >
        <Stack spacing={3}>
          <Stack alignItems="center" spacing={2.5} sx={{ pt: 1 }}>
            <Logos altura={{ xs: 56, sm: 74 }} separador={false} />
            <Box textAlign="center">
              <Typography variant="h1" sx={{ fontSize: '1.35rem' }}>Painel de Silos</Typography>
              <Typography variant="body2" color="text.secondary">Acesso restrito</Typography>
            </Box>
          </Stack>
          {erro && <Alert severity="error">{erro}</Alert>}
          <TextField
            label="Usuário"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
            required
            fullWidth
          />
          <TextField
            label="Senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            required
            fullWidth
          />
          <Button type="submit" variant="contained" size="large" disabled={enviando || !usuario || !senha} sx={{ py: 1.4 }}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
