// Same-origin '/api' in production (backend serves the built frontend);
// override with VITE_API_BASE_URL for local dev against a separate backend port.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

function getStoredEmail() {
  try {
    return JSON.parse(localStorage.getItem('commshub_user') || 'null')?.email || null;
  } catch {
    return null;
  }
}

async function request(path, { method = 'GET', body, headers = {}, isFormData = false } = {}) {
  const email = getStoredEmail();
  const finalHeaders = { ...headers };
  if (!isFormData) finalHeaders['Content-Type'] = 'application/json';
  if (email) finalHeaders['X-User-Email'] = email;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: finalHeaders,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
  postForm: (path, formData) => request(path, { method: 'POST', body: formData, isFormData: true }),
};
