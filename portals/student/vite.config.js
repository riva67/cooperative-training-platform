import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// The student portal runs on port 5173
// (main portal 5174, training provider 5175, admin 5176, backend 4000).
export default defineConfig({
  server: { port: 5173, strictPort: true },
  plugins: [react(), tailwindcss()],
})
