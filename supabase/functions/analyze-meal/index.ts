// Supabase Edge Function: identifies the foods in a plate photo, or in a description of the meal,
// and estimates their weight with Claude; or, from the list of what was eaten (one item per line with
// its amount), works out the grams and macros of each item. The Anthropic key lives in the project's
// secrets (ANTHROPIC_API_KEY), never in the app, and only the logged-in owner of the project can call it.
//
// Requests (POST, JSON):
// - {image, mediaType, hint?}: a plate photo → {items: [{name, search, grams, confidence}], notes}
// - {text}: a description of the meal → the same answer
// - {text, mode: 'macros'}: the list of what was eaten → {items: [{name, grams, carbs, protein, fat}], notes}
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
type MediaType = (typeof MEDIA_TYPES)[number]

const SYSTEM = `Você analisa refeições para um app pessoal de nutrição no Brasil, a partir de uma foto do prato ou de uma descrição em texto.
Identifique cada alimento e estime quanto dele foi comido, em gramas.

- Numa foto, use o prato (um prato raso comum tem 24 a 27 cm), talheres e outros objetos como referência de tamanho.
- Numa descrição, use as quantidades que a pessoa disser ("2 ovos", "1 concha de feijão", "200 g de frango"). Quando ela não disser, use uma porção comum no Brasil.
- Separe os componentes em itens diferentes (arroz, feijão, carne, salada…). Molhos, óleo ou temperos são itens próprios quando aparecem ou são citados.
- "name": como a pessoa chamaria o alimento ("Arroz branco", "Bife acebolado").
- "search": de 2 a 5 palavras, sem acentos, para achar o alimento na tabela TACO, no estilo dela: alimento, tipo e preparo ("arroz tipo 1 cozido", "feijao carioca cozido", "carne bovina contra file grelhado", "alface crespa crua").
- "grams": o peso do alimento pronto, como foi comido.
- "confidence": "alta" quando o alimento e a quantidade estão claros; "media" quando há alguma dúvida ou a quantidade foi estimada; "baixa" quando está coberto, misturado ou incerto.
- "notes": uma frase curta sobre o que não dá para saber e pode mudar a conta (óleo do preparo, itens escondidos, tamanho da porção). Vazio se não houver.

Se não houver comida na foto ou no texto, devolva "items" vazio e diga isso em "notes".`

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          search: { type: 'string' },
          grams: { type: 'number' },
          confidence: { type: 'string', enum: ['alta', 'media', 'baixa'] },
        },
        required: ['name', 'search', 'grams', 'confidence'],
        additionalProperties: false,
      },
    },
    notes: { type: 'string' },
  },
  required: ['items', 'notes'],
  additionalProperties: false,
}

const MACROS_SYSTEM = `Você calcula os macronutrientes de uma refeição para um app pessoal de nutrição no Brasil. A pessoa manda o que comeu, um item por linha, com a quantidade de cada um (gramas, unidades, colheres, conchas, fatias…), e confere os números antes de registrar.

- Devolva um item para cada item da lista, na mesma ordem. Não junte, não divida e não acrescente itens. Se vier tudo numa frase, cada parte separada por vírgula ou "e" é um item.
- "name": o nome do alimento como a pessoa escreveu, sem a quantidade; corrija só a grafia, com a primeira letra maiúscula ("Arroz branco", "Bife acebolado").
- "grams": o peso do item como foi comido, em gramas. Quando a quantidade vier em gramas, use esse número; em ml, use os ml. Converta medidas caseiras pelas porções comuns no Brasil (1 concha de feijão, 1 colher de sopa de arroz, 1 fatia de pão de forma, 1 ovo…). Sem quantidade, use uma porção comum.
- "carbs", "protein" e "fat": os gramas de carboidratos, proteína e gorduras nessa quantidade, com uma casa decimal. Use valores típicos do alimento no Brasil, no preparo que a pessoa disse ou no mais comum para ele (cozido, grelhado, frito…).
- "notes": uma frase curta sobre o que você supôs e muda os números (óleo do preparo, tipo de preparo, tamanho da porção). Vazio se não houver.

Se a lista não tiver nenhum alimento, devolva "items" vazio e diga isso em "notes".`

