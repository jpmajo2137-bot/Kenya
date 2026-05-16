/**
 * Shared Hangeul learning data used by HangeulScreen.tsx.
 * Pronunciation audio is served exclusively from Supabase Storage cache
 * (`tts-cache/<lang>/<sha1>.mp3`), with Web Speech as runtime fallback.
 */

export type Letter = {
  char: string
  roman: string
  syllable: string
  /**
   * 자음의 정식 이름(기역, 니은, 디귿 …). 모음은 글자 자체가 이름이므로 생략한다.
   * 글자 카드/큰 발음 버튼은 이 값이 있으면 음절 대신 이 이름을 읽어 준다.
   */
  name?: string
  /** 자음 이름의 라틴 표기(giyeok, nieun …). 화면의 발음 부호로 표시한다. */
  nameRoman?: string
  /** 대표 음절의 라틴 표기(가=ga, 나=na …). 없으면 roman 을 사용한다. */
  syllableRoman?: string
  exampleKo: string
  exampleRoman: string
  exampleSw: string
  exampleKoMeaning: string
  /** Hangul Jamo index. consonant = initial (0-18), vowel = medial (0-20). */
  jamoIdx: number
  kind: 'consonant' | 'vowel'
}

export const BASIC_CONSONANTS: Letter[] = [
  { char: '\u3131', roman: 'g / k', syllable: '\uAC00', syllableRoman: 'ga', name: '기역', nameRoman: 'giyeok', exampleKo: '\uAC00\uBC29', exampleRoman: 'gabang', exampleSw: 'mfuko', exampleKoMeaning: 'bag', jamoIdx: 0, kind: 'consonant' },
  { char: '\u3134', roman: 'n', syllable: '\uB098', syllableRoman: 'na', name: '니은', nameRoman: 'nieun', exampleKo: '\uB098\uBB34', exampleRoman: 'namu', exampleSw: 'mti', exampleKoMeaning: 'tree', jamoIdx: 2, kind: 'consonant' },
  { char: '\u3137', roman: 'd / t', syllable: '\uB2E4', syllableRoman: 'da', name: '디귿', nameRoman: 'digeut', exampleKo: '\uB2E4\uB9AC', exampleRoman: 'dari', exampleSw: 'daraja', exampleKoMeaning: 'leg', jamoIdx: 3, kind: 'consonant' },
  { char: '\u3139', roman: 'r / l', syllable: '\uB77C', syllableRoman: 'ra', name: '리을', nameRoman: 'rieul', exampleKo: '\uB77C\uBA74', exampleRoman: 'ramyeon', exampleSw: 'ramen', exampleKoMeaning: 'ramen', jamoIdx: 5, kind: 'consonant' },
  { char: '\u3141', roman: 'm', syllable: '\uB9C8', syllableRoman: 'ma', name: '미음', nameRoman: 'mieum', exampleKo: '\uB9C8\uC74C', exampleRoman: 'maeum', exampleSw: 'moyo', exampleKoMeaning: 'mind', jamoIdx: 6, kind: 'consonant' },
  { char: '\u3142', roman: 'b / p', syllable: '\uBC14', syllableRoman: 'ba', name: '비읍', nameRoman: 'bieup', exampleKo: '\uBC14\uB2E4', exampleRoman: 'bada', exampleSw: 'bahari', exampleKoMeaning: 'sea', jamoIdx: 7, kind: 'consonant' },
  { char: '\u3145', roman: 's', syllable: '\uC0AC', syllableRoman: 'sa', name: '시옷', nameRoman: 'siot', exampleKo: '\uC0AC\uB78C', exampleRoman: 'saram', exampleSw: 'mtu', exampleKoMeaning: 'person', jamoIdx: 9, kind: 'consonant' },
  { char: '\u3147', roman: 'a / ng', syllable: '\uC544', syllableRoman: 'a', name: '이응', nameRoman: 'ieung', exampleKo: '\uC544\uAE30', exampleRoman: 'agi', exampleSw: 'mtoto', exampleKoMeaning: 'baby', jamoIdx: 11, kind: 'consonant' },
  { char: '\u3148', roman: 'j', syllable: '\uC790', syllableRoman: 'ja', name: '지읒', nameRoman: 'jieut', exampleKo: '\uC790\uB3D9\uCC28', exampleRoman: 'jadongcha', exampleSw: 'gari', exampleKoMeaning: 'car', jamoIdx: 12, kind: 'consonant' },
  { char: '\u314A', roman: 'ch', syllable: '\uCC28', syllableRoman: 'cha', name: '치읓', nameRoman: 'chieut', exampleKo: '\uCC28', exampleRoman: 'cha', exampleSw: 'chai', exampleKoMeaning: 'tea', jamoIdx: 14, kind: 'consonant' },
  { char: '\u314B', roman: 'k', syllable: '\uCE74', syllableRoman: 'ka', name: '키읔', nameRoman: 'kieuk', exampleKo: '\uCE74\uBA54\uB77C', exampleRoman: 'kamera', exampleSw: 'kamera', exampleKoMeaning: 'camera', jamoIdx: 15, kind: 'consonant' },
  { char: '\u314C', roman: 't', syllable: '\uD0C0', syllableRoman: 'ta', name: '티읕', nameRoman: 'tieut', exampleKo: '\uD0C0\uC870', exampleRoman: 'tajo', exampleSw: 'mbuni', exampleKoMeaning: 'ostrich', jamoIdx: 16, kind: 'consonant' },
  { char: '\u314D', roman: 'p', syllable: '\uD30C', syllableRoman: 'pa', name: '피읖', nameRoman: 'pieup', exampleKo: '\uD30C\uB3C4', exampleRoman: 'pado', exampleSw: 'wimbi', exampleKoMeaning: 'wave', jamoIdx: 17, kind: 'consonant' },
  { char: '\u314E', roman: 'h', syllable: '\uD558', syllableRoman: 'ha', name: '히읗', nameRoman: 'hieut', exampleKo: '\uD558\uB298', exampleRoman: 'haneul', exampleSw: 'anga', exampleKoMeaning: 'sky', jamoIdx: 18, kind: 'consonant' },
]

