const items = [
  { key: 'planning', label: 'Veckoplanering', icon: 'calendar', primary: true },
  { key: 'diary', label: 'Min träningsdagbok', icon: 'calendar', primary: true },
  { key: 'strength', label: 'Mitt styrkeprogram', icon: 'goal' },
  { key: 'dryland', label: 'Mina landträningsprogram', icon: 'goal' },
  { key: 'competitions', label: 'Mina grenar', icon: 'calendar' },
  { key: 'community', label: 'Peppflödet', icon: 'heart' },
  { key: 'goals', label: 'Mina mål', icon: 'goal', primary: true },
  { key: 'help', label: 'FAQ', icon: 'help', public: true },
  { key: 'legal', label: 'Info & villkor', icon: 'info', public: true },
]

export function swimmerNavigation({ hasProfile = false, planningEnabled = true } = {}) {
  return items.filter(item => (hasProfile || item.public) && (item.key !== 'planning' || planningEnabled)).map(item => ({ ...item }))
}
