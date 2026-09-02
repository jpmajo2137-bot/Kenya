import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jph.oxfordenglish',
  appName: 'JHP 영어 단어 암기',
  webDir: 'dist',
  android: {
    // 보안: 자기 서명 인증서/HTTP 콘텐츠 거부
    allowMixedContent: false,
    // WebView 배경색을 앱 다크 톤으로 강제 (status bar 영역 noise 방지)
    backgroundColor: '#070a12',
  },
  ios: {
    backgroundColor: '#070a12',
    contentInset: 'automatic',
  },
};

export default config;
