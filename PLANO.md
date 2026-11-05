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
- [x] Foto do prato: a IA (Claude) identifica os alimentos e estima os gramas; você ajusta e confirma. Pronto no código; liga quando o Supabase estiver configurado e a chave da Anthropic estiver nos segredos das funções (passo a passo no README). Desde 05/11, em duas etapas (veja "Depois das fases")
- [x] Receitas: ingredientes com gramas, peso pronto (quando muda no preparo) e porções; entram na busca como qualquer alimento
- [x] Alimentos cadastrados pela porção da embalagem (“2 fatias”, 50 g) e registrados contando porções ou em gramas
- [x] Macros sempre na mesma ordem e cor: carboidratos (azul), proteína (roxo), gorduras (amarelo); anéis do dia contra a meta
- [x] Equilíbrio de alimentos e refeições: proporção das calorias de cada macro ao lado da proporção da meta, e quanto do dia cada um representa
- [x] Gasto real estimado pelas últimas 4 semanas (consumo médio + variação da tendência do peso, 7700 kcal/kg) e meta de calorias sugerida pelo ritmo da meta de peso
- [x] Meta de peso com ritmo planejado, ritmo atual, previsão de chegada e linha da meta no gráfico
- [x] Calorias do Garmin (total e ativas) na tela de alimentação
- [x] Fibras, açúcares, gorduras saturadas e sódio: no cadastro, no Open Food Facts e no total do dia contra as referências (OMS)
- [x] Recentes pela refeição: o que costuma ser comido naquela refeição aparece primeiro
- [x] Atalhos de 1 toque (suplementos, o café de todo dia) com a quantidade fixa, na tela de alimentação (retirados em 5/11/2026, a pedido)
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
- [x] App Android: atalhos ao segurar o ícone e widget na tela inicial (4x2) com as calorias que faltam, a água do dia e o próximo treino, acima dos botões de alimento, água, treino e peso
- [x] Widget com barras de progresso contra as metas (calorias, carboidratos, proteína, gorduras e água), os ícones de cada área e o próximo treino da agenda (ficha programada, corrida do Garmin ou a próxima da sequência), que continua certo depois da meia-noite

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
- [x] Alimentos medidos em porções: os que vieram sem peso (Health Connect) são registrados em porções; ficam fora das receitas, que trabalham com gramas. Desde 05/11 também dá para registrá-los em gramas: o app pergunta uma vez quanto pesa a porção e o alimento passa a ser medido em gramas
- [x] Programar as fichas nos dias (com horário opcional), sugerindo a próxima da sequência; a ficha programada para hoje é a que o Hoje, o "+" e a tela Treinos oferecem para iniciar
- [x] Calendário (Mais → Calendário; no computador, na barra lateral): o mês com os treinos feitos e programados, a musculação junto com as corridas do Garmin; cada dia mostra os detalhes e permite programar, mudar ou tirar uma ficha
- [x] "Minha semana" no topo do Hoje, acima do "Em foco": a semana atual de domingo a sábado, um ponto por treino (cheio quando feito, contorno quando programado, cinza quando não feito) e um traço nos dias livres; tocar num dia abre os detalhes (dá para esconder em "Personalizar o Hoje")
- [x] A semana começa no domingo em todo o app (calendário, "Minha semana", semana passada, séries da semana e histórico dos hábitos)
- [x] Hoje no estilo do Garmin Connect, em duas áreas: "Em foco", um carrossel de cartões grandes todos da mesma altura (o que passa rola dentro do cartão), e "Visualização rápida", cartões menores também todos do mesmo tamanho. Cada elemento tem as duas versões, a grande e a resumida, e pode ir para uma área, para a outra ou para as duas: Treino, Treino do Garmin, Sono (com as fases da noite), Alimentação, Água (com "+"), Hábitos, Diário, Análise do dia, Semana passada, Volume de corrida, Ritmo médio, Recordes pessoais, Constância, Próxima prova, Peso (com "+"), FC de repouso, HRV, Body Battery, Passos e Calorias gastas
- [x] Corrida: volume por semana nas últimas 12 semanas contra o planejado, ritmo médio das últimas 4 semanas contra as 4 anteriores, recordes pessoais (melhores trechos de 1, 5, 10, 21 e 42 km calculados dos dados do relógio, já que a API pessoal do Garmin não traz os recordes, e a corrida mais longa) e constância (semanas seguidas treinando, recorde de dias seguidos, dias treinados e o mapa das últimas 16 semanas)
- [x] Correção: trocar de tela sempre abre a nova no topo (todas as telas dividiam a mesma rolagem)
- [x] Correção: com muitos cartões no "Em foco", um texto de leitor de tela do Diário escapava do carrossel e alargava a tela (no celular, a barra de menus sumia)
- [x] Telas de Passos (dia a dia e médias) e de Recordes (os 5 melhores tempos de cada distância e as corridas mais longas)
- [x] Área de Corrida (Mais → Corrida; no computador, na barra lateral): esta semana contra o previsto, volume por semana em 12, 26 ou 52 semanas, ritmo médio por semana, constância com o mapa de 26 semanas, recordes, próxima prova e corridas recentes; os cartões de corrida levam para ela
- [x] Área de Calorias gastas: hoje, médias de 7 e 30 dias, o gráfico de 30 dias (em repouso e ativas, com o que foi comido por cima) e o saldo dia a dia
- [x] Horário planejado para os treinos do Garmin (as corridas do SisRUN vêm só com o dia): o relógio no item, no calendário e nos cartões; sincroniza entre os aparelhos e aparece no widget
- [x] "Treinos de hoje" no lugar do cartão de musculação: todos os treinos do dia (musculação e corrida) com as ações, a próxima ficha da sequência e o próximo treino
- [x] "Em foco" mostra um cartão por vez, na mesma largura do "Minha semana"; Hábitos, Água e Diário mais simples; "Semana passada" em blocos, com a diferença para a anterior
- [x] Botão voltar do Android: fecha a janela aberta, volta para a tela anterior onde ela estava e só sai do app da primeira tela
- [x] A análise do dia também lê a musculação programada para a semana
- [x] "Agora" no topo do Hoje: o próximo passo do dia com um botão que faz (o treino que vai começar ou está em andamento, a pesagem da manhã, a refeição da hora, a água quando bem atrás do ritmo, os hábitos que faltam e o diário à noite; sem nada pendente, o próximo treino). Só cobra pesagem e refeições que fazem parte da rotina
- [x] "Em foco": uma fileira com o ícone de cada cartão para ir direto a ele, e a ordem pelo horário do dia (sono e peso de manhã, alimentação no almoço, treino à tarde, hábitos e diário à noite), que dá para desligar
- [x] Avisos no Android antes dos treinos com horário (15 min a 1 h 30 antes, musculação e corridas) e o resumo da semana no domingo às 20h, que abre a tela "Resumo da semana"
- [x] Comemoração de recordes de corrida (tempo melhor numa distância, primeira vez numa distância, corrida mais longa) e de sequências (3, 7, 14… dias seguidos na meta de água, na de proteína e com todos os hábitos); cartão "Sequências" para o Hoje
- [x] Vibração leve no celular ao marcar hábito, registrar água, concluir série, começar treino e programar; deslizar para o lado troca o dia em Alimentação, Hábitos e Diário; puxar o Hoje para baixo sincroniza com o servidor e o Garmin
- [x] Barra de baixo personalizável (Ajustes → Barra de baixo): as 4 seções que aparecem; as outras ficam em "Mais"
- [x] "Como foi?" nas corridas (e em qualquer treino gravado pelo relógio): o comentário para o treinador, o esforço (PSE de 1 a 10) e dor ou desconforto, com "Copiar para mandar ao treinador". Aparece no calendário e em "Treinos de hoje", o "Agora" lembra de comentar a corrida do dia, e a análise do dia lê tudo isso
- [x] Comentário também na musculação ("Como foi o treino?"), que vai para a análise do dia
- [x] Resumo da análise do dia bem mais completo: de quando são os dados de cada fonte; sono com fases, horários, FC e respiração; HRV com a faixa normal e o status do Garmin; cada corrida com ritmo, FC, zonas, voltas, o treino planejado pelo treinador e o comentário; a musculação exercício por exercício, junto com o tempo e a FC do relógio; as refeições dos últimos 7 dias com o que foi comido; uma linha por semana nas últimas 8 semanas; 1RM estimado dos exercícios, séries por grupo muscular, exercícios parados e deload; km por semana contra o previsto, ritmo, recordes e próxima prova; tendência do peso contra a meta, composição e medidas; gasto estimado contra o consumo e proteína por kg; treinos planejados × feitos, hábitos, sequências e as dicas dos últimos dias. As instruções da IA separam corrida e musculação e terminam com "Para os próximos dias". Em Análise, "Ver o que a IA recebe" mostra o texto exato, o tamanho e o custo
- [x] "Próximos treinos" no "Em foco": os treinos de hoje e os próximos, com o dia de cada um ("Amanhã", "Domingo, 8/11")
- [x] Correção: o horário marcado para os treinos do Garmin se perdia na sincronização, porque o calendário publicado gera códigos novos a cada busca; agora vale o nome do treino e o dia
- [x] Foto do prato em duas etapas: a IA lista o que viu, um item por linha com a quantidade, num texto que você corrige; depois calcula os gramas, carboidratos, proteína e gorduras de cada item (as calorias saem dos macros). "Descrever o que comi" vai direto para a segunda etapa. Nada é casado com a TACO: cada item vira um alimento seu ("Análise por IA"), atualizado se o nome se repetir

