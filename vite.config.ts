import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import legacy from '@vitejs/plugin-legacy'

// https://vite.dev/config/
export default defineConfig({
  // 구형 브라우저 지원 (갤럭시 노트5, 구형 아이폰 등)
  build: {
    target: ['es2015', 'chrome58', 'safari11'],
  },
  plugins: [
    tailwindcss(),
    react(),
    // 구형 브라우저 지원 (Android 4.4+, iOS 9+)
    legacy({
      targets: ['Android >= 4.4', 'iOS >= 9', 'Chrome >= 43', 'Safari >= 9', 'ie >= 11'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      modernPolyfills: true,
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'vite.svg'],
      manifest: {
        name: 'Jifunze Kikorea kwa Kiswahili',
        short_name: 'Jifunze KK',
        description: 'Jifunze Kikorea kwa Kiswahili - Korean Swahili Vocabulary App',
        theme_color: '#070a12',
        background_color: '#070a12',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/logo.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/logo.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB 제한
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          // Storage 공개 오디오/이미지는 DB·업로드 갱신 후에도 오래 캐시되면 예전 TTS가 재생됨 → 네트워크만 사용
          {
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\//i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/.*supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    headers: {
      'Cache-Control': 'no-store',
    },
  },
})
