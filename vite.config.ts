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
    // 보안: 프로덕션 빌드에서 소스맵 비활성화 (역공학 어려움)
    sourcemap: false,
    // 보안: terser 로 추가 난독화 + console / debugger 제거
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.trace'],
        passes: 3,
      },
      format: {
        comments: false,
      },
      mangle: {
        safari10: true,
      },
    },
    // 청크는 manualChunks 로 가능한 한 잘게 분리한다.
    // legacy 빌드(@vitejs/plugin-legacy) 는 구형 안드로이드 4.4+ 폴리필이 결합돼 ~1.1MB 가 되는 게 정상이며
    // 이를 더 쪼개봐야 polyfill 무게가 그대로라 의미가 없다 → 1280KB 로 임계값을 올려 경고만 정리.
    chunkSizeWarningLimit: 1280,
    // 보안: 빌드 산출물 경로/이름 무작위화로 캐시 포이즈닝/추측 방지
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[hash].js',
        chunkFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash][extname]',
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          // 단일 거대 의존성은 자체 청크로 → 첫 화면이 필요할 때만 lazy 로드 가능
          if (id.includes('@google-cloud/text-to-speech')) return 'vendor-gcp-tts'
          if (id.includes('node_modules/openai/')) return 'vendor-openai'
          if (id.includes('firebase/')) return 'vendor-firebase'
          if (id.includes('@supabase/')) return 'vendor-supabase'
          if (id.includes('@capacitor') || id.includes('@capawesome')) return 'vendor-capacitor'
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react'
          }
          // 그 외 node_modules 는 기본 vendor 청크로 합쳐 HTTP 요청 수 절약
          return 'vendor'
        },
      },
    },
    // CSS 도 minify
    cssMinify: true,
    // 빌드 실패시 안전하게 종료
    emptyOutDir: true,
    // 안전한 HMR 비활성 (프로덕션)
    reportCompressedSize: false,
  },
  // 보안: 환경변수 prefix 제한
  envPrefix: 'VITE_',
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
        name: '영어 단어장',
        short_name: '영어 단어장',
        description: 'Oxford 5000 영어 단어를 한국어로 공부하는 단어장. Day별 학습, 퀴즈, 오답노트, 사전 검색.',
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
        // 보안: 민감 응답이 캐시되지 않도록 navigation 외에는 보수적 설정
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: false,
        runtimeCaching: [
          // 보안: Supabase Auth/REST/Realtime 응답은 절대 캐시하지 않음 (민감 데이터/토큰 노출 방지)
          {
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/(auth|rest|realtime|functions)\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\//i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/(firestore\.googleapis\.com|firebase\.googleapis\.com|identitytoolkit\.googleapis\.com|.*\.firebaseio\.com|.*\.firebasestorage\.app)\/.*/i,
            handler: 'NetworkOnly',
          },
          // 외부 API (OpenAI/Gemini/Google TTS) 는 절대 캐시 금지
          {
            urlPattern: /^https:\/\/(api\.openai\.com|generativelanguage\.googleapis\.com|texttospeech\.googleapis\.com)\/.*/i,
            handler: 'NetworkOnly',
          },
          // 광고/분석은 네트워크만
          {
            urlPattern: /^https:\/\/(pagead2\.googlesyndication\.com|googleads\.g\.doubleclick\.net|www\.google-analytics\.com)\/.*/i,
            handler: 'NetworkOnly',
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
