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
  const hoje = new Date().toISOString().split('T')[0];

  console.log('Conectando ao Chrome via CDP...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  console.log('Contexts:', contexts.length);

  const context = contexts[0] || await browser.newContext();
  const page = await context.newPage();

  const batidasHeaders: Record<string, string> = {};
  let batidasStatus = 0;
  let batidasBody = '';

  await context.route('**', (route) => route.continue());

  page.on('request', (req) => {
    if (req.url().includes('/Batidas/')) {
      console.log('\n=== /Batidas interceptado! ===');
      const h = req.headers();
      Object.assign(batidasHeaders, h);
      Object.entries(h).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
    }
  });

  page.on('response', async (res) => {
    if (res.url().includes('/Batidas/')) {
      batidasStatus = res.status();
      batidasBody = await res.text().catch(() => '');
      console.log(`/Batidas: HTTP ${batidasStatus}, body length: ${batidasBody.length}`);
    }
  });

  const loginUrl = `https://pontowebapp.secullum.com.br/${settings.empresaId}/Login`;
  console.log('Navegando para', loginUrl);
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(8000);

  const html = await page.content();
  console.log('HTML length:', html.length);
  const inputs = await page.$$('input');
  console.log('Inputs:', inputs.length);

  if (inputs.length === 0) {
    console.log('SPA não carregou. Injetando login via JS...');
    await page.evaluate(
      async ({ empresaId, usuario, senha }) => {
        const res = await fetch(`/${empresaId}/Login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuario, senha }),
        });
        const data = await res.json();
        localStorage.setItem('funcionario', JSON.stringify(data));
        return data;
      },
      { empresaId: settings.empresaId, usuario: settings.login, senha: settings.senha },
    );
    await page.waitForTimeout(2000);
  } else {
    for (const inp of inputs) {
      const type = await inp.getAttribute('type');
      await inp.fill(type === 'password' ? settings.senha : settings.login);
    }
    const btn = await page.$('button[type="submit"], button');
    if (btn) await btn.click();
    await page.waitForTimeout(5000);
  }

  console.log(`\nNavegando para /Batidas/${hoje}/${hoje}...`);
  await page.goto(
    `https://pontowebapp.secullum.com.br/${settings.empresaId}/Batidas/${hoje}/${hoje}`,
    { timeout: 10000 },
  ).catch(() => {});
  await page.waitForTimeout(3000);

  if (batidasStatus === 200) {
    console.log('\nBatidas obtidas com sucesso!');
    console.log('Body preview:', batidasBody.substring(0, 300));
    const authOnly = Object.entries(batidasHeaders)
      .filter(([k]) => !['accept-encoding', 'accept-language', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform'].includes(k))
      .reduce<Record<string, string>>((acc, [k, v]) => { acc[k] = v; return acc; }, {});
    console.log('\nHeaders relevantes:');
    console.log(JSON.stringify(authOnly, null, 2));
  }

  await page.close();
  await browser.close();
}

main().catch(console.error);
