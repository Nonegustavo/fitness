# Fitness

App pessoal que junta treinos, corpo, sono, hábitos, alimentação e água num lugar só, no celular e no computador, e cruza esses dados para mostrar o que anda junto. O plano completo, com as fases e de onde vem cada dado, está em [PLANO.md](PLANO.md).

## Rodar no computador

Precisa do Node 24 ou mais novo.

```bash
npm install
npm run dev
```

O app abre em http://localhost:5173. Para testar no celular na mesma rede Wi-Fi, rode `npm run dev -- --host` e abra no celular o endereço "Network" que aparece no terminal.

Outros comandos:

- `npm test`: testes da sincronização, dos cálculos e do SQL do Supabase
- `npm run build`: confere os tipos e gera a versão de produção em `dist/`
- `npm run build:android`: gera a versão do app Android e copia para `android/` (veja [App Android](#app-android-health-connect))

## Ligar a sincronização (Supabase)

Sem isso o app funciona, mas os dados ficam só no aparelho em que foram registrados, e a foto do prato e a análise do dia ficam desligadas.

1. Crie um projeto gratuito em [supabase.com](https://supabase.com).
2. No projeto, abra **SQL Editor**, cole o conteúdo de [`supabase/migrations/20261102000000_records.sql`](supabase/migrations/20261102000000_records.sql) e rode.
3. Em **Authentication → Users → Add user → Create new user**, crie seu usuário com e-mail e senha e marque **Auto Confirm User**.
4. Em **Authentication → Sign In / Providers**, desligue **Allow new users to sign up**, para ninguém mais criar conta no seu projeto.
5. Pelo botão **Connect** no topo do painel, copie a URL do projeto e a **publishable key**.
6. Crie o arquivo `.env.local` na raiz do projeto (modelo em [`.env.example`](.env.example)):

   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

7. Rode `npm run dev` de novo, abra **Ajustes** e entre com o usuário criado.

A publishable key pode ficar dentro do app: quem protege os dados é o login e as regras do banco, em que cada usuário só enxerga os próprios registros.

No plano gratuito, o projeto pausa depois de uma semana sem uso. É só restaurá-lo no painel; enquanto isso, o app segue funcionando no aparelho.

### Foto do prato e "descrever o que comi"

A foto (ou a descrição em texto, como "2 ovos mexidos e 1 pão francês") é analisada pelo Claude numa função do Supabase ([`supabase/functions/analyze-meal`](supabase/functions/analyze-meal/index.ts)). A chave da Anthropic fica só no servidor, e a função só atende quem está logado no seu projeto.

1. Em [platform.claude.com](https://platform.claude.com/settings/keys), crie uma chave em **API keys → Create key** e escolha um workspace para ela (por exemplo, **Default**): a API recusa chaves sem workspace. Coloque créditos em **Billing**; cada foto custa uns 5 centavos de dólar, e cada descrição, uns 2.
2. No Supabase, em **Edge Functions → Secrets**, crie o segredo `ANTHROPIC_API_KEY` com essa chave. Não coloque a chave no código nem no `.env.local`.
3. Publique a função. O id do projeto é o `xxxx` de `https://xxxx.supabase.co`:

   ```bash
   npx supabase login
   npx supabase functions deploy analyze-meal --remote=xxxx --no-verify-jwt --use-api
   ```

   O `--use-api` empacota a função nos servidores do Supabase, sem precisar do Docker. O `--no-verify-jwt` deixa a checagem de login com a própria função, que confere o usuário no Supabase Auth. Com o MCP do Supabase conectado ao Claude, dá para publicar pela ferramenta `deploy_edge_function`, com `verify_jwt` desligado.
4. Para guardar as fotos junto das refeições, rode no **SQL Editor** o conteúdo de [`supabase/migrations/20261103230000_food_photos.sql`](supabase/migrations/20261103230000_food_photos.sql). Ele cria um espaço privado no Storage, com uma pasta por usuário que só o dono lê.

### Ler a tabela nutricional por foto

Ao criar um alimento (ou em **Adicionar alimento → câmera → Tabela nutricional**), uma foto da tabela da embalagem é lida pelo Claude na função [`supabase/functions/read-label`](supabase/functions/read-label/index.ts), que preenche o formulário por porção para você conferir. Usa a mesma `ANTHROPIC_API_KEY`; cada leitura custa uns 5 centavos de dólar, e só é preciso uma vez por produto.

```bash
npx supabase functions deploy read-label --remote=xxxx --no-verify-jwt --use-api
```

### Análise do dia

Uma vez por dia, ao abrir o app, o Claude lê um resumo dos seus dados e do diário e escreve o que vê e o que fazer. O resumo é montado no aparelho ([`src/features/analysis/context.ts`](src/features/analysis/context.ts)) e enviado à função [`supabase/functions/daily-insights`](supabase/functions/daily-insights/index.ts), que usa a mesma `ANTHROPIC_API_KEY`. Cada análise custa uns 15 centavos de dólar; dá para desligar a automática na tela **Análise do dia**.

```bash
npx supabase functions deploy daily-insights --remote=xxxx --no-verify-jwt --use-api
```

### Garmin

O app busca no Garmin Connect as atividades (com o .FIT original), o sono, a HRV, a frequência cardíaca de repouso, o estresse e o Body Battery, pela API pessoal da Garmin. A busca passa por uma função do Supabase ([`supabase/functions/garmin`](supabase/functions/garmin/index.ts)): o Garmin não atende navegadores, e a chave precisa ficar privada.

1. No site do Garmin Connect, em [Personal API Token](https://connect.garmin.com/app/settings/personalApiToken), crie uma chave com validade de até 1 ano. Pelos termos, ela é pessoal e só serve para ferramentas de uso próprio.
2. No Supabase, em **Edge Functions → Secrets**, crie o segredo `GARMIN_API_KEY` com a chave.
3. Opcional: para ver os treinos agendados (do SisRUN, por exemplo), publique o calendário no Garmin Connect e salve o link do mesmo jeito, como `GARMIN_CALENDAR_URL`.
4. Publique a função:

   ```bash
   npx supabase functions deploy garmin --remote=xxxx --no-verify-jwt --use-api
   ```

Depois, em **Ajustes → Garmin**, toque em **Buscar agora**. A primeira busca traz os últimos 30 dias, e **Buscar 3 meses anteriores** completa o histórico aos poucos. Com o app aberto, a busca também roda sozinha a cada 3 horas.

## App Android (Health Connect)

O app Android é o mesmo app web dentro de uma casca nativa ([Capacitor](https://capacitorjs.com)), com um acesso a mais: o Health Connect do celular. De lá vêm, sozinhos, a balança completa (peso, gordura, massa magra, massa óssea, água e metabolismo basal, gravados pelo app Zepp) e as fases do sono com horário (gravadas pelo Garmin Connect). A ponte com o Health Connect está em [`HealthConnectPlugin.kt`](android/app/src/main/java/io/github/nonegustavo/fitness/HealthConnectPlugin.kt).

Para gerar e instalar, com o [Android Studio](https://developer.android.com/studio) instalado:

1. No celular, ligue as **Opções do desenvolvedor** e a **Depuração USB**, e conecte o cabo.
2. No computador, rode `npm run build:android` (gera a versão web e copia para o projeto Android) e depois `npx cap open android`. No Android Studio, escolha o celular e toque em **Run**. Instalar pelo cabo dispensa a verificação de desenvolvedor exigida no Brasil.
3. No app, entre na sua conta em **Ajustes** e toque em **Permitir acesso** no cartão Health Connect. Para trazer mais de 30 dias, permita também o acesso ao histórico.

Os dados do app Android ficam separados dos do app instalado pelo Chrome; a sincronização com o Supabase junta os dois.

O app Android também avisa por notificação: os lembretes dos hábitos (marcados em cada hábito, valem para todos os aparelhos) e o fim do descanso entre séries quando a tela está desligada. Os lembretes são agendados para as próximas duas semanas e somem do dia que já foi marcado; a notificação do hábito tem o botão **Feito**.

## Publicar no GitHub Pages (para usar no celular)

1. No GitHub, em **Settings → Pages**, escolha **Source: GitHub Actions**.
2. Em **Settings → Secrets and variables → Actions → Variables**, crie `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com os mesmos valores do `.env.local`.
3. A cada push na `main`, o workflow [`pages.yml`](.github/workflows/pages.yml) roda os testes e publica em https://nonegustavo.github.io/fitness/.
4. No celular, abra esse endereço no Chrome e toque em **Adicionar à tela inicial**. Segurando o ícone, aparecem atalhos para **Água** e **Registrar peso**.

## Fontes de dados

- Composição dos alimentos: TACO — Tabela Brasileira de Composição de Alimentos, 4ª edição, NEPA/UNICAMP, 2011 (reprodução permitida com citação da fonte). A conversão para o formato do app está em [`scripts/convert-taco.mjs`](scripts/convert-taco.mjs), a partir de [marcelosanto/tabela_taco](https://github.com/marcelosanto/tabela_taco).
- Produtos por código de barras: [Open Food Facts](https://world.openfoodfacts.org), base aberta sob a licença ODbL.
- Atividades: arquivos .FIT lidos com o [FIT SDK](https://developer.garmin.com/fit) da Garmin. No site do Garmin Connect, abra a atividade, clique na engrenagem e escolha **Exportar original**; o app aceita o .zip baixado.
- Mapas: © colaboradores do [OpenStreetMap](https://www.openstreetmap.org/copyright), desenhados com [Leaflet](https://leafletjs.com).
- Clima das corridas e caminhadas: [Open-Meteo](https://open-meteo.com) (gratuito para uso não comercial). O app manda só a posição do início, arredondada para uns 1 km, e a data.
- Fotos e passos dos exercícios: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense), carregados na hora pelo jsDelivr, sem copiar as imagens para o app. As fotos vêm de fontes de licença incerta: servem para uso pessoal, não para redistribuir. Os passos em português foram escritos para o app.

## Como funciona

- **Local-first.** Tudo é gravado primeiro no IndexedDB do aparelho (com Dexie), então o app abre e registra sem internet.
- **Sincronização.** O app envia as alterações pendentes e baixa o que mudou nos outros aparelhos: ao abrir, ao voltar a internet, depois de cada registro e a cada minuto. Cada registro guarda a hora da última alteração; em conflito, vale a mais recente.
- **Servidor.** Uma única tabela genérica (`records`) com RLS guarda todos os registros; o formato dos dados é definido pelo app, então novas telas não precisam de mudanças no banco.
- **Correlações.** Cada dia vira uma linha com tudo o que o app sabe, e o que acontece num dia é comparado com a noite seguinte. Os destaques usam o teste de Welch (fez / não fez) ou a correlação de Spearman (quantidades) e passam pela correção de Benjamini–Hochberg, que limita os falsos destaques a 10%. A conta é feita no aparelho (`src/features/insights`).
- **Análise do dia.** Depois da primeira sincronização do dia (assim a análise feita no outro aparelho já chegou), o app monta um resumo em texto: duas semanas dia a dia com o diário, o último mês contra o anterior, as metas, as correlações e os treinos planejados. A resposta vira um registro sincronizado, e cada aparelho tenta no máximo uma vez por dia sozinho.
- **Fotos.** A foto do prato é reduzida no aparelho, guardada no IndexedDB e enviada ao Storage do Supabase na sincronização seguinte. Os outros aparelhos baixam cada foto quando ela aparece na tela.

```
src/
  db/          banco local (Dexie), tipos e backup
  sync/        motor de sincronização e cliente do Supabase
  features/    telas: hoje, treinos, atividades e sono do Garmin, alimentação (com receitas e fotos), corpo, água,
               hábitos (com lembretes), diário, análise do dia, correlações, ajustes
  components/  componentes de interface, gráficos (ECharts), arrastar e soltar, deslizar para apagar
supabase/      SQL do banco e do Storage (e os testes deles) e as funções da refeição, da análise do dia e do Garmin
android/       app Android (Capacitor), com a ponte para o Health Connect
```
