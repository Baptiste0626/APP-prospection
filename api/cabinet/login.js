'use strict';
/* POST /api/cabinet/login : { password } → cookie de session HttpOnly (12 h). */
const {send, fail, methodGuard, authConfig, safeEqual, createSession, readJson} = require('../_lib/cabinet');

module.exports = async (req, res) => {
  if (!methodGuard(req, res, 'POST')) return;
  const {password, secret, ready} = authConfig();
  if (!ready) return fail(res, 503, 'Protection du dashboard non configurée : définissez DASHBOARD_PASSWORD et AUTH_SECRET dans les variables d’environnement Vercel.', 'auth_not_configured');
  let body;
  try { body = await readJson(req); } catch (e){ return fail(res, 400, 'Corps de requête JSON invalide.', 'bad_json'); }
  const given = body && typeof body.password === 'string' ? body.password : '';
  if (!given || !safeEqual(given, password)){
    await new Promise(r => setTimeout(r, 600)); // freine les essais en rafale
    return fail(res, 401, 'Mot de passe incorrect.', 'bad_password');
  }
  createSession(res, secret);
  send(res, 200, {ok: true});
};
