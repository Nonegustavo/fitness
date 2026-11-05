import { describe, expect, it } from 'vitest'
import { avatarOf, cleanEmoji, FOOD_EMOJIS, guessEmoji } from './emoji'
import { TACO_FOODS } from './foods'

describe('guessEmoji', () => {
  it('finds an emoji for at least 90% of the TACO foods', () => {
    const covered = TACO_FOODS.filter((food) => guessEmoji(food.name)).length
    expect(covered / TACO_FOODS.length).toBeGreaterThanOrEqual(0.9)
  })

  it('goes by the first food word of the name, ignoring accents and case', () => {
    expect(guessEmoji('Arroz, tipo 1, cozido')).toBe('🍚')
    expect(guessEmoji('FEIJAO, CARIOCA, COZIDO')).toBe('🫘')
    expect(guessEmoji('Frango, peito, sem pele, grelhado')).toBe('🍗')
    expect(guessEmoji('Bolo, pronto, chocolate')).toBe('🍰')
    expect(guessEmoji('Leite, de vaca, achocolatado')).toBe('🥛')
    expect(guessEmoji('Chocolate, ao leite')).toBe('🍫')
    expect(guessEmoji('Mortadela de peito de frango defumado')).toBe('🌭')
  })

  it('prefers the longer phrase where both start, and plurals find the singular', () => {
    expect(guessEmoji('Pão, trigo, francês')).toBe('🥖')
    expect(guessEmoji('Pão de forma 38,2% integral')).toBe('🍞')
    expect(guessEmoji('Batata, doce, cozida')).toBe('🍠')
    expect(guessEmoji('Batata, inglesa, frita')).toBe('🍟')
    expect(guessEmoji('Ovos mexidos')).toBe('🍳')
    expect(guessEmoji('Pães de queijo')).toBe('🧀')
    expect(guessEmoji('Feijões')).toBe('🫘')
  })

  it('reads a juice as a juice, and leaves out what would be a wrong guess', () => {
    expect(guessEmoji('Laranja, pêra, crua')).toBe('🍊')
    expect(guessEmoji('Laranja, pêra, suco')).toBe('🧃')
    expect(guessEmoji('Fruta-pão, crua')).toBe('')
    expect(guessEmoji('Caqui, chocolate, cru')).not.toBe('🍫')
    expect(guessEmoji('Xyz')).toBe('')
    expect(guessEmoji('')).toBe('')
  })
})

describe('cleanEmoji', () => {
  it('keeps one emoji and nothing else', () => {
    expect(cleanEmoji('🍚')).toBe('🍚')
    expect(cleanEmoji(' 🍚 ')).toBe('🍚')
    expect(cleanEmoji('🍚🍛')).toBe('🍚')
    expect(cleanEmoji('🌶️')).toBe('🌶️')
    expect(cleanEmoji('arroz')).toBe('')
    expect(cleanEmoji('')).toBe('')
    expect(cleanEmoji(42)).toBe('')
    expect(cleanEmoji(null)).toBe('')
  })

  it('offers only real emojis to choose from', () => {
    expect(FOOD_EMOJIS.length).toBeGreaterThan(50)
    expect(FOOD_EMOJIS.every((emoji) => cleanEmoji(emoji) === emoji)).toBe(true)
    expect(new Set(FOOD_EMOJIS).size).toBe(FOOD_EMOJIS.length)
  })
})

describe('avatarOf', () => {
  const name = 'Arroz, tipo 1, cozido'

  it('shows the photo first, keeping the emoji for while it loads', () => {
    expect(avatarOf(name, { photoId: 'p1', imageUrl: 'https://x/y.jpg', emoji: '🍛' })).toEqual({
      kind: 'photo',
      photoId: 'p1',
      emoji: '🍛',
    })
  })

  it('then the product picture, then the chosen emoji, then the guessed one', () => {
    expect(avatarOf(name, { imageUrl: 'https://x/y.jpg', emoji: '🍛' })).toEqual({ kind: 'image', url: 'https://x/y.jpg', emoji: '🍛' })
    expect(avatarOf(name, { emoji: '🍛' })).toEqual({ kind: 'emoji', emoji: '🍛' })
    expect(avatarOf(name, {})).toEqual({ kind: 'emoji', emoji: '🍚' })
    // An empty emoji means "by the name".
    expect(avatarOf(name, { emoji: '' })).toEqual({ kind: 'emoji', emoji: '🍚' })
  })

  it('falls back to the icon when nothing fits', () => {
    expect(avatarOf('Xyz', {})).toEqual({ kind: 'icon' })
    expect(avatarOf('Xyz', { imageUrl: 'https://x/y.jpg' })).toEqual({ kind: 'image', url: 'https://x/y.jpg', emoji: '' })
  })
})