export const DOUBLE_CONSONANTS: Letter[] = [
  { char: '\u3132', roman: 'kk', syllable: '\uAE4C', syllableRoman: 'kka', name: '쌍기역', nameRoman: 'ssanggiyeok', exampleKo: '\uAE4C\uCE58', exampleRoman: 'kkachi', exampleSw: 'magpie', exampleKoMeaning: 'magpie', jamoIdx: 1, kind: 'consonant' },
  { char: '\u3138', roman: 'tt', syllable: '\uB530', syllableRoman: 'tta', name: '쌍디귿', nameRoman: 'ssangdigeut', exampleKo: '\uB545', exampleRoman: 'ttang', exampleSw: 'ardhi', exampleKoMeaning: 'ground', jamoIdx: 4, kind: 'consonant' },
  { char: '\u3143', roman: 'pp', syllable: '\uBE60', syllableRoman: 'ppa', name: '쌍비읍', nameRoman: 'ssangbieup', exampleKo: '\uBE75', exampleRoman: 'ppang', exampleSw: 'mkate', exampleKoMeaning: 'bread', jamoIdx: 8, kind: 'consonant' },
  { char: '\u3146', roman: 'ss', syllable: '\uC2F8', syllableRoman: 'ssa', name: '쌍시옷', nameRoman: 'ssangsiot', exampleKo: '\uC300', exampleRoman: 'ssal', exampleSw: 'mchele', exampleKoMeaning: 'rice', jamoIdx: 10, kind: 'consonant' },
  { char: '\u3149', roman: 'jj', syllable: '\uC9DC', syllableRoman: 'jja', name: '쌍지읒', nameRoman: 'ssangjieut', exampleKo: '\uC9DC\uB2E4', exampleRoman: 'jjada', exampleSw: 'kuwa na chumvi', exampleKoMeaning: 'salty', jamoIdx: 13, kind: 'consonant' },
]

