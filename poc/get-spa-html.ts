import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const jsFiles: string[] = [];

  page.on('request', (req) => {
    if (req.url().endsWith('.js') || req.url().includes('.js?')) {
      jsFiles.push(req.url());
    }
  });

  console.log('Carregando página e coletando JS...');
  await page.goto('https://pontowebapp.secullum.com.br/18914/Login', {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  }).catch(() => {});

  await page.waitForTimeout(5000);

  const html = await page.content();
  console.log('HTML length:', html.length);
  console.log('HTML snippet:', html.substring(0, 500));

  console.log('\nJS files carregados:');
  jsFiles.forEach((f) => console.log(' ', f));

  await browser.close();
}

main().catch(console.error);
