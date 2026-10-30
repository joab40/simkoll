const strokePassNames = (title, number) => {
  const names = title.includes('Frisim') ? ['Maxstyrka & asymmetrisk dragkraft', 'Unilateral balans & axelhälsa', 'Bålrotation & uthållig effekt']
    : title.includes('Bröstsim') ? ['Höftextension & presskraft', 'Ljumskskydd & prehab', 'Bålkedja & explosiv glid']
      : title.includes('Ryggsim') ? ['Posterior kedja & ryggstyrka', 'Axelhälsa & hållning', 'Armåterföring & bålkontroll']
        : title.includes('Fjärilsim') ? ['Symmetrisk maxkraft & delfinkick', 'Axelhälsa & ländryggsprehab', 'Explosiv effekt & bålkedja'] : []
  return names[number - 1] || `Styrkepass ${number}`
}

export function strengthPasses(program) {
  const content = String(program.content || '')
  const title = String(program.title || '')
  const headings = [...content.matchAll(/(?:^|\n)Pass\s+([1-5])\s*[·–-]\s*([^\r\n]+)\r?\n/g)]
  if (headings.length && headings.every((match, index) => Number(match[1]) === index + 1)) {
    const commonInstructions = content.slice(0, headings[0].index).trim()
    return headings.map((match, index) => {
      const start = match.index + match[0].length
      const end = headings[index + 1]?.index ?? content.length
      return { passNumber: index + 1, title: match[2].trim(), content: [commonInstructions, content.slice(start, end).trim()].filter(Boolean).join('\n\n') }
    })
  }
  const isWeekly = /Veckoprogram|\d+\s*pass/i.test(title)
  if (!isWeekly) return [{ passNumber: 1, title: program.type === 'dryland' || program.program_type === 'dryland' ? 'Landpass' : 'Styrkepass', content }]

  // Accept the separator format used by existing weekly programs.
  const sections = content.split(/\n={10,}\n/).filter((section) => /^\s*\d+\.\s/m.test(section))
  if (sections.length >= 3) {
    return sections.slice(0, 5).map((section, index) => ({
      passNumber: index + 1,
      title: program.type === 'dryland' || program.program_type === 'dryland' ? `Landpass ${index + 1}` : strokePassNames(title, index + 1),
      content: section.trim(),
    }))
  }

  return [{ passNumber: 1, title: program.type === 'dryland' || program.program_type === 'dryland' ? 'Landpass' : strokePassNames(title, 1), content }]
}

export function strengthExercises(content) {
  const exercises = []
  for (const raw of String(content || '').split('\n')) {
    const line = raw.trim()
    if (/^\d+\.\s+/.test(line)) {
      const match = line.match(/^\d+\.\s+(.+?)(?:\s+—\s+|\s+-\s+|:\s+)(.*)$/)
      exercises.push({ name: (match ? match[1] : line.replace(/^\d+\.\s+/, '')).trim(), dosage: match ? match[2].trim() : '', instructions: '' })
    } else if (line.startsWith('Instruktion:') && exercises.length) {
      exercises[exercises.length - 1].instructions = line.slice('Instruktion:'.length).trim()
    }
  }
  const occurrences = new Map()
  return exercises.map((exercise) => {
    const count = (occurrences.get(exercise.name) || 0) + 1
    occurrences.set(exercise.name, count)
    return { ...exercise, resultKey: count === 1 ? exercise.name : `${exercise.name} (${count})` }
  })
}