const MACROS_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          grams: { type: 'number' },
          carbs: { type: 'number' },
          protein: { type: 'number' },
          fat: { type: 'number' },
        },
        required: ['name', 'grams', 'carbs', 'protein', 'fat'],
        additionalProperties: false,
      },
    },
    notes: { type: 'string' },
  },
  required: ['items', 'notes'],
  additionalProperties: false,
}

/** What one request asks Claude: the instructions, the answer's shape, how hard to think, and the meal. */
interface Analysis {
  system: string
  schema: Record<string, unknown>
  effort: 'low' | 'medium'
  text: string
  /** The plate photo, sent before the text. */
  image?: { data: string; mediaType: MediaType }
}

/** The analysis a request body asks for (see the top of the file), or why it can't be done. */
function analysisFor(body: Record<string, unknown>): Analysis | string {
  const { image, mediaType, hint, text, mode } = body
  if (mode === 'macros') {
    const list = typeof text === 'string' ? text.trim().slice(0, 2000) : ''
    if (!list) return 'Envie a lista do que foi comido, um item por linha.'
    return { system: MACROS_SYSTEM, schema: MACROS_SCHEMA, effort: 'medium', text: `O que a pessoa comeu:\n${list}` }
  }

  const described = typeof text === 'string' ? text.trim().slice(0, 1000) : ''
  // A description needs less work than a photo, so it costs less.
  if (described) return { system: SYSTEM, schema: SCHEMA, effort: 'low', text: `A refeição, nas palavras da pessoa: ${described}` }
  if (typeof image !== 'string' || !MEDIA_TYPES.includes(mediaType as MediaType)) {
    return 'Envie a foto em base64 (JPEG, PNG ou WebP) ou a descrição da refeição.'
  }
  const ask =
    typeof hint === 'string' && hint.trim()
      ? `Analise esta refeição. O que a pessoa disse sobre ela: ${hint.trim().slice(0, 300)}`
      : 'Analise esta refeição.'
  return { system: SYSTEM, schema: SCHEMA, effort: 'medium', text: ask, image: { data: image, mediaType: mediaType as MediaType } }
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
  if (!(await isSignedIn(req))) return json({ error: 'Entre na sua conta para usar a análise da refeição.' }, 401)
  if (!Deno.env.get('ANTHROPIC_API_KEY')) {
    return json({ error: 'Falta a chave ANTHROPIC_API_KEY nos segredos das funções do Supabase.' }, 500)
  }
  anthropic ??= new Anthropic() // reads ANTHROPIC_API_KEY

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const analysis = analysisFor(body ?? {})
  if (typeof analysis === 'string') return json({ error: analysis }, 400)

  try {
    const response = await anthropic.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // A declined request is retried server-side on Anthropic's recommended model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: analysis.effort, format: { type: 'json_schema', schema: analysis.schema } },
      system: analysis.system,
      messages: [
        {
          role: 'user',
          content: analysis.image
            ? [
                { type: 'image', source: { type: 'base64', media_type: analysis.image.mediaType, data: analysis.image.data } },
                { type: 'text', text: analysis.text },
              ]
            : [{ type: 'text', text: analysis.text }],
        },
      ],
    })

    if (response.stop_reason === 'refusal') return json({ error: 'A análise desta refeição foi recusada.' }, 422)
    if (response.stop_reason === 'max_tokens') return json({ error: 'A análise ficou incompleta. Tente de novo.' }, 502)
    const output = response.content.find((block) => block.type === 'text')
    if (!output || output.type !== 'text') return json({ error: 'Resposta vazia da análise.' }, 502)
    return json(JSON.parse(output.text))
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return json({ error: 'Muitas análises seguidas. Tente em instantes.' }, 429)
    if (error instanceof Anthropic.AuthenticationError) {
      return json({ error: 'A chave da Anthropic no Supabase não é válida.' }, 500)
    }
    if (error instanceof Anthropic.APIError) return json({ error: `Erro da API (${error.status}).` }, 502)
    return json({ error: 'Não foi possível analisar a refeição.' }, 500)
  }
})
