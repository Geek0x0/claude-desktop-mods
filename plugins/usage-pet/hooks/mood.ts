export type Season = 'winter' | 'spring' | 'summer' | 'autumn'
export type TimeOfDay = 'morning' | 'night'
export type HolidayMood = 'christmas' | 'new-year'
export type Mood = { season: Season; timeOfDay?: TimeOfDay; holiday?: HolidayMood }

// Date uses the host's local timezone, matching the clock-based Halloween check.
export function moodAt(date: Date, seasonal = true): Mood | undefined {
  if (!seasonal) return undefined

  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const season: Season =
    month === 12 || month <= 2 ? 'winter' : month <= 5 ? 'spring' : month <= 8 ? 'summer' : 'autumn'
  const mood: Mood = { season }

  if (hour >= 6 && hour < 10) mood.timeOfDay = 'morning'
  else if (hour >= 22 || hour < 6) mood.timeOfDay = 'night'

  if (month === 12 && day >= 20 && day <= 26) mood.holiday = 'christmas'
  else if ((month === 12 && day === 31) || (month === 1 && day === 1)) mood.holiday = 'new-year'

  return mood
}
