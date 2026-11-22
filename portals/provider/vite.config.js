import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The training-provider portal runs on port 5175
// (main portal 5174, student portal 5173, backend 4000).
export default defineConfig({
  server: { port: 5175, strictPort: true },
  plugins: [react()],
});
