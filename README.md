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

## Ligar a sincronização (Supabase)

Sem isso o app funciona, mas os dados ficam só no aparelho em que foram registrados.

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

## Publicar no GitHub Pages (para usar no celular)

1. No GitHub, em **Settings → Pages**, escolha **Source: GitHub Actions**.
2. Em **Settings → Secrets and variables → Actions → Variables**, crie `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com os mesmos valores do `.env.local`.
3. A cada push na `main`, o workflow [`pages.yml`](.github/workflows/pages.yml) roda os testes e publica em https://nonegustavo.github.io/fitness/.
4. No celular, abra esse endereço no Chrome e toque em **Adicionar à tela inicial**. Segurando o ícone, aparecem atalhos para **Água** e **Registrar peso**.

## Como funciona

- **Local-first.** Tudo é gravado primeiro no IndexedDB do aparelho (com Dexie), então o app abre e registra sem internet.
- **Sincronização.** O app envia as alterações pendentes e baixa o que mudou nos outros aparelhos: ao abrir, ao voltar a internet, depois de cada registro e a cada minuto. Cada registro guarda a hora da última alteração; em conflito, vale a mais recente.
- **Servidor.** Uma única tabela genérica (`records`) com RLS guarda todos os registros; o formato dos dados é definido pelo app, então novas telas não precisam de mudanças no banco.

```
src/
  db/          banco local (Dexie), tipos e backup
  sync/        motor de sincronização e cliente do Supabase
  features/    telas: hoje, corpo, água, hábitos, ajustes
  components/  componentes de interface e gráficos (ECharts)
supabase/      SQL do banco e os testes dele
```
