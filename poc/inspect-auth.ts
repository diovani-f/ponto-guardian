import fetch from 'node-fetch';

const BASE = 'https://pontowebapp.secullum.com.br';
const EMPRESA_ID = 18914;

async function main() {
  console.log('=== Testando login ===');

  const loginRes = await fetch(`${BASE}/${EMPRESA_ID}/Login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
      'Origin': `https://pontowebapp.secullum.com.br`,
      'Referer': `https://pontowebapp.secullum.com.br/${EMPRESA_ID}/Login`,
    },
    body: JSON.stringify({ usuario: '739', senha: '#Dsf8491' }),
  });

  console.log('Login status:', loginRes.status);
  console.log('Login headers:');
  loginRes.headers.forEach((v, k) => console.log(`  ${k}: ${v}`));

  const data = await loginRes.json() as Record<string, unknown>;
  console.log('\nCampos do response:', Object.keys(data));

  const identificacao = data['loginIdentificacaoNavegador'] as string | null;
  console.log('loginIdentificacaoNavegador:', identificacao);

  console.log('\n=== Testando /Batidas sem auth ===');
  const r1 = await fetch(`${BASE}/${EMPRESA_ID}/Batidas/2026-06-05/2026-06-05`, {
    headers: { 'Accept': 'application/json' },
  });
  console.log('Status sem auth:', r1.status);

  if (identificacao) {
    console.log('\n=== Testando /Batidas com X-Identificacao ===');
    const r2 = await fetch(`${BASE}/${EMPRESA_ID}/Batidas/2026-06-05/2026-06-05`, {
      headers: {
        'Accept': 'application/json',
        'X-Sec-Identificacao': identificacao,
        'X-Identificacao': identificacao,
      },
    });
    console.log('Status com identificacao:', r2.status);
    if (r2.status === 200) {
      const body = await r2.text();
      console.log('Body:', body.substring(0, 300));
    }
  }

  console.log('\n=== Testando /Batidas com funcionarioId na URL ===');
  const r3 = await fetch(`${BASE}/${EMPRESA_ID}/Batidas/2026-06-05/2026-06-05/${data['id']}`, {
    headers: { 'Accept': 'application/json' },
  });
  console.log('Status com id na URL:', r3.status);
  if (r3.status === 200) {
    const body = await r3.text();
    console.log('Body:', body.substring(0, 300));
  }
}

main().catch(console.error);
