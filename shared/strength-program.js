const strokePassNames = (title, number) => {
  const names = title.includes('Frisim') ? ['Maxstyrka & asymmetrisk dragkraft', 'Unilateral balans & axelhälsa', 'Bålrotation & uthållig effekt']
    : title.includes('Bröstsim') ? ['Höftextension & presskraft', 'Ljumskskydd & prehab', 'Bålkedja & explosiv glid']
      : title.includes('Ryggsim') ? ['Posterior kedja & ryggstyrka', 'Axelhälsa & hållning', 'Armåterföring & bålkontroll']
        : ['Symmetrisk maxkraft & delfinkick', 'Axelhälsa & ländryggsprehab', 'Explosiv effekt & bålkedja']
  return names[number - 1] || `Styrkepass ${number}`
}

export function strengthPasses(program) {
  const content = String(program.content || '')
  const title = String(program.title || '')
  const isWeekly = /Veckoprogram|3\s*pass/i.test(title)
  if (!isWeekly) return [{ passNumber: 1, title: 'Styrkepass', content }]

  // Accept the separator format used by existing weekly programs.
  const sections = content.split(/\n={10,}\n/).filter((section) => /^\s*\d+\.\s/m.test(section))
  if (sections.length >= 3) {
    return sections.slice(0, 3).map((section, index) => ({
      passNumber: index + 1,
      title: strokePassNames(title, index + 1),
      content: section.trim(),
    }))
  }

  // Some programs store all sessions in one field, with headings like
  // “Pass 1 · ...”. Split those into independently selectable/loggable passes.
  const headings = [...content.matchAll(/(?:^|\n)Pass\s+([123])\s*[·–-]\s*([^\n]+)\n/g)]
  if (headings.length >= 3 && headings.slice(0, 3).every((match, index) => Number(match[1]) === index + 1)) {
    return headings.slice(0, 3).map((match, index) => {
      const start = match.index + match[0].length
      const end = headings[index + 1]?.index ?? content.length
      return { passNumber: index + 1, title: match[2].trim(), content: content.slice(start, end).trim() }
    })
  }

  return [{ passNumber: 1, title: strokePassNames(title, 1), content }]
}
