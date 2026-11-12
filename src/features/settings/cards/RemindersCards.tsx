import { Card, Select, Switch, TextInput } from '../../../components/ui'
import { useSettings } from '../../../db/hooks'
import { updateSettings } from '../../../db/settings'
import type { SmartReminders } from '../../../db/types'
import { requestNotificationPermission } from '../../notifications/native'
import { leadText, WORKOUT_LEADS } from '../../notifications/reminders'

const SMART_DEFAULTS = { weighIn: '08:30', lunch: '14:00', dinner: '21:30' } as const

/** Changes the reminders from what is stored, so two switches flipped one after the other both count. */
const change = (next: (stored: SmartReminders) => SmartReminders) =>
  void updateSettings((settings) => ({ smartReminders: next(settings.smartReminders ?? {}) }))

/** Turning a reminder on also asks Android for the notifications, the first time. */
const turnOn = (next: (stored: SmartReminders) => SmartReminders) => {
  void requestNotificationPermission()
  change(next)
}

/** Heads-ups before the planned workouts, and the week in numbers on Sunday night. */
export function WorkoutRemindersCard() {
  const smart = useSettings().smartReminders ?? {}
  return (
    <Card title="Treinos e semana">
      <ul className="divide-y divide-line">
        <li className="flex items-center gap-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block text-sm">Antes dos treinos</span>
            <span className="block text-xs text-muted">musculação, corridas e caminhadas programadas com horário</span>
          </span>
          {smart.workouts && (
            <span className="w-32 shrink-0">
              <Select
                aria-label="Quanto tempo antes do treino"
                value={String(smart.workouts)}
                onChange={(event) => {
                  const workouts = Number(event.target.value)
                  change((stored) => ({ ...stored, workouts }))
                }}
              >
                {WORKOUT_LEADS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {leadText(minutes)} antes
                  </option>
                ))}
              </Select>
            </span>
          )}
          <Switch
            label="Aviso antes dos treinos"
            checked={!!smart.workouts}
            onChange={(on) =>
              on ? turnOn((stored) => ({ ...stored, workouts: 30 })) : change((stored) => ({ ...stored, workouts: undefined }))
            }
          />
        </li>
        <li className="flex items-center gap-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block text-sm">Resumo da semana</span>
            <span className="block text-xs text-muted">domingo às 20h: treinos, corrida, sono e água da semana</span>
          </span>
          <Switch
            label="Resumo da semana no domingo"
            checked={!!smart.weekly}
            onChange={(on) =>
              on ? turnOn((stored) => ({ ...stored, weekly: true })) : change((stored) => ({ ...stored, weekly: undefined }))
            }
          />
        </li>
      </ul>
    </Card>
  )
}

/** Reminders that only come when something is missing that day (Android app). */
export function SmartRemindersCard() {
  const smart = useSettings().smartReminders ?? {}
  const timed = [
    { key: 'weighIn', label: 'Pesagem', detail: 'se ainda não houver pesagem no dia' },
    { key: 'lunch', label: 'Almoço', detail: 'se nada foi registrado no almoço' },
    { key: 'dinner', label: 'Jantar', detail: 'se nada foi registrado no jantar' },
  ] as const
  return (
    <Card title="Lembretes do dia">
      <p className="mb-3 text-sm text-ink-2">Só aparecem quando falta registrar; registrar antes cancela o lembrete.</p>
      <ul className="divide-y divide-line">
        {timed.map(({ key, label, detail }) => (
          <li key={key} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-sm">{label}</span>
              <span className="block text-xs text-muted">{detail}</span>
            </span>
            {smart[key] && (
              <span className="w-28 shrink-0">
                <TextInput
                  type="time"
                  aria-label={`Horário do lembrete de ${label.toLowerCase()}`}
                  value={smart[key]}
                  onChange={(e) => {
                    const time = e.target.value
                    if (time) change((stored) => ({ ...stored, [key]: time }))
                  }}
                />
              </span>
            )}
            <Switch
              label={`Lembrete de ${label.toLowerCase()}`}
              checked={!!smart[key]}
              onChange={(on) =>
                on
                  ? turnOn((stored) => ({ ...stored, [key]: SMART_DEFAULTS[key] }))
                  : change((stored) => ({ ...stored, [key]: undefined }))
              }
            />
          </li>
        ))}
        <li className="flex items-center gap-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block text-sm">Água no ritmo</span>
            <span className="block text-xs text-muted">às 11h, 15h e 19h, se estiver atrás do ritmo da meta</span>
          </span>
          <Switch
            label="Lembrete de água"
            checked={!!smart.water}
            onChange={(on) =>
              on ? turnOn((stored) => ({ ...stored, water: true })) : change((stored) => ({ ...stored, water: undefined }))
            }
          />
        </li>
      </ul>
    </Card>
  )
}
