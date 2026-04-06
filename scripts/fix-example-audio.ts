/**
 * 특정 예문의 음성을 Google Cloud TTS (여성)로 재생성하여 DB에 업데이트
 * 의문문 억양 → 평서문 억양 교정
 *
 * 사용: npx tsx scripts/fix-example-audio.ts
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import textToSpeech from '@google-cloud/text-to-speech'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY!

// 여성 음성 강제 지정 (ko-KR-Wavenet-B = FEMALE)
const GCP_VOICE_KO = 'ko-KR-Wavenet-B'
const GCP_TTS_SPEED = 0.85

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const ttsClient = new textToSpeech.TextToSpeechClient()

/** 교정할 예문 목록: { db, tts, ssml? (있으면 tts 대신 SSML 사용), pronunciation? (있으면 example_pronunciation 동시 갱신) } */
const EXAMPLES_TO_FIX: Array<{ db: string; tts: string; ssml?: string; pronunciation?: string }> = [
  {
    db: '요즘 기름값이 급등했어요.',
    tts: '요즘 기름갑씨 급등했어요.',
    pronunciation: 'yojeun gireumgabssi geupdeunghaesseoyo.',
  },
  /** ~에 있어요. 종결을 평서문에 가깝게 (의문형 상승 완화) */
  {
    db: '정류장은 언덕 아래쪽에 있어요.',
    tts: '정류장은 언덕 아래쪽에 있어요.',
    ssml:
      '<speak>정류장은 언덕 아래쪽에 <prosody pitch="-1st" rate="96%">있어요</prosody>.<break time="80ms"/></speak>',
  },
  {
    db: '참가자가 스물하나 명이에요.',
    tts: '참가자가 스물한 명이에요.',
    pronunciation: 'chamgajaga seumulhan myeongieyo.',
  },
  { db: '이 작품은 분위기가 정말 좋아요.', tts: '이 작품은 분위기가 정말 좋아요.' },
  { db: '주차 위반으로 벌금을 냈어요.', tts: '주차 위반으로 벌금을 냈어요.' },
  { db: '이 잔은 크리스털로 만들었어요.', tts: '이 잔은 크리스탈로 만들었어요.' },
  { db: '오늘 제 임무는 자료 정리예요.', tts: '오늘 제 임무는 자료 정리예요.' },
  { db: '그는 지적이고 차분한 사람이에요.', tts: '그는 지적이고 차분한 사람이에요.' },
  { db: '오늘 영화제 개막식에 가요.', tts: '오늘 영화제 개막식에 가요.' },
  { db: '여가 시간에는 책을 읽어요.', tts: '여가 시간에는 책을 읽어요.' },
  { db: '오늘은 조수가 높아서 바다가 더 가까워 보여요.', tts: '오늘은 조수가 높아서 바다가 더 가까워 보여요.' },
  {
    db: '우리 반 슬로건은 \u201c서로 존중\u201d이에요.',
    tts: '우리 반 슬로건은 서로 존중 이에요.',
    ssml: '<speak>우리 반 슬로건은 서로 존중<break time="25ms"/>이에요.</speak>',
  },
  { db: '우리 반은 단합이 잘 돼요.', tts: '우리 반은 단합이 잘 돼요.' },
  {
    db: '휴대폰 화면에 얇은 막이 생겼어요.',
    tts: '휴대폰 화면에 얇은 막이 생겼어요.',
    ssml: '<speak>휴대폰 화면에 얇<break time="20ms"/>은 막이 생겼어요.</speak>',
  },
  { db: '이 에어컨은 전기 효율이 좋아요.', tts: '이 에어컨은 전기 효율이 좋아요.' },
  { db: '오른쪽 차선으로 가세요.', tts: '오른쪽 차선으로 가세요.' },
  { db: '민간의 차량은 이 길로 들어올 수 없어요.', tts: '민간의 차량은 이 길로 들어올 수 없어요.' },
  { db: '총리가 오늘 기자회견을 했어요.', tts: '총리가 오늘 기자회견을 했어요.' },
  { db: '우리 팀이 전국 선수권 대회에 나가요.', tts: '우리 팀이 전국 선수권 대회에 나가요.' },
  {
    db: '좋은 교육자는 학생을 잘 들어요.',
    tts: '좋은 교육자는 학생 말을 잘 들어요.',
  },
  {
    db: '이 주스는 과일이 혼합된 맛이에요.',
    tts: '이 주스는 과일이 혼합된 맛이에요.',
    ssml: '<speak>이 주스는 과일이 혼합된 맛<break time="25ms"/>이에요.</speak>',
  },
  { db: '한국에서 일한 경험이 있어요.', tts: '한국에서 일한 경험이 있어요.' },
  { db: '회사 설비가 오래돼서 자주 고장 나요.', tts: '회사 설비가 오래돼서 자주 고장 나요.' },
  { db: '저는 또래 친구들이 많아요.', tts: '저는 또래 친구들이 많아요.' },
  { db: '그건 정당한 이유가 아니에요.', tts: '그건 정당한 이유가 아니에요.' },
  { db: '이 설문은 익명으로 진행돼요.', tts: '이 설문은 익명으로 진행돼요.' },
  { db: '지갑을 잃어버려서 경찰에 신고했어요.', tts: '지갑을 잃어버려서 경찰에 신고했어요.' },
  {
    db: '이 꽃은 인공의 꽃이라서 향이 없어요.',
    tts: '이 꽃은 인공의 꽃이라서 향이 없어요.',
    ssml: '<speak>이 꽃은 인공의 꽃<break time="25ms"/>이라서 향이 없어요.</speak>',
  },
  { db: '의사 말로는 급성의 위염이래요.', tts: '의사 말로는 급성 위염이래요.' },
  { db: '사과를 일 개 샀어요.', tts: '저는 지하철 일 번 출구에서 기다릴게요.' },
  { db: '책을 이 권 빌렸어요.', tts: '우리 집은 이 층에 있어요.' },
  { db: '친구가 삼 명 왔어요.', tts: '저는 삼 일 동안 제주도에 있었어요.' },
  { db: '의자가 사 개 있어요.', tts: '사 월에는 꽃이 많이 펴요.' },
  { db: '학생이 육 명 있어요.', tts: '그는 육 개월 동안 한국어를 공부했어요.' },
  { db: '오 분만 기다려 주세요.', tts: '오 분만 기다려 주세요.' },
  { db: '칠 시에 만나요.', tts: '우리 아파트는 칠 층에 있어요.' },
  { db: '문제가 십 개예요.', tts: '회의는 십 분 후에 시작해요.' },
  { db: '저는 열한 시에 일어나요.', tts: '제 생일은 십일 월 십일 일이에요.' },
  { db: '우리는 열두 명이에요.', tts: '우리 사무실은 십이 층에 있어요.' },
  { db: '버스가 14번이에요.', tts: '버스가 십사번이에요.' },
  { db: '사과를 15개 샀어요.', tts: '회의는 십오 분 후에 시작해요.' },
  { db: '교실에 의자가 16개 있어요.', tts: '우리 집은 십육 층에 있어요.' },
  { db: '저는 17살이에요.', tts: '저는 십칠 번 좌석에 앉았어요.' },
  { db: '책을 19권 읽었어요.', tts: '우리 집은 십구 층에 있어요.' },
  { db: '저는 스무 살이에요.', tts: '회의는 이십 분 후에 시작해요.' },
  { db: '저는 스무두 살이에요.', tts: '우리 사무실은 이십이 층에 있어요.' },
  { db: '저는 스물둘 살이에요.', tts: '우리 사무실은 이십이 층에 있어요.' },
  { db: '책을 22권 읽었어요.', tts: '우리 사무실은 이십이 층에 있어요.' },
  { db: '저는 22살이에요.', tts: '우리 사무실은 이십이 층에 있어요.' },
  { db: '참가자는 모두 22명이에요.', tts: '우리 사무실은 이십이 층에 있어요.' },
  { db: '저는 23살이에요.', tts: '제 번호표는 이십삼 번이에요.' },
  { db: '하루는 24시간이에요.', tts: '오늘은 이십사 페이지까지 읽었어요.' },
  { db: '저는 스물여섯 살이에요.', tts: '이 엘리베이터는 이십육 층까지 가요.' },
  { db: '버스는 29번을 타세요.', tts: '버스는 이십구번을 타세요.' },
  { db: '연필이 열하나 자루 있어요.', tts: '연필이 열한 자루 있어요.' },
  { db: '사과를 스물 개 샀어요.', tts: '사과를 스무 개 샀어요.' },
  { db: '8월에는 날씨가 정말 더워요.', tts: '8월에는 날씨가 아주 더워요.' },
]

