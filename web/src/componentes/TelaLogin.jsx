import { useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { api } from '../api';

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
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Paper component="form" onSubmit={enviar} sx={{ p: { xs: 3, sm: 4 }, width: '100%', maxWidth: 380 }}>
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box component="img" src="/favicon.svg" alt="" sx={{ width: 40, height: 40 }} />
            <Box>
              <Typography variant="h1">Painel de Silos</Typography>
              <Typography variant="body2" color="text.secondary">Acesso restrito</Typography>
            </Box>
          </Stack>
          {erro && <Alert severity="error">{erro}</Alert>}
          <TextField
            label="Usuário"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoComplete="username"
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
          <Button type="submit" variant="contained" size="large" disabled={enviando || !usuario || !senha}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
