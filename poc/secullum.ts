import fetch, { Response } from 'node-fetch';

const BASE_URL = 'https://pontowebapp.secullum.com.br';
const SEC_VERSION = '1.42.0';

export interface SecullumConfig {
  empresaId: number;
  usuario: string;
  senha: string;
}

export interface Batida {
  nome: string;
  valor: string;
  valorOriginal: string | null;
  ehRepP: boolean;
}

export interface DiaBatidas {
  id: number;
  data: string;
  funcionarioNome: string;
  batidas: Batida[];
}

export interface BatidasResponse {
  erros: string[];
  lista: DiaBatidas[];
}

export interface SecullumSession {
  authHeader: string;
  funcionarioId: number;
  horarioId: number;
  nome: string;
  nivelPermissao: number;
}

export async function login(config: SecullumConfig): Promise<SecullumSession> {
  const url = `${BASE_URL}/${config.empresaId}/Login`;

  const res: Response = await fetch(url, {
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
    [key: string]: unknown;
  };

  // Autenticação: Basic base64(usuario:senha:nivelPermissao)
  const raw = `${config.usuario}:${config.senha}:${data.nivelPermissao}`;
  const authHeader = `Basic ${Buffer.from(raw).toString('base64')}`;

  return {
    authHeader,
    funcionarioId: data.id,
    horarioId: data.horarioId,
    nome: data.nome,
    nivelPermissao: data.nivelPermissao,
  };
}

export async function fetchPunches(
  session: SecullumSession,
  empresaId: number,
  dataInicio: string,
  dataFim: string,
): Promise<DiaBatidas[]> {
  const url = `${BASE_URL}/${empresaId}/Batidas/${dataInicio}/${dataFim}`;

  const res: Response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: session.authHeader,
      'X-Sec-Centralfuncionarioversao': SEC_VERSION,
    },
  });

  if (!res.ok) {
    throw new Error(`Busca de batidas falhou: HTTP ${res.status}`);
  }

  const data = (await res.json()) as BatidasResponse;

  if (data.erros && data.erros.length > 0) {
    throw new Error(`Erros na resposta: ${data.erros.join(', ')}`);
  }

  return data.lista;
}

export function filterValidPunches(batidas: Batida[]): Batida[] {
  return batidas.filter(
    (b) => b.valorOriginal !== null && b.valor !== '' && b.valor !== 'FOLGA',
  );
}

export function calcularTrabalhado(batidas: Batida[]): number {
  const validas = filterValidPunches(batidas);
  let totalMinutos = 0;

  for (let i = 0; i + 1 < validas.length; i += 2) {
    const entrada = parseHHMM(validas[i].valor);
    const saida = parseHHMM(validas[i + 1].valor);
    if (entrada !== null && saida !== null) {
      totalMinutos += saida - entrada;
    }
  }

  return totalMinutos;
}

export function parseHHMM(value: string): number | null {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  const sinal = minutes < 0 ? '-' : '';
  return `${sinal}${h}h${m.toString().padStart(2, '0')}`;
}
