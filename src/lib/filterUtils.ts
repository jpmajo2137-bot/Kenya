export type ParsedFilter = {
  category?: string
  pos?: string
  topic?: string
  classified?: string
  ordered?: string
  disabled?: boolean
}

export function parseLevelFilter(levelFilter: string): ParsedFilter {
  if (!levelFilter) return {}
  if (levelFilter.startsWith('disabled:')) return { disabled: true }
  if (levelFilter.startsWith('ordered:')) return { ordered: levelFilter.slice(8) }
  if (levelFilter.startsWith('classified:')) return { classified: levelFilter.slice(11) }
  if (levelFilter.startsWith('pos:')) return { pos: levelFilter.slice(4) }
  if (levelFilter.startsWith('topic:')) return { topic: levelFilter.slice(6) }
  if (levelFilter.startsWith('category:')) return { category: levelFilter.slice(9) }
  return { category: levelFilter }
}

type TopicDef = {
  sw: string[]
  ko: string[]
  enPatterns: string[]
}

export const TOPIC_DEFINITIONS: Record<string, TopicDef> = {}

export const TOPIC_NAMES = Object.keys(TOPIC_DEFINITIONS) as string[]

export function buildTopicOrCondition(_topic: string, _mode: string): string {
  return ''
}

export function matchesTopicFilter(
  _row: Record<string, unknown>,
  _topic: string,
  _mode: string,
): boolean {
  return false
}

// ─────────────────────────────────────────────────────────────
// GPT 분류 기반 필터링
// ─────────────────────────────────────────────────────────────
import classificationModule from './topicClassification'
import houseExclusions from './houseExclusions.json'
import { NUMBER_ORDER } from './numberOrder'

function getClassificationData(): Record<string, string[]> {
  return classificationModule || {}
}

// ─────────────────────────────────────────────────────────────
// 순서 기반 필터링 (숫자 1~50 등)
// ─────────────────────────────────────────────────────────────
const ORDERED_MAPS: Record<string, Record<string, string[]>> = {
  '숫자1-50': NUMBER_ORDER,
}

/** 특정 순서 단어장에서만 제외할 단어 (orderKey → 제외할 word 목록) */
export const ORDERED_WORD_EXCLUSIONS: Record<string, string[]> = {
  '숫자1-50': ['mzunguko'],
}

/** 순서 단어장별 Day당 단어 수 오버라이드 (기본 40) */
export const ORDERED_WORDS_PER_DAY: Record<string, number> = {
  '숫자1-50': 36,
}

/** 모든 단어장에서 제외할 단어 (전역) */
export const GLOBAL_WORD_EXCLUSIONS: string[] = [
  'kubusu', 'kulala na', 'kubaka', '흑인', 'Mweusi', '진화', 'mageuzi',
  // SW Nyumba/Vifaa Day 5·6 제외 → 전역 제외
  '레이저', '울', '큐대', '결함이 있는', '영장', '계산서', '설비', '내선', '솔질하다', '내부', '자르다', '함부로 버리다', '결함이 있다', '실크', '남기다', '경비', '테이프를 붙이다', '밖', '끈적끈적한', '배트', '시동을 걸다', '잠그다',
  '쾅', '덮다', '작동하는', '베다', '구금하다', '가두다', '갈아입다', '모금하다', '두드리다', '문자', '포스터', '빼다', '교체하다', '방망이', '애완동물', '전단지', '문지르다',
]

/** 분류 단어장에 추가로 포함할 단어 (다른 분류에 속하지만 이 분류에도 표시) */
export const CLASSIFIED_EXTRA_WORDS: Record<string, string[]> = {
  '숫자/수량': [
    // KO mode (word = Swahili)
    'Januari', 'Februari', 'Machi', 'Aprili', 'Mei', 'Juni', 'Julai',
    'Agosti', 'Septemba', 'Oktoba', 'Novemba', 'Desemba',
    'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi', 'Jumapili',
    // SW mode (word = Korean)
    '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월',
    '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일',
  ],
}

