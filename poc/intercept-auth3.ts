import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { join } from 'path';

interface Settings {
  empresaId: number;
  login: string;
  senha: string;
}

const settings: Settings = JSON.parse(
  readFileSync(join(process.cwd(), 'config', 'settings.json'), 'utf-8'),
);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const hoje = new Date().toISOString().split('T')[0];

  console.log('Interceptando todos os requests...');
  page.on('request', (req) => {
    if (req.url().includes('secullum')) {
      const headers = req.headers();
      const relevantes = Object.entries(headers).filter(([k]) =>
        !['user-agent', 'accept-encoding', 'accept-language', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'upgrade-insecure-requests', 'pragma', 'cache-control'].includes(k.toLowerCase()),
      );
      if (relevantes.length > 0) {
        console.log(`\nREQ ${req.method()} ${req.url().replace('https://pontowebapp.secullum.com.br', '')}`);
        relevantes.forEach(([k, v]) => console.log(`  ${k}: ${v.substring(0, 80)}`));
      }
    }
  });

  page.on('response', async (res) => {
    if (res.url().includes('/Batidas/')) {
      console.log(`\nRES ${res.status()} ${res.url().replace('https://pontowebapp.secullum.com.br', '')}`);
      if (res.status() === 200) {
        const body = await res.text();
        console.log('BODY (200):', body.substring(0, 200));
      }
    }
  });

  console.log('1. Abrindo página principal...');
  await page.goto(`https://pontowebapp.secullum.com.br/${settings.empresaId}/Login`);
  await page.waitForLoadState('networkidle');

  console.log('\n2. Executando login via JS na página...');
  const loginResult = await page.evaluate(
    async ({ empresaId, usuario, senha }) => {
      const res = await fetch(`/${empresaId}/Login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, senha }),
      });
      return { status: res.status, ok: res.ok };
    },
    { empresaId: settings.empresaId, usuario: settings.login, senha: settings.senha },
  );
  console.log('Login result:', loginResult);

  console.log('\n3. Verificando cookies após login...');
  const cookies = await context.cookies();
  console.log('Cookies:', cookies.map((c) => `${c.name}=${c.value.substring(0, 20)}`));

  console.log('\n4. Buscando batidas via fetch na página (mesmo origem)...');
  const batidasResult = await page.evaluate(
    async ({ empresaId, data }) => {
      const res = await fetch(`/${empresaId}/Batidas/${data}/${data}`, {
        headers: { 'Accept': 'application/json' },
      });
      const text = await res.text();
      return { status: res.status, body: text.substring(0, 300) };
    },
    { empresaId: settings.empresaId, data: hoje },
  );
  console.log('\nBatidas result:', batidasResult);

  await browser.close();
}

main().catch(console.error);