export const BASIC_VOWELS: Letter[] = [
  { char: '\u314F', roman: 'a', syllable: '\uC544', exampleKo: '\uC544\uAE30', exampleRoman: 'agi', exampleSw: 'mtoto', exampleKoMeaning: 'baby', jamoIdx: 0, kind: 'vowel' },
  { char: '\u3151', roman: 'ya', syllable: '\uC57C', exampleKo: '\uC57C\uAD6C', exampleRoman: 'yagu', exampleSw: 'baseball', exampleKoMeaning: 'baseball', jamoIdx: 2, kind: 'vowel' },
  { char: '\u3153', roman: 'eo', syllable: '\uC5B4', exampleKo: '\uC5B4\uBA38\uB2C8', exampleRoman: 'eomeoni', exampleSw: 'mama', exampleKoMeaning: 'mother', jamoIdx: 4, kind: 'vowel' },
  { char: '\u3155', roman: 'yeo', syllable: '\uC5EC', exampleKo: '\uC5EC\uC790', exampleRoman: 'yeoja', exampleSw: 'mwanamke', exampleKoMeaning: 'woman', jamoIdx: 6, kind: 'vowel' },
  { char: '\u3157', roman: 'o', syllable: '\uC624', exampleKo: '\uC624\uB9AC', exampleRoman: 'ori', exampleSw: 'bata', exampleKoMeaning: 'duck', jamoIdx: 8, kind: 'vowel' },
  { char: '\u315B', roman: 'yo', syllable: '\uC694', exampleKo: '\uC694\uB9AC', exampleRoman: 'yori', exampleSw: 'chakula', exampleKoMeaning: 'cooking', jamoIdx: 12, kind: 'vowel' },
  { char: '\u315C', roman: 'u', syllable: '\uC6B0', exampleKo: '\uC6B0\uC720', exampleRoman: 'uyu', exampleSw: 'maziwa', exampleKoMeaning: 'milk', jamoIdx: 13, kind: 'vowel' },
  { char: '\u3160', roman: 'yu', syllable: '\uC720', exampleKo: '\uC720\uB9AC', exampleRoman: 'yuri', exampleSw: 'kioo', exampleKoMeaning: 'glass', jamoIdx: 17, kind: 'vowel' },
  { char: '\u3161', roman: 'eu', syllable: '\uC73C', exampleKo: '\uC74C\uC2DD', exampleRoman: 'eumsik', exampleSw: 'chakula', exampleKoMeaning: 'food', jamoIdx: 18, kind: 'vowel' },
  { char: '\u3163', roman: 'i', syllable: '\uC774', exampleKo: '\uC774\uB984', exampleRoman: 'ireum', exampleSw: 'jina', exampleKoMeaning: 'name', jamoIdx: 20, kind: 'vowel' },
]

