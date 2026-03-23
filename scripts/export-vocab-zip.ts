/**
 * 모든 단어장 데이터를 교정(오버라이드) 적용 후 ZIP으로 내보내기
 * 오디오(TTS) 및 이미지 파일도 실제 파일로 다운로드하여 포함
 *
 * 사용: npx tsx scripts/export-vocab-zip.ts
 *
 * 출력: exports/kenya-vocab-export-{timestamp}.zip
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import archiver from 'archiver'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY!
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Display Overrides (import from source) ───
// We duplicate here for Node.js compatibility since the source uses import.meta

const KO_DISPLAY_OVERRIDE: Record<string, string> = {
  신: '하나님', 하루: '날, 하루', '남겨 두다': '모아 두다',
  모의하다: '~의 모의 실험을 하다', '조수(물때)': '파도(물결)',
  두꺼운: '두꺼운, 걸쭉한, 진한', 파악하다: '이해하다, 파악하다',
  '(먼지를) 털다': '(먼지를) 털다, 닦다', 다채로운: '다채로운, 알록달록한',
  훌륭한: '멋진, 훌륭한', 정원: '정원, 공원', 생각: '아이디어, 생각',
  뛰다: '뛰다, 뛰어넘다', 기쁜: '기쁨, 기쁜, 만족스러운',
  '흉내 내다': '흉내내다, 모의로 하다', '어떤 ~든': '아무, 어떤 ~든',
  실내의: '실내에서', 오랫동안: '오래, 오랫동안', 놀람: '놀람, 쇼크',
  '~을 좋아하다': '~을 더 좋아하다, 선호하다', '결정(체)': '크리스탈, 결정(체)',
  논리적으로: '논리적인', 즉각적인: '즉각적인, 인스턴트',
  기절시키다: '정신을 혼미하게 하다', '종교인(설교자)': '성직자, 설교자',
  대통령직의: '대통령의', 취약한: '위험에 처한', 위험한: '치명적인',
  '회원 자격': '멤버십, 회원 자격', 단계: '단계, 위상',
  '(미) 정식 무도회': '(미) 정식 무도회, 갈라 행사',
  '~할 수 있었다/~일 수도 있다(가능성)': '(~할) 수 있을 텐데 / ~할 수 있을까(가정·공손한 가능)',
  종교인: '신앙인, 종교인', 몸짓: '신호, 제스처, 몸짓',
  '(~을) 활용하다': '이익을 얻다, (~을) 활용하다', 성악의: '보컬, 노래',
  적당히: '적절하게', 충분히: '충분한', 가상의: '온라인, 가상의',
  '졸고 있는': '졸고 있다', 대관절: '도대체, 대관절', 뚜렷한: '뚜렷하게',
  '(공기 등을) 넣어 부풀리기': '바람 넣다 / 공기 주입하다',
  '알legally': '~라고 주장된다 / ~라고 알려졌다',
  '(감정이 배제된) 냉정한': '감정 없이', 추방: '전근, 이주',
  '유사(성)': '유사(성), 유추, 비유', 삽입: '입력, 삽입',
  대통령직: '대통령직, 대통령직임, 대통령직 수행',
  '(비유적으로) 치열한 संघर्ष의 현장': '(비유적으로) 치열한 투쟁의 현장',
  위독하게: '위독한 상태로', 광학의: '검안, 안과, 광학',
  '(음악) 성악의': '(음악) 노래의, 보컬의, 성악의',
  '알legedly': '~라고 주장된다 / ~라고 알려졌다',
  allegedly: '~라고 주장된다 / ~라고 알려졌다',
  '지방 사람(지방 출신)': '지방/시골 쪽(지역)에(서)',
  '반어(법)': '조롱, 반어(법)',
}

const KO_DISPLAY_OVERRIDE_BY_WORD: Record<string, string> = {
  hasa: '특히',
}

const EN_DISPLAY_OVERRIDE: Record<string, string> = {
  about: 'around', breach: 'violate', comic: 'comedian', distinct: 'distinctly',
  inflation: 'inflate', medical: 'medical check-up', loom: 'approach',
  forge: "blacksmith's workshop", allegedly: 'to be alleged', outing: 'out',
  'beam of light': 'beam', 'to distance': 'distant', clinical: 'without emotion',
  cocktail: 'drug cocktail', critically: 'in critical condition', optical: 'optic',
  'a formal': 'formal dance', irony: 'mockery, irony', exile: 'relocation, transfer',
  'management; the act of running/organizing a business or team': 'management',
  'to exploit': 'to make good use', 'asleep; not aware': 'to doze off, to be drowsy',
  'provincial; person from the provinces': 'from the provinces',
  outstanding: 'unresolved', bridge: 'bridge of the nose',
  contract: 'to be infected, to catch', venture: 'dare', float: 'buoy',
  buck: 'male rabbit', male: 'male rabbit', pack: 'package',
  'to be late': 'late', cut: 'crop', cute: 'to be cute', fly: 'zipper',
  'to settle': 'calm down', aspire: 'operate',
  'to mind; to look after': 'to look after', possible: 'to be possible',
  aware: 'to be aware', offer: 'special offer', master: 'captain',
  passing: 'brief', report: 'pin', tight: 'to be tight',
  'to lie': 'to be located', throw: 'bin', delegate: 'to me',
  relieved: 'to be relieved', regard: 'regarding', resolve: 'decide',
  'to ring': 'call', 'to present': 'introduce',
  alarm: 'shock, fright, alarm', 'instant; immediate': 'immediate, instant',
  immediately: 'immediate, instant', enough: 'to be enough', fond: 'prefer',
  homeless: 'stray (animal)', establishment: 'institution',
  'to desert': 'abandon', 'rational; logical': 'rational',
  bake: 'harden, thicken', leap: 'jump at/on, pounce on',
  'to staff': 'hire', 'to be controversial': 'controversial',
  deadly: 'dangerous', discourage: 'to be discouraged', get: 'persuade',
  practitioner: 'religious person, believer', preacher: 'religious person, believer',
  letters: 'symbol, sign, character', removal: 'move', dynamic: 'interaction',
  thinking: 'idea, thinking', wit: 'wisdom, good sense',
  exploit: 'to benefit (from), to gain', 'to submit': 'surrender',
  random: 'randomly', gaming: 'gambling', sufficiently: 'enough',
  virtual: 'online', rationally: 'rational', involved: 'complicated',
  building: 'construction', vulnerable: 'in danger / at risk',
  communicate: 'convey', martial: 'military', means: 'method',
  'to troop': 'to accompany / go together', 'theatrical; dramatic': 'theatrical',
  'to be proud': 'proud', power: 'authority', visual: 'visual aid',
  action: 'activity', gala: 'formal', remainder: 'remaining/balance',
  character: 'symbol, sign, character', seize: 'understand, grasp',
  'to dust': 'dust, wipe', kind: 'form', keep: 'save',
  appealing: 'interesting', 'largely; mainly': 'especially', cycle: 'repeat',
  naturally: 'usually', lie: 'to be, to be located',
  'split / crack': 'split, crack', 'privacy / private life': 'privacy, private life',
  'conception / concept': 'conception, concept', 'composition / work': 'composition, work',
  immune: 'to be immune', 'to buy': 'afford',
  'deployment; arranging/placing people or things for a task': 'deployment; arranging, placing people or things for a task',
  'to complicated': 'to be complicated', 'to unavoidable': 'to be unavoidable',
  'to pin': 'pin',
  'transit transfer; changing lines/vehicles': 'transit transfer; changing lines, vehicles',
  'association; an organization/group': 'association; an organization, group',
  'to grand': 'to be grand', 'to flexible': 'to be flexible',
  'to congested': 'to be congested', 'to viable': 'to be viable',
  'to steady': 'to be steady', 'to broadcast': 'to be broadcast',
  'to inappropriate': 'to be inappropriate', 'to desirable': 'to be desirable',
  'to to follow or stick to rules or standards': 'comply with',
  'adhere; to follow or stick to rules or standards': 'comply with',
  'to able to detect small changes': 'to be sensitive',
  'logical; based on reason': 'to be logical',
  'to to cover a surface with paint': 'paint',
  'to pass': 'to be eager', 'to eager': 'to be eager',
  'relevant; closely connected to what is being discussed': 'to be relevant',
  'to different from what is normal': 'to be different from what is normal',
  'unusual; different from what is normal': 'to be different from what is normal',
  worthwhile: 'to be worth', 'to watch': 'to be depressing',
  'to holy': 'to be sacred', 'to courteous': 'to be courteous',
  'to very beautiful': 'to be gorgeous', 'gorgeous; very beautiful': 'to be gorgeous',
  'to inflict': 'hurt', outfit: 'set', 'number of members': 'membership',
  'to unpleasant': 'to be unpleasant', 'to strict': 'to be strict',
  'to harsh and unforgiving': 'to be harsh', 'to unfair': 'to be unfair',
  'to sustain; to maintain': 'to be sustained', 'to sustain': 'to be sustained',
  'dynamic; full of energy and activity': 'to be dynamic',
  'to distinctive': 'to be distinctive', spectacular: 'to be spectacular',
  'prominent; noticeable': 'to be distinctive',
  'to to restrain oneself': 'to restrain oneself',
  'stark; harsh and unforgiving': 'to be harsh',
  'polite; courteous': 'to be polite; to be courteous',
  'paint; to cover a surface with paint': 'paint',
  'to very unpleasant': 'to be very unpleasant',
  'to humorous': 'to be humorous', 'to brazen': 'to be brazen',
  'to competent': 'to be competent', 'to humble': 'to be humble',
  'to mature': 'to be mature', 'to serious': 'to be serious',
  'to mild': 'to be mild', 'to be': 'warn', 'to perfect': 'to be complete',
  'film-maker; a person who directs/makes films': 'film-maker; a person who directs, makes films',
  'to especially for a job': 'interview', 'to subtle': 'to be subtle',
  'to predictable': 'to be predictable', 'to keep': 'to be only right',
  'to suspicious': 'to be suspicious', 'to valid': 'to be valid',
  'alternative; another option/solution': 'alternative; another option, solution',
  'seeker; a device/program/person that searches for a target': 'explorer',
  'coal/charcoal': 'coal, charcoal', 'much/many': 'much, many',
  little: 'a little', folks: 'parents', gradually: 'slowly',
  development: 'news', old: 'an elderly man', ever: 'ever, on earth',
  'on earth': 'ever, on earth', 'to exercise': 'used to',
  'to very deep in meaning': 'to have a deep meaning',
  'to make': 'empower', 'to feasible': 'to be feasible',
  'future / later': 'future, later',
  'to very clear and obvious': 'to be clear and obvious',
  'to urgent and in great need': 'to be urgent', 'to work': 'operate',
  'to say': 'intend', 'to silent': 'switch',
  'to be hit with a fist': 'to punch', 'to my': 'to adapt',
  'to the': 'to pin', 'to license / permit': 'to license',
  'to dishonest': 'to be dishonest', 'to careless': 'to be careless',
  'to miserable': 'to be miserable', excess: 'excessive',
  'to task/assign': 'to task, assign', 'to participate': 'to encourage',
  'to distant': 'distant', 'to support': 'to rally',
  'to grade/mark': 'to grade, mark',
  'enthusiastic; passionate': 'to be enthusiastic',
  'to enthusiastic; passionate': 'to be enthusiastic',
  'to proud': 'proud', 'to absurd': 'to be absurd',
  'to hazard a guess; to अनुमान roughly': 'to hazard a guess; to guess roughly',
  'electoral; relating to elections/voters': 'electoral; relating to elections, voters',
  'mixed; blended/conflicting': 'mixed; blended, conflicting',
  'resistance; opposition by refusing to accept/control': 'resistance; opposition by refusing to accept, control',
  deteriorate: 'to get worse', 'to deteriorate': 'to get worse',
  'to graphic': 'vivid', graphic: 'vivid',
  'eligible; qualified/entitled': 'eligible; qualified, entitled',
  'extensively; broadly/thoroughly': 'extensively; broadly, thoroughly',
}

const EN_DISPLAY_OVERRIDE_BY_WORD: Record<string, string> = {
  inaripotiwa: 'beam', hasa: 'especially',
  '방과 후 남기': 'after school', 사소하다: 'trivial', 광범위하다: 'extensive',
  감상: 'to appreciate', 유효하다: 'to be valid', 우세: 'to dominate',
  매력적이다: 'attractive', 과도하다: 'excessive', 자치: 'right to autonomy',
  단련하다: 'to build', 입히다: 'hurt', programu: 'programming',
  편성: 'programming schedule', '프로그램 편성': 'programming schedule',
  mpangilio: 'programming schedule',
}

const EN_DISPLAY_OVERRIDE_BY_EXAMPLE: Record<string, string> = {
  'The programming schedule has changed this week.': 'programming schedule',
}

const SW_DISPLAY_OVERRIDE: Record<string, string> = {
  'kubaki shule baada ya masomo kama adhabu (detention)': 'baada ya masomo',
  'kuwa ndogo; isiyo muhimu sana': 'dogo',
  'bahati tu; kwa nasibu': 'bahati tu',
  'kufurahia sanaa; kutazama na kuthamini': 'kufurahia',
  'kuwa halali; inayotumika': 'kuwa halali',
  'kuwa na nguvu zaidi; ubabe (kushinda)': 'kushinda',
  'ziada kupita kiasi': '-a kupindukia',
}

const SW_DISPLAY_OVERRIDE_BY_WORD: Record<string, string> = {
  사소하다: 'dogo', 자치: 'haki ya kujitawala',
  배출: 'moshi wa gari/magari', 단련하다: 'kuimarisha',
  두드러지다: 'dhahiri; inayoonekana',
}

const EXAMPLE_DISPLAY_OVERRIDE: Record<string, { text: string; pron?: string }> = {
  '이 길은 끝없는 것 같아.': { text: '이 길은 끝없는 것 같아.', pron: 'I gireun kkeudeomneun geot gata.' },
  '사람들은 후보를 지지하려고 광장에 집회했어요.': { text: '사람들은 후보를 지지하려고 광장에서 집회했어요.', pron: 'saramdeureun huboreul jijiharyeogo gwangjang-eseo jiphoehae-sseoyo.' },
  '예비의 신입사원이 내일 와요.': { text: '예비 신입사원이 내일 와요.', pron: 'yebi sinipsawoni naeil wayo.' },
  '그는 지적이고 차분한 사람이에요.': { text: '그는 지적이고 차분한 사람이에요.', pron: 'geuneun jijeokigo chabunhan saramieyo.' },
  '내일은 기념의 행사가 있어요.': { text: '내일은 기념 행사가 있어요.', pron: 'naeireun ginyeom haengsaga isseoyo.' },
  '숙제를 안 해서 방과 후 남기를 했어요.': { text: '숙제를 안 해서 방과 후 남아서 벌을 받게 되었어요.', pron: 'Sukjereul an haeseo banggwa hu namaseo beoreul batge doeeosseoyo.' },
  '이 잔은 크리스털로 만들었어요.': { text: '이 잔은 크리스탈로 만들었어요.', pron: 'I janeun keuriseutallo mandeureosseoyo.' },
  '좋은 교육자는 학생을 잘 들어요.': { text: '좋은 교육자는 학생 말을 잘 들어요.', pron: 'joeun gyoyukjaneun haksaeng maleul jal deureoyo.' },
  '이 보고서는 통계의 자료를 바탕으로 썼어요.': { text: '이 보고서는 통계 자료를 바탕으로 썼어요.', pron: 'i bogoseoneun tonggye jaryoreul batang-euro sseosseoyo.' },
  '우리 회사는 태양광의 전기를 써요.': { text: '우리 회사는 태양광 전기를 써요.', pron: 'uri hoesaneun taeyanggwang jeongi-reul sseoyo.' },
}

const EXAMPLE_TRANSLATION_KO_OVERRIDE: Record<string, string> = {
  '많은 사람들이 매일 신께 기도해요.': '많은 사람들이 매일 하나님께 기도해요.',
  '이 반지에는 아주 반짝이는 크리스털이 있어요.': '이 반지에는 아주 반짝이는 크리스탈이 있어요.',
  '오늘 달의 위상은 보름달이야.': '오늘 달의 위상(달의 모양 단계)은 보름달이야.',
  '우리는 내일 시장에 갈 거예요. 과일 사는 것도 포함해서요.': '내일 시장에 가는데, 과일도 사는 걸 포함해요.',
  '그의/그녀의 옷차림은 정말 연극적이었어.': '그의/그녀의 옷차림은 정말 연극적(무대 의상 같은)이었어.',
  '오늘 시장에 사람이 바글바글하고 활동이 많았어요.': '오늘 시장에 사람이 많고 활기가 넘쳤어요.',
  '저는 연주곡보다 보컬 음악을 더 좋아해요.': '저는 기악곡보다 보컬(노래) 음악을 더 좋아해요.',
  '모두가 이해할 수 있게 충분히 설명해 주세요.': '모든 사람이 이해할 수 있도록 적절하게(제대로) 설명해 주세요.',
  '망명 생활 때문에 그는 가족과 떨어져 살아야 했어.': '전근(이동 발령) 때문에 가족과 멀리 떨어져 살아야 했어요.',
}

const EXAMPLE_TRANSLATION_EN_OVERRIDE: Record<string, string> = {
  'That movie is very appealing.': 'That movie is very interesting.',
  'Exile forced him to live far from his family.': 'The transfer forced him/her to live far from his/her family.',
}

const EXAMPLE_TRANSLATION_OVERRIDE_BY_WORD: Record<string, { sw?: string; en?: string }> = {
  자치: { sw: 'Jiji hili lina haki ya kujitawala.', en: 'This city has the right to autonomy.' },
}

const WORD_DISPLAY_OVERRIDE: Record<string, { word: string; pron: string }> = {
  우세: { word: '우세하다', pron: 'usehada' },
  매력적이다: { word: '매력적인', pron: 'maeryeokjeogin' },
  끝없는: { word: '끝없는', pron: 'kkeudeomneun' },
  끝없다: { word: '끝없는', pron: 'kkeudeomneun' },
  다혈질이다: { word: '다혈질인', pron: 'dahyeoljirin' },
  충성스럽다: { word: '충성스러운', pron: 'chungseongseureon' },
  끊임없다: { word: '끊임없는', pron: 'kkeunim-eomneun' },
  충격적이다: { word: '충격적인', pron: 'chunggyeokjeogin' },
  이국적이다: { word: '이국적인', pron: 'igukjeogin' },
  합리적이다: { word: '합리적인', pron: 'hamnijeogin' },
  사소하다: { word: '사소한', pron: 'sasohan' },
  부정적이다: { word: '부정적인', pron: 'bujeongjeogin' },
  방어적이다: { word: '방어적인', pron: 'bangeojeogin' },
  현대적이다: { word: '현대적인', pron: 'hyeondaejeogin' },
  실용적이다: { word: '실용적인', pron: 'sillyongjeogin' },
  역사적이다: { word: '역사적인', pron: 'yeoksajeogin' },
  광범위하다: { word: '광범위한', pron: 'gwangbeomwihan' },
  노골적이다: { word: '노골적인', pron: 'nogoljeogin' },
  인상적이다: { word: '인상적인', pron: 'insangjeogin' },
  치명적이다: { word: '치명적인', pron: 'chimyeongjeogin' },
  생생하다: { word: '생생한', pron: 'saengsaenghan' },
  앞서: { word: '앞서 있는', pron: 'apseo inneun' },
  차갑다: { word: '차가운', pron: 'chagaun' },
  구식이다: { word: '구식의', pron: 'gusigui' },
  과도하다: { word: '과도한', pron: 'gwadohan' },
  과도: { word: '과도한', pron: 'gwadohan' },
  예비: { word: '예비(의)', pron: 'yebiui' },
  예비의: { word: '예비(의)', pron: 'yebiui' },
  기념의: { word: '기념(의)', pron: 'ginyeomui' },
  '방과 후 남기': { word: '방과 후', pron: 'banggwa hu' },
  실제의: { word: '실제(의)', pron: 'siljeoui' },
  감상: { word: '감상하다', pron: 'gamsanghada' },
  상징적이다: { word: '상징적인', pron: 'sangjingjeogin' },
  대략적이다: { word: '대략적인', pron: 'daeryakjeogin' },
  자치: { word: '자치권', pron: 'jachigwon' },
  크리스털: { word: '크리스탈', pron: 'keuriseutal' },
  배출: { word: '배출가스', pron: 'baechulgaseu' },
  지적이다: { word: '지적이다', pron: 'jijeokida' },
  현실적이다: { word: '현실적인', pron: 'hyeonsiljeogin' },
  인공적이다: { word: '인공적인', pron: 'ingongjeogin' },
  어이없다: { word: '어이없는', pron: 'eoieomneun' },
  '-(으)ㄹ 거예요': { word: '거예요', pron: 'geoyeyo' },
  결정적이다: { word: '결정적인', pron: 'gyeoljeongjeogin' },
  간접적이다: { word: '간접적인', pron: 'ganjeopjeogin' },
  낙관적이다: { word: '낙관적인', pron: 'nakgwanjeogin' },
  엄청나다: { word: '엄청난', pron: 'eomcheongnan' },
  구체적이다: { word: '구체적인', pron: 'guchejeogin' },
  행정적이다: { word: '행정적인', pron: 'haengjeongjeogin' },
  혁신적이다: { word: '혁신적인', pron: 'hyeoksinjeogin' },
  이념적이다: { word: '이념적인', pron: 'inyeomjeogin' },
  민족적이다: { word: '민족적인', pron: 'minjokjeogin' },
  독점적이다: { word: '독점적인', pron: 'dokjeomjeogin' },
  통계의: { word: '통계(의)', pron: 'tonggyeui' },
  태양광의: { word: '태양광(의)', pron: 'taeyanggwang-ui' },
  범례: { word: '지도 범례', pron: 'jido beomnye' },
  입히다: { word: '상처를 입히다', pron: 'sangcheoreul iphida' },
  끈질기다: { word: '끈질긴', pron: 'kkeunjilgin' },
  두드러지다: { word: '두드러진', pron: 'dudeureojin' },
  연극적이다: { word: '연극적인', pron: 'yeongeukjeogin' },
  잦다: { word: '잦은', pron: 'jajeun' },
  glovu: { word: 'glovu za ndondi', pron: 'GLO-vu za NDO-ndi' },
}

// ─── Helpers ───

function stripKoreanFromEnDisplay(text: string): string {
  if (!text.trim()) return text
  const segments = text.split(';').map((s) => s.trim()).filter(Boolean)
  const enOnly = segments.filter((s) => !/[\uAC00-\uD7A3]/.test(s))
  return enOnly.length ? enOnly.join('; ') : text
}

function safeName(text: string): string {
  return text.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, '_').slice(0, 60)
}

async function downloadFile(url: string): Promise<Buffer | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!resp.ok) return null
    return Buffer.from(await resp.arrayBuffer())
  } catch {
    return null
  }
}

async function downloadBatch(items: { url: string; key: string }[], concurrency = 10): Promise<Map<string, Buffer>> {
  const results = new Map<string, Buffer>()
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      const item = items[idx]
      const buf = await downloadFile(item.url)
      if (buf && buf.length > 0) results.set(item.key, buf)
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

function getFileExtFromUrl(url: string): string {
  const u = new URL(url)
  const ext = path.extname(u.pathname).toLowerCase()
  if (['.mp3', '.wav', '.ogg', '.m4a', '.webm'].includes(ext)) return ext
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) return ext
  return '.mp3'
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ─── Main ───

async function main() {
  console.log('=== 단어장 ZIP 내보내기 ===\n')

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Supabase 환경변수가 없습니다.')
    process.exit(1)
  }

  // Fetch all vocab from both modes
  const allRows: any[] = []
  for (const mode of ['sw', 'ko'] as const) {
    let from = 0
    const pageSize = 1000
    while (true) {
      const { data, error } = await supabase
        .from('generated_vocab')
        .select('*')
        .eq('mode', mode)
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1)
      if (error) { console.error(`DB 조회 실패 (mode=${mode}):`, error.message); break }
      if (!data?.length) break
      const cleaned = data.filter((r: any) => !r.word?.startsWith('__deleted__'))
      allRows.push(...cleaned)
      if (data.length < pageSize) break
      from += pageSize
    }
  }

  console.log(`총 ${allRows.length}개 단어 로드됨\n`)
  if (!allRows.length) { console.log('내보낼 데이터가 없습니다.'); return }

  // Prepare export dir
  const exportDir = path.resolve('exports')
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const zipPath = path.join(exportDir, `kenya-vocab-export-${ts}.zip`)

  const output = fs.createWriteStream(zipPath)
  const archive = archiver('zip', { zlib: { level: 6 } })
  archive.pipe(output)

  // Phase 1: Build text data and collect unique URLs
  console.log('Phase 1: 텍스트 데이터 준비 및 URL 수집...')
  const exportData: any[] = []
  const urlToArchivePath = new Map<string, string>()
  const allDownloads: { url: string; key: string }[] = []

  for (let idx = 0; idx < allRows.length; idx++) {
    const r = allRows[idx]
    const mode = r.mode as string
    const seqNum = idx + 1

    const wordOverride = WORD_DISPLAY_OVERRIDE[r.word]
    const displayWord = wordOverride?.word ?? r.word
    const displayWordPron = wordOverride?.pron ?? r.word_pronunciation

    let displaySw = r.meaning_sw
    if (mode === 'sw') {
      const isHada = /하다$/.test(r.word ?? '')
      if (isHada && displaySw && !/^kuwa\s+/i.test(displaySw)) displaySw = `kuwa ${displaySw.trim()}`
      if (r.word && SW_DISPLAY_OVERRIDE_BY_WORD[r.word]) displaySw = SW_DISPLAY_OVERRIDE_BY_WORD[r.word]
      else if (r.meaning_sw && SW_DISPLAY_OVERRIDE[r.meaning_sw]) displaySw = SW_DISPLAY_OVERRIDE[r.meaning_sw]
    }

    let displayKo = r.meaning_ko
    if (r.word && KO_DISPLAY_OVERRIDE_BY_WORD[r.word]) displayKo = KO_DISPLAY_OVERRIDE_BY_WORD[r.word]
    else if (r.meaning_ko && KO_DISPLAY_OVERRIDE[r.meaning_ko]) displayKo = KO_DISPLAY_OVERRIDE[r.meaning_ko]

    let displayEn = r.meaning_en ?? null
    displayEn = EN_DISPLAY_OVERRIDE[displayEn ?? ''] ?? displayEn
    if (r.word && EN_DISPLAY_OVERRIDE_BY_WORD[r.word]) displayEn = EN_DISPLAY_OVERRIDE_BY_WORD[r.word]
    if (r.example && EN_DISPLAY_OVERRIDE_BY_EXAMPLE[r.example]) displayEn = EN_DISPLAY_OVERRIDE_BY_EXAMPLE[r.example]
    if (displayEn) displayEn = stripKoreanFromEnDisplay(displayEn)

    const exOverride = r.example ? EXAMPLE_DISPLAY_OVERRIDE[r.example] : undefined
    const displayExample = exOverride?.text ?? r.example
    const displayExamplePron = exOverride?.pron ?? r.example_pronunciation

    const trByWord = r.word ? EXAMPLE_TRANSLATION_OVERRIDE_BY_WORD[r.word] : undefined
    let displayExTransKo = r.example_translation_ko
    if (r.example_translation_ko && EXAMPLE_TRANSLATION_KO_OVERRIDE[r.example_translation_ko]) {
      displayExTransKo = EXAMPLE_TRANSLATION_KO_OVERRIDE[r.example_translation_ko]
    }
    const displayExTransSw = trByWord?.sw ?? r.example_translation_sw
    let displayExTransEn = trByWord?.en ?? r.example_translation_en
    if (r.example_translation_en && EXAMPLE_TRANSLATION_EN_OVERRIDE[r.example_translation_en]) {
      displayExTransEn = EXAMPLE_TRANSLATION_EN_OVERRIDE[r.example_translation_en]
    }

    const wordSafe = safeName(displayWord)
    const prefix = `${String(seqNum).padStart(4, '0')}_${wordSafe}`

    const record: any = {
      id: r.id, mode,
      category: r.category, difficulty: r.difficulty, pos: r.pos,
      word: displayWord,
      word_original: r.word !== displayWord ? r.word : undefined,
      word_pronunciation: displayWordPron,
      meaning_sw: displaySw, meaning_sw_pronunciation: r.meaning_sw_pronunciation,
      meaning_ko: displayKo, meaning_ko_pronunciation: r.meaning_ko_pronunciation,
      meaning_en: displayEn, meaning_en_pronunciation: r.meaning_en_pronunciation,
      example: displayExample, example_pronunciation: displayExamplePron,
      example_translation_sw: displayExTransSw,
      example_translation_ko: displayExTransKo,
      example_translation_en: displayExTransEn,
    }

    const mediaFields = [
      { field: 'word_audio', url: r.word_audio_url, subdir: 'audio/word' },
      { field: 'meaning_sw_audio', url: r.meaning_sw_audio_url, subdir: 'audio/meaning_sw' },
      { field: 'meaning_ko_audio', url: r.meaning_ko_audio_url, subdir: 'audio/meaning_ko' },
      { field: 'meaning_en_audio', url: r.meaning_en_audio_url, subdir: 'audio/meaning_en' },
      { field: 'example_audio', url: r.example_audio_url, subdir: 'audio/example' },
      { field: 'image', url: r.image_url, subdir: 'images' },
    ]

    for (const mf of mediaFields) {
      if (!mf.url) continue
      const ext = getFileExtFromUrl(mf.url)
      const archiveName = `${mf.subdir}/${prefix}${ext}`
      record[`${mf.field}_file`] = archiveName

      if (!urlToArchivePath.has(mf.url)) {
        urlToArchivePath.set(mf.url, archiveName)
        allDownloads.push({ url: mf.url, key: mf.url })
      } else {
        record[`${mf.field}_file`] = urlToArchivePath.get(mf.url)
      }
    }

    exportData.push(record)
  }

  console.log(`  ${exportData.length}개 레코드 준비, ${allDownloads.length}개 고유 미디어 URL`)

  // Phase 2: Batch download all media concurrently
  console.log('\nPhase 2: 미디어 파일 병렬 다운로드 (동시 15개)...')
  const BATCH_SIZE = 200
  let downloaded = 0
  let failed = 0

  for (let bStart = 0; bStart < allDownloads.length; bStart += BATCH_SIZE) {
    const batch = allDownloads.slice(bStart, bStart + BATCH_SIZE)
    const results = await downloadBatch(batch, 15)

    for (const [url, buf] of results) {
      const archiveName = urlToArchivePath.get(url)!
      archive.append(buf, { name: archiveName })
      downloaded++
    }
    failed += batch.length - results.size

    const progress = Math.min(bStart + BATCH_SIZE, allDownloads.length)
    console.log(`  ${progress}/${allDownloads.length} URL 처리 (다운로드: ${downloaded}, 실패: ${failed})`)
  }

  // Add JSON data
  archive.append(JSON.stringify(exportData, null, 2), { name: 'vocab_data.json' })

  // Add TSV for spreadsheet convenience
  const tsvHeader = [
    'mode', 'category', 'difficulty', 'pos',
    'word', 'word_pronunciation',
    'meaning_sw', 'meaning_sw_pronunciation',
    'meaning_ko', 'meaning_ko_pronunciation',
    'meaning_en', 'meaning_en_pronunciation',
    'example', 'example_pronunciation',
    'example_translation_sw', 'example_translation_ko', 'example_translation_en',
  ].join('\t')
  const tsvRows = exportData.map((r) => [
    r.mode, r.category, r.difficulty, r.pos,
    r.word, r.word_pronunciation,
    r.meaning_sw, r.meaning_sw_pronunciation,
    r.meaning_ko, r.meaning_ko_pronunciation,
    r.meaning_en, r.meaning_en_pronunciation,
    r.example, r.example_pronunciation,
    r.example_translation_sw, r.example_translation_ko, r.example_translation_en,
  ].map((v) => (v ?? '').toString().replace(/\t/g, ' ').replace(/\n/g, ' ')).join('\t'))
  archive.append(`${tsvHeader}\n${tsvRows.join('\n')}`, { name: 'vocab_data.tsv' })

  console.log(`\n총 ${exportData.length}개 단어, ${downloaded}개 미디어 파일 다운로드 (실패: ${failed})`)
  console.log('ZIP 아카이브 생성 중...')

  await archive.finalize()
  await new Promise<void>((resolve) => output.on('close', resolve))

  const size = fs.statSync(zipPath).size
  console.log(`\n=== 완료 ===`)
  console.log(`파일: ${zipPath}`)
  console.log(`크기: ${(size / 1024 / 1024).toFixed(1)} MB`)
}

main().catch((e) => {
  console.error('Fatal error:', e)
  process.exit(1)
})
