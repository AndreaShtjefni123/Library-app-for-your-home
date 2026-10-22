const LEADING_ARTICLES = /^(the|a|an)\s+/i

/** "The Hobbit" sorts under H. */
export function sortTitle(title: string): string {
  return title.trim().replace(LEADING_ARTICLES, '').toLowerCase()
}

const NAME_PARTICLES = new Set(['de', 'del', 'della', 'di', 'da', 'van', 'von', 'der', 'den', 'le', 'la', 'du', 'dos'])
const NAME_SUFFIXES = /^(jr\.?|sr\.?|ii|iii|iv)$/i

/** "Ursula K. Le Guin" → "Le Guin, Ursula K."; names already written "Last, First" are kept. */
export function sortName(displayName: string): string {
  const name = displayName.trim().replace(/\s+/g, ' ')
  if (name.includes(',') || !name.includes(' ')) return name
  const parts = name.split(' ')
  let suffix = ''
  if (parts.length > 2 && NAME_SUFFIXES.test(parts[parts.length - 1])) suffix = ' ' + parts.pop()
  let start = parts.length - 1
  while (start > 1 && NAME_PARTICLES.has(parts[start - 1].toLowerCase())) start--
  const last = parts.slice(start).join(' ')
  const first = parts.slice(0, start).join(' ')
  return `${last}, ${first}${suffix}`
}
