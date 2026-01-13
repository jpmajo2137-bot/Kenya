import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import * as dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

const openai = new OpenAI({ apiKey: process.env.VITE_OPENAI_API_KEY });

// 특수 카테고리와 목표 개수
const SPECIAL_CATEGORIES = [
  { name: '여행', target: 300 },
  { name: '비즈니스', target: 300 },
  { name: '쇼핑', target: 300 },
  { name: '위기탈출', target: 300 },
];

const BATCH_SIZE = 100; // 한 번에 분류할 단어 수

interface WordRow {
  id: string;
  word: string;
  meaning_ko: string | null;
  meaning_en: string | null;
  meaning_sw: string | null;
  category: string | null;
  mode: string;
}

async function classifyBatchForCategory(
  words: WordRow[],
  category: string
): Promise<string[]> {
  const wordList = words
    .map((w, i) => {
      const meaning = w.meaning_ko || w.meaning_en || w.meaning_sw || "";
      return `${i + 1}. ${w.word} (${meaning})`;
    })
    .join("\n");

  const categoryDescriptions: Record<string, string> = {
    '여행': '여행, 관광, 교통, 숙박, 방향, 장소, 이동, 공항, 호텔, 관광지 관련 단어',
    '비즈니스': '비즈니스, 직장, 회의, 계약, 돈, 거래, 직업, 회사, 경제, 무역 관련 단어',
    '쇼핑': '쇼핑, 구매, 가격, 물건, 시장, 상점, 의류, 음식 구매, 할인, 결제 관련 단어',
    '위기탈출': '응급상황, 의료, 경찰, 도움 요청, 위험, 사고, 병원, 약국, 분실, 긴급 상황 관련 단어',
  };

  const prompt = `다음 단어들 중에서 "${category}" 카테고리에 해당하는 단어의 번호만 선택해주세요.

"${category}" 카테고리 설명: ${categoryDescriptions[category]}

단어 목록:
${wordList}

해당 카테고리에 맞는 단어의 번호만 쉼표로 구분해서 답변해주세요.
예시: 1, 3, 7, 12, 15

만약 해당 카테고리에 맞는 단어가 없으면 "없음"이라고 답변해주세요.

답변:`;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-2025-04-14",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 1000,
  });

  const content = response.choices[0].message.content || "";
  
  if (content.includes("없음")) {
    return [];
  }

  // 번호 파싱
  const numbers = content.match(/\d+/g) || [];
  const selectedIds: string[] = [];
  
  for (const numStr of numbers) {
    const idx = parseInt(numStr, 10) - 1;
    if (idx >= 0 && idx < words.length) {
      selectedIds.push(words[idx].id);
    }
  }

  return selectedIds;
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   GPT로 특수 카테고리 분류 (여행/비즈니스/쇼핑/위기탈출)  ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // 모든 단어 가져오기 (기존 특수 카테고리가 아닌 것만)
  console.log("📥 Supabase에서 단어 가져오는 중...");
  
  const allWords: WordRow[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("generated_vocab")
      .select("id, word, meaning_ko, meaning_en, meaning_sw, category, mode")
      .not("category", "in", '("여행","비즈니스","쇼핑","위기탈출")')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error("❌ 에러:", error);
      return;
    }

    if (!data || data.length === 0) break;
    allWords.push(...(data as WordRow[]));
    page++;
  }

  console.log(`✅ 총 ${allWords.length}개 단어 로드 완료\n`);

  // 각 카테고리별로 분류
  for (const cat of SPECIAL_CATEGORIES) {
    console.log(`\n🏷️ "${cat.name}" 카테고리 분류 시작 (목표: ${cat.target}개)...`);
    
    const selectedIds: string[] = [];
    let processed = 0;

    // 단어를 섞어서 다양한 단어 선택
    const shuffled = [...allWords].sort(() => Math.random() - 0.5);

    for (let i = 0; i < shuffled.length && selectedIds.length < cat.target; i += BATCH_SIZE) {
      const batch = shuffled.slice(i, i + BATCH_SIZE);
      const remaining = cat.target - selectedIds.length;
      
      if (remaining <= 0) break;

      try {
        console.log(`   배치 ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length}개 단어 분류 중...`);
        
        const ids = await classifyBatchForCategory(batch, cat.name);
        
        // 목표 개수만큼만 추가
        for (const id of ids) {
          if (selectedIds.length >= cat.target) break;
          if (!selectedIds.includes(id)) {
            selectedIds.push(id);
          }
        }

        console.log(`   ✓ 현재 ${selectedIds.length}/${cat.target}개 선택됨`);
        
        processed += batch.length;

        // Rate limit 방지
        await new Promise((r) => setTimeout(r, 500));

      } catch (err) {
        console.error(`   ❌ 배치 실패:`, err);
      }

      // 충분히 많은 단어를 처리했으면 중단
      if (processed > allWords.length * 0.5 && selectedIds.length >= cat.target * 0.8) {
        break;
      }
    }

    // Supabase 업데이트
    console.log(`   📝 ${selectedIds.length}개 단어 카테고리 업데이트 중...`);
    
    let updated = 0;
    for (const id of selectedIds) {
      const { error } = await supabase
        .from("generated_vocab")
        .update({ category: cat.name })
        .eq("id", id);

      if (!error) {
        updated++;
      }
    }

    console.log(`   ✅ "${cat.name}": ${updated}개 단어 업데이트 완료`);
  }

  // 최종 결과 확인
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                    ✅ 분류 완료!                         ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  
  console.log("\n📊 최종 결과:");
  for (const cat of SPECIAL_CATEGORIES) {
    const { count } = await supabase
      .from("generated_vocab")
      .select("*", { count: "exact", head: true })
      .eq("category", cat.name);
    console.log(`   - ${cat.name}: ${count}개`);
  }
}

main().catch(console.error);
