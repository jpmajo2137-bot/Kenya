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
const CONCURRENT_DOWNLOADS = 20; // 동시 다운로드 수

// 파일 다운로드 함수
function downloadFile(url: string, filepath: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!url) {
      resolve(false);
      return;
    }

    const protocol = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(filepath);

    const req = protocol.get(url, { timeout: 30000 }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        downloadFile(response.headers.location!, filepath).then(resolve);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(filepath); } catch {}
        resolve(false);
        return;
      }

      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve(true);
      });
    });

    req.on("error", () => {
      file.close();
      try { fs.unlinkSync(filepath); } catch {}
      resolve(false);
    });

    req.on("timeout", () => {
      req.destroy();
      file.close();
      try { fs.unlinkSync(filepath); } catch {}
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

// 청크 배열로 나누기
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

interface DownloadTask {
  url: string;
  filepath: string;
  type: "audio" | "image";
  wordIdx: number;
  field: string;
}

async function exportAllData() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║       Kenya Vocab 전체 데이터 ZIP 내보내기 (고속)        ║");
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

  // 3. 다운로드 태스크 목록 생성
  console.log("📋 다운로드 목록 생성 중...");
  
  const downloadTasks: DownloadTask[] = [];
  const fileMapping: Map<number, any> = new Map(); // wordIdx -> file paths

  for (let i = 0; i < allWords.length; i++) {
    const word = allWords[i];
    const idx = String(i + 1).padStart(5, "0");
    const safeWord = safeFilename(word.swahili || word.english || `word_${i}`);
    
    const files = {
      image: null as string | null,
      word_audio: null as string | null,
      definition_audio: null as string | null,
      example_audio: null as string | null,
      example_translation_audio: null as string | null,
    };

    // 오디오 파일들
    const audioFields = [
      { urlField: "word_audio_url", name: "word", fileKey: "word_audio" },
      { urlField: "definition_audio_url", name: "definition", fileKey: "definition_audio" },
      { urlField: "example_audio_url", name: "example", fileKey: "example_audio" },
      { urlField: "example_translation_audio_url", name: "example_translation", fileKey: "example_translation_audio" },
    ];

    for (const field of audioFields) {
      const url = word[field.urlField];
      if (url) {
        const filename = `${idx}_${safeWord}_${field.name}.mp3`;
        const filepath = path.join(EXPORT_DIR, "audio", filename);
        files[field.fileKey as keyof typeof files] = `audio/${filename}`;
        downloadTasks.push({
          url,
          filepath,
          type: "audio",
          wordIdx: i,
          field: field.fileKey,
        });
      }
    }

    // 이미지
    if (word.image_url) {
      const ext = word.image_url.includes(".png") ? "png" : "jpg";
      const filename = `${idx}_${safeWord}.${ext}`;
      const filepath = path.join(EXPORT_DIR, "images", filename);
      files.image = `images/${filename}`;
      downloadTasks.push({
        url: word.image_url,
        filepath,
        type: "image",
        wordIdx: i,
        field: "image",
      });
    }

    fileMapping.set(i, files);
  }

  console.log(`✅ 다운로드 태스크: ${downloadTasks.length}개\n`);

  // 4. 병렬 다운로드 실행
  console.log(`📥 파일 다운로드 시작 (동시 ${CONCURRENT_DOWNLOADS}개)...\n`);
  
  let completed = 0;
  let successAudio = 0;
  let successImage = 0;
  let failed = 0;
  const startTime = Date.now();

  const taskChunks = chunk(downloadTasks, CONCURRENT_DOWNLOADS);
  
  for (const taskChunk of taskChunks) {
    const results = await Promise.all(
      taskChunk.map(async (task) => {
        const success = await downloadFile(task.url, task.filepath);
        if (!success) {
          // 실패 시 파일 경로 제거
          const files = fileMapping.get(task.wordIdx);
          if (files) {
            files[task.field] = null;
          }
        }
        return { success, type: task.type };
      })
    );

    for (const result of results) {
      completed++;
      if (result.success) {
        if (result.type === "audio") successAudio++;
        else successImage++;
      } else {
        failed++;
      }
    }

    // 진행률 표시 (500개마다)
    if (completed % 500 < CONCURRENT_DOWNLOADS || completed === downloadTasks.length) {
      const percent = ((completed / downloadTasks.length) * 100).toFixed(1);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = (completed / ((Date.now() - startTime) / 1000)).toFixed(1);
      console.log(
        `   [${completed}/${downloadTasks.length}] ${percent}% | ` +
        `오디오: ${successAudio}, 이미지: ${successImage}, 실패: ${failed} | ` +
        `${elapsed}초, ${rate}개/초`
      );
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ 다운로드 완료! (${totalTime}초 소요)`);
  console.log(`   - 오디오: ${successAudio}개 성공`);
  console.log(`   - 이미지: ${successImage}개 성공`);
  console.log(`   - 실패: ${failed}개\n`);

  // 5. JSON 데이터 구성
  console.log("📝 JSON 데이터 생성 중...");
  
  const exportData = allWords.map((word, i) => {
    const files = fileMapping.get(i)!;
    return {
      id: word.id,
      index: i + 1,
      mode: word.mode,
      
      swahili: word.swahili,
      english: word.english,
      korean: word.korean,
      pronunciation: word.pronunciation,
      
      definition_en: word.definition_en,
      definition_ko: word.definition_ko,
      
      example: word.example,
      example_translation_en: word.example_translation_en,
      example_translation_ko: word.example_translation_ko,
      
      category: word.category,
      difficulty: word.difficulty,
      
      files: {
        image: files.image,
        word_audio: files.word_audio,
        definition_audio: files.definition_audio,
        example_audio: files.example_audio,
        example_translation_audio: files.example_translation_audio,
      },
      
      original_urls: {
        image: word.image_url,
        word_audio: word.word_audio_url,
        definition_audio: word.definition_audio_url,
        example_audio: word.example_audio_url,
        example_translation_audio: word.example_translation_audio_url,
      },
      
      created_at: word.created_at,
    };
  });

  // 전체 데이터
  fs.writeFileSync(
    path.join(EXPORT_DIR, "all_words.json"),
    JSON.stringify(exportData, null, 2),
    "utf-8"
  );

  // SW/KO 분리
  const swData = exportData.filter((w) => w.mode === "sw");
  const koData = exportData.filter((w) => w.mode === "ko");
  
  fs.writeFileSync(path.join(EXPORT_DIR, "sw_words.json"), JSON.stringify(swData, null, 2), "utf-8");
  fs.writeFileSync(path.join(EXPORT_DIR, "ko_words.json"), JSON.stringify(koData, null, 2), "utf-8");

  // CSV
  const csvHeader = "index,mode,swahili,english,korean,pronunciation,definition_en,definition_ko,example,example_translation_en,example_translation_ko,category,difficulty,image_file,word_audio_file\n";
  const escape = (s: string | null) => s ? `"${String(s).replace(/"/g, '""')}"` : "";
  const csvRows = exportData.map((w) => [
    w.index, w.mode, escape(w.swahili), escape(w.english), escape(w.korean),
    escape(w.pronunciation), escape(w.definition_en), escape(w.definition_ko),
    escape(w.example), escape(w.example_translation_en), escape(w.example_translation_ko),
    escape(w.category), w.difficulty, escape(w.files.image), escape(w.files.word_audio),
  ].join(",")).join("\n");
  
  fs.writeFileSync(path.join(EXPORT_DIR, "all_words.csv"), "\uFEFF" + csvHeader + csvRows, "utf-8");

  // README
  const readme = `# Kenya Vocab Export

## 내보내기 정보
- 날짜: ${new Date().toISOString()}
- 소요 시간: ${totalTime}초

## 통계
- 전체 단어: ${exportData.length}개
  - SW 모드: ${swData.length}개
  - KO 모드: ${koData.length}개
- 오디오 파일: ${successAudio}개
- 이미지 파일: ${successImage}개

## 파일 구조
\`\`\`
export/
├── all_words.json      # 전체 데이터 (JSON)
├── sw_words.json       # SW 모드만
├── ko_words.json       # KO 모드만
├── all_words.csv       # 전체 데이터 (CSV)
├── README.md           # 이 파일
├── audio/              # 오디오 파일 (MP3)
│   └── {번호}_{단어}_{타입}.mp3
└── images/             # 이미지 파일
    └── {번호}_{단어}.png/jpg
\`\`\`

## 오디오 파일 타입
- word: 단어 발음
- definition: 뜻 발음  
- example: 예문 발음
- example_translation: 예문 번역 발음
`;

  fs.writeFileSync(path.join(EXPORT_DIR, "README.md"), readme, "utf-8");
  console.log("✅ 데이터 파일 저장 완료\n");

  // 6. ZIP 압축
  console.log("📦 ZIP 파일 생성 중...");

  if (fs.existsSync(ZIP_FILE)) {
    fs.unlinkSync(ZIP_FILE);
  }

  const output = fs.createWriteStream(ZIP_FILE);
  const archive = archiver("zip", { zlib: { level: 6 } });

  await new Promise<void>((resolve, reject) => {
    output.on("close", () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`✅ ZIP 생성 완료: ${ZIP_FILE} (${sizeMB} MB)\n`);
      resolve();
    });
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(EXPORT_DIR, false);
    archive.finalize();
  });

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║                    ✅ 내보내기 완료!                     ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`\n📁 ZIP: ${path.resolve(ZIP_FILE)}`);
  console.log(`📂 폴더: ${path.resolve(EXPORT_DIR)}`);
}

exportAllData().catch(console.error);
