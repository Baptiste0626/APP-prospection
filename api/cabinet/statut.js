'use strict';
/* POST /api/cabinet/statut : { row_number, statut } → mise à jour du statut d'une demande chez n8n. */
const {STATUTS, send, fail, methodGuard, requireSession, callN8n, readJson} = require('../_lib/cabinet');

module.exports = async (req, res) => {
  if (!methodGuard(req, res, 'POST')) return;
  if (!requireSession(req, res)) return;
  if (!String(req.headers['content-type'] || '').includes('application/json'))
    return fail(res, 415, 'Contenu attendu : application/json.', 'content_type');
  let body;
  try { body = await readJson(req); } catch (e){ return fail(res, 400, 'Corps de requête JSON invalide.', 'bad_json'); }
  const row = body && body.row_number;
  const statut = body && typeof body.statut === 'string' ? body.statut.normalize('NFC') : '';
  if (!Number.isInteger(row) || row < 1) return fail(res, 400, '« row_number » doit être un entier positif.', 'bad_row');
  if (!STATUTS.includes(statut)) return fail(res, 400, `« statut » doit valoir : ${STATUTS.join(', ')}.`, 'bad_statut');

  const data = await callN8n(res, 'N8N_STATUT_URL', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({row_number: row, statut}),
  });
  if (data === null) return;
  send(res, 200, {ok: true, row_number: row, statut, n8n: data});
};
