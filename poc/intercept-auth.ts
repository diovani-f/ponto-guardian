import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
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
  console.log('Abrindo browser para interceptar autenticação...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const capturedHeaders: Record<string, string> = {};
  let batidasCaptured = false;

  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/Batidas/')) {
      console.log('\n=== Request capturado para /Batidas ===');
      console.log('URL:', url);
      const headers = request.headers();
      Object.entries(headers).forEach(([k, v]) => {
        if (!['user-agent', 'accept', 'accept-encoding', 'accept-language', 'cache-control', 'connection', 'host'].includes(k.toLowerCase())) {
          console.log(`  ${k}: ${v}`);
          capturedHeaders[k] = v;
        }
      });
      batidasCaptured = true;
    }
  });

  const loginUrl = `https://pontowebapp.secullum.com.br/${settings.empresaId}/Login`;
  console.log('Navegando para login:', loginUrl);
  await page.goto(loginUrl);

  await page.waitForLoadState('networkidle');

  const bodyContent = await page.content();
  if (bodyContent.includes('usuario') || bodyContent.includes('senha') || bodyContent.includes('input')) {
    console.log('Página de login detectada, preenchendo formulário...');

    const userFields = ['usuario', 'login', 'numeroIdentificador', 'user', 'username'];
    for (const field of userFields) {
      const el = page.locator(`input[name="${field}"], input[placeholder*="usuário" i], input[placeholder*="login" i], input[placeholder*="folha" i], input[type="text"]:first-of-type`).first();
      if (await el.count() > 0) {
        console.log('Preenchendo campo de usuário...');
        await el.fill(settings.login);
        break;
      }
    }

    const passEl = page.locator('input[type="password"]').first();
    if (await passEl.count() > 0) {
      await passEl.fill(settings.senha);
    }

    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  } else {
    console.log('Fazendo login via JavaScript...');
    await page.evaluate(
      async ({ empresaId, usuario, senha }) => {
        await fetch(`https://pontowebapp.secullum.com.br/${empresaId}/Login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuario, senha }),
        });
      },
      { empresaId: settings.empresaId, usuario: settings.login, senha: settings.senha },
    );
  }

  console.log('Buscando batidas via página...');
  const hoje = new Date().toISOString().split('T')[0];
  await page.goto(
    `https://pontowebapp.secullum.com.br/${settings.empresaId}/Batidas/${hoje}/${hoje}`,
    { waitUntil: 'networkidle' },
  );

  if (batidasCaptured) {
    console.log('\nHeaders capturados para /Batidas:');
    console.log(JSON.stringify(capturedHeaders, null, 2));
    writeFileSync(join(process.cwd(), 'config', 'captured-headers.json'), JSON.stringify(capturedHeaders, null, 2));
    console.log('\nSalvo em config/captured-headers.json');
  } else {
    console.log('\nNenhuma request para /Batidas foi interceptada.');
    console.log('Verificando localStorage...');
    const storage = await page.evaluate(() => {
      const items: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        items[key] = localStorage.getItem(key)!;
      }
      return items;
    });
    console.log('localStorage:', JSON.stringify(storage, null, 2));
  }

  await browser.close();
}

main().catch(console.error);
