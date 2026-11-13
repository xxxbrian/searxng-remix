import { For } from 'solid-js'
import { Check, Field, NumberField, Panel, SectionForm } from './fields'
import { useAdminText } from './i18n'
import { useAdmin } from './store'

export function BehaviorSection() {
  const admin = useAdmin()
  const text = useAdminText()
  const { t } = text
  const draft = () => admin.draft()
  return (
    <>
      <SectionForm keys={['defaultLanguage', 'safeSearch', 'aiEnabled', 'aiAuto']}>
        <Panel title={t('section_behavior')}>
          <div class="grid">
            <Field label={t('defaultLanguage')}>
              <select
                value={draft().defaultLanguage}
                onChange={e => admin.update('defaultLanguage', e.currentTarget.value)}
              >
                <option value="auto">{t('languageAuto')}</option>
                <option value="all">{t('languageAll')}</option>
                <For each={admin.data().languages}>
                  {l => (
                    <option value={l.code}>
                      {l.name} · {l.code}
                    </option>
                  )}
                </For>
              </select>
            </Field>
            <Field label={t('safeSearch')}>
              <select
                value={draft().safeSearch}
                onChange={e => admin.update('safeSearch', Number(e.currentTarget.value) as 0 | 1 | 2)}
              >
                <option value="0">{t('safeOff')}</option>
                <option value="1">{t('safeModerate')}</option>
                <option value="2">{t('safeStrict')}</option>
              </select>
            </Field>
          </div>
          <Check label={t('offerAi')} checked={draft().aiEnabled} onChange={v => admin.update('aiEnabled', v)} />
          <Check
            label={t('autoAi')}
            checked={draft().aiAuto}
            disabled={!draft().aiEnabled}
            onChange={v => admin.update('aiAuto', v)}
          />
        </Panel>
      </SectionForm>
      <SectionForm keys={['live']}>
        <Panel title={t('liveCards')} aside={t('liveHint')}>
          <Check
            label={t('weather')}
            checked={draft().live.weather}
            onChange={weather => admin.patch('live', { weather })}
          />
          <Check label={t('localTime')} checked={draft().live.time} onChange={time => admin.patch('live', { time })} />
          <div class="grid">
            <Field label={t('temperatureUnit')}>
              <select
                value={draft().live.temperatureUnit}
                onChange={e =>
                  admin.patch('live', { temperatureUnit: e.currentTarget.value as 'auto' | 'celsius' | 'fahrenheit' })
                }
              >
                <option value="auto">{t('unitAuto')}</option>
                <option value="celsius">{t('celsius')}</option>
                <option value="fahrenheit">{t('fahrenheit')}</option>
              </select>
            </Field>
            <NumberField
              label={t('weatherCache')}
              min={1}
              max={180}
              value={draft().live.cacheMinutes}
              onChange={cacheMinutes => admin.patch('live', { cacheMinutes })}
            />
          </div>
        </Panel>
      </SectionForm>
      <SectionForm keys={['limits']}>
        <Panel title={t('limitsTitle')} aside={t('limitsHint')}>
          <div class="grid">
            <NumberField
              label={t('searchCache')}
              hint={t('zeroNoCache')}
              min={0}
              max={120}
              value={draft().limits.cacheMinutes}
              onChange={cacheMinutes => admin.patch('limits', { cacheMinutes })}
            />
            <NumberField
              label={t('upstreamTimeout')}
              min={2}
              max={60}
              value={draft().limits.upstreamTimeoutSec}
              onChange={upstreamTimeoutSec => admin.patch('limits', { upstreamTimeoutSec })}
            />
            <NumberField
              label={t('perMinute', { kind: text.kind('search') })}
              min={1}
              max={1000}
              value={draft().limits.searchPerMinute}
              onChange={searchPerMinute => admin.patch('limits', { searchPerMinute })}
            />
            <NumberField
              label={t('perMinute', { kind: text.kind('suggest') })}
              min={1}
              max={2000}
              value={draft().limits.suggestPerMinute}
              onChange={suggestPerMinute => admin.patch('limits', { suggestPerMinute })}
            />
            <NumberField
              label={t('perMinute', { kind: text.kind('intent') })}
              min={1}
              max={1000}
              value={draft().limits.intentPerMinute}
              onChange={intentPerMinute => admin.patch('limits', { intentPerMinute })}
            />
            <NumberField
              label={t('perMinute', { kind: text.kind('summary') })}
              min={1}
              max={200}
              value={draft().limits.summaryPerMinute}
              onChange={summaryPerMinute => admin.patch('limits', { summaryPerMinute })}
            />
            <NumberField
              label={t('perMinute', { kind: text.kind('live') })}
              min={1}
              max={1000}
              value={draft().limits.livePerMinute}
              onChange={livePerMinute => admin.patch('limits', { livePerMinute })}
            />
          </div>
        </Panel>
      </SectionForm>
    </>
  )
}
