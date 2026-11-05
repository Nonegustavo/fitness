import { normalize } from './foods'

/**
 * Keywords → emoji, for the foods without one of their own. Each phrase is a set of words that must all
 * be in the name (accents, plurals and "de", "com"… don't matter). The phrase whose first word comes
 * earliest in the name wins ("Bolo, pronto, chocolate" is a cake), then the one with more words ("Pão,
 * trigo, francês" over "Pão"), then the one higher up here. A phrase starting with "!" wins wherever it
 * is ("Laranja, pêra, suco" is a juice), and an empty emoji stops a wrong guess ("Fruta-pão" isn't bread).
 */
const TABLE: [emoji: string, phrases: string][] = [
  ['🧃', '!suco, caldo cana, cana caldo'],
  ['', 'fruta pao, fermento'],
  // Grains, breads and pasta.
  ['🍚', 'arroz, risoto'],
  ['🍮', 'arroz doce'],
  ['🥣', 'aveia, granola, cereal, musli, mingau, canjica, mungunza, creme arroz'],
  ['🌽', 'milho, fuba, pamonha, curau, polenta, angu, cuscuz, creme milho'],
  ['🍿', 'pipoca, milho pipoca, salgadinho'],
  ['🌾', 'farinha, farelo, trigo, centeio, cevada, polvilho, fecula, amido, quinoa, chia, linhaca, gergelim, semente, mandioca farofa, farofa'],
  ['🍞', 'pao, torrada, bisnaguinha, panetone, chocotone'],
  ['🥖', 'pao frances, baguete'],
  ['🧀', 'pao queijo'],
  ['🫓', 'pao sirio, pita, tapioca, crepioca, beiju, esfiha, esfirra'],
  ['🥐', 'croissant'],
  ['🥯', 'bagel'],
  ['🥞', 'panqueca, crepe'],
  ['🧇', 'waffle'],
  ['🍝', 'macarrao, massa, espaguete, lasanha, nhoque, penne, talharim, fettuccine, ravioli, capeletti, canelone'],
  ['🍜', 'macarrao instantaneo, miojo, lamen, ramen, yakisoba, udon'],
  ['🍪', 'biscoito, bolacha, cookie'],
  ['🍰', 'bolo, pave'],
  ['🥧', 'torta, empada, empadinha, quiche'],
  ['🥟', 'pastel, guioza, gyoza'],
  ['🧆', 'quibe, kibe, croquete, bolinho, falafel, acaraje, almondega'],
  ['🍩', 'rosquinha, donut, sonho, churro, bolinho chuva'],
  ['🧁', 'cupcake, muffin'],
  // Vegetables and roots.
  ['🥔', 'batata, batata baroa, mandioquinha, mandioca, aipim, macaxeira, inhame, cara, pure'],
  ['🍠', 'batata doce, beterraba'],
  ['🍟', 'batata frita, batata palha, batata chip, chip, mandioca frita, aipim frito'],
  ['🥕', 'cenoura, nabo, rabanete, legume'],
  ['🥫', 'seleta'],
  ['🥬', 'alface, couve, acelga, agriao, aipo, salsao, almeirao, caruru, catalonha, chicoria, escarola, espinafre, mostarda folha, repolho, rucula, serralha, taioba, verdura'],
  ['🌿', 'alfavaca, manjericao, cebolinha, coentro, salsa, salsinha, hortela, oregano, alecrim, erva'],
  ['🥦', 'brocolis, couve flor'],
  ['🌱', 'broto, feijao broto'],
  ['🧄', 'alho'],
  ['🧅', 'cebola, alho poro'],
  ['🍅', 'tomate, ketchup, molho tomate, extrato tomate'],
  ['🥒', 'pepino, picles, abobrinha, chuchu, maxixe'],
  ['🍆', 'berinjela, jilo'],
  ['🎃', 'abobora, quibebe'],
  ['🫑', 'pimentao'],
  ['🌶️', 'pimenta'],
  ['🫛', 'ervilha, vagem, quiabo, edamame'],
  ['🍄', 'cogumelo, champignon, champignons, shimeji, shiitake, shitake, funghi'],
  ['🫚', 'gengibre'],
  ['🫒', 'azeitona, azeite'],
  ['🥑', 'abacate, avocado'],
  ['🌴', 'palmito, pupunha'],
  ['🥗', 'salada, salpicao, tabule, maionese batata'],
  ['🍇', 'uva, salada fruta'],
  // Fruit.
  ['🍌', 'banana'],
  ['🍎', 'maca, caju'],
  ['🍐', 'pera, goiaba'],
  ['🍊', 'laranja, tangerina, mexerica, bergamota, ponkan, caqui'],
  ['🍋', 'limao'],
  ['🍍', 'abacaxi, ananas'],
  ['🥭', 'manga, caja, umbu, ciriguela, seriguela'],
  ['🍈', 'melao, mamao, papaia'],
  ['🍉', 'melancia'],
  ['🍓', 'morango, framboesa'],
  ['🍒', 'cereja, acerola, pitanga'],
  ['🫐', 'acai, mirtilo, blueberry, amora, jabuticaba, jamelao'],
  ['🥝', 'kiwi'],
  ['🍑', 'pessego, ameixa, damasco, nectarina'],
  ['🥥', 'coco, cocada, cupuacu, macauba, leite coco, agua coco'],
  // Beans, nuts and seeds.
  ['🫘', 'feijao, feijao tropeiro, lentilha, grao bico, guandu, tremoco, soja, proteina soja'],
  ['🥜', 'amendoim, pacoca'],
  ['🌰', 'castanha, amendoa, noz, macadamia, pistache, avela, pinhao'],
  // Meat, fish and eggs.
  ['🥩', 'carne, bife, picanha, alcatra, patinho, maminha, fraldinha, cupim, acem, musculo, lagarto, contrafile, contra file, file mignon, charque, figado'],
  ['🍖', 'porco, suino, lombo, pernil, bisteca, costela, churrasco, leitao, cordeiro'],
  ['🍗', 'frango, galinha, coxinha, nugget'],
  ['🦃', 'peru'],
  ['🥓', 'bacon, toucinho, torresmo, presunto, apresuntado, pancetta'],
  ['🌭', 'linguica, salsicha, calabresa, salame, mortadela, pepperoni, cachorro quente, hot dog'],
  ['🍔', 'hamburguer, burguer, xburguer, cheeseburger'],
  ['🍢', 'espeto, espetinho, kafta'],
  ['🐟', 'peixe, abadejo, atum, bacalhau, cacao, corimba, corimbata, corvina, dourada, dourado, lambari, manjuba, merluza, pescada, pescadinha, pintado, porquinho, salmao, sardinha, tucunare, tilapia, robalo, truta, linguado, pacu, tambaqui, pirarucu, anchova, badejo, namorado'],
  ['🦐', 'camarao'],
  ['🦀', 'caranguejo, siri, kani, surimi'],
  ['🦑', 'lula'],
  ['🐙', 'polvo'],
  ['🦞', 'lagosta'],
  ['🦪', 'ostra, marisco, mexilhao, sururu, vieira'],
  ['🍣', 'sushi, sashimi, temaki, uramaki, niguiri, hossomaki'],
  ['🥚', 'ovo, clara, gema, albumina'],
  ['🍳', 'omelete, fritada, ovo frito, ovo mexido'],
  // Dishes.
  ['🍲', 'sopa, caldo, canja, feijoada, barreado, dobradinha, bucho, buchada, manicoba, sarapatel, tacaca, tucupi, vatapa, moqueca, pirao, vaca atolada'],
  ['🍛', 'estrogonofe, strogonoff, curry, virado, galinhada'],
  ['🥘', 'escondidinho, paella'],
  ['🌯', 'wrap, rap10, tortilha, burrito, charuto, shawarma'],
  ['🌮', 'taco, nacho'],
  ['🍕', 'pizza'],
  ['🥪', 'sanduiche, lanche, misto, bauru'],
  ['🍱', 'marmita'],
  // Dairy.
  ['🥛', 'leite, iogurte, coalhada, kefir, yakult, creme leite, nata, bebida lactea, soja extrato'],
  ['🧀', 'queijo, mussarela, mucarela, mozarela, parmesao, requeijao, ricota, cottage, provolone, gorgonzola, catupiry, cream cheese'],
  ['🧈', 'manteiga, margarina, ghee'],
  // Sweets.
  ['🍫', 'chocolate, achocolatado, cacau, bombom, brigadeiro, brownie, nutella, barra'],
  ['🍮', 'doce, doce leite, pudim, mousse, quindim, gelatina, geleia mocoto'],
  ['🍬', 'acucar, adocante, bala, chiclete, rapadura, marmelada, goiabada, maria mole, marshmallow, beijinho'],
  ['🍭', 'pirulito'],
  ['🍨', 'sorvete'],
  ['🍦', 'picole, chantilly'],
  ['🍯', 'mel, melado, geleia, glicose'],
  // Drinks.
  ['☕', 'cafe, capuccino, cappuccino, expresso'],
  ['🍵', 'cha'],
  ['🧉', 'chimarrao, terere'],
  ['💧', 'agua'],
  ['🥤', 'refrigerante, agua tonica, guarana, coca cola, bebida, isotonico, energetico, whey, proteina, maltodextrina'],
  ['🍺', 'cerveja, chope'],
  ['🍷', 'vinho'],
  ['🥂', 'espumante'],
  ['🥃', 'aguardente, cana aguardente, cachaca, whisky, vodka, licor'],
  ['🍹', 'caipirinha, drink'],
  // Seasoning and supplements.
  ['🧂', 'sal, tempero, sazon'],
  ['🫙', 'molho, shoyu, mostarda, maionese, vinagre, barbecue, pesto, tahine'],
  ['🫗', 'oleo'],
  ['💊', 'creatina, suplemento, capsula, comprimido, omega, colageno, multivitaminico, polivitaminico, cafeina, termogenico, bcaa, glutamina'],
]

