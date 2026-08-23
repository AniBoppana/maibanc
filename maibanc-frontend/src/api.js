import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const DEV_USER_ID = import.meta.env.VITE_DEV_USER_ID;

// Without a scheme, axios treats this as a relative path and silently
// resolves every request against the current page's own origin instead of
// the API host — every call then 404s against whatever route happens to
// match on that origin, with no error pointing at the real cause.
if (API_BASE_URL && !/^https?:\/\//.test(API_BASE_URL)) {
  throw new Error(
    `VITE_API_BASE_URL must be a full URL starting with http:// or https:// (got "${API_BASE_URL}")`
  );
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Registered once, at app startup, by AuthBridge (see App.jsx) with Clerk's
// useAuth().getToken. A fresh token is fetched per request since Clerk's
// session JWTs are short-lived.
let getClerkToken = null;

export function setClerkTokenGetter(fn) {
  getClerkToken = fn;
}

api.interceptors.request.use(async (config) => {
  const token = getClerkToken ? await getClerkToken() : null;
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  } else if (DEV_USER_ID) {
    // Falls back to the dev bypass only when no signed-in Clerk session
    // exists yet (and only works at all if the backend is NODE_ENV=development).
    config.headers['X-Dev-User-Id'] = DEV_USER_ID;
  }
  return config;
});

export default api;
