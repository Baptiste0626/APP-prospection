'use strict';
/* Outils partagés des routes /api/cabinet/* (exécutés uniquement côté serveur, sur Vercel).
   Le dossier « _lib » commence par un souligné : Vercel ne l'expose pas comme route. */
const crypto = require('crypto');

const COOKIE = 'cab_session';
const SESSION_SECONDS = 12 * 60 * 60;
const N8N_TIMEOUT_MS = 15000;
const STATUTS = ['À traiter', 'En cours', 'Traité'];

function send(res, status, body){
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}
const fail = (res, status, error, code) => send(res, status, {error, code});

function methodGuard(req, res, method){
  if (req.method === method) return true;
  res.setHeader('Allow', method);
  fail(res, 405, `Méthode non autorisée (attendu : ${method}).`, 'method');
  return false;
}

/* ---------- Session (cookie signé HMAC, HttpOnly) ---------- */
function authConfig(){
  const password = process.env.DASHBOARD_PASSWORD || '';
  const secret = process.env.AUTH_SECRET || '';
  return {password, secret, ready: password.length >= 8 && secret.length >= 32};
}
const sign = (value, secret) => crypto.createHmac('sha256', secret).update(value).digest('base64url');
function safeEqual(a, b){
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
function parseCookies(req){
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')){
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function cookieHeader(value, maxAge){
  return `${COOKIE}=${value}; Path=/api/cabinet; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
function createSession(res, secret){
  const exp = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  res.setHeader('Set-Cookie', cookieHeader(`${exp}.${sign(exp, secret)}`, SESSION_SECONDS));
}
function clearSession(res){ res.setHeader('Set-Cookie', cookieHeader('', 0)); }

/* Renvoie true si la requête porte une session valide ; sinon répond et renvoie false. */
function requireSession(req, res){
  const {secret, ready} = authConfig();
  if (!ready){
    fail(res, 503, 'Protection du dashboard non configurée : définissez DASHBOARD_PASSWORD (8 caractères minimum) et AUTH_SECRET (32 caractères minimum) dans les variables d’environnement Vercel.', 'auth_not_configured');
    return false;
  }
  const raw = parseCookies(req)[COOKIE] || '';
  const [exp, sig] = raw.split('.');
  const valid = exp && sig && safeEqual(sig, sign(exp, secret)) && Number(exp) > Date.now() / 1000;
  if (!valid){ fail(res, 401, 'Session expirée ou absente : connectez-vous.', 'unauthorized'); return false; }
  return true;
}

/* ---------- Appels à n8n ---------- */
function n8nConfig(urlVar){
  const url = process.env[urlVar] || '';
  const key = process.env.N8N_API_KEY || '';
  const missing = [!url && urlVar, !key && 'N8N_API_KEY'].filter(Boolean);
  return {url, key, missing};
}

async function callN8n(res, urlVar, init){
  const {url, key, missing} = n8nConfig(urlVar);
  if (missing.length){
    fail(res, 500, `Configuration serveur incomplète : variable(s) manquante(s) ${missing.join(', ')}.`, 'config');
    return null;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), N8N_TIMEOUT_MS);
  let r;
  try {
    r = await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: ctrl.signal,
      headers: {'X-API-Key': key, 'Accept': 'application/json', ...(init && init.headers)},
    });
  } catch (e){
    const timeout = e && e.name === 'AbortError';
    fail(res, 504, timeout ? 'n8n ne répond pas (délai de 15 s dépassé). Vérifiez que le workflow est actif.' : 'n8n est injoignable. Vérifiez que l’instance n8n est en ligne et que le workflow est actif.', 'n8n_unreachable');
    return null;
  } finally { clearTimeout(timer); }

  const text = await r.text().catch(() => '');
  if (r.status === 401 || r.status === 403){
    fail(res, 502, 'n8n a refusé la clé API : vérifiez que N8N_API_KEY correspond à celle attendue par le workflow.', 'n8n_bad_key');
    return null;
  }
  if (r.status === 404){
    fail(res, 502, 'Webhook n8n introuvable (404) : le workflow est-il activé et l’URL correcte ?', 'n8n_not_found');
    return null;
  }
  if (!r.ok){
    fail(res, 502, `n8n a renvoyé une erreur (HTTP ${r.status}).`, 'n8n_error');
    return null;
  }
  if (!text) return {};
  try { return JSON.parse(text); }
  catch (e){ fail(res, 502, 'Réponse de n8n illisible (JSON attendu).', 'n8n_bad_json'); return null; }
}

async function readJson(req){
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

module.exports = {STATUTS, send, fail, methodGuard, authConfig, safeEqual, createSession, clearSession, requireSession, callN8n, readJson};