/** Words that never decide what a food is. */
const STOPWORDS = new Set(['a', 'o', 'e', 'de', 'do', 'da', 'dos', 'das', 'com', 'sem', 'em', 'no', 'na', 'ao', 'para'])

/** A crude singular, so "ovos", "pães" and "feijões" find "ovo", "pão" and "feijão". */
function stem(word: string): string {
  if (word.length <= 3) return word
  if (/[oa]es$/.test(word)) return `${word.slice(0, -3)}ao`
  if (word.endsWith('ais')) return `${word.slice(0, -3)}al`
  if (word.endsWith('eis')) return `${word.slice(0, -3)}el`
  if (word.endsWith('ois')) return `${word.slice(0, -3)}ol`
  if (/[rz]es$/.test(word)) return word.slice(0, -2)
  if (word.endsWith('ns')) return `${word.slice(0, -2)}m`
  if (word.endsWith('s')) return word.slice(0, -1)
  return word
}

const wordsOf = (text: string): string[] => normalize(text).split(' ').filter(Boolean).map(stem)

interface Rule {
  words: string[]
  emoji: string
  strong: boolean
}

const RULES: Rule[] = TABLE.flatMap(([emoji, phrases]) =>
  phrases.split(',').map((phrase) => {
    const strong = phrase.trim().startsWith('!')
    return { emoji, strong, words: wordsOf(phrase.replace('!', '')).filter((word) => !STOPWORDS.has(word)) }
  }),
)

