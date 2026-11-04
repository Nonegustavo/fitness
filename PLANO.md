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
| Sono, HRV, FC de repouso | Garmin | Fase 4: API pessoal oficial da Garmin (lançada em 21/10/2026). As fases do sono com horário vêm do Health Connect |
| Treinos agendados | SisRUN → Garmin Connect | Fase 4: calendário publicado do Garmin Connect (iCal) |
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
- [x] Criar o projeto no Supabase e publicar no GitHub Pages (passo a passo no README)

### Fase 2 — Treinos de academia
- [x] Biblioteca de exercícios (grupo muscular, equipamento), com ~60 exercícios prontos e os seus próprios
- [x] Montar fichas: séries (com aquecimento), faixa de repetições, carga, descanso, observações
- [x] Executar no celular: marcar séries, timer de descanso com som e vibração, carga da última vez, tela sempre ligada
- [x] Sugestão de carga por progressão dupla (bateu o topo da faixa em todas as séries → sobe um degrau)
- [x] Guardar o horário de cada série, para cruzar com a FC do relógio na Fase 4
- [x] Histórico, séries por grupo muscular na semana, 1RM estimado com gráfico, recordes
- [x] Rotação de fichas (A → B → C) e o próximo treino na tela Hoje

No app instalado pelo Chrome, com o celular bloqueado o aviso do fim do descanso pode não tocar (limite de PWA); por isso ele mantém a tela ligada durante o treino. No app Android, o fim do descanso chega como notificação também com a tela desligada.

### Fase 3 — Alimentação
- [x] Tabela TACO embutida (593 alimentos, funciona sem internet), busca sem acentos, alimentos próprios
- [x] Código de barras: câmera no Chrome do Android ou digitando; dados do Open Food Facts, revisados antes de salvar
- [x] Refeições do dia, metas de kcal e macros, com metas próprias para dias de treino (detectados pelos treinos)
- [x] Favoritos, recentes com a última quantidade, repetir refeição de ontem, refeições salvas
- [x] Histórico de 14 dias contra a meta e médias de macros
- [x] Foto do prato: a IA (Claude) identifica os alimentos e estima os gramas; você ajusta e confirma. Pronto no código; liga quando o Supabase estiver configurado e a chave da Anthropic estiver nos segredos das funções (passo a passo no README).
- [x] Receitas: ingredientes com gramas, peso pronto (quando muda no preparo) e porções; entram na busca como qualquer alimento
- [x] Alimentos cadastrados pela porção da embalagem (“2 fatias”, 50 g) e registrados contando porções ou em gramas
- [x] Macros sempre na mesma ordem e cor: carboidratos (azul), proteína (roxo), gorduras (amarelo); anéis do dia contra a meta
- [x] Equilíbrio de alimentos e refeições: proporção das calorias de cada macro ao lado da proporção da meta, e quanto do dia cada um representa
- [x] Gasto real estimado pelas últimas 4 semanas (consumo médio + variação da tendência do peso, 7700 kcal/kg) e meta de calorias sugerida pelo ritmo da meta de peso
- [x] Meta de peso com ritmo planejado, ritmo atual, previsão de chegada e linha da meta no gráfico
- [x] Calorias do Garmin (total e ativas) na tela de alimentação
- [x] Fibras, açúcares, gorduras saturadas e sódio: no cadastro, no Open Food Facts e no total do dia contra as referências (OMS)
- [x] Recentes pela refeição: o que costuma ser comido naquela refeição aparece primeiro
- [x] Atalhos de 1 toque (suplementos, o café de todo dia) com a quantidade fixa, na tela de alimentação
- [x] Copiar um item, uma refeição ou o dia inteiro para hoje; duplicar um item
- [x] Editar as quantidades de todos os itens de uma refeição de uma vez
- [x] "+" em cada alimento da lista (recentes, favoritos, busca): adiciona a quantidade de sempre sem abrir o alimento
- [x] "Para fechar o dia": quando faltam até 900 kcal, combinações de 1 ou 2 alimentos seus que mais se aproximam do que falta
- [x] Refeições vazias numa linha só, com "Repetir ontem"
- [x] Hora da refeição: escolhida ao adicionar, editável no item e na refeição inteira; a hora da última refeição entra nas correlações e na análise
- [x] Ler a tabela nutricional por foto: o Claude lê o rótulo (função `read-label`) e preenche o cadastro por porção, avisando quando algo ficou ilegível ou as colunas não batem
- [x] Botão "+" em qualquer tela (no computador, "Registrar" na barra lateral): alimento, pesagem, próximo treino, diário e água em 1 toque
- [x] Lembretes do dia no app Android (Ajustes): pesagem, almoço e jantar nos horários escolhidos e água no ritmo às 11h, 15h e 19h, só quando falta registrar
- [x] Telas e cartões mostram o formato do conteúdo enquanto carregam, em vez de ficar em branco ou mostrar zeros
- [x] Na academia: carga das próximas séries com ±1 degrau (2,5 kg na barra, 2 kg no halter, 5 kg na máquina), calculadora de anilhas com a barra e as anilhas da academia, trocar um exercício por outro do mesmo grupo e bi-sets (na ficha e durante o treino, com o descanso depois do par)
- [x] Treino: mapa do corpo (frente e costas) com as séries da semana por músculo contra a faixa de 10–20
- [x] Treino: exercícios sem evoluir (3 treinos sem bater o melhor 1RM estimado) e aviso de deload
- [x] Treino: esforço (RPE 1–10) e dor ou desconforto por região em cada sessão; o esforço entra nas correlações
- [x] Resumo da semana passada na tela Hoje, contra a semana anterior: calorias, proteína, dias na meta, treinos, sono, passos, peso, água e hábitos
- [x] Fotos de progresso (frente, lado, costas) na tela Corpo, com comparação de duas datas lado a lado e o peso da tendência
- [x] App Android: atalhos ao segurar o ícone e widget na tela inicial (alimento, água, treino, peso) — falta conferir no celular

