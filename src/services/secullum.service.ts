import fetch from 'node-fetch';
import { Punch } from '../models/punch.model.js';

const BASE_URL = 'https://pontowebapp.secullum.com.br';
const SEC_VERSION = '1.42.0';

export interface SecullumConfig {
  empresaId: number;
  usuario: string;
  senha: string;
}

export interface SecullumSession {
  authHeader: string;
  funcionarioId: number;
  horarioId: number;
  nome: string;
  nivelPermissao: number;
  empresaId: number;
}

interface SecullumBatida {
  nome: string;
  valor: string;
  valorOriginal: string | null;
  ehRepP: boolean;
}

interface SecullumDia {
  id: number;
  data: string;
  batidas: SecullumBatida[];
}

interface SecullumBatidasResponse {
  erros: string[];
  lista: SecullumDia[];
}

export interface ClockInMetadata {
  horaServidor: string;
  exigirCapturaFotoPonto: boolean;
  reconhecerFace: boolean;
  somentePerimetrosAutorizados: boolean;
  qualidadeVidaTrabalho?: {
    habilitado: boolean;
  };
}

export interface ClockInPayload {
  justificativa: null;
  latitude: number;
  longitude: number;
  precisao: number;
  endereco: string;
  foraDoPerimetro: boolean;
  foto: null;
  fusoFoiModificado: boolean;
  horaFoiModificada: boolean;
  identificacaoDispositivo: string;
  marcacaoOffline: boolean;
  utilizaLocalizacaoFicticia: boolean;
  viaCentralWeb: boolean;
  atividadeId: null;
}

export interface ClockInResult {
  dryRun: boolean;
  payload: ClockInPayload;
}

export async function login(config: SecullumConfig): Promise<SecullumSession> {
  const res = await fetch(`${BASE_URL}/${config.empresaId}/Login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: config.usuario, senha: config.senha }),
  });

  if (!res.ok) {
    throw new Error(`Login falhou: HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    id: number;
    horarioId: number;
    nome: string;
    nivelPermissao: number;
  };

  const raw = `${config.usuario}:${config.senha}:${data.nivelPermissao}`;
  const authHeader = `Basic ${Buffer.from(raw).toString('base64')}`;

  return {
    authHeader,
    funcionarioId: data.id,
    horarioId: data.horarioId,
    nome: data.nome,
    nivelPermissao: data.nivelPermissao,
    empresaId: config.empresaId,
  };
}

export async function getClockInMetadata(session: SecullumSession): Promise<ClockInMetadata> {
  const res = await fetch(`${BASE_URL}/${session.empresaId}/IncluirPonto`, {
    headers: {
      Authorization: session.authHeader,
      'X-Sec-Centralfuncionarioversao': SEC_VERSION,
    },
  });

  if (!res.ok) {
    throw new Error(`Busca de metadados do ponto falhou: HTTP ${res.status}`);
  }

  return (await res.json()) as ClockInMetadata;
}

export async function createClockIn(
  session: SecullumSession,
  payload: ClockInPayload,
  options: { dryRun: boolean } = { dryRun: true },
): Promise<ClockInResult> {
  if (options.dryRun) {
    console.log('[clock-in] Dry run ativo. POST real não foi enviado.', payload);
    return { dryRun: true, payload };
  }

  const res = await fetch(
    `${BASE_URL}/${session.empresaId}/IncluirPonto?funcionarioId=${session.funcionarioId}`,
    {
      method: 'POST',
      headers: {
        Authorization: session.authHeader,
        'Content-Type': 'application/json',
        'X-Sec-Centralfuncionarioversao': SEC_VERSION,
      },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    throw new Error(`Batida de ponto falhou: HTTP ${res.status}`);
  }

  return { dryRun: false, payload };
}

export async function fetchPunchesForDate(
  session: SecullumSession,
  date: string,
): Promise<Punch[]> {
  const res = await fetch(
    `${BASE_URL}/${session.empresaId}/Batidas/${date}/${date}`,
    {
      headers: {
        Authorization: session.authHeader,
        'X-Sec-Centralfuncionarioversao': SEC_VERSION,
      },
    },
  );

  if (!res.ok) {
    throw new Error(`Busca de batidas falhou: HTTP ${res.status}`);
  }

  const data = (await res.json()) as SecullumBatidasResponse;

  if (data.erros?.length > 0) {
    throw new Error(`Erros na resposta: ${data.erros.join(', ')}`);
  }

  const syncedAt = new Date().toISOString();
  const punches: Punch[] = [];

  for (const dia of data.lista) {
    const dateStr = dia.data.split('T')[0];
    for (const batida of dia.batidas) {
      if (!batida.valorOriginal || !batida.valor || batida.valor === 'FOLGA') {
        continue;
      }
      const isEntry = batida.nome.toLowerCase().startsWith('entrada');
      punches.push({
        date: dateStr,
        time: batida.valor,
        name: batida.nome,
        type: isEntry ? 'ENTRY' : 'EXIT',
        syncedAt,
      });
    }
  }

  return punches;
}