- [x] Treino ao vivo: 1RM estimado em cada série, verde ou vermelho contra a mesma série do treino anterior (que também mostra o seu); sem carga aparece "PC×10" e compara as repetições; coluna "Anterior" centralizada; um menu ⋯ por exercício com trocar, bi-set, adicionar série ou aquecimento, remover série, reordenar e remover exercício; reordenar com o bi-set junto e "Salvar esta ordem na ficha"; descanso próprio do aquecimento (1:00 por padrão)
- [x] Notificação do treino no Android: a série atual (aquecimento ou "Série 2 de 4", carga e repetições) com −/+ e Concluir, o descanso em contagem regressiva com +15 s e Pular, e um só aviso no fim do descanso; funciona na tela de bloqueio e com o app fechado, e o que for feito ali entra no treino
- [x] Hábitos com cor, ícone e horário (que ordena a lista do dia: os pendentes primeiro) e "Hoje não vou fazer" (segurar o hábito), que não quebra nem soma na sequência
- [x] Dores e desconfortos no diário, escritos à mão com nota de 1 a 10, que seguem para os dias seguintes com a última nota até serem removidos
- [x] Alimentação: o resumo no formato do cartão do Em foco, refeições da mais recente para a primeira, "Salvar como refeição" na janela da refeição, sem o aviso de proporção, sem "Repetir ontem" e sem os atalhos de 1 toque; Adicionar alimento abre em Favoritos sem abrir o teclado
- [x] Foto ou emoji em cada alimento (inclusive da TACO), antes do nome nas listas; a IA sugere emojis e o código de barras traz a foto do produto
- [x] Câmera dentro do app: prato, código de barras ou tabela nutricional, com a opção da galeria
- [x] Caminhadas separadas da corrida e programadas no app (com repetição semanal), treino do Garmin oculto (a prova repetida), botão + configurável e a ordem das medidas
- [x] Cores por seção: botões, chaves, abas e links na cor de cada área
- [x] Carga de treino e forma (TRIMP pelas zonas de FC, condicionamento de 42 dias, cansaço de 7, forma e ACWR com aviso de subida brusca), no card "Carga e forma" da Corrida e no Hoje
- [x] Prontidão do dia (0 a 100) com sono, VFC, FC de repouso, carga e dores ativas, no "Em foco"
- [x] Previsões de prova (Riegel) e VO2max estimado (VDOT) nos Recordes, e a previsão no cartão da próxima prova
- [x] Planejado × feito em cada etapa do treino do treinador, também na mensagem para ele
- [x] Tênis: quilometragem de cada par, o padrão para corridas e caminhadas e o aviso perto do limite
- [x] Clima de cada corrida e caminhada (Open-Meteo), na atividade, nas listas e na análise do dia
- [x] Relatório da semana para o treinador e imagem para compartilhar a corrida ou o treino
- [x] Musculação: aquecimento sugerido, cronômetro nas séries de tempo, RIR por série e fotos e passos dos exercícios (free-exercise-db)
- [x] Check-in semanal das metas de alimentação a partir do gasto estimado e da meta de peso
- [x] Hábitos semanais ("3 vezes por semana") e força do hábito (0 a 100%)
- [x] Retrospectiva do ano (Mais → Retrospectiva e aviso no Hoje em dezembro)
- [x] Gráficos por dia, semana, mês ou ano (Corpo, Sono, Passos, Calorias, Alimentação, Água, Corrida e exercícios), com setas para andar no tempo e "Intervalo"; média ou total conforme a medida, dito na dica
- [x] Detalhes dos treinos programados: tocar num treino do calendário, de "Próximos treinos" ou de "Próximos 7 dias" abre a ficha. A de musculação tem cada exercício com séries, carga, descanso, aquecimento, bi-set, observações, a última vez e "Que tal 57,5 kg?", com Iniciar e Editar ficha. A de corrida tem a distância do nome e as etapas que o calendário do Garmin manda na descrição (ele pode mandar só o nome; aí as etapas aparecem depois da corrida), e "Da última vez", a última corrida do mesmo tipo (outro "Intervalado ativo") com o resultado dos tiros e o comentário

## Observações

- A API pessoal da Garmin é nova e só serve para uso próprio. Ela não tem o calendário nem as fases do sono minuto a minuto, e não publica limites de uso: o app busca só o que é novo, no máximo a cada 3 horas. As bibliotecas não oficiais (garminconnect/garth) quebraram em 2026 e não devem ser usadas.
- Desde 30/09/2026, no Brasil, apps Android instalados fora da Play Store precisam de desenvolvedor verificado. Para uso pessoal existe conta gratuita. Pelo cabo (adb), a instalação funcionou sem isso.
