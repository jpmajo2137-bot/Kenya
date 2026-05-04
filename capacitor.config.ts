import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kenyavocab.app',
  appName: 'Jifunze Kikorea kwa Kiswahili',
  webDir: 'dist',
  // 보안: WebView 가 https 스킴으로 동작 (cleartext 트래픽 차단)
  server: {
    androidScheme: 'https',
    // 외부 origin 으로의 navigation 허용 안 함 (내부 SPA 만)
    allowNavigation: [],
    cleartext: false,
  },
  android: {
    // 보안: 자기 서명 인증서/HTTP 콘텐츠 거부
    allowMixedContent: false,
    // 보안: WebView 원격 디버깅 비활성화 (chrome://inspect 접근 차단)
    webContentsDebuggingEnabled: false,
  },
};

export default config;
