import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, InputAdornment, MenuItem, Paper, Snackbar, Stack, Switch, Tab, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import SendIcon from '@mui/icons-material/Send';
import BackupIcon from '@mui/icons-material/Backup';
import { api } from '../api';
import { ALERTA } from '../tema';
import { fmtDataHora, haQuanto, litros, num } from '../formatar';

// ---------- Utilidades ----------

function useCarregar(fn) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const recarregar = useCallback(() => fn().then((d) => { setDados(d); setErro(null); }).catch((e) => setErro(e.message)), [fn]);
  useEffect(() => { recarregar(); }, [recarregar]);
  return { dados, erro, recarregar };
}

function Secao({ titulo, descricao, acao, children }) {
  return (
    <Paper sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={1.5} mb={2}>
        <Box>
          <Typography variant="h2" component="h2">{titulo}</Typography>
          {descricao && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 760 }}>{descricao}</Typography>}
        </Box>
        {acao}
      </Stack>
      {children}
    </Paper>
  );
}

function Carregando({ erro }) {
  if (erro) return <Alert severity="error">{erro}</Alert>;
  return <Stack alignItems="center" py={6}><CircularProgress /></Stack>;
}

function Confirmar({ aberto, titulo, texto, rotulo = 'Confirmar', perigo, aoConfirmar, aoFechar }) {
  return (
    <Dialog open={aberto} onClose={aoFechar} maxWidth="xs" fullWidth>
      <DialogTitle>{titulo}</DialogTitle>
      <DialogContent><Typography>{texto}</Typography></DialogContent>
      <DialogActions>
        <Button onClick={aoFechar}>Cancelar</Button>
        <Button variant="contained" color={perigo ? 'error' : 'primary'} onClick={aoConfirmar}>{rotulo}</Button>
      </DialogActions>
    </Dialog>
  );
}

const numero = (v) => (v === '' || v === null || v === undefined ? NaN : Number(String(v).replace(',', '.')));

// ---------- Silos ----------

const LIMITES_PADRAO = { muitoBaixo: 5, baixo: 10, alto: 90, muitoAlto: 95 };

