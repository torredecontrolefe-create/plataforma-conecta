const { google } = require('googleapis');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const privateKey = process.env.GS_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!privateKey) return res.status(500).json({ error: 'GS_PRIVATE_KEY not set' });

    const auth = new google.auth.JWT(
      'conecta-bot@united-bongo-472418-q6.iam.gserviceaccount.com',
      null,
      privateKey,
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    await auth.authorize();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '1M6sCjodxF8mW_RJGeXdb4u8o3wTz52WvchaUv4hHdWA';

    const { action, sheetName, rows, startRow, metaName, meta } = req.body;

    if (action === 'clear') {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A:ZZ`,
      });
      return res.status(200).json({ ok: true });
    }

    if (action === 'append') {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A${startRow + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: rows },
      });
      return res.status(200).json({ ok: true });
    }

    if (action === 'meta') {
      // Find or create meta sheet
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const metaSheet = spreadsheet.data.sheets?.find(s => s.properties.title === metaName);
      if (!metaSheet) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: [{ addSheet: { properties: { title: metaName } } }] },
        });
      }
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${metaName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [[JSON.stringify(meta)]] },
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action: ' + action });

  } catch (e) {
    console.error('gs-save error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
