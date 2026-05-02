// api/gs-token.js — Vercel Serverless Function
// La private key vive en la variable de entorno GS_PRIVATE_KEY (dashboard de Vercel).
// Nunca se expone al navegador.

const { createSign } = require('crypto');

module.exports = async function handler(req, res) {
  // Solo GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const privateKey = process.env.GS_PRIVATE_KEY;
  const clientEmail = process.env.GS_CLIENT_EMAIL || 'conecta-bot@united-bongo-472418-q6.iam.gserviceaccount.com';

  if (!privateKey) {
    return res.status(500).json({ error: 'GS_PRIVATE_KEY no configurada en variables de entorno de Vercel' });
  }

  try {
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

    const jwt = `${sigInput}.${sig}`;

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });

    const tokenData = await tokenResp.json();

    if (!tokenData.access_token) {
      return res.status(401).json({ error: tokenData.error_description || tokenData.error || 'No access_token' });
    }

    // Cache en el borde por 55 minutos
    res.setHeader('Cache-Control', 's-maxage=3300, stale-while-revalidate');
    return res.status(200).json({ access_token: tokenData.access_token });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