Itens que a TACO não analisou (como o leite fluido) ficam de fora da tabela; dá para cadastrá-los pelo código de barras.

### Fase 4 — Atividades e integrações
- [x] Importar .FIT (SDK oficial da Garmin): vários de uma vez, também de dentro do .zip do "Exportar original" do Garmin Connect
- [x] Analisar: tempo, distância, ritmo ou velocidade, FC, calorias, subida, cadência, potência e efeito de treino; gráficos por tempo ou distância; zonas de FC; voltas; mapa do percurso
- [x] Juntar a musculação gravada no relógio com o treino da ficha pelo horário: tempo, FC média e máxima, calorias, gráfico de FC com o fim de cada série e FC máxima de cada série
- [x] Sincronização pela API pessoal da Garmin, por uma função do Supabase que guarda a chave: atividades com o .FIT, o treino planejado que o relógio seguiu, sono, HRV, FC de repouso, estresse e Body Battery
- [x] Tela Sono e recuperação, e a última noite na tela Hoje
- [x] Próximos treinos pelo calendário publicado do Garmin Connect, para onde o SisRUN envia os treinos
- [x] Conferido com dados reais: sono com nota e fases, HRV, recuperação, corridas com o treino do SisRUN e os próximos treinos do calendário
- [x] App Android (Capacitor) lendo do Health Connect a balança completa (peso, água, gordura, massa magra, massa óssea, metabolismo basal) e as fases do sono com horário, que aparecem na tela Sono
- [x] Instalado no celular (Xiaomi, Android 16, pelo cabo com "Instalar via USB" ligado) e conferido com os dados reais: pesagens do app Zepp e noites do Garmin com as fases

Cada atividade guarda o resumo do relógio e as amostras reduzidas a até ~1800 pontos por gráfico. É o que sincroniza entre os aparelhos; o arquivo .FIT original não fica guardado no app.

