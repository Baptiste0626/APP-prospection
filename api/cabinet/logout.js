'use strict';
/* POST /api/cabinet/logout : supprime le cookie de session. */
const {send, methodGuard, clearSession} = require('../_lib/cabinet');

module.exports = (req, res) => {
  if (!methodGuard(req, res, 'POST')) return;
  clearSession(res);
  send(res, 200, {ok: true});
};
