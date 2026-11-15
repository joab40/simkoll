import React from 'react'
import { formatAssistantBytes } from '../shared/swimmer-assistant.js'
import './assistant-usage.css'

const number = value => Number.isFinite(value) ? value.toLocaleString('sv-SE') : 'Saknas'
const dollars = value => value == null ? 'Kostnad saknas' : `${value.toLocaleString('sv-SE', { minimumFractionDigits: 4, maximumFractionDigits: 6 })} USD`
export function AssistantDataSize({ sizes, requestBytes }) {
  if (!sizes) return null
  return <section className="assistant-data-size" aria-label="Datamängd"><h4>Datamängd inför nästa fråga</h4><dl>
    <div><dt>Hämtat från databasen</dt><dd>{number(sizes.databaseRows)} rader · {formatAssistantBytes(sizes.databaseJsonBytes)}</dd><small>{number(sizes.databaseRequests)} läsningar{sizes.databaseFailedRequests ? ` · ${sizes.databaseFailedRequests} misslyckade` : ''}</small></div>
    <div><dt>Utvalt analysunderlag</dt><dd>{number(sizes.sourceRecords)} källposter · {formatAssistantBytes(sizes.contextBytes)}</dd><small>Efter urval och bearbetning</small></div>
    <div><dt>Hela begäran till OpenAI</dt><dd>{formatAssistantBytes(requestBytes)}</dd><small>Underlag + fråga + dialog + instruktioner</small></div>
  </dl><p>UTF-8 JSON, inte databasens lagringsutrymme eller antal tokens. Rader kan överlappa mellan kategorier. Underlaget skickas på nytt vid varje fråga. Exakta tokens och uppskattad kostnad visas efter svaret.</p></section>
}
export function AssistantUsage({ telemetry, model }) {
  if (!telemetry) return null
  return <footer className="assistant-usage" aria-label="Användning för detta anrop"><strong>{model || 'Simmarassistent'} · {dollars(telemetry.estimatedCostUsd)}</strong><p>{telemetry.usageKnown ? `${number(telemetry.inputTokens)} tokens in · ${number(telemetry.outputTokens)} ut · ${number(telemetry.totalTokens)} totalt` : 'Tokenanvändning saknas – inte noll.'}</p><small>{formatAssistantBytes(telemetry.requestBytes)} skickad JSON · {number(telemetry.historyMessages)} tidigare dialogmeddelanden</small><details><summary>Beräkning & datamängd</summary><p>{number(telemetry.databaseRows)} hämtade rader ({formatAssistantBytes(telemetry.databaseJsonBytes)}) · {number(telemetry.sourceRecords)} källposter ({formatAssistantBytes(telemetry.contextBytes)}).</p><p>{number(telemetry.cachedInputTokens)} cachelagrade indatatokens · {number(telemetry.reasoningTokens)} resonemangstokens. Dessa ingår redan i in-/utdatatotalerna.</p><p>Uppskattning i USD med Standard-priser, all indata räknad som ej cachelagrad. Cache-rabatter, regionala påslag och andra faktureringsjusteringar ingår inte. Saknad användning, okänd prislista, annan tjänstenivå eller cache-skrivavgifter ger ingen kostnadsuppskattning.</p>{telemetry.rates && <p>Prissnapshot {telemetry.pricingDate}: {telemetry.rates.input} USD in / {telemetry.rates.output} USD ut per miljon tokens. Inte en faktura.</p>}</details></footer>
}
export function AssistantUsageLog({ item }) {
  if (!item.usage_details) return null
  return <AssistantUsage telemetry={item.usage_details} model={item.model} />
}
