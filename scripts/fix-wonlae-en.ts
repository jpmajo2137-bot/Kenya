/**
 * "원래" 단어의 meaning_en을 "originally"로 교정 + 여자 목소리 TTS 재생성
 * 모든 모드(sw, ko) 적용
 *
 * 사용: npx tsx scripts/fix-wonlae-en.ts
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import textToSpeech from '@google-cloud/text-to-speech'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY!
const GCP_VOICE_EN_FEMALE = 'en-US-Wavenet-F'
const GCP_TTS_SPEED = 0.9

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const ttsClient = new textToSpeech.TextToSpeechClient()

async function ttsEn(text: string): Promise<ArrayBuffer> {
  const [response] = await ttsClient.synthesizeSpeech({
    input: { text },
    voice: {
      languageCode: 'en-US',
      name: GCP_VOICE_EN_FEMALE,
    },
    audioConfig: {
      audioEncoding: 'MP3' as const,
      speakingRate: GCP_TTS_SPEED,
    },
  })
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

const FIXES: { word: string; newMeaningEn: string; ttsText: string }[] = [
  { word: '유효하다', newMeaningEn: 'be valid', ttsText: 'be valid' },
  { word: '결심하다', newMeaningEn: 'decide', ttsText: 'decide' },
  { word: '영화감독', newMeaningEn: 'film-maker', ttsText: 'filmmaker' },
  { word: '엄격한', newMeaningEn: 'strict', ttsText: 'strict' },
  {
    word: '협회',
    newMeaningEn: 'association; an organization, group',
    ttsText: 'association; an organization, group',
  },
  {
    word: '환승',
    newMeaningEn: 'transit transfer; changing lines, vehicles',
    ttsText: 'transit transfer; changing lines, vehicles',
  },
  { word: '친절하다', newMeaningEn: 'be kind', ttsText: 'be kind' },
  { word: '자연스럽게', newMeaningEn: 'naturally', ttsText: 'naturally' },
  { word: '배치', newMeaningEn: 'deployment; arranging', ttsText: 'deployment; arranging' },
  { word: '감상', newMeaningEn: 'appreciate', ttsText: 'appreciate' },
  { word: '가하다', newMeaningEn: 'inflict', ttsText: 'inflict' },
  { word: '사소하다', newMeaningEn: 'trivial', ttsText: 'trivial' },
  { word: '방과 후 남기', newMeaningEn: 'after school', ttsText: 'after school' },
  { word: '작품', newMeaningEn: 'composition, work', ttsText: 'composition, work' },
  { word: '균열', newMeaningEn: 'split, crack', ttsText: 'split, crack' },
  {
    word: '사생활',
    newMeaningEn: 'privacy, private life',
    ttsText: 'privacy, private life',
  },
  {
    word: '개념',
    newMeaningEn: 'conception, concept',
    ttsText: 'conception, concept',
  },
  { word: '유머러스하다', newMeaningEn: 'be humorous', ttsText: 'be humorous' },
  { word: '단련하다', newMeaningEn: 'strengthen, build', ttsText: 'strengthen, build' },
  { word: '짐작하다', newMeaningEn: 'guess', ttsText: 'guess' },
  { word: '혼잡하다', newMeaningEn: 'be crowded; be congested', ttsText: 'be crowded; be congested' },
  { word: '수확량', newMeaningEn: 'yield', ttsText: 'yield' },
  { word: '칵테일', newMeaningEn: 'cocktail', ttsText: 'cocktail' },
  { word: '높다', newMeaningEn: 'be high', ttsText: 'be high' },
  { word: '실행 가능하다', newMeaningEn: 'be viable', ttsText: 'be viable' },
  { word: '꾸준하다', newMeaningEn: 'be steady', ttsText: 'be steady' },
  { word: '둘째로', newMeaningEn: 'secondly', ttsText: 'secondly' },
  { word: '위임하다', newMeaningEn: 'delegate', ttsText: 'delegate' },
  { word: '두드러지다', newMeaningEn: 'distinctive', ttsText: 'distinctive' },
  { word: '날다', newMeaningEn: 'fly', ttsText: 'fly' },
  { word: '신성하다', newMeaningEn: 'be sacred', ttsText: 'be sacred' },
  { word: '공손하다', newMeaningEn: 'be polite', ttsText: 'be polite' },
  { word: '엄격하다', newMeaningEn: 'be strict', ttsText: 'be strict' },
  { word: '인플레이션', newMeaningEn: 'inflation', ttsText: 'inflation' },
]

const MEANING_FIXES: { meaningEn: string; ttsText: string }[] = []

async function main() {
  for (const fix of FIXES) {
    console.log(`"${fix.word}" meaning_en → "${fix.newMeaningEn}" 교정 + 여자 목소리 TTS\n`)

    const { data, error } = await supabase
      .from('generated_vocab')
      .select('id, mode, word, meaning_en, meaning_en_audio_url')
      .eq('word', fix.word)

    if (error) {
      console.error('DB 조회 실패:', error.message)
      continue
    }

    if (!data || data.length === 0) {
      console.log(`DB에 "${fix.word}" 단어 없음\n`)
      continue
    }

    console.log(`${data.length}개 행 발견\n`)

    const audio = await ttsEn(fix.ttsText)
    console.log(`TTS 생성 완료 (${GCP_VOICE_EN_FEMALE}, "${fix.ttsText}")\n`)

    for (const row of data) {
      console.log(`  [${row.mode}] id=${row.id}, meaning_en="${row.meaning_en}"`)

      const ts = Date.now()
      const path = `fix/${row.mode}/${row.id}_meaning_en_f_${ts}.mp3`
      const newUrl = await uploadAudio(path, audio)

      const { error: updateError } = await supabase
        .from('generated_vocab')
        .update({
          meaning_en: fix.newMeaningEn,
          meaning_en_audio_url: newUrl,
        })
        .eq('id', row.id)

      if (updateError) {
        console.error(`  DB 업데이트 실패: ${updateError.message}`)
      } else {
        console.log(`  meaning_en → "${fix.newMeaningEn}"`)
        console.log(`  audio → ${newUrl}\n`)
      }
    }
  }

  for (const mf of MEANING_FIXES) {
    console.log(`meaning_en="${mf.meaningEn}" 음성 교정\n`)

    const { data, error } = await supabase
      .from('generated_vocab')
      .select('id, mode, word, meaning_en, meaning_en_audio_url')
      .eq('meaning_en', mf.meaningEn)

    if (error) {
      console.error('DB 조회 실패:', error.message)
      continue
    }

    if (!data || data.length === 0) {
      console.log(`DB에 meaning_en="${mf.meaningEn}" 없음\n`)
      continue
    }

    console.log(`${data.length}개 행 발견\n`)

    const audio = await ttsEn(mf.ttsText)
    console.log(`TTS 생성 완료 (${GCP_VOICE_EN_FEMALE}, "${mf.ttsText}")\n`)

    for (const row of data) {
      console.log(`  [${row.mode}] "${row.word}" id=${row.id}`)

      const ts = Date.now()
      const path = `fix/${row.mode}/${row.id}_meaning_en_f_${ts}.mp3`
      const newUrl = await uploadAudio(path, audio)

      const { error: updateError } = await supabase
        .from('generated_vocab')
        .update({ meaning_en_audio_url: newUrl })
        .eq('id', row.id)

      if (updateError) {
        console.error(`  업데이트 실패: ${updateError.message}`)
      } else {
        console.log(`  audio → ${newUrl}\n`)
      }
    }
  }

  console.log('완료.')
}

main()
