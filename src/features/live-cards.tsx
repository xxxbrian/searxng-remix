import { createSignal, For, Match, onCleanup, onMount, Show, Switch } from 'solid-js'
import {
  type LiveCard,
  type Place,
  type TimeCardData,
  type WeatherCardData,
  type WeatherCondition,
  weatherCondition,
} from '~/lib/live'
import type { UiLocale } from '~/lib/locale'
import '~/ui/live.css'

type Messages = Record<
  | 'weather'
  | 'localTime'
  | 'feelsLike'
  | 'humidity'
  | 'wind'
  | 'precipitation'
  | 'today'
  | 'updated'
  | 'source'
  | 'sameZone'
  | 'ahead'
  | 'behind',
  string
> &
  Record<WeatherCondition, string>

const MESSAGES: Record<UiLocale, Messages> = {
  'zh-CN': {
    weather: '天气',
    localTime: '当地时间',
    feelsLike: '体感',
    humidity: '湿度',
    wind: '风速',
    precipitation: '降水',
    today: '今天',
    updated: '当地 {time} 更新',
    source: '数据',
    sameZone: '与你的时区相同',
    ahead: '比你快 {hours} 小时',
    behind: '比你慢 {hours} 小时',
    clear: '晴',
    mainlyClear: '晴间少云',
    partlyCloudy: '多云',
    overcast: '阴',
    fog: '雾',
    drizzle: '毛毛雨',
    rain: '雨',
    snow: '雪',
    thunder: '雷雨',
  },
  'zh-TW': {
    weather: '天氣',
    localTime: '當地時間',
    feelsLike: '體感',
    humidity: '濕度',
    wind: '風速',
    precipitation: '降水',
    today: '今天',
    updated: '當地 {time} 更新',
    source: '資料',
    sameZone: '與你的時區相同',
    ahead: '比你快 {hours} 小時',
    behind: '比你慢 {hours} 小時',
    clear: '晴',
    mainlyClear: '晴時少雲',
    partlyCloudy: '多雲',
    overcast: '陰',
    fog: '霧',
    drizzle: '毛毛雨',
    rain: '雨',
    snow: '雪',
    thunder: '雷雨',
  },
  en: {
    weather: 'Weather',
    localTime: 'Local time',
    feelsLike: 'Feels like',
    humidity: 'Humidity',
    wind: 'Wind',
    precipitation: 'Precipitation',
    today: 'Today',
    updated: 'Updated {time} local time',
    source: 'Data',
    sameZone: 'Same time zone as you',
    ahead: '{hours} h ahead of you',
    behind: '{hours} h behind you',
    clear: 'Clear',
    mainlyClear: 'Mostly clear',
    partlyCloudy: 'Partly cloudy',
    overcast: 'Overcast',
    fog: 'Fog',
    drizzle: 'Drizzle',
    rain: 'Rain',
    snow: 'Snow',
    thunder: 'Thunderstorm',
  },
  ja: {
    weather: '天気',
    localTime: '現地時刻',
    feelsLike: '体感',
    humidity: '湿度',
    wind: '風速',
    precipitation: '降水量',
    today: '今日',
    updated: '現地時刻 {time} 更新',
    source: 'データ',
    sameZone: 'あなたと同じタイムゾーン',
    ahead: 'あなたより {hours} 時間進んでいます',
    behind: 'あなたより {hours} 時間遅れています',
    clear: '快晴',
    mainlyClear: '晴れ',
    partlyCloudy: '晴れ時々曇り',
    overcast: '曇り',
    fog: '霧',
    drizzle: '霧雨',
    rain: '雨',
    snow: '雪',
    thunder: '雷雨',
  },
  de: {
    weather: 'Wetter',
    localTime: 'Ortszeit',
    feelsLike: 'Gefühlt',
    humidity: 'Luftfeuchte',
    wind: 'Wind',
    precipitation: 'Niederschlag',
    today: 'Heute',
    updated: 'Aktualisiert {time} Ortszeit',
    source: 'Daten',
    sameZone: 'Gleiche Zeitzone wie Sie',
    ahead: '{hours} Std. vor Ihnen',
    behind: '{hours} Std. hinter Ihnen',
    clear: 'Klar',
    mainlyClear: 'Überwiegend klar',
    partlyCloudy: 'Teilweise bewölkt',
    overcast: 'Bedeckt',
    fog: 'Nebel',
    drizzle: 'Nieselregen',
    rain: 'Regen',
    snow: 'Schnee',
    thunder: 'Gewitter',
  },
  fr: {
    weather: 'Météo',
    localTime: 'Heure locale',
    feelsLike: 'Ressenti',
    humidity: 'Humidité',
    wind: 'Vent',
    precipitation: 'Précipitations',
    today: 'Aujourd’hui',
    updated: 'Mis à jour à {time}, heure locale',
    source: 'Données',
    sameZone: 'Même fuseau horaire que vous',
    ahead: '{hours} h d’avance sur vous',
    behind: '{hours} h de retard sur vous',
    clear: 'Dégagé',
    mainlyClear: 'Plutôt dégagé',
    partlyCloudy: 'Partiellement nuageux',
    overcast: 'Couvert',
    fog: 'Brouillard',
    drizzle: 'Bruine',
    rain: 'Pluie',
    snow: 'Neige',
    thunder: 'Orage',
  },
  es: {
    weather: 'Tiempo',
    localTime: 'Hora local',
    feelsLike: 'Sensación',
    humidity: 'Humedad',
    wind: 'Viento',
    precipitation: 'Precipitación',
    today: 'Hoy',
    updated: 'Actualizado a las {time}, hora local',
    source: 'Datos',
    sameZone: 'Misma zona horaria que tú',
    ahead: '{hours} h por delante de ti',
    behind: '{hours} h por detrás de ti',
    clear: 'Despejado',
    mainlyClear: 'Mayormente despejado',
    partlyCloudy: 'Parcialmente nublado',
    overcast: 'Cubierto',
    fog: 'Niebla',
    drizzle: 'Llovizna',
    rain: 'Lluvia',
    snow: 'Nieve',
    thunder: 'Tormenta',
  },
}

