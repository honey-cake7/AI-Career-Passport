import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const value = loadEnv(mode, process.cwd(), 'VITE_DEV_PORT').VITE_DEV_PORT?.trim();
  const port = value ? Number(value) : undefined;
  if (port !== undefined && (!/^\d+$/.test(value!) || !Number.isInteger(port) || port < 1024 || port > 65535)) {
    throw new Error('VITE_DEV_PORT must be an integer from 1024 to 65535');
  }
  return { plugins: [react()], ...(port === undefined ? {} : { server: { port, strictPort: true, host: 'localhost' } }) };
})