/** 특정 카테고리 단어장에서만 제외할 단어 (category → 제외할 word 목록, 다른 단어장에서는 유지) */
export const CATEGORY_WORD_EXCLUSIONS: Record<string, string[]> = {
  '여행': [
    'mbio', 'moja kwa moja', 'msongamano', 'kilima', 'nje', 'uhamaji', 'kutangatanga', 'skii',
    'uelekezaji', 'kupeleka', 'gurudumu', 'kila mahali', 'imefungwa', 'kugeuka', 'mkoa', 'popote',
    'kiti', 'nyuma', 'mgeni', 'mwongozo', 'petroli', 'kuzamia', 'pana',
    'miundombinu', 'mtaa', 'pikipiki', 'ya mashariki', 'kwenda', 'kupitia', 'ngazi',
    'bara', 'hakuna mahali', 'kote', 'kughairi', 'kigingi',
    'makazi', 'kwingineko',
    'ukanda', 'kwingine',
    'panda', 'kimbilio', 'kuhama', 'honi', 'kubaini', 'barabara', 'msikiti', 'karibisha', 'kuvuka', 'miadi', 'kumtembelea', 'korido', 'kuelekeza', 'maktaba', 'leseni', 'chafu ya mimea', 'ya vitongoji', 'keja', 'tairi la akiba', 'mizigo', 'ghorofa', 'mshale', 'kitelezi', 'gia',
    'dhoruba', 'kuharakisha', 'toka', 'kupumzika', 'tambaa', 'tanga-tanga', 'apartimenti', 'bawa', 'fuata', 'kupaa', 'alama ya njia', 'mwishoni mwa wiki', 'barabara kuu', 'kunyesha theluji',
    'kitongoji', 'lifti', 'baa', 'rubani', 'deck', 'gereza', 'kaskazini', 'msafara', 'injini', 'mstari', 'foleni',
    '도서관', '동네', '엘리베이터', '경적', '펍', '에', '조종사', '데크', '감옥', '북쪽의', '어디에도', '차량대', '엔진', '줄', '타다',
    '접근하다', '멀리', '해외의', '걷다', '서행',
    '오토바이',
    '거주하다', '센터', '말', '위치하다', '어디에나', '동쪽', '돌아오다', '어디든지', '부치다', '바깥쪽', '차체',
  ],
  '비즈니스': [
    'idhini', 'kamati', 'kikomo', 'ya kila mwaka', 'maonyesho', 'kushirikiana', 'kutoa leseni', 'ghali', 'usafiri wa kupitia',
    'ikuweka masharti', 'kutozwa',
    'kuweka masharti', 'kuachilia',
    'kuazima', 'bandari',
    'chama', 'utabiri', 'huduma za umma', 'kubobea', 'kukadiria', 'kuwasilisha ombi', 'kupiga muhuri', 'weka nafasi', 'kudhamini', 'piga simu', 'usikilizaji', 'mwenye nyumba', 'hoja', 'kuamua', 'matamanio', 'bei nafuu', 'bilioni',
    'sheria', 'kutoza faini', 'yuro', 'kufaulu', 'pensheni',
    'jenga', 'visa', 'ufadhili (wa masomo)',
    'ugawaji', 'kugawa', 'rithi',
    '신청하다', '내기하다', '혜택', '집주인', '대표',
    '부유하다',
    '이체하다', '구독', '사다', '후보자', '만료되다', '지연', '복권',
    '소유권',
    '물품', '통계', '계산대', '가게', '대성공', '중재', '통행료', '궁핍한', '요금',
  ],
  '쇼핑': [
    'kupunguza', 'seti', 'kodi', 'shati', 'kupima uzito', 'kukopa', 'upatikanaji', 'sweta', 'tangazo', 'kima cha chini', 'anasa', 'forodha', 'poda', 'jaketi', 'mapato', 'badilisha', 'kabati', 'chakula', 'mgahawa',
    'kibali', 'miwani', 'kuvaa', 'friji', 'amana', 'posho', 'zabuni', 'senti', 'kafe', 'ada ya barabara',
    'begi', 'kopo', 'kikapu', 'ya thamani', 'nafuu', 'mauzo', 'overoli', 'rafu', 'harambee', 'oka',
    'kuchuma', 'jemu', 'masoko',
    'mtindo', 'kumiliki', 'hariri', 'kuweka nafasi', 'upataji', 'kijiko', 'tufaha', 'chupi', 'modeli', 'tanuri', 'zawadi', 'kafeteria', 'fulana', 'visha', 'kugharamia', 'krimu', 'ndizi', 'miliki', 'mchele',     "nyama ya ng'ombe", 'kitu', 'mfuko',
    'osha', 'soksi',
    '청바지', '빌리다', '기부', '빚', '요리', '거래', '파우더', '껍질', '절약하다', '남은 음식', '비스킷', '회원권', '보너스', '면', '샷', '판매부수', '샐러드', '부피', '모자', '제조', '자금', '운영',
    '배달하다', '견과류', '생산', '프리미엄', '카페', '임금', '세관', '패션', '공장', '콩', '세탁', '사장',
    '유제품', '대여', '입장료', '빵', '샌드위치', '편리하다',
    '티셔츠', '용돈',
    '레몬',
    '초콜릿', '채소', '예매하다', '소비하다', '고기', '최신', '매출', '짐', '버터', '화장', '식사', '구입', '수령자', '장갑', '가루', '옷을 입다',
  ],
  '위기탈출': [
    'wafu', 'piga kelele', 'mgongano', 'afya',
    'asiye na makazi', 'beba', 'jali', 'mguu', 'bahati mbaya', 'upanga', 'gereza', 'mwenye ulemavu', 'mwendesha mashtaka',
    'kukabiliana', 'kufa kwa baridi', 'vurugu', 'ghasia', 'kushtua', 'ulemavu', 'mwenye kukata tamaa', 'haramia', 'kugongana',     "unyang'anyi", 'afisa',
    'kutetemeka', 'ufunguo', 'kushutumu', 'zua ghasia', 'alama ya meno',
    'saratani', 'kutoroka', 'kupasuka',
    'inayodhuru', 'kihalifu',
    'ogopa', 'kupiga risasi', 'vunja', 'kufilisika', 'ulizo', 'kuporomoka', 'kuuguza', 'gereji', 'ya magonjwa ya akili', 'yenye madhara', 'inayotisha', 'mfu',
    '무기', '보장 범위', '재활', '주의', '마피아', '죽은', '간호', '보호하다', '알코올 중독자', '폭격하다', '암살', '치료', '군대', '수술용', '부르다', '건강',
    '산소', '사망자', '학살', '겁주다',
    '찌르다', '안전한',
    '약화시키다', '피보호자', '검사', '두렵다', '인질', '비틀거리다', '에이즈', '만행', '임상적인', '발생하다', '찢어짐',
    '버티다', '체포하다', '구금하다', '가두다', '노숙인', '검찰', '익사하다', '허약함',
    '재판소', '무서운', '학대하다',
    '호소', '난민', '고통스럽다', '총기', '약초', '감금하다',
  ],
}

/** 품사별 단어장에서만 제외할 단어 (pos값 → 제외할 word 목록, 다른 단어장에서는 유지) */
export const POS_WORD_EXCLUSIONS: Record<string, string[]> = {
  'adjective': [
    'yetu',
    '감사하다', '걱정되다', '짜증나다', '신나다', '화나다', '젖다', '틀리다',
    '고맙다', '공손하다', '화려하다', '위험하다', '살아있다', '기혼', '재미있다',
    '고통스럽다', '불쾌하다', '운이 좋다', '크다', '받을 만하다', '엄격하다',
    '냉혹하다', '정확하다', '불공평하다',
    '가치가 있다', '가깝다', '중요하다', '우울하다', '충분하다', '신성하다',
    '논리적이다', '심오하다', '귀엽다', '바람직하다', '배고프다', '마르다',
    '바쁘다', '간절하다', '관련 있다', '특이하다', '훌륭하다',
    '혼잡하다', '적당하다', '높다', '실행 가능하다', '꾸준하다',
    '무겁다', '부적절하다', '동등하다', '민감하다',
    '다르다', '심각하다', '유연하다', '씁쓸하다', '합법적이다', '대단하다', '해롭다',
    '웅장하다', '지독하다', '관례적이다', '편리하다', '중고', '유머러스하다',
    '젊다', '뻔뻔하다', '유능하다', '영광스럽다', '지적이다', '겸손하다',
    '풍부하다', '성숙하다',
    '그럴듯하다', '미안하다', '쓸모없다', '면역이다', '극명하다', '두렵다',
    '법적이다', '맞다', '편안하다', '확실하다', '많다', '단단하다', '솔직하다',
    '슬프다', '자동', '전용', '진하다',
    '무섭다', '즐겁다', '불가피하다', '괜찮다', '갑작스럽다', '복잡하다', '익숙하다', '친절하다',
    '완전하다', '온라인', '더블', '온화하다', '미적', '춥다',
    '가득하다', '어둡다',
    '불행하다', '속상하다', '마땅하다', '재능이 있다', '깨끗하다', '뻔하다',
    '소수', '부족하다', '미묘하다',
    '고급', '부유하다', '유효하다', '수상하다',
    '기쁘다', '유명하다',
    '거리감이 있다', '살아 있다', '진짜', '부끄럽다', '절박하다', '열정적이다',
    '편하다', '평화롭다', '자랑스럽다', '연약하다', '주거용', '악명 높다', '황당하다',
    '소위', '밝다', '시다', '비슷하다', '가짜', '얕다',
    '좋다',
    '임시', '부주의하다', '비참하다', '예쁘다', '아프다', '냉소적이다', '시끄럽다', '촌스럽다',
    '싸구려', '행복하다', '순조롭다', '잔인하다', '맑다', '낫다', '조용하다', '어렵다',
    '디지털', '멋있다', '부정직하다', '둔하다',
    '낮다', '궁금하다',
    '실현 가능하다', '평평하다', '장관이다', '거칠다',
    '가파르다', '더 나쁘다', '역동적이다', '독특하다',
    'sawa', 'mwenye kejeli', 'asiye mtaalamu',
    'bayana', 'optiki', 'hii', 'amesinzia',
    'vingine', 'wa sauti', 'ya uimbaji', 'otomatiki',
    'wa papo hapo', 'mwingine', 'wote', 'yote',
    'mbali', 'bila hisia',
    'wa pili', 'yao', '-ao', 'mwenyewe',
  ],
  'adverb': [
    '오늘',
    'leo usiku', 'si', 'tosha', 'kitaalamu',
    'kutosha', 'vya kutosha', 'nyumbani', 'wenyewe',
    'hakuna', 'sasa', 'huwa', 'leo', 'kwa kutosha', 'ambapo',
    'kaskazini', 'inadaiwa', 'huenda', 'kusini',
  ],
  'noun': [
    '과도', '아무것도', '우세', '누구를', 'wao', 'wakati', 'uchi',
  ],
  'verb': [
    'kushindwa', 'kuhusu',
  ],
}

