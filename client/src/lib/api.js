/* FILE GUIDE:
 * client/src/lib/api.js
 * Purpose: Axios/API helper definitions used by the React pages.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import axios from "axios";

export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export const api = axios.create({ baseURL: API_BASE + "/api" });

// Attach the latest saved token to every request. This prevents protected pages
// from firing their first request before App's mount effect restores Axios state.
api.interceptors.request.use((config) => {
  const savedToken = localStorage.getItem("qz_token") || "";
  if (savedToken) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${savedToken}`;
  }
  return config;
});

export function setAuthToken(token) {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
}
