/**
 * 스와힐리어 단어의 음성을 Google Cloud TTS (스와힐리어)로 재생성하여 DB에 업데이트
 * 기존에 OpenAI nova(영어) 보이스로 생성된 스와힐리어 단어 음성을 교정
 *
 * 사용: npx tsx scripts/fix-sw-word-audio.ts
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import textToSpeech from '@google-cloud/text-to-speech'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY!
const GCP_VOICE_SW = process.env.GCP_TTS_SW_VOICE || 'sw-TZ-Standard-A'
const GCP_TTS_SPEED = 0.9

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const ttsClient = new textToSpeech.TextToSpeechClient()

/** 교정할 스와힐리어 단어 목록: DB의 word → 음성으로 읽을 텍스트 */
const SW_WORDS_TO_FIX: Record<string, string> = {
  moja: 'moja',
  nane: 'nane',
  'kumi na mbili': 'kumi na mbili',
  'kumi na tatu': 'kumi na tatu',
  'kumi na tano': 'kumi na tano',
  ishirini: 'ishirini',
  'ishirini na moja': 'ishirini na moja',
  'ishirini na tatu': 'ishirini na tatu',
  'arobaini na moja': 'arobaini na moja',
  'arobaini na mbili': 'arobaini na mbili',
  'arobaini na sita': 'arobaini na sita',
}

/** 교정할 스와힐리어 예문 목록: DB의 example → 음성으로 읽을 텍스트 */
const SW_EXAMPLES_TO_FIX: Record<string, string> = {
  'Ninahitaji mayai matatu.': 'Ninahitaji mayai matatu.',
  'Nimekaa hapa kwa siku saba.': 'Nimekaa hapa kwa siku saba.',
  'Tuna dakika kumi na tano kabla ya kuanza.': 'Tuna dakika kumi na tano kabla ya kuanza.',
  'Basi lina viti kumi na tisa.': 'Basi lina viti kumi na tisa.',
  'Nina miaka ishirini.': 'Nina miaka ishirini.',
  'Hoteli ina vyumba ishirini na nne.': 'Hoteli ina vyumba ishirini na nne.',
  'Kikapu kina machungwa ishirini na tano.': 'Kikapu kina machungwa ishirini na tano.',
  'Nina dakika thelathini tu.': 'Nina dakika thelathini tu.',
  'Kuna wanafunzi arobaini na mbili darasani.': 'Kuna wanafunzi arobaini na mbili darasani.',
  'Tulinunua mayai arobaini na tatu.': 'Tulinunua mayai arobaini na tatu.',
  'Tulipokea barua arobaini na nane wiki hii.': 'Tulipokea barua arobaini na nane wiki hii.',
}

async function ttsSw(text: string): Promise<ArrayBuffer> {
  const langCode = GCP_VOICE_SW.split('-').slice(0, 2).join('-')
  const payload = {
    input: { text },
    voice: {
      languageCode: langCode,
      name: GCP_VOICE_SW,
    },
    audioConfig: {
      audioEncoding: 'MP3' as const,
      speakingRate: GCP_TTS_SPEED,
    },
  }

  try {
    const [response] = await ttsClient.synthesizeSpeech(payload)
    if (!response.audioContent) throw new Error('No audioContent')
    return response.audioContent as ArrayBuffer
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('does not exist')) {
      console.log(`  ⚠️ 음성 "${GCP_VOICE_SW}" 미지원 → 여성 음성(ssmlGender)으로 재시도`)
      const [response] = await ttsClient.synthesizeSpeech({
        ...payload,
        voice: { languageCode: langCode, ssmlGender: 'FEMALE' as const },
      })
      if (!response.audioContent) throw new Error('No audioContent (fallback)')
      return response.audioContent as ArrayBuffer
    }
    throw e
  }
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
  console.log(`스와힐리어 단어 음성 교정 (Google TTS - ${GCP_VOICE_SW})\n`)

  for (const [dbWord, spokenText] of Object.entries(SW_WORDS_TO_FIX)) {
    console.log(`🔍 단어 검색: "${dbWord}" → 음성: "${spokenText}"`)

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
        const audio = await ttsSw(spokenText)
        const ts = Date.now()
        const path = `fix/${row.mode}/${row.id}_word_sw_${ts}.mp3`
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

  // 예문 음성 교정
  for (const [dbExample, spokenText] of Object.entries(SW_EXAMPLES_TO_FIX)) {
    console.log(`🔍 예문 검색: "${dbExample}" → 음성: "${spokenText}"`)

    const { data, error } = await supabase
      .from('generated_vocab')
      .select('id, mode, example, example_audio_url')
      .eq('example', dbExample)

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
      console.log(`  이전 URL: ${row.example_audio_url}`)

      try {
        const audio = await ttsSw(spokenText)
        const ts = Date.now()
        const path = `fix/${row.mode}/${row.id}_example_sw_${ts}.mp3`
        const newUrl = await uploadAudio(path, audio)

        const { error: updateError } = await supabase
          .from('generated_vocab')
          .update({ example_audio_url: newUrl })
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
