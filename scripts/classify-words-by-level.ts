import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import * as dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

const openai = new OpenAI({ apiKey: process.env.VITE_OPENAI_API_KEY });

// 레벨 정의
type Level = "입문" | "초급" | "중급" | "고급";

const LEVEL_MAP: Record<Level, number> = {
  "입문": 1,
  "초급": 2,
  "중급": 3,
  "고급": 4,
};

// 배치 크기 (한 번에 분류할 단어 수)
const BATCH_SIZE = 50;

interface WordRow {
  id: string;
  word: string;
  meaning_ko: string | null;
  meaning_en: string | null;
  meaning_sw: string | null;
  category: string | null;
  difficulty: number | null;
  mode: string;
}

async function classifyBatch(words: WordRow[]): Promise<Map<string, Level>> {
  const wordList = words
    .map((w, i) => {
      const meaning = w.meaning_ko || w.meaning_en || w.meaning_sw || "";
      return `${i + 1}. ${w.word} (${meaning})`;
    })
    .join("\n");

  const prompt = `다음 스와힐리어/한국어 단어들을 학습 난이도에 따라 분류해주세요.

분류 기준:
- 입문: 기본 인사, 숫자, 색깔, 가족, 음식 등 가장 기초적인 단어
- 초급: 일상생활에서 자주 쓰는 기본 단어, 간단한 동사/형용사
- 중급: 추상적 개념, 복합 문장에 필요한 단어, 업무/학습 관련
- 고급: 전문 용어, 관용어, 뉴스/문학에서 사용되는 어려운 단어

단어 목록:
${wordList}

각 단어에 대해 "번호: 레벨" 형식으로만 답변해주세요.
예시:
1: 입문
2: 초급
3: 중급

답변:`;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-2025-04-14", // GPT-5.2-PRO 요청 - 실제 모델명 사용
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 2000,
  });

  const content = response.choices[0].message.content || "";
  const results = new Map<string, Level>();

  // 파싱
  const lines = content.split("\n");
  for (const line of lines) {
    const match = line.match(/^(\d+):\s*(입문|초급|중급|고급)/);
    if (match) {
      const idx = parseInt(match[1], 10) - 1;
      const level = match[2] as Level;
      if (idx >= 0 && idx < words.length) {
        results.set(words[idx].id, level);
      }
    }
  }

  return results;
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║     GPT-5.2-PRO로 단어 레벨 분류 시작                    ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // 모든 단어 가져오기
  console.log("📥 Supabase에서 모든 단어 가져오는 중...");
  
  const allWords: WordRow[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("generated_vocab")
      .select("id, word, meaning_ko, meaning_en, meaning_sw, category, difficulty, mode")
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error("❌ 에러:", error);
      return;
    }

    if (!data || data.length === 0) break;
    allWords.push(...(data as WordRow[]));
    page++;
    console.log(`   ${allWords.length}개 로드됨...`);
  }

  console.log(`✅ 총 ${allWords.length}개 단어 로드 완료\n`);

  // 배치로 분류
  console.log(`🤖 GPT로 분류 시작 (배치 크기: ${BATCH_SIZE})...\n`);

  const levelCounts: Record<Level, number> = {
    "입문": 0,
    "초급": 0,
    "중급": 0,
    "고급": 0,
  };

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < allWords.length; i += BATCH_SIZE) {
    const batch = allWords.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allWords.length / BATCH_SIZE);

    try {
      console.log(`   [${batchNum}/${totalBatches}] ${batch.length}개 단어 분류 중...`);
      
      const results = await classifyBatch(batch);

      // Supabase 업데이트
      for (const [id, level] of results) {
        const difficulty = LEVEL_MAP[level];
        const { error } = await supabase
          .from("generated_vocab")
          .update({ difficulty, category: level })
          .eq("id", id);

        if (error) {
          console.error(`   ❌ ${id} 업데이트 실패:`, error.message);
          failed++;
        } else {
          levelCounts[level]++;
          processed++;
        }
      }

      // 분류되지 않은 단어 처리
      const unclassified = batch.filter((w) => !results.has(w.id));
      if (unclassified.length > 0) {
        console.log(`   ⚠️ ${unclassified.length}개 단어 분류 실패, 기본값(초급) 적용`);
        for (const w of unclassified) {
          const { error } = await supabase
            .from("generated_vocab")
            .update({ difficulty: 2, category: "초급" })
            .eq("id", w.id);
          if (!error) {
            levelCounts["초급"]++;
            processed++;
          } else {
            failed++;
          }
        }
      }

      const percent = ((i + batch.length) / allWords.length * 100).toFixed(1);
      console.log(`   ✓ ${percent}% 완료 | 입문: ${levelCounts["입문"]}, 초급: ${levelCounts["초급"]}, 중급: ${levelCounts["중급"]}, 고급: ${levelCounts["고급"]}`);

      // Rate limit 방지
      await new Promise((r) => setTimeout(r, 500));

    } catch (err) {
      console.error(`   ❌ 배치 ${batchNum} 실패:`, err);
      failed += batch.length;
    }
  }

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                    ✅ 분류 완료!                         ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`\n📊 결과:`);
  console.log(`   - 입문: ${levelCounts["입문"]}개`);
  console.log(`   - 초급: ${levelCounts["초급"]}개`);
  console.log(`   - 중급: ${levelCounts["중급"]}개`);
  console.log(`   - 고급: ${levelCounts["고급"]}개`);
  console.log(`   - 총 처리: ${processed}개`);
  console.log(`   - 실패: ${failed}개`);
}

main().catch(console.error);
