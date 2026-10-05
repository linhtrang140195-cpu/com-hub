import { getSetting } from './settings.js';

export const S2S_CLIENT_ID_KEY = 'seatalk_s2s_client_id';
export const SEATALK_APP_ID_KEY = 'seatalk_app_id';
export const SEATALK_APP_SECRET_KEY = 'seatalk_app_secret';

// The public_s2s/seatalk/send_message endpoint — unlike the incoming-webhook
// URLs elsewhere in this service, this can DM an individual by email instead
// of only posting into a fixed group. Contract: see
// how_to_send_seatalk_message_by_api.md. `client-id` is a shared secret the
// Garena VN gateway admin issues; it is never hardcoded here — it comes from
// app_settings (falling back to the PUBLIC_S2S_CLIENT_ID env var) exactly
// like the webhook URLs in settings.js, so it is never committed to git.
const ENDPOINT = 'https://approval.garena.vn/public_s2s/seatalk/send_message';

export async function getS2SClientId() {
  return getSetting(S2S_CLIENT_ID_KEY, process.env.PUBLIC_S2S_CLIENT_ID);
}

// A dedicated app (its own display name/avatar in SeaTalk) instead of the
// shared AOV default — both must be present together or the endpoint 400s,
// so getSeatalkApp() returns either a complete {appId, appSecret} pair or
// null, never a half-filled one.
export async function getSeatalkApp() {
  const [appId, appSecret] = await Promise.all([
    getSetting(SEATALK_APP_ID_KEY, process.env.SEATALK_APP_ID),
    getSetting(SEATALK_APP_SECRET_KEY, process.env.SEATALK_APP_SECRET),
  ]);
  if (!appId?.trim() || !appSecret?.trim()) return null;
  return { appId: appId.trim(), appSecret: appSecret.trim() };
}

// Sends to one or more emails/groups. Caller decides whether a missing
// client-id should be silent (best-effort reminder) or surfaced.
export async function sendSeatalkS2SMessage({ emails, groupIds, message, eventSource = 'BookingSystem' }) {
  const clientId = await getS2SClientId();
  if (!clientId) throw new Error('Chưa cấu hình SeaTalk S2S client-id');

  const cleanEmails = [...new Set((emails || []).map(e => String(e).trim().toLowerCase()).filter(Boolean))];
  const cleanGroups = (groupIds || []).map(g => String(g).trim()).filter(Boolean);
  if (!cleanEmails.length && !cleanGroups.length) throw new Error('Cần ít nhất 1 email hoặc group');

  const app = await getSeatalkApp();

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'client-id': clientId },
    body: JSON.stringify({
      ...(cleanEmails.length ? { emails: cleanEmails } : {}),
      ...(cleanGroups.length ? { groupIds: cleanGroups } : {}),
      message,
      eventSource,
      ...(app ? { app_id: app.appId, app_secret: app.appSecret } : {}),
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    // Never log headers/body — may carry the client-id or recipient PII.
    throw new Error(`SeaTalk S2S API HTTP ${res.status}`);
  }
  return res.json(); // {} — send flow finished, not a delivery receipt (see doc §6).
}
