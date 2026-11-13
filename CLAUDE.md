# Fitness: guia para quem mexe no código

App pessoal de um usuário só, em português do Brasil, usado todo dia no celular Android e no computador. O [README.md](README.md) explica a instalação e as integrações, e o [PLANO.md](PLANO.md) lista o que o app faz. Aqui ficam as regras que não aparecem lendo um arquivo só.

## Comandos

- `npm run dev`: servidor de desenvolvimento em http://localhost:5173 (banco local vazio, sem login; não entrar com a conta ali).
- `npm run typecheck` (3 s), `npm run lint` (regras dos hooks, 1 s) e `npm test` (vitest, ~30 s): rodar os três antes de qualquer commit.
- `npm run e2e` (~1,5 min): abre todas as telas com dados de exemplo, no tamanho do celular e do computador, e falha em erro de tela ou em página mais larga que a tela. `npm run e2e:dev` faz o mesmo no servidor de desenvolvimento. Na primeira vez: `npx playwright install chromium`.
- `npm run build:android`: gera a versão do app Android e copia para `android/` (o APK sai pelo Gradle, veja "Android").

## Publicar

- Cada push na `main` publica o site (GitHub Pages) **e** a versão que o app Android baixa sozinho, depois de o CI passar o lint, os testes e o teste das telas. Nada vai para a `main`, para o Supabase (SQL, funções) ou para o celular sem o dono pedir.
- Mensagens de commit em português: uma frase dizendo o que mudou para quem usa.
- Funcionalidade pronta ganha uma linha no PLANO.md; o README muda quando muda a instalação ou uma integração.
- Sessões na nuvem fazem push direto na `main`: `git fetch` antes de começar.

## Dados

- **Local-first.** Tudo é gravado no IndexedDB (Dexie, `src/db`) e sincronizado depois. Gravar sempre por `save`, `patch`, `mutate`, `remove` e `restore` de `src/db/repo.ts`: eles marcam o registro para sincronizar. Apagar é lógico (`deleted: 1`); as leituras passam por `alive()`.
- **Ajustes** são uma linha só. Mudar com `updateSettings((guardado) => ({ … }))` (`src/db/settings.ts`), que parte do que está gravado; um objeto montado no render sobrescreve a mudança anterior. A função roda depois de ler o banco: o valor de um campo (`event.target.value`) é lido antes de chamá-la, não dentro dela.
- **Tabela sincronizada nova:** entra em `SYNCED_TABLES`, ganha uma versão nova do Dexie em `src/db/schema.ts`, e o upgrade apaga o cursor de pull (`PULL_CURSOR`). Mudança só de índice não mexe no cursor.
- **Só acrescentar.** O esquema local e o formato dos registros só ganham coisas: o app do celular pode voltar para uma versão anterior (que abre o banco já atualizado pela mais nova), e os aparelhos ficam em versões diferentes por um tempo.
- **Em conflito vale a alteração mais recente do registro inteiro.** Dois aparelhos escrevem em `dailyHealth` (o Garmin de qualquer um, as fases do sono só do celular): quem importa espera a primeira sincronização terminar.
- **Leituras compartilhadas.** O que várias telas leem ao mesmo tempo (`useActivities`, `useSessions`, `useWeights`, `useTemplates`, `useExerciseMap`, `useSettings`) passa por `useShared` (`src/db/shared.ts`): uma consulta só, e o mesmo objeto para todas. Nunca alterar no lugar (`sort`, `push`…); copiar antes. Em desenvolvimento o resultado vem congelado, e alterar dispara erro na hora.
- Os melhores trechos das corridas (recordes, previsões) vêm de um resumo guardado no aparelho (`src/features/running/efforts.ts`), não das amostras de cada corrida.

## Telas

- Textos em português, curtos e diretos, como os que já existem. Números por `src/lib/format.ts` (vírgula decimal), datas por `src/lib/dates.ts`. A semana começa no domingo.
- Reaproveitar `src/components` (`ui.tsx`, `Modal.tsx`, `Toast.tsx`, `SwipeToDelete.tsx`, `PeriodControl.tsx`, os pagers) antes de criar outro.
- **Apagar:** `useRemoveWithUndo()` (aviso com "Desfazer"); o que tem histórico pede confirmação com `Confirm`. O botão diz "Apagar".
- **Celular primeiro (375 px).** Um elemento `sr-only` ou absoluto dentro de uma rolagem lateral precisa de um ancestral `relative` dentro dela, ou alarga a página e a barra de baixo sai da tela. O teste das telas pega isso.
- **Computador:** telas de análise usam `<Page wide>` com `<Columns><Stack>…</Stack><Stack>…</Stack></Columns>`: a pilha da esquerda tem os cartões que vêm primeiro no celular. Dentro de um cartão, layout que depende da largura usa container query (`@container`, `@sm:`), não `sm:`.
- Tela nova entra em `src/App.tsx` (carregada sob demanda), nos menus de `src/components/sections.ts` e em `e2e/routes.ts`.
- Animações respeitam `prefers-reduced-motion`.

## Servidor (Supabase)

- Chaves (Anthropic, Garmin, SisRUN) ficam só nos segredos das funções. O repositório e o site são públicos: nunca no cliente, nunca em arquivo.
- As funções (`supabase/functions`) rodam com `verify_jwt = false` e conferem o usuário elas mesmas; o cliente chama por `invokeFunction` (`src/sync/functions.ts`), que tem tempo limite e traz a mensagem da função.
- SQL novo é um arquivo em `supabase/migrations`, que pode rodar de novo sem estragar, com teste em `supabase/records.test.ts` (pglite) e o passo no README. Aplicar no projeto e publicar função são feitos à mão, com o OK do dono.

## Android

- O app é o mesmo código web dentro do Capacitor (`android/`), com plugins próprios em `android/app/src/main/java/io/github/nonegustavo/fitness/`.
- **O que chega sozinho e o que precisa de cabo.** A parte web chega ao celular pela publicação do site. Mudança em Kotlin/Java, no manifesto, no widget ou numa dependência `@capacitor/*` só chega com um APK novo, instalado pelo cabo.
- **`native-level.json`.** Um teste falha quando os fontes nativos mudam sem esse arquivo ser atualizado. Se o código web passou a depender do nativo novo, subir `level` (o celular para de se atualizar sozinho até o APK ser instalado). Se não depende, ou confere antes se o recurso existe, só atualizar o hash: `node scripts/native-hash.mjs --write`.
- Build: `npm run build:android`, depois `./gradlew assembleDebug` em `android/` com o Java do Android Studio (`JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"`).
- Antes de `adb install`, ver se o app está em uso no celular: a instalação fecha o app.

## Testes

- Lógica pura fica em arquivos `.ts` com teste ao lado (`*.test.ts`, ambiente node, sem DOM; `fake-indexeddb/auto` quando precisa do Dexie).
- O que só aparece na tela é conferido pelo teste das telas (`e2e/`, arquivos `*.e2e.ts`) e à mão no navegador, nos dois tamanhos.
