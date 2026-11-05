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

/**
 * The free-exercise-db exercise (its id) of each default one, for its pictures and steps, matched by
 * hand against the dataset's dist/exercises.json. Kept apart from the seeded rows so libraries seeded
 * before it get the pictures too; an exercise's own `mediaId` (the user's choice) wins over it.
 */
export const DEFAULT_MEDIA: Record<string, string> = {
  'ex-supino-reto-barra': 'Barbell_Bench_Press_-_Medium_Grip',
  'ex-supino-inclinado-barra': 'Barbell_Incline_Bench_Press_-_Medium_Grip',
  'ex-supino-reto-halteres': 'Dumbbell_Bench_Press',
  'ex-supino-inclinado-halteres': 'Incline_Dumbbell_Press',
  'ex-supino-maquina': 'Machine_Bench_Press',
  'ex-crucifixo-halteres': 'Dumbbell_Flyes',
  'ex-peck-deck': 'Butterfly',
  'ex-crossover': 'Cable_Crossover',
  'ex-flexao': 'Pushups',
  'ex-paralelas': 'Dips_-_Chest_Version',

  'ex-puxada-frontal': 'Wide-Grip_Lat_Pulldown',
  'ex-barra-fixa': 'Pullups',
  'ex-remada-curvada': 'Bent_Over_Barbell_Row',
  'ex-remada-unilateral': 'One-Arm_Dumbbell_Row',
  'ex-remada-baixa': 'Seated_Cable_Rows',
  'ex-remada-cavalinho': 'T-Bar_Row_with_Handle',
  'ex-pulldown': 'Straight-Arm_Pulldown',
  'ex-levantamento-terra': 'Barbell_Deadlift',
  'ex-hiperextensao': 'Hyperextensions_Back_Extensions',
  'ex-encolhimento': 'Dumbbell_Shrug',

  'ex-desenvolvimento-halteres': 'Dumbbell_Shoulder_Press',
  'ex-desenvolvimento-barra': 'Barbell_Shoulder_Press',
  'ex-elevacao-lateral': 'Side_Lateral_Raise',
  'ex-elevacao-lateral-polia': 'Standing_Low-Pulley_Deltoid_Raise',
  'ex-elevacao-frontal': 'Front_Dumbbell_Raise',
  'ex-crucifixo-inverso': 'Reverse_Flyes',
  'ex-face-pull': 'Face_Pull',

  'ex-rosca-direta': 'Barbell_Curl',
  'ex-rosca-alternada': 'Dumbbell_Alternate_Bicep_Curl',
  'ex-rosca-martelo': 'Hammer_Curls',
  'ex-rosca-scott': 'Machine_Preacher_Curls',
  'ex-rosca-polia': 'Standing_Biceps_Cable_Curl',

  'ex-triceps-corda': 'Triceps_Pushdown_-_Rope_Attachment',
  'ex-triceps-barra': 'Triceps_Pushdown',
  'ex-triceps-testa': 'Lying_Triceps_Press',
  'ex-triceps-frances': 'Seated_Triceps_Press',
  'ex-mergulho-banco': 'Bench_Dips',

  'ex-rosca-punho': 'Seated_Palm-Up_Barbell_Wrist_Curl',

  'ex-agachamento-livre': 'Barbell_Squat',
  'ex-agachamento-smith': 'Smith_Machine_Squat',
  'ex-leg-press': 'Leg_Press',
  'ex-hack': 'Hack_Squat',
  'ex-cadeira-extensora': 'Leg_Extensions',
  'ex-afundo': 'Dumbbell_Lunges',
  'ex-bulgaro': 'Split_Squat_with_Dumbbells',

  'ex-mesa-flexora': 'Lying_Leg_Curls',
  'ex-cadeira-flexora': 'Seated_Leg_Curl',
  'ex-stiff': 'Stiff-Legged_Barbell_Deadlift',

  'ex-elevacao-pelvica': 'Barbell_Hip_Thrust',
  'ex-abdutora': 'Thigh_Abductor',
  'ex-gluteo-polia': 'One-Legged_Cable_Kickback',
  'ex-adutora': 'Thigh_Adductor',

  'ex-panturrilha-pe': 'Standing_Calf_Raises',
  'ex-panturrilha-sentado': 'Seated_Calf_Raise',

  'ex-abdominal': 'Crunches',
  'ex-prancha': 'Plank',
  'ex-elevacao-pernas': 'Flat_Bench_Lying_Leg_Raise',
  'ex-abdominal-polia': 'Cable_Crunch',

  'ex-esteira': 'Running_Treadmill',
  'ex-bicicleta': 'Bicycling_Stationary',
  'ex-eliptico': 'Elliptical_Trainer',
  'ex-escada': 'Step_Mill',
}

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
