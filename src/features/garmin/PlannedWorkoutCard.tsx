import { Card } from '../../components/ui'
import type { PlannedStep, PlannedWorkout } from '../../db/types'
import { describeStep, workoutBlocks } from './workout'

/** The structured workout the watch followed, with repeats grouped. */
export function PlannedWorkoutCard({
  workout,
  foot,
  lapsBelow,
}: {
  workout: PlannedWorkout
  foot: boolean
  /** Whether the page shows the laps table, which the hint points to. */
  lapsBelow: boolean
}) {
  const blocks = workoutBlocks(workout.steps)
  return (
    <Card title="Treino planejado">
      {workout.name && <p className="mb-3 font-medium">{workout.name}</p>}
      <ol className="space-y-2 text-sm">
        {blocks.map((block, i) =>
          block.kind === 'step' ? (
            <StepRow key={i} step={block.step} foot={foot} />
          ) : (
            <li key={i} className="rounded-xl bg-surface-2 px-3 py-2">
              <p className="mb-1 text-xs font-semibold text-ink-2">Repetir {block.times}×</p>
              <ol className="space-y-1.5">
                {block.steps.map((step) => (
                  <StepRow key={step.index} step={step} foot={foot} />
                ))}
              </ol>
            </li>
          ),
        )}
      </ol>
      {lapsBelow && <p className="mt-3 text-xs text-muted">Cada etapa costuma virar uma volta na tabela de voltas.</p>}
    </Card>
  )
}

function StepRow({ step, foot }: { step: PlannedStep; foot: boolean }) {
  const { title, detail } = describeStep(step, foot)
  return (
    <li>
      <span className="font-medium">{title}</span>
      {detail && <span className="text-ink-2"> · {detail}</span>}
      {step.notes && <span className="block text-xs text-muted">{step.notes}</span>}
    </li>
  )
}
