import axios from 'axios';

function stripTrailingSlash(value) {
  return typeof value === 'string' ? value.replace(/\/+$/, '') : value;
}

/**
 * API base URL resolution (CRA build-time env):
 * - REACT_APP_API_BASE_URL: full prefix to API (e.g. https://backend.example.com/api)
 * - REACT_APP_API_URL: backend origin (e.g. https://backend.example.com) -> we append /api
 * - default: /api (same-origin; works with CRA proxy in dev)
 */
export function getApiBaseUrl() {
  const baseFromEnv = stripTrailingSlash(process.env.REACT_APP_API_BASE_URL);
  if (baseFromEnv) return baseFromEnv;

  const originFromEnv = stripTrailingSlash(process.env.REACT_APP_API_URL);
  if (originFromEnv) return `${originFromEnv}/api`;

  return '/api';
}

export const api = axios.create({
  baseURL: getApiBaseUrl(),
});
