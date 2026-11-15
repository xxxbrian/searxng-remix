import { describe, expect, it } from 'vitest'
import { liveRequest, timePlace, weatherCondition, weatherPlaces } from './live'
import { decideIntent, FALLBACK_DECISION } from './search-decision'

describe('weather place extraction', () => {
  it.each([
    ['London weather', 'london'],
    ['weather in New York today', 'new york'],
    ["what's the weather like in Paris tomorrow?", 'paris'],
    ['北京天气', '北京'],
    ['上海明天天气怎么样', '上海'],
    ['台北天氣預報', '台北'],
    ['東京の天気', '東京'],
    ['Wetter in Berlin', 'berlin'],
    ['météo à Paris', 'paris'],
    ['clima en Madrid', 'madrid'],
    ['el tiempo y clima en Madrid hoy', 'madrid'],
  ])('%s → %s', (query, place) => {
    expect(weatherPlaces(query)[0]).toBe(place)
  })

  it('keeps a lightly stripped candidate for names containing filler words', () => {
    expect(weatherPlaces('Santa Cruz de Tenerife weather')).toEqual(['santa cruz tenerife', 'santa cruz de tenerife'])
  })

  it('needs a weather word and a place', () => {
    expect(weatherPlaces('London')).toEqual([])
    expect(weatherPlaces('weather')).toEqual([])
    expect(weatherPlaces('今天天气')).toEqual([])
  })
})

describe('time place extraction', () => {
  it.each([
    ['time in Tokyo', 'tokyo'],
    ['Tokyo time', 'tokyo'],
    ['what time is it in Sydney', 'sydney'],
    ['东京时间', '东京'],
    ['纽约现在几点', '纽约'],
    ['ロンドンの時刻', 'ロンドン'],
    ['Uhrzeit in Wien', 'wien'],
  ])('%s → %s', (query, place) => expect(timePlace(query)).toBe(place))

  it('ignores ordinary uses of the word time', () => {
    expect(timePlace('time complexity of quicksort')).toBeUndefined()
    expect(timePlace('time')).toBeUndefined()
  })
})

describe('liveRequest', () => {
  it('follows Jev when it is confident and keyword phrasing otherwise', () => {
    expect(liveRequest('London weather', decideIntent('weather', 0.9))).toEqual({ kind: 'weather', places: ['london'] })
    expect(liveRequest('London weather', FALLBACK_DECISION)).toMatchObject({ kind: 'weather' })
    expect(liveRequest('London weather', decideIntent('navigation', 0.9))).toBeUndefined()
    expect(liveRequest('weather in March in Kyoto', decideIntent('exploration', 0.9))).toBeUndefined()
    expect(liveRequest('Tokyo time', decideIntent('live', 0.9))).toEqual({ kind: 'time', places: ['tokyo'] })
  })
})

it('groups WMO codes', () => {
  expect([0, 2, 45, 53, 63, 81, 75, 95].map(weatherCondition)).toEqual([
    'clear',
    'partlyCloudy',
    'fog',
    'drizzle',
    'rain',
    'rain',
    'snow',
    'thunder',
  ])
})
