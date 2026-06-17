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
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const hoje = new Date().toISOString().split('T')[0];
  const capturedBatidasHeaders: Record<string, string> = {};

  page.on('request', (req) => {
    if (req.url().includes('/Batidas/')) {
      console.log('\n=== /Batidas interceptado ===');
      Object.entries(req.headers()).forEach(([k, v]) => {
        capturedBatidasHeaders[k] = v;
        console.log(`  ${k}: ${v}`);
      });
    }
  });

  page.on('response', async (res) => {
    if (res.url().includes('/Batidas/')) {
      console.log(`/Batidas status: ${res.status()}`);
    }
  });

  console.log('Carregando a SPA do Secullum...');
  await page.goto(`https://pontowebapp.secullum.com.br/${settings.empresaId}/Login`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  console.log('Procurando campos de login na SPA...');
  const inputs = await page.$$('input');
  console.log('Total inputs encontrados:', inputs.length);

  for (const input of inputs) {
    const type = await input.getAttribute('type');
    const name = await input.getAttribute('name');
    const placeholder = await input.getAttribute('placeholder');
    const ngModel = await input.getAttribute('ng-model');
    const formControl = await input.getAttribute('formcontrolname');
    console.log(`  input type=${type} name=${name} placeholder=${placeholder} ng-model=${ngModel} formcontrol=${formControl}`);
  }

  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await btn.innerText().catch(() => '');
    const type = await btn.getAttribute('type');
    console.log(`  button type=${type} text="${text}"`);
  }

  console.log('\nTentando preencher formulário da SPA...');
  try {
    const userInput = page.locator('input[type="text"], input:not([type="password"])').first();
    await userInput.fill(settings.login);
    const passInput = page.locator('input[type="password"]').first();
    await passInput.fill(settings.senha);
    const submitBtn = page.locator('button[type="submit"], button').first();
    await submitBtn.click();
    await page.waitForLoadState('networkidle', { timeout: 8000 });
    console.log('Formulário submetido via SPA');
  } catch (e) {
    console.log('Erro no formulário:', (e as Error).message);
  }

  await page.waitForTimeout(2000);

  console.log('\nLocalStorage:');
  const ls = await page.evaluate(() => {
    const items: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      items[k] = localStorage.getItem(k)!.substring(0, 120);
    }
    return items;
  });
  console.log(JSON.stringify(ls, null, 2));

  console.log('\nCookies:');
  const cookies = await context.cookies();
  cookies.forEach((c) => console.log(`  ${c.name}: ${c.value.substring(0, 60)}`));

  console.log(`\nNavegando para /Batidas/${hoje}/${hoje}...`);
  await page.goto(
    `https://pontowebapp.secullum.com.br/${settings.empresaId}/Batidas/${hoje}/${hoje}`,
  );
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const pageText = await page.content();
  if (pageText.includes('"lista"') || pageText.includes('"batidas"')) {
    console.log('\nBatidas encontradas na página!');
  } else {
    console.log('\nConteúdo da página /Batidas:', pageText.substring(0, 300));
  }

  await browser.close();
}

main().catch(console.error);
