import axios from 'axios';

// In dev, Vite runs on 5173 and the backend is on 3000 — use the explicit URL.
// In prod, everything is served from Node on the same origin — use relative URLs.
const baseURL = import.meta.env.DEV
    ? 'http://localhost:3001'
    : import.meta.env.VITE_API_URL ?? '';

export const api = axios.create({
    baseURL,
    withCredentials: true,
});
