import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The admin portal runs on port 5176
// (student 5173, main 5174, training provider 5175, backend 4000).
export default defineConfig({
  server: { port: 5176, strictPort: true },
  plugins: [react()],
});
