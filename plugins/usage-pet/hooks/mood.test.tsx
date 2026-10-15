import { expect, test } from 'claude-code/testing'

import { moodAt, type Mood } from './mood'

const local = (year: number, month: number, day: number, hour = 12, minute = 0) => new Date(year, month - 1, day, hour, minute)

test('时段、季节和节日：按传入的本地日期选择对应装扮', () => {
  const cases: { at: Date; mood: Mood }[] = [
    { at: local(2026, 1, 2, 5, 59), mood: { season: 'winter', timeOfDay: 'night' } },
    { at: local(2026, 1, 2, 6), mood: { season: 'winter', timeOfDay: 'morning' } },
    { at: local(2026, 1, 2, 9, 59), mood: { season: 'winter', timeOfDay: 'morning' } },
    { at: local(2026, 1, 2, 10), mood: { season: 'winter' } },
    { at: local(2026, 1, 2, 21, 59), mood: { season: 'winter' } },
    { at: local(2026, 1, 2, 22), mood: { season: 'winter', timeOfDay: 'night' } },
    { at: local(2026, 3, 1), mood: { season: 'spring' } },
    { at: local(2026, 6, 1), mood: { season: 'summer' } },
    { at: local(2026, 9, 1), mood: { season: 'autumn' } },
    { at: local(2026, 12, 19), mood: { season: 'winter' } },
    { at: local(2026, 12, 20), mood: { season: 'winter', holiday: 'christmas' } },
    { at: local(2026, 12, 26, 23), mood: { season: 'winter', timeOfDay: 'night', holiday: 'christmas' } },
    { at: local(2026, 12, 27), mood: { season: 'winter' } },
    { at: local(2026, 12, 31, 23), mood: { season: 'winter', timeOfDay: 'night', holiday: 'new-year' } },
    { at: local(2027, 1, 1), mood: { season: 'winter', holiday: 'new-year' } },
    { at: local(2027, 1, 2), mood: { season: 'winter' } },
  ]
  for (const current of cases) {
    expect(moodAt(current.at)).toEqual(current.mood)
  }
})

test('季节选项关闭：不返回时段、季节或节日状态', () => {
  expect(moodAt(local(2026, 12, 25, 8), false)).toBe(undefined)
})
