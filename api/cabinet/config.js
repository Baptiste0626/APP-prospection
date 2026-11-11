'use strict';
/* GET /api/cabinet/config : configuration PUBLIQUE de la page Démo (URL du chat n8n uniquement, jamais la clé API). */
const {send, methodGuard} = require('../_lib/cabinet');

module.exports = (req, res) => {
  if (!methodGuard(req, res, 'GET')) return;
  send(res, 200, {chatUrl: process.env.NEXT_PUBLIC_N8N_CHAT_URL || ''});
};
