const dayMs = 86_400_000

export const modeBits = Object.freeze({ pi: 1, 'pi-plus': 2, 'pi-im': 4 })
export const usageUrl = 'https://dsh-pi-usage.you-xia.cc/v1/usage'

export function chinaDay(time) {
  return new Date(time + 8 * 3_600_000).toISOString().slice(0, 10)
}

export function weekStart(day) {
  const midnight = new Date(day + 'T00:00:00Z')
  return new Date(+midnight - ((midnight.getUTCDay() + 6) % 7) * dayMs).toISOString().slice(0, 10)
}
