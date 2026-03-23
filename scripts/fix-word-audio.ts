/**
 * 특정 단어의 음성을 Google Cloud TTS (여성)로 재생성하여 DB에 업데이트
 * 단어 표시가 교정된 경우 교정된 텍스트로 음성 생성
 *
 * 사용: npx tsx scripts/fix-word-audio.ts
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import textToSpeech from '@google-cloud/text-to-speech'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY!
const GCP_VOICE_KO = 'ko-KR-Wavenet-B' // 여성 음성
const GCP_TTS_SPEED = 0.85

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const ttsClient = new textToSpeech.TextToSpeechClient()

/** SSML 사용 단어 (의→에 축약 방지 등): DB의 word → SSML */
const WORDS_TO_FIX_SSML: Record<string, string> = {
  구식이다: '<speak>구식<break time="30ms"/>으이</speak>',
  지적이다: '<speak>지<break time="15ms"/>적이다</speak>',
  예비: '<speak>예비<break time="25ms"/>으이</speak>',
  씁쓸하다: '<speak>씁쓸<break time="25ms"/>하다</speak>',
}

/** 교정할 단어 목록: DB의 word → 음성으로 읽을 텍스트 */
const WORDS_TO_FIX: Record<string, string> = {
  '방과 후 남기': '방과 후',
  사소하다: '사소한',
  부정적이다: '부정적인',
  광범위하다: '광범위한',
  노골적이다: '노골적인',
  감상: '감상하다',
  현대적이다: '현대적인',
  역사적이다: '역사적인',
  차갑다: '차가운',
  구식이다: '구식의',
  실용적이다: '실용적인',
  합리적이다: '합리적인',
  우세: '우세하다',
  '결단력 있는': '결단력 있는',
  교통수단: '교통수단',
  과도하다: '과도한',
  매력적이다: '매력적인',
  끝없는: '끝없는',
  끝없다: '끝없는',
  생생하다: '생생한',
  상징적이다: '상징적인',
  대략적이다: '대략적인',
  자치: '자치권',
  '감히 말하다': '감히 말하다',
  크리스털: '크리스탈',
  배출: '배출가스',
  떠오르다: '떠오르다',
  예비: '예비의', // SSML 사용
  지적이다: '지적이다',
  현실적이다: '현실적인',
  인공적이다: '인공적인',
  어이없다: '어이없는',
  '-(으)ㄹ 거예요': '거예요',
  씁쓸하다: '씁쓸하다', // SSML 사용
  결정적이다: '결정적인',
  간접적이다: '간접적인',
  낙관적이다: '낙관적인',
  엄청나다: '엄청난',
  구체적이다: '구체적인',
  입히다: '상처를 입히다',
  끈질기다: '끈질긴',
  두드러지다: '두드러진',
  연극적이다: '연극적인',
  신고하다: '신고하다',
  잦다: '잦은',
  맹인: '시각장애인, 맹인',
}

async function ttsKo(textOrSsml: string, useSsml = false): Promise<ArrayBuffer> {
  const payload = {
    input: useSsml ? { ssml: textOrSsml } : { text: textOrSsml },
    voice: {
      languageCode: 'ko-KR',
      name: GCP_VOICE_KO,
      ssmlGender: 'FEMALE' as const,
    },
    audioConfig: {
      audioEncoding: 'MP3' as const,
      speakingRate: GCP_TTS_SPEED,
    },
  }
  const [response] = await ttsClient.synthesizeSpeech(payload)
  if (!response.audioContent) throw new Error('No audioContent')
  return response.audioContent as ArrayBuffer
}

async function uploadAudio(path: string, audio: ArrayBuffer): Promise<string> {
  const blob = new Blob([audio], { type: 'audio/mpeg' })
  const { data, error } = await supabase.storage.from('vocabaudio').upload(path, blob, {
    contentType: 'audio/mpeg',
    upsert: true,
  })
  if (error) throw error
  const { data: urlData } = supabase.storage.from('vocabaudio').getPublicUrl(data.path)
  return urlData.publicUrl
}

async function main() {
  console.log(`단어 음성 교정 스크립트 (Google TTS - ${GCP_VOICE_KO} 여성)\n`)

  const allWords = { ...WORDS_TO_FIX }
  for (const [dbWord, spokenText] of Object.entries(allWords)) {
    const useSsml = dbWord in WORDS_TO_FIX_SSML
    const ttsInput = useSsml ? WORDS_TO_FIX_SSML[dbWord] : spokenText
    console.log(`🔍 단어 검색: "${dbWord}" → 음성: ${useSsml ? `[SSML]` : `"${spokenText}"`}`)

    const { data, error } = await supabase
      .from('generated_vocab')
      .select('id, mode, word, word_audio_url')
      .eq('word', dbWord)

    if (error) {
      console.error('❌ 조회 실패:', error.message)
      continue
    }
    if (!data || data.length === 0) {
      console.log('⏭️ DB에 없음, 건너뜀\n')
      continue
    }

    for (const row of data) {
      console.log(`  id=${row.id}, mode=${row.mode}`)
      console.log(`  이전 URL: ${row.word_audio_url}`)

      try {
        const audio = await ttsKo(ttsInput, useSsml)
        const ts = Date.now()
        const path = `fix/${row.mode}/${row.id}_word_f_${ts}.mp3`
        const newUrl = await uploadAudio(path, audio)

        const { error: updateError } = await supabase
          .from('generated_vocab')
          .update({ word_audio_url: newUrl })
          .eq('id', row.id)

        if (updateError) {
          console.error(`  ❌ 업데이트 실패: ${updateError.message}`)
        } else {
          console.log(`  ✅ 교정 완료: ${newUrl}`)
        }
      } catch (e) {
        console.error(`  ❌ TTS 실패: ${e instanceof Error ? e.message : String(e)}`)
      }
      console.log('')
    }
  }

  console.log('완료.')
}

main()
