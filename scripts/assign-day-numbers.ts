import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

const WORDS_PER_DAY = 40;

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║        단어에 Day 번호 할당 (40개씩)                     ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // SW 모드와 KO 모드 각각 처리
  for (const mode of ['sw', 'ko']) {
    console.log(`\n📚 ${mode.toUpperCase()} 모드 처리 중...`);

    // 모든 단어 가져오기 (created_at 순서로)
    const allWords: { id: string }[] = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from("generated_vocab")
        .select("id")
        .eq("mode", mode)
        .order("created_at", { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error("❌ 에러:", error);
        return;
      }

      if (!data || data.length === 0) break;
      allWords.push(...data);
      page++;
    }

    console.log(`   ${allWords.length}개 단어 로드됨`);

    // Day 번호 할당
    const totalDays = Math.ceil(allWords.length / WORDS_PER_DAY);
    console.log(`   ${totalDays}개 Day로 분할 예정`);

    let updated = 0;
    for (let i = 0; i < allWords.length; i++) {
      const dayNumber = Math.floor(i / WORDS_PER_DAY) + 1;
      
      const { error } = await supabase
        .from("generated_vocab")
        .update({ day_number: dayNumber })
        .eq("id", allWords[i].id);

      if (!error) {
        updated++;
      }

      // 진행률 표시
      if ((i + 1) % 500 === 0 || i === allWords.length - 1) {
        console.log(`   [${i + 1}/${allWords.length}] ${((i + 1) / allWords.length * 100).toFixed(1)}%`);
      }
    }

    console.log(`   ✅ ${updated}개 단어 업데이트 완료 (${totalDays}개 Day)`);
  }

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                    ✅ 완료!                              ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
}

main().catch(console.error);
