export function countWords(text: string) {
  return text.match(/\S+/g)?.length ?? 0
}

export function firstWords(text: string, count: number) {
  const prefix = text.match(new RegExp(`^(?:\\s*\\S+){${count}}(?=\\s|$)`))
  return prefix?.[0] ?? (countWords(text) < count ? text : "")
}
