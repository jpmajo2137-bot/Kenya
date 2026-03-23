/**
 * 특정 meaning_en의 영어 뜻 음성을 Google Cloud TTS로 재생성하여 DB에 업데이트
 * 표기는 EN_DISPLAY_OVERRIDE로 교정하고, 음성만 "올바른 텍스트"로 재생성할 때 사용
 *
 * 사용: npx tsx scripts/fix-meaning-en-audio.ts
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import textToSpeech from '@google-cloud/text-to-speech'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY!
const GCP_VOICE_EN = process.env.GCP_TTS_EN_VOICE || 'en-US-Wavenet-D'
const GCP_TTS_SPEED = 0.9

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const ttsClient = new textToSpeech.TextToSpeechClient()

/** 교정할 영어 뜻: DB의 meaning_en → 음성으로 읽을 텍스트 */
const MEANING_EN_TO_FIX: Record<string, string> = {
  flexible: 'to be flexible',
  congested: 'to be congested',
  'to congested': 'to be congested',
  'crowded; congested': 'to be crowded; to be congested',
  viable: 'to be viable',
  'to viable': 'to be viable',
  steady: 'to be steady',
  'to steady': 'to be steady',
  broadcast: 'to be broadcast',
  'to broadcast': 'to be broadcast',
  inappropriate: 'to be inappropriate',
  'to inappropriate': 'to be inappropriate',
  desirable: 'to be desirable',
  'to desirable': 'to be desirable',
  'to follow or stick to rules or standards': 'comply with',
  'to to follow or stick to rules or standards': 'comply with',
  'adhere; to follow or stick to rules or standards': 'comply with',
  'able to detect small changes': 'to be sensitive',
  'to able to detect small changes': 'to be sensitive',
  'logical; based on reason': 'to be logical',
  'to cover a surface with paint': 'paint',
  'to to cover a surface with paint': 'paint',
  'paint; to cover a surface with paint': 'paint',
  pass: 'to be eager',
  'to pass': 'to be eager',
  eager: 'to be eager', // 간절하다
  'to eager': 'to be eager',
  'relevant; closely connected to what is being discussed': 'to be relevant',
  'different from what is normal': 'to be different from what is normal',
  'to different from what is normal': 'to be different from what is normal',
  'unusual; different from what is normal': 'to be different from what is normal',
  worthwhile: 'to be worth',
  watch: 'to be depressing',
  'to watch': 'to be depressing',
  holy: 'to be sacred',
  'to holy': 'to be sacred',
  courteous: 'to be courteous',
  'to courteous': 'to be courteous',
  'polite; courteous': 'to be polite; to be courteous',
  'very beautiful': 'to be gorgeous',
  'to very beautiful': 'to be gorgeous',
  'gorgeous; very beautiful': 'to be gorgeous',
  inflict: 'hurt',
  'to inflict': 'hurt',
  beam: 'beam of light',
  membership: 'number of members',
  unpleasant: 'to be unpleasant',
  'to unpleasant': 'to be unpleasant',
  strict: 'to be strict',
  'to strict': 'to be strict',
  'harsh and unforgiving': 'to be harsh',
  'to harsh and unforgiving': 'to be harsh',
  'stark; harsh and unforgiving': 'to be harsh',
  unfair: 'to be unfair',
  'to unfair': 'to be unfair',
  'sustain; to maintain': 'to be sustained',
  'to sustain; to maintain': 'to be sustained',
  sustain: 'to be sustained',
  'to sustain': 'to be sustained',
  dynamic: 'to be dynamic',
  'dynamic; full of energy and activity': 'to be dynamic',
  distinctive: 'to be distinctive',
  'to distinctive': 'to be distinctive',
  'prominent; noticeable': 'to be distinctive',
  'to to restrain oneself': 'to restrain oneself',
  'to restrain oneself': 'to restrain oneself',
}

/** 단어로 직접 매칭 (meaning_en 정확히 모를 때) */
const MEANING_EN_TO_FIX_BY_WORD: Record<string, string> = {
  ngazi: 'stairs',
  두드러지다: 'to be distinctive',
}

function gcpLangCode(name: string) {
  const parts = name.split('-')
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : 'en-US'
}

async function ttsEn(text: string): Promise<ArrayBuffer> {
  const payload = {
    input: { text },
    voice: {
      languageCode: gcpLangCode(GCP_VOICE_EN),
      name: GCP_VOICE_EN,
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
  console.log(`영어 뜻 음성 교정 스크립트 (Google TTS - ${GCP_VOICE_EN})\n`)

  for (const [dbMeaningEn, ttsText] of Object.entries(MEANING_EN_TO_FIX)) {
    console.log(`🔍 meaning_en 검색: "${dbMeaningEn}" → 음성: "${ttsText}"`)

    const { data, error } = await supabase
      .from('generated_vocab')
      .select('id, mode, word, meaning_en, meaning_en_audio_url')
      .eq('meaning_en', dbMeaningEn)

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
      console.log(`  이전 URL: ${row.meaning_en_audio_url}`)

      try {
        const audio = await ttsEn(ttsText)
        const ts = Date.now()
        const path = `fix/${row.mode}/${row.id}_meaning_en_f_${ts}.mp3`
        const newUrl = await uploadAudio(path, audio)

        const { error: updateError } = await supabase
          .from('generated_vocab')
          .update({ meaning_en_audio_url: newUrl })
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

  // 단어 기준 교정
  for (const [word, ttsText] of Object.entries(MEANING_EN_TO_FIX_BY_WORD)) {
    console.log(`\n🔍 단어 검색: "${word}" → 음성: "${ttsText}"`)

    const { data, error } = await supabase
      .from('generated_vocab')
      .select('id, mode, word, meaning_en, meaning_en_audio_url')
      .eq('word', word)

    if (error) {
      console.error('❌ 조회 실패:', error.message)
      continue
    }

    if (!data || data.length === 0) {
      console.log('⏭️ DB에 없음, 건너뜀')
      continue
    }

    for (const row of data) {
      console.log(`  단어: ${row.word} (id=${row.id}, mode=${row.mode}) meaning_en: "${row.meaning_en}"`)
      console.log(`  이전 URL: ${row.meaning_en_audio_url}`)

      try {
        const audio = await ttsEn(ttsText)
        const ts = Date.now()
        const path = `fix/${row.mode}/${row.id}_meaning_en_f_${ts}.mp3`
        const newUrl = await uploadAudio(path, audio)

        const { error: updateError } = await supabase
          .from('generated_vocab')
          .update({ meaning_en_audio_url: newUrl })
          .eq('id', row.id)

        if (updateError) {
          console.error(`  ❌ 업데이트 실패: ${updateError.message}`)
        } else {
          console.log(`  ✅ 교정 완료: ${newUrl}`)
        }
      } catch (e) {
        console.error(`  ❌ TTS 실패: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  console.log('\n완료.')
}

main()
