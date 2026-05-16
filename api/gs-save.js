// api/gs-save.js — Vercel Serverless Function
// Escribe datos en Google Sheets desde el servidor (evita CORS en escritura).
// Reutiliza el mismo patrón de JWT que gs-token.js — sin dependencias externas.
const { createSign } = require('crypto');

async function getAccessToken() {
  const privateKey  = process.env.GS_PRIVATE_KEY;
  const clientEmail = process.env.GS_CLIENT_EMAIL || 'conecta-bot@united-bongo-472418-q6.iam.gserviceaccount.com';
  if (!privateKey) throw new Error('GS_PRIVATE_KEY no configurada');

  const now = Math.floor(Date.now() / 1000);
  function b64url(obj) {
    const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
    return Buffer.from(str).toString('base64')
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }
  const header  = b64url({ alg: 'RS256', typ: 'JWT' });
  const payload = b64url({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  });
  const sigInput = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(sigInput);
  const sig = sign.sign(privateKey, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${sigInput}.${sig}`,
  });
  const tokenData = await tokenResp.json();
  if (!tokenData.access_token) {
    throw new Error(tokenData.error_description || tokenData.error || 'No access_token');
  }
  return tokenData.access_token;
}

async function sheetsRequest(token, method, url, body) {
  const opts = {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Sheets API ${method} ${url} → ${r.status}: ${txt}`);
  }
  return r.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SHEET_ID = '1M6sCjodxF8mW_RJGeXdb4u8o3wTz52WvchaUv4hHdWA';

  const { sheetName, metaName, rows, meta } = req.body || {};
  if (!sheetName || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'Body debe incluir sheetName (string) y rows (array)' });
  }

  const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;
  const CHUNK = 500;

  try {
    const token = await getAccessToken();

    // 1. Limpiar hoja destino
    await sheetsRequest(token, 'POST', `${BASE}/values/${encodeURIComponent(sheetName)}!A:ZZ/clear`);

    // 2. Escribir filas en chunks
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk  = rows.slice(i, i + CHUNK);
      const range  = `${sheetName}!A${i + 1}`;
      await sheetsRequest(
        token, 'POST',
        `${BASE}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`,
        { values: chunk }
      );
    }

    // 3. Metadata (opcional)
    if (metaName && Array.isArray(meta) && meta.length > 0) {
      await sheetsRequest(
        token, 'POST',
        `${BASE}/values/${encodeURIComponent(metaName)}!A1:append?valueInputOption=RAW`,
        { values: meta }
      );
    }

    return res.status(200).json({ ok: true, written: rows.length });

  } catch (e) {
    console.error('gs-save error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
