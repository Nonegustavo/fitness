# Plano do app

App pessoal que junta treinos de academia, atividades do Garmin, corpo, sono, hábitos, alimentação e água. Uso diário no celular (Android) e no computador para montar treinos e analisar dados.

## Decisões

- **Um código só, web instalável (PWA).** React + TypeScript + Vite + Tailwind. Roda no navegador do computador e instala no Android pela tela inicial.
- **Local-first.** Cada aparelho guarda os dados no IndexedDB (Dexie) e funciona sem internet (na academia, por exemplo). Com conexão, sincroniza com o Supabase. Em conflito, vale a alteração mais recente de cada registro.
- **Supabase** (plano gratuito) como backend: banco Postgres, login, arquivos (.FIT, fotos), funções agendadas (Garmin) e a chamada da IA da foto, para a chave da IA nunca ficar dentro do app.
- **App Android com Capacitor na Fase 4**, empacotando o mesmo código, para ler a balança pelo Health Connect.
- **Gráficos com ECharts**, que aguenta as séries longas dos arquivos .FIT.
- **Hospedagem no GitHub Pages**, publicada pelo GitHub Actions a cada push na `main`.

## De onde vem cada dado

| Dado | Origem | Como entra |
|---|---|---|
| Peso, % de gordura e outros dados da balança | Mi Body Composition Scale 2 → Zepp/Zepp Life → Health Connect | Fase 1: manual. Fase 4: o app Android lê do Health Connect |
| Medidas, água, hábitos | Você | Manual (Fase 1) |
| Treinos de academia | Fichas do app | Fase 2 |
| Atividades (corrida, bike etc.) | Relógio Garmin | Fase 4: import de .FIT; depois automático pela API pessoal da Garmin |
| FC, calorias e duração da musculação | Relógio Garmin | Fase 4: junta a atividade do relógio com a sessão da ficha pelo horário |
| Sono, HRV, FC de repouso | Garmin | Fase 4: API pessoal oficial da Garmin (lançada em 21/10/2026). Plano B: Health Connect |
| Alimentação | Tabelas TACO/TBCA, Open Food Facts (código de barras), foto com IA | Fase 3 |
| Strava | — | Fora: exige assinatura, e as atividades já estão no Garmin |

## Fases

### Fase 1 — Base e registros rápidos
- [x] Estrutura do app (PWA, navegação, tema claro/escuro)
- [x] Banco local e sincronização com o Supabase (opcional; liga ao configurar)
- [x] Tela Hoje: água, hábitos do dia e último peso
- [x] Água: meta diária, recipientes favoritos com registro em 1 toque, histórico
- [x] Corpo: peso, % de gordura e dados extras da balança, com tendência; medidas corporais
- [x] Hábitos: sim/não ou quantidade, check diário, sequência e histórico
- [x] Backup em arquivo (exportar e importar)
- [ ] Criar o projeto no Supabase e publicar no GitHub Pages (passo a passo no README)

### Fase 2 — Treinos de academia
- [x] Biblioteca de exercícios (grupo muscular, equipamento), com ~60 exercícios prontos e os seus próprios
- [x] Montar fichas: séries (com aquecimento), faixa de repetições, carga, descanso, observações
- [x] Executar no celular: marcar séries, timer de descanso com som e vibração, carga da última vez, tela sempre ligada
- [x] Sugestão de carga por progressão dupla (bateu o topo da faixa em todas as séries → sobe um degrau)
- [x] Guardar o horário de cada série, para cruzar com a FC do relógio na Fase 4
- [x] Histórico, séries por grupo muscular na semana, 1RM estimado com gráfico, recordes
- [x] Rotação de fichas (A → B → C) e o próximo treino na tela Hoje

Limitação conhecida: com o celular bloqueado ou o app em segundo plano, o aviso do fim do descanso pode não tocar (limite de PWA). O app mantém a tela ligada durante o treino; o app Android da Fase 4 resolve com notificação nativa.

### Fase 3 — Alimentação
- [x] Tabela TACO embutida (593 alimentos, funciona sem internet), busca sem acentos, alimentos próprios
- [x] Código de barras: câmera no Chrome do Android ou digitando; dados do Open Food Facts, revisados antes de salvar
- [x] Refeições do dia, metas de kcal e macros, com metas próprias para dias de treino (detectados pelos treinos)
- [x] Favoritos, recentes com a última quantidade, repetir refeição de ontem, refeições salvas
- [x] Histórico de 14 dias contra a meta e médias de macros
- [x] Foto do prato: a IA (Claude) identifica os alimentos e estima os gramas; você ajusta e confirma. Pronto no código; liga quando o Supabase estiver configurado e a chave da Anthropic estiver nos segredos das funções (passo a passo no README).
- [ ] Receitas (alimento montado a partir de ingredientes)

Itens que a TACO não analisou (como o leite fluido) ficam de fora da tabela; dá para cadastrá-los pelo código de barras.

### Fase 4 — Atividades e integrações
- Importar .FIT (SDK oficial da Garmin) e analisar: FC, pace, potência, cadência, altimetria, voltas, zonas, mapa
- Sincronização automática pela API pessoal da Garmin: atividades com .FIT, sono, HRV, FC de repouso
- Juntar a musculação gravada no relógio com a sessão da ficha: duração, FC média e máxima, calorias, FC por série
- App Android (Capacitor) lendo peso e % de gordura do Health Connect

### Fase 5 — Correlações
- Painel cruzando hábitos × sono × peso × treino × alimentação

## Observações

- A API pessoal da Garmin é nova. Na Fase 4, confirmar quais métricas ela entrega (por exemplo, as fases do sono). As bibliotecas não oficiais (garminconnect/garth) quebraram em 2026 e não devem ser usadas.
- Desde 30/09/2026, no Brasil, apps Android instalados fora da Play Store precisam de desenvolvedor verificado. Para uso pessoal existe conta gratuita; resolver isso na Fase 4.