/** 모드별 품사 단어장 Day N 제외 목록 (pos → mode → Day 번호 → 제외할 word 목록) */
export const POS_DAYN_EXCLUSIONS_BY_MODE: Record<string, Partial<Record<'ko' | 'sw', Record<number, string[]>>>> = {
  'adjective': {
    sw: {
      1: ['어색하다', '라지', '경주용', '끔찍하다', '꽉 끼다', '똑똑하다', '피곤하다', '수줍다'],
      20: ['레어', '편도'],
    },
  },
}

/** 특정 카테고리 단어장의 최대 Day 수 (이보다 많은 Day는 표시하지 않음) */
export const CATEGORY_MAX_DAYS: Record<string, number> = {
  '여행': 2,
}

/** 특정 분류 단어장의 최대 Day 수 (빈 Day 제거용) */
export const CLASSIFIED_MAX_DAYS: Record<string, number> = {
  '집/생활용품': 3,
  '일상생활': 5,  // 1700+ 단어 중 Day 5(200개)까지만 표시
}

/** 모드별 분류 단어장 포함 목록 (인사/기본표현 SW: 인사·안부 관련 80개만) */
export const CLASSIFIED_WORD_INCLUSIONS_BY_MODE: Record<string, Partial<Record<'ko' | 'sw', string[]>>> = {
  '인사/기본표현': {
    // 인사·안부 관련 (SW 모드, 제외: 아니요, 네, 존경하다, 편안한, 괜찮다, 선생님, 허락하다, 제발, 괜찮아요, 허락)
    sw: [
      '안녕', '안녕하세요', '안녕히 가세요', '안녕히 계세요', '잘 가', '잘가요', '잘가', '어떻게 지내', '어떻게 지내요', '어떻게 지내?',
      '감사', '감사합니다', '고맙습니다', '천만에', '미안합니다', '죄송합니다', '유감이에요', '힘내요',
      '인사', '인사하다', '작별', '작별하다', '환영', '환영하다', '어서 오세요', '어서 와',
      '예의', '예절', '존경', '소개하다', '잘 자', '안녕히 주무세요',
      '손을 흔들다', '절하다', '인사말', '건배', '부탁',
      '아저씨', '여보세요', '실례합니다', '알겠습니다',
      '좋아요', '잘 지내다', '만나서 반갑다', '또 봐요', '다음에 봐요',
      '고마워요', '미안해요', '괜찮아', '잘 있어요', '잘 다녀와요', '다녀왔어요',
      '오랜만이에요', '잘 지냈어요', '요즘 어때요', '요즘 어떠세요',
      '다정한', '정중한', '공손한', '예의 바른',
      '안녕(인사)', '안녕히', '헤어지다', '만나다', '반갑다', '뵙다', '감사하다', '사과하다', '용서하다', '잘 부탁해요',
    ],
  },
}

/** 분류 단어장 포함 목록 조회 (모드별 우선, 없으면 공통) */
export function getClassifiedInclusions(topicName: string, mode: 'ko' | 'sw'): string[] | undefined {
  const byMode = CLASSIFIED_WORD_INCLUSIONS_BY_MODE[topicName]?.[mode]
  if (byMode?.length) return byMode
  return CLASSIFIED_WORD_INCLUSIONS[topicName]
}

/** 특정 분류 단어장에서만 포함할 단어 (classifiedKey → 포함할 word 목록, 정의 시 나머지 전부 제외) */
export const CLASSIFIED_WORD_INCLUSIONS: Record<string, string[]> = {
  '인사/기본표현': [
    // 인사·작별
    'habari',
    'Habari',
    'habari gani',
    'hujambo',
    'kwaheri',
    'kwa heri',
    'kusalimia',
    'kuaga',
    // 환영·감사·사과
    'karibu sana',
    'asante',
    'asante sana',
    'shukrani',
    'pole',
    'samahani',
    // 응답·호칭
    'vipi',
    'sijambo',
    'kutambulisha',
    'mwenye adabu',
    'heshima',
    'bwana',
    // 기타 인사 표현
    'salamu',
    'lala salama',
    'Afya!',
    'kupunga mkono',
    // 예절
    'adabu',
    'kuheshimu',
    'mstaarabu',
    'shikamoo',
    'marahaba',
    'kuinama',
    'inama',
    'tafadhali',
  ],
}

/** 모드별 Day 1 포함 목록 (classifiedKey → mode → Day 1에만 표시할 word 목록, Day 2+는 나머지 전체) */
export const CLASSIFIED_DAY1_INCLUSIONS_BY_MODE: Record<string, Partial<Record<'ko' | 'sw', string[]>>> = {
  '집/생활용품': {
    sw: ['선반', '침실', '우산', '담요', '밧줄', '키보드', '의자', '칼', '작업복', '실내', '안에', '밖에', '도구', '전선', '문'],
  },
}

/** Day 1 포함 목록 조회 (모드별 우선, 없으면 공통) */
export function getClassifiedDay1Inclusions(topicName: string, mode: 'ko' | 'sw'): string[] | undefined {
  const byMode = CLASSIFIED_DAY1_INCLUSIONS_BY_MODE[topicName]?.[mode]
  if (byMode?.length) return byMode
  return CLASSIFIED_DAY1_INCLUSIONS[topicName]
}

/** Day 1에서만 포함할 단어 (classifiedKey → Day 1에 표시할 word 목록, 40개 미만이면 Day 2·3…에서 채움) */
export const CLASSIFIED_DAY1_INCLUSIONS: Record<string, string[]> = {
  '교통/이동': [
    'helikopta', 'jeti', 'kufika', 'mwongoza watalii', 'uhamaji', 'pasipoti',
    'kusafirisha', 'daraja', 'kupeleka', 'iliyopo', 'gurudumu', 'farasi',
    'mjini', 'kugeuka', 'kruzi', 'mkoa', 'kuondoka', 'usafiri wa kupitia', "ng'ambo",
  ],
  '숫자/수량': [
    // KO mode (word = Swahili)
    'Januari', 'Februari', 'Machi', 'Aprili', 'Mei', 'Juni', 'Julai',
    'Agosti', 'Septemba', 'Oktoba', 'Novemba', 'Desemba',
    'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi', 'Jumapili',
    // SW mode (word = Korean)
    '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월',
    '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일',
  ],
}

