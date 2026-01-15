import { createInitialSrs } from '../lib/srs'
import { newId } from '../lib/id'
import type { VocabItem } from '../lib/types'

const now = Date.now()

type SeedWord = Omit<VocabItem, 'deckId'> & { deckId?: never }

function w(partial: Omit<SeedWord, 'id' | 'createdAt' | 'updatedAt' | 'srs'>): SeedWord {
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    srs: createInitialSrs(now),
    ...partial,
  }
}

/**
 * “케냐어” 요청을 실사용 관점에서 스와힐리어(케냐/탄자니아 공용) 기본 단어로 시드합니다.
 */
export const seedWords: SeedWord[] = [
  w({ sw: 'Jambo', ko: '안녕(인사)', en: 'hello', pos: 'interj.', tags: ['인사'] }),
  w({ sw: 'Habari?', ko: '어떻게 지내?', en: "how are you?", pos: 'phrase', tags: ['인사'] }),
  w({ sw: 'Nzuri', ko: '좋아/괜찮아', en: 'fine', pos: 'adj.', tags: ['인사'] }),
  w({ sw: 'Asante', ko: '고마워', en: 'thank you', pos: 'interj.', tags: ['기본'] }),
  w({ sw: 'Karibu', ko: '천만에/어서 와', en: "you're welcome / welcome", pos: 'interj.', tags: ['인사'] }),
  w({ sw: 'Tafadhali', ko: '부탁해요/제발', en: 'please', pos: 'adv.', tags: ['기본'] }),
  w({ sw: 'Samahani', ko: '죄송합니다/실례합니다', en: 'sorry / excuse me', pos: 'interj.', tags: ['기본'] }),
  w({ sw: 'Ndiyo', ko: '네', en: 'yes', pos: 'adv.', tags: ['기본'] }),
  w({ sw: 'Hapana', ko: '아니요', en: 'no', pos: 'adv.', tags: ['기본'] }),
  w({ sw: 'Sawa', ko: '좋아/오케이', en: 'okay', pos: 'interj.', tags: ['기본'] }),

  w({ sw: 'Leo', ko: '오늘', en: 'today', pos: 'n.', tags: ['시간'] }),
  w({ sw: 'Kesho', ko: '내일', en: 'tomorrow', pos: 'n.', tags: ['시간'] }),
  w({ sw: 'Jana', ko: '어제', en: 'yesterday', pos: 'n.', tags: ['시간'] }),
  w({ sw: 'Sasa', ko: '지금', en: 'now', pos: 'adv.', tags: ['시간'] }),

  w({ sw: 'Moja', ko: '1', en: 'one', pos: 'num.', tags: ['숫자'] }),
  w({ sw: 'Mbili', ko: '2', en: 'two', pos: 'num.', tags: ['숫자'] }),
  w({ sw: 'Tatu', ko: '3', en: 'three', pos: 'num.', tags: ['숫자'] }),
  w({ sw: 'Nne', ko: '4', en: 'four', pos: 'num.', tags: ['숫자'] }),
  w({ sw: 'Tano', ko: '5', en: 'five', pos: 'num.', tags: ['숫자'] }),

  w({ sw: 'Chakula', ko: '음식', en: 'food', pos: 'n.', tags: ['생활'] }),
  w({ sw: 'Maji', ko: '물', en: 'water', pos: 'n.', tags: ['생활'] }),
  w({ sw: 'Chai', ko: '차', en: 'tea', pos: 'n.', tags: ['생활'] }),
  w({ sw: 'Kahawa', ko: '커피', en: 'coffee', pos: 'n.', tags: ['생활'] }),

  w({ sw: 'Nyumba', ko: '집', en: 'house', pos: 'n.', tags: ['생활'] }),
  w({ sw: 'Soko', ko: '시장', en: 'market', pos: 'n.', tags: ['장소'] }),
  w({ sw: 'Shule', ko: '학교', en: 'school', pos: 'n.', tags: ['장소'] }),
  w({ sw: 'Hospitali', ko: '병원', en: 'hospital', pos: 'n.', tags: ['장소'] }),

  w({ sw: 'Rafiki', ko: '친구', en: 'friend', pos: 'n.', tags: ['사람'] }),
  w({ sw: 'Familia', ko: '가족', en: 'family', pos: 'n.', tags: ['사람'] }),

  w({ sw: 'Nataka', ko: '나는 ~을 원해', en: 'I want', pos: 'v.', tags: ['표현'] }),
  w({ sw: 'Naomba', ko: '~ 주세요', en: 'I request / please give me', pos: 'v.', tags: ['표현'] }),
  w({ sw: 'Ninaelewa', ko: '이해해요', en: 'I understand', pos: 'v.', tags: ['표현'] }),
  w({ sw: 'Sielewi', ko: '이해 못 해요', en: "I don't understand", pos: 'v.', tags: ['표현'] }),
  w({ sw: 'Unasema Kiingereza?', ko: '영어 하세요?', en: 'Do you speak English?', pos: 'phrase', tags: ['여행'] }),

  w({ sw: 'Bei gani?', ko: '얼마예요?', en: 'How much is it?', pos: 'phrase', tags: ['여행'] }),
  w({ sw: 'Niko wapi?', ko: '여기가 어디죠?', en: 'Where am I?', pos: 'phrase', tags: ['여행'] }),
  w({ sw: 'Naenda ...', ko: '저는 ...로 가요', en: 'I am going to ...', pos: 'phrase', tags: ['여행'] }),
  w({ sw: 'Msaada', ko: '도움', en: 'help', pos: 'n.', tags: ['긴급'] }),
  w({ sw: 'Pole', ko: '유감이에요/힘내요', en: 'sorry (sympathy)', pos: 'interj.', tags: ['인사'] }),
]