const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''))

function placeLine(place: Place): string {
  return [place.name, place.region, place.country].filter(Boolean).join(', ')
}

export function LiveCardView(props: { card: LiveCard; locale: UiLocale }) {
  return (
    <Switch>
      <Match when={props.card.kind === 'weather' && props.card}>
        {card => <WeatherCard card={card() as WeatherCardData} locale={props.locale} />}
      </Match>
      <Match when={props.card.kind === 'time' && props.card}>
        {card => <TimeCard card={card() as TimeCardData} locale={props.locale} />}
      </Match>
    </Switch>
  )
}

const CLOUD = 'M7 18h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6-1.5A4.5 4.5 0 0 0 7 18Z'
const LOW_CLOUD = 'M7 14h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6-1.5A4.5 4.5 0 0 0 7 14Z'
const disc = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`
type Mark = { d: string; class?: string }

function marks(condition: WeatherCondition, day: boolean): Mark[] {
  switch (condition) {
    case 'clear':
    case 'mainlyClear':
      return [{ d: disc(12, 12, 5), class: day ? 'wx-sun' : undefined }]
    case 'partlyCloudy':
      return [
        { d: disc(9, 9, 4), class: day ? 'wx-sun' : undefined },
        { d: CLOUD, class: 'wx-cloud' },
      ]
    case 'fog':
      return [{ d: 'M4 9h16M4 13h16M6 17h12' }]
    case 'drizzle':
      return [{ d: LOW_CLOUD }, { d: 'M9 18v1M13 18v1M17 18v1' }]
    case 'rain':
      return [{ d: LOW_CLOUD }, { d: 'M8 17l-1 4M12 17l-1 4M16 17l-1 4' }]
    case 'snow':
      return [{ d: LOW_CLOUD }, { d: 'M8 18h.01M12 20h.01M16 18h.01' }]
    case 'thunder':
      return [{ d: LOW_CLOUD }, { d: 'M13 14l-3 4h4l-3 4', class: 'wx-bolt' }]
    default:
      return [{ d: CLOUD }]
  }
}

/** Plain geometric marks; the condition name always accompanies them. */
function ConditionIcon(props: { condition: WeatherCondition; day?: boolean }) {
  return (
    <svg class="wx-icon" viewBox="0 0 24 24" aria-hidden="true">
      <For each={marks(props.condition, props.day ?? true)}>{mark => <path d={mark.d} class={mark.class} />}</For>
    </svg>
  )
}

function WeatherCard(props: { card: WeatherCardData; locale: UiLocale }) {
  const m = () => MESSAGES[props.locale]
  const degrees = (value: number) => `${Math.round(value)}°`
  const condition = () => weatherCondition(props.card.current.code)
  // Dates are local to the place: format them as calendar days, not instants.
  const weekday = (date: string, index: number) =>
    index === 0
      ? m().today
      : new Intl.DateTimeFormat(props.locale, { weekday: 'short', timeZone: 'UTC' }).format(
          new Date(`${date}T12:00:00Z`),
        )
  const observed = () => props.card.observedAt.slice(11, 16)
  const precipitation = () => `${props.card.current.precipitation} ${props.card.temperatureUnit === 'F' ? 'in' : 'mm'}`
  return (
    <section class="live wx" aria-label={`${m().weather} · ${placeLine(props.card.place)}`}>
      <p class="label">
        {m().weather} <span class="live-place">{placeLine(props.card.place)}</span>
      </p>
      <div class="wx-now">
        <p class="wx-temp">
          {degrees(props.card.current.temperature)}
          <span class="wx-unit">{props.card.temperatureUnit}</span>
        </p>
        <div class="wx-summary">
          <p class="wx-condition">
            <ConditionIcon condition={condition()} day={props.card.current.isDay} />
            {m()[condition()]}
          </p>
          <dl class="wx-facts">
            <div>
              <dt>{m().feelsLike}</dt>
              <dd>{degrees(props.card.current.apparent)}</dd>
            </div>
            <div>
              <dt>{m().humidity}</dt>
              <dd>{Math.round(props.card.current.humidity)}%</dd>
            </div>
            <div>
              <dt>{m().wind}</dt>
              <dd>
                {Math.round(props.card.current.wind)} {props.card.windUnit}
              </dd>
            </div>
            <div>
              <dt>{m().precipitation}</dt>
              <dd>{precipitation()}</dd>
            </div>
          </dl>
        </div>
      </div>
      <ol class="wx-days">
        <For each={props.card.daily}>
          {(day, i) => (
            <li classList={{ 'wx-today': i() === 0 }}>
              <span class="wx-day">{weekday(day.date, i())}</span>
              <span title={m()[weatherCondition(day.code)]}>
                <ConditionIcon condition={weatherCondition(day.code)} />
              </span>
              <span class="wx-range">
                <b>{degrees(day.max)}</b> {degrees(day.min)}
              </span>
              <span class="wx-chance">
                {day.precipitationChance != null && day.precipitationChance >= 20 ? `${day.precipitationChance}%` : ' '}
              </span>
            </li>
          )}
        </For>
      </ol>
      <p class="live-source">
        {fill(m().updated, { time: observed() })} · {m().source}{' '}
        <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
          Open-Meteo
        </a>
      </p>
    </section>
  )
}

/** Minutes east of UTC for a zone at an instant, from the runtime's own tz data. */
function offsetMinutes(timeZone: string, at: Date): number {
  const name =
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find(p => p.type === 'timeZoneName')?.value ?? 'GMT'
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name)
  return match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : 0
}

function TimeCard(props: { card: TimeCardData; locale: UiLocale }) {
  const m = () => MESSAGES[props.locale]
  const [now, setNow] = createSignal(new Date())
  // The visitor's zone is only known in the browser; the server renders without it.
  const [viewerOffset, setViewerOffset] = createSignal<number>()
  onMount(() => {
    setViewerOffset(-new Date().getTimezoneOffset())
    const timer = setInterval(() => setNow(new Date()), 1000)
    onCleanup(() => clearInterval(timer))
  })
  const zone = () => props.card.place.timezone
  const clock = () =>
    new Intl.DateTimeFormat(props.locale, {
      timeZone: zone(),
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(now())
  const date = () =>
    new Intl.DateTimeFormat(props.locale, { timeZone: zone(), weekday: 'long', month: 'long', day: 'numeric' }).format(
      now(),
    )
  const offsetName = () =>
    new Intl.DateTimeFormat('en-US', { timeZone: zone(), timeZoneName: 'shortOffset' })
      .formatToParts(now())
      .find(p => p.type === 'timeZoneName')?.value ?? ''
  const relation = () => {
    const viewer = viewerOffset()
    if (viewer === undefined) return undefined
    const diff = (offsetMinutes(zone(), now()) - viewer) / 60
    const hours = Number.isInteger(diff) ? Math.abs(diff) : Math.abs(diff).toFixed(1)
    return diff === 0 ? m().sameZone : fill(diff > 0 ? m().ahead : m().behind, { hours })
  }
  return (
    <section class="live clock" aria-label={`${m().localTime} · ${placeLine(props.card.place)}`}>
      <p class="label">
        {m().localTime} <span class="live-place">{placeLine(props.card.place)}</span>
      </p>
      <p class="clock-time">
        <time datetime={now().toISOString()}>{clock()}</time>
      </p>
      <p class="clock-meta">
        {date()} · {offsetName().replace('GMT', 'UTC')} · {zone()}
        <Show when={relation()}>{text => <> · {text()}</>}</Show>
      </p>
    </section>
  )
}