export const COMPOUND_VOWELS: Letter[] = [
  { char: '\u3150', roman: 'ae', syllable: '\uC560', exampleKo: '\uC560\uAE30', exampleRoman: 'aegi', exampleSw: 'mtoto', exampleKoMeaning: 'baby', jamoIdx: 1, kind: 'vowel' },
  { char: '\u3152', roman: 'yae', syllable: '\uC598', exampleKo: '\uC598\uAE30', exampleRoman: 'yaegi', exampleSw: 'mazungumzo', exampleKoMeaning: 'story', jamoIdx: 3, kind: 'vowel' },
  { char: '\u3154', roman: 'e', syllable: '\uC5D0', exampleKo: '\uC5D0\uC5B4\uCEE8', exampleRoman: 'eeokeon', exampleSw: 'AC', exampleKoMeaning: 'air conditioner', jamoIdx: 5, kind: 'vowel' },
  { char: '\u3156', roman: 'ye', syllable: '\uC608', exampleKo: '\uC608\uC220', exampleRoman: 'yesul', exampleSw: 'sanaa', exampleKoMeaning: 'art', jamoIdx: 7, kind: 'vowel' },
  { char: '\u3158', roman: 'wa', syllable: '\uC640', exampleKo: '\uC640\uC778', exampleRoman: 'wain', exampleSw: 'mvinyo', exampleKoMeaning: 'wine', jamoIdx: 9, kind: 'vowel' },
  { char: '\u3159', roman: 'wae', syllable: '\uC65C', exampleKo: '\uC65C', exampleRoman: 'wae', exampleSw: 'kwa nini', exampleKoMeaning: 'why', jamoIdx: 10, kind: 'vowel' },
  { char: '\u315A', roman: 'oe', syllable: '\uC678', exampleKo: '\uC678\uAD6D', exampleRoman: 'oeguk', exampleSw: 'nje ya nchi', exampleKoMeaning: 'foreign country', jamoIdx: 11, kind: 'vowel' },
  { char: '\u315D', roman: 'wo', syllable: '\uC6CC', exampleKo: '\uC6D0\uC22D\uC774', exampleRoman: 'wonsungi', exampleSw: 'tumbili', exampleKoMeaning: 'monkey', jamoIdx: 14, kind: 'vowel' },
  { char: '\u315E', roman: 'we', syllable: '\uC6E8', exampleKo: '\uC6E8\uC774\uD130', exampleRoman: 'weiteo', exampleSw: 'mhudumu', exampleKoMeaning: 'waiter', jamoIdx: 15, kind: 'vowel' },
  { char: '\u315F', roman: 'wi', syllable: '\uC704', exampleKo: '\uC704', exampleRoman: 'wi', exampleSw: 'juu', exampleKoMeaning: 'top', jamoIdx: 16, kind: 'vowel' },
  { char: '\u3162', roman: 'ui', syllable: '\uC758', exampleKo: '\uC758\uC790', exampleRoman: 'uija', exampleSw: 'kiti', exampleKoMeaning: 'chair', jamoIdx: 19, kind: 'vowel' },
]

export type Category = 'basic-consonant' | 'double-consonant' | 'basic-vowel' | 'compound-vowel'

/** Compose a Hangeul syllable: 0xAC00 + (initial*588) + (medial*28) + final */
export function composeSyllable(initialIdx: number, medialIdx: number, finalIdx = 0): string {
  return String.fromCharCode(0xac00 + initialIdx * 588 + medialIdx * 28 + finalIdx)
}

/**
 * Returns every text the Hangeul screen may pronounce, deduplicated.
 * Used to enumerate cache candidates for the Storage TTS cache.
 */
export function getAllHangeulTtsTexts(): string[] {
  const set = new Set<string>()
  const allLetters = [
    ...BASIC_CONSONANTS,
    ...DOUBLE_CONSONANTS,
    ...BASIC_VOWELS,
    ...COMPOUND_VOWELS,
  ]
  for (const l of allLetters) {
    set.add(l.syllable)
    set.add(l.exampleKo)
    if (l.name) set.add(l.name)
  }
  const allConsonants = [...BASIC_CONSONANTS, ...DOUBLE_CONSONANTS]
  for (const c of allConsonants) {
    for (const v of BASIC_VOWELS) {
      set.add(composeSyllable(c.jamoIdx, v.jamoIdx))
    }
  }
  const allVowels = [...BASIC_VOWELS, ...COMPOUND_VOWELS]
  for (const v of allVowels) {
    for (const c of BASIC_CONSONANTS) {
      set.add(composeSyllable(c.jamoIdx, v.jamoIdx))
    }
  }
  return Array.from(set)
}
