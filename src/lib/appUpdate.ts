import { AppUpdate, AppUpdateAvailability, FlexibleUpdateInstallStatus } from '@capawesome/capacitor-app-update';
import { Capacitor } from '@capacitor/core';

export interface UpdateInfo {
  updateAvailable: boolean;
  currentVersion: string;
  availableVersion: string;
  immediateUpdateAllowed: boolean;
  flexibleUpdateAllowed: boolean;
}

/**
 * 앱 업데이트 가능 여부 확인
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  // 네이티브 플랫폼이 아니면 null 반환
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return null;
  }

  try {
    const result = await AppUpdate.getAppUpdateInfo();
    
    return {
      updateAvailable: result.updateAvailability === AppUpdateAvailability.UPDATE_AVAILABLE,
      currentVersion: result.currentVersionCode || '',
      availableVersion: result.availableVersionCode || '',
      immediateUpdateAllowed: result.immediateUpdateAllowed || false,
      flexibleUpdateAllowed: result.flexibleUpdateAllowed || false,
    };
  } catch (error) {
    console.error('[AppUpdate] 업데이트 확인 실패:', error);
    return null;
  }
}

/**
 * 즉시 업데이트 시작 (앱 사용 불가, 강제 업데이트)
 */
export async function startImmediateUpdate(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return false;
  }

  try {
    await AppUpdate.performImmediateUpdate();
    return true;
  } catch (error) {
    console.error('[AppUpdate] 즉시 업데이트 실패:', error);
    return false;
  }
}

/**
 * 유연한 업데이트 시작 (백그라운드 다운로드, 앱 사용 가능)
 */
export async function startFlexibleUpdate(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return false;
  }

  try {
    await AppUpdate.startFlexibleUpdate();
    return true;
  } catch (error) {
    console.error('[AppUpdate] 유연한 업데이트 실패:', error);
    return false;
  }
}

/**
 * 유연한 업데이트 완료 (다운로드 완료 후 설치)
 */
export async function completeFlexibleUpdate(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return false;
  }

  try {
    await AppUpdate.completeFlexibleUpdate();
    return true;
  } catch (error) {
    console.error('[AppUpdate] 유연한 업데이트 완료 실패:', error);
    return false;
  }
}

/**
 * 플레이스토어 앱 페이지 열기
 */
export async function openAppStore(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    // 웹에서는 플레이스토어 URL로 이동
    window.open('https://play.google.com/store/apps/details?id=com.kenyavocab.app', '_blank');
    return;
  }

  try {
    await AppUpdate.openAppStore();
  } catch (error) {
    console.error('[AppUpdate] 앱스토어 열기 실패:', error);
    // 실패 시 URL로 이동
    window.open('https://play.google.com/store/apps/details?id=com.kenyavocab.app', '_blank');
  }
}

/**
 * 유연한 업데이트 상태 리스너 추가
 */
export function addFlexibleUpdateStateListener(
  callback: (state: { installStatus: FlexibleUpdateInstallStatus }) => void
): () => void {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return () => {};
  }

  const listener = AppUpdate.addListener('onFlexibleUpdateStateChange', callback);
  
  return () => {
    listener.then(l => l.remove());
  };
}

// 업데이트 상태 상수 내보내기
export { FlexibleUpdateInstallStatus };
