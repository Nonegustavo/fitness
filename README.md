# Fitness

App pessoal que junta treinos, corpo, hábitos, alimentação e água num lugar só, no celular e no computador. O plano completo, com as fases e de onde vem cada dado, está em [PLANO.md](PLANO.md).

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

Sem isso o app funciona, mas os dados ficam só no aparelho em que foram registrados, e a foto do prato fica desligada.

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

### Foto do prato

A foto é analisada pelo Claude numa função do Supabase ([`supabase/functions/analyze-meal`](supabase/functions/analyze-meal/index.ts)). A chave da Anthropic fica só no servidor, e a função só atende quem está logado no seu projeto.

1. Em [platform.claude.com](https://platform.claude.com/settings/keys), crie uma chave em **API keys → Create key** e escolha um workspace para ela (por exemplo, **Default**): a API recusa chaves sem workspace. Coloque créditos em **Billing**; cada foto custa uns 5 centavos de dólar.
2. No Supabase, em **Edge Functions → Secrets**, crie o segredo `ANTHROPIC_API_KEY` com essa chave. Não coloque a chave no código nem no `.env.local`.
3. Publique a função. O id do projeto é o `xxxx` de `https://xxxx.supabase.co`:

   ```bash
   npx supabase login
   npx supabase functions deploy analyze-meal --remote=xxxx --no-verify-jwt --use-api
   ```

   O `--use-api` empacota a função nos servidores do Supabase, sem precisar do Docker. O `--no-verify-jwt` deixa a checagem de login com a própria função, que confere o usuário no Supabase Auth. Com o MCP do Supabase conectado ao Claude, dá para publicar pela ferramenta `deploy_edge_function`, com `verify_jwt` desligado.

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

## Como funciona

- **Local-first.** Tudo é gravado primeiro no IndexedDB do aparelho (com Dexie), então o app abre e registra sem internet.
- **Sincronização.** O app envia as alterações pendentes e baixa o que mudou nos outros aparelhos: ao abrir, ao voltar a internet, depois de cada registro e a cada minuto. Cada registro guarda a hora da última alteração; em conflito, vale a mais recente.
- **Servidor.** Uma única tabela genérica (`records`) com RLS guarda todos os registros; o formato dos dados é definido pelo app, então novas telas não precisam de mudanças no banco.

```
src/
  db/          banco local (Dexie), tipos e backup
  sync/        motor de sincronização e cliente do Supabase
  features/    telas: hoje, treinos, atividades e sono do Garmin, alimentação, corpo, água, hábitos, ajustes
  components/  componentes de interface e gráficos (ECharts)
supabase/      SQL do banco (e os testes dele) e as funções da foto do prato e do Garmin
android/       app Android (Capacitor), com a ponte para o Health Connect
```