function gcpLangCode(name: string) {
  const parts = name.split('-')
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : 'en-US'
}

async function ttsKo(textOrSsml: string, useSsml = false): Promise<ArrayBuffer> {
  const langCode = gcpLangCode(GCP_VOICE_KO)

  const payload = {
    input: useSsml ? { ssml: textOrSsml } : { text: textOrSsml },
    voice: {
      languageCode: langCode,
      name: GCP_VOICE_KO,
      ssmlGender: 'FEMALE' as const,
    },
    audioConfig: {
      audioEncoding: 'MP3' as const,
      speakingRate: GCP_TTS_SPEED,
    },
  }

  const [response] = await ttsClient.synthesizeSpeech(payload)
  if (!response.audioContent) throw new Error('No audioContent from Google TTS')
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
  console.log(`예문 음성 교정 스크립트 (Google TTS - ${GCP_VOICE_KO} 여성)\n`)

  for (const { db: dbText, tts: ttsText, ssml, pronunciation } of EXAMPLES_TO_FIX) {
    const useSsml = !!ssml
    console.log(`🔍 예문 검색: "${dbText}" → 음성: ${useSsml ? '[SSML]' : `"${ttsText}"`}${pronunciation ? ` → 발음: [${pronunciation}]` : ''}`)

    const { data, error } = await supabase
      .from('generated_vocab')
      .select('id, mode, word, example, example_audio_url, example_translation_ko')
      .eq('example', dbText)

    if (error) {
      console.error('❌ 조회 실패:', error.message)
      continue
    }

    if (!data || data.length === 0) {
      console.log('⏭️ DB에 없음, 건너뜀\n')
      continue
    }

    for (const row of data) {
      console.log(`  단어: ${row.word} (id=${row.id}, mode=${row.mode})`)
      console.log(`  이전 URL: ${row.example_audio_url}`)

      try {
        const audio = await ttsKo(useSsml ? ssml! : ttsText, useSsml)
        // 타임스탬프 포함 경로 (CDN 캐시 우회)
        const ts = Date.now()
        const path = `fix/${row.mode}/${row.id}_example_f_${ts}.mp3`
        const newUrl = await uploadAudio(path, audio)

        const patch: {
          example_audio_url: string
          example?: string
          example_pronunciation?: string
          example_translation_ko?: string
        } = { example_audio_url: newUrl }
        if (pronunciation !== undefined) patch.example_pronunciation = pronunciation
        if (ttsText !== dbText) {
          patch.example = ttsText
          const ko = row.example_translation_ko?.trim()
          if (ko === dbText.trim()) patch.example_translation_ko = ttsText
        }

        const { error: updateError } = await supabase.from('generated_vocab').update(patch).eq('id', row.id)

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
