import { mkdirSync } from 'fs';
import { join } from 'path';
import { login } from './services/secullum.service.js';
import { SyncService } from './services/sync.service.js';
import { getPunchesForDate } from './db/database.js';
import { buildSummary, formatMinutes } from './services/workday.service.js';
import { getSettings, getDailyMinutes } from './config/settings.js';
import { Punch } from './models/punch.model.js';

mkdirSync(join(process.cwd(), 'data'), { recursive: true });

function printSummary(): void {
  const date = new Date().toISOString().split('T')[0];
  const punches = getPunchesForDate(date);
  const summary = buildSummary(date, punches, getDailyMinutes());

  console.clear();
  console.log('=== Ponto Guardian ===');
  console.log(`Data: ${date}`);
  console.log('');

  if (punches.length === 0) {
    console.log('Nenhuma batida registrada hoje.');
  } else {
    console.log(`Trabalhado:   ${formatMinutes(summary.workedMinutes)}`);
    console.log(`Restante:     ${formatMinutes(Math.max(0, summary.remainingMinutes))}`);
    if (summary.expectedExitTime) {
      console.log(`Saída prev.:  ${summary.expectedExitTime}`);
    }
    if (summary.isComplete) {
      console.log('Status:       Jornada concluída!');
    } else if (summary.isOpen) {
      console.log('Status:       Expediente aberto');
    } else {
      console.log('Status:       Aguardando próxima entrada');
    }
    console.log('');
    console.log('Batidas:');
    summary.punches.forEach((p) => {
      console.log(`  ${p.name.padEnd(12)} ${p.time}`);
    });
  }

  console.log('');
  console.log(`Última sync: ${new Date().toLocaleTimeString('pt-BR')}`);
  console.log('Ctrl+C para sair');
}

function checkNotifications(newPunches: Punch[]): void {
  const settings = getSettings();
  const date = new Date().toISOString().split('T')[0];
  const allPunches = getPunchesForDate(date);
  const summary = buildSummary(date, allPunches, getDailyMinutes());

  if (newPunches.length > 0) {
    console.log(`\n[notif] Nova(s) batida(s): ${newPunches.map((p) => `${p.name} ${p.time}`).join(', ')}`);
  }

  const remaining = summary.remainingMinutes;

  if (remaining <= 0) {
    const overtime = Math.abs(remaining);
    if (overtime % 5 === 0) {
      console.log(`\n[aviso] Você está em hora extra há ${formatMinutes(overtime)}!`);
    }
  } else if (remaining <= 5) {
    console.log('\n[aviso] Prepare-se para bater o ponto. Faltam menos de 5 minutos!');
  } else if (remaining <= settings.warningMinutes) {
    console.log(`\n[aviso] Faltam ${formatMinutes(remaining)} para completar sua jornada.`);
  }
}

async function main() {
  const settings = getSettings();

  console.log('Conectando ao Secullum...');
  const session = await login({
    empresaId: settings.empresaId,
    usuario: settings.login,
    senha: settings.senha,
  });
  console.log(`Logado como: ${session.nome}`);

  const sync = new SyncService(session, settings.syncIntervalMinutes);

  sync.onNewPunch(checkNotifications);

  console.log('Sincronizando...');
  await sync.syncNow();

  printSummary();

  sync.start();

  setInterval(() => {
    printSummary();
  }, 30_000);

  process.on('SIGINT', () => {
    sync.stop();
    console.log('\nEncerrando Ponto Guardian.');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
