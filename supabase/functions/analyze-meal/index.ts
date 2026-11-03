// Supabase Edge Function: identifies the foods in a plate photo and estimates their weight
// with Claude. The Anthropic key lives in the project's secrets (ANTHROPIC_API_KEY), never in
// the app, and only the logged-in owner of the project can call it.
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
type MediaType = (typeof MEDIA_TYPES)[number]

const SYSTEM = `Você analisa fotos de refeições para um app pessoal de nutrição no Brasil.
Identifique cada alimento visível e estime quanto dele está no prato, em gramas.

- Use o prato (um prato raso comum tem 24 a 27 cm), talheres e outros objetos como referência de tamanho.
- Separe os componentes em itens diferentes (arroz, feijão, carne, salada…). Molhos, óleo ou temperos visíveis são itens próprios.
- "name": como a pessoa chamaria o alimento ("Arroz branco", "Bife acebolado").
- "search": de 2 a 5 palavras, sem acentos, para achar o alimento na tabela TACO, no estilo dela: alimento, tipo e preparo ("arroz tipo 1 cozido", "feijao carioca cozido", "carne bovina contra file grelhado", "alface crespa crua").
- "grams": o peso do alimento pronto, como está no prato.
- "confidence": "alta" quando o alimento e a porção estão claros; "media" quando há alguma dúvida; "baixa" quando está coberto, misturado ou incerto.
- "notes": uma frase curta sobre o que a foto não mostra e pode mudar a conta (óleo do preparo, itens escondidos). Vazio se não houver.

Se a imagem não mostrar comida, devolva "items" vazio e diga isso em "notes".`

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
  if (!(await isSignedIn(req))) return json({ error: 'Entre na sua conta para usar a foto do prato.' }, 401)
  if (!Deno.env.get('ANTHROPIC_API_KEY')) {
    return json({ error: 'Falta a chave ANTHROPIC_API_KEY nos segredos das funções do Supabase.' }, 500)
  }
  anthropic ??= new Anthropic() // reads ANTHROPIC_API_KEY

  const { image, mediaType, hint } = (await req.json().catch(() => ({}))) as {
    image?: unknown
    mediaType?: unknown
    hint?: unknown
  }
  if (typeof image !== 'string' || !MEDIA_TYPES.includes(mediaType as MediaType)) {
    return json({ error: 'Envie a foto em base64 (JPEG, PNG ou WebP).' }, 400)
  }

  const text =
    typeof hint === 'string' && hint.trim()
      ? `Analise esta refeição. O que a pessoa disse sobre ela: ${hint.trim().slice(0, 300)}`
      : 'Analise esta refeição.'

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
            { type: 'text', text },
          ],
        },
      ],
    })

    if (response.stop_reason === 'refusal') return json({ error: 'A análise desta foto foi recusada.' }, 422)
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
    return json({ error: 'Não foi possível analisar a foto.' }, 500)
  }
})
