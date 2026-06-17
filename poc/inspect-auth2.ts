import fetch from 'node-fetch';

const BASE = 'https://pontowebapp.secullum.com.br';
const EMPRESA_ID = 18914;
const DEVICE_ID = 'ponto-guardian-poc-001';

async function main() {
  console.log('=== Login com identificacaoNavegador ===');

  const loginRes = await fetch(`${BASE}/${EMPRESA_ID}/Login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usuario: '739',
      senha: '#Dsf8491',
      identificacaoNavegador: DEVICE_ID,
    }),
  });

  const data = await loginRes.json() as Record<string, unknown>;
  const identificacaoRetornada = data['loginIdentificacaoNavegador'];
  console.log('loginIdentificacaoNavegador retornado:', identificacaoRetornada);
  console.log('id funcionario:', data['id']);

  const tokenCandidatos = [
    identificacaoRetornada as string,
    DEVICE_ID,
  ].filter(Boolean);

  for (const token of tokenCandidatos) {
    console.log(`\n=== Testando /Batidas com token "${token}" ===`);

    const headers: Record<string, string> = { 'Accept': 'application/json' };

    const headersToTry = [
      { 'X-Sec-IdentificacaoNavegador': token },
      { 'Authorization': `Bearer ${token}` },
      { 'X-Auth-Token': token },
      { 'Cookie': `identificacao=${token}` },
    ];

    for (const extra of headersToTry) {
      const r = await fetch(`${BASE}/${EMPRESA_ID}/Batidas/2026-06-05/2026-06-05`, {
        headers: { ...headers, ...extra },
      });
      const headerName = Object.keys(extra)[0];
      console.log(`  ${headerName}: HTTP ${r.status}`);
      if (r.status === 200) {
        const body = await r.text();
        console.log('  BODY:', body.substring(0, 200));
      }
    }
  }
}

main().catch(console.error);
