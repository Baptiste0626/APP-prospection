'use strict';
/* GET /api/cabinet/dashboard : données du dashboard cabinet, lues chez n8n côté serveur (la clé API reste cachée). */
const {send, methodGuard, requireSession, callN8n} = require('../_lib/cabinet');

module.exports = async (req, res) => {
  if (!methodGuard(req, res, 'GET')) return;
  if (!requireSession(req, res)) return;
  const data = await callN8n(res, 'N8N_DASHBOARD_URL', {method: 'GET'});
  if (data === null) return;
  const body = Array.isArray(data) && data.length === 1 ? data[0] : data;
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return send(res, 502, {error: 'Format inattendu renvoyé par n8n (objet JSON attendu).', code: 'n8n_bad_format'});
  send(res, 200, body);
};
