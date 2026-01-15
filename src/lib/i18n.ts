export type Lang = 'sw' | 'ko'

const texts = {
  // App title
  appTitle1: { sw: 'K-Kiswahili-Words', ko: 'K-Kiswahili-Words' },
  appTitle2: { sw: '', ko: '' },

  // Default deck name
  allWords: { sw: 'Maneno Yote', ko: '모든 단어' },

  // Top nav
  home: { sw: 'Nyumbani', ko: '홈' },
  dictionary: { sw: 'Kamusi', ko: '사전' },
  settings: { sw: 'Mipangilio', ko: '설정' },
  generator: { sw: 'Kizazi', ko: 'AI 생성' },

  // Dictionary
  dictionaryTitle: { sw: 'Kamusi', ko: '사전' },
  dictionaryDesc: { sw: 'Tafuta maneno ya Kiswahili', ko: '스와힐리어 단어를 검색하세요' },
  searchPlaceholder: { sw: 'Tafuta neno...', ko: '단어 검색...' },
  noResults: { sw: 'Hakuna matokeo', ko: '검색 결과가 없어요' },
  searchHint: { sw: 'Andika neno kutafuta', ko: '단어를 입력해서 검색하세요' },

  // Bottom tabs
  wordbook: { sw: 'Kamusi', ko: '단어장' },
  quiz: { sw: 'Maswali', ko: '퀴즈' },
  wrongNote: { sw: 'Makosa', ko: '오답노트' },

  // Wordbook tab
  wordbookTitle: { sw: 'Kamusi', ko: '단어장' },
  wordbookDesc: { sw: 'Chagua kamusi kujifunza', ko: '단어장을 선택해서 학습하세요' },
  newWordbook: { sw: '+ Kamusi Mpya', ko: '+ 새 단어장' },
  words: { sw: 'maneno', ko: '개 단어' },
  review: { sw: 'Mapitio', ko: '복습' },
  backToList: { sw: '← Orodha', ko: '← 단어장 목록' },
  wordbookName: { sw: 'Jina la Kamusi', ko: '단어장 이름' },
  wordbookNamePlaceholder: { sw: 'mf. Mwanzo', ko: '예) 입문' },
  wordbookNameHint: { sw: 'Baada ya kuunda, unaweza kuongeza maneno.', ko: '생성 후 단어장 안에서 단어를 추가할 수 있어요.' },
  create: { sw: 'Unda', ko: '생성' },
  cancel: { sw: 'Ghairi', ko: '취소' },
  newWordbookModal: { sw: 'Kamusi Mpya', ko: '새 단어장' },
  wordbookCreated: { sw: 'Kamusi imeundwa', ko: '단어장 생성 완료' },
  enterWordbookName: { sw: 'Tafadhali weka jina la kamusi.', ko: '단어장 이름을 입력해 주세요.' },

  // Words
  addWord: { sw: '+ Neno Jipya', ko: '+ 단어 추가' },
  editWord: { sw: 'Hariri Neno', ko: '단어 수정' },
  newWord: { sw: 'Neno Jipya', ko: '새 단어' },
  swahili: { sw: 'Kiswahili', ko: '스와힐리어' },
  korean: { sw: 'Kikorea', ko: '한국어' },
  english: { sw: 'Kiingereza', ko: '영어 뜻' },
  example: { sw: 'Mfano', ko: '예문' },
  note: { sw: 'Maelezo', ko: '메모' },
  save: { sw: 'Hifadhi', ko: '저장' },
  delete: { sw: 'Futa', ko: '삭제' },
  wordAdded: { sw: 'Neno limeongezwa', ko: '단어 추가 완료' },
  wordUpdated: { sw: 'Neno limesasishwa', ko: '단어 수정 완료' },
  wordDeleted: { sw: 'Neno limefutwa', ko: '단어 삭제 완료' },
  enterSwahili: { sw: 'Tafadhali weka neno la Kiswahili.', ko: '스와힐리어를 입력해 주세요.' },
  enterKorean: { sw: 'Tafadhali weka maana ya Kikorea.', ko: '한국어 뜻을 입력해 주세요.' },
  confirmDelete: { sw: 'Futa neno hili?', ko: '이 단어를 삭제할까요?' },
  noWords: { sw: 'Hakuna maneno. Ongeza neno jipya!', ko: '단어가 없어요. 새 단어를 추가해 보세요!' },

  // Quiz
  quizTitle: { sw: 'Maswali', ko: '퀴즈' },
  selectWordbook: { sw: 'Kamusi', ko: '단어장' },
  questionCount: { sw: 'Idadi ya Maswali', ko: '문제 수' },
  startQuiz: { sw: '▶ Anza Maswali', ko: '▶ 퀴즈 시작' },
  all: { sw: 'Yote', ko: '전체' },
  wrongNotes: { sw: 'Makosa', ko: '오답노트' },
  noWordsInRange: { sw: 'Hakuna maneno katika eneo lililochaguliwa.', ko: '선택한 범위에 단어가 없어요. 단어장에 단어를 추가하거나 설정에서 due만 보기를 꺼보세요.' },
  selected: { sw: 'Imechaguliwa', ko: '선택' },
  candidates: { sw: 'wagombea', ko: '풀 후보' },
  done: { sw: 'Imekamilika!', ko: '완료!' },
  score: { sw: 'Alama', ko: '점수' },
  reconfigure: { sw: 'Weka Upya', ko: '다시 설정' },
  oneMore: { sw: 'Mara Moja Zaidi', ko: '한 번 더' },
  correct: { sw: 'Sahihi!', ko: '정답!' },
  wrong: { sw: 'Kosa', ko: '오답' },
  correctAnswer: { sw: 'Jibu sahihi', ko: '정답' },
  next: { sw: 'Ifuatayo', ko: '다음' },
  selectAnswer: { sw: 'Chagua jibu sahihi', ko: '정답을 선택하세요' },

  // Wrong note
  wrongNoteTitle: { sw: 'Makosa', ko: '오답노트' },
  wrongNoteDesc: { sw: 'Maneno uliyokosea', ko: '틀린 단어를 모아둔 곳이에요' },
  wrongCount: { sw: 'Makosa', ko: '오답' },
  times: { sw: 'mara', ko: '회' },
  retryQuiz: { sw: 'Maswali Tena', ko: '오답 퀴즈' },
  viewWord: { sw: 'Tazama', ko: '보기' },
  removeFromWrong: { sw: 'Ondoa', ko: '삭제' },
  noWrongWords: { sw: 'Hakuna makosa bado. Endelea kujifunza!', ko: '아직 오답이 없어요. 퀴즈를 풀어보세요!' },

  // Stats
  statsTitle: { sw: 'Takwimu', ko: '통계' },
  statsDesc: { sw: 'Maendeleo ya kujifunza', ko: '학습 진행 현황을 확인하세요' },
  totalWords: { sw: 'Jumla ya Maneno', ko: '전체 단어' },
  dueToday: { sw: 'Leo', ko: '오늘 복습' },
  totalReviews: { sw: 'Jumla ya Mapitio', ko: '총 복습' },
  masteredWords: { sw: 'Maneno Yaliyomilikiwa', ko: '마스터' },

  // Settings
  settingsTitle: { sw: 'Mipangilio', ko: '설정' },
  settingsDesc: { sw: 'Mipangilio na data', ko: '학습 방식/표시 옵션과 데이터를 관리 합니다.' },
  showEnglishLabel: { sw: 'Onyesha Kiingereza', ko: '영어(en) 표시' },
  showEnglishDesc: { sw: 'Onyesha maana ya Kiingereza katika kamusi.', ko: '단어장에서 영어 뜻을 함께 보여요.' },
  userModeLabel: { sw: 'Hali ya Mtumiaji', ko: '사용자 모드' },
  dataTitle: { sw: 'Data', ko: '데이터' },
} as const

export type TextKey = keyof typeof texts

export function t(key: TextKey, lang: Lang): string {
  return texts[key][lang]
}

