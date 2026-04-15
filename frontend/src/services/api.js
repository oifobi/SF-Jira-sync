import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Response interceptor for error handling
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.error || err.response?.data?.message || err.message;
    return Promise.reject(new Error(message));
  }
);

// Sync API
export const syncAPI = {
  getStatus:     ()       => api.get('/sync/status').then((r) => r.data),
  trigger:       ()       => api.post('/sync/trigger').then((r) => r.data),
  getLogs:       (params) => api.get('/sync/logs',      { params }).then((r) => r.data),
  getRecords:    (params) => api.get('/sync/records',   { params }).then((r) => r.data),
  getRecord:     (id)     => api.get(`/sync/records/${id}`).then((r) => r.data),
  deleteRecord:  (id)     => api.delete(`/sync/records/${id}`).then((r) => r.data),
  getStats:      ()       => api.get('/sync/stats').then((r) => r.data),
  getRules:      ()       => api.get('/sync/rules').then((r) => r.data),
  getEscalated:  ()       => api.get('/sync/escalated').then((r) => r.data),
};

// Config API
export const configAPI = {
  getAll: () => api.get('/configs').then((r) => r.data),
  create: (data) => api.post('/configs', data).then((r) => r.data),
  update: (id, data) => api.put(`/configs/${id}`, data).then((r) => r.data),
  delete: (id) => api.delete(`/configs/${id}`).then((r) => r.data),
  toggle: (id) => api.patch(`/configs/${id}/toggle`).then((r) => r.data),
};

// Connection API
export const connectionAPI = {
  getSalesforceStatus: () => api.get('/connections/salesforce').then((r) => r.data),
  getJiraStatus: () => api.get('/connections/jira').then((r) => r.data),
  getJiraProjects: () => api.get('/connections/jira/projects').then((r) => r.data),
  testAll: () => api.post('/connections/test-all').then((r) => r.data),
};

export default api;
