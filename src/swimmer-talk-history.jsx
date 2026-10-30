import React from 'react'
import { developmentTalkQuestions } from '../shared/development-talk-form.js'
import { talkAgreementText } from '../shared/talk-history.js'

export default function SwimmerTalkHistory({ talks, onOpenTalk }) {
  return <section className="talk-history swimmer-talk-history"><p className="eyebrow">Sparat över tid</p><h2>Mina utvecklingssamtal</h2><p className="talk-history-intro">Här hittar du era överenskommelser, nästa steg och dina förberedelser.</p>
    {talks.length ? talks.map((talk) => {
      const agreement = talkAgreementText(talk.agreement), { sections, legacy } = developmentTalkQuestions(talk.swimmerAnswers)
      const canOpen = talk.enabled !== false && talk.status !== 'completed'
      return <details key={talk.id}><summary>{talk.meetingDate} · {talk.status === 'completed' ? 'Genomfört' : talk.status === 'prepared' ? 'Redo för samtal' : 'Förbereds'} {talk.enabled === false && '· Skrivskyddat'}{agreement && <span className="talk-agreement-badge">Överenskommelse finns</span>}</summary>
        <div className="talk-history-answer"><section className="swimmer-talk-agreement"><h3>Vår gemensamma överenskommelse</h3><small>Samtalsdatum: {talk.meetingDate}</small>{agreement ? <p className="talk-agreement-text">{agreement}</p> : <p>Ingen gemensam överenskommelse är sparad ännu. Ni formulerar den tillsammans under samtalet.</p>}<div className="talk-agreement-followup"><strong>Uppföljning</strong><span>{talk.followUpDate || 'Inget uppföljningsdatum är bestämt ännu.'}</span></div></section>
          <details className="swimmer-talk-preparations"><summary>Mina förberedelser</summary>{sections.map((section) => <section key={section.title}><h4>{section.icon} {section.title}</h4>{section.questions.map((question) => <p key={question.key}><strong>{question.label}</strong><span>{question.value || 'Ej besvarad'}</span></p>)}</section>)}{legacy.length > 0 && <section><h4>Tidigare frågor</h4>{legacy.map((question) => <p key={question.key}><strong>{question.label}</strong><span>{question.value || 'Ej besvarad'}</span></p>)}</section>}</details>
          {canOpen && <button type="button" className="secondary-button" onClick={() => onOpenTalk?.(talk.id)}>Öppna mina förberedelser →</button>}
        </div></details>
    }) : <p className="empty">Inga utvecklingssamtal ännu.</p>}
  </section>
}
