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
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const hoje = new Date().toISOString().split('T')[0];

  page.on('request', (req) => {
    if (req.url().includes('/Batidas/')) {
      console.log('\n=== REQUEST /Batidas INTERCEPTADO ===');
      console.log('URL:', req.url());
      const headers = req.headers();
      Object.entries(headers).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
    }
  });

  console.log('Navegando para o Secullum (browser visível)...');
  await page.goto(`https://pontowebapp.secullum.com.br/${settings.empresaId}/Login`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  console.log('Injetando login...');
  const loginResult = await page.evaluate(
    async ({ empresaId, usuario, senha }) => {
      const res = await (window as Window & typeof globalThis & { fetch: typeof fetch }).fetch(`/${empresaId}/Login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, senha }),
      });
      const data = await res.json();
      (window as Window & typeof globalThis & { __loginData?: unknown }).__loginData = data;
      return { status: res.status, id: data.id, nome: data.nome };
    },
    { empresaId: settings.empresaId, usuario: settings.login, senha: settings.senha },
  );
  console.log('Login:', loginResult);

  await page.waitForTimeout(1000);

  console.log('\nLocalStorage após login:');
  const ls = await page.evaluate(() => {
    const items: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      items[k] = localStorage.getItem(k)!.substring(0, 100);
    }
    return items;
  });
  console.log(JSON.stringify(ls, null, 2));

  console.log('\nSessionStorage após login:');
  const ss = await page.evaluate(() => {
    const items: Record<string, string> = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)!;
      items[k] = sessionStorage.getItem(k)!.substring(0, 100);
    }
    return items;
  });
  console.log(JSON.stringify(ss, null, 2));

  console.log('\nNavegando para /Batidas via URL...');
  await page.goto(
    `https://pontowebapp.secullum.com.br/${settings.empresaId}/Batidas/${hoje}/${hoje}`,
  );
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

  await page.waitForTimeout(2000);
  await browser.close();
}

main().catch(console.error);
