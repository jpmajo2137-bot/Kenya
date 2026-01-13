import { createClient } from '@supabase/supabase-js'
import { env } from './env'

// Supabase 클라이언트 (환경 변수가 없으면 null)
export const supabase =
  env.supabaseUrl && env.supabaseAnonKey
    ? createClient(env.supabaseUrl, env.supabaseAnonKey)
    : null

// ===========================================
// Database Types
// ===========================================

/** 단어 모드: sw = 스와힐리어 사람용, ko = 한국 사람용 */
export type VocabMode = 'sw' | 'ko'

/** 생성된 단어 엔트리 */
export interface GeneratedVocab {
  id?: string
  mode: VocabMode
  
  // 메인 단어
  word: string
  word_pronunciation: string // IPA 또는 발음 표기
  word_audio_url?: string   // TTS 음성 URL
  image_url?: string        // 단어 연상 이미지 URL
  
  // 뜻 (3개 언어)
  meaning_sw: string
  meaning_sw_pronunciation: string
  meaning_sw_audio_url?: string
  
  meaning_ko: string
  meaning_ko_pronunciation: string
  meaning_ko_audio_url?: string
  
  meaning_en: string
  meaning_en_pronunciation: string
  meaning_en_audio_url?: string
  
  // 예문
  example: string
  example_pronunciation: string
  example_audio_url?: string
  example_translation_ko?: string
  example_translation_en?: string
  
  // 메타
  pos?: string // 품사
  category?: string // 카테고리 (인사, 숫자, 음식 등)
  difficulty?: number // 1-5
  
  created_at?: string
}

// ===========================================
// Supabase SQL for creating tables
// ===========================================
/*
Run this SQL in Supabase SQL Editor:

-- 생성된 단어 테이블
CREATE TABLE generated_vocab (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL CHECK (mode IN ('sw', 'ko')),
  
  -- 메인 단어
  word TEXT NOT NULL,
  word_pronunciation TEXT,
  word_audio_url TEXT,
  
  -- 뜻 (3개 언어)
  meaning_sw TEXT,
  meaning_sw_pronunciation TEXT,
  meaning_sw_audio_url TEXT,
  
  meaning_ko TEXT,
  meaning_ko_pronunciation TEXT,
  meaning_ko_audio_url TEXT,
  
  meaning_en TEXT,
  meaning_en_pronunciation TEXT,
  meaning_en_audio_url TEXT,
  
  -- 예문
  example TEXT,
  example_pronunciation TEXT,
  example_audio_url TEXT,
  example_translation_ko TEXT,
  example_translation_en TEXT,
  
  -- 메타
  pos TEXT,
  category TEXT,
  difficulty INTEGER CHECK (difficulty >= 1 AND difficulty <= 5),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 인덱스용
  UNIQUE(mode, word)
);

-- 인덱스
CREATE INDEX idx_generated_vocab_mode ON generated_vocab(mode);
CREATE INDEX idx_generated_vocab_category ON generated_vocab(category);
CREATE INDEX idx_generated_vocab_difficulty ON generated_vocab(difficulty);

-- RLS 정책 (모든 사용자가 읽기 가능)
ALTER TABLE generated_vocab ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON generated_vocab FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert" ON generated_vocab FOR INSERT WITH CHECK (true);

-- 음성 파일 저장용 Storage 버킷
-- Supabase Dashboard > Storage > New bucket: "vocabaudio" (public)

*/