O SisRUN não tem API pública. Os treinos dele chegam pelo Garmin Connect: os já feitos trazem o treino planejado, e os próximos vêm do calendário publicado.

### Fase 5 — Correlações
- [x] Tela Correlações: cada dia junta sono, recuperação, passos e estresse, peso, treinos, alimentação, água e hábitos
- [x] Destaques: as relações mais claras, numa frase com as duas médias ("Depois de dias com «Álcool»: HRV da noite de 52 ms, contra 61 ms nos outros dias"), no máximo duas por causa
- [x] Explorar qualquer par: um ponto por dia, com a média de cada grupo (fez / não fez) ou a linha de tendência, e as duas medidas ao longo do tempo
- [x] Filtro contra o acaso: teste de Welch para fez / não fez, Spearman para quantidades e correção de Benjamini–Hochberg para os muitos pares testados juntos
- [x] Período: 90 dias, 6 meses, 1 ano ou tudo

O que acontece num dia é comparado com a noite seguinte (o Garmin data o sono pela manhã em que termina), e a hora de dormir com a própria noite. Hábitos sem registro contam como "não fiz" desde o dia em que foram criados; alimentação e água só contam nos dias com registro. Os primeiros destaques precisam de umas 3 semanas de hábitos marcados.

### Depois das fases — uso do dia a dia
- [x] Diário: como foi o dia em texto livre, com humor e energia de 1 a 5, na tela Hoje e numa tela própria com busca; humor e energia entram nas correlações
- [x] Análise do dia: o Claude lê duas semanas de dados e o diário, compara com o mês anterior, usa as correlações e os treinos planejados, e diz o que melhorar em cada área (1 vez por dia, ao abrir; dá para desligar)
- [x] "Sobre mim" nos Ajustes (rotina, histórico, limitações, objetivos), lido pela análise junto com a meta de peso e o esforço dos treinos
- [x] Copiar o resumo dos dados (com ou sem as instruções) para colar numa conversa ou Projeto do Claude, sem usar a chave da API
- [x] Tela Hoje personalizável: escolher os cartões e arrastar para mudar a ordem; vale para todos os aparelhos
- [x] Arrastar e soltar (mouse, dedo ou teclado) para ordenar exercícios da ficha, fichas (a ordem é a rotação), hábitos e recipientes de água
- [x] Deslizar para a esquerda apaga registros de água, alimentos, pesagens, medidas e refeições salvas, com "Desfazer"
- [x] Lembretes dos hábitos (horário e dias da semana) e o fim do descanso como notificações no app Android
- [x] Alimentação: foto do prato guardada com a refeição, nome e valores de cada registro editáveis, sua versão de um alimento da TACO, e "descrever o que comi" em texto para a IA separar os alimentos
- [x] Cores por seção, ícones em pastilhas coloridas, animações leves e comemoração ao bater a meta de água, completar os hábitos e terminar o treino
- [x] Ícone próprio no app Android (também na tela de abertura e nas notificações)
- [x] Correção: na montagem de fichas no computador, a página ficava sem rolar depois de criar um exercício no seletor
- [x] Fichas arquivadas: saem da rotação e da lista principal, mas continuam guardadas para voltar quando quiser
- [x] Alimentos medidos em porções: os que vieram sem peso (Health Connect) são registrados em porções, não em gramas; ficam fora da foto do prato e das receitas, que trabalham com gramas

## Observações

- A API pessoal da Garmin é nova e só serve para uso próprio. Ela não tem o calendário nem as fases do sono minuto a minuto, e não publica limites de uso: o app busca só o que é novo, no máximo a cada 3 horas. As bibliotecas não oficiais (garminconnect/garth) quebraram em 2026 e não devem ser usadas.
- Desde 30/09/2026, no Brasil, apps Android instalados fora da Play Store precisam de desenvolvedor verificado. Para uso pessoal existe conta gratuita. Pelo cabo (adb), a instalação funcionou sem isso.
