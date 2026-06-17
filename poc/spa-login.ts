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
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  const hoje = new Date().toISOString().split('T')[0];

  const batidasHeaders: Record<string, string> = {};
  let batidasStatus = 0;
  let batidasBody = '';

  page.on('request', (req) => {
    if (req.url().includes('/Batidas/')) {
      Object.assign(batidasHeaders, req.headers());
    }
  });

  page.on('response', async (res) => {
    if (res.url().includes('/Batidas/')) {
      batidasStatus = res.status();
      if (batidasStatus === 200) {
        batidasBody = await res.text().catch(() => '');
      }
    }
  });

  console.log('Carregando SPA...');
  const loginPageUrl = `https://pontowebapp.secullum.com.br/${settings.empresaId}/Login`;
  await page.goto(loginPageUrl, { waitUntil: 'domcontentloaded' });

  console.log('Aguardando SPA inicializar (10s)...');
  await page.waitForTimeout(10000);

  const inputs = await page.$$('input');
  console.log(`Inputs encontrados: ${inputs.length}`);

  if (inputs.length > 0) {
    console.log('Preenchendo formulário da SPA...');
    const allInputs = await page.$$('input');
    for (const inp of allInputs) {
      const type = await inp.getAttribute('type');
      if (type !== 'password') {
        await inp.fill(settings.login);
      } else {
        await inp.fill(settings.senha);
      }
    }

    const btn = await page.$('button[type="submit"], button');
    if (btn) {
      await btn.click();
      console.log('Formulário submetido');
    } else {
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(5000);
  } else {
    console.log('SPA não renderizou inputs. Fazendo login via fetch na página...');
    await page.evaluate(
      async ({ empresaId, usuario, senha }) => {
        const resp = await fetch(`/${empresaId}/Login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuario, senha }),
        });
        const data = await resp.json();
        // Tentar salvar em localStorage como a SPA faria
        localStorage.setItem('funcionario', JSON.stringify(data));
        localStorage.setItem('funcionarioId', String(data.id));
        localStorage.setItem('empresaId', String(empresaId));
        return data.id;
      },
      { empresaId: settings.empresaId, usuario: settings.login, senha: settings.senha },
    );
    await page.waitForTimeout(1000);
  }

  console.log('\nLocalStorage após login:');
  const ls = await page.evaluate(() => {
    const r: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      r[k] = localStorage.getItem(k)!.substring(0, 120);
    }
    return r;
  });
  console.log(JSON.stringify(ls, null, 2));

  console.log(`\nBuscando /Batidas/${hoje}/${hoje} via fetch na página (com contexto da SPA)...`);
  const batidasViaPage = await page.evaluate(
    async ({ empresaId, data }) => {
      // Tentar vários formatos de autenticação que a SPA pode usar
      const tentativas = [
        { headers: {} },
        { headers: { 'X-Funcionario': localStorage.getItem('funcionarioId') || '' } },
        { headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || localStorage.getItem('funcionarioId') || ''}` } },
      ];

      const resultados = [];
      for (const t of tentativas) {
        const res = await fetch(`/${empresaId}/Batidas/${data}/${data}`, {
          headers: { 'Accept': 'application/json', ...t.headers },
        });
        resultados.push({
          headersSent: t.headers,
          status: res.status,
          body: res.status === 200 ? (await res.text()).substring(0, 200) : '',
        });
      }
      return resultados;
    },
    { empresaId: settings.empresaId, data: hoje },
  );

  console.log('\nResultados /Batidas:');
  batidasViaPage.forEach((r) => console.log(JSON.stringify(r)));

  if (batidasStatus > 0) {
    console.log(`\n/Batidas via navegação: HTTP ${batidasStatus}`);
    if (batidasBody) {
      console.log('Body:', batidasBody.substring(0, 300));
    }
    const authHeaders = Object.entries(batidasHeaders)
      .filter(([k]) => !['user-agent', 'accept-encoding', 'accept-language', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'upgrade-insecure-requests', 'accept'].includes(k.toLowerCase()))
      .reduce<Record<string, string>>((acc, [k, v]) => { acc[k] = v; return acc; }, {});
    console.log('\nHeaders de auth do /Batidas:', JSON.stringify(authHeaders, null, 2));
    writeFileSync(join(process.cwd(), 'config', 'auth-headers.json'), JSON.stringify(authHeaders, null, 2));
  }

  await browser.close();
}

main().catch(console.error);
