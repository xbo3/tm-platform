const getToken = () => localStorage.getItem('tm_token');
const headers = () => ({
  'Content-Type': 'application/json',
  ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
});

export async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, { headers: headers(), ...opts });
  if (res.status === 401) { localStorage.clear(); window.location.reload(); return null; }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API Error');
  return data;
}

export const get = (path) => api(path);
export const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });
export const put = (path, body) => api(path, { method: 'PUT', body: JSON.stringify(body) });
export const del = (path) => api(path, { method: 'DELETE' });

export async function uploadFile(path, file, fields = {}) {
  const form = new FormData();
  form.append('file', file);
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}
