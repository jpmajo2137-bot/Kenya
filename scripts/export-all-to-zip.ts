import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import archiver from "archiver";
import https from "https";
import http from "http";

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

const EXPORT_DIR = "./export";
const ZIP_FILE = "./kenya-vocab-export.zip";

// 파일 다운로드 함수
async function downloadFile(url: string, filepath: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!url) {
      resolve(false);
      return;
    }

    const protocol = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(filepath);

    protocol
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          // 리다이렉트 처리
          downloadFile(response.headers.location!, filepath).then(resolve);
          return;
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(filepath);
          resolve(false);
          return;
        }

        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve(true);
        });
      })
      .on("error", () => {
        file.close();
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        resolve(false);
      });
  });
}

// 안전한 파일명 생성
function safeFilename(str: string): string {
  return str
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 50);
}

async function exportAllData() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║       Kenya Vocab 전체 데이터 ZIP 내보내기 시작          ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // 1. 기존 export 폴더 정리
  if (fs.existsSync(EXPORT_DIR)) {
    fs.rmSync(EXPORT_DIR, { recursive: true });
  }
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  fs.mkdirSync(path.join(EXPORT_DIR, "audio"), { recursive: true });
  fs.mkdirSync(path.join(EXPORT_DIR, "images"), { recursive: true });

  // 2. 모든 단어 가져오기
  console.log("📥 Supabase에서 모든 단어 가져오는 중...");
  
  const allWords: any[] = [];
  let page = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from("generated_vocab")
      .select("*")
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("❌ 데이터 가져오기 실패:", error);
      return;
    }

    if (!data || data.length === 0) break;
    allWords.push(...data);
    page++;
    console.log(`   ${allWords.length}개 로드됨...`);
  }

  console.log(`✅ 총 ${allWords.length}개 단어 로드 완료\n`);

  // 3. 데이터 정리 및 파일 다운로드
  const exportData: any[] = [];
  let downloadedAudio = 0;
  let downloadedImages = 0;
  let failedAudio = 0;
  let failedImages = 0;

  console.log("📥 오디오 및 이미지 파일 다운로드 중...\n");

  for (let i = 0; i < allWords.length; i++) {
    const word = allWords[i];
    const idx = String(i + 1).padStart(5, "0");
    const safeWord = safeFilename(word.swahili || word.english || `word_${i}`);
    
    // 파일명 생성
    const audioFiles: Record<string, string | null> = {
      word_audio: null,
      definition_audio: null,
      example_audio: null,
      example_translation_audio: null,
    };
    const imageFile: string | null = null;

    // 오디오 파일 다운로드
    const audioFields = [
      { urlField: "word_audio_url", name: "word" },
      { urlField: "definition_audio_url", name: "definition" },
      { urlField: "example_audio_url", name: "example" },
      { urlField: "example_translation_audio_url", name: "example_translation" },
    ];

    for (const field of audioFields) {
      const url = word[field.urlField];
      if (url) {
        const filename = `${idx}_${safeWord}_${field.name}.mp3`;
        const filepath = path.join(EXPORT_DIR, "audio", filename);
        const success = await downloadFile(url, filepath);
        if (success) {
          audioFiles[`${field.name}_audio`] = `audio/${filename}`;
          downloadedAudio++;
        } else {
          failedAudio++;
        }
      }
    }

    // 이미지 파일 다운로드
    let imageFilePath: string | null = null;
    if (word.image_url) {
      const ext = word.image_url.includes(".png") ? "png" : "jpg";
      const filename = `${idx}_${safeWord}.${ext}`;
      const filepath = path.join(EXPORT_DIR, "images", filename);
      const success = await downloadFile(word.image_url, filepath);
      if (success) {
        imageFilePath = `images/${filename}`;
        downloadedImages++;
      } else {
        failedImages++;
      }
    }

    // 내보내기 데이터 구성
    const exportEntry = {
      id: word.id,
      index: i + 1,
      mode: word.mode, // 'sw' or 'ko'
      
      // 단어 정보
      swahili: word.swahili,
      english: word.english,
      korean: word.korean,
      
      // 발음
      pronunciation: word.pronunciation,
      
      // 뜻
      definition_en: word.definition_en,
      definition_ko: word.definition_ko,
      
      // 예문
      example: word.example,
      example_translation_en: word.example_translation_en,
      example_translation_ko: word.example_translation_ko,
      
      // 카테고리
      category: word.category,
      difficulty: word.difficulty,
      
      // 파일 경로
      files: {
        image: imageFilePath,
        word_audio: audioFiles.word_audio,
        definition_audio: audioFiles.definition_audio,
        example_audio: audioFiles.example_audio,
        example_translation_audio: audioFiles.example_translation_audio,
      },
      
      // 원본 URL (참고용)
      original_urls: {
        image: word.image_url,
        word_audio: word.word_audio_url,
        definition_audio: word.definition_audio_url,
        example_audio: word.example_audio_url,
        example_translation_audio: word.example_translation_audio_url,
      },
      
      created_at: word.created_at,
    };

    exportData.push(exportEntry);

    // 진행률 표시
    if ((i + 1) % 100 === 0 || i === allWords.length - 1) {
      const percent = ((i + 1) / allWords.length * 100).toFixed(1);
      console.log(`   [${i + 1}/${allWords.length}] ${percent}% - 오디오: ${downloadedAudio}, 이미지: ${downloadedImages}`);
    }
  }

  console.log(`\n✅ 다운로드 완료!`);
  console.log(`   - 오디오: ${downloadedAudio}개 성공, ${failedAudio}개 실패`);
  console.log(`   - 이미지: ${downloadedImages}개 성공, ${failedImages}개 실패\n`);

  // 4. JSON 파일 저장
  console.log("📝 JSON 데이터 저장 중...");
  
  // 전체 데이터
  fs.writeFileSync(
    path.join(EXPORT_DIR, "all_words.json"),
    JSON.stringify(exportData, null, 2),
    "utf-8"
  );

  // SW 모드만
  const swData = exportData.filter((w) => w.mode === "sw");
  fs.writeFileSync(
    path.join(EXPORT_DIR, "sw_words.json"),
    JSON.stringify(swData, null, 2),
    "utf-8"
  );

  // KO 모드만
  const koData = exportData.filter((w) => w.mode === "ko");
  fs.writeFileSync(
    path.join(EXPORT_DIR, "ko_words.json"),
    JSON.stringify(koData, null, 2),
    "utf-8"
  );

  // CSV 파일도 생성
  const csvHeader = "index,mode,swahili,english,korean,pronunciation,definition_en,definition_ko,example,example_translation_en,example_translation_ko,category,difficulty,image_file,word_audio_file\n";
  const csvRows = exportData.map((w) => {
    const escape = (s: string | null) => s ? `"${String(s).replace(/"/g, '""')}"` : "";
    return [
      w.index,
      w.mode,
      escape(w.swahili),
      escape(w.english),
      escape(w.korean),
      escape(w.pronunciation),
      escape(w.definition_en),
      escape(w.definition_ko),
      escape(w.example),
      escape(w.example_translation_en),
      escape(w.example_translation_ko),
      escape(w.category),
      w.difficulty,
      escape(w.files.image),
      escape(w.files.word_audio),
    ].join(",");
  }).join("\n");

  fs.writeFileSync(
    path.join(EXPORT_DIR, "all_words.csv"),
    "\uFEFF" + csvHeader + csvRows, // BOM for Excel
    "utf-8"
  );

  // README 파일
  const readme = `# Kenya Vocab Export

## 내보내기 날짜
${new Date().toISOString()}

## 통계
- 전체 단어: ${exportData.length}개
  - SW 모드 (스와힐리어 → 영어/한국어): ${swData.length}개
  - KO 모드 (한국어 → 스와힐리어): ${koData.length}개
- 오디오 파일: ${downloadedAudio}개
- 이미지 파일: ${downloadedImages}개

## 폴더 구조
- all_words.json: 전체 단어 데이터 (JSON)
- sw_words.json: SW 모드 단어만 (JSON)
- ko_words.json: KO 모드 단어만 (JSON)
- all_words.csv: 전체 단어 데이터 (CSV, Excel 호환)
- audio/: 오디오 파일 (MP3)
  - {index}_{word}_word.mp3: 단어 발음
  - {index}_{word}_definition.mp3: 뜻 발음
  - {index}_{word}_example.mp3: 예문 발음
  - {index}_{word}_example_translation.mp3: 예문 번역 발음
- images/: 이미지 파일 (PNG/JPG)

## JSON 데이터 구조
\`\`\`json
{
  "id": "uuid",
  "index": 1,
  "mode": "sw" | "ko",
  "swahili": "스와힐리어 단어",
  "english": "영어 뜻",
  "korean": "한국어 뜻",
  "pronunciation": "발음 기호",
  "definition_en": "영어 정의",
  "definition_ko": "한국어 정의",
  "example": "예문",
  "example_translation_en": "예문 영어 번역",
  "example_translation_ko": "예문 한국어 번역",
  "category": "카테고리",
  "difficulty": 1-5,
  "files": {
    "image": "images/00001_word.png",
    "word_audio": "audio/00001_word_word.mp3",
    "definition_audio": "audio/00001_word_definition.mp3",
    "example_audio": "audio/00001_word_example.mp3",
    "example_translation_audio": "audio/00001_word_example_translation.mp3"
  }
}
\`\`\`
`;

  fs.writeFileSync(path.join(EXPORT_DIR, "README.md"), readme, "utf-8");

  console.log("✅ JSON/CSV/README 저장 완료\n");

  // 5. ZIP 압축
  console.log("📦 ZIP 파일 생성 중...");

  if (fs.existsSync(ZIP_FILE)) {
    fs.unlinkSync(ZIP_FILE);
  }

  const output = fs.createWriteStream(ZIP_FILE);
  const archive = archiver("zip", { zlib: { level: 9 } });

  await new Promise<void>((resolve, reject) => {
    output.on("close", () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`✅ ZIP 파일 생성 완료: ${ZIP_FILE} (${sizeMB} MB)\n`);
      resolve();
    });

    archive.on("error", (err) => {
      reject(err);
    });

    archive.pipe(output);
    archive.directory(EXPORT_DIR, false);
    archive.finalize();
  });

  // 6. 정리
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║                    내보내기 완료!                        ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`\n📁 ZIP 파일: ${path.resolve(ZIP_FILE)}`);
  console.log(`📂 폴더: ${path.resolve(EXPORT_DIR)}`);
  console.log(`\n📊 총 ${exportData.length}개 단어, ${downloadedAudio}개 오디오, ${downloadedImages}개 이미지`);
}

exportAllData().catch(console.error);
