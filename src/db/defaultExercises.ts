import type { Equipment, Exercise, ExerciseType, MuscleGroup } from './types'

type Seed = [id: string, name: string, muscle: MuscleGroup, equipment: Equipment, type?: ExerciseType]

const SEEDS: Seed[] = [
  ['ex-supino-reto-barra', 'Supino reto com barra', 'chest', 'barbell'],
  ['ex-supino-inclinado-barra', 'Supino inclinado com barra', 'chest', 'barbell'],
  ['ex-supino-reto-halteres', 'Supino reto com halteres', 'chest', 'dumbbell'],
  ['ex-supino-inclinado-halteres', 'Supino inclinado com halteres', 'chest', 'dumbbell'],
  ['ex-supino-maquina', 'Supino na máquina', 'chest', 'machine'],
  ['ex-crucifixo-halteres', 'Crucifixo com halteres', 'chest', 'dumbbell'],
  ['ex-peck-deck', 'Crucifixo na máquina (peck deck)', 'chest', 'machine'],
  ['ex-crossover', 'Crossover na polia', 'chest', 'cable'],
  ['ex-flexao', 'Flexão de braço', 'chest', 'bodyweight', 'reps'],
  ['ex-paralelas', 'Paralelas', 'chest', 'bodyweight', 'reps'],

  ['ex-puxada-frontal', 'Puxada frontal na polia', 'back', 'cable'],
  ['ex-barra-fixa', 'Barra fixa', 'back', 'bodyweight', 'reps'],
  ['ex-remada-curvada', 'Remada curvada com barra', 'back', 'barbell'],
  ['ex-remada-unilateral', 'Remada unilateral com halter (serrote)', 'back', 'dumbbell'],
  ['ex-remada-baixa', 'Remada baixa na polia', 'back', 'cable'],
  ['ex-remada-cavalinho', 'Remada cavalinho', 'back', 'machine'],
  ['ex-pulldown', 'Pulldown com braços estendidos', 'back', 'cable'],
  ['ex-levantamento-terra', 'Levantamento terra', 'back', 'barbell'],
  ['ex-hiperextensao', 'Hiperextensão lombar', 'back', 'bodyweight', 'reps'],
  ['ex-encolhimento', 'Encolhimento com halteres', 'back', 'dumbbell'],

  ['ex-desenvolvimento-halteres', 'Desenvolvimento com halteres', 'shoulders', 'dumbbell'],
  ['ex-desenvolvimento-barra', 'Desenvolvimento com barra', 'shoulders', 'barbell'],
  ['ex-elevacao-lateral', 'Elevação lateral com halteres', 'shoulders', 'dumbbell'],
  ['ex-elevacao-lateral-polia', 'Elevação lateral na polia', 'shoulders', 'cable'],
  ['ex-elevacao-frontal', 'Elevação frontal com halteres', 'shoulders', 'dumbbell'],
  ['ex-crucifixo-inverso', 'Crucifixo inverso', 'shoulders', 'dumbbell'],
  ['ex-face-pull', 'Face pull', 'shoulders', 'cable'],

  ['ex-rosca-direta', 'Rosca direta com barra', 'biceps', 'barbell'],
  ['ex-rosca-alternada', 'Rosca alternada com halteres', 'biceps', 'dumbbell'],
  ['ex-rosca-martelo', 'Rosca martelo', 'biceps', 'dumbbell'],
  ['ex-rosca-scott', 'Rosca Scott', 'biceps', 'machine'],
  ['ex-rosca-polia', 'Rosca na polia', 'biceps', 'cable'],

  ['ex-triceps-corda', 'Tríceps na polia com corda', 'triceps', 'cable'],
  ['ex-triceps-barra', 'Tríceps na polia com barra', 'triceps', 'cable'],
  ['ex-triceps-testa', 'Tríceps testa', 'triceps', 'barbell'],
  ['ex-triceps-frances', 'Tríceps francês', 'triceps', 'dumbbell'],
  ['ex-mergulho-banco', 'Mergulho no banco', 'triceps', 'bodyweight', 'reps'],

  ['ex-rosca-punho', 'Rosca de punho', 'forearms', 'barbell'],

  ['ex-agachamento-livre', 'Agachamento livre', 'quads', 'barbell'],
  ['ex-agachamento-smith', 'Agachamento no Smith', 'quads', 'smith'],
  ['ex-leg-press', 'Leg press 45°', 'quads', 'machine'],
  ['ex-hack', 'Agachamento hack', 'quads', 'machine'],
  ['ex-cadeira-extensora', 'Cadeira extensora', 'quads', 'machine'],
  ['ex-afundo', 'Afundo com halteres', 'quads', 'dumbbell'],
  ['ex-bulgaro', 'Agachamento búlgaro', 'quads', 'dumbbell'],

  ['ex-mesa-flexora', 'Mesa flexora', 'hamstrings', 'machine'],
  ['ex-cadeira-flexora', 'Cadeira flexora', 'hamstrings', 'machine'],
  ['ex-stiff', 'Stiff com barra', 'hamstrings', 'barbell'],

  ['ex-elevacao-pelvica', 'Elevação pélvica', 'glutes', 'barbell'],
  ['ex-abdutora', 'Cadeira abdutora', 'glutes', 'machine'],
  ['ex-gluteo-polia', 'Glúteo na polia', 'glutes', 'cable'],
  ['ex-adutora', 'Cadeira adutora', 'adductors', 'machine'],

  ['ex-panturrilha-pe', 'Panturrilha em pé', 'calves', 'machine'],
  ['ex-panturrilha-sentado', 'Panturrilha sentado', 'calves', 'machine'],

  ['ex-abdominal', 'Abdominal supra', 'abs', 'bodyweight', 'reps'],
  ['ex-prancha', 'Prancha', 'abs', 'bodyweight', 'time'],
  ['ex-elevacao-pernas', 'Elevação de pernas', 'abs', 'bodyweight', 'reps'],
  ['ex-abdominal-polia', 'Abdominal na polia', 'abs', 'cable'],

  ['ex-esteira', 'Esteira', 'cardio', 'machine', 'time'],
  ['ex-bicicleta', 'Bicicleta ergométrica', 'cardio', 'machine', 'time'],
  ['ex-eliptico', 'Elíptico', 'cardio', 'machine', 'time'],
  ['ex-escada', 'Escada', 'cardio', 'machine', 'time'],
]

/** The starting library. Fixed ids and updatedAt 0, like the other seeded rows. */
export const DEFAULT_EXERCISES: Exercise[] = SEEDS.map(([id, name, muscle, equipment, type = 'weight_reps']) => ({
  id,
  name,
  muscle,
  equipment,
  type,
  updatedAt: 0,
  deleted: 0,
  dirty: 0,
}))
