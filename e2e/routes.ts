import type { SeedIds } from './seed'

/**
 * Every screen the smoke test opens: one address for each route of src/App.tsx (the ones with a
 * parameter, with a row of the made-up data), plus the tabs and states that are screens of their own.
 * `routes.test.ts` fails when App.tsx has a route that isn't here.
 */
export const screens = (ids: SeedIds): { route: string; address: string }[] => [
  { route: '/', address: '/' },
  { route: 'treinos', address: '/treinos' },
  { route: 'treinos/ficha/:id', address: `/treinos/ficha/${ids.template}` },
  { route: 'treinos/ficha/:id', address: '/treinos/ficha/nova' },
  { route: 'treinos/sessao/:id', address: `/treinos/sessao/${ids.session}` },
  { route: 'treinos/exercicios', address: '/treinos/exercicios' },
  { route: 'treinos/exercicios/:id', address: `/treinos/exercicios/${ids.exercise}` },
  { route: 'treinos/atividades', address: '/treinos/atividades' },
  { route: 'treinos/atividades/:id', address: `/treinos/atividades/${ids.run}` },
  { route: 'treinos/atividades/:id', address: `/treinos/atividades/${ids.strength}` },
  { route: 'calendario', address: '/calendario' },
  { route: 'corrida', address: '/corrida' },
  { route: 'corrida/recordes', address: '/corrida/recordes' },
  { route: 'corrida/tenis', address: '/corrida/tenis' },
  { route: 'corrida/provas', address: '/corrida/provas' },
  { route: 'recordes', address: '/recordes' },
  { route: 'passos', address: '/passos' },
  { route: 'calorias', address: '/calorias' },
  { route: 'semana', address: '/semana' },
  { route: 'semana', address: '/semana?periodo=mes' },
  { route: 'retrospectiva', address: '/retrospectiva' },
  { route: 'alimentacao', address: '/alimentacao' },
  { route: 'alimentacao/adicionar', address: '/alimentacao/adicionar' },
  { route: 'alimentacao/revisar', address: '/alimentacao/revisar' },
  { route: 'corpo', address: '/corpo' },
  { route: 'corpo', address: '/corpo?aba=medidas' },
  { route: 'corpo', address: '/corpo?aba=fotos' },
  { route: 'sono', address: '/sono' },
  { route: 'correlacoes', address: '/correlacoes' },
  { route: 'diario', address: '/diario' },
  { route: 'analise', address: '/analise' },
  { route: 'mais', address: '/mais' },
  { route: 'agua', address: '/agua' },
  { route: 'clima', address: '/clima' },
  { route: 'habitos', address: '/habitos' },
  { route: 'ajustes', address: '/ajustes' },
]
