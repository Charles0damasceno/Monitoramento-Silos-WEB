import { useEffect, useRef, useState } from 'react';
import { api } from './api';

/**
 * Recebe as leituras do servidor por Server-Sent Events.
 * O navegador reconecta sozinho; aqui só acompanhamos se o servidor está alcançável
 * e se a sessão expirou (aí chamamos `aoDeslogar`).
 */
export function useAoVivo({ ativo, aoDeslogar }) {
  const [retrato, setRetrato] = useState(null);
  const [eventos, setEventos] = useState([]);
  const [servidorOnline, setServidorOnline] = useState(true);
  const deslogarRef = useRef(aoDeslogar);
  deslogarRef.current = aoDeslogar;

  useEffect(() => {
    if (!ativo) return undefined;
    let fechado = false;

    api.eventos(100).then((lista) => !fechado && setEventos(lista)).catch(() => {});

    const fonte = new EventSource('/api/fluxo');
    fonte.addEventListener('open', () => setServidorOnline(true));
    fonte.addEventListener('retrato', (e) => {
      setServidorOnline(true);
      setRetrato(JSON.parse(e.data));
    });
    fonte.addEventListener('evento', (e) => {
      const ev = JSON.parse(e.data);
      setEventos((lista) => [ev, ...lista.filter((x) => x.id !== ev.id)].slice(0, 200));
    });
    fonte.addEventListener('reconhecido', (e) => {
      const { id, por, em } = JSON.parse(e.data);
      setEventos((lista) => lista.map((x) => (x.id === id ? { ...x, reconhecido_por: por, reconhecido_em: em } : x)));
    });
    fonte.addEventListener('error', () => {
      setServidorOnline(false);
      // EventSource não expõe o status HTTP; conferimos se a sessão ainda vale.
      api.eu().catch((err) => {
        if (err.status === 401 && !fechado) {
          fonte.close();
          deslogarRef.current?.();
        }
      });
    });

    return () => {
      fechado = true;
      fonte.close();
    };
  }, [ativo]);

  return { retrato, eventos, setEventos, servidorOnline };
}

/** Relógio que atualiza a cada `ms`, para textos como "há 5 s". */
export function useAgora(ms = 1000) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return agora;
}
