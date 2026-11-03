import { Plus, Utensils } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { Button, Card } from '../../components/ui'
import { useSettings } from '../../db/hooks'
import type { DayKey } from '../../lib/dates'
import { goalsFor, mealAt, sumNutrients, useFoodLogs, useTrainingDays } from './nutrition'
import { NutritionSummary } from './NutritionSummary'

export function TodayFoodCard({ today }: { today: DayKey }) {
  const navigate = useNavigate()
  const settings = useSettings()
  const logs = useFoodLogs(today, today)
  const trainingDay = useTrainingDays(today, today)?.has(today) ?? false
  const totals = sumNutrients((logs ?? []).map((log) => log.nutrients))

  return (
    <Card
      icon={Utensils}
      tone="food"
      title="Alimentação"
      action={
        <Link to="/alimentacao" className="text-sm font-medium text-accent-ink">
          Refeições
        </Link>
      }
    >
      <NutritionSummary totals={totals} goals={goalsFor(settings, trainingDay)} />
      <Button
        variant="primary"
        className="mt-3 w-full"
        onClick={() => navigate(`/alimentacao/adicionar?refeicao=${mealAt(new Date())}`)}
      >
        <Plus size={18} /> Adicionar alimento
      </Button>
    </Card>
  )
}
