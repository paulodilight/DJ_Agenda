import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: { port: parseInt(process.env.PORT) || 5173, strictPort: false },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        apoiot: path.resolve(__dirname, 'apoiot.html'),
      },
    },
  },
})
