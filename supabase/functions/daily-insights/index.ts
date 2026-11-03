// Supabase Edge Function: the daily analysis. The app sends a plain-text summary of the user's own
// data (built on the device), and Claude answers with what it sees and what to do next. The
// Anthropic key lives in the project's secrets (ANTHROPIC_API_KEY), never in the app, and only the
// logged-in owner of the project can call it.
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_CONTEXT = 60_000

const SYSTEM = `Você é o treinador e analista pessoal dentro de um app de saúde e treino de uma pessoa no Brasil. Todo dia você recebe um resumo dos dados dela (sono, recuperação, corridas e musculação, alimentação, água, peso e composição corporal, hábitos e o diário dela) e escreve a análise do dia.

Como escrever:
- Português do Brasil, direto e caloroso, sem jargão. Fale com a pessoa ("você").
- Baseie cada afirmação nos números do resumo e cite os valores ("HRV de 48 ms, abaixo dos 55 do último mês"). Não invente dados que não estão lá.
- Cruze as áreas: sono, treino, alimentação, hábitos e o que o diário conta. As relações encontradas pelo app são estatísticas: trate-as como pistas, não como causa provada.
- Compare o recente com o mês anterior e diga o que melhorou e o que piorou.
- Os dados de hoje podem estar incompletos, conforme a hora.
- Dicas concretas para os próximos dias, levando em conta os treinos planejados. No máximo 3 por área.
- Você não é médico. Se os dados ou o diário sugerirem um problema de saúde (dor que não passa, FC de repouso alta por vários dias, perda de peso rápida sem querer), recomende procurar um profissional, sem alarmismo.
- Deixe de fora as áreas sem dados.

Formato:
- "headline": uma frase com o principal do dia.
- "sections": de 3 a 6 áreas, as mais importantes hoje primeiro. "area" é uma de: sono, recuperacao, treino, alimentacao, corpo, habitos, geral. "title" curto; "text" de 2 a 4 frases; "tips" com 0 a 3 ações curtas.`

const SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          area: { type: 'string', enum: ['sono', 'recuperacao', 'treino', 'alimentacao', 'corpo', 'habitos', 'geral'] },
          title: { type: 'string' },
          text: { type: 'string' },
          tips: { type: 'array', items: { type: 'string' } },
        },
        required: ['area', 'title', 'text', 'tips'],
        additionalProperties: false,
      },
    },
  },
  required: ['headline', 'sections'],
  additionalProperties: false,
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

/** The caller must be a signed-in user of this project: the publishable key alone is public. */
async function isSignedIn(req: Request): Promise<boolean> {
  const authorization = req.headers.get('Authorization')
  const apikey = req.headers.get('apikey')
  if (!authorization || !apikey) return false
  try {
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey },
    })
    return response.ok
  } catch {
    return false
  }
}

let anthropic: Anthropic | undefined

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)
  if (!(await isSignedIn(req))) return json({ error: 'Entre na sua conta para usar a análise do dia.' }, 401)
  if (!Deno.env.get('ANTHROPIC_API_KEY')) {
    return json({ error: 'Falta a chave ANTHROPIC_API_KEY nos segredos das funções do Supabase.' }, 500)
  }
  anthropic ??= new Anthropic() // reads ANTHROPIC_API_KEY

  const { context } = (await req.json().catch(() => ({}))) as { context?: unknown }
  if (typeof context !== 'string' || !context.trim()) return json({ error: 'Envie o resumo dos dados.' }, 400)
  if (context.length > MAX_CONTEXT) return json({ error: 'O resumo dos dados ficou grande demais.' }, 413)

  try {
    const response = await anthropic.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // A declined request is retried server-side on Anthropic's recommended model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: context }],
    })

    if (response.stop_reason === 'refusal') return json({ error: 'A análise de hoje foi recusada.' }, 422)
    if (response.stop_reason === 'max_tokens') return json({ error: 'A análise ficou incompleta. Tente de novo.' }, 502)
    const output = response.content.find((block) => block.type === 'text')
    if (!output || output.type !== 'text') return json({ error: 'Resposta vazia da análise.' }, 502)
    return json({ ...JSON.parse(output.text), model: response.model })
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return json({ error: 'Muitas análises seguidas. Tente em instantes.' }, 429)
    if (error instanceof Anthropic.AuthenticationError) {
      return json({ error: 'A chave da Anthropic no Supabase não é válida.' }, 500)
    }
    if (error instanceof Anthropic.APIError) return json({ error: `Erro da API (${error.status}).` }, 502)
    return json({ error: 'Não foi possível fazer a análise.' }, 500)
  }
})
