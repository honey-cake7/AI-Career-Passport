import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export const apiClient = axios.create({
  baseURL,
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Memory only: refreshing requires sign-in; no credentials or resume data in storage.
let sessionRequests = new AbortController();
export function setSessionToken(token: string | null) {
  // A late export/upload from the previous session must not reach the new workspace.
  sessionRequests.abort();
  sessionRequests = new AbortController();
  if (token) apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete apiClient.defaults.headers.common.Authorization;
}

apiClient.interceptors.request.use(config => {
  if (config.headers.Authorization) config.signal ??= sessionRequests.signal;
  return config;
});

apiClient.interceptors.response.use(response => response, error => {
  if (error.response?.status === 401 && !error.config?.url?.startsWith('/api/auth/') &&
      error.config?.headers?.Authorization === apiClient.defaults.headers.common.Authorization) {
    setSessionToken(null);
    window.dispatchEvent(new Event('session-expired'));
  }
  return Promise.reject(error);
});
