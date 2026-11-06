import { describe, expect, it } from 'vitest'
import { decodeEntities, detailsMissing, parseWeek, structureDistanceKm, unwrapPartial } from './planilha.ts'

// A week as the planilha draws it: each day is a `.ui-grid-row` with the `.planilhaDiaSemana`
// label, the day's number, a status row per workout and the detail panels. The page repeats every
// day for its responsive layouts, which the parser has to read once.
const tuesday = `
<div class="ui-grid-row linhaDia">
  <div class="ui-grid-col-2"><span class="planilhaDiaSemana">Ter&ccedil;a-feira</span><div class="planilhaDiaNumero">03</div></div>
  <div class="ui-grid-col-10">
    <table><tbody><tr><td>Feito</td><td>Corrida</td><td>Intervalado</td><td>Rua</td><td>3,6 Km</td></tr></tbody></table>
    <div class="ui-accordion">
      <label>Estruturado:</label>
      <div>Aquecer por 10 min (06:00 a 06:40 min/km)</div>
      <div>Repetir 3x</div>
      <div>- Correr por 1,2 km (05:22 a 05:29 min/km)</div>
      <div>- Recuperar por 1:45 min</div>
      <div>Desaquecer por 5 min</div>
      <label>Intensidade:</label><span>Forte</span>
      <label>FC Mínima:</label><span>150 bpm</span>
      <label>FC Máxima:</label><span>172 bpm</span>
      <label>Tempo Mínimo:</label><span>00:35:00</span>
      <label>Tempo Máximo:</label><span>00:42:00</span>
      <label>Descrição:</label><div>Tiros no plano, sem forçar a subida.</div>
      <label>Feedback do Aluno</label>
      <div>Data Realização: 03/11/2026</div><div>Distância: 6,02 Km</div><div>Tempo: 00:38:12</div>
      <div>FC Média: 158</div><div>Calorias: 420</div>
    </div>
    <button type="button">Feedback deste treino</button>
  </div>
</div>`

const friday = `
<div class="ui-grid-row linhaDia">
  <div class="ui-grid-col-2"><span class="planilhaDiaSemana">Sexta-feira</span><div>06</div></div>
  <div class="ui-grid-col-10">
    <table><tbody><tr><td>Proposto</td><td>Corrida</td><td>Intervalado ativo</td><td></td><td></td></tr></tbody></table>
    <div class="ui-accordion">
      <label>Estruturado:</label>
      <div>Aquecer por 15 min</div>
      <div>Repetir 8x</div>
      <div>- Correr por 400 m (04:44 a 04:58 min/km)</div>
      <div>- Trotar por 1:45 min</div>
      <label>Intensidade:</label><span>Moderada</span>
      <label>Descrição:</label><div>Treino adicionado automaticamente</div>
    </div>
    <button type="button">Feedback deste treino</button>
  </div>
</div>`

const saturday = `
<div class="ui-grid-row linhaDia">
  <div class="ui-grid-col-2"><span class="planilhaDiaSemana">Sábado</span><div>07</div></div>
  <div class="ui-grid-col-10">
    <table><tbody><tr><td>Feito Avulso</td><td>Caminhada</td><td></td><td></td><td>3,2 Km</td></tr></tbody></table>
    <table><tbody><tr><td>Proposto</td><td>Corrida</td><td>Regenerativo</td><td>Parque</td><td>5 Km</td></tr></tbody></table>
  </div>
</div>`

const page = (days: string) => `<!DOCTYPE html>
<html><head><title>SisRUN</title><script>if (a < b && c > d) { document.write('<div class="planilhaDiaSemana">Domingo</div>') }</script>
<style>.planilhaDiaSemana { color: red }</style></head>
<body><form id="frmPrincipal">
<!-- semana -->
<div id="frmPrincipal:painelSemana"><span class="tituloSemana">02/11/2026 até 08/11/2026</span></div>
<div class="planilhaDesktop">${days}</div>
<div class="planilhaCelular">${days}</div>
<img src="data:image/png;base64,iVBORw0KGgo=" />
</form></body></html>`

