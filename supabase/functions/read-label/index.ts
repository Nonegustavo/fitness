// Supabase Edge Function: reads the nutrition facts table ("Informação nutricional") on a photo of a
// food package with Claude, so a new food is filled in from its label. The Anthropic key lives in the
// project's secrets (ANTHROPIC_API_KEY), never in the app, and only the logged-in owner of the
// project can call it.
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
type MediaType = (typeof MEDIA_TYPES)[number]

const SYSTEM = `Você lê a tabela de informação nutricional de embalagens de alimentos do Brasil, a partir de uma foto, para cadastrar o alimento num app pessoal de nutrição. A pessoa confere tudo antes de salvar.

A tabela brasileira atual traz colunas por 100 g (ou 100 ml), por porção e %VD. Tabelas antigas trazem só a porção.

- "name": o nome do produto, se aparecer na foto, sem a marca; senão, uma descrição curta do alimento pela embalagem; vazio se não der para saber.
- "brand": a marca, se aparecer; vazio se não.
- "portionLabel": a porção em medida caseira, como na embalagem ("2 fatias", "1 colher de sopa", "1 unidade"); vazio se não houver.
- "portionGrams": o peso da porção em gramas (ou o volume em ml); null se não estiver legível.
- "perPortion" e "per100": os valores de cada coluna, copiados da tabela. Não calcule uma coluna a partir da outra: o app faz a conta. null quando a coluna não existe na foto.
  - "kcal": valor energético em kcal (não em kJ).
  - "carbs": carboidratos totais; "protein": proteínas; "fat": gorduras totais; "fiber": fibra alimentar; "sugar": açúcares totais; "saturatedFat": gorduras saturadas; "sodium": sódio em mg.
  - Vírgula é decimal ("2,5" é 2.5). "Zero", "0" ou "não contém quantidade significativa" valem 0. Um valor ilegível ou ausente fica null.
- "notes": uma frase sobre o que ficou ilegível, cortado ou duvidoso; vazio se tudo estiver claro.

Se a foto não mostrar uma tabela nutricional, devolva as colunas null e diga isso em "notes".`

const NUMBER = { anyOf: [{ type: 'number' }, { type: 'null' }] }
const KEYS = ['kcal', 'carbs', 'protein', 'fat', 'fiber', 'sugar', 'saturatedFat', 'sodium'] as const
const COLUMN = {
  anyOf: [
    {
      type: 'object',
      properties: Object.fromEntries(KEYS.map((key) => [key, NUMBER])),
      required: [...KEYS],
      additionalProperties: false,
    },
    { type: 'null' },
  ],
}

const SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    brand: { type: 'string' },
    portionLabel: { type: 'string' },
    portionGrams: NUMBER,
    perPortion: COLUMN,
    per100: COLUMN,
    notes: { type: 'string' },
  },
  required: ['name', 'brand', 'portionLabel', 'portionGrams', 'perPortion', 'per100', 'notes'],
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
  if (!(await isSignedIn(req))) return json({ error: 'Entre na sua conta para ler a tabela nutricional.' }, 401)
  if (!Deno.env.get('ANTHROPIC_API_KEY')) {
    return json({ error: 'Falta a chave ANTHROPIC_API_KEY nos segredos das funções do Supabase.' }, 500)
  }
  anthropic ??= new Anthropic() // reads ANTHROPIC_API_KEY

  const { image, mediaType } = (await req.json().catch(() => ({}))) as { image?: unknown; mediaType?: unknown }
  if (typeof image !== 'string' || !MEDIA_TYPES.includes(mediaType as MediaType)) {
    return json({ error: 'Envie a foto do rótulo em base64 (JPEG, PNG ou WebP).' }, 400)
  }

  try {
    const response = await anthropic.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // A declined request is retried server-side on Anthropic's recommended model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType as MediaType, data: image } },
            { type: 'text', text: 'Leia a tabela nutricional desta embalagem.' },
          ],
        },
      ],
    })

    if (response.stop_reason === 'refusal') return json({ error: 'A leitura deste rótulo foi recusada.' }, 422)
    if (response.stop_reason === 'max_tokens') return json({ error: 'A leitura ficou incompleta. Tente de novo.' }, 502)
    const output = response.content.find((block) => block.type === 'text')
    if (!output || output.type !== 'text') return json({ error: 'Resposta vazia da leitura.' }, 502)
    return json(JSON.parse(output.text))
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return json({ error: 'Muitas leituras seguidas. Tente em instantes.' }, 429)
    if (error instanceof Anthropic.AuthenticationError) {
      return json({ error: 'A chave da Anthropic no Supabase não é válida.' }, 500)
    }
    if (error instanceof Anthropic.APIError) return json({ error: `Erro da API (${error.status}).` }, 502)
    return json({ error: 'Não foi possível ler a tabela.' }, 500)
  }
})
