import { useState } from 'react'
import type { AppStateV2 } from '../lib/types'
import type { Action } from '../app/state'
import { Button } from '../components/Button'
import { useToast } from '../components/Toast'
import { t, type Lang } from '../lib/i18n'
import { resetConsentAndShowForm, getAdPersonalization } from '../lib/admob'

export function SettingsScreen({
  state,
  dispatch,
  lang,
}: {
  state: AppStateV2
  dispatch: (a: Action) => void
  lang: Lang
}) {
  const { toast } = useToast()

  const onUserDataWipe = () => {
    const ok = window.confirm(
      lang === 'sw'
        ? 'Una uhakika unataka kufuta data ya mtumiaji?\n\n- Vitabu vya maneno\n- Orodha ya maneno\n- Orodha ya makosa\n- Rekodi ya kujifunza\n\nBaada ya kufuta, programu itaanzishwa upya.'
        : '정말로 사용자 데이터를 삭제할까요?\n\n- 단어장\n- 단어 목록\n- 오답 노트\n- 학습 기록\n\n삭제 후 앱이 새로고침됩니다.',
    )
    if (!ok) return
    try {
      // 메인 앱 상태 삭제
      localStorage.removeItem('kenya-vocab.state')
      // 오답노트 데이터 삭제 (한국어/스와힐리어 버전)
      localStorage.removeItem('flashcard_wrong_answers_ko')
      localStorage.removeItem('flashcard_wrong_answers_sw')
      // 퀴즈 관련 설정 삭제
      localStorage.removeItem('quiz_access_time')
      localStorage.removeItem('quiz_count')
      localStorage.removeItem('quiz_source')
    } catch {
      // ignore
    }
    toast({
      title: lang === 'sw' ? 'Imefutwa' : '삭제 완료',
      description: lang === 'sw' ? 'Data ya mtumiaji imefutwa. Inaanzisha upya...' : '사용자 데이터가 삭제되었습니다. 새로고침합니다...',
      position: 'center',
    })
    window.setTimeout(() => window.location.reload(), 400)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl p-5 app-banner backdrop-blur">
        <div className="text-2xl font-extrabold text-white">{t('settingsTitle', lang)}</div>
        <div className="mt-1 text-sm font-semibold text-white/70">{t('settingsDesc', lang)}</div>
      </div>

      <div className="rounded-3xl p-5 app-card backdrop-blur">
        <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div>
            <div className="text-sm font-extrabold text-white">{t('showEnglishLabel', lang)}</div>
            <div className="text-xs font-semibold text-white/65">{t('showEnglishDesc', lang)}</div>
          </div>
          <input
            type="checkbox"
            checked={state.settings.showEnglish}
            onChange={(e) => dispatch({ type: 'settings', patch: { showEnglish: e.target.checked } })}
          />
        </label>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-sm font-extrabold text-white">{t('userModeLabel', lang)}</div>
          <div className="mt-3 flex gap-2">
            <Button
              variant={state.settings.meaningLang === 'sw' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => dispatch({ type: 'settings', patch: { meaningLang: 'sw' } })}
            >
              SW ({lang === 'sw' ? 'Kiingereza' : '영어'})
            </Button>
            <Button
              variant={state.settings.meaningLang === 'ko' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => dispatch({ type: 'settings', patch: { meaningLang: 'ko' } })}
            >
              KO ({lang === 'sw' ? 'Kikorea' : '한국어'})
            </Button>
          </div>
        </div>
      </div>

      {/* 광고 설정 */}
      <AdSettingsSection lang={lang} toast={toast} />

      <div className="rounded-3xl p-5 app-card backdrop-blur">
        <div className="text-base font-extrabold text-white">{t('dataTitle', lang)}</div>

        <div className="mt-4">
          <Button variant="danger" onClick={onUserDataWipe}>
            {lang === 'sw' ? 'Futa Data ya Mtumiaji' : '사용자 데이터 삭제'}
          </Button>
        </div>
      </div>

      {/* 개인정보처리방침 */}
      <div className="rounded-3xl p-5 app-card backdrop-blur">
        <div className="text-base font-extrabold text-white">
          {lang === 'sw' ? 'Sera ya Faragha' : '개인정보처리방침'}
        </div>
        <div className="mt-1 text-xs font-semibold text-white/65">
          {lang === 'sw' ? 'Soma sera yetu ya faragha' : '개인정보 수집 및 이용에 관한 안내'}
        </div>
        <div className="mt-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.open('https://k-kiswahili-words-59804.web.app/privacy', '_blank')}
          >
            {lang === 'sw' ? '📋 Sera ya Faragha' : '📋 개인정보처리방침 보기'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// 광고 설정 섹션 컴포넌트
function AdSettingsSection({ lang, toast }: { lang: Lang; toast: (opts: { title: string; description: string }) => void }) {
  const [loading, setLoading] = useState(false)
  const adType = getAdPersonalization()
  
  const adTypeLabel = {
    personalized: lang === 'sw' ? 'Tangazo Binafsi' : '개인화 광고',
    non_personalized: lang === 'sw' ? 'Tangazo Isiyo Binafsi' : '비개인화 광고',
    limited: lang === 'sw' ? 'Tangazo Mdogo' : '제한 광고',
  }[adType]

  const handleResetConsent = async () => {
    setLoading(true)
    try {
      await resetConsentAndShowForm()
      toast({
        title: lang === 'sw' ? 'Imefanikiwa' : '완료',
        description: lang === 'sw' ? 'Mipangilio ya idhini imesasishwa' : '동의 설정이 업데이트되었습니다',
      })
    } catch (error) {
      console.error('동의 리셋 실패:', error)
      toast({
        title: lang === 'sw' ? 'Hitilafu' : '오류',
        description: lang === 'sw' ? 'Imeshindwa kusasisha' : '업데이트에 실패했습니다',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-3xl p-5 app-card backdrop-blur">
      <div className="text-base font-extrabold text-white">
        {lang === 'sw' ? 'Mipangilio ya Tangazo' : '광고 설정'}
      </div>
      <div className="mt-1 text-xs font-semibold text-white/65">
        {lang === 'sw' ? 'GDPR/Idhini ya Faragha' : 'GDPR/개인정보 동의'}
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white/70">
              {lang === 'sw' ? 'Aina ya Tangazo' : '현재 광고 유형'}
            </div>
            <div className="text-sm font-extrabold text-white mt-1">
              {adTypeLabel}
            </div>
          </div>
          <div className={`px-2 py-1 rounded-lg text-xs font-bold ${
            adType === 'personalized' 
              ? 'bg-[rgb(var(--green))]/20 text-[rgb(var(--green))]' 
              : adType === 'non_personalized'
              ? 'bg-[rgb(var(--orange))]/20 text-[rgb(var(--orange))]'
              : 'bg-white/10 text-white/70'
          }`}>
            {adType === 'personalized' ? '✓' : adType === 'non_personalized' ? '○' : '—'}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleResetConsent}
          disabled={loading}
        >
          {loading 
            ? (lang === 'sw' ? 'Inapakia...' : '로딩 중...')
            : (lang === 'sw' ? 'Badilisha Idhini ya Tangazo' : '광고 동의 변경')
          }
        </Button>
        <div className="mt-2 text-xs text-white/50">
          {lang === 'sw' 
            ? 'Unaweza kubadilisha mipangilio ya idhini ya tangazo wakati wowote'
            : '광고 개인정보 동의 설정을 언제든지 변경할 수 있습니다'
          }
        </div>
      </div>
    </div>
  )
}