describe('parseWeek', () => {
  const week = parseWeek(page(tuesday + friday + saturday))

  it('reads the week from its header and each day once', () => {
    expect(week.start).toBe('2026-11-02')
    expect(week.detailsMissing).toBe(false)
    expect(week.workouts.map((workout) => [workout.date, workout.status, workout.modality, workout.type])).toEqual([
      ['2026-11-03', 'Feito', 'Corrida', 'Intervalado'],
      ['2026-11-06', 'Proposto', 'Corrida', 'Intervalado ativo'],
      ['2026-11-07', 'Feito Avulso', 'Caminhada', ''],
      ['2026-11-07', 'Proposto', 'Corrida', 'Regenerativo'],
    ])
  })

  it('reads the prescription, the coach note and what was done', () => {
    const [done] = week.workouts
    expect(done).toEqual({
      date: '2026-11-03',
      weekStart: '2026-11-02',
      status: 'Feito',
      modality: 'Corrida',
      type: 'Intervalado',
      route: 'Rua',
      distanceKm: 3.6,
      plannedKm: expect.closeTo(5.934, 2),
      plannedKmEstimated: true,
      intensity: 'Forte',
      hrMin: 150,
      hrMax: 172,
      timeMin: '00:35:00',
      timeMax: '00:42:00',
      structure: [
        'Aquecer por 10 min (06:00 a 06:40 min/km)',
        'Repetir 3x',
        '- Correr por 1,2 km (05:22 a 05:29 min/km)',
        '- Recuperar por 1:45 min',
        'Desaquecer por 5 min',
      ],
      note: 'Tiros no plano, sem forçar a subida.',
      done: { date: '2026-11-03', km: 6.02, time: '00:38:12', hr: 158, kcal: 420 },
    })
  })

  it('takes the structure for the distance when the field is empty, and leaves out the automatic note', () => {
    const friday = week.workouts[1]
    expect(friday.distanceKm).toBeUndefined()
    // 15 min at the default pace, then 8 × 400 m.
    expect(friday.plannedKm).toBeCloseTo(15 / 6.62 + 3.2, 3)
    expect(friday.plannedKmEstimated).toBe(true)
    expect(friday.note).toBeUndefined()
    expect(friday.intensity).toBe('Moderada')
    expect(friday.structure).toHaveLength(4)
  })

  it('keeps the field when there is no structure', () => {
    const run = week.workouts[3]
    expect(run).toEqual({
      date: '2026-11-07',
      weekStart: '2026-11-02',
      status: 'Proposto',
      modality: 'Corrida',
      type: 'Regenerativo',
      route: 'Parque',
      distanceKm: 5,
      plannedKm: 5,
      structure: [],
    })
  })

  it('reads a week the navigation answers as a JSF partial response', () => {
    const partial = `<?xml version='1.0' encoding='UTF-8'?>
<partial-response id="j_id1"><changes><update id="frmPrincipal:painelSemana"><![CDATA[${page(friday)}]]></update>
<update id="j_id1:javax.faces.ViewState:0"><![CDATA[-6043:-1520]]></update></changes></partial-response>`
    const next = parseWeek(partial)
    expect(next.start).toBe('2026-11-02')
    expect(next.workouts.map((workout) => workout.type)).toEqual(['Intervalado ativo'])
  })

  it('skips a day whose number does not match the header', () => {
    const wrong = tuesday.replace('>03<', '>04<')
    expect(parseWeek(page(wrong)).workouts).toEqual([])
  })

  it('gives an empty week when the coach has not published it, and fails without the header', () => {
    expect(parseWeek(page('')).workouts).toEqual([])
    expect(() => parseWeek('<html><body>Faça login</body></html>')).toThrow(/cabeçalho da semana/)
  })
})

// The layout of the real page (checked on 2026-11-05): the table's header row, numbered steps whose
// text says "Intensidade …", the time fields with their empty pace parts, a distance range, and a
// description over several lines with SisRUN's own line about a goal.
const realLayout = `
<div class="ui-grid-row">
  <div class="ui-grid-col-2"><span class="planilhaDiaSemana">Terça-feira</span><div>03</div></div>
  <div class="ui-grid-col-10">
    <div><button type="button">Criar Treino/Feedback Avulso</button></div>
    <table>
      <thead><tr><th>Status</th><th>Modalidade</th><th>Tipo</th><th>Percurso</th><th>Distância</th></tr></thead>
      <tbody><tr><td>Proposto</td><td>Corrida</td><td>Intervalado ativo</td><td></td><td>4,48 - 4,97 Km</td></tr></tbody>
    </table>
    <div>Feedback deste treino</div>
    <div class="ui-accordion"><h3>Detalhes</h3><div>
      <label>Estruturado:</label>
      <div>1. Aquecer por 10min - Corrida leve</div>
      <div>2. Repetir 3x</div>
      <div>- Correr por 1,2km - Intensidade Limiar (05:22 a 05:29 min/km) completar entre 6'26'' e 6'35''</div>
      <div>- Descansar por 1'45''</div>
      <div>3. Correr por 20min - Intensidade Z2 (06:30 a 07:00 min/km) completar entre 2,9km e 3,1km</div>
      <label>Tempo Mínimo:</label><div>37:33</div><div>(</div><div>min/km |</div><div>)</div>
      <label>Descrição:</label>
      <div>Treino da semana de prova.</div>
      <div>Adicionado automaticamente ao ser criado Objetivo/Meta em 13/05/2026 22:16.</div>
      <div>Observações: segurar o ritmo.</div>
    </div></div>
    <div><label>Feedback do Aluno</label></div>
  </div>
</div>`

