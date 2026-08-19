import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  return {
    plugins: [
      react(),
      tailwindcss(),
    ],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src/app'),
      },
    },

    // Los estáticos (sw.js, manifest.json, robots.txt, íconos) viven en
    // src/app/public, no en ./public (la ubicación por defecto de Vite).
    // Sin esto, el build no los copia a dist/ y en producción /sw.js
    // termina sirviendo index.html (SPA rewrite), rompiendo el registro
    // del Service Worker con un error de MIME type.
    publicDir: path.resolve(__dirname, 'src/app/public'),

    // ── Build optimizations for Vercel ────────────────────────────────
    build: {
      // Target modern browsers (Vercel edge network handles legacy clients)
      target: 'es2020',
      // Emit source maps in production so Vercel error tracking is useful
      sourcemap: mode === 'production' ? 'hidden' : true,
      rollupOptions: {
        output: {
          // Manual chunking: split vendor libs so the main bundle stays small
          manualChunks: {
            // React core. Hay que nombrar también 'react/jsx-runtime' y
            // 'react-dom/client': son los módulos que el código importa de
            // verdad, y sin ellos el chunk sale vacío.
            'react-vendor': ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
            // Firebase SDK — split per service to allow tree-shaking
            'firebase-app':       ['firebase/app'],
            'firebase-auth':      ['firebase/auth'],
            'firebase-firestore': ['firebase/firestore'],
            'firebase-functions': ['firebase/functions'],
            // UI component library
            'radix-ui': [
              '@radix-ui/react-dialog',
              '@radix-ui/react-select',
              '@radix-ui/react-tabs',
              '@radix-ui/react-tooltip',
              '@radix-ui/react-popover',
            ],
            // Charts
            'recharts': ['recharts'],
          },
        },
      },
      // Warn (not error) when a chunk exceeds 600 kB
      chunkSizeWarningLimit: 600,
    },

    // ── Dev server ────────────────────────────────────────────────────
    server: {
      port: 5173,
      strictPort: false,
      proxy: {
        '/api': {
          target: 'https://veterinarialeo.vercel.app',
          changeOrigin: true,
          secure: true,
        }
      }
    },

    // ── Preview server (used by `vite preview`) ───────────────────────
    preview: {
      port: 4173,
    },

    // ── Environment variable prefix exposed to client code ────────────
    // Variables must be prefixed with VITE_ to be exposed in the browser.
    // This is the Vite default; listed here for documentation purposes.
    envPrefix: 'VITE_',
  }
})
