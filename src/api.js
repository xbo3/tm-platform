const BASE = '';
let token = localStorage.getItem('tm_token') || '';

export const setToken = (t) => { token = t; localStorage.setItem('tm_token', t); };
export const clearToken = () => { token = ''; localStorage.removeItem('tm_token'); localStorage.removeItem('tm_user'); };
export const getUser = () => { try { return JSON.parse(localStorage.getItem('tm_user')); } catch { return null; } };
export const setUser = (u) => localStorage.setItem('tm_user', JSON.stringify(u));

const headers = () => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) });

const api = async (method, path, body) => {
  const opts = { method, headers: headers() };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  if (res.status === 401) { clearToken(); window.location.reload(); return null; }
  return res.json();
};

export const login = async (email, password) => {
  const data = await api('POST', '/api/auth/login', { email, password });
  if (data?.token) { setToken(data.token); setUser(data.user); }
  return data;
};
export const logout = async () => { await api('POST', '/api/auth/logout'); clearToken(); };
export const me = () => api('GET', '/api/auth/me');

export const getCenters = () => api('GET', '/api/centers');
export const createCenter = (d) => api('POST', '/api/centers', d);
export const updateCenter = (id, d) => api('PUT', `/api/centers/${id}`, d);

export const getDashboard = (cid) => api('GET', `/api/dashboard/${cid}`);
export const getStats = (cid) => api('GET', `/api/stats/${cid}`);
export const getLists = (cid) => api('GET', `/api/lists/${cid}`);
export const getCustomers = (params) => api('GET', `/api/customers?${new URLSearchParams(params)}`);
export const distribute = (d) => api('POST', '/api/customers/distribute', d);
export const startTest = () => api('POST', '/api/test/start');
export const stopTest = () => api('POST', '/api/test/stop');

export const callNext = () => api('POST', '/api/calls/next');
export const callStart = (customer_id) => api('POST', '/api/calls/start', { customer_id });
export const callEnd = (id, d) => api('PUT', `/api/calls/${id}/end`, d);

export const getRecordings = (cid) => api('GET', `/api/recordings/${cid}`);

export const uploadExcel = async (file, title, source, isTest) => {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('title', title);
  fd.append('source', source);
  fd.append('is_test', isTest ? '1' : '0');
  const res = await fetch(`${BASE}/api/customers/upload`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
  });
  return res.json();
};
