// Same-origin '/api' in production (backend serves the built frontend);
// override with VITE_API_BASE_URL for local dev against a separate backend port.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// The session token issued at login. Identity is proved by its signature —
// an email header would just be a claim anyone could make.
function getToken() {
  try {
    return localStorage.getItem('commshub_token') || null;
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    localStorage.removeItem('commshub_token');
    localStorage.removeItem('commshub_user');
  } catch { /* private mode */ }
}

async function request(path, { method = 'GET', body, headers = {}, isFormData = false } = {}) {
  const token = getToken();
  const finalHeaders = { ...headers };
  if (!isFormData) finalHeaders['Content-Type'] = 'application/json';
  if (token) finalHeaders['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: finalHeaders,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  // A 401 while holding a token means the session is no longer good — expired,
  // or left over from before tokens existed. Clear it and send the person to
  // log in, rather than letting screen after screen fail and render blank.
  // Without a token a 401 is expected (the public board probes admin-only
  // endpoints on purpose), so that case just throws like any other error.
  if (res.status === 401 && token) {
    clearSession();
    if (!window.location.pathname.startsWith('/login')) {
      window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    }
  }

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

async function getBlob(path) {
  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.blob();
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
  postForm: (path, formData) => request(path, { method: 'POST', body: formData, isFormData: true }),
  getBlob,
};