/** Day 1에서만 제외할 단어 (classifiedKey → Day 1에서 제외할 word 목록, Day 2+는 유지) */
export const CLASSIFIED_DAY1_EXCLUSIONS: Record<string, string[]> = {
  '교통/이동': ['mbio', 'toroka', 'jikwaa', 'ufuatiliaji', 'msongamano', 'kutangatanga', 'skii', 'chini', 'mgongano', 'ila mahali', 'kurukia', 'popote', 'rada', 'nyuma', 'kila mahali', 'potea', 'mbele', 'ruka', 'kuleta', 'kuteleza', 'kujiondoa', 'kuburuta', 'miundombinu', 'mtaa', 'uvamizi', 'kutupia', 'nyuma ya'],
}

/** 분류 단어장에서 중복 제거 (첫 번째만 유지)
 * @param byWordOnly - true면 word·meaning_ko 각각 기준 (다른 Day에 같은 단어 안 나오게) */
export function deduplicateClassifiedRows<T extends { word?: string | null; meaning_ko?: string | null }>(
  rows: T[],
  byWordOnly?: boolean,
): T[] {
  if (byWordOnly) {
    const seen = new Set<string>()
    return rows.filter((r) => {
      const w = r.word ?? ''
      const m = r.meaning_ko ?? ''
      if (seen.has(w) || seen.has(m)) return false
      if (w) seen.add(w)
      if (m) seen.add(m)
      return true
    })
  }
  const seen = new Set<string>()
  return rows.filter((r) => {
    const key = `${r.word ?? ''}|${r.meaning_ko ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Day N 제외 체크: word 또는 meaning_ko가 exclusion set에 있으면 제외 (KO/SW 모드 모두 대응) */
export function isRowExcludedByDayN<T extends { word?: string | null; meaning_ko?: string | null }>(
  row: T,
  dayNExclSet: Set<string>,
): boolean {
  return dayNExclSet.has(row.word ?? '') || dayNExclSet.has(row.meaning_ko ?? '')
}

/** 이전 Day N의 실제 단어들 반환 (해당 Day exclusion 적용 후, Day 5 등에서 중복 제외용) */
export function getWordsFromPreviousDay<T extends { word?: string | null; meaning_ko?: string | null }>(
  filtered: T[],
  prevDayNumber: number,
  wordsPerDay: number,
  dayNExclusions: Record<number, string[]>,
): Set<string> {
  const prevExcl = dayNExclusions[prevDayNumber]
  const prevExclSet = prevExcl?.length ? new Set(prevExcl) : null
  const start = (prevDayNumber - 1) * wordsPerDay
  const set = new Set<string>()
  let idx = start
  let count = 0
  while (count < wordsPerDay && idx < filtered.length) {
    const r = filtered[idx++]
    if (prevExclSet && isRowExcludedByDayN(r, prevExclSet)) continue
    const w = r.word ?? ''
    const m = r.meaning_ko ?? ''
    if (w) set.add(w)
    if (m) set.add(m)
    count++
  }
  return set
}

/** Day N에서 이전 Day 단어도 제외 (classifiedKey → dayNumber → [exclude from prev day]) */
export const CLASSIFIED_DAYN_EXCLUDE_PREV_DAY: Record<string, number[]> = {
}

/** 중복 제거 적용할 분류 단어장 (word|meaning_ko 기준 첫 번째만 유지) */
export const CLASSIFIED_DEDUPLICATE_TOPICS: string[] = ['가족/관계']

/** word만 기준으로 중복 제거 (다른 Day에 같은 단어 안 나오게) */
export const CLASSIFIED_DEDUPLICATE_BY_WORD_ONLY: string[] = ['가족/관계']

/** Day N에서만 제외할 단어 (classifiedKey → Day 번호 → 제외할 word 목록, CLASSIFIED_WORD_EXCLUSIONS와 중복 제거) */
export const CLASSIFIED_DAYN_EXCLUSIONS: Record<string, Record<number, string[]>> = {
  '교통/이동': {
    2: ['dunda', 'kando ya'],
    3: ['taifa', 'beba', 'sindikiza', 'foleni', 'kujikwaa', 'kwingineko', 'pembeni ya barabara', 'harakati', 'kwingine', 'kuzunguka', 'ya baharini', 'kuteleza kwenye theluji', 'msako', 'kuteka', 'kupiga shabaha', 'kubaini', 'kudunda'],
    4: ['ya mbio', 'yanayozunguka', 'mwenye silaha', 'kutoweka', 'wa majini', 'anguka', 'kusukuma', "ng'ambo ya", 'karibu na', 'huko', 'tanki la kivita'],
  },
}

/** 모드별 Day N 제외 목록 (classifiedKey → mode → Day 번호 → 제외할 word 목록, 해당 모드+Day에서만 적용) */
export const CLASSIFIED_DAYN_EXCLUSIONS_BY_MODE: Record<string, Partial<Record<'ko' | 'sw', Record<number, string[]>>>> = {
}

/** Day N 제외 목록 조회 (모드별 우선, 없으면 공통) */
export function getClassifiedDayNExclusions(topicName: string, dayNumber: number, mode: 'ko' | 'sw'): string[] {
  const byMode = CLASSIFIED_DAYN_EXCLUSIONS_BY_MODE[topicName]?.[mode]?.[dayNumber]
  if (byMode?.length) return byMode
  return CLASSIFIED_DAYN_EXCLUSIONS[topicName]?.[dayNumber] ?? []
}

/** Day N 제외 맵 조회 (getWordsFromPreviousDay 등에 전달용, 모드별 반영) */
export function getClassifiedDayNExclusionsMap(topicName: string, mode: 'ko' | 'sw'): Record<number, string[]> {
  const common = CLASSIFIED_DAYN_EXCLUSIONS[topicName] ?? {}
  const byMode = CLASSIFIED_DAYN_EXCLUSIONS_BY_MODE[topicName]?.[mode] ?? {}
  const result: Record<number, string[]> = { ...common }
  for (const [day, words] of Object.entries(byMode)) {
    result[Number(day)] = words
  }
  return result
}

/** 특정 분류 단어장에서만 제외할 단어 (classifiedKey → 제외할 word 목록) */
export const CLASSIFIED_WORD_EXCLUSIONS: Record<string, string[]> = {
  '숫자/수량': [
    'mzunguko', '묶다', '너무', '제한하다', '스물', '열셋', '비율', '매우', '값어치',
    '수학', '아홉', '유로', '예순', '마흔', '남다', '부피', '추정하다', '다른',
    '단위', '간격', '보상', '복용량', '추가(의)', '달러',
    '어느 쪽도', '보다', '열넷', '강도', '아흔', '저울', '예산', '상승', '부족하다',
    '셋', '열여덟', '골', '조합', '서른', '너비', '칠십', '백', '점수', '여덟', '둘', '오십', '하나', '배분', '여섯',
    '프리미엄', '가득하다',
    '제외', '계산', '입장료', '배열하다',
    '열여섯', '측정', '열하나', '열둘', '로또', '일흔', '발행 부수',
    '십칠', '십팔', '십구', '이십', '이십일', '이십이', '이십삼', '이십사',
    '삼', '이십오', '사', '오', '육', '칠', '넷', '십',
    '열아홉', '달다', '열일곱', '열다섯', '포함', '통화', '다섯', '센트', '일곱', '여든',
    '십일', '십이', '십삼', '십사', '십오', '십육',
    '스물하나', '스물둘', '스물셋', '스물넷', '스물다섯',
    '이십육', '이십칠', '이십팔', '이십구',
    '삼십', '삼십일', '삼십이', '삼십삼', '삼십사', '삼십오',
    '쉰', '사십', '육십', '팔십', '구십',
    // 숫자1-50 카테고리와 겹치는 기본 숫자 제외
    'moja', 'mbili', 'tatu', 'nne', 'tano', 'sita', 'saba', 'nane', 'tisa', 'kumi',
    'kumi na moja', 'kumi na mbili', 'kumi na tatu', 'kumi na nne', 'kumi na tano',
    'kumi na sita', 'kumi na saba', 'kumi na nane', 'kumi na tisa',
    'ishirini', 'ishirini na moja', 'ishirini na mbili', 'ishirini na tatu', 'ishirini na nne',
    'ishirini na tano', 'ishirini na sita', 'ishirini na saba', 'ishirini na nane', 'ishirini na tisa',
    'thelathini', 'thelathini na moja', 'thelathini na mbili', 'thelathini na tatu', 'thelathini na nne',
    'thelathini na tano', 'thelathini na sita', 'thelathini na saba', 'thelathini na nane', 'thelathini na tisa',
    'arobaini', 'arobaini na moja', 'arobaini na mbili', 'arobaini na tatu', 'arobaini na nne',
    'arobaini na tano', 'arobaini na sita', 'arobaini na saba', 'arobaini na nane', 'arobaini na tisa',
    'hamsini',
  ],
  '인사/기본표현': [], // CLASSIFIED_WORD_INCLUSIONS 사용으로 대체
  '신체/건강': ['살아있다', '연명하다', '렌즈', '자살', '약한', '흔들리다', '샤워하다', '약화되다', '앉다', '강간하다', '취하다', '크림', '뜨거운', '잊다', '이', '해로운', '듣다', '미끄러지다', '취약성', '노출', '쳐다보다', '긴장한', '찌르다', '벌거벗은', '보험', '들리다', '독성이 있는', '팔', '긁다', '만지다', '빨다', '열', '씻다', '피해', '한숨', '고문', '목욕하다', '담배', '따귀를 때리다', '끄덕이다', '죽은', '광학의', '살', '편하다', '치명적인', '담배를 피우다', 'kuvua', 'kurudisha', 'mpira wa miguu', 'kuogelea', 'dharura', 'glovu za ndondi', 'kugusa', 'dalili', 'ngozi', 'kuzeeka', 'kuimarisha', 'nyonya', 'kufyonza', 'kuua', 'kushtua', 'kukodolea', 'kukodolea macho', 'kwa afya', 'kutetemeka', 'tishu', 'inayodhuru', 'sugua', 'kusikika', 'uogeleaji', 'tetemeka', 'mkia', 'kutoa moshi', 'dunga', 'marathoni', 'ogelea', 'mfu', 'lamba'],
  '시간/날짜': ['원래', '새로', '새로운', '행사', '곤 하다', '비롯되다', '가까이', '다시', '젊다', '예비(의)', '예비', '예비의', '더 이상', '약속', '진행', '발생하다', '형량', '거예요', '대기하다', '끊임없이', '반복되다', '연속', '역사적인', '진행 중인', '나이를 먹다', '불가피하다', '기회', '기념(의)', '영구히', '근속 기간', '일어나다', '갱신하다', '때우다', '끝없는', '축제', '끝내다', '전환', '건너뛰다', '수업', '전망', '달', '간격', '결국', '깨우다', '탄생', '예언하다', '기록하다', 'awali', 'kamwe', 'kutokea', 'tamasha', 'mwelekeo', 'upesi', 'sherehe', 'amsha', 'kawaida', 'kutokuwepo', 'hafla', 'bize', 'ya awali', 'mtarajiwa', 'mwenendo', 'kusubiri', 'ghairi', 'ukuaji', 'ya kikoloni', 'retreati', 'debuti', 'kubaki', 'haijawahi kutokea', 'kukaribia', 'ya mwisho'],
  '색상/외모': [
    'muundo', 'katikati', 'thabiti', 'wima', 'laini', 'kipekee', 'nyembamba', 'ya kuvutia', 'kubwa mno', 'hafifu', 'wa kipekee', 'kufifia', 'iliyopinda', 'urefu', 'dhaifu', 'mbovu', 'pana', 'jaketi', 'kuu', 'ndogo sana', 'fupi', 'kizamani', 'kubwa sana', 'tupu', 'uzuri', 'saizi', 'maalum', 'nene', 'isiyo ya kawaida', 'umbo', 'uchi', 'kwaonekana', 'iliyofichwa', 'fanana', 'ya mstari', 'nzima', 'sambamba', 'ya thamani', 'maridadi', 'ya dhahabu', 'urembo', 'ndogo', 'bandia', 'kubwa', 'ndefu', 'ya kiwango kikubwa', 'kirefu', 'pana sana', 'imara', 'yabisi', 'moto', 'mbichi', 'imetawanyika', 'bado nzima', 'mkunjo', 'kunywea', 'butu', 'mikunjo', 'huru', 'sawa kabisa', 'inayolingana', 'bei nafuu', 'kuakisi', 'ya umbo la', 'mviringo', 'kupaka rangi', 'nyororo', 'mtupu', 'legevu', 'mpya', 'yenye kelele', 'kutoshea', 'pinki', 'asiyeonekana', "ang'avu", 'kufanana', 'kigeni', 'ghafi', 'mraba', 'bayana', 'ukubwa', 'kifupi', 'finyu', 'ya kizamani', 'iliyoenea sana', 'ya pembeni', 'ulinganifu', 'imepinda', 'nyepesi', 'ya kisasa', 'kamilifu', 'tambarare', 'upana', 'kifahari', 'changa', 'mitindo', 'poda', 'kugeuka njano', 'onekana', 'picha ya uso', 'buluu',
    '흩어져 있는', '힙한', '평평하다', '장관이다',
    '보이지 않는', '덮인', '보이다', '사랑스러운', '수직의', '높다', '두드러진', '단단한',
    '모양의', '낮추다', '형태', '작은', '긴', '헐렁한', '엄청난', '큰', '깊은', '크다', '튼튼한', '느슨한',
    '보이는', '무겁다',
    '엄청나다', '두드러지다',
    '어둡다', '투명한', '광대한', '두꺼운', '넓은', '넓히다', '빽빽한', '특징', '시끄러운',
    '휘어진', '규모', '중간의', '뻣뻣한', '진하다', '광범위한', '극명하다', '은', '사소한',
    '곡선', '단단하다', '깊이', '표면', '선명함', '희미한', '딱 맞다',
    '미적', '광범위하게', '광범위하다', '사소하다',
    '숨겨진', '완전한', '완전하다', '극단적인', '한가운데', '뒤섞인', '굵은', '사이즈',
    '깔끔한', '유명하다', '생생하다', '응시하다', '뚜렷한', '스타일', '비슷한', '비슷하다',
    '비슷하게', '디자인', '구식이다', '정사각형', '눈에 띄는', '아주 작은', '평범한',
    '온전한', '벌거벗은', '똑같은', '독특한', '독특하다', '울퉁불퉁한', '평평한', '평평하다',
    '라지', '평행한', '거대한', '꽉 끼다', '흠', '낮다', '길이', '멋있다',
    '식민지풍의', '선형의', '시끄럽다', '멋진', '특이한', '특이하다', '밝다', '좁은', '얕다', '흔한', '안쪽의',
    '청바지', '아름다움', '모자', '매력적인', '포즈를 취하다',
  ],
  '교통/이동': ['kituo cha kuhifadhi', 'tozo', 'ukodishaji', 'chini ya', 'msafara', 'ya mkoani', 'kupotea', 'mahali fulani', 'kutoroka', 'piga mpira', 'kutikisa', 'inayoongoza', 'ushambuliaji wa bomu', 'endelea', 'kugeuza', 'kupiga risasi', 'boya', 'hapo', 'tambaa', 'bawa', 'fuata', 'kutokana na', 'kupatikana', 'tairi la akiba', 'kupaa', 'alama ya njia', 'fuatilia', 'zingira', 'kuzurura', 'kando', 'ya wanamaji', 'kusonga', 'rusha', 'inua', 'roketi', 'kunyakua', 'kuposti', 'buruta',
    '떨어지다', '스위트룸', '부터',
    '다가오다', '옆으로', '뒤흔들다', '전화', '탱크', '데려다주다', '쫓다',
    '구경하다', '짐', '날다', '가져오다', '숨다', '서킷', '닿다',
    '매달리다',
    '사이', '올리다', '어딘가', '스키를 타다', '로켓', '위쪽의', '끌어내다', '통해', '예약하다',
    '나란히', '아래로', '주변에', '다른 곳에', '흔들다', '아래에', '말', '어디에나', '회전하다',
    '급습하다', '경주하다', '되찾다', '서쪽', '화물', '동쪽', '가운데',
    '천천히', '접근하다', '찾다', '추적하다', '변두리의', '거꾸로', '옆', '구간',
    '북쪽의', '경계', '떨어져', '가까운', '돌리다', '위의', '경주장', '줄', '치솟다', '회전',
    '경주용', '피하다', '제트기', '싣다', '예약', '옆에', '쏘다', '표', '튕기다', '뛰어오르다', '옮기다', '숙소', '오르다', '조종사', '앞서 있는',
  ],
  '음식/음료': ['kuvua samaki', 'mbichi', '칼', '펍', '저녁', '접시', '그릇', '병', '샷', '밥솥', '숟가락',
    '프라이팬', '휘젓다', '젖을 짜다', '건배', '진하다',
    '냉장고', '취하다', '젓다', '단식하다', '슈퍼마켓', '서빙하다'],
  '가족/관계': [
    'kufungia', 'uhamisho', 'sadaka', 'uvumi', 'kuachiliwa',
    '함께', '성인', '누구나', '신사', '사람들', '소년', '유괴하다', '그들', '구걸하다', '키우다',
    '엘리트', '장례식', '그들의', '먹이다', '떠넘기다', '민주주의', '로비', '마피아',
    '공주', '겁쟁이', '보호하다', '관련되다', '집회하다', '건네다', '대우', '도둑',
    '돌보다', '사적인', '개입하다', '사람', '수감자', '피고인', '삼촌', '호의', '남편', '청취자',
    '그들의 것', '군중', '무리', '존경하다', '누군가', '시위', '전쟁', '여행자', '돕다', '참견하다',
    '마주치다', '시민', '양보', '일러바치다', '사이비', '영웅', '나라',
    '인종차별주의자', '노예제', '그에게', '집단학살', '전통', '임신하다', '사랑하는', '통일하다', '훈계하다',
    '떠보다', '프로필', '그의', '그', '소문', '유모차', '결혼식', '사생활', '맹세하다', '의존적인',
    '위반자', '외국의', '자선단체', '협조', '총격', '증언', '부족의', '타협하다', '협상', '안다',
    '물려받다', '모임', '용돈', '그녀', '도와주다', '그녀의', '노숙인', '참가자', '고백',
    '죄수', '사이비 종교', '나눠 주다',
    '학대하다', '인도주의적', '존엄', '공유하다', '펑크족', '공평', '남자', '대표단', '관객', '집결하다',
    '소개', '특권', '단합하다', '보호적인', '빌려주다',
    '범죄자', '사회적인', '키스하다', '불평등', '임신', '시위자', '제국',
    '숙녀', '상호작용',
    '참가하다', '유명인', '답장하다', '참여', '합의',
    '임신한', '기부', '관중', '집단', '국가', '사회', '협력하다', '개인',
  ],
  '자연/동물': [
    'shetani', 'lowe', 'jitu', 'asilia', 'kuchimbua', 'kiputo', 'chafua', 'mtiririko', 'gamba', 'tambaa', 'bawa', 'cheche', 'baridi', 'kunguruma', 'hazina',
    '반짝이다', '전 세계적으로', '젖은', '키우다', '따뜻한', '보고', '본토', '묻다', '슬로프', '불타다', '잔해', '접하다', '사그라들다',
    '노리다',
    '거품', '액체', '폭발', '밀도', '무리',
    '탐험하다', '흡수하다', '가라앉다', '어둡다', '자연스러운', '그늘', '외계인', '모래를 뿌리다', '공터', '껍데기', '괴물', '불꽃', '스키', '가스', '가죽',
    '혹독한', '부표', '쫓다', '유기된', '외딴', '젖다', '친환경적인', '예보하다',
    '그림자', '천사', '낚시하다', '빛나다', '울리다', '남쪽의', '유기적인', '다이빙하다', '익사하다', '모피', '낚시',
    '캠핑', '독성이 있는', '폭발하다', '뻥', '현상',
    '물에 빠지다', '자라다',
  ],
  '집/생활용품': [
    ...(houseExclusions as string[]),
    '사용하다', '찢다', '남겨 두다', '입다', '벤치', '낚싯바늘', '환전', '쏟다', '설명서', '깨끗한', '작동 방식', '접다', '현수막', '합치다', '캔버스', '상자', '뒤집다', '채찍', '장비', '문화', '여백', '퍼내다', '차지하다',
    '고정장치', '고치다', '걸다', '첨부파일', '지도 범례', '범례', '첨부하다', '파이프', '삽입', '닫힌', '쓰레기', '깨끗하다', '비용', '대체하다', '구석', '층', '가닥', '고향', '사용법', '닦다', '경매', '나무로 된', '비우다',
    '수리하다', '두다', '교체', '위에', '장소', '수리된', '데크', '재산', '블록', '수집', '영수증', '시설', '패치', '방앗간', '목재', '교외의',
    '놓다', '바꾸다', '채우다', '점', '붙이다', '열다', '장벽', '무기', '계단참', '고정하다', '지출', '나무', '텐트', '결함', '피난처', '천', '가리다', '텅 빈', '정리하다', '처리', '버리다', '생활방식', '온실', '비단', '악기',
    'ndani', 'ndoano', 'weka', 'ujumbe mfupi', 'kufunga', 'pengo', 'soko', 'bandika', 'nje',
    'kupasha joto', 'hati', 'kutia mfukoni', 'sarafu', 'ubadilishaji', 'hifadhi', 'kufungua',
    'kupachika', 'kujaza', 'kipengele', 'kuambatisha', 'kiambatisho', 'kombe',
    'sehemu', 'kuchomeka', 'kuchanganyika', 'mchanganyiko', 'juu ya', 'badilisha',
    'doa',
    'penalti', 'kizuizi', 'turubai', 'ya ndani', 'uingizaji', 'kukwama', 'nyuzi',
    'kona', 'kitalu', 'upanga', 'rekebisha', 'msikiti', 'urejeshaji', 'kufungwa',
    'ujumbe wa maandishi', 'kubandika',
    'kuweka', 'tenga', 'kusugua', 'mpira wa kikapu',
    'dawati',
    'kuchangisha', 'ufunguo',
    'kupekua',
    'kutundika', 'kupiga mlango', 'kipengee', 'takataka', 'nata', 'gogo',
    'wekea alama', 'kuchanika', 'mfuatano wa herufi',
  ],
}

/** "모든 단어"에서 마지막 Days에 숫자순으로 배치할 word IDs (NUMBER_ORDER 기반) */
export function getAllWordsNumberTailIds(mode: string): string[] {
  return NUMBER_ORDER[mode] || []
}

export function getOrderedWordIds(orderKey: string, mode: string): string[] {
  const map = ORDERED_MAPS[orderKey]
  if (!map) return []
  return (map[mode] || []).filter(Boolean)
}

export function getOrderedCount(orderKey: string, mode: string): number {
  const ids = getOrderedWordIds(orderKey, mode).length
  const exclusions = ORDERED_WORD_EXCLUSIONS[orderKey]?.length ?? 0
  return Math.max(0, ids - exclusions)
}

/** Machi 정적 fallback - KO 시간/날짜 전용 (Supabase 미응답 시 안전망) */
export const MACHI_FALLBACK_ROW = {
  id: '924e53f4-35e0-46a2-a894-a7d6eb3f2fda',
  mode: 'ko' as const,
  word: 'Machi',
  word_pronunciation: 'MA-chi' as string | null,
  word_audio_url: null as string | null,
  image_url: null as string | null,
  meaning_sw: 'Machi',
  meaning_sw_pronunciation: 'MA-chi' as string | null,
  meaning_sw_audio_url: null as string | null,
  meaning_ko: '3월',
  meaning_ko_pronunciation: 'samwol' as string | null,
  meaning_ko_audio_url: null as string | null,
  meaning_en: 'March',
  meaning_en_pronunciation: '/mɑːrtʃ/' as string | null,
  meaning_en_audio_url: null as string | null,
  example: 'Mwezi wa Machi una siku thelathini na moja.',
  example_pronunciation: 'mWE-zi wa MA-chi U-na SI-ku the-la-THI-ni na MO-ja' as string | null,
  example_audio_url: null as string | null,
  example_translation_sw: null as string | null,
  example_translation_ko: '3월은 31일이 있어요.',
  example_translation_en: 'March has thirty-one days.',
  pos: 'n.',
  category: '시간',
  difficulty: 1,
  created_at: new Date().toISOString(),
}

export function getClassifiedWordIds(topicName: string, mode: string): string[] {
  const data = getClassificationData()
  const ids: string[] = []
  for (const [id, arr] of Object.entries(data)) {
    if (!arr || arr.length < 2) continue
    if (arr[0] === mode && arr.slice(1).includes(topicName)) {
      ids.push(id)
    }
  }
  return ids
}

export function getClassifiedCount(topicName: string, mode: string): number {
  return getClassifiedWordIds(topicName, mode).length
}

/**
 * 분류 단어장에 표시할 단어 수.
 * `CLASSIFIED_MAX_DAYS`가 정의된 토픽(예: 일상생활 5일, 집/생활용품 3일)은 Day 목록과 동일하게 상한을 둠.
 */
export function getClassifiedDisplayCount(
  topicName: string,
  mode: string,
  wordsPerDay = 40,
): number {
  const inclusions = getClassifiedInclusions(topicName, mode as 'ko' | 'sw')
  const raw = inclusions?.length ? inclusions.length : getClassifiedCount(topicName, mode)
  const maxDays = CLASSIFIED_MAX_DAYS[topicName]
  return maxDays != null ? Math.min(raw, maxDays * wordsPerDay) : raw
}

/** 제외 적용 후 실제 남는 단어 수 (비동기, fetcher로 데이터 조회) */
export async function getClassifiedCountAsync(
  topicName: string,
  mode: string,
  fetcher: (ids: string[]) => Promise<{ word?: string | null }[]>,
  wordFetcher?: (words: string[]) => Promise<{ word?: string | null }[]>,
): Promise<number> {
  const inclusions = getClassifiedInclusions(topicName, mode as 'ko' | 'sw')
  if (inclusions?.length && wordFetcher) {
    const rows = await wordFetcher(inclusions)
    return rows.filter((r) => r.word).length
  }
  const ids = getClassifiedWordIds(topicName, mode)
  if (ids.length === 0) return 0
  const exclusions = CLASSIFIED_WORD_EXCLUSIONS[topicName]
  const rows = await fetcher(ids)
  const excludedSet = new Set(exclusions ?? [])
  let filtered = rows.filter((r) => !excludedSet.has(r.word ?? ''))
  const day1Excl = CLASSIFIED_DAY1_EXCLUSIONS[topicName]
  const day1Incl = getClassifiedDay1Inclusions(topicName, mode as 'ko' | 'sw')
  if (day1Incl?.length && day1Excl?.length) {
    const day1ExclSet = new Set(day1Excl)
    filtered = filtered.filter((r) => !day1ExclSet.has(r.word ?? ''))
  }
  return filtered.length
}

export function isWordInClassifiedTopic(
  wordId: string,
  topicName: string,
): boolean {
  const data = getClassificationData()
  const arr = data[wordId]
  if (!arr || arr.length < 2) return false
  return arr.slice(1).includes(topicName)
}

/** 분류별 Day 1 우선 정렬 순서 (해당 순서대로 앞에 배치) */
export const COLOR_APPEARANCE_WORD_ORDER: Record<string, string[]> = {
  '숫자/수량': [
    // 1월~12월 (KO mode: Swahili word / SW mode: Korean word)
    'Januari', '1월',
    'Februari', '2월',
    'Machi', '3월',
    'Aprili', '4월',
    'Mei', '5월',
    'Juni', '6월',
    'Julai', '7월',
    'Agosti', '8월',
    'Septemba', '9월',
    'Oktoba', '10월',
    'Novemba', '11월',
    'Desemba', '12월',
    // 월~일 (KO: Swahili / SW: Korean)
    'Jumatatu', '월요일',
    'Jumanne', '화요일',
    'Jumatano', '수요일',
    'Alhamisi', '목요일',
    'Ijumaa', '금요일',
    'Jumamosi', '토요일',
    'Jumapili', '일요일',
    // 50 이상 큰 수
    'sitini', 'sabini', 'themanini', 'tisini',
    'mia', 'elfu', 'milioni', 'bilioni', 'trilioni',
    // 0
    'sifuri',
    // 서수
    'kwanza', 'pili', 'ya tatu', 'ya nne', 'wa tatu', 'wa pili', 'yule wa pili',
    // 분수/배수
    'nusu', 'robo', 'mara mbili', 'wote wawili', 'sehemu moja ya tano', 'maradufu', 'dazeni', 'trio',
    // 단위
    'senti', 'lita', 'mita', 'kilomita', 'maili', 'futi', 'inchi', 'yadi', 'eka', 'ekari', 'galoni', 'tani',
    // 숫자/번호, 세다
    'nambari', 'hesabu', 'kuhesabu', 'kuweka namba', 'kuweka nambari',
    // 양/수량
    'kiasi', 'bei', 'jumla', 'idadi', 'yote', 'kila', 'nyingi', 'wengi', 'wote',
    'zaidi', 'zaidi ya', 'kidogo', 'kidogo tu', 'kidogo kabisa',
    'kadhaa', 'baadhi', 'baadhi ya', 'wachache',
    // 수학/측정
    'kugawanya', 'gawanya', 'gawa', 'kuongeza', 'ongeza', 'ongezeko',
    'kupunguza', 'pungua', 'kupungua', 'kuzidi', 'zidisha',
    'kupima', 'kupima uzito', 'kipimo', 'skeli',
    'wastani', 'asilimia', 'thamani', 'gharama',
  ],
  '시간/날짜': [
    // KO mode (word = Swahili)
    'Januari', 'Februari', 'Aprili',
    'Mei', 'Juni', 'Julai', 'Agosti', 'Septemba', 'Oktoba', 'Novemba', 'Desemba',
    'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi', 'Jumapili',
    // SW mode (word = Korean)
    '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월',
    '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일',
    // KO mode 한자어 월
    '일월', '이월', '삼월', '사월', '오월', '유월', '칠월', '팔월', '구월', '시월', '십일월', '십이월',
    // 시간
    'saa', 'saa moja', 'saa mbili', 'saa tatu', 'saa nne', 'saa tano',
    'saa sita', 'saa saba', 'saa nane', 'saa tisa', 'saa kumi',
    'saa kumi na moja', 'saa kumi na mbili',
    'asubuhi', 'mchana', 'jioni', 'usiku',
    'leo', 'kesho', 'jana', 'sasa', 'dakika', 'wiki', 'mwezi', 'mwaka',
    'mwezi wa kwanza', 'mwezi wa pili',
  ],
  '색상/외모': [
    // SW mode (word = Korean) — 색상 단어 우선
    '색', '색깔', '색상',
    '검은색', '검정', '검다',
    '흰색', '하얀', '하얗다',
    '빨간색', '빨간', '빨갛다',
    '파란색', '파란', '파랗다',
    '초록색', '초록',
    '노란색', '노란', '노랗다',
    '회색',
    '갈색',
    '보라색',
    '주황색',
    '분홍색', '핑크',
    '금색', '은색', '구리색', '황금색',
    '밝은', '어두운', '연한', '진한',
    '다채로운', '알록달록한', '유색의', '색이 있는', '무색의',
    '선명한', '화려한', '창백한',
    // SW mode — 외모·패션 기본
    '아름다운', '아름답다', '예쁘다', '귀엽다', '못생긴',
    '우아한', '세련된', '촌스럽다', '이국적인', '이국적이다',
    '키', '키가 큰', '마른', '몸매', '나이가 든',
    '패션', '유행', '스타일', '수수한', '캐주얼한',
    '장신구', '패턴', '어울리다', '어울리는',
    '매력', '매력적이다', '생기', '파우더', '빗질하다',
    // KO mode (word = Swahili)
    'rangi',
    'nyeusi',
    'nyeupe',
    'nyekundu',
    'kijani',
    'samawati',
    'bluu',
    'manjano',
    'njano',
    'kijivu',
    'kahawia',
    'zambarau',
    'chungwa',
    'hudhurungi',
    'machungwa',
    'waridi',
    'dhahabu',
    'fedha',
    'rangi ya fedha',
    'mchanga',
    'biringani',
    'damu',
    'fyulisi',
    'limau',
    'nili',
    'urujuwani',
    'zumaridi',
    'buluu nyeusi',
    'kijani nyeusi',
    'buluu-kijani',
    'kijani-manjano',
    'nyekundu-machungwa',
    'nyekundu-zambarau',
    'rangi ya chungwa',
    'rangi ya samawati',
    'rangi ya kijani',
    'rangi ya manjano',
    'rangi ya nyekundu',
    'rangi nyeusi',
    'rangi nyeupe',
  ],
}

/** 특정 분류의 단어 순서로 정렬 (order에 없는 단어는 뒤에, created_at 순 유지) */
export function sortClassifiedRowsByWordOrder<T extends { word?: string | null }>(
  rows: T[],
  classifiedKey: string,
): T[] {
  const order = COLOR_APPEARANCE_WORD_ORDER[classifiedKey]
  if (!order?.length) return rows
  const orderMap = new Map(order.map((w, i) => [w.toLowerCase(), i]))
  return [...rows].sort((a, b) => {
    const wa = (a.word ?? '').toLowerCase()
    const wb = (b.word ?? '').toLowerCase()
    const ia = orderMap.has(wa) ? orderMap.get(wa)! : Infinity
    const ib = orderMap.has(wb) ? orderMap.get(wb)! : Infinity
    if (ia !== ib) return ia - ib
    return 0
  })
}