describe('parseWeek on the real layout', () => {
  it('reads numbered steps, a distance range and the whole description', () => {
    const [workout] = parseWeek(page(realLayout)).workouts
    expect(workout).toEqual({
      date: '2026-11-03',
      weekStart: '2026-11-02',
      status: 'Proposto',
      modality: 'Corrida',
      type: 'Intervalado ativo',
      route: '',
      distanceKm: 4.725,
      distanceRangeKm: [4.48, 4.97],
      // 10 min at the default pace, 3 × 1,2 km, and the 20 min step's own window of 2,9 to 3,1 km.
      plannedKm: expect.closeTo(10 / 6.62 + 3.6 + 3, 3),
      plannedKmEstimated: true,
      timeMin: '37:33',
      structure: [
        '1. Aquecer por 10min - Corrida leve',
        '2. Repetir 3x',
        "- Correr por 1,2km - Intensidade Limiar (05:22 a 05:29 min/km) completar entre 6'26'' e 6'35''",
        "- Descansar por 1'45''",
        '3. Correr por 20min - Intensidade Z2 (06:30 a 07:00 min/km) completar entre 2,9km e 3,1km',
      ],
      note: 'Treino da semana de prova.\nObservações: segurar o ritmo.',
    })
  })
})

describe('detailsMissing', () => {
  it('flags workouts that came without their detail panels', () => {
    const bare = `<div class="ui-grid-row"><span class="planilhaDiaSemana">Sexta</span><div>06</div>
      <table><tr><td>Proposto</td><td>Corrida</td></tr></table><button>Feedback deste treino</button></div>`
    expect(detailsMissing(page(bare))).toBe(true)
    expect(detailsMissing(page(friday))).toBe(false)
    expect(detailsMissing(page(''))).toBe(false)
  })
})

describe('structureDistanceKm', () => {
  it('expands repeats and estimates timed steps at their pace band', () => {
    const [km, estimated] = structureDistanceKm([
      'Aquecer por 10 min (06:00 a 06:40 min/km)',
      'Repetir 3x',
      '- Correr por 1,2 km (05:22 a 05:29 min/km)',
      '- Recuperar por 1:45 min',
      'Desaquecer por 5 min',
    ])
    expect(km).toBeCloseTo(10 / ((6 + 6 + 40 / 60) / 2) + 3.6 + 5 / 6.62, 2)
    expect(estimated).toBe(true)
  })

  it('reads meters, hours, the plan\'s own window and rest', () => {
    expect(structureDistanceKm(['Correr por 800 m', 'Descansar por 2 min'])).toEqual([0.8, false])
    expect(structureDistanceKm(['Trotar 3 min, completar entre 400m e 500m'])).toEqual([0.45, false])
    expect(structureDistanceKm(['Correr por 1 h (06:00 a 06:00 min/km)'])).toEqual([10, true])
    expect(structureDistanceKm([])).toEqual([0, false])
  })
})

describe('decodeEntities and unwrapPartial', () => {
  it('decodes named and numeric references, leaving unknown ones', () => {
    expect(decodeEntities('Ter&ccedil;a &#8226; S&#xe1;bado &amp; &foo;')).toBe('Terça • Sábado & &foo;')
  })

  it('passes a full page through and joins the CDATA of a partial response', () => {
    expect(unwrapPartial('<html>a</html>')).toBe('<html>a</html>')
    expect(unwrapPartial('<partial-response><changes><update><![CDATA[a]]></update><update><![CDATA[b]]></update></changes></partial-response>')).toBe('a\nb')
  })
})
