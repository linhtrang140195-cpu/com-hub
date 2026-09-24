import crypto from 'crypto';
import { getSetting, setSetting } from './settings.js';

// Password hashing with scrypt — part of Node, so no extra dependency and no
// risk of an unmaintained one. Stored as "salt:hash", both hex.
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  let candidate;
  try {
    candidate = crypto.scryptSync(String(password), salt, 64);
  } catch {
    return false;
  }
  const known = Buffer.from(hash, 'hex');
  // Lengths must match before timingSafeEqual, and comparing this way keeps
  // the check constant-time so it leaks nothing about the stored hash.
  if (known.length !== candidate.length) return false;
  return crypto.timingSafeEqual(known, candidate);
}

// One signing secret, generated once and kept in the DB so tokens survive a
// redeploy. An env var overrides it if the deployment prefers to own it.
const SECRET_KEY = 'auth_token_secret';
let cachedSecret = null;

export async function getSecret() {
  if (cachedSecret) return cachedSecret;
  if (process.env.AUTH_TOKEN_SECRET) {
    cachedSecret = process.env.AUTH_TOKEN_SECRET;
    return cachedSecret;
  }
  let s = await getSetting(SECRET_KEY, null);
  if (!s) {
    s = crypto.randomBytes(48).toString('hex');
    await setSetting(SECRET_KEY, s, 'system');
  }
  cachedSecret = s;
  return s;
}

const b64 = (buf) => Buffer.from(buf).toString('base64url');

const TOKEN_DAYS = 30;

export async function signToken(payload) {
  const body = { ...payload, exp: Date.now() + TOKEN_DAYS * 86400000 };
  const data = b64(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', await getSecret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export async function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;

  const expected = crypto.createHmac('sha256', await getSecret()).update(data).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload?.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// Minimum that is actually worth enforcing — long enough to matter, short
// enough that nobody writes it on a sticky note.
export function passwordProblem(pw) {
  const s = String(pw || '');
  if (s.length < 8) return 'Mật khẩu phải từ 8 ký tự trở lên';
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return 'Mật khẩu cần có cả chữ và số';
  return null;
}