const guessed = new Map<string, string>()

/** The emoji a food's name suggests ("Arroz, tipo 1, cozido" → 🍚), or '' when nothing fits. */
export function guessEmoji(name: string): string {
  const known = guessed.get(name)
  if (known !== undefined) return known
  const words = wordsOf(name)
  let best: { rule: Rule; at: number } | undefined
  for (const rule of RULES) {
    const at = words.indexOf(rule.words[0])
    if (at < 0 || !rule.words.every((word) => words.includes(word))) continue
    if (!best || beats(rule, at, best)) best = { rule, at }
  }
  const emoji = best?.rule.emoji ?? ''
  guessed.set(name, emoji)
  return emoji
}

/** Strong phrases first, then the earliest in the name, then the longest; a tie keeps the one above in the table. */
function beats(rule: Rule, at: number, best: { rule: Rule; at: number }): boolean {
  if (rule.strong !== best.rule.strong) return rule.strong
  if (at !== best.at) return at < best.at
  return rule.words.length > best.rule.words.length
}

const graphemes = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' })

/** One emoji out of what was typed or answered (its first character, when that's an emoji), or ''. */
export function cleanEmoji(value: unknown): string {
  if (typeof value !== 'string') return ''
  const first = graphemes.segment(value.trim())[Symbol.iterator]().next().value?.segment ?? ''
  return /\p{Extended_Pictographic}/u.test(first) ? first : ''
}

/** The emojis offered to choose from, the most common foods first. */
export const FOOD_EMOJIS = (
  '🍚 🫘 🍝 🍜 🍲 🍛 🥗 🥪 🍗 🥩 🍖 🥓 🌭 🍔 🍕 🌮 🐟 🦐 🍣 🥚 🍳 🧀 🥛 🧈 ' +
  '🍞 🥖 🥐 🫓 🥞 🧇 🥣 🌾 🥬 🥦 🥕 🍅 🥔 🍠 🌽 🥒 🍌 🍎 🍐 🍊 🍋 🍇 🍓 🍉 ' +
  '🍍 🥭 🥝 🍑 🫐 🥥 🥑 🥜 🌰 🍄 🍪 🍰 🍫 🍮 🍨 🍯 ☕ 🍵 🧃 🥤 🍺 🍷 💧 💊'
).split(' ')

/** What stands before a food's name: the user's photo, the product's picture, an emoji, or a plain icon. */
export type Avatar =
  | { kind: 'photo'; photoId: string; emoji: string }
  | { kind: 'image'; url: string; emoji: string }
  | { kind: 'emoji'; emoji: string }
  | { kind: 'icon' }

/**
 * The avatar of a food: its photo, else the Open Food Facts picture, else its emoji (the one chosen or
 * suggested, else the one its name suggests), else an icon. A picture keeps the emoji to show while it
 * loads or when it can't.
 */
export function avatarOf(name: string, look: { photoId?: string; imageUrl?: string; emoji?: string }): Avatar {
  const emoji = look.emoji || guessEmoji(name)
  if (look.photoId) return { kind: 'photo', photoId: look.photoId, emoji }
  if (look.imageUrl) return { kind: 'image', url: look.imageUrl, emoji }
  return emoji ? { kind: 'emoji', emoji } : { kind: 'icon' }
}
