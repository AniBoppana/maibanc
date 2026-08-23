import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const DEV_USER_ID = import.meta.env.VITE_DEV_USER_ID;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add user ID to every request
api.interceptors.request.use((config) => {
  // For now, use dev bypass. We'll swap this for Clerk JWT later.
  config.headers['X-Dev-User-Id'] = DEV_USER_ID;
  return config;
});

export default api;