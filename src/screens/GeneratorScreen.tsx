import { useState } from 'react'
import { Button } from '../components/Button'
import { generateAndSaveVocabulary, getVocabStats, type GenerationStatus } from '../lib/vocabGenerator'
import type { VocabMode } from '../lib/supabase'
import type { Lang } from '../lib/i18n'

export function GeneratorScreen({ lang }: { lang: Lang }) {
  const [mode, setMode] = useState<VocabMode>('ko')
  const [count, setCount] = useState(100)
  const [withAudio, setWithAudio] = useState(false)
  const [status, setStatus] = useState<GenerationStatus | null>(null)
  const [stats, setStats] = useState<{ sw: number; ko: number; total: number } | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  const loadStats = async () => {
    try {
      const s = await getVocabStats()
      setStats(s)
    } catch (e) {
      console.error('Failed to load stats:', e)
    }
  }

  const startGeneration = async () => {
    if (isRunning) return
    setIsRunning(true)
    setStatus(null)

    try {
      await generateAndSaveVocabulary({
        mode,
        totalCount: count,
        withAudio,
        onProgress: (s) => setStatus({ ...s }),
      })
      await loadStats()
    } catch (e) {
      console.error('Generation failed:', e)
      setStatus((prev) => prev ? { ...prev, phase: 'error', errors: [...prev.errors, String(e)] } : null)
    } finally {
      setIsRunning(false)
    }
  }

  const modeLabel = lang === 'sw'
    ? { sw: 'Kiswahili → Kikorea', ko: 'Kikorea → Kiswahili' }
    : { sw: '스와힐리어→한국어', ko: '한국어→스와힐리어' }

  const phaseLabel: Record<string, string> = lang === 'sw'
    ? { generating: 'Inatengeneza...', audio: 'Sauti...', saving: 'Inahifadhi...', complete: 'Imekamilika!', error: 'Kosa!' }
    : { generating: '단어 생성 중...', audio: '음성 생성 중...', saving: '저장 중...', complete: '완료!', error: '오류!' }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl p-5 app-banner backdrop-blur">
        <div className="text-2xl font-extrabold text-white">
          {lang === 'sw' ? 'Kizazi cha Maneno' : 'AI 단어 생성기'}
        </div>
        <div className="mt-1 text-sm font-semibold text-white/70">
          {lang === 'sw'
            ? 'Tengeneza maneno kwa OpenAI na uhifadhi kwenye Supabase'
            : 'OpenAI로 단어를 생성하고 Supabase에 저장합니다'}
        </div>
      </div>

      {/* 통계 */}
      <div className="rounded-3xl p-5 app-card backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="text-lg font-extrabold text-white">
            {lang === 'sw' ? 'Takwimu' : '현재 통계'}
          </div>
          <Button variant="secondary" size="sm" onClick={loadStats}>
            {lang === 'sw' ? 'Sasisha' : '새로고침'}
          </Button>
        </div>
        {stats ? (
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-white/5 p-3 text-center">
              <div className="text-2xl font-extrabold text-[rgb(var(--green))]">{stats.ko}</div>
              <div className="text-xs font-semibold text-white/60">KO 모드</div>
            </div>
            <div className="rounded-2xl bg-white/5 p-3 text-center">
              <div className="text-2xl font-extrabold text-[rgb(var(--purple))]">{stats.sw}</div>
              <div className="text-xs font-semibold text-white/60">SW 모드</div>
            </div>
            <div className="rounded-2xl bg-white/5 p-3 text-center">
              <div className="text-2xl font-extrabold text-white">{stats.total}</div>
              <div className="text-xs font-semibold text-white/60">{lang === 'sw' ? 'Jumla' : '전체'}</div>
            </div>
          </div>
        ) : (
          <div className="mt-3 text-sm text-white/50">
            {lang === 'sw' ? 'Bonyeza "Sasisha" kupakia takwimu' : '"새로고침"을 눌러 통계를 불러오세요'}
          </div>
        )}
      </div>

      {/* 생성 설정 */}
      <div className="rounded-3xl p-5 app-card backdrop-blur">
        <div className="text-lg font-extrabold text-white">
          {lang === 'sw' ? 'Mipangilio ya Kizazi' : '생성 설정'}
        </div>

        <div className="mt-4 space-y-4">
          {/* 모드 선택 */}
          <div>
            <div className="text-sm font-semibold text-white/70 mb-2">
              {lang === 'sw' ? 'Hali' : '모드'}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                className={`rounded-2xl p-3 text-center font-bold transition ${
                  mode === 'ko'
                    ? 'bg-[rgb(var(--green))] text-slate-950'
                    : 'bg-white/10 text-white hover:bg-white/15'
                }`}
                onClick={() => setMode('ko')}
              >
                {modeLabel.ko}
              </button>
              <button
                className={`rounded-2xl p-3 text-center font-bold transition ${
                  mode === 'sw'
                    ? 'bg-[rgb(var(--purple))] text-white'
                    : 'bg-white/10 text-white hover:bg-white/15'
                }`}
                onClick={() => setMode('sw')}
              >
                {modeLabel.sw}
              </button>
            </div>
          </div>

          {/* 생성 개수 */}
          <div>
            <div className="text-sm font-semibold text-white/70 mb-2">
              {lang === 'sw' ? 'Idadi ya Maneno' : '생성 개수'}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[100, 500, 1000, 8000].map((n) => (
                <button
                  key={n}
                  className={`rounded-2xl p-3 text-center font-bold transition ${
                    count === n
                      ? 'bg-[rgb(var(--green))] text-slate-950'
                      : 'bg-white/10 text-white hover:bg-white/15'
                  }`}
                  onClick={() => setCount(n)}
                >
                  {n.toLocaleString()}
                </button>
              ))}
            </div>
            {count >= 1000 && (
              <div className="mt-2 text-xs text-[rgb(var(--orange))]">
                ⚠️ {lang === 'sw' ? 'Maneno mengi yatachukua muda mrefu na gharama kubwa' : '많은 단어는 시간과 API 비용이 많이 듭니다'}
              </div>
            )}
          </div>

          {/* 음성 생성 */}
          <label className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
            <input
              type="checkbox"
              checked={withAudio}
              onChange={(e) => setWithAudio(e.target.checked)}
              className="h-5 w-5"
            />
            <div>
              <div className="text-sm font-extrabold text-white">
                {lang === 'sw' ? 'Tengeneza Sauti (TTS)' : '음성 생성 (TTS)'}
              </div>
              <div className="text-xs text-white/60">
                {lang === 'sw' ? 'Itachukua muda mrefu zaidi' : '시간이 더 오래 걸립니다 (단어당 ~4초)'}
              </div>
            </div>
          </label>
        </div>

        {/* 시작 버튼 */}
        <div className="mt-5">
          <Button
            variant="success"
            className="w-full h-14 text-xl font-extrabold"
            onClick={startGeneration}
            disabled={isRunning}
          >
            {isRunning
              ? (lang === 'sw' ? 'Inafanya kazi...' : '진행 중...')
              : (lang === 'sw' ? '▶ Anza Kizazi' : '▶ 생성 시작')}
          </Button>
        </div>

        {/* 예상 시간/비용 */}
        <div className="mt-3 text-center text-xs text-white/50">
          {lang === 'sw' ? 'Muda unaokadiriwa' : '예상 시간'}: ~{Math.ceil(count / 10 * (withAudio ? 5 : 1))} {lang === 'sw' ? 'sekunde' : '초'} | 
          {lang === 'sw' ? 'Gharama' : '예상 비용'}: ~${(count * 0.001 * (withAudio ? 2 : 1)).toFixed(2)}
        </div>
      </div>

      {/* 진행 상태 */}
      {status && (
        <div className="rounded-3xl p-5 app-card backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="text-lg font-extrabold text-white">
              {phaseLabel[status.phase] || status.phase}
            </div>
            <div className="text-sm font-semibold text-white/70">
              {status.completed} / {status.total}
            </div>
          </div>

          {/* 프로그레스 바 */}
          <div className="mt-3 h-3 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                status.phase === 'complete'
                  ? 'bg-[rgb(var(--green))]'
                  : status.phase === 'error'
                    ? 'bg-[rgb(var(--orange))]'
                    : 'bg-[rgb(var(--purple))]'
              }`}
              style={{ width: `${(status.completed / status.total) * 100}%` }}
            />
          </div>

          {status.current && (
            <div className="mt-2 text-sm text-white/60">{status.current}</div>
          )}

          {/* 에러 목록 */}
          {status.errors.length > 0 && (
            <div className="mt-3 max-h-32 overflow-auto rounded-2xl bg-[rgb(var(--orange))]/10 p-3">
              <div className="text-sm font-semibold text-[rgb(var(--orange))]">
                {lang === 'sw' ? 'Makosa' : '오류'} ({status.errors.length})
              </div>
              {status.errors.slice(-5).map((e, i) => (
                <div key={i} className="text-xs text-white/60 mt-1 truncate">{e}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}





