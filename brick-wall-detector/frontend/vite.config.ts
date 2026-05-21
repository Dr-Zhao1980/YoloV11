import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  root: __dirname,
  plugins: [
    vue(),
    {
      name: 'rewrite-html',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          // SPA fallback: non-file requests go to entry.html
          if (req.url && !req.url.includes('.') && !req.url.startsWith('/api') && !req.url.startsWith('/uploads') && !req.url.startsWith('/@') && !req.url.startsWith('/node_modules')) {
            req.url = '/entry.html'
          } else if (req.url === '/' || req.url === '/index.html') {
            req.url = '/entry.html'
          }
          next()
        })
      }
    }
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3080',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:3080',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: resolve(__dirname, '..', 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'entry.html')
    }
  }
})
