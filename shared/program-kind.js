export const validProgramType = (type) => ['strength', 'dryland'].includes(type)
export const programKind = (type = 'strength') => type === 'dryland'
  ? { type: 'dryland', title: 'Landträningsprogram', name: 'landträningsprogram', pass: 'Landpass', activity: 'Landträning', icon: '🤸' }
  : { type: 'strength', title: 'Styrkeprogram', name: 'styrkeprogram', pass: 'Styrkepass', activity: 'Styrketräning', icon: '🏋️' }
