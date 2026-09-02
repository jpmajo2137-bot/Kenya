export type Lang = 'sw' | 'ko' | 'en'

const texts = {
  // App title
  appTitle1: { sw: 'Oxford English Words', ko: '영어 단어장', en: 'Oxford English Words' },
  appTitle2: { sw: '', ko: '', en: '' },

  // Default deck name
  allWords: { sw: 'Maneno Yote', ko: '모든 단어', en: 'All Words' },

  // Top nav
  home: { sw: 'Nyumbani', ko: '홈', en: 'Home' },
  hangeul: { sw: 'Hangeul', ko: '한글', en: 'Hangeul' },
  dictionary: { sw: 'Kamusi', ko: '사전', en: 'Dictionary' },
  settings: { sw: 'Mipangilio', ko: '설정', en: 'Settings' },
  generator: { sw: 'Kizazi', ko: 'AI 생성', en: 'Generator' },

  // Hangeul
  hangeulTitle: { sw: 'Jifunze Hangeul', ko: '한글 글자 공부', en: 'Learn Hangeul' },
  hangeulDesc: {
    sw: 'Jifunze herufi za Kikorea (konsonanti na irabu).',
    ko: '한글 자음과 모음을 학습하세요.',
    en: 'Learn Korean letters (consonants and vowels).',
  },
  hangeulConsonants: { sw: 'Konsonanti', ko: '자음', en: 'Consonants' },
  hangeulVowels: { sw: 'Irabu', ko: '모음', en: 'Vowels' },
  hangeulBasic: { sw: 'Msingi', ko: '기본', en: 'Basic' },
  hangeulDouble: { sw: 'Mara Mbili', ko: '쌍자음', en: 'Double' },
  hangeulCompound: { sw: 'Changamano', ko: '복합 모음', en: 'Compound' },
  hangeulTapToHear: {
    sw: 'Bofya kusikia matamshi',
    ko: '글자를 누르면 발음을 들을 수 있어요',
    en: 'Tap a letter to hear pronunciation',
  },
  hangeulRomanization: { sw: 'Matamshi', ko: '로마자', en: 'Romanization' },
  hangeulLetterName: { sw: 'Jina la herufi', ko: '글자 이름', en: 'Letter name' },
  hangeulExample: { sw: 'Mfano', ko: '예시', en: 'Example' },
  hangeulCombineTitle: { sw: 'Mchanganyiko wa Silabi', ko: '음절 합성', en: 'Syllable Composition' },
  hangeulCombineConsonantHint: {
    sw: 'Konsonanti + Irabu zote = Silabi',
    ko: '자음 + 모든 모음 = 음절',
    en: 'Consonant + all vowels = Syllables',
  },
  hangeulCombineVowelHint: {
    sw: 'Konsonanti zote + Irabu = Silabi',
    ko: '모든 자음 + 모음 = 음절',
    en: 'All consonants + Vowel = Syllables',
  },

  // Offline
  offlineTitle: {
    sw: 'Hakuna intaneti',
    ko: '인터넷 연결이 필요해요',
    en: 'No Internet Connection',
  },
  offlineDesc: {
    sw: 'Programu hii inahitaji intaneti kufanya kazi. Tafadhali unganisha Wi-Fi au data ya simu, kisha jaribu tena.',
    ko: '이 앱은 인터넷 연결이 필요합니다.\nWi-Fi 또는 모바일 데이터를 켠 후 다시 시도해 주세요.',
    en: 'This app requires an internet connection.\nPlease connect to Wi-Fi or mobile data and try again.',
  },
  offlineRetry: {
    sw: 'Jaribu tena',
    ko: '다시 시도',
    en: 'Retry',
  },
  offlineHint: {
    sw: 'Itarejea kiotomatiki ukirudi mtandaoni.',
    ko: '인터넷에 다시 연결되면 자동으로 복구됩니다.',
    en: 'Will reconnect automatically when online.',
  },

  // Dictionary
  dictionaryTitle: { sw: 'Kamusi', ko: '사전', en: 'Dictionary' },
  dictionaryDesc: {
    sw: 'Tafuta maneno ya Kiswahili',
    ko: '스와힐리어 단어를 검색하세요',
    en: 'Search for words',
  },
  searchPlaceholder: { sw: 'Tafuta neno...', ko: '단어 검색...', en: 'Search a word...' },
  noResults: { sw: 'Hakuna matokeo', ko: '검색 결과가 없어요', en: 'No results' },
  searchHint: {
    sw: 'Andika neno kutafuta',
    ko: '단어를 입력해서 검색하세요',
    en: 'Type a word to search',
  },

  // Bottom tabs
  wordbook: { sw: 'Kamusi', ko: '단어장', en: 'Wordbook' },
  quiz: { sw: 'Maswali', ko: '퀴즈', en: 'Quiz' },
  wrongNote: { sw: 'Makosa', ko: '오답노트', en: 'Wrong Notes' },

  // Wordbook tab
  wordbookTitle: { sw: 'Kamusi', ko: '단어장', en: 'Wordbook' },
  wordbookDesc: {
    sw: 'Chagua kamusi kujifunza',
    ko: '단어장을 선택해서 학습하세요',
    en: 'Pick a wordbook to start learning',
  },
  newWordbook: { sw: '+ Kamusi Mpya', ko: '+ 새 단어장', en: '+ New Wordbook' },
  words: { sw: 'maneno', ko: '개 단어', en: 'words' },
  review: { sw: 'Mapitio', ko: '복습', en: 'Review' },
  backToList: { sw: '← Orodha', ko: '← 단어장 목록', en: '← Back to list' },
  wordbookName: { sw: 'Jina la Kamusi', ko: '단어장 이름', en: 'Wordbook name' },
  wordbookNamePlaceholder: { sw: 'mf. Mwanzo', ko: '예) 입문', en: 'e.g. Starter' },
  wordbookNameHint: {
    sw: 'Baada ya kuunda, unaweza kuongeza maneno.',
    ko: '생성 후 단어장 안에서 단어를 추가할 수 있어요.',
    en: 'You can add words after creating it.',
  },
  create: { sw: 'Unda', ko: '생성', en: 'Create' },
  cancel: { sw: 'Ghairi', ko: '취소', en: 'Cancel' },
  newWordbookModal: { sw: 'Kamusi Mpya', ko: '새 단어장', en: 'New Wordbook' },
  wordbookCreated: { sw: 'Kamusi imeundwa', ko: '단어장 생성 완료', en: 'Wordbook created' },
  enterWordbookName: {
    sw: 'Tafadhali weka jina la kamusi.',
    ko: '단어장 이름을 입력해 주세요.',
    en: 'Please enter a wordbook name.',
  },

  // Words
  addWord: { sw: '+ Neno Jipya', ko: '+ 단어 추가', en: '+ Add Word' },
  editWord: { sw: 'Hariri Neno', ko: '단어 수정', en: 'Edit Word' },
  newWord: { sw: 'Neno Jipya', ko: '새 단어', en: 'New Word' },
  swahili: { sw: 'Kiswahili', ko: '스와힐리어', en: 'Swahili' },
  korean: { sw: 'Kikorea', ko: '한국어', en: 'Korean' },
  english: { sw: 'Kiingereza', ko: '영어 뜻', en: 'English' },
  example: { sw: 'Mfano', ko: '예문', en: 'Example' },
  note: { sw: 'Maelezo', ko: '메모', en: 'Note' },
  save: { sw: 'Hifadhi', ko: '저장', en: 'Save' },
  delete: { sw: 'Futa', ko: '삭제', en: 'Delete' },
  wordAdded: { sw: 'Neno limeongezwa', ko: '단어 추가 완료', en: 'Word added' },
  wordUpdated: { sw: 'Neno limesasishwa', ko: '단어 수정 완료', en: 'Word updated' },
  wordDeleted: { sw: 'Neno limefutwa', ko: '단어 삭제 완료', en: 'Word deleted' },
  enterSwahili: {
    sw: 'Tafadhali weka neno la Kiswahili.',
    ko: '스와힐리어를 입력해 주세요.',
    en: 'Please enter a Swahili word.',
  },
  enterKorean: {
    sw: 'Tafadhali weka maana ya Kikorea.',
    ko: '한국어 뜻을 입력해 주세요.',
    en: 'Please enter a Korean meaning.',
  },
  confirmDelete: { sw: 'Futa neno hili?', ko: '이 단어를 삭제할까요?', en: 'Delete this word?' },
  noWords: {
    sw: 'Hakuna maneno. Ongeza neno jipya!',
    ko: '단어가 없어요. 새 단어를 추가해 보세요!',
    en: 'No words yet. Add a new word!',
  },

  // Quiz
  quizTitle: { sw: 'Maswali', ko: '퀴즈', en: 'Quiz' },
  selectWordbook: { sw: 'Kamusi', ko: '단어장', en: 'Wordbook' },
  questionCount: { sw: 'Idadi ya Maswali', ko: '문제 수', en: 'Number of Questions' },
  startQuiz: { sw: '▶ Anza Maswali', ko: '▶ 퀴즈 시작', en: '▶ Start Quiz' },
  all: { sw: 'Yote', ko: '전체', en: 'All' },
  wrongNotes: { sw: 'Makosa', ko: '오답노트', en: 'Wrong Notes' },
  noWordsInRange: {
    sw: 'Hakuna maneno katika eneo lililochaguliwa.',
    ko: '선택한 범위에 단어가 없어요. 단어장에 단어를 추가하거나 설정에서 due만 보기를 꺼보세요.',
    en: 'No words in the selected range. Add words or disable "due only" in settings.',
  },
  selected: { sw: 'Imechaguliwa', ko: '선택', en: 'Selected' },
  candidates: { sw: 'wagombea', ko: '풀 후보', en: 'pool' },
  done: { sw: 'Imekamilika!', ko: '완료!', en: 'Done!' },
  score: { sw: 'Alama', ko: '점수', en: 'Score' },
  reconfigure: { sw: 'Weka Upya', ko: '다시 설정', en: 'Reconfigure' },
  oneMore: { sw: 'Mara Moja Zaidi', ko: '한 번 더', en: 'One more' },
  correct: { sw: 'Sahihi!', ko: '정답!', en: 'Correct!' },
  wrong: { sw: 'Kosa', ko: '오답', en: 'Wrong' },
  correctAnswer: { sw: 'Jibu sahihi', ko: '정답', en: 'Correct answer' },
  next: { sw: 'Ifuatayo', ko: '다음', en: 'Next' },
  selectAnswer: { sw: 'Chagua jibu sahihi', ko: '정답을 선택하세요', en: 'Select the correct answer' },

  // Wrong note
  wrongNoteTitle: { sw: 'Makosa', ko: '오답노트', en: 'Wrong Notes' },
  wrongNoteDesc: {
    sw: 'Maneno uliyokosea',
    ko: '틀린 단어를 모아둔 곳이에요',
    en: 'Words you got wrong',
  },
  wrongCount: { sw: 'Makosa', ko: '오답', en: 'Wrong' },
  times: { sw: 'mara', ko: '회', en: 'times' },
  retryQuiz: { sw: 'Maswali Tena', ko: '오답 퀴즈', en: 'Retry Quiz' },
  viewWord: { sw: 'Tazama', ko: '보기', en: 'View' },
  removeFromWrong: { sw: 'Ondoa', ko: '삭제', en: 'Remove' },
  noWrongWords: {
    sw: 'Hakuna makosa bado. Endelea kujifunza!',
    ko: '아직 오답이 없어요. 퀴즈를 풀어보세요!',
    en: 'No wrong notes yet. Try a quiz!',
  },

  // Stats
  statsTitle: { sw: 'Takwimu', ko: '통계', en: 'Stats' },
  statsDesc: {
    sw: 'Maendeleo ya kujifunza',
    ko: '학습 진행 현황을 확인하세요',
    en: 'Check your learning progress',
  },
  totalWords: { sw: 'Jumla ya Maneno', ko: '전체 단어', en: 'Total Words' },
  dueToday: { sw: 'Leo', ko: '오늘 복습', en: 'Today' },
  totalReviews: { sw: 'Jumla ya Mapitio', ko: '총 복습', en: 'Total Reviews' },
  masteredWords: { sw: 'Maneno Yaliyomilikiwa', ko: '마스터', en: 'Mastered' },

  // Settings
  settingsTitle: { sw: 'Mipangilio', ko: '설정', en: 'Settings' },
  settingsDesc: {
    sw: 'Mipangilio na data',
    ko: '학습 방식/표시 옵션과 데이터를 관리 합니다.',
    en: 'Manage display options and data.',
  },
  showEnglishLabel: { sw: 'Onyesha Kiingereza', ko: '영어(en) 표시', en: 'Show English' },
  showEnglishDesc: {
    sw: 'Onyesha maana ya Kiingereza katika kamusi.',
    ko: '단어장에서 영어 뜻을 함께 보여요.',
    en: 'Show English meanings in the wordbook.',
  },
  userModeLabel: { sw: 'Hali ya Mtumiaji', ko: '사용자 모드', en: 'User Mode' },
  dataTitle: { sw: 'Data', ko: '데이터', en: 'Data' },

  // Version selector (신규)
  nativeLangLabel: { sw: 'Lugha yako', ko: '내 모국어', en: 'My Native Language' },
  targetLangLabel: { sw: 'Unajifunza', ko: '학습 언어', en: 'Learning' },
  langKorean: { sw: 'Kikorea', ko: '한국어', en: 'Korean' },
  langEnglish: { sw: 'Kiingereza', ko: '영어', en: 'English' },
  langSwahili: { sw: 'Kiswahili', ko: '스와힐리어', en: 'Swahili' },
} as const

export type TextKey = keyof typeof texts

export function t(key: TextKey, lang: Lang): string {
  return texts[key][lang]
}