function DialogoSilo({ silo, colunas, temperaturaTabela, aoSalvar, aoFechar }) {
  const [f, setF] = useState(() => ({
    nome: silo.nome ?? '',
    coluna: silo.coluna ?? '',
    capacidadeLitros: silo.capacidadeLitros ?? 100000,
    ...Object.fromEntries(Object.entries(silo.limites ?? LIMITES_PADRAO).map(([k, v]) => [k, v])),
    comTemperatura: Boolean(silo.temperatura),
    sensor: silo.temperatura?.sensor ?? silo.id,
    maxC: silo.temperatura?.maxC ?? 4,
  }));
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const campo = (k) => ({ value: f[k], onChange: (e) => setF((x) => ({ ...x, [k]: e.target.value })) });

  const salvar = async () => {
    const limites = { muitoBaixo: numero(f.muitoBaixo), baixo: numero(f.baixo), alto: numero(f.alto), muitoAlto: numero(f.muitoAlto) };
    const novo = {
      id: silo.id,
      nome: f.nome.trim(),
      coluna: f.coluna.trim(),
      capacidadeLitros: numero(f.capacidadeLitros),
      limites,
      ...(f.comTemperatura && {
        temperatura: { sensor: Math.trunc(numero(f.sensor)), maxC: String(f.maxC).trim() === '' ? null : numero(f.maxC) },
      }),
    };
    setSalvando(true);
    setErro(null);
    try {
      await aoSalvar(novo);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const pctProps = { type: 'number', slotProps: { input: { endAdornment: <InputAdornment position="end">%</InputAdornment> }, htmlInput: { min: 0, max: 100, step: 0.5 } } };

  return (
    <Dialog open onClose={aoFechar} maxWidth="sm" fullWidth>
      <DialogTitle>{silo.nome ? `Editar ${silo.nome}` : 'Novo silo'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {erro && <Alert severity="error">{erro}</Alert>}
          <TextField label="Nome exibido" required {...campo('nome')} placeholder="Ex.: Silo 4 - Pasteurizado" />
          <Autocomplete
            freeSolo
            options={colunas}
            value={f.coluna}
            onInputChange={(_, v) => setF((x) => ({ ...x, coluna: v }))}
            renderInput={(p) => (
              <TextField {...p} label="Coluna no banco da IHM" required helperText="Nome da coluna da tabela onde a IHM grava o nível deste silo, em litros." />
            )}
          />
          <TextField
            label="Capacidade" type="number" required {...campo('capacidadeLitros')}
            slotProps={{ input: { endAdornment: <InputAdornment position="end">litros</InputAdornment> }, htmlInput: { min: 1, step: 1000 } }}
          />
          <Box>
            <Typography variant="overline" color="text.secondary">Limites de alarme</Typography>
            <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
              <Grid size={{ xs: 6, sm: 3 }}><TextField fullWidth label="Muito baixo" {...campo('muitoBaixo')} {...pctProps} /></Grid>
              <Grid size={{ xs: 6, sm: 3 }}><TextField fullWidth label="Baixo" {...campo('baixo')} {...pctProps} /></Grid>
              <Grid size={{ xs: 6, sm: 3 }}><TextField fullWidth label="Alto" {...campo('alto')} {...pctProps} /></Grid>
              <Grid size={{ xs: 6, sm: 3 }}><TextField fullWidth label="Muito alto" {...campo('muitoAlto')} {...pctProps} /></Grid>
            </Grid>
            <Typography variant="caption" color="text.secondary">Muito baixo ≤ Baixo &lt; Alto ≤ Muito alto. Muito baixo/alto geram alarme crítico.</Typography>
          </Box>
          <Box>
            <FormControlLabel
              control={<Switch checked={f.comTemperatura} onChange={(e) => setF((x) => ({ ...x, comTemperatura: e.target.checked }))} />}
              label="Monitorar temperatura"
            />
            {f.comTemperatura && (
              <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
                <Grid size={{ xs: 6 }}>
                  <TextField fullWidth label="Nº do sensor" type="number" {...campo('sensor')} helperText={`Valor da coluna "Silo" em ${temperaturaTabela ?? 'temperatura_silo'}`} />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    fullWidth label="Alarme acima de" type="number" {...campo('maxC')} helperText="Vazio = sem alarme"
                    slotProps={{ input: { endAdornment: <InputAdornment position="end">°C</InputAdornment> }, htmlInput: { step: 0.1 } }}
                  />
                </Grid>
              </Grid>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={aoFechar}>Cancelar</Button>
        <Button variant="contained" onClick={salvar} disabled={salvando || !f.nome.trim() || !f.coluna.trim()}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SecaoSilos({ avisar }) {
  const { dados, erro, recarregar } = useCarregar(api.admin.silos);
  const [editando, setEditando] = useState(null);
  const [removendo, setRemovendo] = useState(null);

  if (!dados) return <Carregando erro={erro} />;
  const { silos, colunasDisponiveis, idsComHistorico, temperaturaTabela } = dados;
  const proximoId = Math.max(0, ...silos.map((s) => s.id), ...idsComHistorico) + 1;
  const colunasLivres = colunasDisponiveis.filter((c) => !silos.some((s) => s.coluna.toLowerCase() === c.toLowerCase()));

  const salvarLista = async (lista, mensagem) => {
    await api.admin.salvarSilos(lista);
    await recarregar();
    avisar(mensagem);
  };

  return (
    <Secao
      titulo="Silos"
      descricao="As mudanças valem na hora para todas as telas, sem reiniciar o serviço. A versão anterior do cadastro fica guardada em config/silos.anterior.json."
      acao={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditando({ id: proximoId })}>Adicionar silo</Button>}
    >
      {colunasLivres.length > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Colunas no banco ainda sem silo: <b>{colunasLivres.join(', ')}</b>
        </Alert>
      )}
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Silo</TableCell>
              <TableCell>Coluna</TableCell>
              <TableCell align="right">Capacidade</TableCell>
              <TableCell align="center">Limites (MB · B · A · MA)</TableCell>
              <TableCell align="center">Temperatura</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {silos.map((s) => (
              <TableRow key={s.id} hover>
                <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{s.nome}</TableCell>
                <TableCell><Box component="code" sx={{ fontSize: '0.85em' }}>{s.coluna}</Box></TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{litros(s.capacidadeLitros)}</TableCell>
                <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                  {s.limites.muitoBaixo} · {s.limites.baixo} · {s.limites.alto} · {s.limites.muitoAlto} %
                </TableCell>
                <TableCell align="center">
                  {s.temperatura
                    ? <Chip size="small" label={s.temperatura.maxC === null ? `sensor ${s.temperatura.sensor}` : `≤ ${num(s.temperatura.maxC)} °C`} />
                    : <Typography variant="body2" color="text.disabled">—</Typography>}
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Tooltip title="Editar"><IconButton onClick={() => setEditando(s)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title={silos.length === 1 ? 'Precisa existir pelo menos um silo' : 'Remover'}>
                    <span>
                      <IconButton onClick={() => setRemovendo(s)} disabled={silos.length === 1}><DeleteIcon fontSize="small" /></IconButton>
                    </span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {editando && (
        <DialogoSilo
          silo={editando}
          colunas={colunasDisponiveis}
          temperaturaTabela={temperaturaTabela}
          aoFechar={() => setEditando(null)}
          aoSalvar={async (novo) => {
            const existe = silos.some((s) => s.id === novo.id);
            const lista = existe ? silos.map((s) => (s.id === novo.id ? novo : s)) : [...silos, novo];
            await salvarLista(lista, existe ? `${novo.nome} atualizado.` : `${novo.nome} adicionado.`);
            setEditando(null);
          }}
        />
      )}
      <Confirmar
        aberto={Boolean(removendo)}
        titulo={`Remover ${removendo?.nome}?`}
        texto="O silo sai de todas as telas. O histórico já gravado continua guardado e aparece nos relatórios antigos."
        rotulo="Remover"
        perigo
        aoFechar={() => setRemovendo(null)}
        aoConfirmar={async () => {
          const alvo = removendo;
          setRemovendo(null);
          try {
            await salvarLista(silos.filter((s) => s.id !== alvo.id), `${alvo.nome} removido.`);
          } catch (e) {
            avisar(e.message, 'error');
          }
        }}
      />
    </Secao>
  );
}

// ---------- Usuários ----------

function DialogoUsuario({ usuario, aoSalvar, aoFechar }) {
  const novo = !usuario;
  const [f, setF] = useState({ usuario: '', nome: usuario?.nome ?? '', papel: usuario?.papel ?? 'operador', senha: '', confirmar: '' });
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const campo = (k) => ({ value: f[k], onChange: (e) => setF((x) => ({ ...x, [k]: e.target.value })) });
  const senhaDiferente = f.senha && f.confirmar && f.senha !== f.confirmar;

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      await aoSalvar({ usuario: f.usuario.trim().toLowerCase(), nome: f.nome.trim(), papel: f.papel, senha: f.senha || undefined });
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onClose={aoFechar} maxWidth="xs" fullWidth>
      <DialogTitle>{novo ? 'Novo usuário' : `Editar ${usuario.usuario}`}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {erro && <Alert severity="error">{erro}</Alert>}
          {novo && (
            <TextField label="Usuário (login)" required {...campo('usuario')} autoComplete="off"
              helperText="3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou _" />
          )}
          <TextField label="Nome" {...campo('nome')} placeholder="Ex.: Maria Souza" />
          <TextField select label="Papel" {...campo('papel')}
            helperText={f.papel === 'admin' ? 'Vê tudo e acessa as Configurações.' : 'Vê o painel, relatórios e reconhece alarmes.'}>
            <MenuItem value="operador">Operador</MenuItem>
            <MenuItem value="admin">Administrador</MenuItem>
          </TextField>
          <TextField
            label={novo ? 'Senha' : 'Nova senha (deixe vazio para manter)'} type="password" required={novo} {...campo('senha')}
            autoComplete="new-password" helperText="Mínimo de 8 caracteres. Trocar a senha desconecta o usuário em todos os aparelhos."
          />
          {f.senha && (
            <TextField label="Repita a senha" type="password" {...campo('confirmar')} autoComplete="new-password"
              error={Boolean(senhaDiferente)} helperText={senhaDiferente ? 'As senhas não conferem' : ' '} />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={aoFechar}>Cancelar</Button>
        <Button
          variant="contained"
          onClick={salvar}
          disabled={salvando || (novo && (!f.usuario || !f.senha)) || (f.senha && f.senha !== f.confirmar)}
        >
          {salvando ? 'Salvando…' : 'Salvar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SecaoUsuarios({ eu, avisar }) {
  const { dados, erro, recarregar } = useCarregar(api.admin.usuarios);
  const [editando, setEditando] = useState(undefined); // undefined = fechado, null = novo
  const [removendo, setRemovendo] = useState(null);
  if (!dados) return <Carregando erro={erro} />;

  return (
    <Secao
      titulo="Usuários"
      descricao="Administradores acessam esta tela; operadores veem o painel, os relatórios e reconhecem alarmes."
      acao={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditando(null)}>Novo usuário</Button>}
    >
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Usuário</TableCell>
              <TableCell>Nome</TableCell>
              <TableCell>Papel</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {dados.map((u) => (
              <TableRow key={u.usuario} hover>
                <TableCell sx={{ fontWeight: 600 }}>
                  {u.usuario}
                  {u.usuario === eu.usuario && <Chip size="small" label="você" sx={{ ml: 1 }} />}
                </TableCell>
                <TableCell>{u.nome}</TableCell>
                <TableCell>
                  <Chip size="small" label={u.papel === 'admin' ? 'Administrador' : 'Operador'} color={u.papel === 'admin' ? 'secondary' : 'default'} variant={u.papel === 'admin' ? 'filled' : 'outlined'} />
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Tooltip title="Editar / trocar senha"><IconButton onClick={() => setEditando(u)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title={u.usuario === eu.usuario ? 'Você não pode remover a si mesmo' : 'Remover'}>
                    <span><IconButton onClick={() => setRemovendo(u)} disabled={u.usuario === eu.usuario}><DeleteIcon fontSize="small" /></IconButton></span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {editando !== undefined && (
        <DialogoUsuario
          usuario={editando}
          aoFechar={() => setEditando(undefined)}
          aoSalvar={async ({ usuario, nome, papel, senha }) => {
            if (editando === null) await api.admin.criarUsuario({ usuario, nome, papel, senha });
            else await api.admin.alterarUsuario(editando.usuario, { nome, papel, senha });
            await recarregar();
            setEditando(undefined);
            avisar(editando === null ? `Usuário ${usuario} criado.` : `Usuário ${editando.usuario} atualizado.`);
          }}
        />
      )}
      <Confirmar
        aberto={Boolean(removendo)}
        titulo={`Remover ${removendo?.usuario}?`}
        texto="O usuário perde o acesso imediatamente, inclusive nos aparelhos onde estiver logado."
        rotulo="Remover"
        perigo
        aoFechar={() => setRemovendo(null)}
        aoConfirmar={async () => {
          const alvo = removendo;
          setRemovendo(null);
          try {
            await api.admin.removerUsuario(alvo.usuario);
            await recarregar();
            avisar(`Usuário ${alvo.usuario} removido.`);
          } catch (e) {
            avisar(e.message, 'error');
          }
        }}
      />
    </Secao>
  );
}

// ---------- Alertas e Sistema ----------

function Item({ rotulo, children }) {
  return (
    <Box sx={{ py: 1, borderBottom: 1, borderColor: 'divider' }}>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4 }}>{rotulo}</Typography>
      <Typography component="div" sx={{ fontWeight: 600 }}>{children}</Typography>
    </Box>
  );
}

const STATUS_TELEGRAM = {
  ok: ['Funcionando', ALERTA.ok], aguardando: ['Ativo (nenhum envio ainda)', ALERTA.ok],
  falha: ['Com falha', ALERTA.critico], desligado: ['Desligado', ALERTA.offline],
};

function SecaoAlertas({ avisar }) {
  const { dados, erro, recarregar } = useCarregar(api.admin.sistema);
  const [enviando, setEnviando] = useState(false);
  if (!dados) return <Carregando erro={erro} />;
  const n = dados.notificacoes;
  const [rotulo, cor] = STATUS_TELEGRAM[n.status] ?? STATUS_TELEGRAM.desligado;

  const testar = async () => {
    setEnviando(true);
    try {
      await api.admin.testarTelegram();
      avisar('Mensagem de teste enviada. Confira o grupo no Telegram.');
    } catch (e) {
      avisar(e.message, 'error');
    } finally {
      setEnviando(false);
      recarregar();
    }
  };

  return (
    <Secao
      titulo="Alertas no celular (Telegram)"
      descricao="Alarmes críticos e falta de comunicação chegam num grupo do Telegram, com botão para reconhecer."
      acao={<Button variant="contained" startIcon={<SendIcon />} onClick={testar} disabled={enviando || n.status === 'desligado'}>Enviar teste</Button>}
    >
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Item rotulo="Situação">
            <Box component="span" sx={{ color: cor }}>● </Box>{rotulo}
            {n.erro && <Typography variant="body2" color="error">{n.erro}</Typography>}
          </Item>
          <Item rotulo="Último envio com sucesso">{n.ultimoEnvioOk ? `${fmtDataHora(n.ultimoEnvioOk)} (${haQuanto(n.ultimoEnvioOk)})` : '—'}</Item>
          <Item rotulo="Mensagens aguardando envio">{n.naFila ?? 0}</Item>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Item rotulo="O que é enviado">{dados.notificacoesConfig.severidadeMinima === 'critico' ? 'Só alarmes críticos e falta de comunicação' : 'Alarmes críticos e de atenção'}</Item>
          <Item rotulo="Lembrete enquanto ninguém reconhece">{dados.notificacoesConfig.repetirMs ? `a cada ${dados.notificacoesConfig.repetirMs / 60000} min` : 'desligado'}</Item>
        </Grid>
      </Grid>
      {n.status === 'desligado' && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Para ligar: crie um bot com o <b>@BotFather</b>, coloque o token em <code>TELEGRAM_TOKEN</code> no arquivo <code>.env</code>,
          descubra o número do grupo com <code>npm run telegram -- descobrir</code> e reinicie o serviço. O passo a passo está no README.
        </Alert>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        Token, grupo e regras de envio ficam no arquivo .env do servidor (por segurança, o token não é editável pelo navegador).
      </Typography>
    </Secao>
  );
}

function SecaoSistema({ avisar }) {
  const { dados, erro, recarregar } = useCarregar(api.admin.sistema);
  const [fazendo, setFazendo] = useState(false);
  if (!dados) return <Carregando erro={erro} />;
  const b = dados.backup.ultimo;

  const fazerBackup = async () => {
    setFazendo(true);
    try {
      const r = await api.admin.backup();
      avisar(`Backup gravado em ${r.arquivo}`);
    } catch (e) {
      avisar(e.message, 'error');
    } finally {
      setFazendo(false);
      recarregar();
    }
  };

  return (
    <Stack spacing={2}>
      <Secao titulo="Sistema">
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Item rotulo="Versão">{dados.versao} <Typography component="span" variant="body2" color="text.secondary">(Node {dados.node})</Typography></Item>
            <Item rotulo="Em execução desde">{fmtDataHora(dados.iniciadoEm)} ({haQuanto(dados.iniciadoEm)})</Item>
            <Item rotulo="Origem dos dados">
              {dados.fonte.descricao}
              {dados.fonte.simulada && <Chip size="small" color="warning" label="SIMULAÇÃO" sx={{ ml: 1 }} />}
            </Item>
            <Item rotulo="Comunicação com a IHM">{dados.fonte.comunicacao === 'ok' ? 'OK' : 'Com falha'}</Item>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Item rotulo="Leitura / gravação do histórico">a cada {dados.leituraS} s / a cada {dados.historicoS} s</Item>
            <Item rotulo="Histórico guardado por">{dados.retencaoDias} dias</Item>
            <Item rotulo="Login">{dados.loginObrigatorio ? `obrigatório (sessão de ${dados.sessaoDias} dias)` : 'livre — qualquer um na rede acessa'}</Item>
            <Item rotulo="Turnos">{dados.turnos.join(' · ')}</Item>
          </Grid>
        </Grid>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          Esses parâmetros ficam no arquivo .env do servidor; depois de alterar, reinicie o serviço.
        </Typography>
      </Secao>

      <Secao
        titulo="Backup"
        descricao={`Cópia automática diária às ${String(Math.floor(dados.backup.hora / 60)).padStart(2, '0')}:${String(dados.backup.hora % 60).padStart(2, '0')}, mantendo ${dados.backup.manterDias} dias.`}
        acao={<Button variant="outlined" startIcon={<BackupIcon />} onClick={fazerBackup} disabled={fazendo}>{fazendo ? 'Copiando…' : 'Fazer backup agora'}</Button>}
      >
        <Item rotulo="Pasta de destino"><Box component="code" sx={{ fontSize: '0.85em', wordBreak: 'break-all' }}>{dados.backup.destino}</Box></Item>
        <Item rotulo="Último backup">
          {!b && 'nenhum nesta execução'}
          {b?.arquivo && `${fmtDataHora(b.ts)} (${haQuanto(b.ts)})`}
          {b?.erro && <Box component="span" sx={{ color: ALERTA.critico }}>falhou em {fmtDataHora(b.ts)}: {b.erro}</Box>}
        </Item>
      </Secao>
    </Stack>
  );
}

// ---------- Auditoria ----------

const ACOES = {
  login: 'Entrou', login_recusado: 'Senha incorreta', silos_alterados: 'Alterou silos', usuario_criado: 'Criou usuário',
  usuario_alterado: 'Alterou usuário', usuario_removido: 'Removeu usuário', telegram_teste: 'Testou Telegram',
  backup_manual: 'Backup manual', alarme_reconhecido: 'Reconheceu alarme',
};

function SecaoAuditoria() {
  const { dados, erro } = useCarregar(api.admin.auditoria);
  if (!dados) return <Carregando erro={erro} />;
  return (
    <Secao titulo="Auditoria" descricao="Quem fez o quê: acessos, alterações de configuração e de usuários, reconhecimento de alarmes. Últimos 300 registros.">
      <TableContainer sx={{ maxHeight: '65vh' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Data/hora</TableCell>
              <TableCell>Usuário</TableCell>
              <TableCell>Ação</TableCell>
              <TableCell>Detalhe</TableCell>
              <TableCell>Origem (IP)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {dados.length === 0 && (
              <TableRow><TableCell colSpan={5}><Typography color="text.secondary" variant="body2">Nada registrado ainda.</Typography></TableCell></TableRow>
            )}
            {dados.map((a) => (
              <TableRow key={a.id} hover>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDataHora(a.ts)}</TableCell>
                <TableCell>{a.usuario ?? '—'}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap', color: a.acao === 'login_recusado' ? ALERTA.atencao : undefined, fontWeight: 600 }}>
                  {ACOES[a.acao] ?? a.acao}
                </TableCell>
                <TableCell sx={{ maxWidth: 520 }}>{a.detalhe}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{a.ip}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Secao>
  );
}

// ---------- Página ----------

const SECOES = [['silos', 'Silos'], ['usuarios', 'Usuários'], ['alertas', 'Alertas'], ['sistema', 'Sistema'], ['auditoria', 'Auditoria']];

export default function PaginaConfiguracoes({ usuario }) {
  const [secao, setSecao] = useState('silos');
  const [aviso, setAviso] = useState(null);
  const avisar = (texto, severidade = 'success') => setAviso({ texto, severidade });

  if (usuario.papel !== 'admin') return <Alert severity="warning">Somente administradores acessam as configurações.</Alert>;

  return (
    <Stack spacing={2}>
      <Tabs
        value={secao}
        onChange={(_, v) => setSecao(v)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        textColor="secondary"
        indicatorColor="secondary"
      >
        {SECOES.map(([v, r]) => <Tab key={v} value={v} label={r} />)}
      </Tabs>
      {secao === 'silos' && <SecaoSilos avisar={avisar} />}
      {secao === 'usuarios' && <SecaoUsuarios eu={usuario} avisar={avisar} />}
      {secao === 'alertas' && <SecaoAlertas avisar={avisar} />}
      {secao === 'sistema' && <SecaoSistema avisar={avisar} />}
      {secao === 'auditoria' && <SecaoAuditoria />}
      <Snackbar open={Boolean(aviso)} autoHideDuration={5000} onClose={() => setAviso(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {aviso ? <Alert severity={aviso.severidade} variant="filled" onClose={() => setAviso(null)}>{aviso.texto}</Alert> : <span />}
      </Snackbar>
    </Stack>
  );
}
