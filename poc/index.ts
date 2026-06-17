import { readFileSync } from 'fs';
import { join } from 'path';
import {
  login,
  fetchPunches,
  filterValidPunches,
  calcularTrabalhado,
  formatMinutes,
  parseHHMM,
} from './secullum.js';

interface Settings {
  empresaId: number;
  login: string;
  senha: string;
  dailyHours: number;
  warningMinutes: number;
  syncIntervalMinutes: number;
}

const settingsPath = join(process.cwd(), 'config', 'settings.json');
const settings: Settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));

const dailyMinutes = settings.dailyHours * 60;

function today(): string {
  return new Date().toISOString().split('T')[0];
}

async function main() {
  console.log('Conectando ao Secullum...');

  const session = await login({
    empresaId: settings.empresaId,
    usuario: settings.login,
    senha: settings.senha,
  });

  console.log(`Logado como: ${session.nome}`);

  const dataHoje = today();
  const lista = await fetchPunches(session, settings.empresaId, dataHoje, dataHoje);

  if (lista.length === 0) {
    console.log('Nenhum registro encontrado para hoje.');
    return;
  }

  const diaHoje = lista[0];
  const validas = filterValidPunches(diaHoje.batidas);

  if (validas.length === 0) {
    console.log('Nenhuma batida registrada hoje.');
    return;
  }

  const ultimaBatida = validas[validas.length - 1];
  const trabalhadoMin = calcularTrabalhado(diaHoje.batidas);
  const restanteMin = dailyMinutes - trabalhadoMin;

  console.log('');
  console.log('=== Ponto Guardian - Resumo de hoje ===');
  console.log(`Última batida:   ${ultimaBatida.valor} (${ultimaBatida.nome})`);
  console.log(`Trabalhado:      ${formatMinutes(trabalhadoMin)}`);

  if (validas.length % 2 !== 0) {
    console.log('Status:          Dentro do trabalho (expediente aberto)');

    const entradaAtual = parseHHMM(validas[validas.length - 1].valor);
    if (entradaAtual !== null) {
      const agora = new Date();
      const agoraMin = agora.getHours() * 60 + agora.getMinutes();
      const trabalhadoComAgora = trabalhadoMin + (agoraMin - entradaAtual);
      const restanteComAgora = dailyMinutes - trabalhadoComAgora;

      const saidaPrevista = agoraMin + restanteComAgora;
      const saidaH = Math.floor(Math.max(0, saidaPrevista) / 60);
      const saidaM = Math.max(0, saidaPrevista) % 60;

      console.log(`Trabalhado (est): ${formatMinutes(trabalhadoComAgora)}`);
      console.log(`Restante (est):   ${formatMinutes(restanteComAgora)}`);
      console.log(`Saída prevista:   ${saidaH.toString().padStart(2, '0')}:${saidaM.toString().padStart(2, '0')}`);
    }
  } else {
    console.log(`Restante:        ${restanteMin > 0 ? formatMinutes(restanteMin) : '0h00 (jornada concluída)'}`);
    if (restanteMin < 0) {
      console.log(`Hora extra:      ${formatMinutes(Math.abs(restanteMin))}`);
    }
  }

  console.log('');
  console.log('Batidas de hoje:');
  validas.forEach((b) => console.log(`  ${b.nome.padEnd(12)} ${b.valor}`));
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
