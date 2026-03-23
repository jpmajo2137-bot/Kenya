import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { 
  startFlexibleUpdate, 
  openAppStore, 
  completeFlexibleUpdate,
  addFlexibleUpdateStateListener,
  FlexibleUpdateInstallStatus,
  type UpdateInfo 
} from '../lib/appUpdate';
import type { Lang } from '../lib/i18n';

interface UpdateModalProps {
  open: boolean;
  onClose: () => void;
  updateInfo: UpdateInfo | null;
  lang: Lang;
}

export function UpdateModal({ open, onClose, updateInfo, lang }: UpdateModalProps) {
  const [updating, setUpdating] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadComplete, setDownloadComplete] = useState(false);

  const handleUpdate = async () => {
    if (!updateInfo) return;

    setUpdating(true);

    if (updateInfo.flexibleUpdateAllowed) {
      const removeListener = addFlexibleUpdateStateListener((state) => {
        switch (state.installStatus) {
          case FlexibleUpdateInstallStatus.DOWNLOADING:
            setDownloadProgress(50);
            break;
          case FlexibleUpdateInstallStatus.DOWNLOADED:
            setDownloadProgress(100);
            setDownloadComplete(true);
            completeFlexibleUpdate();
            break;
          case FlexibleUpdateInstallStatus.INSTALLED:
            setUpdating(false);
            onClose();
            break;
          case FlexibleUpdateInstallStatus.FAILED:
          case FlexibleUpdateInstallStatus.CANCELED:
            setUpdating(false);
            setDownloadProgress(null);
            openAppStore().then(onClose);
            break;
        }
      });

      const success = await startFlexibleUpdate();
      if (!success) {
        removeListener();
        setUpdating(false);
        await openAppStore();
        onClose();
      }
    } else {
      await openAppStore();
      setUpdating(false);
      onClose();
    }
  };

  if (!updateInfo) return null;

  return (
    <Modal
      open={open}
      title=""
      onClose={onClose}
      footer={null}
    >
      <div className="text-center py-2">
        <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-400/30 flex items-center justify-center">
          <span className="text-4xl">🎉</span>
        </div>

        <h2 className="text-xl font-bold text-white mb-2">
          {lang === 'sw' ? 'Toleo Jipya Linapatikana!' : '새 버전이 있습니다!'}
        </h2>

        {!updating && !downloadComplete && (
          <>
            <p className="text-sm text-white/70 mb-6 leading-relaxed">
              {lang === 'sw' 
                ? 'Sasisha programu kupata vipengele vipya na uboreshaji wa utendaji.'
                : '새로운 기능과 개선된 성능을 위해 앱을 업데이트해주세요.'}
            </p>

            <div className="space-y-2">
              <Button onClick={handleUpdate} className="w-full">
                {lang === 'sw' ? '📥 Sasisha Sasa' : '📥 지금 업데이트'}
              </Button>
              <Button variant="secondary" onClick={onClose} className="w-full">
                {lang === 'sw' ? 'Baadaye' : '나중에'}
              </Button>
            </div>

            <p className="mt-4 text-[11px] text-white/40">
              {lang === 'sw' 
                ? '💡 Sasisha ili upate uzoefu bora zaidi'
                : '💡 업데이트하면 더 좋은 학습 경험을 할 수 있어요'}
            </p>
          </>
        )}

        {updating && !downloadComplete && (
          <div className="mb-4">
            <p className="text-sm text-white/70 mb-4">
              {lang === 'sw' ? 'Inapakua na kusakinisha...' : '다운로드 및 설치 중...'}
            </p>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-2">
              <div 
                className="h-full bg-gradient-to-r from-green-400 to-emerald-400 transition-all duration-300"
                style={{ width: `${downloadProgress ?? 15}%` }}
              />
            </div>
            <p className="text-xs text-white/50">
              {lang === 'sw' ? 'Tafadhali subiri...' : '잠시만 기다려주세요...'}
            </p>
          </div>
        )}

        {downloadComplete && (
          <div className="mb-4 p-3 rounded-xl bg-green-500/15 border border-green-400/25">
            <p className="text-sm text-green-300">
              {lang === 'sw' ? 'Inasakinisha...' : '설치 중...'}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
