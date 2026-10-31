import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { apiRequest } from './api-request.js'
import { chatBackgroundUrl } from './chat-background.js'
import { deferredPanel } from './deferred-panel.jsx'
import { createVisibleRefresh, startVisiblePolling } from './visible-refresh.js'
import { attendanceFromCheckins } from './attendance.js'
import { checkinDay, compareCheckinsNewest, latestCheckinForDay, checkinStatus, checkinFollowUp } from './checkin-status.js'
import { hasTrendValue, trendSegments, smoothTrendPath, trendDateLayout } from './trend-curve.js'
import { withTrendSwimMeters } from './trend-swim-meters.js'
import { CHECKIN_ACTIVITIES, activityLabel, BEFORE_TRAINING_CHOICES, selectBeforeTraining } from '../shared/checkin-activity.js'
import { groupSwimOccasions, planningAmountRange, workoutReference } from '../shared/swim-workout-options.js'
import { calendarActivityKey, calendarFormValues, calendarLinkKeys, sameCalendarOccasion, explicitCalendarMatches } from '../shared/planning-calendar.js'
import './swim-workout-options.css'
import './planning-calendar.css'
import { COACH_NAV_ITEMS, COACH_MENU_FEATURES, COACH_OVERVIEW_FEATURES, COACH_MENU_SECTIONS } from '../shared/coach-navigation.js'
import { sleepFollowUpReasons } from '../shared/coach-control-panel.js'
import { strengthPasses, strengthExercises } from '../shared/strength-program.js'
import { programKind } from '../shared/program-kind.js'
import DrylandProgramPage, { DrylandProgramRunner, DrylandHistory } from './dryland-program.jsx'
import ProgramBulkAssign from './program-bulk-assign.jsx'
import WorkoutOccasionChoice from './workout-occasion-choice.jsx'
import WorkoutGenerator, { WorkoutGenerationResult } from './workout-generator.jsx'
import { SWIM_WORKBOOK_TYPES } from '../shared/swim-workbook.js'
import { StrengthProgramImagesEditor, SwimmerExerciseImage } from './strength-exercise-images.jsx'
import CoachMetricDetails from './coach-metric-details.jsx'
import SwimmerWeekPlanner from './swimmer-week-planner.jsx'
import CoachHeader from './coach-header.jsx'
import { planningMonday } from '../shared/weekly-planning.js'
import SwimmerTrainingTimesCard from './swimmer-training-times-card.jsx'
import SwimmerCardSummary, { DirectionExplanation } from './swimmer-card-summary.jsx'
import { programActivityDirection } from '../shared/swimmer-card-direction.js'
import SleepHistory, { SleepQuestion } from './daily-sleep.jsx'
import PrivateChatReply from './private-chat-reply.jsx'
import { TALK_STEPS, TALK_FIELD_LABELS } from '../shared/development-talk-form.js'
import DevelopmentTalkRoster from './development-talk-roster.jsx'
import GoalCreationTools, { GoalAnalysisImage } from './goal-creation-tools.jsx'
import { GoalMediaEditor } from './goal-video.jsx'
import { uploadGoalVideo } from './goal-video-upload.js'
import { coachMetricDetails } from './coach-metric-details.js'
import { latestCoachMessageId, coachInfoReadKey, markCoachMessageRead } from './coach-info.js'
import './styles.css'
import './planning-editor.css'
import CompetitionPm from './competition-pm.jsx'
import PeppChannelPanel from './pepp-channel.jsx'
import { PushAdminSettings, PushNotificationControl, PushReminderSettings, stopDevicePush, usePushSession } from './push-notifications.jsx'

const TrainingDiary = React.lazy(() => import('./training-diary.jsx'))
const StrengthProgramImport = deferredPanel(() => import('./strength-program-import.jsx'))
const StrengthProgramBuilder = deferredPanel(() => import('./strength-program-builder.jsx'))
const WorkoutWorkbookReview = deferredPanel(() => import('./workout-workbook-review.jsx'))
const CoachControlPanel = deferredPanel(() => import('./coach-control-panel.jsx'))
const StorageAdmin = deferredPanel(() => import('./storage-admin.jsx'), 'Hämtar lagringsöversikten…')
const DevelopmentTalkEditor = deferredPanel(() => import('./development-talk-editor.jsx'))
const SwimmerTalkHistory = deferredPanel(() => import('./swimmer-talk-history.jsx'))
const CompetitionProgramReview = deferredPanel(() => import('./competition-program-review.jsx'))
const CompetitionCalendarView = deferredPanel(() => import('./competition-calendar.jsx'))
const SprintGame = deferredPanel(() => import('./sprint-game.jsx'), 'Öppnar spelet…')
const LongJumpGame = deferredPanel(() => import('./long-jump-game.jsx'), 'Öppnar spelet…')
const HurdlesGame = deferredPanel(() => import('./hurdles-game.jsx'), 'Öppnar spelet…')
const DinoRunner = deferredPanel(() => import('./dino-runner.jsx'), 'Öppnar spelet…')
const BalanceGame = deferredPanel(() => import('./balance-game.jsx'), 'Öppnar spelet…')

const APP_VERSION = __APP_VERSION__
const BUILD_TIME = __BUILD_TIME__
const COMMIT_SHA = __COMMIT_SHA__
const coachRoleLabel = (role) => role === 'superadmin' ? 'Superadmin' : role === 'head_coach' ? 'Huvudtränare' : 'Tränare'
const canSwitchToOwnSwimmerView = (role) => role === 'head_coach' || role === 'superadmin'

const FEELINGS = [
  { value: 1, emoji: '😣', label: 'Tungt' },
  { value: 2, emoji: '😕', label: 'Segt' },
  { value: 3, emoji: '😌', label: 'Okej' },
  { value: 4, emoji: '🙂', label: 'Bra' },
  { value: 5, emoji: '🤩', label: 'Toppen' },
]

const DAY_TYPES = [
  { value: 'before', title: 'Jag ska träna', icon: '→' },
  { value: 'after', title: 'Jag har tränat', icon: '✓' },
  { value: 'rest', title: 'Ingen träning idag', icon: '–' },
  { value: 'sick', title: 'Jag känner mig sjuk', icon: '🤒' },
]

const WORKOUT_FOCUSES = [
  ['kondition_frisim', 'Kondition frisim'], ['kondition_special', 'Kondition special'], ['fart', 'Fart'], ['sprint', 'Sprint'], ['troskel', 'Tröskel'], ['syra', 'Syra'], ['f2_frisim', 'F2 Frisim'], ['f2_spec', 'F2 Spec'], ['distans', 'Distans'], ['teknik', 'Teknik'], ['aterhamtning', 'Återhämtning'],
  ['tavlingsinsim', 'Tävlingsinsim'], ['tavling', 'Tävling'],
]
const STROKE_OPTIONS = [['freestyle', 'Frisim'], ['backstroke', 'Ryggsim'], ['breaststroke', 'Bröstsim'], ['butterfly', 'Fjärilsim'], ['individual_medley', 'Medley']]

const GAME_CATALOG = [
  { key: 'swimgames', title: 'Swimgames 25', emoji: '🏊', description: '25 meter frisim mot klockan.', route: 'swimgames' },
  { key: 'vanda', title: 'Startmästaren', emoji: '↻', description: 'Träna reaktion och timing vid vändningen.', route: 'vanda' },
  { key: 'simpaus', title: 'Vågjakten', emoji: '🌊', description: 'Håll dig mellan vågorna så länge du kan.', route: 'game' },
  { key: 'aljakten', title: 'Preppejakten', emoji: '🐍', description: 'Hjälp Preppe att samla energibubblor och växa.', route: 'aljakten' },
  { key: 'breakout', title: 'Breakout', emoji: '🧱', description: 'Slå sönder brickorna, håll bollen i spel och samla poäng.', route: 'breakout' },
  { key: 'sprint100', title: '100m Sprint', emoji: '⚡', description: 'Växla stegen, hitta rytmen och jaga din bästa tid.', route: 'sprint100' },
  { key: 'longjump', title: 'Längdhopp', emoji: '🏅', description: 'Bygg fart, sikta på 45° och landa ditt längsta hopp.', route: 'longjump' },
  { key: 'hurdles100', title: '100 meter häck', emoji: '🏃', description: 'Bygg fart och tajma tio häckar. Snabbaste tiden vinner.', route: 'hurdles100' },
  { key: 'dino', title: 'Huggorm Runner', emoji: '🐍', description: 'Hjälp huggormen hoppa över hindren och se hur långt du klarar dig.', route: 'dino' },
  { key: 'balance', title: 'Preppes balansjakt', emoji: '🚲', description: 'Håll framhjulet i luften, hitta balansen och samla bonus längs vattnet.', route: 'balance' },
]

const dateKey = (date) => {
  const value = new Date(date)
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

const responseDate = (response) => new Date(`${checkinDay(response)}T12:00:00`)
const todayKey = () => dateKey(new Date())
const competitionIsToday = (item, today = todayKey()) => Boolean(item?.startDate && item.startDate <= today && (item.endDate || item.startDate) >= today)
const latestActiveDevelopmentTalk = (talks = []) => talks
  .filter((talk) => talk.enabled !== false && talk.status !== 'completed')
  .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || String(b.meetingDate || '').localeCompare(String(a.meetingDate || '')))[0] || null
const latestPendingDevelopmentTalk = (talks = []) => talks
  .filter((talk) => talk.enabled !== false && talk.status === 'draft')
  .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || String(b.meetingDate || '').localeCompare(String(a.meetingDate || '')))[0] || null
const average = (key, items) => {
  const values = items.map((item) => item[key]).filter((value) => typeof value === 'number')
  return values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1) : '–'
}

const confirmDestructive = (description, phrase = 'RADERA') => window.prompt(`${description}\n\nSkriv ${phrase} för att bekräfta.`) === phrase

function previousWeekRange() {
  const today = new Date()
  const mondayOffset = (today.getDay() + 6) % 7
  const thisMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset)
  const start = new Date(thisMonday)
  start.setDate(start.getDate() - 7)
  const end = new Date(thisMonday)
  end.setMilliseconds(-1)
  return { start, end }
}

function App() {
  const [auth, setAuth] = useState(null)
  const [coachReturnAuth, setCoachReturnAuth] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [profile, setProfile] = useState(null)
  const [responses, setResponses] = useState([])
  const [responsesLoaded, setResponsesLoaded] = useState(false)
  const [ownResponsesLoaded, setOwnResponsesLoaded] = useState(false)
  const [profiles, setProfiles] = useState([])
  const [pendingProfiles, setPendingProfiles] = useState([])
  const [workout, setWorkout] = useState(null)
  const [workoutLocked, setWorkoutLocked] = useState(false)
  const [activeProfilesToday, setActiveProfilesToday] = useState(0)
  const [activityDates, setActivityDates] = useState([])
  const [points, setPoints] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [newDevelopmentGoals, setNewDevelopmentGoals] = useState([])
  const [training, setTraining] = useState(null)
  const [identified, setIdentified] = useState(false)
  const [checkinActivityDate, setCheckinActivityDate] = useState(todayKey())
  const [loading, setLoading] = useState(false)
  const [screen, setScreen] = useState('home')
  const [selectedDevelopmentTalkId, setSelectedDevelopmentTalkId] = useState(null)
  const [talksEnabled, setTalksEnabled] = useState(false)
  const [developmentTalks, setDevelopmentTalks] = useState([])
  const [planningEnabled, setPlanningEnabled] = useState(false)
  const [starsEnabled, setStarsEnabled] = useState(true)
  const [appFeedbackEnabled, setAppFeedbackEnabled] = useState(true)
  const [customPepEnabled, setCustomPepEnabled] = useState(true)
  const [openChatEnabled, setOpenChatEnabled] = useState(false)
  const [aiEnabled, setAiEnabled] = useState(true)
  const [swimmerEffects, setSwimmerEffects] = useState(true)
  const [swimmerThemesEnabled, setSwimmerThemesEnabled] = useState(true)
  const [swimmerTheme, setSwimmerTheme] = useState('none')
  const [competitions, setCompetitions] = useState([])
  const [competitionsLoaded, setCompetitionsLoaded] = useState(false)
  const [availableGames, setAvailableGames] = useState([])
  const [previousGames, setPreviousGames] = useState([])
  usePushSession(auth, profile, (target) => {
    if (auth?.role !== 'swimmer') window.dispatchEvent(new Event(target.screen === 'goals' ? 'simkoll-coach-open-goals' : 'simkoll-coach-open-messages'))
    else if (target.screen === 'talks') { setSelectedDevelopmentTalkId(target.talkId || null); setScreen('talks') }
    else setScreen(target.screen === 'goals' ? 'goals' : target.screen === 'coach-info' ? 'coach-info' : target.screen === 'private' ? 'private-messages' : target.screen === 'community' ? 'community' : target.screen === 'competition-entries' ? 'competition-entries' : target.screen === 'planning' ? 'planning' : 'home')
  })

  useEffect(() => {
    fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore' }) })
      .then((result) => result.json())
      .then((data) => { if (data.role) setAuth({ role: data.role, accountRole: data.accountRole, code: data.code || '', displayName: data.displayName }) })
      .catch(() => {})
      .finally(() => setCheckingSession(false))
  }, [])

  useEffect(() => {
    if (!auth || auth.role !== 'swimmer' || profile || screen !== 'home') return
    setScreen('restoring-profile')
    apiRequest('/api/profiles', auth.code).then((data) => { setProfile(data.profile); setScreen(data.profile?.termsAccepted ? 'home' : 'swimmer-terms') }).catch(() => setScreen('profile-login'))
  }, [auth, profile, screen])

  useEffect(() => {
    if (!auth) return
    setResponsesLoaded(false)
    setLoading(true)
    // Visa dagens känslor så fort svaren är hämtade. Övrig coachdata får
    // fortsätta laddas parallellt utan att blockera färgen i toppkortet.
    fetchResponses(auth.code).then((nextResponses) => setResponses(nextResponses)).catch((error) => window.alert(error.message)).finally(() => setResponsesLoaded(true))
    Promise.all([
      auth.role === 'coach' ? apiRequest('/api/profiles', auth.code) : Promise.resolve({ profiles: [], pendingProfiles: [] }),
      auth.role === 'coach' ? apiRequest('/api/activity', auth.code).then((data) => data.activeProfilesToday) : Promise.resolve(0),
    ])
      .then(([profileData, activeCount]) => { setProfiles(profileData.profiles); setPendingProfiles(profileData.pendingProfiles || []); setActiveProfilesToday(activeCount) })
      .catch((error) => window.alert(error.message))
      .finally(() => setLoading(false))
  }, [auth])

  useEffect(() => {
    if (!auth || !profile) { setWorkout(null); setWorkoutLocked(false); return }
    let active = true
    setTraining(null); setPoints(null); setWorkout(null); setActivityDates([])
    setCompetitionsLoaded(false)
    // Each card can render as soon as its own request completes.
    const load = (url, apply) => apiRequest(url, auth.code).then((data) => { if (active) apply(data) })
    const loadProfileData = () => Promise.allSettled([
      load('/api/training?summary=true', setTraining),
      load('/api/workouts', (data) => { setWorkout(data.workouts?.length ? data.workouts : data.workout); setWorkoutLocked(data.locked) }),
      load('/api/activity?streak=true', (data) => { setActiveProfilesToday(data.activeProfilesToday); setActivityDates(data.activityDates || []) }),
      load('/api/workouts?calendar=true', (data) => { setCompetitions(data.competitions || []); setCompetitionsLoaded(true) }).catch(() => { if (active) { setCompetitions([]); setCompetitionsLoaded(true) } }),
      load('/api/points', setPoints),
      load('/api/points?games=true', (data) => { setAvailableGames(data.catalog || []); setPreviousGames(data.previousGames || []) }),
    ])
    const refresh = createVisibleRefresh(loadProfileData, { minInterval: 15000 })
    const refreshOnFocus = () => { void refresh.refresh().catch(() => {}) }
    refreshOnFocus()
    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnFocus)
    return () => { active = false; refresh.dispose(); window.removeEventListener('focus', refreshOnFocus); document.removeEventListener('visibilitychange', refreshOnFocus) }
  }, [auth, profile?.id])

  // The first swimmer response fetch is intentionally anonymized for the
  // group view. Once a profile is restored, merge the profile's detailed
  // responses so the status card can show the selected day type as well.
  useEffect(() => {
    if (!auth || !profile) { setOwnResponsesLoaded(false); return }
    let active = true
    setOwnResponsesLoaded(false)
    apiRequest('/api/responses?mine=true', auth.code).then((data) => {
      if (!active) return
      setResponses((current) => {
        const own = new Map((data.responses || []).map((item) => [item.id, item]))
        const merged = current.map((item) => own.get(item.id) || item)
        const existing = new Set(merged.map((item) => item.id))
        return [...merged, ...(data.responses || []).filter((item) => !existing.has(item.id))]
      })
      if (active) setOwnResponsesLoaded(true)
    }).catch(() => {})
    return () => { active = false }
  }, [auth, profile?.id])

  useEffect(() => {
    if (screen === 'home') window.dispatchEvent(new Event('simkoll-home-open'))
  }, [screen])

  useEffect(() => {
    if (!auth || !profile) return undefined
    let active = true
    const stop = startVisiblePolling(() => apiRequest('/api/notifications', auth.code).then((data) => { if (active) setNotifications(data.notifications || []) }))
    return () => { active = false; stop() }
  }, [auth, profile?.id])

  useEffect(() => {
    if (!auth || !profile) { setNewDevelopmentGoals([]); return undefined }
    let active = true
    const refresh = () => apiRequest('/api/goals?home=true', auth.code).then((data) => { if (active) setNewDevelopmentGoals(data.goals || []) }).catch(() => {})
    const stop = startVisiblePolling(refresh)
    return () => { active = false; stop() }
  }, [auth, profile?.id])

  useEffect(() => {
    if (!auth || !profile) { setDevelopmentTalks([]); setTalksEnabled(false); return }
    let active = true
    const refreshTalks = () => apiRequest('/api/goals?talks=true', auth.code).then((data) => {
      if (!active) return
      setTalksEnabled(data.globalEnabled !== false)
      setDevelopmentTalks(data.globalEnabled === false ? [] : (data.talks || []).filter((talk) => talk.enabled !== false))
    }).catch(() => { if (active) { setTalksEnabled(false); setDevelopmentTalks([]) } })
    const stop = startVisiblePolling(refreshTalks)
    return () => { active = false; stop() }
  }, [auth, profile?.id])
  useEffect(() => { if (!auth || !profile) return; apiRequest('/api/goals?settings=true', auth.code).then((data) => { const savedSettings = data.settings || {}; const savedSwimmerSettings = savedSettings.swimmer || {}; const savedTheme = savedSettings.swimmerTheme || savedSwimmerSettings.theme || 'none'; setAiEnabled(savedSettings.aiEnabled !== false); setPlanningEnabled(savedSwimmerSettings.planning === true); setAppFeedbackEnabled(savedSwimmerSettings.appFeedback !== false); setCustomPepEnabled(savedSwimmerSettings.customPep !== false); setOpenChatEnabled(savedSettings.openChat?.enabled === true); setStarsEnabled(savedSwimmerSettings.stars !== false); setSwimmerEffects(savedSettings.swimmerEffects !== false); setSwimmerThemesEnabled((savedSettings.swimmerThemesEnabled ?? savedSwimmerSettings.themesEnabled) !== false); setSwimmerTheme(['none', 'halloween', 'snow', 'christmas'].includes(savedTheme) ? savedTheme : 'none') }).catch(() => { setAiEnabled(true); setPlanningEnabled(false); setAppFeedbackEnabled(true); setCustomPepEnabled(true); setOpenChatEnabled(false); setStarsEnabled(true); setSwimmerEffects(true); setSwimmerThemesEnabled(true); setSwimmerTheme('none') }) }, [auth, profile])

  if (checkingSession) return null
  if (!auth) return <Login onLogin={async (nextAuth) => {
    setAuth(nextAuth)
    if (nextAuth.role !== 'swimmer') { setScreen('home'); return }
    setScreen('restoring-profile')
    try {
      const data = await apiRequest('/api/profiles', nextAuth.code)
      setProfile(data.profile)
      setScreen(data.profile?.termsAccepted ? 'home' : 'swimmer-terms')
    } catch {
      setProfile(null)
      setScreen('profile-login')
    }
  }} />

  const logout = async () => {
    await stopDevicePush(auth.code).catch(() => {})
    fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) }).catch(() => {})
    setAuth(null)
    setCoachReturnAuth(null)
    setProfile(null)
    setResponses([])
    setProfiles([])
    setPendingProfiles([])
    setWorkout(null)
    setWorkoutLocked(false)
    setActiveProfilesToday(0)
    setPoints(null)
    setNotifications([])
    setNewDevelopmentGoals([])
    setAvailableGames([])
    setPreviousGames([])
    setTraining(null)
    setTalksEnabled(true)
    setPlanningEnabled(false)
    setScreen('home')
  }

  if ((auth.role === 'coach' || auth.role === 'superadmin') && !coachReturnAuth) {
    return <Coach accountRole={auth.accountRole || 'coach'} responses={responses} profiles={profiles} pendingProfiles={pendingProfiles} onProfilesChange={async () => { const data = await apiRequest('/api/profiles', auth.code); setProfiles(data.profiles); setPendingProfiles(data.pendingProfiles || []) }} activeProfilesToday={activeProfilesToday} code={auth.code} loading={loading} onLogout={logout} onSwitchToSwimmer={async () => {
      const data = await apiRequest('/api/auth', auth.code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'coach-enter-own-swimmer' }) })
      setCoachReturnAuth(auth)
      setProfile(data.profile)
      setAuth({ role: 'swimmer', code: data.code, displayName: data.profile?.displayName })
      setScreen('home')
    }} onClear={async () => {
      await apiRequest('/api/responses', auth.code, { method: 'DELETE' })
      setResponses([])
    }} />
  }

  // Do not briefly render the swimmer dashboard while a remembered profile
  // is being restored. This prevents a visible flash of the wrong state on
  // automatic session login.
  if (!profile && screen === 'home') {
    return <main className="app-shell"><section className="profile-restore-placeholder" aria-label="Återställer session" /></main>
  }

  return (
    <Shell code={auth.code} role="swimmer" profile={profile} coachMode={Boolean(coachReturnAuth)} onSwitchToCoach={async () => { if (!coachReturnAuth) return; try { await apiRequest('/api/auth', coachReturnAuth.code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'coach-exit-own-swimmer' }) }) } catch (error) { window.alert(`${error.message} Du loggas ut för att skydda profilen och kan sedan logga in igen.`); await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) }).catch(() => {}); setAuth(null); setCoachReturnAuth(null); setProfile(null); return } setAuth(coachReturnAuth); setCoachReturnAuth(null); setProfile(null); setScreen('home') }} assistantEnabled={aiEnabled && profile?.assistantEnabled !== false} talksEnabled={talksEnabled} planningEnabled={planningEnabled} onPlanning={() => setScreen('planning')} onStrengthProgram={() => setScreen('strength-program')} onDrylandProgram={() => setScreen('dryland-program')} onDiary={() => setScreen('training-diary')} onCompetitions={() => setScreen('competition-entries')} onCommunity={() => setScreen('community')} onGoals={() => setScreen('goals')} onTalk={() => setScreen('talks')} onHelp={() => setScreen('faq')} onLegal={() => setScreen('legal')} onProfile={() => setScreen('profile')} onGame={() => setScreen('game')} onLogout={logout}>
      {screen === 'training-diary' && profile && <React.Suspense fallback={<p className="empty" role="status">Öppnar träningsdagboken…</p>}><TrainingDiary code={auth.code} request={apiRequest} onBack={() => setScreen('home')} onGoals={() => setScreen('goals')} /></React.Suspense>}
      {screen === 'game' && <Simpaus code={auth.code} onBack={() => setScreen('home')} />}
      {screen === 'vanda' && <Vandningsmastaren code={auth.code} onBack={() => setScreen('home')} />}
      {screen === 'swimgames' && <Swimgames code={auth.code} onBack={() => setScreen('home')} />}
      {screen === 'aljakten' && <Aljakten code={auth.code} onBack={() => setScreen('home')} />}
      {screen === 'breakout' && <PreppeBreakout code={auth.code} onBack={() => setScreen('home')} />}
      {screen === 'sprint100' && <SprintGame code={auth.code} onBack={() => setScreen('home')} request={apiRequest} />}
      {screen === 'longjump' && <LongJumpGame code={auth.code} onBack={() => setScreen('home')} request={apiRequest} />}
      {screen === 'hurdles100' && <HurdlesGame code={auth.code} onBack={() => setScreen('home')} request={apiRequest} />}
      {screen === 'dino' && <DinoRunner code={auth.code} onBack={() => setScreen('home')} request={apiRequest} />}
      {screen === 'balance' && <BalanceGame code={auth.code} onBack={() => setScreen('home')} request={apiRequest} />}
      {screen === 'bikerun' && <BikeRun code={auth.code} onBack={() => setScreen('home')} />}
      {screen === 'twenty48' && <Twenty48 code={auth.code} onBack={() => setScreen('home')} />}
      {screen === 'alltime-games' && <AllTimeGames code={auth.code} onBack={() => setScreen('home')} />}
      {screen === 'talks' && <DevelopmentTalkSwimmer code={auth.code} talkId={selectedDevelopmentTalkId} onBack={() => { setSelectedDevelopmentTalkId(null); setScreen('home') }} />}
      {screen === 'planning' && <SwimmerPlanning code={auth.code} onBack={() => setScreen('home')} />}
      {screen === 'competition-entries' && <SwimmerCompetitionEntries code={auth.code} onBack={() => setScreen('home')} />}
      {screen === 'restoring-profile' && <section className="profile-restore-placeholder" aria-hidden="true" />}
      {screen === 'account' && <AccountChoice
        onLogin={() => setScreen('profile-login')}
        onCreate={() => setScreen('profile-create')}
      />}
      {(screen === 'profile-login' || screen === 'profile-create' || screen === 'profile-reset') && (
        <ProfileAccess
          mode={screen.replace('profile-', '')}
          code={auth.code}
          onBack={() => setScreen('account')}
          onMode={(mode) => setScreen(`profile-${mode}`)}
          onSuccess={async (nextProfile) => {
            if (nextProfile) setProfile(nextProfile)
            setScreen(nextProfile ? (nextProfile.termsAccepted ? 'home' : 'swimmer-terms') : 'profile-login')
          }}
        />
      )}
      {screen === 'swimmer-terms' && profile && <SwimmerTerms code={auth.code} profile={profile} onAccepted={(nextProfile) => { setProfile(nextProfile); setScreen('home') }} onLogout={logout} />}
      {screen === 'home' && (
        <Home code={auth.code} responses={responses} responsesLoaded={responsesLoaded} ownResponsesLoaded={ownResponsesLoaded} profile={profile} points={points} onNotificationsChange={setNotifications} notifications={notifications} newDevelopmentGoals={newDevelopmentGoals} training={training} workout={workout} competitions={competitions} developmentTalks={talksEnabled ? developmentTalks : []} availableGames={availableGames} previousGames={previousGames} appFeedbackEnabled={appFeedbackEnabled} starsEnabled={starsEnabled} swimmerEffects={swimmerEffects || profile?.isTestProfile} swimmerThemesEnabled={swimmerThemesEnabled || profile?.isTestProfile} swimmerTheme={swimmerTheme} workoutLocked={workoutLocked} activeProfilesToday={activeProfilesToday} activityDates={activityDates} onCommunity={() => setScreen('community')} onCommunityChat={() => setScreen('coach-info')} onGoals={() => setScreen('goals')} onTalk={(talkId) => { setSelectedDevelopmentTalkId(talkId || null); setScreen('talks') }} onStrengthProgram={() => setScreen('strength-program')} onDrylandProgram={() => setScreen('dryland-program')} onCompetitions={() => setScreen('competition-entries')} onGame={(game = 'game') => setScreen(game)} onVanda={() => setScreen('vanda')} onSwimgames={() => setScreen('swimgames')} onAljakten={() => setScreen('aljakten')} onBreakout={() => setScreen('breakout')} onSprint={() => setScreen('sprint100')} onLongJump={() => setScreen('longjump')} onBikeRun={() => setScreen('bikerun')} onTwenty48={() => setScreen('twenty48')} onAllTime={() => setScreen('alltime-games')} onDino={() => setScreen('dino')} onToggleSession={async (date, slot, completed) => apiRequest('/api/training', auth.code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle-session', date, slot, completed, skipCheer: true }) })} onTogglePlan={async (date, slot, planned) => apiRequest('/api/training', auth.code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle-plan', date, slot, planned }) })} onStart={() => {
          // A previous after-registration can leave yesterday selected.
          // Every normal check-in must start on the current activity date.
          setCheckinActivityDate(todayKey())
          if (profile) setScreen('privacy-choice')
          else { setIdentified(false); setScreen('checkin') }
        }} onStartYesterday={() => { const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); setCheckinActivityDate(dateKey(yesterday)); setScreen('privacy-choice') }} />
      )}
      {screen === 'privacy-choice' && <PrivacyChoice profile={profile} lateEntry={checkinActivityDate !== todayKey()} onBack={() => setScreen('home')} onChoose={(value) => { setIdentified(value); setScreen('checkin') }} />}
      {screen === 'checkin' && (
        <CheckIn
          code={auth.code}
          activityDate={checkinActivityDate}
          identified={identified}
          hasProfile={Boolean(profile)}
          lateEntry={checkinActivityDate !== todayKey()}
          followUp={checkinFollowUp(responses.filter((item) => item.profileId === profile?.id), checkinActivityDate).followUp}
          raceFollowUp={checkinFollowUp(responses.filter((item) => item.profileId === profile?.id), checkinActivityDate).raceFollowUp}
          competitionToday={Boolean(profile && competitions.some((item) => competitionIsToday(item)))}
          competitionStatusLoaded={competitionsLoaded}
          plannedWorkouts={checkinActivityDate === todayKey() ? workout : []}
          plannedSwimSlots={(training?.plannedSessions || []).filter((item) => item.date === checkinActivityDate && ['morning_swim', 'afternoon_swim'].includes(item.slot)).map((item) => item.slot)}
          onBack={() => setScreen('home')}
          onSubmit={async (response) => {
            const result = await apiRequest('/api/responses', auth.code, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...response, identified, activityDate: checkinActivityDate }),
            })
            // Anonymous responses intentionally come back without details
            // from the API. Keep the selected type in this session so the
            // swimmer still gets useful confirmation in the status card.
            setResponses((current) => [...current, { ...result.response, ...response, activityDate: checkinActivityDate, lateEntry: checkinActivityDate !== todayKey() }])
            if (checkinActivityDate !== todayKey() && profile) {
              try { window.localStorage.setItem(`simkoll-late-checkin:${profile.id}:${checkinActivityDate}`, 'done') } catch { /* Storage is optional; server still enforces one entry. */ }
            }
            // Show confirmation as soon as the response is persisted. The
            // surrounding dashboard data can refresh without blocking the UI.
            setScreen('thanks')
            if (profile && checkinActivityDate === todayKey()) {
              void (async () => {
                const [trainingData, workoutData, activityData, pointsData] = await Promise.all([apiRequest('/api/training?summary=true', auth.code), apiRequest('/api/workouts', auth.code), apiRequest('/api/activity', auth.code), apiRequest('/api/points', auth.code)])
                setWorkout(workoutData.workouts?.length ? workoutData.workouts : workoutData.workout)
                setWorkoutLocked(workoutData.locked)
                setActiveProfilesToday(activityData.activeProfilesToday)
                setPoints(pointsData)
                setTraining(trainingData)
              })().catch(() => {})
            }
          }}
        />
      )}
      {screen === 'thanks' && <Thanks responses={responses} profile={profile} identified={identified} activityDate={checkinActivityDate} lateEntry={checkinActivityDate !== todayKey()} workout={workout} onDone={() => setScreen('home')} />}
      {['community', 'private-messages'].includes(screen) && <Community profile={profile} code={auth.code} points={points} customPepEnabled={customPepEnabled} initialView={screen === 'private-messages' ? 'private' : 'group'} onBack={() => setScreen('home')} onPointsChange={setPoints} />}
      {screen === 'coach-info' && <CoachInfoPage code={auth.code} profile={profile} onBack={() => setScreen('home')} />}
      {screen === 'goals' && <MyGoals code={auth.code} onTrainingChange={setTraining} onBack={() => setScreen('home')} />}
      {screen === 'strength-program' && <StrengthProgramPage code={auth.code} onTrainingChange={setTraining} onBack={() => setScreen('home')} />}
      {screen === 'dryland-program' && <DrylandProgramPage code={auth.code} onTrainingChange={setTraining} onBack={() => setScreen('home')} />}
      {screen === 'profile' && <MyProfile profile={profile} points={points} code={auth.code} onProfileChange={setProfile} onBack={() => setScreen('home')} onDiary={() => setScreen('training-diary')} onOpenTalk={(talkId) => { setSelectedDevelopmentTalkId(talkId); setScreen('talks') }} onProfileLogout={async () => {
        await stopDevicePush(auth.code).catch(() => {})
        await apiRequest('/api/profiles', auth.code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) })
        setProfile(null)
        setPoints(null)
        setTraining(null)
        setScreen('account')
      }} />}
      {screen === 'faq' && <Faq role="swimmer" onBack={() => setScreen('home')} />}
      {screen === 'legal' && <><LegalPurpose /><LegalPage onBack={() => setScreen('home')} /></>}
      {screen !== 'coach-info' && <footer className="app-meta swimmer-app-meta"><span>Simkoll v{APP_VERSION}</span><span>Build {COMMIT_SHA}</span><span>Uppdaterad {new Date(BUILD_TIME).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' })}</span></footer>}
    </Shell>
  )
}

async function fetchResponses(code) {
  const data = await apiRequest('/api/responses', code)
  return data.responses
}

function Login({ onLogin }) {
  const [mode, setMode] = useState('group')
  const [code, setCode] = useState('')
  const [email, setEmail] = useState(() => typeof window !== 'undefined' ? window.localStorage.getItem('simkoll_coach_email') || '' : '')
  const [password, setPassword] = useState('')
  const [rememberCoachEmail, setRememberCoachEmail] = useState(true)
  const [rememberCoachSession, setRememberCoachSession] = useState(false)
  const [rememberGroupCode, setRememberGroupCode] = useState(true)
  const [acceptedCoachTerms, setAcceptedCoachTerms] = useState(false)
  const [bootstrapToken, setBootstrapToken] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [coachMode, setCoachMode] = useState('login')
  const [bootstrapAvailable, setBootstrapAvailable] = useState(false)
  useEffect(() => { if (mode !== 'coach') return; fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'coach-bootstrap-status' }) }).then((result) => result.json()).then((data) => setBootstrapAvailable(data.available === true)).catch(() => setBootstrapAvailable(false)) }, [mode])
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError(''); setInfo('')
    try {
      if (mode === 'coach') {
        if ((coachMode === 'bootstrap' || coachMode === 'register') && !acceptedCoachTerms) { setError('Läs och godkänn tränarvillkoren först.'); setLoading(false); return }
        if (rememberCoachEmail) window.localStorage.setItem('simkoll_coach_email', email.trim().toLowerCase())
        else window.localStorage.removeItem('simkoll_coach_email')
        const body = coachMode === 'bootstrap' ? { action: 'coach-bootstrap', email, displayName, password, bootstrapToken, acceptedTerms: acceptedCoachTerms } : coachMode === 'register' ? { action: 'coach-register', email, displayName, password, acceptedTerms: acceptedCoachTerms } : { action: 'coach-login', email, password, remember: rememberCoachSession }
        const result = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        const data = await result.json()
        if (!result.ok) throw new Error(data.error)
        if (coachMode === 'register') { setInfo('Ansökan är skickad. En superadmin behöver godkänna kontot innan du kan logga in.'); setCoachMode('login'); return }
        await onLogin({ role: data.role, accountRole: data.accountRole, code: data.code, displayName: data.displayName })
        return
      }
      const result = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, remember: rememberGroupCode }),
      })
      const data = await result.json()
      if (!result.ok) throw new Error(data.error)
      await onLogin({ role: data.role, code })
    } catch (loginError) {
      setError(loginError.message || 'Kunde inte logga in.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <div className="watermark">SIMKOLL</div>
      <section className="login-card">
        <Logo />
        <div className="login-copy">
          <p className="eyebrow">Välkommen</p>
          <h1>Hur känns<br />träningen idag?</h1>
          <p>Logga in med din profil för att checka in och följa din utveckling.</p>
        </div>
        <div className="login-mode-switch"><button type="button" className={mode === 'group' ? 'active' : ''} onClick={() => { setMode('group'); setError('') }}>Gruppkod</button><button type="button" className={mode === 'coach' ? 'active' : ''} onClick={() => { setMode('coach'); setError('') }}>Tränare</button></div>
        <form onSubmit={submit} className="code-form">
          {mode === 'coach' ? <>
            <label htmlFor="coach-email">E-post</label><input id="coach-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="namn@klubb.se" />
            <label htmlFor="coach-password">Lösenord</label><input id="coach-password" type="password" autoComplete="current-password" required minLength="10" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minst 10 tecken" />
            {coachMode === 'login' && <><label className="remember-login"><input type="checkbox" checked={rememberCoachEmail} onChange={(event) => setRememberCoachEmail(event.target.checked)} /> Kom ihåg e-post på den här enheten</label><label className="remember-login"><input type="checkbox" checked={rememberCoachSession} onChange={(event) => setRememberCoachSession(event.target.checked)} /> Håll mig inloggad på den här enheten</label></>}
            {(coachMode === 'bootstrap' || coachMode === 'register') && <><label htmlFor="coach-name">Namn</label><input id="coach-name" required value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="För- och efternamn" />{coachMode === 'bootstrap' && <><label htmlFor="bootstrap-token">Bootstrap-token</label><input id="bootstrap-token" type="password" required value={bootstrapToken} onChange={(event) => setBootstrapToken(event.target.value)} placeholder="Från Vercel" /></>}<details className="login-terms"><summary>Visa tränarvillkoren</summary><p>Kontot får bara användas i klubbens tränaruppdrag. Hantera simmarinformation konfidentiellt, skriv inte diagnoser eller personnummer i fritext, och dela inte uppgifter eller exporter med obehöriga. AI-svar ska alltid kontrolleras och får inte användas som automatiska beslut.</p></details><label className="remember-login"><input type="checkbox" checked={acceptedCoachTerms} onChange={(event) => setAcceptedCoachTerms(event.target.checked)} /> Jag har läst och godkänner tränarvillkoren.</label></>}
            <button className="primary-button login-submit" type="submit" disabled={loading}>{loading ? 'Arbetar…' : coachMode === 'bootstrap' ? 'Skapa superadmin' : coachMode === 'register' ? 'Skicka ansökan' : 'Logga in som tränare'}</button>
            <button type="button" className="text-button" onClick={() => { setCoachMode((value) => value === 'login' ? 'register' : value === 'register' ? (bootstrapAvailable ? 'bootstrap' : 'login') : 'login'); setError(''); setInfo('') }}>{coachMode === 'login' ? 'Ansök om tränarkonto' : coachMode === 'register' && bootstrapAvailable ? 'Skapa första superadmin' : 'Tillbaka till tränarinloggning'}</button>
            {coachMode === 'login' && bootstrapAvailable && <button type="button" className="text-button" onClick={() => { setCoachMode('bootstrap'); setError(''); setInfo('') }}>Skapa första superadmin</button>}
          </> : <>
          <label htmlFor="code">Gruppkod</label>
          <div className={`code-field ${error ? 'has-error' : ''}`}>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength="4"
              placeholder="••••"
              value={code}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, ''))
                setError('')
              }}
              autoFocus
            />
            <button aria-label="Logga in" type="submit" disabled={loading}>{loading ? '…' : '→'}</button>
          </div>
          <label className="remember-login"><input type="checkbox" checked={rememberGroupCode} onChange={(event) => setRememberGroupCode(event.target.checked)} /> Kom ihåg gruppkoden på den här enheten</label>
          <p className="settings-note login-group-code-note">Du loggar fortfarande in separat med din personliga användare och PIN.</p>
          </>}
          {error && <span className="error-text">{error}</span>}
          {info && <span className="settings-saved">{info}</span>}
        </form>
        <p className="privacy-note"><span>●</span> Din profil och dina svar skyddas av klubbens rutiner</p>
      </section>
    </main>
  )
}

function SwimmerPlanning({ code, onBack }) {
  const [loading, setLoading] = useState(true)
  const [plans, setPlans] = useState([])
  const [workouts, setWorkouts] = useState([])
  const [sportAdminActivities, setSportAdminActivities] = useState([])
  const [todayWorkoutAccess, setTodayWorkoutAccess] = useState({ locked: false, hasWorkout: false })
  const [weekOffset, setWeekOffset] = useState(0)
  useEffect(() => {
    Promise.all([apiRequest('/api/workouts?planning=true', code), apiRequest(`/api/workouts?date=${todayKey()}`, code)])
      .then(([planningData, workoutData]) => { setPlans(planningData.plans || []); setWorkouts(planningData.workouts || []); setSportAdminActivities(planningData.sportAdminActivities || []); setTodayWorkoutAccess({ locked: workoutData.locked === true, hasWorkout: Boolean(workoutData.workout || workoutData.workouts?.length) }) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [code])
  const selectedStart = useMemo(() => { const start = weekStart(new Date()); start.setDate(start.getDate() + weekOffset * 7); return start }, [weekOffset])
  const selectedEnd = useMemo(() => { const end = new Date(selectedStart); end.setDate(end.getDate() + 7); return end }, [selectedStart])
  const startKey = dateKey(selectedStart), endKey = dateKey(selectedEnd)
  const calendarTimeOfDay = (time) => { const hour = Number(String(time || '').split(':')[0]); return Number.isFinite(hour) ? (hour < 12 ? 'morning' : 'afternoon') : '' }
  const linkedWorkoutIds = new Set(plans.map((plan) => plan.sourceWorkoutId).filter(Boolean))
  const publishedWorkoutPlans = workouts.filter((workout) => !linkedWorkoutIds.has(workout.id)).map((workout) => ({ ...workout, activityType: 'swim', sourceWorkoutId: workout.id, syncStatus: 'linked' }))
  const planningRows = [...plans, ...publishedWorkoutPlans].filter((plan) => plan.date >= startKey && plan.date < endKey)
  // Äldre importer kan ha lämnat flera identiska planeringskort efter sig.
  // Behåll den mest informativa raden, men slå inte ihop separata morgon- och
  // eftermiddagspass (timeOfDay ingår därför i nyckeln).
  const planningPlaceholder = (title) => /^(image\.jpg|importerat träningspass)$/i.test(String(title || '').trim())
  const planningRank = (plan) => (plan.sourceWorkoutId ? 4 : 0) + (plan.focus ? 2 : 0) + (plan.location ? 1 : 0) + (plan.title && !planningPlaceholder(plan.title) ? 2 : 0)
  const deduplicatedPlanningRows = []
  const planningDuplicates = new Map()
  planningRows.forEach((plan) => {
    const groups = [...new Set((plan.targetGroups || []).map((group) => String(group).trim()).filter(Boolean))].sort().join(',')
    const fingerprint = [plan.date, plan.activityType, plan.distanceMeters || '', plan.durationMinutes || '', plan.timeOfDay || '', groups].join('|')
    const previousIndex = planningDuplicates.get(fingerprint)
    if (previousIndex == null) {
      planningDuplicates.set(fingerprint, deduplicatedPlanningRows.length)
      deduplicatedPlanningRows.push(plan)
      return
    }
    const previous = deduplicatedPlanningRows[previousIndex]
    const sameMeaningfulTitle = previous.title === plan.title && !planningPlaceholder(previous.title) && !planningPlaceholder(plan.title)
    if (sameMeaningfulTitle || planningPlaceholder(previous.title) || planningPlaceholder(plan.title)) {
      if (planningRank(plan) > planningRank(previous)) deduplicatedPlanningRows[previousIndex] = plan
    } else {
      // Två riktiga pass med samma siffror får fortfarande visas separat.
      deduplicatedPlanningRows.push(plan)
    }
  })
  const uniquePlanningRows = deduplicatedPlanningRows
  const calendarRows = sportAdminActivities.filter((item) => item.date >= startKey && item.date < endKey).map((item) => ({ ...item, id: `sportadmin-${item.id}`, activityType: 'sportadmin', title: item.title || 'Kalenderaktivitet', time: item.time || '', source: 'SportAdmin' }))
  const matchedCalendarIds = new Set()
  const mergedPlans = uniquePlanningRows.map((plan) => {
    const planGroups = new Set(plan.targetGroups || [])
    const sameCalendarEvent = (item) => {
      const titleMatch = item.title && plan.title && (item.title === plan.title || item.title.includes(plan.title) || plan.title.includes(item.title))
      const locationMatch = item.location && plan.location && (item.location === plan.location || item.location.includes(plan.location) || plan.location.includes(item.location))
      return titleMatch || locationMatch
    }
    const candidates = calendarRows.filter((item) => (item.date === plan.date || (plan.activityType === 'competition' && sameCalendarEvent(item))) && (!planGroups.size || !item.targetGroups?.length || item.targetGroups.some((group) => planGroups.has(group))) && (!plan.timeOfDay || !item.time || calendarTimeOfDay(item.time) === plan.timeOfDay))
    const locationMatches = plan.location ? candidates.filter((item) => item.location && (item.location === plan.location || item.location.includes(plan.location) || plan.location.includes(item.location))) : []
    const matching = explicitCalendarMatches(plan, calendarRows) ?? (locationMatches.length === 1 ? locationMatches : candidates.length === 1 ? candidates : [])
    if (!matching.length) return plan
    matching.forEach((item) => matchedCalendarIds.add(item.id))
    const first = matching[0]
    const sameDate = matching.find((item) => item.date === plan.date)
    return { ...plan, time: plan.time || (sameDate?.time && sameDate.time !== '00:00' ? sameDate.time : ''), location: plan.location || first.location || '', notes: first.notes || plan.notes || '' }
  })
  const normalizeCalendarText = (value) => String(value || '').toLocaleLowerCase('sv-SE').replace(/[^a-zåäö0-9]+/g, ' ').trim()
  // If the plan already contains the detailed/processed SportAdmin text,
  // suppress the raw calendar copy of the same message.
  calendarRows.forEach((item) => {
    const rawText = normalizeCalendarText(item.notes)
    if (rawText.length < 120) return
    const duplicate = planningRows.find((plan) => {
      const groupsOverlap = !plan.targetGroups?.length || !item.targetGroups?.length || item.targetGroups.some((group) => plan.targetGroups.includes(group))
      const planText = normalizeCalendarText(plan.notes)
      return plan.date === item.date && groupsOverlap && planText.length >= 120 && (planText.slice(0, 100) === rawText.slice(0, 100) || planText.includes(rawText.slice(0, 100)) || rawText.includes(planText.slice(0, 100)))
    })
    if (duplicate) matchedCalendarIds.add(item.id)
  })
  const visiblePlans = [...mergedPlans, ...calendarRows.filter((item) => !matchedCalendarIds.has(item.id))].sort((a, b) => a.date.localeCompare(b.date) || String(a.time || '').localeCompare(String(b.time || '')))
  const weekLabel = `${selectedStart.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}–${new Date(selectedEnd.getTime() - 1).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}`
  const groupLabels = { ungdom_orange: 'Orange', ungdom_svart: 'Svart', junior: 'Junior' }
  const activityLabels = { swim: ['🏊', 'Simning'], strength: ['🏋️', 'Styrka'], dryland: ['🤸', 'Landträning'], sportadmin: ['📅', 'Kalender'], competition: ['🏆', 'Tävling'] }
  const currentDate = todayKey()
  const swimmerPlanningMeters = amountRangeLabel(planningAmountRange(visiblePlans, 'distanceMeters'))
  const swimmerPlanningMinutes = amountRangeLabel(planningAmountRange(visiblePlans, 'durationMinutes'))
  const cleanSwimmerCompetitionPm = (value) => String(value || '').replace(/\r\n?/g, '\n').split('\n').filter((line) => !/^\s*(?:egen\s*avgift|anmälningsavgift|kostnad)\s*:/i.test(line) && !/\bergenavgift\b/i.test(line)).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  const competitionInfoFor = (plan) => {
    const sameEvent = (item) => {
      const titleMatch = item.title && plan.title && (item.title === plan.title || item.title.includes(plan.title) || plan.title.includes(item.title))
      const locationMatch = item.location && plan.location && (item.location === plan.location || item.location.includes(plan.location) || plan.location.includes(item.location))
      return titleMatch || locationMatch
    }
    const notes = [plan.notes, ...sportAdminActivities.filter((item) => (item.date === plan.date || (plan.activityType === 'competition' && sameEvent(item))).length).map((item) => item.notes)].filter(Boolean)
    return cleanSwimmerCompetitionPm(notes.join('\n\n'))
  }
  useEffect(() => {
    document.querySelectorAll('.swimmer-planning-list article').forEach((card) => {
      const date = card.querySelector('.eyebrow')?.textContent?.trim().slice(0, 10) || ''
      card.classList.toggle('planning-past', /^\d{4}-\d{2}-\d{2}$/.test(date) && date < currentDate)
      card.classList.toggle('planning-today', date === currentDate)
    })
    const list = document.querySelector('.swimmer-planning-list')
    if (list) {
      list.querySelectorAll('.planning-day-heading').forEach((heading) => heading.remove())
      let lastDate = ''
      Array.from(list.children).filter((card) => card.matches('article, .swim-occasion')).forEach((card) => {
        const date = card.querySelector('.eyebrow')?.textContent?.trim().slice(0, 10) || ''
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date === lastDate) return
        lastDate = date
        const value = new Date(`${date}T12:00:00`)
        const heading = document.createElement('div')
        heading.className = `planning-day-heading${date < currentDate ? ' planning-past' : date === currentDate ? ' planning-today' : ''}`
        heading.innerHTML = `<strong>${value.toLocaleDateString('sv-SE', { weekday: 'long' })}</strong><small>${value.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })}${date === currentDate ? ' · Idag' : ''}</small>`
        list.insertBefore(heading, card)
      })
    }
    const controls = document.querySelector('.swimmer-planning-week-controls')
    const container = controls?.parentElement
    if (controls && container) {
      let summary = container.querySelector('.swimmer-planning-summary')
      if (!summary) {
        summary = document.createElement('div')
        summary.className = 'swimmer-planning-summary'
        controls.insertAdjacentElement('afterend', summary)
      }
      summary.innerHTML = `<div><strong>${swimmerPlanningMeters ? swimmerPlanningMeters.toLocaleString('sv-SE') : '–'}</strong><span>simmetrar</span></div><div><strong>${swimmerPlanningMinutes || '–'}</strong><span>minuter</span></div><div><strong>${groupSwimOccasions(visiblePlans).length}</strong><span>träningstillfällen / aktiviteter</span></div>`
    }
  }, [visiblePlans.length, sportAdminActivities.length, swimmerPlanningMeters, swimmerPlanningMinutes, currentDate, weekOffset])
  return <section className="swimmer-planning"><button className="back-button inline" onClick={onBack}>← Tillbaka</button><div className="period-heading"><div><p className="eyebrow">Planering</p><h1>{weekOffset === 0 ? 'Den här veckan' : weekOffset === -1 ? 'Förra veckan' : weekOffset === 1 ? 'Nästa vecka' : 'Veckoplanering'}</h1><small>Planerade aktiviteter och kalenderhändelser för din grupp.</small></div></div><div className="swimmer-planning-week-controls"><button type="button" className="secondary-button" onClick={() => setWeekOffset((value) => value - 1)}>← Förra veckan</button><strong>{weekLabel}</strong><button type="button" className="secondary-button" onClick={() => setWeekOffset((value) => value + 1)}>Nästa vecka →</button></div>{loading ? <div className="swimmer-planning-loading" role="status"><span aria-hidden="true">〰</span><strong>Hämtar din veckoplanering…</strong><small>Vi laddar pass, aktiviteter och kalenderhändelser.</small></div> : visiblePlans.length ? <div className="swimmer-planning-list">{groupSwimOccasions(visiblePlans).map((occasion) => <SwimOccasion key={occasion.key} occasion={occasion}>{occasion.items.map((plan) => { const requiresCheckIn = plan.date === todayKey() && plan.activityType === 'swim' && Boolean(plan.sourceWorkoutId) && todayWorkoutAccess.locked; const activity = activityLabels[plan.activityType] || ['•', 'Aktivitet']; const competitionInfo = !requiresCheckIn && (plan.activityType === 'competition' || plan.source === 'SportAdmin' || plan.activityType === 'sportadmin') ? competitionInfoFor(plan) : ''; const metadata = <><div className="workout-library-stats">{plan.time && plan.time !== '00:00' && <span>⏰ {plan.time}</span>}{plan.distanceMeters && <span>{Number(plan.distanceMeters).toLocaleString('sv-SE')} m</span>}{plan.durationMinutes && <span>{plan.durationMinutes} min</span>}{plan.location && <span>{plan.location}</span>}</div>{plan.targetGroups?.length > 0 && <div className="planning-group-pills">{plan.targetGroups.map((group) => <span className="planning-type" key={group}>{groupLabels[group] || group}</span>)}</div>}</>; return <article key={plan.id} className={`${plan.source === 'SportAdmin' ? 'calendar-planning-item ' : ''}${requiresCheckIn ? 'planning-locked-item' : ''}`}><p className="eyebrow">{plan.date}</p><div className="swimmer-planning-title"><span className="planning-type">{activity[0]} {activity[1]}</span><h2>{plan.title}</h2></div>{plan.focus && <span className="workout-focus-pill">{plan.focus}</span>}{metadata}{requiresCheckIn ? <div className="planning-checkin-lock"><strong>🔒 Checka in för att se passets upplägg</strong><small>Rubrik, fokus och träningsmängd är synliga. Serier och tränarens instruktioner låses upp efter dagens check-in.</small></div> : competitionInfo ? <details className="swimmer-planning-pm"><summary>{plan.activityType === 'competition' ? '📄 Tävlingsinformation' : '📅 Information från SportAdmin'} <span>Visa</span></summary><div>{competitionInfo.split('\n').map((line, index) => <React.Fragment key={`${plan.id}-info-${index}`}>{index ? <br /> : null}{line}</React.Fragment>)}</div></details> : plan.source !== 'SportAdmin' && <small>{plan.notes}</small>}</article> })}</SwimOccasion>)}</div> : <p className="empty">Ingen planering publicerad för den här veckan.</p>}</section>
}

function SwimmerCompetitionEntries({ code, onBack }) {
  const [competitions, setCompetitions] = useState([])
  const [selectedCompetition, setSelectedCompetition] = useState(null)
  const [events, setEvents] = useState([])
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { apiRequest('/api/workouts?calendar=true', code).then((data) => { const current = (data.competitions || []).filter((item) => (item.endDate || item.startDate) >= todayKey()); setCompetitions(current); if (current[0]) setSelectedCompetition(current[0].id) }).catch((error) => setError(error.message)).finally(() => setLoading(false)) }, [code])
  useEffect(() => {
    if (!selectedCompetition) return
    let active = true
    setLoading(true); setEvents([]); setSelected([]); setStatus(''); setError('')
    apiRequest(`/api/workouts?program=true&id=${selectedCompetition}`, code)
      .then((data) => { if (active) { setEvents(data.events || []); setSelected((data.entries || []).map((entry) => entry.eventId || entry.event_id)) } })
      .catch((error) => { if (active) setError(error.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [code, selectedCompetition])
  const save = async (submit) => { if (savingRef.current || !selectedCompetition || loading || !competitions.find((item) => item.id === selectedCompetition)?.entriesOpen) return; savingRef.current = true; setSaving(true); setStatus(''); setError(''); try { await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: submit ? 'submit-competition-entries' : 'save-competition-entry', competitionId: selectedCompetition, eventIds: selected }) }); setStatus(submit ? '✓ Dina grenar är skickade till tränarna.' : '✓ Utkastet är sparat.') } catch (error) { setError(error.message) } finally { savingRef.current = false; setSaving(false) } }
  const competition = competitions.find((item) => item.id === selectedCompetition)
  return <section className="competition-entries"><button className="back-button inline" disabled={saving} onClick={onBack}>← Tillbaka</button><div className="period-heading"><div><p className="eyebrow">Tävlingskalender</p><h1>Mina grenar</h1><small>Välj vilka grenar du vill simma. Tränarna ser när du skickar in.</small></div></div>{loading && <p className="empty">Hämtar tävlingsprogram…</p>}{!loading && !error && !competitions.length && <p className="empty">Ingen kommande tävling är publicerad ännu.</p>}{error && <p role="alert" className="form-error">{error}</p>}{status && <p role="status" className="competition-feedback">{status}</p>}{competition && <><label className="settings-field"><strong>Tävling</strong><select disabled={saving} value={selectedCompetition} onChange={(event) => setSelectedCompetition(event.target.value)}>{competitions.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.startDate}</option>)}</select></label><CompetitionPm key={competition.id} competition={competition} code={code} request={apiRequest} />{!competition.entriesOpen && <p className="competition-feedback">Grenanmälan är inte öppen. Du kan läsa tävlings-PM under tiden.</p>}<fieldset className="competition-entry-fields" disabled={loading || saving || !competition.entriesOpen}>{events.length ? <div className="competition-entry-list">{events.map((event) => <label key={event.id} className={event.selectable === false ? 'competition-info-row' : ''}><input type="checkbox" disabled={event.selectable === false} checked={event.selectable !== false && selected.includes(event.id)} onChange={() => event.selectable !== false && setSelected((current) => current.includes(event.id) ? current.filter((id) => id !== event.id) : [...current, event.id])} /><span><strong>{event.eventNumber ? `${event.eventNumber} · ` : ''}{event.label}</strong><small>{event.gender || 'Alla'} · {event.ageClass || 'Klass ej angiven – se PM'}</small></span></label>)}</div> : !loading && !error ? <p className="empty">Tränaren har inte läst in något grenprogram ännu.</p> : null}<div className="settings-actions"><button className="secondary-button" disabled={saving} onClick={() => save(false)}>{saving ? 'Sparar…' : 'Spara utkast'}</button><button className="primary-button" disabled={saving || !selected.length} onClick={() => save(true)}>{saving ? 'Sparar…' : 'Skicka till tränarna'}</button></div></fieldset></>}</section>
}

function SwimmerMenuIcon({ kind }) {
  const paths = {
    calendar: 'M8 3v4m8-4v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z',
    heart: 'M12 20 4 12a5 5 0 0 1 8-6 5 5 0 0 1 8 6Z',
    goal: 'M20 12a8 8 0 1 1-8-8m0 4a4 4 0 1 0 4 4m-4 0 8-8m-5 0h5v5',
    help: 'M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
    info: 'M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  }
  return <svg className="swimmer-menu-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[kind]} /></svg>
}

function Shell({ children, code, role, profile, coachMode = false, onSwitchToCoach, assistantEnabled = true, talksEnabled, planningEnabled, onPlanning, onDiary, onStrengthProgram, onDrylandProgram, onCompetitions, onCommunity, onGoals, onTalk, onHelp, onLegal, onProfile, onGame, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  useEffect(() => {
    if (!menuOpen) return
    const close = (event) => { if (event.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [menuOpen])
  const go = (handler) => () => { setMenuOpen(false); handler() }
  return (
    <main className="app-shell">
      <header>
        <ClubBrand assistantEnabled={assistantEnabled} onAssistant={assistantEnabled ? () => setAssistantOpen(true) : undefined} />
        <button className="mobile-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="swimmer-navigation" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? 'Stäng' : 'Meny'} <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span></button>
        <nav id="swimmer-navigation" aria-label="Simmarmeny" className={`header-actions ${menuOpen ? 'open' : ''}`}>
          {profile && planningEnabled && <button type="button" className="menu-link" onClick={go(onPlanning)}><SwimmerMenuIcon kind="calendar" /><span>Veckoplanering</span></button>}
          {profile && <button type="button" className="menu-link" onClick={go(onDiary)}><SwimmerMenuIcon kind="calendar" /><span>Min träningsdagbok</span></button>}
          {profile && <button type="button" className="menu-link" onClick={go(onStrengthProgram)}><SwimmerMenuIcon kind="goal" /><span>Mitt styrkeprogram</span></button>}
          {profile && <button type="button" className="menu-link" onClick={go(onDrylandProgram)}><SwimmerMenuIcon kind="goal" /><span>Mina landträningsprogram</span></button>}
          {profile && <button type="button" className="menu-link" onClick={go(onCompetitions)}><SwimmerMenuIcon kind="calendar" /><span>Mina grenar</span></button>}
          {profile && <button type="button" className="menu-link" onClick={go(onCommunity)}><SwimmerMenuIcon kind="heart" /><span>Peppflödet</span></button>}
          {profile && <button type="button" className="menu-link" onClick={go(onGoals)}><SwimmerMenuIcon kind="goal" /><span>Mina mål</span></button>}
          <button type="button" className="menu-link" onClick={go(onHelp)}><SwimmerMenuIcon kind="help" /><span>FAQ</span></button>
          <button type="button" className="menu-link swimmer-menu-legal" onClick={go(onLegal)}><SwimmerMenuIcon kind="info" /><span>Info & villkor</span></button>
          {profile && <button type="button" className="profile-chip" onClick={go(onProfile)}><span className="swimmer-profile-emoji" aria-hidden="true">{profile.emoji}</span><span className="swimmer-profile-label"><strong>{profile.displayName}</strong><small>Min profil</small></span><span className="swimmer-profile-arrow" aria-hidden="true">→</span></button>}
          {!profile && <button type="button" className="text-button" onClick={go(onLogout)}>Logga ut</button>}
        </nav>
      </header>
      {coachMode && <aside className="coach-swimmer-mode-banner"><span>Du använder din egen simmarvy{profile?.displayName ? ` · ${profile.displayName}` : ''}</span><button type="button" onClick={onSwitchToCoach}>Tillbaka till tränarvyn</button></aside>}
      {assistantOpen && <Assistant code={code} role={role} profile={profile} onClose={() => setAssistantOpen(false)} />}
      {children}
    </main>
  )
}

function Assistant({ code, role, profile, onClose }) {
  const historyKey = `simkoll-assistant-history:${role}:${code}:${profile?.id || 'coach'}`
  const [messages, setMessages] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(historyKey) || 'null')
      return Array.isArray(saved) && saved.length ? saved : [{ from: 'assistant', text: 'Hej! Jag kan hjälpa dig att hitta information i Simkoll. Vad vill du veta?' }]
    } catch { return [{ from: 'assistant', text: 'Hej! Jag kan hjälpa dig att hitta information i Simkoll. Vad vill du veta?' }] }
  })
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const messagesRef = useRef(null)
  useEffect(() => { try { window.localStorage.setItem(historyKey, JSON.stringify(messages.slice(-40))) } catch {} }, [historyKey, messages])
  useEffect(() => { const node = messagesRef.current; if (!node) return; window.requestAnimationFrame(() => { node.scrollTop = node.scrollHeight }) }, [messages, loading])
  const clearHistory = () => { if (!window.confirm('Rensa assistentens chatthistorik på den här enheten?')) return; try { window.localStorage.removeItem(historyKey) } catch {}; setMessages([{ from: 'assistant', text: 'Historiken är rensad. Vad vill du veta?' }]) }
  const ask = async (text = question) => {
    const value = String(text || '').trim(); if (!value || loading) return
    const quickIntro = /^(vad är|vad ar|berätta om|beratta om)\s+simkoll\??$/i.test(value)
    setMessages((current) => [...current, { from: 'user', text: value }]); setQuestion('')
    if (quickIntro) {
      setMessages((current) => [...current, { from: 'assistant', text: 'Simkoll är som en digital träningsdagbok där du står i fokus. Du kan följa dina pass och mål, checka in hur träningen känns, se din närvaro och utveckling samt få uppmuntran från tränarna. Appen hjälper dig att reflektera och följa din träning – den ersätter inte samtal med tränare eller vårdnadshavare.' }])
      return
    }
    setLoading(true)
    try { const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'assistant-chat', question: value, history: messages.slice(-10) }) }); setMessages((current) => [...current, { from: 'assistant', text: data.text || data.error || 'Jag kunde inte hitta ett svar.' }]) } catch (error) { setMessages((current) => [...current, { from: 'assistant', text: error.message }]) } finally { setLoading(false) }
  }
  const stopRecording = () => { recorderRef.current?.stop(); setRecording(false) }
  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return window.alert('Röstinspelning stöds inte på den här enheten.')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const recorder = new MediaRecorder(stream); chunksRef.current = []; recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data) }; recorder.onstop = () => { stream.getTracks().forEach((track) => track.stop()); const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }); const reader = new FileReader(); reader.onload = async () => { setLoading(true); try { const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'assistant-transcribe', dataUrl: reader.result, mimeType: blob.type }) }); if (data.text) { setQuestion(data.text); } else throw new Error(data.error || 'Transkriberingen kunde inte genomföras.') } catch (error) { setMessages((current) => [...current, { from: 'assistant', text: error.message }]) } finally { setLoading(false) } }; reader.readAsDataURL(blob) }; recorderRef.current = recorder; recorder.start(); setRecording(true)
    } catch { window.alert('Mikrofonen kunde inte startas.') }
  }
return <div className="assistant-overlay" role="dialog" aria-modal="true" aria-label="Simkoll-assistenten"><section className="assistant-panel"><header><div><span className="assistant-avatar" aria-hidden="true">🦉</span><div><strong>Simkoll-assistenten</strong><small>{role === 'coach' ? 'Tränarstöd' : 'Ditt Simkoll-stöd'}</small></div></div><div className="assistant-header-actions"><button type="button" className="text-button" onClick={clearHistory}>Rensa historik</button><button type="button" className="text-button" onClick={onClose}>Stäng ×</button></div></header><div className="assistant-messages" ref={messagesRef}>{messages.map((message, index) => <p key={`${index}-${message.from}`} className={message.from}>{message.text}</p>)}{loading && <p className="assistant assistant-thinking">Tänker…</p>}</div><div className="assistant-suggestions"><button type="button" onClick={() => ask('Vad är Simkoll?')}>Vad är Simkoll?</button>{role === 'swimmer' && <><button type="button" onClick={() => ask('Vilka grenar har jag valt till tävling?')}>Mina tävlingsgrenar</button><button type="button" onClick={() => ask('Vad innehåller mitt utvecklingssamtal?')}>Utvecklingssamtal</button><button type="button" onClick={() => ask('Vad har tränarna skickat för information senast?')}>Tränarinfo</button><button type="button" onClick={() => ask('Hur fungerar assistenten och vilka uppgifter använder den?')}>AI och mina uppgifter</button></>}<button type="button" onClick={() => ask('När är nästa träningspass?')}>Nästa pass</button><button type="button" onClick={() => ask('Vad är planerat den här veckan?')}>Veckan</button><button type="button" onClick={() => ask('Vilka är mina personbästa?')}>Personbästa</button></div><div className="assistant-input"><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Skriv en fråga…" rows={2} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask() } }} /><button type="button" className={recording ? 'recording-button' : 'secondary-button'} onClick={recording ? stopRecording : startRecording}>{recording ? '⏹' : '🎙️'}</button><button type="button" className="primary-button" onClick={() => ask()} disabled={loading || !question.trim()}>Skicka</button></div><small className="assistant-disclaimer">Svar hämtas från Simkolls information och tillgängliga uppgifter. Kontrollera alltid viktiga besked.</small></section></div>
}

function ClubBrand({ onAssistant, assistantEnabled = true }) {
  return (
    <button type="button" className={`club-brand${assistantEnabled ? '' : ' assistant-disabled'}`} onClick={assistantEnabled ? (onAssistant || (() => window.dispatchEvent(new Event('simkoll-assistant-open')))) : undefined} aria-label={assistantEnabled ? 'Öppna Simkoll-assistenten' : 'Simkoll-assistenten är avstängd'}>
      <Logo compact />
      <span>Sundsvalls Simsällskap</span>
    </button>
  )
}

function SwimmerSpecialtyEditor({ profile, code, onSaved }) {
  const [primary, setPrimary] = useState(profile.primaryStroke || '')
  const [secondary, setSecondary] = useState(profile.secondaryStroke || '')
  const [status, setStatus] = useState('')
  useEffect(() => { setPrimary(profile.primaryStroke || ''); setSecondary(profile.secondaryStroke || '') }, [profile.id, profile.primaryStroke, profile.secondaryStroke])
  const save = async (event) => {
    event.preventDefault(); setStatus('Sparar…')
    try {
      const data = await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-specialties', profileId: profile.id, primaryStroke: primary || null, secondaryStroke: secondary || null }) })
      onSaved(data.profile); setStatus('Sparat ✓')
    } catch (error) { setStatus(error.message || 'Kunde inte spara simsätt.') }
  }
  return <form className="swimmer-specialty-editor" onSubmit={save}><div><strong>Simsätt</strong><small>Tränarens bedömning av specialinriktning</small></div><div className="specialty-selects"><label>Primärt<select value={primary} onChange={(event) => setPrimary(event.target.value)}><option value="">Välj</option>{STROKE_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Sekundärt<select value={secondary} onChange={(event) => setSecondary(event.target.value)}><option value="">Välj</option>{STROKE_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><button type="submit">Spara</button></div>{status && <small>{status}</small>}</form>
}

function Logo({ compact = false }) {
  return (
    <div className={`logo ${compact ? 'compact' : ''}`}>
      <span className="logo-mark">≈</span>
      <span>SIMKOLL</span>
    </div>
  )
}

const HELP_TEXT = {
  'Simmarens riktning': 'Jämför simmarens känsla och kropp med föregående lika långa period. Minst tre dagar med giltiga värden behövs i båda perioderna. Varje dag väger lika. ↗ förbättring, → stabilt, ↘ minskning, ↕ blandat. Gränsen är 0,2 på skalan 1–5. Detta är inte ett mått på tävlingsprestation.',
  'Simmarens kontinuitet': 'Registrerade simpass per vecka för den valda simmaren jämförs med föregående period. Skillnader under 0,15 pass per vecka visas som stabila. Samma datum och passdel räknas en gång. Mer träning är inte automatiskt bättre.',
  'Känsla': 'Hur dagen känns överlag just nu. Det finns inget rätt eller fel svar.',
  'Energi': 'Hur pigg eller trött simmaren känner sig.',
  'Kroppen': 'Hur fräsch, tung eller öm kroppen upplevs.',
  'Motivation': 'Hur sugen eller redo simmaren känner sig inför träningen.',
  'Sömn': 'Den egna upplevelsen av nattens sömn, inte antalet timmar.',
  'RPE': 'Upplevd ansträngning för hela passet: 1 är mycket lätt och 10 är maximalt.',
  'sRPE': 'Total upplevd belastning för ett pass: RPE × passets längd i minuter. Exempel: RPE 6 × 75 minuter = 450 belastningsenheter. Används för att följa trender, inte som en exakt medicinsk mätning.',
  'Passet': 'Upplevelsen av passet, inte ett betyg på den egna prestationen.',
  'Upplägget': 'Om passets innehåll och struktur fungerade för simmaren.',
  'Aktiva dagar': 'Dagar då profilen har använt en profilfunktion i Simkoll.',
  'Registrerade pass': 'Pass som simmaren aktivt valt att lägga till i sin veckoräknare.',
  'Poäng och nivå': 'Visar aktivitet och positiva bidrag i Simkoll, inte simförmåga.',
  'Trend': 'Ett mönster över flera svar. En enstaka skattning ska inte övertolkas.',
  'Gruppens riktning': 'Sammanfattar förändringen i gruppens skattade känsla och kropp jämfört med föregående lika långa period. ↗ betyder förbättring, → stabilt, ↘ minskning och ↕ blandad utveckling. Minst 0,2 på skalan 1–5 krävs för att pilen ska ändra riktning.',
  'Förändring i känsla': 'Visar hur gruppens genomsnittliga känsla har förändrats på skalan 1–5. Varje dag väger lika. Exempel: +0,3 betyder att känslan i snitt är 0,3 högre än under föregående lika långa period.',
  'Simmarens förändring i känsla': 'Visar hur den valda simmarens känsla har förändrats på skalan 1–5. Varje aktivitetsdag väger lika. +0,3 betyder 0,3 högre dagsgenomsnitt än föregående lika långa period. Minst tre dagar med giltiga värden krävs i båda perioderna.',
  'Förändring i kroppen': 'Visar hur gruppens genomsnittliga kroppskänsla har förändrats på skalan 1–5. Ett högre värde betyder att kroppen i genomsnitt upplevts fräschare.',
  'Simmarens förändring i kroppen': 'Visar hur den valda simmarens kroppskänsla har förändrats på skalan 1–5. Varje aktivitetsdag väger lika. Högre värde betyder att kroppen upplevts fräschare, inte bevisad prestationsförbättring. Minst tre dagar med giltiga värden krävs i båda perioderna.',
  'Gruppens kontinuitet': 'Jämför registrerade simpass per simmare och vecka med föregående lika långa period. Samma simmargrupp används i båda perioderna. Skillnader under 0,15 pass per simmare och vecka visas som stabila.',
  'Simmeter i Grupptrend': 'Visar summan av gruppens planerade simmeter per vecka, hämtad från träningsplaneringen. Det är planerad distans, inte en mätning av faktiskt simmade meter. Förändringar inom ±5 % visas som stabila. Mer meter betyder ökad planerad mängd, inte automatiskt bättre utveckling.',
  'Total träningstid i Grupptrend': 'Summerar gruppens planerade minuter per vecka för simning, styrketräning och landträning. Det är tidsåtgången i planeringen, inte uppmätt faktisk tid. Förändringar inom ±5 % visas som stabila.',
  'Träningstidens uppdelning': 'Visar gruppens planerade träningstid per vecka, uppdelad på simning, styrketräning och landträning. Det är en uppskattning från planeringen, inte uppmätt faktisk tid.',
  'Personlig AI-analys': 'En sparad, tränarskapad sammanfattning av dina egna träningsdata. Den är ett samtalsstöd – inte en diagnos eller ett automatiskt betyg.',
  'Träningsstjärnor': 'Fyra stjärnor visar olika träningsvanor. 1) Veckan planerad: minst tre träningsdagar är planerade i Min träning den här veckan. 2) Styrka och landträning: båda målen är överenskomna och aktiva. 3) Simmål satt: ett aktivt mål för antal simpass per vecka finns. 4) Följer min simplan: under de fyra senaste avslutade veckorna har alla simpass enligt överenskommelsen genomförts, till exempel 18 av 20 = 90 %. En stjärna tänds först vid 100 %. Grå stjärna betyder att villkoret inte är uppfyllt ännu. Varje stjärna ger 1 poäng när den låses upp; poäng tas inte bort om en stjärna senare blir grå.',
  'Aktiva profiler': 'Antal simmarprofiler som använde en profilfunktion under perioden. Testprofiler räknas inte.',
  'Incheckningar': 'Antal svar som skickats in under perioden. En incheckning är inte automatiskt samma sak som ett genomfört pass.',
  'Registrerad träning': 'Pass som lagts till i träningsloggen, inklusive simpass som skapats från en genomförd check-in eller tränarens närvaroregistrering.',
  'Erbjudna simmeter': 'Summan av meter i planerade eller publicerade simpass under perioden. Det beskriver erbjuden träningsmängd, inte vad varje simmare genomförde.',
  'Närvaro mot mål': 'Genomförda simpass jämförs med summan av simmarnas överenskomna simmål för samma period. Simmare utan simmål ingår inte i procenten. Extra pass syns som över 100 %, till exempel 5 av 4 pass = 125 %.',
  'Pepp i gruppen': 'Antal peppmeddelanden som skickats i gruppen under perioden.',
  'Personbästa': 'Antal nya personbästa från Tempus som registrerats under perioden.',
}

const FAQ_SCALES = {
  'Känsla': [['1', 'Mycket tung dag'], ['2', 'Ganska tungt'], ['3', 'Okej / neutralt'], ['4', 'Bra'], ['5', 'Toppen']],
  'Energi': [['1', 'Ingen energi'], ['2', 'Ganska trött'], ['3', 'Normal energi'], ['4', 'Pigg'], ['5', 'Full fart']],
  'Kroppen': [['1', 'Mycket tung, öm eller något känns inte bra'], ['2', 'Ganska tung eller sliten'], ['3', 'Som vanligt'], ['4', 'Pigg och fräsch'], ['5', 'Väldigt fräsch och redo']],
  'Motivation': [['1', 'Inte alls taggad'], ['2', 'Lite omotiverad'], ['3', 'Neutral'], ['4', 'Taggad'], ['5', 'Väldigt taggad']],
  'Sömn': [['1', 'Mycket dålig'], ['2', 'Ganska dålig'], ['3', 'Okej'], ['4', 'Bra'], ['5', 'Jättebra']],
  'RPE': [['1–2', 'Mycket lätt'], ['3–4', 'Lätt'], ['5–6', 'Medel'], ['7–8', 'Jobbigt'], ['9–10', 'Mycket jobbigt / max']],
  'Passet': [['1', 'Inte bra'], ['3', 'Helt okej'], ['5', 'Bra']],
  'Upplägget': [['1', 'Fungerade inte bra'], ['3', 'Fungerade okej'], ['5', 'Fungerade bra']],
}

const TEMPERATURE_LABELS = ['Väldigt kallt', 'Kallt', 'Perfekt', 'Varmt', 'För varmt']

function HelpTip({ term }) {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState('left')
  const tipRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const updatePlacement = () => {
      const rect = tipRef.current?.getBoundingClientRect()
      if (!rect) return
      const popupWidth = Math.min(280, Math.max(180, window.innerWidth - 24))
      setPlacement(rect.left + popupWidth > window.innerWidth - 12 ? 'right' : 'left')
    }
    const close = (event) => { if (!tipRef.current?.contains(event.target)) setOpen(false) }
    updatePlacement()
    document.addEventListener('pointerdown', close)
    window.addEventListener('resize', updatePlacement)
    return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('resize', updatePlacement) }
  }, [open])
  if (!HELP_TEXT[term]) return null
  return <span className={`help-tip-wrap help-tip-wrap-${placement}`} ref={tipRef} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocusCapture={() => setOpen(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}><button type="button" className="help-tip" aria-label={`${term}: ${HELP_TEXT[term]}`} aria-expanded={open} onClick={() => setOpen(true)} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }}>i</button>{open && <span className="help-tip-popover" role="tooltip"><strong>{term}</strong><span>{HELP_TEXT[term]}</span></span>}</span>
}

function Faq({ role, onBack }) {
  return <div className="faq-page">
    {onBack && <button className="back-button" onClick={onBack}>← Tillbaka</button>}
    <section className="faq-content">
      <p className="eyebrow">Simkoll</p><h1>Vad betyder det?</h1>
      <p className="faq-intro">Här finns en uppdaterad guide till funktionerna. Svaren beskriver simmarens egen upplevelse och är ett stöd för träning, planering och samtal – inte ett prov eller en medicinsk bedömning.</p>
      <section className="faq-install"><p className="eyebrow">Gör Simkoll lätt att hitta</p><h2>Lägg till på hemskärmen</h2><p>En genväg gör det enklare att öppna rätt sida och använda din sparade profil.</p><details><summary>iPhone eller iPad<span>+</span></summary><ol><li>Öppna Simkoll i Safari.</li><li>Tryck på dela-symbolen.</li><li>Välj <strong>Lägg till på hemskärmen</strong>.</li><li>Tryck <strong>Lägg till</strong>.</li></ol></details><details><summary>Android<span>+</span></summary><ol><li>Öppna Simkoll i Chrome.</li><li>Tryck på de tre prickarna.</li><li>Välj <strong>Lägg till på startskärmen</strong> eller <strong>Installera app</strong>.</li><li>Bekräfta.</li></ol></details><small>Webbläsaren måste alltid fråga dig först — Simkoll kan inte skapa genvägen automatiskt.</small></section>
      <div className="faq-list">
        {role === 'coach' && <details><summary>Meddelanden i toppmenyn<span>+</span></summary><p>Öppna pratbubblan bredvid Grupper högst upp i tränarvyn. Den röda siffran visar nya privata meddelanden till tränarna och simmarnas meddelanden i Info från tränarna sedan meddelandevyn senast öppnades på denna enhet. Räknaren gäller hela klubben, inte bara valda grupper. Markeringen nollställs när du öppnar meddelandevyn; det är ingen individuell läskvittens. På mobil visas en kompakt ikon, på dator även texten Meddelanden. Nya antal hämtas ungefär var 15:e sekund när appen är synlig. Meddelanden finns även i tränarmenyn men inte längre som en extra översiktsflik.</p></details>}
        {role === 'coach' && <details><summary>Variation i AI-passförslag<span>+</span></summary><p>I Lägg upp ett pass → Skapa passförslag kan du dra reglaget från Mer från biblioteket till Mer nytänkande. Fem lägen finns: Biblioteksnära, Försiktig variation, Balanserat (förvalt), Mer variation och Nytänkande. Samma språkmodell används i alla lägen. Reglaget styr hur mycket upplägget får förändras, inte hur mycket träning simmaren ska göra.</p><p>Inriktning, distans, tid, mål-RPE och gruppval ligger kvar som ramar. Att flytta reglaget kostar inga AI-anrop. När du skapar förslaget skickas upp till åtta bibliotekspass med aggregerade betyg/RPE och dina val till OpenAI. Biblioteksreferenser och nytt/anpassat visas när utkastet är klart. Kontrollera alltid mängd, intervall och nivå innan du sparar. Ingenting publiceras automatiskt.</p></details>}
        <details><summary>Landträningsprogram<span>+</span></summary><p>Öppna Mina landträningsprogram i simmarmenyn eller ditt tilldelade program på startsidan. Välj ett pass, läs övningar och instruktioner och markera vad du genomfört. Resultat som repetitioner, sekunder och sträcka samt kommentar är valfria. Bekräfta genomförd landträning och tryck Spara landpass och resultat. Tidigare resultat visas som stöd, inte som krav att göra mer.</p><p>Landträning räknas mot landträningsmålet, separat från styrka och simning. Programmet och veckoplaneringen ger tillsammans högst en landträningsregistrering per dag. Resultaten finns i träningsdagboken. Om du avmarkerar genomfört i planeringen finns resultaten kvar, men de återställer inte dagen automatiskt.</p>{role === 'coach' && <p>Tränarmenyn → Landträningsprogram har samma bibliotek, övningsbilder, import och tilldelningsflöde som styrkeprogrammen. Huvudtränare och superadmin kan skapa, importera och redigera; vanliga aktiva tränare kan tilldela färdiga program individuellt eller till flera simmare. Styrkeprogrammet påverkas inte. Historiken visas i programmets uppföljning och på simmarkortet. Import med AI kräver granskning före sparande. Funktionen behöver SQL 111.</p>}</details>
        {role === 'coach' && <details><summary>Lagring och historik<span>+</span></summary><p>Superadmin öppnar Lagring och historik i tränarmenyn. Databasen visas separat från bilder, filmer och dokument i projektets fillagring. Budgetgränserna anges manuellt i GB och är egna riktvärden, inte avlästa abonnemangsgränser. Kvar avser kvar till angiven budget; om budget eller filstorlek saknas visas det tydligt. Gul varning visas vid 80 % och röd vid 90 %. Ingen automatisk radering eller blockering av uppladdningar sker.</p><p>En mätpunkt sparas dagligen från aktivering. Uppdatera och spara mätpunkt hämtar nya värden och uppdaterar dagens mätpunkt. Loggen visar nya serverhanterade filoperationer och budgetändringar, utan privata texter eller filinnehåll. Historiska lagringsnivåer och händelser kan inte återskapas. Detta är ingen faktureringsvy; verifiera faktisk kapacitet i Supabase Dashboard. Funktionen kräver SQL 110 och inga nya Vercel-variabler.</p></details>}
        <details><summary>Privata svar i Info från tränarna<span>+</span></summary><p>Tränaren kan klicka på simmarens meddelande för att skriva ett privat svar direkt under det i samma chattfönster. Svaret märks med 🔒 och syns för mottagaren och tränarna. Övriga simmare ser inte svaret. Simmaren kan läsa svaret i samma chatt och under sina privata meddelanden. Tränarens vanliga skrivfält längst ner skickar fortfarande till gruppen.</p><p>Tränaren kan skriva själv eller välja <strong>Föreslå svar med AI</strong>. Då skickas valt meddelande, tränarens eventuella utkast och relevant hjälp-, pass-, tävlings- och tränarinfo för simmarens grupp till OpenAI. Andra simmares privata svar, sömn och interna tränaranteckningar ingår inte. Förslaget visas separat med underlag och eventuella kontrollpunkter. Tränaren kan redigera, använda eller kasta förslaget. <strong>Använd förslaget</strong> ändrar bara svarstexten; svaret skickas först med <strong>Skicka privat</strong>. AI kan ha fel, särskilt när information saknas eller är gammal. Klubbens AI-inställning och tokenbudget gäller.</p></details>
        <details><summary>Sömnkoll och återhämtning<span>+</span></summary><p>Efter ”Hur känns det idag?” kan du vid profilkopplad check-in frivilligt ange ungefärlig sovtid (0–14 timmar i kvartsteg) och om sömnen var dålig, okej eller bra. Svaret sparas direkt när du trycker Spara och fortsätt och är synligt för tränarna. Natten hör till dagen efter; vid efterregistrering svarar du om natten inför gårdagen. Du får frågan högst en gång per aktivitetsdag på dina enheter, även om du checkar in flera gånger. Hoppa över idag tar också bort frågan resten av dagen. Anonym check-in innehåller ingen profilkopplad sömnkoll.</p><p>I Min träningsdagbok → Sömn och återhämtning kan du följa sovtid och sömnkänsla tillsammans med dagens känsla och RPE. Tränaren ser historiken i simmarkortet. I simmarkortet och Kontrollpanelen → Individuell uppföljning visas en sömnsignal vid minst två nätter med dålig sömn eller minst tre rapporterade nätter med ett snitt under sju timmar, under de senaste sju dagarna. Det är en påminnelse om att fråga hur simmaren mår, inte en medicinsk bedömning eller automatisk ändring av träningen. Saknade svar räknas inte som noll.</p><p>Sömnpilen följer bara upplevd sömnkvalitet. RPE och dagens känsla får finnas som jämförelse men påverkar inte pilen och behöver inte vara ifyllda. Vanlig veckotrend kräver minst tre sömnsvar i vardera sjudagarsperioden. Innan dess kan sju olika rapporterade nätter under de senaste 14 dagarna ge en preliminär korttidstrend, om minst tre ligger senaste veckan. De första tre och sista tre av de senaste sju nätterna jämförs; mittennatten ingår inte. När veckounderlag finns används det i stället. Sovtidens förändring visas separat – längre sömn räknas inte automatiskt som bättre.</p></details>
        <details><summary>Tävlings-PM, klasser och grenanmälan<span>+</span></summary><p>Under Meny → Mina grenar kan simmaren välja en kommande tävling för sin grupp och öppna original-PM:et, även innan grenanmälan har öppnats. Saknas klass i grenlistan betyder det att uppgiften inte är angiven där. Kontrollera PM och fråga tränaren vid oklarheter.</p>{role === 'coach' && <p>I Tävlingskalender kan du bifoga PM när du skapar tävlingen eller senare med Bifoga PM. PDF och bilder på högst 3 MB stöds. Bilagan finns kvar när du läser in eller ändrar det tolkade grenprogrammet. Redigera tävling ändrar grunduppgifterna. Granska och spara grenprogrammet innan du väljer Öppna grenanmälan för simmare. Att stänga anmälan tar inte bort tidigare val. Om tävlingen sparas men bilagan misslyckas visas det i formuläret, och nästa försök uppdaterar samma tävling.</p>}</details>
        <details><summary>Hur fungerar Min träningsdagbok?<span>+</span></summary><p>Öppna Meny → Min träningsdagbok eller genvägen i Min profil. Välj vecka, månad, termin eller egna datum. Du kan jämföra träning, kontinuitet, RPE och känsla med föregående lika långa period. Tryck på en kalenderdag och öppna ett pass för upplägg, fokus, simsätt i passtexten, kommentarer och tävlingsresultat när de finns.</p><p>Rapporterade simmeter och minuter visas separat från uppskattningar som kommer från kopplade pass. Saknade värden betyder inte noll. Tävling räknas separat från simträning, cykelkilometer blir inte simmeter och morgonpass hålls isär från eftermiddagspass. Efterregistrering visas på aktivitetsdagen.</p><p>Under passet kan du skriva Vad fungerade? och Vad vill jag ta med till nästa pass? Tryck på Spara reflektion. Dessa anteckningar visas i din egen dagbok och skapar varken träningspass eller poäng. Anonyma svar kan inte kopplas tillbaka till dagboken. Att läsa dagboken eller spara anteckningar gör inga AI-anrop. Graferna visar uppgifter och jämförelser, inte bevis på att träningen orsakat en viss utveckling. Utvecklingsmål skapas fortsatt av tränaren tillsammans med dig.</p></details>
        <details><summary>Hur får jag veta att jag fått ett nytt utvecklingsmål?<span>+</span></summary><p>När tränaren skapar ett mål i samråd med dig visas ett kort på startsidan och en händelse i notislistan. Har du aktiverat webnotiser för utvecklingsmål och samtal på din enhet kan du också få en pushnotis. Öppna kortet och läs målet under Meny → Mina mål. Då försvinner startkortet, men målet ligger kvar i din profil.</p><p>Du kan skriva ett privat svar på målet om du har frågor eller vill berätta hur det går. Tränarna ser svaret under Utvecklingsmål och kan svara där. Se det som ett underlag för ert samtal; du kan inte själv ändra tränarens mål. Undvik känsliga personuppgifter i fritext.</p></details>
        {role === 'coach' && <details><summary>Vilka svar ligger bakom korten under Idag?<span>+</span></summary><p>Klicka på Gruppens känsla, Upplevd ansträngning, Passet eller Upplägget för att se svaren bakom medelvärdet. Listan följer valt datum och gruppfilter och visar simmarens namn, värde, kommentar och när svaret skickades. Anonyma svar visas utan profilkoppling. Flera svar från samma simmare visas separat eftersom varje svar räknas i medelvärdet. Sök på namn eller kommentar och sortera efter värde om du vill följa upp en viss skattning.</p><p>Gruppens känsla omfattar alla incheckningar med ett värde. De andra korten omfattar svar efter träning eller tävling, och bara de som har angett respektive värde. Hjälpsymbolen förklarar fortfarande skalan. Samma svarsvy finns under Förra veckan.</p></details>}
        {role === 'coach' && <details><summary>Vilka har svarat i aktivitetskortet?<span>+</span></summary><p>Under Idag eller Förra veckan klickar du på en rad i Aktivitet → Vad har gruppen gjort?, till exempel ”Jag ska träna · 14 svar”. Då visas svaren med namn för profilsvar, status, datum, passval och kommentarer. Sök på namn eller kommentar för att hitta ett svar. Vald period och gruppfilter följer med. Flera svar från samma simmare visas separat, men profilantalet räknar unika profiler. Anonyma svar visas utan namn.</p></details>}
        <details><summary>Utvecklingsmål och analysbilder<span>+</span></summary><p>Utvecklingsmål skapas av tränaren i samråd med simmaren. Simmaren kan läsa målet och skriva reflektioner men kan inte skapa egna utvecklingsmål. En bifogad analysbild är underlag som kompletterar måltexten och kan öppnas för att se detaljer.</p>{role === 'coach' && <p>På simmarkortet under Simmare visas en kompakt översikt över aktiva utvecklingsmål. Fäll ut ett mål för beskrivning, nästa steg och analysbild, eller välj Öppna och redigera för hela målet. Avslutade mål ligger under Tidigare mål. Nytt mål väljer rätt simmare automatiskt. Under Utvecklingsmål → Nytt mål skriver du stödord eller en påbörjad måltext direkt i Beskrivning. Du kan även prata in en beskrivning och granska transkriberingen. Välj Skapa målförslag med AI för ett förslag med rubrik, beskrivning och eventuellt nästa steg. Simkoll försöker stoppa fullständiga namn, e-post och personnummer innan AI-anropet, men du måste själv avidentifiera text och bild och exempelvis skriva ”simmaren”. Granska förslaget, välj Använd förslaget och redigera vid behov innan du sparar. Ett sparat mål kan senare öppnas och rättas med Redigera mål; rubrik, beskrivning och nästa steg kan ändras utan att status, poäng, bild eller historik påverkas. Läsbara bildobservationer och osäkerheter visas separat. Bilder ska vara JPG, PNG eller WebP under 3 MB och bara avse aktuell simmare. De sparas privat med målet. Att bifoga eller visa en bild gör inget AI-anrop; transkribering och målförslag använder klubbens AI-kvot. Ljudet sparas inte i Simkoll.</p>}</details>
<details><summary>Morgonpass och eftermiddagspass i incheckningen<span>+</span></summary><p>När du ska simma eller har simmat väljer du vilket pass svaret gäller: morgon eller eftermiddag / kväll. Om du tränar båda passen rapporterar du dem separat. Ett svar om morgonträningen ger inte närvaro på kvällspasset. ”Ska träna” är en plan, inte bekräftelse på att du har genomfört passet. Vid efterregistrering gäller passvalet gårdagen.</p>{role === 'coach' && <p>Under Närvaro under simpass väljer du passet du vill följa upp. Äldre svar utan passkoppling visas som ”Pass ej angivet” och räknas inte automatiskt som närvaro. Du kan markera närvaron manuellt för rätt pass. Svar om sjukdom, vila, tävling eller andra aktiviteter visas som information, inte som genomförd simträning.</p>}<p>Finns flera upplägg för samma träning väljer du vilket du körde i efterincheckningen. Bara det valda uppläggets meter och minuter räknas, som uppskattning när hela passet är genomfört. Du kan ange egen mängd. Vid delvis genomfört pass räknas bara det du anger. Närvaro utan ett entydigt passval ger ingen gissad mängd. I veckoplaneringen visas alternativen tillsammans när datum, starttid och plats stämmer; veckomängden visas som ett intervall.</p></details>
        <details><summary>Bilder till styrkeövningar<span>+</span></summary><p>Tränaren kan lägga till en bild till varje övning. I simmarens styrkeprogram visas bilden vid rätt övning; klicka på den för en större bild. Bilderna kompletterar textinstruktionerna.</p>{role === 'coach' && <><p>Huvudtränare och superadmin kan lägga till bilder under importen eller via Styrkeprogram → Styrkeprogrambibliotek → Övningsbilder. Generera ett förslag med start- och slutläge, eller ladda upp en egen JPG/PNG/WebP under 3 MB. Kontrollera teknik och övningskoppling före sparandet. Varje AI-bild kostar ett separat anrop och följer klubbens tokenbudget. Egna bilder skickas till Simkolls privata bildlagring utan AI-tolkning. Att läsa en bild gör inget AI-anrop.</p><p>Justera Bildinstruktion för att förtydliga startläge, rörelse, utrustning eller kameravinkel. Detta ändrar inte simmarens övningsbeskrivning. Välj Använd den här bilden för ett godkänt förslag och spara programmet; annars behålls den gamla bilden. Bildinstruktionen sparas med den godkända bilden. Varje omgenerering kostar ett nytt AI-anrop.</p></>}</details>
        {role === 'coach' && <details><summary>Importera egna styrkeprogram<span>+</span></summary><p>På sidan Styrkeprogram kan huvudtränare och superadmin ladda upp XLS, XLSX, PDF eller en PNG/JPG/WebP-bild under 3 MB. AI-tolkningen bevarar passindelning, övningar och angiven dosering. Du kan också välja att skapa korta teknik-instruktioner till simmaren. Granska alla uppgifter och instruktioner mot originalet innan du sparar.</p><p>Ett program kan innehålla 1–5 pass. Större program behöver delas upp. Programmet sparas i styrkeprogrambiblioteket och kopplas därefter till rätt simmare under Tilldela styrkeprogram på samma sida. Vanliga tränare kan tilldela färdiga program, medan huvudtränare och superadmin hanterar import och redigering. Simmaren väljer pass och registrerar resultat för varje pass separat. Importen kostar ett AI-anrop och följer klubbens AI-inställning och tokenbudget. Sparandet, tilldelningen och simmarens läsning gör inga nya AI-anrop.</p></details>}
        <details><summary>Pushnotiser på mobilen<span>+</span></summary><p>Superadmin kan aktivera <strong>Pushnotiser</strong> under tränarvyns inställningar. Därefter godkänner varje användare <strong>Aktivera notiser</strong> en gång per enhet: simmare under sin profil och tränare via <strong>Notiser på min enhet</strong> i tränarmenyn. Efter det kan du välja Info från tränarna, privata meddelanden, utvecklingssamtal och när tävlingsanmälan öppnar utan en ny systemfråga. Du kan också skicka en testnotis och stänga av notiser igen.</p><p>På iPhone/iPad krävs iOS/iPadOS 16.4 eller senare och att Simkoll har lagts till på hemskärmen. Öppna appen från hemskärmen innan du aktiverar notiser. På Android fungerar det i en webbläsare som stöder Web Push, till exempel Chrome. Godkänn telefonens fråga om notiser. Fokusläge och telefonens egna notisinställningar kan göra att notiser inte visas direkt.</p><p>Utvecklingssamtal-notisen skickas när tränaren aktiverar ett nytt samtal. Tävlingsnotisen skickas när anmälan öppnas för din grupp. Notiserna visar inte privata svar eller meddelandetext. Frågor till tränarna ger notiser till tränarnas personliga konton; reaktioner och öppna peppinlägg ger inga pushnotiser. Valet gäller per enhet, och utloggning kopplar bort enheten. Push kräver uppkoppling och är inte en garanti för att viktig information har blivit läst.</p><p>Om tränaren har aktiverat träningspåminnelser kan du få en notis 2,5 timmar efter att du tryckt <strong>Jag ska träna</strong>, om du inte har skickat en efterrapport för samma simpass. Tiden räknas från din incheckning och är inte en exakt mätning av när passet började. Du kan stänga av kategorin <strong>Påminnelser om träningsincheckning</strong> på varje enhet. En separat kvällspåminnelse kan skickas omkring kl. 20 svensk tid om gruppen har planerat träning och du inte har checkat in alls. Högst en träningspåminnelse skickas per dag.</p><p>Huvudtränare och superadmin väljer påminnelser under <strong>Inställningar → Påminnelser om incheckning</strong> och klickar <strong>Spara påminnelser</strong>. Simkoll ordnar den automatiska kontrollen vid sparandet.</p></details>
        <details><summary>Flera passalternativ från samma kalkylblad<span>+</span></summary><p>Flera upplägg, till exempel bröstsim och frisim, kan höra till samma träning. De visas tillsammans i veckoplaneringen med egna meter och minuter. Den planerade mängden visas som ett intervall. När du checkar in efter träningen väljer du vilket upplägg du körde. Bara det valda passets mängd används som uppskattning i dagboken, eller den mängd du själv rapporterar.</p>{role === 'coach' && <p>Under Lägg upp ett pass → Välj från delad Drive-mapp kan du läsa alla flikar i Google Kalkylark och Excel-filer (XLS/XLSX). Granska och redigera varje valt pass och ange gemensamt datum, morgon/eftermiddag och grupper. Insimsbibliotek, dolda flikar och okända mallar är inte förvalda. Flikar med bara insim kan granskas utan att publiceras som hela pass. Importen gör inget AI-anrop. En publicering ger en gemensam pushnotis för alternativen när notiser om nya simpass är aktiverade.</p>}</details>
        <details><summary>Nytt träningstillfälle eller passalternativ?<span>+</span></summary><p>Flera upplägg för samma träning räknas som ett tillfälle med ett intervall för planerade meter och minuter. Efter träningen väljer simmaren vilket upplägg hen körde. Bara den mängden räknas i dagboken, eller simmarens egen rapporterade mängd.</p>{role === 'coach' && <p>I Lägg upp ett pass väljer du Nytt träningstillfälle för en separat träning, eller Alternativ till befintlig träning och väljer passet som upplägget hör till. Tid på dagen och grupper fylls i från valet. Det går också att öppna redan publicerade pass och koppla dem som alternativ. Valet finns även när du granskar flera importerade flikar. Två nya tillfällen summeras var för sig, även om båda ligger på eftermiddagen.</p>}</details>
        <details open><summary>Kom igång och logga in<span>−</span></summary><p>Logga in med klubbkoden och välj sedan din profil. Om profilen väntar på vårdnadshavares medgivande visas ett meddelande och tränaren aktiverar åtkomsten. En sparad profil gör att du snabbare kommer tillbaka till rätt vy.</p></details>
        <details><summary>Simmarens riktning i statistiken<span>+</span></summary><p>Tränaren hittar kortet överst under <strong>Simmare → Visa statistik</strong>. Vald period jämförs med föregående lika långa period. Känsla och kropp bygger på dagsgenomsnitt, så många svar samma dag inte väger tyngre. Minst tre dagar med giltiga värden behövs för varje skattning i båda perioderna. Pilarna visar förbättring, stabilt, minskning eller blandad utveckling; gränsen är 0,2 på skalan 1–5. Kontinuitet jämför registrerade simpass per vecka. Mer träning är inte automatiskt bättre. Kortet beräknas utan AI och visar inte bevisad prestationsutveckling.</p></details>
        <details><summary>Checka in och följ upp passet<span>+</span></summary><p>Välj <strong>Checka in</strong> och svara utifrån hur det känns just då. Du kan ange att du ska träna, har tränat, ska tävla, har tävlat, vilar eller känner dig sjuk. I veckoplaneringen kan du se passets rubrik, fokus, planerade meter/minuter, tid och plats före check-in. Själva serierna, passupplägget och tränarens passkommentar låses upp först när du har checkat in samma dag. Om ett simpass finns i dagens planering visas det automatiskt och du väljer om du genomförde hela passet, delar av det eller inte alls. För styrka behöver du inte ange tid. Under Annat kan du beskriva träningen och frivilligt ange hur lång tid den tog. Avmarkera registrering om du bara vill lämna feedback. Diagrammet skiljer dagens upplevelse från rapporterad träningsmängd och planerade simmeter. Efter ett träningspass kan du svara på fartkänsla, RPE, temperatur och hur passet upplevdes.</p><p>En incheckning före träning ger <strong>1 poäng</strong>, högst en gång per dag. Återkoppling efter träning ger <strong>3 poäng</strong> för varje separat morgonpass, eftermiddags-/kvällspass eller vald aktivitet. Samma pass eller aktivitet kan bara ge poäng en gång, även om svaret skickas igen. Sjuk- och viloregistrering ger inte särskilda check-in-poäng, men kan fortfarande räknas som dagens vanliga aktivitet i Simkoll. Efterregistrering av gårdagen följer samma regler.</p></details>
        <details><summary>Min träning och veckoplanering<span>+</span></summary><p>I <strong>Min träning den här veckan</strong> kan du växla mellan <strong>Denna vecka</strong> och <strong>Nästa vecka</strong> ovanför rutnätet. Du kan planera från idag till och med söndag nästa vecka. Genomförda pass kan bara markeras under pågående vecka, till och med idag. Summeringen högst upp visar alltid pågående vecka. Planera minst tre dagar för +2 poäng per vecka; planeringspoängen ges en gång för veckan som planeringen avser, även om du planerar i förväg. Under <strong>Veckoplanering</strong> ser du planerade simpass, styrka, landträning och kalenderaktiviteter för din grupp. Kalenderhändelser kan innehålla tid, plats och samling.</p></details>
        <details><summary>Min utveckling – hela bilden<span>+</span></summary><p>Öppna Min träningsdagbok. Överst ser du simträning, gym och styrka, träningsvanor, aktuella mål, egna tider/testlopp och registrerade tävlingsresultat för vald period. Registrera testlopp + öppnar tidsformuläret med Testlopp förvalt. Min väg vecka för vecka visar träningsinsats och resultat sida vid sida. Egna tider jämförs bara vid samma förutsättningar och ändrar inte officiella personbästan. Mål skapas och följs upp tillsammans med tränaren. Saknade uppgifter är inte noll, mer träning är inte automatiskt bättre och sammanställningen gör inga AI-anrop.</p></details>
        <details><summary>Registrera egna träningstider och testlopp<span>+</span></summary><p>Öppna <strong>Min träningsdagbok → Mina egna tider → Registrera en tid</strong>. Ange datum, distans, simsätt, bassäng och tid, till exempel 48,21 eller 1:08,42. Du kan välja träningstid eller testlopp och ange start, hel simning/arm/ben, hjälpmedel och tidtagning. Beskriv andra förutsättningar när det behövs. Ett genomfört simpass på samma datum kan kopplas till tiden.</p><p>Jämförelser görs mellan tider med samma förutsättningar. Bästa egna tid gäller den valda perioden. Egna tider visas separat från officiella tävlingsresultat, ändrar inga officiella personbästan och ger inga PB-poäng. De skapar inte heller extra träningspass eller simmeter. Du kan ändra eller ta bort dina egna registreringar. Klubbens aktiva tränare kan läsa, lägga till och rätta tider från <strong>Simmare → simmarkortet → Träningstider och testlopp</strong>. Kortet är minimerat från början; öppna det för periodval, jämförelsegraf och historik. Tränare använder personliga konton och kan inte radera tider genom den här vyn.</p></details>
        <details><summary>Poäng, stjärnor och artefakter<span>+</span></summary><p>Poäng ges för positiva appvanor, till exempel planering, pepp, spel, mål och träningsreflektion. Föreincheckning ger 1 poäng högst en gång per dag. Återkoppling efter ett pass ger 3 poäng per separat pass eller vald aktivitet, utan dubbelpoäng för samma registrering. Den vanliga dagliga aktivitetspoängen kan också tjänas in en gång per dag genom att använda en profilfunktion.</p><p>Träningsstjärnorna visar fyra vanor: planerad vecka, aktiva styrke- och landmål, simmål och att följa simplanen över de senaste fyra avslutade veckorna. En stjärna ger 1 poäng när den låses upp. Artefakter tilldelas av tränaren och ger normalt 5 poäng.</p></details>
        <details><summary>Veckans spel<span>+</span></summary><p>Under Veckans spel kan du spela de spel som tränaren har publicerat. Rekord och topplistor kan vara veckovisa eller gälla över tid beroende på spel. Testläge för tränare sparar inte simmarresultat.</p></details>
        <details><summary>Meddelanden och pepp<span>+</span></summary><p>Svep mellan korten på startsidan till <strong>Peppflödet</strong>, som ligger bredvid Info från tränarna. Kortet visar de senaste inläggen. Tryck <strong>Öppna peppflödet</strong> för att läsa den öppna kanalen i ett chattfönster. Här kan alla i klubben läsa hälsningarna. Välj <strong>Färdig pepp</strong> eller skriv en egen pepp eller fråga om tränarna har tillåtit egna meddelanden. Du kan också lägga till emojis. Dina inlägg visas till höger och andras till vänster. Bakgrunden följer det chattema tränarna valt för Info från tränarna.</p><p>Egna texter kontrolleras innan de skickas och tydliga svordomar eller personangrepp stoppas. De första fyra peppen per dag ger 1 poäng vardera, inklusive privat pepp. I den öppna kanalen kan du fortsätta prata utan fler poäng. Frågor där läses av hela klubben. Tryck Svara på ett inlägg för att citera det. Datumavdelare och Nya meddelanden-knappen hjälper dig hitta rätt. Under <strong>Min privata pepp</strong> kan du fortfarande skicka en hälsning direkt till en simmare. <strong>Info från tränarna</strong> är en separat kanal för tränarnas information och frågor till tränarna.</p></details>
        <details><summary>Tävlingsplanering och grenanmälan<span>+</span></summary><p>När tränaren har publicerat en anmälan hittar du kortet <strong>Ny tävlingsplanering</strong> i simmarvyn, i närheten av <strong>Dagens pass</strong>. Öppna tävlingen, markera de grenar du vill simma och kontrollera pass, distans och simsätt. <strong>Spara utkast</strong> sparar dina val utan att skicka dem. Tryck <strong>Skicka till tränarna</strong> när du är klar. Du kan fråga Simkoll-assistenten vilka grenar du har valt och om de är sparade eller inskickade. Tränarna kan granska och justera anmälan.</p></details>
        <details><summary>Mina utvecklingssamtal<span>+</span></summary><p>Utvecklingssamtalet hjälper dig att förbereda vad du vill prata med tränarna om: hur simningen och vardagen fungerar, vad du vill utveckla, dina mål och vilket stöd du önskar. Du kan svara steg för steg och välja <strong>Spara och fortsätt senare</strong> för att pausa. När du trycker <strong>Redo för samtalet</strong> skickas dina förberedelser till tränarna. Det aktiva samtalskortet visas under <strong>Dagens pass</strong> när tränaren har aktiverat det. Tidigare samtal och dina sparade svar hittar du via menyn under din profil, i <strong>Mina utvecklingssamtal</strong>. Tränarnas interna anteckningar är privata; den gemensamma överenskommelsen kan visas i din historik. Du kan också fråga Simkoll-assistenten vad samtalet innehåller och om dina egna sparade samtal.</p></details>
        <details><summary>Simkoll-assistenten, data och AI<span>+</span></summary><p>Assistenten svarar på dina frågor med Simkolls hjälpinformation och, när det behövs, uppgifter kopplade till din egen profil. Det kan till exempel vara ditt namn och din grupp, planerade och genomförda pass, mål, tävlingsval och resultat, dina egna utvecklingssamtal samt de senaste gruppmeddelandena från tränarna. Den får inte läsa andra simmares profiler eller tränarnas interna anteckningar. Den kan ändå svara fel, så kontrollera viktig information med tränaren. Den kan inte ändra dina uppgifter eller fatta beslut om träning eller tävling och ger inte medicinska råd.</p><p>Frågan och relevant underlag skickas till en språkmodell via OpenAI API. Assistentens chatt sparas lokalt på enheten; högst 40 meddelanden behålls och de senaste 10 kan följa med som sammanhang när du frågar igen. Simkolls AI-logg sparar modell, roll/profil, tokenantal och status – inte fråge- eller svarstexten. OpenAI uppger att API-data inte används för modellträning som standard. Standardloggar för missbruksövervakning kan däremot innehålla innehåll och sparas i upp till 30 dagar. Klubbens exakta inställning kan inte läsas i appen. Läs mer i <a href="https://platform.openai.com/docs/guides/your-data" target="_blank" rel="noreferrer">OpenAI:s dokumentation om API-data</a>. Skriv inte känsliga uppgifter i chatten.</p><p><strong>Personlig AI-analys är en annan funktion:</strong> den skapas av tränaren för en vald simmare och period. Den kan använda simmarens egna check-in-svar och kommentarer, pass kopplade till simmarens registrerade träning, styrkeprogram och loggade vikter/noteringar, tävlingsresultat och personliga rekord, mål samt tränaranteckningar som är kopplade till simmaren. Äldre upplevelse- och träningsdata sammanfattas som jämförelse. Privata meddelanden och andra simmares profiler ingår inte. Fritext behandlas som innehåll, inte som instruktioner. Underlaget skickas till den språkmodell klubben har konfigurerat; större underlag kan påverka kostnaden. Analysen kräver klubbens godkännandeflöde.</p><p>Du hittar mer information i menyn under <strong>Info & villkor</strong>.</p></details>
        <details><summary>Hur fungerar den personliga AI-analysen?<span>+</span></summary><p>Tränaren aktiverar analysen efter inhämtat godkännande under <strong>Profilinställningar → AI-stöd</strong> på simmarkortet. Under Visa statistik väljer tränaren period och skapar eller uppdaterar analysen. Simmaren kan läsa den sparade analysen för samma period men inte starta egna analyser. Att aktivera eller läsa en analys gör inget nytt AI-anrop.</p><p>Nya analyser visar en sammanfattning och en utfällbar fördjupning med daterade belägg, möjliga förklaringar och konkret uppföljning. Ett återkommande mönster behöver minst tre olika datum; en enskild stark prestation kan ändå lyftas. Analysen skiljer mellan observation och tolkning, och osäkra kopplingar till morgon-/eftermiddagspass redovisas. Passens meter och minuter är kopplade planeringsvärden, inte uppmätt faktisk träning. Detaljer om en prestation måste finnas i en kommentar eller tränaranteckning för att analysen ska kunna använda dem.</p><p>En ny analys ersätter den sparade analysen för samma period. Äldre analyser uppdateras när tränaren skapar en ny. Tränaranteckningarnas råa källtext visas bara för tränare; simmaren kan läsa analysens resonemang. AI är ett samtalsstöd och ska inte användas för medicinska slutsatser.</p></details>
        {Object.entries(HELP_TEXT).map(([term, description]) => <details key={term}><summary>{term}<span>+</span></summary><p>{description}</p>{FAQ_SCALES[term] && <div className={`rpe-guide scale-${FAQ_SCALES[term].length}`}>{FAQ_SCALES[term].map(([value, label]) => <span key={value}><b>{value}</b>{label}</span>)}</div>}</details>)}
      </div>
      {role === 'coach' && <>
        <section className="coach-interpretation"><p className="eyebrow">Inloggning och behörighet</p><h2>Tränarkonton och simmarkonton</h2><ul><li><strong>Tränare:</strong> välj Tränare på inloggningssidan och använd ditt personliga konto med e-post och lösenord. Nya tränare ansöker om konto och väntar på godkännande.</li><li><strong>Första superadmin:</strong> skapas en gång med bootstrap-tokenen från Vercels miljövariabler. När kontot finns försvinner alternativet automatiskt från inloggningen.</li><li><strong>Superadmin:</strong> öppna <strong>Tränarvy → Tränarkonton</strong> för att godkänna eller ta bort en väntande ansökan, stänga av konton eller ändra roller. En borttagen ansökan kan skickas in igen senare. Gör bara betrodda personer till superadmin.</li><li><strong>Simmare:</strong> loggar in med klubbens simmarkod och väljer sedan sin egen profil med namn och PIN. En ny profil kan behöva godkännas av tränare och vårdnadshavares medgivande innan åtkomsten aktiveras.</li><li><strong>Testprofil:</strong> markera bara konton som används för testning. Testprofiler ska inte blandas in i riktiga träningsuppföljningar.</li><li><strong>Loggar:</strong> godkännanden, avvisade ansökningar, rolländringar och inloggningar syns under <strong>Loggar</strong>. Råa IP-adresser sparas inte; endast maskerade fingeravtryck och eventuell region visas.</li></ul></section>
        <section className="coach-interpretation"><p className="eyebrow">För tränare</p><h2>Så används tränarvyn</h2><ul><li><strong>Gruppens läge</strong> visar vald dags svar, sjuk- och vilostatus, dagens pass och närvaro.</li><li>Använd gruppfiltret högst upp för att se en eller flera grupper.</li><li>Klicka på informationsikonen <strong>i</strong> vid statistik för en kort förklaring av vad värdet mäter.</li><li>Under <strong>Pass</strong> kan du lägga upp flera pass per dag och grupp. Under <strong>Planering</strong> kopplas grundplan, upplagda pass och SportAdmin-kalender ihop.</li><li><strong>Tävlingsresultat</strong> hämtas från Tempus när simmaren har ett Tempus-ID. Nya personbästa kan ge 3 poäng totalt per tävling och skickar en gratifikation till simmaren.</li><li><strong>Veckomöte, Grupptrend och Historik</strong> hjälper dig att se mönster i närvaro, meter, RPE, fartkänsla, temperatur och träningsupplevelse.</li></ul></section>
        <section className="coach-interpretation"><p className="eyebrow">Växla vy</p><h2>Byt till din egen simmarvy</h2><p>Huvudtränare och superadmin kan under <strong>Mitt tränarkonto → Min simmarprofil</strong> koppla sitt eget simmarkonto genom att verifiera användarnamn och PIN en gång. PIN-koden sparas inte. Välj sedan <strong>Byt till min simmarvy</strong> i rollmenyn för att använda den vanliga simmarvyn med ditt eget konto. Den tydliga knappen högst upp tar dig tillbaka till tränarvyn. Det går inte att öppna andra simmares profiler.</p></section>
        <section className="coach-interpretation"><p className="eyebrow">Inställningar i tränarvyn</p><h2>Globala val och egna val</h2><ul><li><strong>Tränarvyns meny:</strong> huvudtränare och superadmin väljer globalt vilka delar som ska visas. Valet styr både flikarna i översikten, menyn och genvägarna under Verktyg. Vanliga tränare följer alltid dessa globala val.</li><li><strong>Översiktens genvägar:</strong> styr vilka direktlänkar som visas som flikar på översiktssidan. Om en genväg döljs här kan funktionen fortfarande finnas i menyn eller Verktyg, så länge den är påslagen i tränarvyns meny.</li><li><strong>Egna inställningar:</strong> huvudtränare och superadmin kan öppna <strong>Mitt tränarkonto</strong> och slå på <strong>Använd egna inställningar</strong>. Då kan de välja en personlig meny och översikt som avviker från klubbens globala val. Det påverkar bara det egna kontot. Stänger man av valet används de globala inställningarna igen.</li><li><strong>Vanlig tränare:</strong> kan inte aktivera egna menyval och får därför alltid den meny och översikt som huvudtränare eller superadmin har bestämt.</li><li>Att dölja en menyväg ändrar inte användarens roll eller bakomliggande behörighet och raderar ingen data.</li><li><strong>AI-stöd:</strong> slår på eller av nya språkmodell-anrop på serversidan. När stödet är avstängt blockeras trendanalyser, textförbättring, transkribering och tolkning av bilder, PDF:er och dokument.</li><li><strong>Tokenstak per månad:</strong> sätter ett tak för AI-användningen. Ange 0 för obegränsat. När taket nås stoppas nya AI-anrop tills nästa månad. Under <strong>Loggar</strong> kan du följa anrop, tokens, modeller och uppskattad kostnad.</li><li><strong>Säsongsteman och visuella effekter:</strong> styr tävlings- och säsongsstämning i simmarvyn, till exempel Halloween, snö eller jul. De ändrar presentationen men inte träningsdata.</li><li><strong>Egna peppmeddelanden:</strong> tillåter eller stoppar simmare från att skriva egna meddelanden till gruppen. Meddelanden kontrolleras mot klubbens språkregler innan de skickas.</li><li><strong>Sessionstid:</strong> bestämmer hur länge “Håll mig inloggad” gäller för tränare respektive simmare. Lösenord och PIN sparas inte i webbläsaren.</li><li><strong>Export och import:</strong> under inställningarna kan du exportera en lokal databaskopia med datum och Simkoll-version i filnamnet, eller importera en tidigare kopia. Kontrollera alltid fil och målmiljö innan import.</li></ul></section>
        <section className="coach-interpretation"><p className="eyebrow">Tävlingskalender</p><h2>Läs in och granska grenprogram</h2><ul><li>Öppna <strong>Grenprogram → Läs in bild / PDF</strong> på tävlingen. Filen får vara högst 3 MB. Exportera Word till PDF så att tabellernas layout bevaras.</li><li>AI inventerar först pass och synliga grennummer, och läser sedan grenraderna. Mix skiljs från Damer/Herrar och klassbokstäverna A–F.</li><li>Du får ett <strong>utkast per pass</strong> med datum, insim och start. Öppna originalet, rätta fel och kontrollera osäkra rader. Saknade nummer och dubbletter flaggas. AI kan fortfarande göra fel.</li><li>Markera att du jämfört med originalet och välj <strong>Godkänn och spara program</strong>. Det tidigare programmet ligger kvar tills sparandet lyckas. Utkastet sparas inte om du lämnar sidan.</li><li>Befintliga anmälningar behålls för oförändrade grenar. Om en ändrad eller borttagen gren redan har anmälningar stoppas sparandet utan att något raderas.</li><li><strong>Publicera grenanmälan för simmare</strong> öppnar själva anmälan separat.</li></ul></section>
        <section className="coach-interpretation"><p className="eyebrow">Kalender och planering</p><h2>SportAdmin-kalender</h2><ul><li>Öppna <strong>Tränarvy → Inställningar → SportAdmin-kalendrar</strong> och klistra in en eller flera SportAdmin Webcal-länkar.</li><li>Ge kalendern ett valfritt namn och välj vilka träningsgrupper den gäller för. En kalender kan kopplas till flera grupper och flera kalendrar kan användas samtidigt.</li><li>Tryck <strong>Spara och synka kalendrar</strong>. Aktiviteterna läses in i planeringen med datum, tid, plats, samling och gruppfilter.</li><li>Gruppfiltret högst upp i tränarvyn styr vad som visas. En simmare ser bara kalenderhändelser för sin egen grupp.</li><li>SportAdmin-text som hör till en tävling visas som <strong>Information från SportAdmin</strong> i tävlingskortet och kan fällas ut vid behov. Den ersätter inte tävlingsprogrammet eller tränarens egen planering.</li></ul></section>
        <section className="coach-interpretation"><p className="eyebrow">Konton och säkerhet</p><h2>Tre tränarroller – enkelt förklarat</h2><ul><li><strong>Tränare:</strong> arbetar med den dagliga träningen och ser relevanta tränarvyer, men kan inte ändra klubbens inställningar eller välja egna vyinställningar.</li><li><strong>Huvudtränare:</strong> kan styra vilka menyer och genvägar som ska synas för tränarna. Huvudtränaren kan också använda <strong>Egna inställningar</strong> under Mitt tränarkonto.</li><li><strong>Superadmin:</strong> har alla behörigheter, inklusive globala inställningar, säkerhet, SportAdmin, AI-stöd och tränarkonton. Superadmin kan ändra andra superadmins, men inte stänga av eller nedgradera sig själv.</li><li>Den första tränaren skapar klubbens första superadmin med bootstrap-tokenen från Vercels miljövariabler. Därefter godkänner superadmin nya tränarkonton.</li><li><strong>Loggar</strong> visas endast för superadmin. Råa IP-adresser visas inte; loggen använder maskerat IP-fingerprint och läsbar region när det finns.</li></ul></section>
        <section className="coach-interpretation"><p className="eyebrow">AI-stöd och integritet</p><h2>Använd AI som stöd</h2><ul><li>AI kan hjälpa till att analysera trender, förbättra text och tolka tränings- eller tävlingsdokument.</li><li>AI-stöd kan stängas av under Webapp-inställningar. Då stoppas nya AI-anrop på serversidan.</li><li>Analysresultat är förslag och samtalsunderlag. Kontrollera alltid texten och dra inga medicinska slutsatser.</li><li>Gruppvärden visas med integritetshänsyn och ska inte användas för att dra slutsatser om en enskild simmare från ett enda svar.</li></ul></section>
      </>}
    </section>
  </div>
}

function LegalPurpose() {
  return <section className="legal-purpose"><p className="eyebrow">Kort om Simkoll</p><h2>En app med simmaren i fokus</h2><p>Simkoll gör det enkelt för simmare att checka in, berätta hur träningen känns och följa sin egen utveckling över tid. För tränaren samlar appen återkoppling, träningsdata och planering på ett ställe, så att passen kan följas upp och utvecklas tillsammans med gruppen.</p><p>Simkoll är ett tränarstöd och ett verktyg för reflektion och dialog. Det är inte en medicinsk bedömning, ett automatiskt uttagningssystem eller ett beslutssystem. Appen ersätter inte tränarens omdöme, samtal med simmaren eller kontakt med vårdnadshavare och vårdpersonal.</p></section>
}

function LegalPage({ onBack }) {
  return <div className="faq-page legal-page">
    {onBack && <button className="back-button" onClick={onBack}>← Tillbaka</button>}
    <section className="faq-content">
      <p className="eyebrow">Simkoll</p><h1>Info & villkor</h1>
      <p className="faq-intro">Här beskriver vi hur Simkoll används och hur information hanteras. Klubbens juridiska uppgifter och kontaktväg kompletteras innan skarp lansering.</p>
      <div className="faq-list">
        <details open><summary>Integritet och data<span>−</span></summary><p>Simkoll samlar in svar om exempelvis energi, kroppskänsla, motivation, RPE, fartkänsla, temperatur och träningsupplevelse. Du väljer själv om ett svar ska vara anonymt eller kopplas till din profil.</p><p>Anonyma svar visas som gruppsammanställningar. Profilkopplade svar kan ses av behöriga tränare och av dig själv. Du kan be om information, rättelse eller radering av uppgifter via klubben.</p></details>
        <details><summary>Simkoll-assistenten och dina uppgifter<span>+</span></summary>
          <p>När du ställer en fråga skickas frågan och relevant information från din egen profil till en språkmodell via OpenAI API för att skapa svaret. Det kan omfatta namn och grupp, träningsplanering och träningsmål, gruppmeddelanden från tränarna, tävlingsval och resultat samt dina egna sparade svar i utvecklingssamtal. Assistenten får inte tillgång till andra simmares profiler eller tränarnas interna samtalsanteckningar.</p>
          <p>På den här enheten sparas upp till 40 meddelanden i assistentens historik. De senaste 10 kan skickas med en ny fråga som samtalssammanhang. Simkolls AI-användningslogg sparar modell, roll/profil, tokenantal och status för användningen, inte frågans eller svarets text.</p>
          <p>OpenAI uppger att API-data inte används för att träna modeller som standard, om kunden inte har valt att dela data. OpenAI beskriver också standardloggar för missbruksövervakning som kan innehålla innehåll och sparas i upp till 30 dagar. Simkoll kan inte läsa från appen vilken datakontroll som är vald för OpenAI-organisationen eller projektet. Se <a href="https://platform.openai.com/docs/guides/your-data" target="_blank" rel="noreferrer">OpenAI:s aktuella dokumentation om API-data och lagring</a> för detaljer.</p>
          <p>Assistenten läser tillgängligt underlag och skriver ett svar. Den kan ha fel och kan inte ändra dina uppgifter, ge medicinska råd eller fatta beslut om träning eller tävling. Skriv inte diagnoser, personnummer eller andra känsliga uppgifter i chatten.</p>
        </details>
        <details><summary>AI-analys<span>+</span></summary><p>Gruppens trendanalys jämför sammanställda tränings- och upplevelsevärden över valda perioder. Den kräver ett minsta underlag innan gruppresultat visas. En personlig analys är en separat tränarskapad sammanfattning av träningsmått och eventuell dokumentation/fritext som tränaren väljer att ta med. Den visas först när klubben aktiverat den enligt sin rutin. Det innebär att fritext i tränardokumentation kan skickas till språkmodellen för just den analysen. Analys är ett tränings- och samtalsstöd, inte en diagnos, ett automatiskt betyg eller ett beslut om träning, hälsa eller tävling. Kontrollera alltid uppgifterna och ta upp frågor med tränaren.</p></details>
        <details><summary>AI för minderåriga<span>+</span></summary><p>För simmare under 18 år ska klubben inhämta vårdnadshavares godkännande och även informera simmaren på ett begripligt sätt. Godkännandet dokumenteras utanför eller i klubbens beslutade samtyckesflöde. Det ska gå att återkalla utan nackdelar.</p></details>
        <details><summary>Användarvillkor<span>+</span></summary><p>Simkoll är ett frivilligt stöd för träningsfeedback, planering och utveckling. Det ersätter inte kontakt med tränare, vårdnadshavare eller vårdpersonal. Skriv inte diagnoser, personnummer eller andra känsliga uppgifter i fritextfält.</p><p>Pepp och meddelanden ska vara respektfulla. Olämpligt innehåll kan tas bort av tränare.</p></details>
        <details><summary>Klubbens uppgifter<span>+</span></summary><p>Personuppgiftsansvarig, kontaktadress, lagringstid och information för minderåriga fylls i här innan skarp lansering. Fråga klubben om du vill få information om dina uppgifter, be om rättelse eller radering.</p></details>
      </div>
      <small className="legal-disclaimer">Detta är ett informationsutkast och bör granskas av klubben innan skarp användning. Exakt OpenAI-datakontroll och klubbens lagringstider behöver bekräftas.</small>
    </section>
  </div>
}

function CoachTermsSection() {
  return <section className="settings-card coach-terms-card" id="coach-terms"><p className="eyebrow">Tränare · version 1.0</p><h2>Tränarvillkor och regler för informationshantering</h2><p>Tränarkontot får endast användas inom klubbens tränaruppdrag. Information om simmare ska hanteras konfidentiellt och bara användas för träningsuppföljning, planering och samtal.</p><p>Dokumentera bara sådant som är relevant och nödvändigt. Skriv inte diagnoser, personnummer eller andra onödigt känsliga uppgifter i fritext. Dela inte skärmbilder, exporter eller inloggningsuppgifter med obehöriga.</p><p>AI- och språkmodellstöd är ett hjälpmedel. Kontrollera alltid resultatet och använd det inte som ett automatiskt beslut om träning, tävling eller hälsa.</p><p>Logga ut från delade enheter och rapportera misstänkt obehörig åtkomst till klubbens utsedda kontaktperson.</p></section>
}

function SwimmerTermsSection() {
  return <section className="settings-card swimmer-terms-reference" id="swimmer-terms"><p className="eyebrow">För simmare · version 1.0</p><h2>Simmarnas Info & villkor</h2><p>Det här är samma text som simmarna får läsa och godkänna när de skapar profil eller loggar in första gången efter att villkoren införts.</p><p>Simkoll är ett stöd för träningsfeedback, planering och utveckling. Svara så ärligt du vill, men skriv inte diagnoser, personnummer eller andra privata uppgifter i fritext.</p><p>Vissa svar kan sammanställas för tränarna. AI- och språkmodellstöd används bara enligt klubbens regler och är ett stöd – inte ett automatiskt beslut om träning eller hälsa.</p><p>Simmaren kan fråga klubben om vilka uppgifter som finns sparade och be om rättelse eller radering. Godkännandet sparas med datum och villkorsversion.</p></section>
}

function currentStarState(training, profileId) {
  const today = todayKey(), start = weekStart(), week = dateKey(start)
  const plans = (training?.plannedSessions || []).filter((item) => !profileId || item.profileId === profileId), sessions = (training?.sessions || []).filter((item) => !profileId || item.profileId === profileId)
  const plannedWeek = plans.filter((item) => item.weekStart === week)
  const goal = (training?.seasonGoals || []).find((item) => (!profileId || item.profileId === profileId) && item.active && item.startDate <= today && item.endDate >= today) || (training?.seasonGoals || []).find((item) => (!profileId || item.profileId === profileId) && item.active)
  const cross = (training?.crossGoals || []).find((item) => (!profileId || item.profileId === profileId) && item.startDate <= today && (!item.endDate || item.endDate >= today))
  const fourWeeksStart = new Date(start); fourWeeksStart.setDate(fourWeeksStart.getDate() - 28)
  const fourWeeksStartKey = dateKey(fourWeeksStart)
  const completedFourWeeks = sessions.filter((item) => item.type === 'swim' && item.date >= fourWeeksStartKey && item.date < week).length
  const expectedFourWeeks = goal?.target ? goal.target * 4 : 0
  const monthlySwim = expectedFourWeeks > 0 && completedFourWeeks >= expectedFourWeeks
  return { weeklyPlan: new Set(plannedWeek.map((item) => item.date)).size >= 3, crossGoals: Boolean(cross?.strengthTarget > 0 && cross?.drylandTarget > 0), swimGoal: Boolean(goal?.target), monthlySwim, fourWeeksCompleted: completedFourWeeks, fourWeeksExpected: expectedFourWeeks, fourWeeksPercentage: expectedFourWeeks ? Math.round((completedFourWeeks / expectedFourWeeks) * 100) : null, weekStart: week, goalKey: goal?.startDate || cross?.startDate || 'current', month: week }
}

function StarProgress({ stars }) {
  const items = [['weeklyPlan', 'Veckan planerad'], ['crossGoals', 'Styrka och landträning'], ['swimGoal', 'Simmål satt'], ['monthlySwim', 'Månadens simmål']]
  return <div className="star-progress" aria-label="Dina stjärnor">{items.map(([key, label]) => <span key={key} className={stars[key] ? 'earned' : ''} title={`${label}: ${stars[key] ? 'klar' : 'inte klar ännu'}`}>{stars[key] ? '★' : '☆'}</span>)}</div>
}

function Home({ code, responses, responsesLoaded = false, ownResponsesLoaded = false, profile, points, notifications, onNotificationsChange, newDevelopmentGoals = [], training, workout, competitions, developmentTalks = [], availableGames, previousGames, appFeedbackEnabled, openChatEnabled, starsEnabled, swimmerEffects, swimmerThemesEnabled, swimmerTheme, workoutLocked, activeProfilesToday, activityDates, onCommunity, onCommunityChat, onGoals, onTalk, onStrengthProgram, onDrylandProgram, onCompetitions, onGame, onVanda, onSwimgames, onAljakten, onBreakout, onSprint, onLongJump, onBikeRun, onTwenty48, onAllTime, onDino, onToggleSession, onTogglePlan, onStart, onStartYesterday }) {
  const [communityPreview, setCommunityPreview] = useState(null)
  const [communityPreviewError, setCommunityPreviewError] = useState(false)
  const chatVisible = communityPreview?.openChat?.enabled ?? (openChatEnabled === true)
  const [coachPreviewRequest, setCoachPreviewRequest] = useState(0)
  const levelVisible = Boolean(profile && points?.current)
  const pendingDevelopmentTalk = latestPendingDevelopmentTalk(developmentTalks)
  useEffect(() => {
    if (!profile) return
    let active = true
    setCommunityPreview(null); setCommunityPreviewError(false)
    const stop = startVisiblePolling(() => apiRequest('/api/community?preview=true', code).then((data) => { if (active) { setCommunityPreview(data); setCommunityPreviewError(false) } }).catch(() => { if (active) setCommunityPreviewError(true) }), 15000)
    return () => { active = false; stop() }
  }, [code, profile?.id])
  const todayResponses = responses.filter((response) => dateKey(responseDate(response)) === todayKey())
  const todayResponseIds = todayResponses.map((response) => response.id).join('|')
  const knownMoodResponseIds = useRef(null)
  const [animatedMoodIds, setAnimatedMoodIds] = useState([])
  useEffect(() => {
    if (!responsesLoaded) return undefined
    const currentIds = todayResponseIds ? todayResponseIds.split('|') : []
    if (knownMoodResponseIds.current === null) {
      knownMoodResponseIds.current = new Set(currentIds)
      return undefined
    }
    const knownIds = knownMoodResponseIds.current
    const newIds = currentIds.filter((id) => !knownIds.has(id))
    knownMoodResponseIds.current = new Set(currentIds)
    if (!newIds.length) return undefined
    setAnimatedMoodIds(newIds)
    const timer = window.setTimeout(() => setAnimatedMoodIds([]), 700)
    return () => window.clearTimeout(timer)
  }, [responsesLoaded, todayResponseIds])
  const yesterdayDate = new Date(); yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterdayKey = dateKey(yesterdayDate)
  const hasYesterdayCheckin = profile && responses.some((item) => item.profileId === profile.id && dateKey(responseDate(item)) === yesterdayKey)
  let hasLocalYesterdayCheckin = false
  if (profile) { try { hasLocalYesterdayCheckin = window.localStorage.getItem(`simkoll-late-checkin:${profile.id}:${yesterdayKey}`) === 'done' } catch { /* Storage is optional. */ } }
  const { followUp, raceFollowUp } = checkinFollowUp(profile ? todayResponses.filter((item) => item.profileId === profile.id) : [], todayKey())
  // Daily activity is stored as a Stockholm calendar date on the server.
  // Use it as the source of truth for streaks, while merging in responses
  // already present in the UI so a just-submitted check-in is shown instantly.
  const activeDates = new Set([...(activityDates || []), ...responses.map((item) => dateKey(responseDate(item)))])
  let streak = 0; const streakCursor = new Date()
  while (activeDates.has(dateKey(streakCursor))) { streak += 1; streakCursor.setDate(streakCursor.getDate() - 1) }
  const groupFeeling = todayResponses.length ? todayResponses.reduce((sum, response) => sum + response.feeling, 0) / todayResponses.length : 0
  const energized = todayResponses.length >= 3 && groupFeeling >= 4
  const nextCompetition = (competitions || []).filter((item) => (item.endDate || item.startDate) >= todayKey()).sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
  const daysToCompetition = nextCompetition ? Math.max(0, Math.ceil((new Date(`${nextCompetition.startDate}T12:00:00`) - new Date(`${todayKey()}T12:00:00`)) / 86400000)) : null
  const contextClass = swimmerEffects && daysToCompetition != null ? (daysToCompetition === 0 ? 'race-day' : daysToCompetition <= 3 ? 'race-near' : 'race-coming') : swimmerEffects && (Array.isArray(workout) ? workout[0] : workout)?.focus === 'fart' ? 'speed-focus' : ''
  const themeClass = swimmerThemesEnabled && swimmerTheme !== 'none' ? ` theme-${swimmerTheme}` : ''
  const raceDayActive = swimmerEffects && daysToCompetition === 0
  const stars = currentStarState(training)
  useEffect(() => { if (profile) apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync-stars', stars, streak, weekStart: stars.weekStart, goalKey: stars.goalKey, month: stars.month }) }).catch(() => {}) }, [code, profile?.id, streak, stars.weeklyPlan, stars.crossGoals, stars.swimGoal, stars.monthlySwim, stars.weekStart, stars.goalKey, stars.month])
  return (
    <div className={`page-content home${raceDayActive ? ' race-day-page' : ''}${themeClass}`}>
      <SwimmerHeroCarousel enabled={Boolean(levelVisible || profile)} initialIndex={levelVisible ? 1 : 0} infoRequest={coachPreviewRequest} infoIndex={levelVisible ? 2 : 1} labels={[...(levelVisible ? ['Din nivå'] : []), 'Idag i gruppen', ...(profile && chatVisible ? ['Info från tränarna'] : []), ...(profile ? ['Peppflödet'] : [])]} regionLabel="Din nivå, gruppens läge, tränarinfo och peppflöde">
      {levelVisible && <RewardCard key="level" points={points} onCommunity={onCommunity} featured />}
      <section key="today" className={`mood-hero ${energized ? 'energized' : ''} ${contextClass}${themeClass}`}>
        {swimmerThemesEnabled && swimmerTheme === 'halloween' && <div className="halloween-decor" aria-hidden="true"><span className="halloween-web">🕸️</span><span className="halloween-spider">🕷️</span><span className="halloween-pumpkin pumpkin-left">🎃</span><span className="halloween-pumpkin pumpkin-right">🎃</span></div>}
        <p className="eyebrow light">Idag i gruppen</p>
        {profile && chatVisible && <CoachLetterBadge code={code} chat={communityPreview?.openChat} profileId={profile.id} onOpen={() => setCoachPreviewRequest((value) => value + 1)} />}
        <h1>Så här känns det</h1>
        {profile && swimmerEffects && daysToCompetition === 0 && <div className="race-day-badge"><span className="race-flag race-flag-left" aria-hidden="true">🏁</span> RACE DAY <span className="race-flag race-flag-right" aria-hidden="true">🏁</span></div>}
        {profile && nextCompetition && <p className="mood-context">Nästa tävling: {nextCompetition.title} · {daysToCompetition === 0 ? 'idag' : `${daysToCompetition} ${daysToCompetition === 1 ? 'dag' : 'dagar'} kvar`}</p>}
        <div className="emoji-cloud" aria-label={`${todayResponses.length} svar idag`}>
          {todayResponses.length ? todayResponses.map((response, index) => (
            <span className={`${response.feeling === 5 ? 'top-mood' : response.feeling === 4 ? 'good-mood' : ''}${animatedMoodIds.includes(response.id) ? ' new-response' : ''}`} key={response.id} style={{ '--delay': `${index * 40}ms` }}>
              {FEELINGS.find((item) => item.value === response.feeling)?.emoji}
            </span>
          )) : <p>Inga svar ännu – bli först!</p>}
        </div>
        <div className="response-count"><span><strong>{todayResponses.length}</strong> svar idag</span>{profile && <span className="active-count"><strong>{activeProfilesToday}</strong> profiler inne idag</span>}</div>
        {profile && <div className="mood-footer">
          {starsEnabled && <StarProgress stars={stars} />}
          {streak > 0 && <div className={`streak-chip streak-cycle-${Math.floor((streak - 1) / 10) % 3} ${streak % 10 === 1 ? 'streak-static' : ''}`} style={{ '--streak-size': `${Math.min(1.8, 1 + ((streak - 1) % 10) * 0.07)}rem` }} title="Dagar i rad med en registrerad check-in"><span className="streak-flame" aria-hidden="true">🔥</span><strong>{streak}</strong> {streak === 1 ? 'dag' : 'dagar'} i rad</div>}
        </div>}
      </section>
      {profile && chatVisible && <OpenChatCard key="coach-info" data={communityPreview} error={communityPreviewError} onOpen={onCommunityChat || onCommunity} />}
      {profile && <OpenChatCard key="pep-feed" data={communityPreview} error={communityPreviewError} channel="pep" onOpen={onCommunity} />}
      </SwimmerHeroCarousel>
      {profile && points?.recentRewards?.length > 0 && <RewardCelebration rewards={points.recentRewards} />}

      {profile && responses.some((item) => item.profileId === profile.id && dateKey(responseDate(item)) === todayKey()) && <DailyProgressCard responses={responses.filter((item) => item.profileId === profile.id)} />}

      {profile && <StartCard profile={profile} onStart={onStart} onStartYesterday={ownResponsesLoaded && !hasYesterdayCheckin && !hasLocalYesterdayCheckin ? onStartYesterday : null} yesterdayLabel={yesterdayDate.toLocaleDateString('sv-SE', { weekday: 'long' })} followUp={followUp} raceFollowUp={raceFollowUp} />}
      {profile && pendingDevelopmentTalk && <DevelopmentTalkCard talk={pendingDevelopmentTalk} onOpen={onTalk} />}
      {profile && <WorkoutCard workout={workout} locked={workoutLocked} />}
      {profile && newDevelopmentGoals.length > 0 && <NewDevelopmentGoalCard goals={newDevelopmentGoals} onOpen={onGoals} />}
      {profile && <CompetitionSignupCard competitions={competitions} onOpen={onCompetitions} />}
      {profile && training?.assignments?.some((assignment) => assignment.program?.type === 'strength') && <StrengthProgramCard training={training} onOpen={onStrengthProgram || onGoals} />}
      {profile && training?.assignments?.some((assignment) => assignment.program?.type === 'dryland') && <StrengthProgramCard programType="dryland" training={training} onOpen={onDrylandProgram || onGoals} />}
      {profile && <NotificationCard profile={profile} notifications={notifications} onChange={onNotificationsChange} onCommunity={onCommunity} onGoals={onGoals} />}
      {profile && <PushNotificationControl code={code} compact />}
      {profile && <WeeklySwimCard training={training} showStars={starsEnabled} halloween={swimmerThemesEnabled && swimmerTheme === 'halloween'} onOpen={onGoals} onToggle={onToggleSession} onPlan={onTogglePlan} />}
      {profile && <GameCard games={availableGames} previousGames={previousGames} onOpen={onGame} onVanda={onVanda} onSwimgames={onSwimgames} onAljakten={onAljakten} onBreakout={onBreakout} onSprint={onSprint} onLongJump={onLongJump} onBikeRun={onBikeRun} onTwenty48={onTwenty48} onAllTime={onAllTime} onDino={onDino} />}
      {profile && appFeedbackEnabled && <AppFeedbackCard code={code} />}
      {!profile && <StartCard profile={profile} onStart={onStart} followUp={followUp} raceFollowUp={raceFollowUp} />}
    </div>
  )
}

function StrengthProgramCard({ training, onOpen, programType = 'strength' }) {
  const kind = programKind(programType)
  const assignment = training?.assignments?.find((item) => item.program?.type === programType)
  if (!assignment) return null
  return <section className="strength-program-card swimmer-program-shortcut"><span className="swimmer-program-shortcut-icon" aria-hidden="true">{kind.icon}</span><div><p className="swimmer-program-shortcut-type">{kind.title}</p><h3>{assignment.program.title}</h3></div><button type="button" className="primary-button" aria-label={`Öppna ${kind.name}: ${assignment.program.title}`} onClick={onOpen}>Öppna →</button></section>
}

function SwimmerHeroCarousel({ children, enabled, initialIndex = 0, infoRequest, infoIndex = 1, labels = ['Idag i gruppen', 'Info från tränarna'], regionLabel = 'Gruppens läge och tränarinfo', className = '', autoHeight = false }) {
  const track = useRef(null)
  const activeRef = useRef(0)
  const [active, setActive] = useState(0)
  const [height, setHeight] = useState(null)
  const slides = React.Children.toArray(children)
  const nearestSlideIndex = (element) => {
    if (!element?.children.length) return 0
    const trackLeft = element.getBoundingClientRect().left
    let nearestIndex = 0
    let nearestDistance = Infinity
    Array.from(element.children).forEach((slide, index) => {
      const distance = Math.abs(slide.getBoundingClientRect().left - trackLeft)
      if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = index }
    })
    return nearestIndex
  }
  const goTo = (index, smooth = true) => {
    const element = track.current
    if (!element) return
    const targetIndex = Math.max(0, Math.min(slides.length - 1, index))
    const slide = element.children[targetIndex]
    if (!slide) return
    activeRef.current = targetIndex
    setActive(targetIndex)
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const left = element.scrollLeft + slide.getBoundingClientRect().left - element.getBoundingClientRect().left
    element.scrollTo({ left, behavior: smooth && !reduceMotion ? 'smooth' : 'instant' })
  }
  useLayoutEffect(() => {
    const index = enabled ? Math.max(0, Math.min(slides.length - 1, initialIndex)) : 0
    activeRef.current = index
    setActive(index)
    if (enabled) goTo(index, false)
  }, [enabled, initialIndex])
  useEffect(() => { if (enabled && infoRequest > 0) goTo(infoIndex) }, [infoRequest, enabled, infoIndex])
  useEffect(() => {
    if (!enabled || !track.current) { activeRef.current = 0; setActive(0); return }
    const index = Math.min(activeRef.current, slides.length - 1)
    if (index !== activeRef.current) { activeRef.current = index; setActive(index); goTo(index, false) }
    let width = track.current.clientWidth
    const observer = new ResizeObserver(() => {
      const nextWidth = track.current?.clientWidth
      if (nextWidth && nextWidth !== width) { width = nextWidth; goTo(activeRef.current, false) }
    })
    observer.observe(track.current)
    return () => observer.disconnect()
  }, [enabled, slides.length])
  useEffect(() => {
    const element = track.current
    if (!enabled || !element) return
    const settleOnNearestSlide = () => goTo(nearestSlideIndex(element), false)
    element.addEventListener('scrollend', settleOnNearestSlide)
    return () => element.removeEventListener('scrollend', settleOnNearestSlide)
  }, [enabled, slides.length])
  useLayoutEffect(() => {
    if (!enabled || !autoHeight) { setHeight(null); return }
    const slide = track.current?.children[active]
    if (!slide) return
    const measure = () => setHeight(Math.ceil(slide.getBoundingClientRect().height))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(slide)
    return () => observer.disconnect()
  }, [enabled, autoHeight, active, slides.length])
  return <div className={`swimmer-hero-carousel ${className}`} role="region" aria-label={regionLabel} aria-roledescription="karusell">
    <div className={`swimmer-hero-track${autoHeight ? ' auto-height' : ''}`} style={autoHeight && height ? { height } : undefined} ref={track} tabIndex={enabled ? 0 : -1} onScroll={(event) => {
      const element = event.currentTarget
      const index = nearestSlideIndex(element)
      if (index !== activeRef.current) { activeRef.current = index; setActive(index) }
    }} onKeyDown={(event) => {
      if (event.target !== event.currentTarget || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
      event.preventDefault(); goTo(activeRef.current + (event.key === 'ArrowRight' ? 1 : -1))
    }}>
      {slides.map((slide, index) => <div key={slide.key || index} className="swimmer-hero-slide" role="group" aria-roledescription="kort" aria-label={`${index + 1} av ${slides.length}: ${labels[index]}`} inert={active !== index}>{slide}</div>)}
    </div>
    {enabled && slides.length > 1 && <div className="swimmer-hero-navigation">
      <button type="button" className="hero-slide-arrow" disabled={active === 0} aria-label={`Visa ${labels[Math.max(0, active - 1)]}`} onClick={() => goTo(active - 1)}>←</button>
      <div className="hero-slide-indicators">{labels.map((label, index) => <button type="button" key={label} aria-label={`Visa ${label}`} aria-pressed={active === index} onClick={() => goTo(index)}><span /></button>)}</div>
      <span className="hero-slide-label" aria-live="polite">{labels[active]}</span>
      <button type="button" className="hero-slide-arrow" disabled={active === slides.length - 1} aria-label={`Visa ${labels[Math.min(slides.length - 1, active + 1)]}`} onClick={() => goTo(active + 1)}>→</button>
    </div>}
  </div>
}

function OpenChatCard({ data, error = false, onOpen, channel = 'coach' }) {
  const chat = data?.openChat
  const feed = data?.items || []
  const isPep = channel === 'pep'
  const messages = isPep ? feed.slice(0, 2) : (chat?.messages || []).filter((item) => item.senderRole === 'coach').slice(-2).reverse()
  const background = chatBackgroundUrl(chat?.backgroundImage || '/assets/open-chat-bg-teal.png')
  return <section className="open-chat-card hero-coach-preview" style={{ backgroundImage: `linear-gradient(rgba(239,250,247,.88),rgba(255,253,248,.94)),url(${background})` }}>
    <div><p className="eyebrow">{isPep ? 'Tillsammans i gruppen' : 'Från tränarna'}</p><h2>{isPep ? 'Peppflödet 🙌' : 'Info från tränarna 💬'}</h2><p>{isPep ? 'Peppa varandra, fråga och snacka simning.' : 'Träningsinfo, samlingar och hälsningar.'}</p></div>
    {messages.length > 0 ? <div className="open-chat-preview">{messages.map((item) => <article key={`${item.type || 'chat'}-${item.id}`}><span aria-hidden="true">{isPep ? (item.sender?.emoji || '🧑‍🏫') : '🧑‍🏫'}</span><div><strong>{item.sender?.displayName || 'Tränare'}</strong><p>{item.content}</p><small>{formatFeedDate(item.createdAt)}</small></div></article>)}</div> : <p className="open-chat-empty" role="status">{error ? 'Kunde inte hämta meddelanden just nu.' : !chat ? 'Laddar meddelanden…' : isPep ? 'Bli först med en hälsning till gruppen!' : 'Inga meddelanden från tränarna ännu.'}</p>}
    <button type="button" className="primary-button" onClick={onOpen}>{isPep ? 'Öppna peppflödet →' : 'Öppna tränarinfo →'}</button>
    <small>{isPep ? 'Öppen kanal · alla i klubben kan läsa.' : <>Läs hela meddelanden och {chat?.coachOnly ? 'följ informationen från tränarna.' : 'ställ en fråga.'}</>}</small>
  </section>
}

function CoachLetterBadge({ code, chat, profileId, onOpen }) {
  const [hasMessage, setHasMessage] = useState(false)
  const [messageKey, setMessageKey] = useState('')
  const [readKey, setReadKey] = useState('')
  const opened = Boolean(messageKey && messageKey === readKey)
  useEffect(() => {
    const latest = latestCoachMessageId(chat?.messages)
    setHasMessage(Boolean(latest)); setMessageKey(latest)
    try { setReadKey(localStorage.getItem(coachInfoReadKey(profileId)) || '') } catch { setReadKey('') }
  }, [chat, profileId])
  if (!hasMessage || opened) return null
  const open = () => {
    if (!opened && messageKey) {
      setReadKey(messageKey)
      markCoachMessageRead(window.localStorage, profileId, messageKey)
      void apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'coach-info-opened', sourceKey: messageKey }) }).catch(() => {})
    }
    onOpen()
  }
  return <button type="button" className="coach-letter-badge" onClick={open} aria-label="Nytt meddelande från tränarna – öppna" title="Nytt meddelande från tränarna"><span className="coach-letter-envelope" aria-hidden="true"><svg viewBox="0 0 48 36" focusable="false"><rect x="2" y="2" width="44" height="32" rx="5" fill="#ffdc59" stroke="#b77916" strokeWidth="2" /><path d="M3 30 18 17M45 30 30 17" fill="none" stroke="#d79928" strokeWidth="2" /><path d="m3 5 18 15a5 5 0 0 0 6 0L45 5" fill="#ffe995" stroke="#b77916" strokeWidth="2" strokeLinejoin="round" /></svg></span></button>
}

const CHAT_EMOJIS = ['🏊', '💙', '💚', '💛', '❤️', '💪', '👏', '🙌', '😊', '🤩', '🔥', '🌊']

function ChatEmojiPicker({ onPick }) {
  const [open, setOpen] = useState(false)
  return <div className="chat-emoji-picker"><button type="button" className="chat-emoji-trigger" aria-label="Välj emoji" onClick={() => setOpen((value) => !value)}>😊</button>{open && <div className="chat-emoji-menu">{CHAT_EMOJIS.map((emoji) => <button type="button" key={emoji} onClick={() => { onPick(emoji); setOpen(false) }}>{emoji}</button>)}</div>}</div>
}

function CompetitionSignupCard({ competitions = [], onOpen }) {
  const open = competitions.filter((item) => item.entriesOpen && (item.endDate || item.startDate) >= todayKey()).sort((a, b) => a.startDate.localeCompare(b.startDate))
  if (!open.length) return null
  return <section className="competition-signup-card"><div><p className="eyebrow">Ny tävlingsplanering</p><h2>Välj dina grenar 🏊</h2><p>{open.length === 1 ? open[0].title : `${open.length} tävlingar`} är öppna för anmälan.</p></div><button type="button" className="primary-button" onClick={onOpen}>Öppna anmälan →</button></section>
}

function NewDevelopmentGoalCard({ goals, onOpen }) {
  const latest = goals[0]
  return <section className="competition-signup-card new-development-goal-card">
    <div><p className="eyebrow">Nytt från tränarna</p><h2>{goals.length === 1 ? 'Ett nytt utvecklingsmål 🎯' : `${goals.length} nya utvecklingsmål 🎯`}</h2><p>{goals.length === 1 ? latest.title : 'Tränarna har lagt till mål för dig.'} Läs målet och svara gärna med dina tankar.</p></div>
    <button type="button" className="primary-button" onClick={onOpen}>Visa mina mål →</button>
  </section>
}

function DevelopmentTalkCard({ talk, onOpen }) {
  const meetingDate = talk.meetingDate
    ? new Date(`${talk.meetingDate}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
    : null
  const prepared = talk.status === 'prepared'
  return <section className="competition-signup-card development-talk-home-card">
    <div><p className="eyebrow">Från tränarna</p><h2>Utvecklingssamtal 🤝</h2><p>{prepared ? 'Dina svar är redo inför samtalet.' : 'Förbered dig inför ett samtal med tränaren.'}{meetingDate && <> <span className="development-talk-date">{meetingDate}</span></>}</p></div>
    <button type="button" className="primary-button" onClick={() => onOpen(talk.id)}>{prepared ? 'Visa mina svar' : 'Förbered samtalet'} →</button>
  </section>
}

function DailyProgressCard({ responses }) {
  const todayResponse = latestCheckinForDay(responses, todayKey())
  const todayDone = Boolean(todayResponse)
  const status = checkinStatus(todayResponse)
  return <section className="daily-progress-card"><div><p className="eyebrow">Din status idag</p><h2>{todayDone ? 'Du är incheckad ✓' : 'Hur är läget?'}</h2><small>{todayDone ? `Senaste status: ${status || 'svar registrerat'}` : 'En snabb check-in hjälper dig och tränaren.'}</small></div></section>
}

function NotificationCard({ profile, notifications, onChange, onCommunity, onGoals }) {
  const storageKey = `simkoll-notifications-seen-${profile.id}`
  const [seen, setSeen] = useState(() => {
    try { return new Set(JSON.parse(window.localStorage.getItem(storageKey) || '[]')) } catch { return new Set() }
  })
  const unread = notifications.filter((item) => !seen.has(item.id))
  if (!unread.length) return null
  const dismiss = (item) => {
    const next = new Set(seen).add(item.id)
    setSeen(next)
    window.localStorage.setItem(storageKey, JSON.stringify([...next].slice(-100)))
    onChange(notifications.filter((entry) => entry.id !== item.id))
  }
  const open = (item) => { dismiss(item); if (item.type === 'goal') onGoals(); else if (item.type !== 'artifact') onCommunity() }
  return <section className="notification-card"><div className="notification-heading"><div><p className="eyebrow">Nytt för dig</p><h2>Du har fått något</h2></div><span>{unread.length}</span></div><div className="notification-list">{unread.slice(0, 4).map((item) => <article key={item.id}><span className="notification-icon">{item.icon}</span><button className="notification-content" onClick={() => open(item)}><strong>{item.title}</strong><p>{item.text}</p><small>{formatFeedDate(item.createdAt)} · Visa →</small></button><button className="notification-dismiss" aria-label="Markera som läst" onClick={() => dismiss(item)}>×</button></article>)}</div>{unread.length > 4 && <button className="notification-more" onClick={() => unread.forEach(dismiss)}>Markera alla som lästa</button>}</section>
}

function StartCard({ profile, onStart, onStartYesterday, yesterdayLabel, followUp = false, raceFollowUp = false }) {
  const followUpTitle = raceFollowUp ? 'Hur gick simtävlingen?' : 'Hur gick simträningen?'
  return <section className="start-card"><div><p className="eyebrow">{profile ? `${profile.emoji} ${profile.displayName}` : 'Din tur'}</p><h2>{followUp || raceFollowUp ? followUpTitle : 'Hur är läget?'}</h2><p>{raceFollowUp ? 'Berätta kort hur tävlingen gick.' : followUp ? 'Berätta kort hur passet kändes efteråt.' : 'Det tar mindre än 20 sekunder.'}</p></div><div className="start-card-actions"><button className="primary-button" onClick={onStart}>{followUp || raceFollowUp ? 'Svara efteråt' : 'Checka in'} <span>→</span></button>{onStartYesterday && <button className="text-button yesterday-checkin-button" onClick={onStartYesterday}>Glömde du checka in {yesterdayLabel}? <span>Efterregistrera →</span></button>}</div></section>
}

function GameCard({ games = GAME_CATALOG, previousGames = [], onOpen, onVanda, onSwimgames, onAljakten, onBreakout, onSprint, onLongJump, onBikeRun, onTwenty48, onAllTime, onDino }) {
  const actions = { swimgames: onSwimgames, vanda: onVanda, simpaus: () => onOpen(), aljakten: onAljakten, breakout: onBreakout, sprint100: onSprint, longjump: onLongJump, hurdles100: () => onOpen('hurdles100'), bikerun: onBikeRun, twenty48: onTwenty48, dino: onDino, balance: () => onOpen('balance') }
  return <SwimmerHeroCarousel enabled autoHeight labels={['Veckans spel', 'Tidigare veckors spel', 'All time-topplista']} regionLabel="Spel och topplistor" className="games-carousel">
    <section className="game-card"><div><p className="eyebrow">Veckans spel</p><h2>{games.length ? games[0].title : 'Inga spel just nu'} {games.length ? games[0].emoji : '🎮'}</h2><p>{games.length ? games[0].description : 'Tränaren har inte publicerat något spel ännu.'}</p><div className="game-choice">{games.map((game, index) => <button type="button" key={game.key} className={index === 0 ? 'primary-button' : 'secondary-button'} onClick={actions[game.key]}>{game.title} {game.emoji} →</button>)}</div></div></section>
    <section className="game-card game-archive"><div><p className="eyebrow">Spelhistorik</p><h2>Tidigare veckors spel 📚</h2><p>{previousGames.length ? `${previousGames.length} tidigare spel att välja mellan.` : 'Här samlas spelen när en ny spelvecka börjar.'}</p><div className="previous-games-list">{previousGames.map((game) => <button type="button" className="secondary-button" key={game.key} onClick={() => actions[game.key]?.()}>{game.title} {game.emoji} →</button>)}</div></div></section>
    <section className="game-card game-records"><div><p className="eyebrow">Rekord genom tiderna</p><h2>All time-topplista 🏆</h2><p>Se de bästa resultaten från alla spel och tidigare veckor.</p><button type="button" className="primary-button" onClick={onAllTime}>Öppna topplistan →</button></div></section>
  </SwimmerHeroCarousel>
}

function useLegacyGameFullscreen(selector) {
  useEffect(() => {
    const board = document.querySelector(selector); if (!board) return undefined
    const target = selector === '.swimgames-board' ? (board.parentElement || board) : board
    let button = board.querySelector('.legacy-game-fullscreen')
    const managedButton = !button
    if (!button) { button = document.createElement('button'); button.type = 'button'; button.className = 'secondary-button legacy-game-fullscreen'; button.textContent = '⛶ Fullskärm'; board.appendChild(button) }
    const update = () => { const active = document.fullscreenElement === target || document.webkitFullscreenElement === target; const immersive = active || target.classList.contains('legacy-game-immersive'); target.classList.toggle('legacy-game-active', active); target.classList.toggle('legacy-game-immersive', !active && target.classList.contains('legacy-game-immersive')); button.textContent = immersive ? '↙ Lämna fullskärm' : '⛶ Fullskärm'; if (immersive) { button.style.position = 'fixed'; button.style.top = 'max(12px, env(safe-area-inset-top))'; button.style.right = 'max(12px, env(safe-area-inset-right))'; button.style.zIndex = '1001'; } else { button.style.position = ''; button.style.top = ''; button.style.right = ''; button.style.zIndex = ''; } }
    const toggle = async () => { try { if (document.fullscreenElement === target) await document.exitFullscreen(); else if (document.webkitFullscreenElement === target) await document.webkitExitFullscreen?.(); else if (target.requestFullscreen) await target.requestFullscreen(); else if (target.webkitRequestFullscreen) target.webkitRequestFullscreen(); else { target.classList.toggle('legacy-game-immersive'); update() } } catch { target.classList.add('legacy-game-immersive'); update() } }
    button.addEventListener('click', toggle); document.addEventListener('fullscreenchange', update); document.addEventListener('webkitfullscreenchange', update); return () => { button.removeEventListener('click', toggle); document.removeEventListener('fullscreenchange', update); document.removeEventListener('webkitfullscreenchange', update); if (managedButton) button.remove() }
  }, [selector])
}

function AppFeedbackCard({ code, coach = false }) {
  const [open, setOpen] = useState(false); const [sent, setSent] = useState(false); const [form, setForm] = useState({ rating: 0, bestArea: '', improveArea: '', featureRequest: '', comment: '' }); const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const submit = async (event) => { event.preventDefault(); if (!form.rating) return; try { await apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'app-feedback', ...form }) }); setSent(true); setOpen(false) } catch (error) { window.alert(error.message) } }
  if (sent) return <section className="app-feedback-card compact"><span>✓</span><div><strong>Tack för feedbacken!</strong><small>Den hjälper oss att göra Simkoll bättre.</small></div></section>
  return <section className={`app-feedback-card${open ? ' open' : ''}`}><button type="button" className="app-feedback-trigger" onClick={() => setOpen((value) => !value)}><span>💬</span><div><strong>Hur kan vi göra Simkoll bättre?</strong><small>{coach ? 'Tränarfeedback · tar mindre än en minut.' : 'En snabb fråga – tar mindre än en minut.'}</small></div><b>{open ? '×' : '→'}</b></button>{open && <form onSubmit={submit} className="app-feedback-form"><fieldset><legend>Hur känns appen hittills?</legend><div className="app-rating">{['😕', '😐', '🙂', '😄', '🤩'].map((emoji, index) => <button type="button" className={form.rating === index + 1 ? 'selected' : ''} key={emoji} onClick={() => set('rating', index + 1)}>{emoji}<small>{index + 1}</small></button>)}</div></fieldset><label>Vad gillar du mest?<select value={form.bestArea} onChange={(event) => set('bestArea', event.target.value)}><option value="">Välj ett alternativ…</option><option value="checkin">Check-in</option><option value="goals">Mina mål</option><option value="games">Veckans spel</option><option value="planning">Träningsplanering</option><option value="messages">Pepp och meddelanden</option><option value="other">Annat</option></select></label><label>Vad kan bli bättre?<select value={form.improveArea} onChange={(event) => set('improveArea', event.target.value)}><option value="">Välj ett alternativ…</option><option value="speed">Snabbhet och enkelhet</option><option value="design">Design och utseende</option><option value="content">Innehåll</option><option value="features">Funktioner</option><option value="other">Annat</option></select></label><label>Vilken funktion vill du helst se?<select value={form.featureRequest} onChange={(event) => set('featureRequest', event.target.value)}><option value="">Välj ett alternativ…</option><option value="statistics">Mer statistik</option><option value="games">Fler spel</option><option value="messages">Chatt och pepp</option><option value="planning">Planering</option><option value="other">Annat</option></select></label><textarea maxLength={500} placeholder="Något du vill skriva? (frivilligt)" value={form.comment} onChange={(event) => set('comment', event.target.value)} /><button className="primary-button" disabled={!form.rating}>Skicka feedback →</button></form>}</section>
}

function AllTimeGames({ code, onBack }) {
  const [data, setData] = useState(null)
  useEffect(() => { apiRequest('/api/points?game=alltime', code).then(setData).catch(() => setData({ leaderboard: [] })) }, [code])
  return <section className="game-page"><button className="back-button inline" onClick={onBack}>← Tillbaka</button><div className="game-layout"><div><p className="eyebrow">Veckans spel</p><h1>All time-topplistan 🏆</h1><p className="game-intro">En permanent ranking från alla spel över tid. Vinnaren i varje spel får 10 poäng, sedan 9–1.</p></div><section className="game-scoreboard"><p className="eyebrow">Alla spel tillsammans</p><h2>Top 10</h2>{data?.leaderboard?.length ? <div>{data.leaderboard.map((item) => <article key={item.displayName}><b>{item.rank}</b><span>{item.emoji}</span><strong>{item.displayName}</strong><em>{item.score}</em></article>)}</div> : <p className="empty">Ingen har spelat ännu.</p>}</section></div></section>
}

const formatRaceTime = (milliseconds) => { const total = Math.max(0, Math.round(milliseconds)); const minutes = Math.floor(total / 60000); const seconds = Math.floor((total % 60000) / 1000); const hundredths = Math.floor((total % 1000) / 10); return `${minutes}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}` }
const formatRaceTimeMs = (milliseconds) => { const total = Math.max(0, Math.round(milliseconds)); const minutes = Math.floor(total / 60000); const seconds = Math.floor((total % 60000) / 1000); const millis = total % 1000; return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}` }
const SWIMGAMES_LENGTHS = 1
const SWIMGAMES_DISTANCE_METERS = 25

const twenty48Spawn = (board) => { const empty = []; board.forEach((row, r) => row.forEach((value, c) => { if (!value) empty.push([r, c]) })); if (!empty.length) return board; const [r, c] = empty[Math.floor(Math.random() * empty.length)]; const next = board.map((row) => [...row]); next[r][c] = Math.random() < .9 ? 2 : 4; return next }
const twenty48NewBoard = () => twenty48Spawn(twenty48Spawn(Array.from({ length: 4 }, () => Array(4).fill(0))))
const twenty48Slide = (line) => { const values = line.filter(Boolean); const merged = []; let gained = 0; for (let index = 0; index < values.length; index += 1) { if (values[index] === values[index + 1]) { const value = values[index] * 2; merged.push(value); gained += value; index += 1 } else merged.push(values[index]) } return { line: [...merged, ...Array(4 - merged.length).fill(0)], gained } }
const twenty48Move = (board, direction) => { const rotate = (input) => input[0].map((_, column) => input.map((row) => row[column]).reverse()); let working = board.map((row) => [...row]); for (let turns = 0; turns < direction; turns += 1) working = rotate(working); const slid = working.map((row) => twenty48Slide(row)); working = slid.map((item) => item.line); for (let turns = 0; turns < (4 - direction) % 4; turns += 1) working = rotate(working); return { board: working, changed: JSON.stringify(working) !== JSON.stringify(board), gained: slid.reduce((sum, item) => sum + item.gained, 0) } }
const twenty48CanMove = (board) => board.some((row, r) => row.some((value, c) => !value || value === board[r]?.[c + 1] || value === board[r + 1]?.[c]))

function Twenty48({ code, onBack, preview = false }) {
  const [board, setBoard] = useState(twenty48NewBoard)
  const [score, setScore] = useState(0)
  const [status, setStatus] = useState('ready')
  const [best, setBest] = useState({ leaderboard: [], ownBest: 0 })
  const [fullscreen, setFullscreen] = useState(false)
  const shellRef = useRef(null); const touchRef = useRef(null)
  useEffect(() => { if (!preview) apiRequest('/api/points?game=twenty48&lifetime=true', code).then(setBest).catch(() => {}) }, [code, preview])
  const reset = () => { setBoard(twenty48NewBoard()); setScore(0); setStatus('playing') }
  const move = (direction) => { if (status !== 'playing') return; const result = twenty48Move(board, direction); if (!result.changed) { if (!twenty48CanMove(board)) setStatus('over'); return } const next = twenty48Spawn(result.board); const nextScore = score + result.gained; setBoard(next); setScore(nextScore); if (next.flat().includes(2048)) setStatus('won'); else if (!twenty48CanMove(next)) setStatus('over') }
  useEffect(() => { const key = (event) => { const keys = { ArrowLeft: 0, ArrowUp: 1, ArrowRight: 2, ArrowDown: 3 }; if (keys[event.key] != null) { event.preventDefault(); move(keys[event.key]) } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key) })
  useEffect(() => { if (!['won', 'over'].includes(status) || preview || score <= 0) return; apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit-game-score', gameKey: 'twenty48', score }) }).then(setBest).catch(() => {}) }, [status])
  const toggleFullscreen = async () => { if (!shellRef.current) return; try { if (document.fullscreenElement) await document.exitFullscreen(); else await shellRef.current.requestFullscreen?.() } catch {} setFullscreen(Boolean(document.fullscreenElement)) }
  useEffect(() => { const update = () => setFullscreen(Boolean(document.fullscreenElement)); document.addEventListener('fullscreenchange', update); return () => document.removeEventListener('fullscreenchange', update) }, [])
  const tileClass = (value) => `twenty48-tile tile-${value || 0}`
  return <section className="game-page twenty48-page"><button className="back-button inline" onClick={onBack}>← Tillbaka</button><div className="game-layout"><div><p className="eyebrow">Veckans spel · 2048</p><h1>2048 🔢</h1><p className="game-intro">Slå ihop lika brickor och försök nå 2048. Svep på mobilen eller använd piltangenterna.</p><div ref={shellRef} className="twenty48-shell"><button type="button" className="twenty48-fullscreen" onClick={toggleFullscreen}>{fullscreen ? '↙ Lämna fullskärm' : '⛶ Fullskärm'}</button><div className="twenty48-head"><span>Poäng <strong>{score}</strong></span><span>Bästa <strong>{Math.max(score, best.ownBest || 0)}</strong></span></div><div className="twenty48-board" onTouchStart={(event) => { const touch = event.touches[0]; touchRef.current = [touch.clientX, touch.clientY] }} onTouchEnd={(event) => { if (!touchRef.current) return; const touch = event.changedTouches[0]; const dx = touch.clientX - touchRef.current[0]; const dy = touch.clientY - touchRef.current[1]; touchRef.current = null; if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return; move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 0) : (dy > 0 ? 3 : 1)) }}>{board.flat().map((value, index) => <span className={tileClass(value)} key={index}>{value || ''}</span>)}</div>{status !== 'playing' && <div className="game-overlay"><span>{status === 'won' ? '🏆' : status === 'over' ? '💥' : '🔢'}</span><strong>{status === 'won' ? 'Du nådde 2048!' : status === 'over' ? 'Inga drag kvar' : 'Redo?'}</strong><small>{status === 'ready' ? 'Bygg större brickor och slå ditt rekord.' : `Du fick ${score} poäng.`}</small><button className="primary-button" onClick={reset}>{status === 'ready' ? 'Starta spelet' : 'Spela igen'}</button></div>}</div>{status === 'playing' && <button className="secondary-button twenty48-new" onClick={reset}>Nytt spel</button>}</div><section className="game-scoreboard"><p className="eyebrow">2048 · all time</p><h2>Topplistan</h2>{best.leaderboard?.length ? <div>{best.leaderboard.map((item) => <article key={item.profileId}><b>{item.rank}</b><span>{item.emoji}</span><strong>{item.displayName}</strong><em>{item.score}</em></article>)}</div> : <p className="empty">Ingen har spelat ännu.</p>}</section></div></section>
}

function BikeRun({ code, onBack, preview = false }) {
  const canvasRef = useRef(null)
  const frameRef = useRef(null)
  const stateRef = useRef({ running: false, finished: false, crashed: false, start: 0, x: 70, y: 0, vy: 0, angle: 0, control: 0, score: 0 })
  const [status, setStatus] = useState('ready')
  const [result, setResult] = useState(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [data, setData] = useState({ leaderboard: [], ownBest: 0 })
  useEffect(() => { if (!preview) apiRequest('/api/points?game=bikerun&lifetime=true', code).then(setData).catch(() => {}) }, [code, preview])
  const draw = (ctx, width, height, game) => {
    const scale = width / 900; ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#bdebf0'; ctx.fillRect(0, 0, width, height); ctx.fillStyle = '#fff'; for (let i = 0; i < 8; i += 1) { ctx.globalAlpha = .35; ctx.beginPath(); ctx.arc((i * 150 - game.x * .2) % (width + 100), 58 + (i % 3) * 25, 18, 0, Math.PI * 2); ctx.fill() } ctx.globalAlpha = 1; ctx.fillStyle = '#71a65b'; ctx.fillRect(0, height * .63, width, height * .37); ctx.strokeStyle = '#345944'; ctx.lineWidth = 4 * scale; ctx.beginPath(); ctx.moveTo(0, height * .63); for (let x = 0; x < width; x += 8 * scale) { const world = x / scale + game.x; const ramp = [500, 1050, 1700, 2350, 3000].find((point) => Math.abs(world - point) < 110); const y = ramp ? height * .63 - Math.sin((world - ramp + 110) / 220 * Math.PI) * height * .14 : height * .63; ctx.lineTo(x, y) } ctx.stroke(); ctx.fillStyle = '#df8247'; [500, 1050, 1700, 2350, 3000].forEach((point) => { const sx = (point - game.x) * scale; if (sx > -150 && sx < width + 150) { ctx.beginPath(); ctx.moveTo(sx - 110 * scale, height * .63); ctx.lineTo(sx, height * .49); ctx.lineTo(sx + 110 * scale, height * .63); ctx.fill() } }); const bikeX = width * .18, bikeY = height * .63 - 25 * scale; ctx.save(); ctx.translate(bikeX, bikeY); ctx.rotate(game.angle); ctx.strokeStyle = '#173a4c'; ctx.lineWidth = 5 * scale; ctx.beginPath(); ctx.moveTo(-28 * scale, 4 * scale); ctx.lineTo(0, -24 * scale); ctx.lineTo(28 * scale, 4 * scale); ctx.moveTo(-28 * scale, 4 * scale); ctx.lineTo(28 * scale, 4 * scale); ctx.stroke(); ctx.fillStyle = '#e9654b'; ctx.fillRect(-4 * scale, -54 * scale, 8 * scale, 30 * scale); ctx.fillStyle = '#182e3a'; ctx.beginPath(); ctx.arc(-28 * scale, 8 * scale, 13 * scale, 0, Math.PI * 2); ctx.arc(28 * scale, 8 * scale, 13 * scale, 0, Math.PI * 2); ctx.fill(); ctx.restore(); ctx.fillStyle = '#153b4d'; ctx.fillRect(16, 16, 220, 42); ctx.fillStyle = '#fff'; ctx.font = `${18 * scale}px Manrope, sans-serif`; ctx.fontWeight = '800'; ctx.fillText(`Tid ${((performance.now() - game.start) / 1000).toFixed(1)} s`, 30, 43); ctx.fillText(`${Math.min(100, Math.round(game.x / 3900 * 100))}%`, 188, 43)
  }
  useEffect(() => { const canvas = canvasRef.current; if (!canvas) return undefined; const ctx = canvas.getContext('2d'); const game = stateRef.current; const resize = () => { const rect = canvas.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1; canvas.width = Math.max(1, rect.width * ratio); canvas.height = Math.max(1, rect.height * ratio); ctx.setTransform(ratio, 0, 0, ratio, 0, 0) }; resize(); window.addEventListener('resize', resize); const tick = (now) => { if (game.running) { const dt = Math.min(.035, (now - (game.last || now)) / 1000); game.last = now; game.x += 250 * dt; game.vy += 900 * dt; game.y += game.vy * dt; const ground = 330 - (Math.abs(game.x % 700 - 350) < 100 ? Math.sin((game.x % 700 - 250) / 200 * Math.PI) * 70 : 0); if (game.y >= ground - 34) { game.y = ground - 34; game.vy = 0; game.angle *= .82 } else game.angle += game.control * dt * .9; game.angle = Math.max(-.75, Math.min(.75, game.angle)); if (Math.abs(game.angle) > 1.2) { game.running = false; game.crashed = true; setStatus('crashed') } else if (game.x >= 3900) { game.running = false; game.finished = true; const time = (now - game.start) / 1000; game.score = Math.max(1, Math.round(10000 - time * 100)); setResult({ time, score: game.score }); setStatus('over'); if (!preview) apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit-game-score', gameKey: 'bikerun', score: game.score }) }).then(setData).catch(() => {}) } } draw(ctx, canvas.clientWidth, canvas.clientHeight, game); frameRef.current = requestAnimationFrame(tick) }; frameRef.current = requestAnimationFrame(tick); return () => { cancelAnimationFrame(frameRef.current); window.removeEventListener('resize', resize) } }, [code, preview])
  const start = () => { const game = stateRef.current; game.running = true; game.finished = false; game.crashed = false; game.start = performance.now(); game.last = game.start; game.x = 70; game.y = 296; game.vy = 0; game.angle = 0; setResult(null); setStatus('running') }
  const control = (value) => { stateRef.current.control = value }
  const toggleFullscreen = async () => { const target = canvasRef.current?.parentElement; if (!target) return; try { if (document.fullscreenElement) await document.exitFullscreen(); else await target.requestFullscreen?.() } catch { target.classList.toggle('bike-run-immersive') } setFullscreen(Boolean(document.fullscreenElement)) }
  useEffect(() => { const update = () => setFullscreen(Boolean(document.fullscreenElement)); document.addEventListener('fullscreenchange', update); return () => document.removeEventListener('fullscreenchange', update) }, [])
  return <section className="game-page bike-run-page"><button className="back-button inline" onClick={onBack}>← Tillbaka</button><div className="game-layout"><div><p className="eyebrow">Veckans spel · Bike Run</p><h1>Bike Run 🏍️</h1><p className="game-intro">Håll balansen över banan och ta dig till mål så snabbt du kan.</p><div className="bike-run-shell"><button type="button" className="bike-run-fullscreen" onClick={toggleFullscreen}>{fullscreen ? '↙ Lämna fullskärm' : '⛶ Fullskärm'}</button><canvas ref={canvasRef} className="bike-run-canvas" />{status !== 'running' && <div className="game-overlay"><span>{status === 'over' ? '🏁' : status === 'crashed' ? '💥' : '🏍️'}</span><strong>{status === 'over' ? `Mål på ${result.time.toFixed(1)} sekunder` : status === 'crashed' ? 'Cykeln välte' : 'Redo?'}</strong><small>{status === 'over' ? `${result.score} poäng` : 'Luta med knapparna i hoppen.'}</small><button className="primary-button" onClick={start}>{status === 'ready' ? 'Starta banan' : 'Kör igen'}</button></div>}</div><div className="bike-run-controls"><button onPointerDown={() => control(-1)} onPointerUp={() => control(0)} onPointerLeave={() => control(0)}>↙ Luta bakåt</button><button onPointerDown={() => control(1)} onPointerUp={() => control(0)} onPointerLeave={() => control(0)}>Luta framåt ↗</button></div></div><section className="game-scoreboard"><p className="eyebrow">Bike Run · all time</p><h2>Topplistan</h2><p className="game-best">Ditt bästa resultat: <strong>{data.ownBest || '—'}</strong></p>{data.leaderboard?.length ? <div>{data.leaderboard.map((item) => <article key={item.profileId}><b>{item.rank}</b><span>{item.emoji}</span><strong>{item.displayName}</strong><em>{item.score}</em></article>)}</div> : <p className="empty">Ingen har kört ännu.</p>}</section></div></section>
}

function PreppeBreakout({ code, onBack, preview = false }) {
  const canvasRef = useRef(null)
  const shellRef = useRef(null)
  const gameRef = useRef({ running: false, raf: null, last: 0, paddleX: 240, paddleWidth: 80, ball: { x: 240, y: 560, vx: 210, vy: -290 }, bricks: [], score: 0, lives: 1, level: 1 })
  const [status, setStatus] = useState('ready')
  const [hud, setHud] = useState({ score: 0, lives: 3, level: 1 })
  const [best, setBest] = useState({ ownBest: 0, leaderboard: [] })
  const [fullscreen, setFullscreen] = useState(false)
  const [resettingScore, setResettingScore] = useState(false)
  const makeBricks = (level = 1) => { const pattern = level % 3; const palette = [['#ffcf4a', '#ef8b68', '#65c6c9', '#9e9bea', '#f49bb6', '#7bd39a'], ['#ff8a65', '#ffd166', '#06d6a0', '#4cc9f0', '#8d99ae', '#f72585'], ['#f9c74f', '#90be6d', '#43aa8b', '#577590', '#f9844a', '#f94144']][(level - 1) % 3]; return Array.from({ length: Math.min(8, 5 + level) }, (_, row) => Array.from({ length: 8 }, (_, column) => { const hollow = pattern === 1 && row > 0 && row < 4 && column > 1 && column < 6 && row % 2 === 0; const checker = pattern === 2 && (row + column) % 3 === 0; return { x: 18 + column * 57, y: 82 + row * 30, width: 50, height: 20, color: palette[row % palette.length], alive: !(hollow || checker) } })).flat() }
  useEffect(() => { if (!preview) apiRequest('/api/points?game=breakout&lifetime=true', code).then(setBest).catch(() => {}); return () => cancelAnimationFrame(gameRef.current.raf) }, [code, preview])
  const resetBall = (current) => { current.ball = { x: 240, y: 550, vx: (Math.random() > .5 ? 1 : -1) * 255, vy: -345 } }
  const finish = () => { const current = gameRef.current; current.running = false; setStatus('over'); if (!preview && current.score > 0) apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit-game-score', gameKey: 'breakout', score: current.score }) }).then(setBest).catch(() => {}) }
  const resetScore = async () => { if (preview || resettingScore || !window.confirm('Nollställ ditt Breakout-resultat? Detta går inte att ångra.')) return; setResettingScore(true); try { const data = await apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset-game-score', gameKey: 'breakout' }) }); setBest(data) } catch (error) { window.alert(error.message) } finally { setResettingScore(false) } }
  const start = () => { const current = gameRef.current; current.running = true; current.last = 0; current.score = 0; current.lives = 1; current.level = 1; current.paddleX = 240; current.paddleWidth = 80; current.bricks = makeBricks(1); resetBall(current); setHud({ score: 0, lives: 1, level: 1 }); setStatus('running'); cancelAnimationFrame(current.raf); current.raf = requestAnimationFrame(loop) }
  const movePaddle = (event) => { const canvas = canvasRef.current; if (!canvas) return; const rect = canvas.getBoundingClientRect(); gameRef.current.paddleX = Math.max(48, Math.min(432, ((event.clientX - rect.left) / rect.width) * 480)) }
  const loop = (now) => { const canvas = canvasRef.current; const current = gameRef.current; if (!canvas || !current.running) return; const ctx = canvas.getContext('2d'); const dt = Math.min(.03, (now - (current.last || now)) / 1000); current.last = now; const ball = current.ball; ball.x += ball.vx * dt; ball.y += ball.vy * dt; if (ball.x < 11 || ball.x > 469) { ball.x = Math.max(11, Math.min(469, ball.x)); ball.vx *= -1 } if (ball.y < 55) { ball.y = 55; ball.vy = Math.abs(ball.vy) } const paddle = { x: current.paddleX - current.paddleWidth / 2, y: 594, width: current.paddleWidth, height: 14 }; if (ball.vy > 0 && ball.y + 9 >= paddle.y && ball.y - 9 <= paddle.y + paddle.height && ball.x >= paddle.x - 8 && ball.x <= paddle.x + paddle.width + 8) { const offset = (ball.x - current.paddleX) / (current.paddleWidth / 2); ball.vx = 300 * offset; ball.vy = -Math.max(300, 370 - Math.abs(offset) * 55) } for (const brick of current.bricks) if (brick.alive && ball.x + 9 > brick.x && ball.x - 9 < brick.x + brick.width && ball.y + 9 > brick.y && ball.y - 9 < brick.y + brick.height) { brick.alive = false; current.score += 10; ball.vy *= -1; break } if (ball.y > 650) { finish(); return } if (current.bricks.every((brick) => !brick.alive)) { current.level += 1; current.paddleWidth = Math.max(38, 80 - (current.level - 1) * 8); current.bricks = makeBricks(current.level); const speed = Math.min(1.22, 1.04 + current.level * .025); ball.vx *= speed; ball.vy *= speed } setHud({ score: current.score, lives: 1, level: current.level }); ctx.clearRect(0, 0, 480, 640); drawBoard(ctx, current); current.raf = requestAnimationFrame(loop) }
  const drawBoard = (ctx, current) => { const backgrounds = [['#102f77', '#07143e'], ['#3b176d', '#120b35'], ['#075985', '#082f49'], ['#7c2d12', '#2b0b18']]; const [top, bottom] = backgrounds[(current.level - 1) % backgrounds.length]; const gradient = ctx.createLinearGradient(0, 0, 0, 640); gradient.addColorStop(0, top); gradient.addColorStop(1, bottom); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 480, 640); ctx.strokeStyle = 'rgba(117, 207, 255, .12)'; for (let x = 0; x < 480; x += 32) { ctx.beginPath(); ctx.moveTo(x, 45); ctx.lineTo(x - 80, 640); ctx.stroke() } for (let y = 80; y < 640; y += 34) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(480, y); ctx.stroke() } current.bricks.filter((brick) => brick.alive).forEach((brick) => { ctx.fillStyle = brick.color; ctx.beginPath(); ctx.roundRect(brick.x, brick.y, brick.width, brick.height, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(brick.x + 5, brick.y + 4, brick.width - 10, 3) }); ctx.fillStyle = '#ffd34f'; ctx.beginPath(); ctx.roundRect(current.paddleX - current.paddleWidth / 2, 594, current.paddleWidth, 14, 7); ctx.fill(); ctx.fillStyle = '#fff6c7'; ctx.beginPath(); ctx.arc(current.ball.x, current.ball.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(current.ball.x - 2, current.ball.y - 2, 3, 0, Math.PI * 2); ctx.fill() }
  const toggleFullscreen = async () => { const target = shellRef.current; if (!target) return; try { if (document.fullscreenElement === target) await document.exitFullscreen(); else if (document.webkitFullscreenElement === target) await document.webkitExitFullscreen?.(); else if (target.requestFullscreen) await target.requestFullscreen(); else if (target.webkitRequestFullscreen) await target.webkitRequestFullscreen(); else target.classList.toggle('breakout-immersive') } catch { target.classList.toggle('breakout-immersive') } setFullscreen(Boolean(document.fullscreenElement === target || document.webkitFullscreenElement === target || target.classList.contains('breakout-immersive'))) }
  useEffect(() => { const update = () => setFullscreen(Boolean(document.fullscreenElement === shellRef.current || document.webkitFullscreenElement === shellRef.current || shellRef.current?.classList.contains('breakout-immersive'))); document.addEventListener('fullscreenchange', update); document.addEventListener('webkitfullscreenchange', update); return () => { document.removeEventListener('fullscreenchange', update); document.removeEventListener('webkitfullscreenchange', update) } }, [])
  useEffect(() => { const canvas = canvasRef.current; if (!canvas) return; const resize = () => { const rect = canvas.getBoundingClientRect(); canvas.width = 480; canvas.height = 640; canvas.style.aspectRatio = '3 / 4'; if (rect.width > 0 && !gameRef.current.running) { const ctx = canvas.getContext('2d'); drawBoard(ctx, gameRef.current) } }; resize(); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize) }, [])
  return <section className="game-page breakout-page"><button className="back-button inline" onClick={onBack}>← Tillbaka</button><div className="game-layout"><div><p className="eyebrow">Veckans spel · Breakout</p><h1>Breakout 🧱</h1><p className="game-intro">Flytta racket med fingret eller musen. Håll bollen i spel och slå sönder brickorna.</p><div ref={shellRef} className="breakout-shell"><button type="button" className="breakout-fullscreen" onClick={toggleFullscreen}>{fullscreen ? '↙ Lämna fullskärm' : '⛶ Fullskärm'}</button><div className="breakout-hud"><span>Poäng <strong>{hud.score}</strong></span><span>Nivå <strong>{hud.level}</strong></span></div><canvas ref={canvasRef} onPointerMove={movePaddle} onPointerDown={(event) => { movePaddle(event); if (status !== 'running') start() }} />{status !== 'running' && <div className="game-overlay"><span>{status === 'over' ? '🏆' : '🧱'}</span><strong>{status === 'over' ? 'Spelet är slut' : 'Redo för Breakout?'}</strong><small>{status === 'over' ? `Du fick ${hud.score} poäng.` : 'Slå sönder brickorna och håll bollen i spel.'}</small><button className="primary-button" onPointerDown={(event) => event.stopPropagation()} onClick={start}>{status === 'ready' ? 'Starta spelet' : 'Spela igen'}</button></div>}</div><button className="secondary-button breakout-start" onClick={start}>{status === 'running' ? 'Starta om' : '▶ Starta'}</button></div><section className="game-scoreboard"><p className="eyebrow">Breakout · all time</p><h2>Topplistan</h2>{best.leaderboard?.length ? <div>{best.leaderboard.map((item) => <article key={item.profileId}><b>{item.rank}</b><span>{item.emoji}</span><strong>{item.displayName}</strong><em>{item.score}</em></article>)}</div> : <p className="empty">Ingen har spelat ännu.</p>}</section></div></section>
}

function Zigzag({ code, onBack, preview = false }) {
  const shellRef = useRef(null)
  const gameRef = useRef({ running: false, x: 0, y: 3, direction: 1, score: 0, bonus: 0, last: 0, timer: null })
  const [status, setStatus] = useState('ready')
  const [game, setGame] = useState({ x: 0, y: 3, score: 0, bonus: 0 })
  const [best, setBest] = useState({ ownBest: 0, leaderboard: [] })
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => { if (!preview) apiRequest('/api/points?game=zigzag&lifetime=true', code).then(setBest).catch(() => {}); return () => window.clearInterval(gameRef.current.timer) }, [code, preview])
  const finish = (reason = 'over') => { const current = gameRef.current; current.running = false; window.clearInterval(current.timer); setStatus(reason); if (!preview && current.score > 0) apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit-game-score', gameKey: 'zigzag', score: current.score }) }).then(setBest).catch(() => {}) }
  const step = () => { const current = gameRef.current; if (!current.running) return; current.x += 1; current.y += current.direction; if (current.y < 1 || current.y > 5) return finish('crashed'); if (current.x % 7 === 0) current.direction *= -1; if (current.x % 13 === 0) { current.score += 1; current.bonus += 1 } else current.score += 1; setGame({ x: current.x, y: current.y, score: current.score, bonus: current.bonus }) }
  const start = () => { const current = gameRef.current; current.running = true; current.x = 0; current.y = 3; current.direction = Math.random() > .5 ? 1 : -1; current.score = 0; current.bonus = 0; setGame({ x: 0, y: 3, score: 0, bonus: 0 }); setStatus('running'); window.clearInterval(current.timer); current.timer = window.setInterval(step, 170) }
  const turn = () => { if (status === 'ready' || status === 'over' || status === 'crashed') return start(); if (gameRef.current.running) gameRef.current.direction *= -1 }
  const toggleFullscreen = async () => { const target = shellRef.current; if (!target) return; try { if (document.fullscreenElement) await document.exitFullscreen(); else await target.requestFullscreen?.() } catch { target.classList.toggle('zigzag-immersive') } setFullscreen(Boolean(document.fullscreenElement)) }
  useEffect(() => { const key = (event) => { if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'ArrowDown') { event.preventDefault(); turn() } }; const update = () => setFullscreen(Boolean(document.fullscreenElement)); window.addEventListener('keydown', key); document.addEventListener('fullscreenchange', update); return () => { window.removeEventListener('keydown', key); document.removeEventListener('fullscreenchange', update) } }, [status])
  const visible = Array.from({ length: 13 }, (_, index) => ({ x: index, y: 3 + Math.round(Math.sin((game.x + index * 2) / 7) * 1.5) }))
  return <section className="game-page zigzag-page"><button className="back-button inline" onClick={onBack}>← Tillbaka</button><div className="game-layout"><div><p className="eyebrow">Veckans spel · Zigzag</p><h1>Preppe Zigzag 〰️</h1><p className="game-intro">Tryck eller klicka för att byta riktning. Håll Preppe på banan så länge som möjligt.</p><div ref={shellRef} className="zigzag-shell" onPointerDown={turn}><button type="button" className="zigzag-fullscreen" onPointerDown={(event) => event.stopPropagation()} onClick={toggleFullscreen}>{fullscreen ? '↙ Lämna fullskärm' : '⛶ Fullskärm'}</button><div className="zigzag-hud"><span>Poäng <strong>{game.score}</strong></span><span>Bästa <strong>{Math.max(game.score, best.ownBest || 0)}</strong></span></div><div className="zigzag-lane">{visible.map((tile) => <span className="zigzag-tile" key={tile.x} style={{ left: `${tile.x * 9 - (game.x % 1) * 9}%`, top: `${28 + tile.y * 10}%` }} />)}<span className="zigzag-preppe" style={{ top: `${28 + game.y * 10}%` }}>🐍</span>{game.bonus > 0 && <span className="zigzag-bonus">⭐ +{game.bonus}</span>}</div>{status !== 'running' && <div className="game-overlay"><span>{status === 'crashed' ? '💦' : '〰️'}</span><strong>{status === 'crashed' ? 'Oj, Preppe föll av!' : 'Redo för zigzag?'}</strong><small>{status === 'crashed' ? `Du fick ${game.score} poäng.` : 'Byt riktning och samla så många poäng du kan.'}</small><button className="primary-button" onPointerDown={(event) => event.stopPropagation()} onClick={start}>{status === 'ready' ? 'Starta spelet' : 'Spela igen'}</button></div>}</div><button className="secondary-button zigzag-turn-button" onClick={turn}>{status === 'running' ? '↕ Byt riktning' : '▶ Starta'}</button></div><section className="game-scoreboard"><p className="eyebrow">Preppe Zigzag · all time</p><h2>Topplistan</h2>{best.leaderboard?.length ? <div>{best.leaderboard.map((item) => <article key={item.profileId}><b>{item.rank}</b><span>{item.emoji}</span><strong>{item.displayName}</strong><em>{item.score}</em></article>)}</div> : <p className="empty">Ingen har spelat ännu.</p>}</section></div></section>
}

function Swimgames({ code, onBack, preview = false }) {
  useLegacyGameFullscreen('.swimgames-board')
  const [status, setStatus] = useState('ready')
  const [length, setLength] = useState(0)
  const [direction, setDirection] = useState('left')
  const [phase, setPhase] = useState('idle')
  const [turnMessage, setTurnMessage] = useState('')
  const [signal, setSignal] = useState('')
  const [speed, setSpeed] = useState(52)
  const [reactionMs, setReactionMs] = useState(null)
  const [strokeSide, setStrokeSide] = useState('')
  const [strokePulse, setStrokePulse] = useState(0)
  const [liveTime, setLiveTime] = useState(0)
  const [resultMs, setResultMs] = useState(null)
  const [gameData, setGameData] = useState({ leaderboard: [], ownBest: 0 })
  const swimmerRef = useRef(null)
  const waterFillRef = useRef(null)
  const raceRef = useRef({ start: 0, goAt: 0, distance: 0, pace: 2.1, lastArm: '', lastStroke: 0, frame: null, timers: [], lastTick: 0 })

  useEffect(() => {
    if (!preview) apiRequest('/api/points?game=swimgames&lifetime=true', code).then(setGameData).catch(() => {})
    return () => { cancelAnimationFrame(raceRef.current.frame); raceRef.current.timers.forEach((timer) => window.clearTimeout(timer)) }
  }, [code, preview])

  const finish = (race, disqualified = false) => {
    if (disqualified) { cancelAnimationFrame(race.frame); race.frame = null; setStatus('disqualified'); setPhase('foul'); return }
    const simulated = Math.max(0, Math.round(performance.now() - race.start))
    setLiveTime(simulated); setResultMs(simulated); setStatus('over'); setPhase('finish')
    if (swimmerRef.current) swimmerRef.current.style.left = '94%'
    if (waterFillRef.current) { waterFillRef.current.style.width = '100%'; waterFillRef.current.style.marginLeft = '0' }
    const score = Math.max(0, 100000 - simulated)
    if (!preview) apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit-game-score', gameKey: 'swimgames', score }) }).then(setGameData).catch(() => {})
  }

  const loop = (now) => {
    const race = raceRef.current; const delta = Math.min(80, now - (race.lastTick || now)); race.lastTick = now
    race.pace = Math.max(1.15, race.pace - delta / 1000 * 0.42)
    race.distance = Math.min(SWIMGAMES_DISTANCE_METERS, race.distance + race.pace * delta / 1000)
    const currentProgress = race.distance / SWIMGAMES_DISTANCE_METERS
    if (race.distance >= SWIMGAMES_DISTANCE_METERS) { finish(race); return }
    setLiveTime(Math.round(now - race.start))
    setLength(currentProgress >= 1 ? SWIMGAMES_LENGTHS : 0)
    setSpeed(Math.round(Math.min(100, race.pace / 3.8 * 100)))
    if (swimmerRef.current) swimmerRef.current.style.left = `${Math.max(0, Math.min(94, currentProgress * 94))}%`
    if (waterFillRef.current) { waterFillRef.current.style.width = `${currentProgress * 100}%`; waterFillRef.current.style.marginLeft = '0' }
    race.frame = requestAnimationFrame(loop)
  }

  const start = () => {
    const race = { start: 0, goAt: 0, distance: 0, pace: 2.1, startReaction: 0, lastArm: '', lastStroke: 0, phase: 'idle', frame: null, timers: [], lastTick: 0 }
    raceRef.current = race; setLength(0); setDirection('left'); setPhase('idle'); setSpeed(0); setReactionMs(null); setStrokeSide(''); setStrokePulse(0); setLiveTime(0); setTurnMessage(''); setResultMs(null); setSignal('Vissling!'); setStatus('starting')
    if (swimmerRef.current) swimmerRef.current.style.left = '0%'
    if (waterFillRef.current) { waterFillRef.current.style.width = '0%'; waterFillRef.current.style.marginLeft = '0' }
    race.timers.push(window.setTimeout(() => setSignal('På era platser'), 700))
    race.timers.push(window.setTimeout(() => { race.goAt = performance.now(); setSignal('GO!'); setStatus('start-go'); setPhase('start') }, 1500))
  }

  const beginRace = () => { const race = raceRef.current; race.start = performance.now(); race.lastTick = race.start; race.startReaction = race.start - race.goAt; race.phase = 'swim'; setLiveTime(0); setReactionMs(Math.round(race.startReaction)); setSignal(''); setStatus('running'); setPhase('swim'); race.frame = requestAnimationFrame(loop) }

  const centerAction = () => {
    if (status === 'ready') { start(); return }
    if (status === 'starting') { setSignal('Tjuvstart!'); setTurnMessage('För tidig start – diskvalificerad'); setStatus('disqualified'); setPhase('foul'); return }
    if (status === 'start-go') beginRace()
  }

  const armStroke = (side) => {
    if (status === 'start-go') { beginRace(); return }
    if (status !== 'running') return
    const race = raceRef.current; const now = performance.now()
    if (phase === 'swim') {
      const interval = race.lastStroke ? now - race.lastStroke : 240
      const rhythmScore = Math.max(0, Math.min(100, Math.round(100 - Math.abs(interval - 220) * .42)))
      const alternationBonus = race.lastArm && race.lastArm !== side ? 0.25 : 0
      race.lastArm = side; race.lastStroke = now; race.pace = Math.min(3.8, 2.1 + rhythmScore / 100 * 1.35 + alternationBonus)
      setStrokeSide(side); setStrokePulse((value) => value + 1); setSpeed(Math.round(Math.min(100, race.pace / 3.8 * 100)))
      setTurnMessage(`${side === 'left' ? 'Vänster' : 'Höger'} ✓`)
    }
  }

  return <section className="game-page swimgames-page"><button className="back-button inline" onClick={onBack}>← Tillbaka</button><div className="game-layout"><div><p className="eyebrow">Veckans spel · Swimgames</p><h1>Swimgames 25 🏊</h1><p className="game-intro"><strong>25 m bassäng × 1 längd = 25 m.</strong> Tryck Start och växla vänster och höger så snabbt du kan.</p><div className={`swimgames-board ${status} stroke-${strokeSide} pulse-${strokePulse % 2}`}><div className="swimgames-player-track"><div><strong>{status === 'running' ? `Längd ${Math.min(length + 1, SWIMGAMES_LENGTHS)} av ${SWIMGAMES_LENGTHS}` : '25 m frisim'}</strong><small>{turnMessage || (status === 'running' ? 'Växla vänster och höger så snabbt du kan' : 'Starta när du är redo')}</small></div><div className="player-water"><span ref={swimmerRef}>🏊</span><i ref={waterFillRef} /></div><div className="player-distance"><span>{direction === 'left' ? '← Start' : 'Start →'}</span><span className="wall-label">25 m · MÅL</span></div></div><div className="swimgames-live-clock" aria-live="polite"><span>TID</span><strong>{formatRaceTimeMs(status === 'running' ? liveTime : status === 'over' ? resultMs : 0)}</strong></div>{(status === 'starting' || status === 'start-go') && <div className="swimgames-signal">🔔 <strong>{signal}</strong></div>}<div className="swim-meters"><span>⚡ Reaktion <b>{reactionMs == null ? "—" : reactionMs + " ms"}</b></span><i><em className="reaction-meter" style={{ width: (reactionMs == null ? 0 : Math.max(0, Math.min(100, 100 - reactionMs / 6))) + "%" }} /></i><span>🚀 Hastighet <b>{speed}</b></span><i><em className="speed-meter" style={{ width: speed + "%" }} /></i></div>{(status === 'over' || status === 'disqualified') && <div className="swimgames-overlay"><span>{status === 'over' ? '🏁' : status === 'disqualified' ? '🚩' : '🏊'}</span><strong>{status === 'over' ? `Din tid ${formatRaceTimeMs(resultMs)}` : status === 'disqualified' ? 'Diskvalificerad' : 'Redo för start?'}</strong><small>{status === 'over' ? 'Startreaktion och växling påverkar tiden.' : status === 'disqualified' ? 'Tjuvstart – du tryckte innan GO.' : 'Tryck Start och växla sedan vänster och höger så snabbt du kan.'}</small><button className="primary-button" onClick={start}>{status === 'over' || status === 'disqualified' ? 'Simma igen' : 'Starta race'}</button></div>}</div><div className="swimgames-controls"><button className={strokeSide === "left" ? "stroke-active" : ""} disabled={status !== "running"} onPointerDown={(event) => { event.preventDefault(); armStroke("left") }}>← Vänster</button><button className="turn" disabled={status !== "ready" && status !== "starting" && status !== "start-go"} onClick={centerAction}>Start</button><button className={strokeSide === "right" ? "stroke-active" : ""} disabled={status !== "running"} onPointerDown={(event) => { event.preventDefault(); armStroke("right") }}>Höger →</button></div></div><section className="game-scoreboard"><p className="eyebrow">Swimgames · all time</p><h2>25 frisim</h2><p className="game-best">Ditt bästa lopp: <strong>{gameData.ownBest ? formatRaceTime(100000 - gameData.ownBest) : '—'}</strong></p>{gameData.leaderboard?.length ? <div>{gameData.leaderboard.map((item) => <article key={item.profileId}><b>{item.rank}</b><span>{item.emoji}</span><strong>{item.displayName}</strong><em>{item.displayTime}</em></article>)}</div> : <p className="empty">Ingen har simmat ännu.</p>}<small>Spelets perfekta riktmärke är 9 sekunder. Topplistan sparas över tid.</small></section></div></section>
}


function DevelopmentTalkSwimmer({ code, talkId = null, onBack }) {
  const [talks, setTalks] = useState([]); const [talk, setTalk] = useState(null); const [step, setStep] = useState(0); const [saving, setSaving] = useState(false); const [status, setStatus] = useState(''); const [answersDirty, setAnswersDirty] = useState(false)
  const savingRef = useRef(false)
  useEffect(() => { let active = true; apiRequest('/api/goals?talks=true', code).then((data) => { if (!active) return; const nextTalks = data.talks || []; setTalks(nextTalks); const activeTalk = latestActiveDevelopmentTalk(nextTalks); const nextTalk = nextTalks.find((item) => item.id === talkId) || activeTalk || [...nextTalks].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0]; if (nextTalk) { setTalk(nextTalk); const savedStep = Number(nextTalk.swimmerAnswers?.__step || 0); setStep(Math.max(0, Math.min(TALK_STEPS.length - 1, savedStep))); if (nextTalk.enabled && !nextTalk.swimmerSeenAt) apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mark-talk-viewed', id: nextTalk.id }) }).catch(() => {}) } }).catch((error) => { if (active) setStatus(`Kunde inte hämta utvecklingssamtalet: ${error.message}`) }); return () => { active = false } }, [code, talkId])
  const answers = Object.fromEntries(Object.entries(talk?.swimmerAnswers || {}).filter(([key]) => key !== '__step'))
  const preparedSent = talk?.status === 'prepared' && !answersDirty
  const update = (key, value) => { setAnswersDirty(true); setStatus(''); setTalk((current) => ({ ...(current || { swimmerAnswers: {} }), swimmerAnswers: { ...(current?.swimmerAnswers || {}), [key]: value } })) }
  const save = async (nextStatus = 'draft', leaveAfter = false, stepToSave = step) => { if (savingRef.current) return; savingRef.current = true; setSaving(true); setStatus(''); try { const data = await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-talk', id: talk?.id, expectedUpdatedAt: talk?.updatedAt, swimmerAnswers: { ...answers, __step: stepToSave }, status: nextStatus }) }); setTalk(data.talk); setTalks((current) => [data.talk, ...current.filter((item) => item.id !== data.talk.id)]); setAnswersDirty(false); setStatus(nextStatus === 'prepared' || leaveAfter ? '' : 'Sparat – du kan fortsätta senare.'); if (leaveAfter) onBack(); else if (nextStatus === 'prepared') window.setTimeout(onBack, 900) } catch (error) { setStatus(error.message) } finally { savingRef.current = false; setSaving(false) } }
  const current = TALK_STEPS[step]
  return <div className="talk-page"><button className="back-button" onClick={onBack}>← Tillbaka</button><section className="talk-content"><p className="eyebrow">Din utveckling</p><h1>Utvecklingssamtal</h1><p className="talk-intro">En kort förberedelse inför vårt samtal. Det finns inget rätt eller fel svar.</p><div className="talk-progress"><span>{step + 1} av {TALK_STEPS.length} delar</span><i><b style={{ width: `${((step + 1) / TALK_STEPS.length) * 100}%` }} /></i></div><section className="talk-card"><h2>{current[0]} {current[1]}</h2>{current[2].map(([key, label]) => <label key={key}>{label}<textarea value={answers[key] || ''} maxLength={1000} placeholder="Skriv några rader…" onChange={(event) => update(key, event.target.value)} /></label>)}<div className="talk-actions"><button className="secondary-button" disabled={!step || saving} onClick={() => setStep((value) => value - 1)}>← Föregående</button>{step < TALK_STEPS.length - 1 ? <button className="primary-button" onClick={() => { setStep((value) => value + 1); save('draft', false, step + 1) }} disabled={saving}>{saving ? 'Sparar…' : 'Nästa →'}</button> : <button className={`primary-button talk-submit-button${preparedSent ? ' is-confirmed' : ''}`} onClick={() => save('prepared')} disabled={saving || preparedSent}>{saving ? <><span className="talk-button-spinner" aria-hidden="true" /> Skickar till tränarna…</> : preparedSent ? '✓ Redo för samtalet – skickat' : 'Redo för samtalet 🙌'}</button>}</div><button className="talk-pause-button" type="button" disabled={saving} onClick={() => save('draft', true)}>{saving ? 'Sparar utkast…' : 'Spara och fortsätt senare'}</button>{preparedSent && <div className="talk-ready-confirmation" role="status" aria-live="polite"><span className="talk-ready-check" aria-hidden="true">✓</span><span><strong>Klart – tränarna har fått dina svar</strong><small>Dina förberedelser är sparade inför samtalet.</small></span></div>}{status && <small className="talk-status" role="status">{status}</small>}</section><details className="talk-history"><summary>Tidigare samtal ({talks.length})</summary>{talks.map((item) => <p key={item.id}>{item.meetingDate} · {item.status === 'completed' ? 'Genomfört' : 'Förbereds'}</p>)}</details></section></div>
}

function Vandningsmastaren({ code, onBack, preview = false }) {
  useLegacyGameFullscreen('.reaction-stage')
  const timerRef = useRef(null)
  const goAtRef = useRef(0)
  const [status, setStatus] = useState('ready')
  const [round, setRound] = useState(0)
  const [score, setScore] = useState(0)
  const [lastReaction, setLastReaction] = useState(null)
  const [teamBonus, setTeamBonus] = useState(null)
  const [gameData, setGameData] = useState({ leaderboard: [], ownBest: 0 })

  useEffect(() => {
    if (!preview) apiRequest('/api/points?game=vanda&lifetime=true', code).then(setGameData).catch(() => {})
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current) }
  }, [code, preview])

  const finish = (finalScore, failed = false) => {
    setStatus(failed ? 'false' : 'over')
    if (!preview) apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit-game-score', gameKey: 'vanda', score: finalScore }) }).then((data) => { setGameData(data); if (data.teamBonus?.unlocked) setTeamBonus(data.teamBonus) }).catch(() => {})
  }

  const nextTurn = (nextRound, currentScore) => {
    if (nextRound >= 5) { finish(currentScore); return }
    setRound(nextRound)
    setStatus('waiting')
    timerRef.current = window.setTimeout(() => { goAtRef.current = performance.now(); setStatus('go') }, 900 + Math.random() * 1700)
  }

  const start = () => { setScore(0); setLastReaction(null); setRound(0); setStatus('waiting'); timerRef.current = window.setTimeout(() => { goAtRef.current = performance.now(); setStatus('go') }, 1000 + Math.random() * 1500) }
  const turn = () => {
    if (status === 'waiting') { if (timerRef.current) window.clearTimeout(timerRef.current); finish(0, true); return }
    if (status !== 'go') return
    const reaction = Math.round(performance.now() - goAtRef.current)
    const gained = Math.max(50, 1100 - reaction)
    const nextScore = score + gained
    setLastReaction(reaction); setScore(nextScore); nextTurn(round + 1, nextScore)
  }

  return <section className="game-page reaction-page"><button className="back-button inline" onClick={onBack}>← Tillbaka</button><div className="game-layout"><div><p className="eyebrow">Månadens spel · reaktion</p><h1>Vändningsmästaren ↻</h1><p className="game-intro">Vänta på <strong>VÄND!</strong> och tryck så snabbt du kan. Tjuvtrycker du blir rundan nollad.</p>{teamBonus && <div className="team-game-bonus">🎉 Gruppen klarade målet! Alla som deltagit får <strong>+20 poäng</strong>.</div>}<div className="reaction-stage"><div className={`reaction-board ${status}`}><div className="pool-lanes" aria-hidden="true"><i /><i /><i /></div><span>{status === 'go' ? 'VÄND!' : status === 'waiting' ? 'Vänta…' : status === 'false' ? 'För tidigt!' : status === 'over' ? 'Bra jobbat!' : 'Redo?'}</span><small>{status === 'go' ? 'Tryck nu!' : status === 'waiting' ? `Runda ${round + 1} av 5` : status === 'false' ? 'Starta om och vänta på signalen.' : lastReaction ? `${lastReaction} ms · ${score} poäng` : 'Fem snabba vändningar.'}</small><button className="reaction-button" onClick={status === 'ready' || status === 'over' || status === 'false' ? start : turn}>{status === 'ready' ? 'Starta' : status === 'over' || status === 'false' ? 'Spela igen' : 'Tryck här!'}</button></div></div></div><section className="game-scoreboard"><p className="eyebrow">Månadens highscore</p><h2>Vändningslistan</h2><p className="game-best">Ditt rekord: <strong>{gameData.ownBest || 0}</strong></p>{gameData.leaderboard.length ? <div>{gameData.leaderboard.map((item) => <article key={item.profileId}><b>{item.rank}</b><span>{item.emoji}</span><strong>{item.displayName}</strong><em>{item.score}</em></article>)}</div> : <p className="empty">Ingen har spelat ännu.</p>}<small>Poängen visar snabb och schysst reaktion – inte simförmåga. När 10 olika simmare har spelat får deltagarna +20 grupppoäng.</small></section></div></section>
}

function Aljakten({ code, onBack, preview = false }) {
  const canvasRef = useRef(null)
  const boardRef = useRef(null)
  const gameRef = useRef({ running: false })
  const [status, setStatus] = useState('ready')
  const [score, setScore] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [gameData, setGameData] = useState({ leaderboard: [], ownBest: 0 })
  useEffect(() => { if (!preview) apiRequest('/api/points?game=aljakten&lifetime=true', code).then(setGameData).catch(() => {}) }, [code, preview])
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return undefined
    const ctx = canvas.getContext('2d'); const width = canvas.width, height = canvas.height
    const draw = () => { const game = gameRef.current; const now = game.time || 0; const stage = Math.min(9, Math.floor((game.score || 0) / 10)); const palette = [['#b8f3f0', '#55cbd1'], ['#9ee9e8', '#3aa9be'], ['#87d7e6', '#327caf'], ['#799bd8', '#4a5ca8'], ['#8b87d1', '#514277'], ['#725d9c', '#392b5d'], ['#58466f', '#292340'], ['#3b304f', '#1d1a2b'], ['#252532', '#13131b'], ['#611d2b', '#a3313b']][stage]; const gradient = ctx.createLinearGradient(0, 0, width, height); gradient.addColorStop(0, palette[0]); gradient.addColorStop(1, palette[1]); ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height); ctx.fillStyle = 'rgba(115,225,226,.22)'; for (let i = 0; i < 30; i += 1) { const x = (i * 67 + now * (7 + i % 4)) % width; const y = height - ((now * (11 + i % 5) + i * 83) % (height + 40)); const radius = 1.5 + (i % 3); ctx.globalAlpha = .28 + ((Math.sin(now * 2 + i) + 1) / 2) * .5; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill() } ctx.globalAlpha = 1; (game.hazards || []).forEach((hazard, index) => { const x = ((hazard.x + now * hazard.speed) % (width + 100)) - 50; const y = hazard.y + Math.sin(now * .8 + index * 2) * (hazard.drift || 12); const direction = hazard.speed >= 0 ? 1 : -1; const radius = hazard.radius * .72; const length = hazard.length || 4; for (let part = length - 1; part >= 0; part -= 1) { const px = x - direction * part * radius * 1.45; const py = y + Math.sin(now * 1.6 + part * .7 + index) * 2; ctx.globalAlpha = .84 - part * .04; ctx.fillStyle = hazard.color; ctx.beginPath(); ctx.arc(px, py, Math.max(5, radius - part * .18), 0, Math.PI * 2); ctx.fill() } ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + direction * radius * .25 - radius * .34, y - radius * .3, 3, 0, Math.PI * 2); ctx.arc(x + direction * radius * .25 + radius * .34, y - radius * .3, 3, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#173047'; ctx.beginPath(); ctx.arc(x + direction * radius * .25 - radius * .34, y - radius * .3, 1.4, 0, Math.PI * 2); ctx.arc(x + direction * radius * .25 + radius * .34, y - radius * .3, 1.4, 0, Math.PI * 2); ctx.fill() }); if (game.star) { const pulse = 1 + Math.sin(now * 8) * .14; const outer = 14 * pulse; const inner = 6 * pulse; ctx.save(); ctx.translate(game.star.x, game.star.y); ctx.rotate(now * .8); ctx.globalAlpha = .55 + ((Math.sin(now * 8) + 1) / 2) * .45; ctx.fillStyle = '#ffe27a'; ctx.shadowColor = '#ffe27a'; ctx.shadowBlur = 18; ctx.beginPath(); for (let i = 0; i < 10; i += 1) { const radius = i % 2 ? inner : outer; const angle = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius) } ctx.closePath(); ctx.fill(); ctx.restore(); ctx.globalAlpha = 1 } (game.foods || []).forEach((food, index) => { const pulse = Math.sin(now * 3.5 + index) * 1.4; ctx.fillStyle = food.color; ctx.shadowColor = food.color; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(food.x, food.y, food.radius + pulse, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(food.x - food.radius * .28, food.y - food.radius * .28, Math.max(1.5, food.radius * .18), 0, Math.PI * 2); ctx.fill() }); const snake = game.snake || []; const growth = .72 + Math.min(.65, (game.score || 0) * .035); const bodyRadius = 6 + growth * 3.2; snake.slice().reverse().forEach((part, reversedIndex) => { const index = snake.length - 1 - reversedIndex; ctx.fillStyle = index === 0 ? '#ffd84d' : `hsl(${index % 4 === 0 ? 36 : 48 + Math.min(10, index % 10)} 88% ${62 - Math.min(15, index % 12)}%)`; ctx.beginPath(); ctx.arc(part.x, part.y, index === 0 ? bodyRadius + 1.5 : bodyRadius, 0, Math.PI * 2); ctx.fill(); if (index === 0) { const heading = game.heading || 0; const frontX = Math.cos(heading) * bodyRadius * .42; const frontY = Math.sin(heading) * bodyRadius * .42; const sideX = -Math.sin(heading) * bodyRadius * .42; const sideY = Math.cos(heading) * bodyRadius * .42; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(part.x + frontX + sideX, part.y + frontY + sideY, 4.8, 0, Math.PI * 2); ctx.arc(part.x + frontX - sideX, part.y + frontY - sideY, 4.8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#173047'; ctx.beginPath(); ctx.arc(part.x + frontX + sideX, part.y + frontY + sideY, 2.2, 0, Math.PI * 2); ctx.arc(part.x + frontX - sideX, part.y + frontY - sideY, 2.2, 0, Math.PI * 2); ctx.fill() } }); ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.font = '800 24px Manrope, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(game.score || 0), width / 2, 34) }
    const loop = (time) => { const game = gameRef.current; if (!game.running) { draw(); return } const delta = Math.min(.035, (time - game.last) / 1000); game.last = time; game.time = time / 1000; const targetX = game.target.x - game.snake[0].x; const targetY = game.target.y - game.snake[0].y; const targetDistance = Math.hypot(targetX, targetY); const targetAhead = targetX * Math.cos(game.heading || 0) + targetY * Math.sin(game.heading || 0) > 0; if (targetDistance > 10 && targetAhead) game.heading = Math.atan2(targetY, targetX); else if (!targetAhead) game.target = { x: game.snake[0].x + Math.cos(game.heading || 0) * 150, y: game.snake[0].y + Math.sin(game.heading || 0) * 150 }; const speed = game.boostUntil > game.time ? 58 * 2 : 58; const move = speed * delta; const edgeMargin = 7; const head = { x: game.snake[0].x + Math.cos(game.heading) * move, y: game.snake[0].y + Math.sin(game.heading) * move }; const bodyRadius = 6 + (.72 + Math.min(.65, (game.score || 0) * .035)) * 3.2; const canHitSelf = game.snake.length > 24; const hitSelf = canHitSelf && game.snake.slice(20).some((part) => Math.hypot(head.x - part.x, head.y - part.y) < 6); const hazardParts = (hazard, index) => { const x = ((hazard.x + game.time * hazard.speed) % (width + 100)) - 50; const y = hazard.y + Math.sin(game.time * .8 + (hazard.phase || index * 2)) * (hazard.drift || 12); const direction = hazard.speed >= 0 ? 1 : -1; const radius = hazard.radius * .72; return Array.from({ length: hazard.length || 4 }, (_, part) => ({ x: x - direction * part * radius * 1.45, y: y + Math.sin(game.time * 1.6 + part * .7 + index) * 2, radius: Math.max(5, radius - part * .18) })) }; const hazards = game.hazards || []; const hitHazard = hazards.some((hazard, index) => hazardParts(hazard, index).some((part) => Math.hypot(head.x - part.x, head.y - part.y) <= bodyRadius + part.radius)); const defeatedHazardIndexes = hazards.map((hazard, index) => { const parts = hazardParts(hazard, index); const hazardHead = parts[0]; return !hitHazard && game.snake.slice(1).some((part) => Math.hypot(hazardHead.x - part.x, hazardHead.y - part.y) <= bodyRadius + hazardHead.radius) ? index : -1 }).filter((index) => index >= 0); if (head.x < edgeMargin || head.x > width - edgeMargin || head.y < edgeMargin || head.y > height - edgeMargin || hitSelf || hitHazard) { game.running = false; setStatus('over'); if (!preview) apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit-game-score', gameKey: 'aljakten', score: game.score }) }).then(setGameData).catch(() => {}); draw(); return } game.snake.unshift(head); while (game.snake.length > 9 + game.score * 5) game.snake.pop(); if (defeatedHazardIndexes.length) { game.hazards = hazards.filter((_, index) => !defeatedHazardIndexes.includes(index)); game.score += defeatedHazardIndexes.length * 5; setScore(game.score) } const eatenIndex = (game.foods || []).findIndex((food) => Math.hypot(head.x - food.x, head.y - food.y) < food.radius + 11); if (eatenIndex >= 0) { const eaten = game.foods[eatenIndex]; game.score += eaten.points; setScore(game.score); game.foods[eatenIndex] = { x: 22 + Math.random() * (width - 44), y: 60 + Math.random() * (height - 82), radius: eaten.radius, points: eaten.points, color: eaten.color } } draw(); game.frame = requestAnimationFrame(loop) }
    gameRef.current.startLoop = () => { gameRef.current.last = performance.now(); gameRef.current.frame = requestAnimationFrame(loop) }
    const moveTarget = (event) => { const rect = canvas.getBoundingClientRect(); const scale = Math.min(rect.width / width, rect.height / height); const renderedWidth = width * scale; const renderedHeight = height * scale; const offsetX = (rect.width - renderedWidth) / 2; const offsetY = (rect.height - renderedHeight) / 2; const game = gameRef.current; const head = game.snake?.[0] || { x: width / 2, y: height / 2 }; const pointer = { x: Math.max(0, Math.min(width, (event.clientX - rect.left - offsetX) / scale)), y: Math.max(0, Math.min(height, (event.clientY - rect.top - offsetY) / scale)) }; const desired = Math.atan2(pointer.y - head.y, pointer.x - head.x); const current = game.heading || 0; let difference = desired - current; while (difference > Math.PI) difference -= Math.PI * 2; while (difference < -Math.PI) difference += Math.PI * 2; const limited = current + Math.max(-.055, Math.min(.055, difference)); game.target = { x: head.x + Math.cos(limited) * 150, y: head.y + Math.sin(limited) * 150 } }
    const keydown = (event) => { const game = gameRef.current; if (!game.snake?.[0]) return; const turn = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -.18 : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? .18 : 0; if (!turn) return; game.heading = (game.heading || 0) + turn; game.target = { x: game.snake[0].x + Math.cos(game.heading) * 150, y: game.snake[0].y + Math.sin(game.heading) * 150 } }
    const starTimer = window.setInterval(() => { const game = gameRef.current; if (!game.running || !game.snake?.[0]) return; if (!game.star && (game.nextStar == null || game.time > game.nextStar)) { game.star = { x: 38 + Math.random() * (width - 76), y: 70 + Math.random() * (height - 120), radius: 16 }; game.nextStar = game.time + 8 + Math.random() * 7 } if (game.star && Math.hypot(game.snake[0].x - game.star.x, game.snake[0].y - game.star.y) < game.star.radius + 11) { game.score += 5; game.star = null; game.nextStar = game.time + 10; game.boostUntil = game.time + 5; setScore(game.score) } }, 80)
    canvas.addEventListener('pointermove', moveTarget); window.addEventListener('keydown', keydown); draw(); return () => { canvas.removeEventListener('pointermove', moveTarget); window.removeEventListener('keydown', keydown); window.clearInterval(starTimer); if (gameRef.current.frame) cancelAnimationFrame(gameRef.current.frame) }
  }, [code, preview])
  useEffect(() => {
    const respawnTimer = window.setInterval(() => {
      const game = gameRef.current
      if (!game.running || (game.hazards || []).length >= 3) return
      const colors = ['#ffd166', '#f4a261', '#ff9f68', '#e9c46a']
      game.hazards = [...(game.hazards || []), { x: -180 - Math.random() * 260, y: 80 + Math.random() * 340, speed: 20 + Math.random() * 14, radius: 13 + Math.random() * 7, emoji: '🐍', length: 4 + Math.floor(Math.random() * 6), color: colors[Math.floor(Math.random() * colors.length)], drift: 22 + Math.random() * 24, phase: Math.random() * Math.PI * 2 }]
    }, 1800)
    return () => window.clearInterval(respawnTimer)
  }, [])
  useEffect(() => { const onFullscreenChange = () => setFullscreen(document.fullscreenElement === boardRef.current || document.webkitFullscreenElement === boardRef.current); document.addEventListener('fullscreenchange', onFullscreenChange); document.addEventListener('webkitfullscreenchange', onFullscreenChange); return () => { document.removeEventListener('fullscreenchange', onFullscreenChange); document.removeEventListener('webkitfullscreenchange', onFullscreenChange) } }, [])
  const toggleFullscreen = async () => { if (fullscreen && !document.fullscreenElement && !document.webkitFullscreenElement) { setFullscreen(false); return } try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.webkitFullscreenElement) await document.webkitExitFullscreen?.(); else if (boardRef.current?.requestFullscreen) await boardRef.current.requestFullscreen(); else if (boardRef.current?.webkitRequestFullscreen) boardRef.current.webkitRequestFullscreen(); else setFullscreen(true) } catch { setFullscreen(true) } }
  const start = () => { const center = { x: 70, y: 240 }; const foodColors = ['#ffd166', '#f6bd60', '#f7aef8', '#8bd9e2', '#c9f05a']; const foods = Array.from({ length: 7 }, (_, index) => ({ x: 40 + Math.random() * 280, y: 70 + Math.random() * 355, radius: index % 3 === 0 ? 10 : index % 2 === 0 ? 8 : 6, points: index % 3 === 0 ? 2 : 1, color: foodColors[index % foodColors.length] })); const hazards = [{ x: -120, y: 135, speed: 30, size: 20, radius: 13, emoji: '🐍', length: 4, color: '#ffd166', drift: 24, phase: 0 }, { x: -300, y: 320, speed: 24, size: 27, radius: 19, emoji: '🐍', length: 7, color: '#c5a7ff', drift: 42, phase: 2.5 }, { x: -520, y: 410, speed: 20, size: 23, radius: 17, emoji: '🐍', length: 10, color: '#8df5c1', drift: 30, phase: 4 }]; gameRef.current = { ...gameRef.current, running: true, heading: 0, snake: [center, { x: 56, y: 240 }, { x: 42, y: 240 }], hazards, target: { x: 260, y: 240 }, foods, boostUntil: 0, score: 0, time: 0, last: performance.now(), frame: null }; setScore(0); setStatus('running'); window.setTimeout(() => gameRef.current.startLoop?.(), 0) }
  return <section className="game-page aljakten-page"><button className="back-button inline" onClick={onBack}>← Tillbaka</button><div className="game-layout"><div><p className="eyebrow">Veckans spel · Preppejakten</p><h1>Preppejakten 🐍</h1><p className="game-intro">Hjälp Preppe att samla energibubblor och växa. Styr med musen, fingret eller piltangenterna och väj för de andra ormarna.</p><div className="aljakten-actions"><button className="secondary-button" onClick={toggleFullscreen}>{fullscreen ? '↙ Lämna fullskärm' : '⛶ Fullskärm'}</button></div><div ref={boardRef} className={`game-board aljakten-board${fullscreen && !document.fullscreenElement && !document.webkitFullscreenElement ? ' immersive' : ''}`}><canvas ref={canvasRef} width="360" height="480" aria-label="Preppejakten-spelet" />{status !== 'running' && <div className="game-overlay"><span>{status === 'over' ? '💥' : '🐍'}</span><strong>{status === 'over' ? `Du fick ${score} poäng` : 'Redo?'}</strong><small>{status === 'over' ? 'Försök växa ännu längre!' : 'Håll Preppe framför dig och samla bubblorna.'}</small><button className="primary-button" onClick={start}>{status === 'over' ? 'Spela igen' : 'Starta spelet'}</button></div>}</div></div><section className="game-scoreboard"><p className="eyebrow">Preppejakten · all time</p><h2>Topplistan</h2><p className="game-best">Ditt rekord: <strong>{gameData.ownBest || 0}</strong></p>{gameData.leaderboard?.length ? <div>{gameData.leaderboard.map((item) => <article key={item.profileId}><b>{item.rank}</b><span>{item.emoji}</span><strong>{item.displayName}</strong><em>{item.score}</em></article>)}</div> : <p className="empty">Ingen har spelat ännu.</p>}<small>Samla så många energibubblor du kan. Rekorden sparas över tid.</small></section></div></section>
}

function Simpaus({ code, onBack, preview = false }) {
  useLegacyGameFullscreen('.game-board:not(.aljakten-board)')
  const canvasRef = useRef(null)
  const gameRef = useRef({ running: false })
  const [status, setStatus] = useState('ready')
  const [score, setScore] = useState(0)
  const [gameData, setGameData] = useState({ leaderboard: [], ownBest: 0 })

  useEffect(() => { if (!preview) apiRequest('/api/points?game=simpaus&lifetime=true', code).then(setGameData).catch(() => {}) }, [code, preview])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    const width = canvas.width, height = canvas.height
    const draw = () => {
      const game = gameRef.current
      const gradient = ctx.createLinearGradient(0, 0, 0, height); gradient.addColorStop(0, '#123e52'); gradient.addColorStop(1, '#0b293d'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = 'rgba(82,209,196,.12)'; for (let i = 0; i < 8; i += 1) { const x = (i * 53 + (game.time || 0) * 12) % width; const y = 50 + ((i * 71) % 320); ctx.beginPath(); ctx.arc(x, y, 3 + (i % 3), 0, Math.PI * 2); ctx.fill() }
      game.obstacles?.forEach((obstacle) => { ctx.fillStyle = '#c9f05a'; ctx.fillRect(obstacle.x, 0, obstacle.width, obstacle.gap - obstacle.size); ctx.fillRect(obstacle.x, obstacle.gap + obstacle.size, obstacle.width, height); ctx.fillStyle = '#a9d33e'; ctx.fillRect(obstacle.x - 4, obstacle.gap - obstacle.size - 9, obstacle.width + 8, 9); ctx.fillRect(obstacle.x - 4, obstacle.gap + obstacle.size, obstacle.width + 8, 9) })
      const y = game.y ?? height / 2; ctx.font = '30px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🏊', 56, y + 11)
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '800 24px Manrope, sans-serif'; ctx.fillText(String(game.score || 0), width / 2, 38)
    }
    let frame
    const loop = (time) => {
      const game = gameRef.current
      if (!game.running) { draw(); return }
      const delta = Math.min(.035, (time - (game.last || time)) / 1000); game.last = time; game.time = time / 1000; game.velocity += 920 * delta; game.y += game.velocity * delta; game.spawn = (game.spawn || 0) - delta
      if (game.spawn <= 0) { game.obstacles.push({ x: width + 10, width: 42, gap: 110 + Math.random() * 190, size: 66 }); game.spawn = 1.45 }
      ;(game.obstacles || []).forEach((obstacle) => { obstacle.x -= 145 * delta; if (!obstacle.passed && obstacle.x + obstacle.width < 56) { obstacle.passed = true; game.score += 1; setScore(game.score) } })
      game.obstacles = game.obstacles.filter((obstacle) => obstacle.x + obstacle.width > -10)
      const hit = game.y < 14 || game.y > height - 8 || game.obstacles.some((obstacle) => obstacle.x < 68 && obstacle.x + obstacle.width > 40 && (game.y < obstacle.gap - obstacle.size || game.y > obstacle.gap + obstacle.size))
      draw()
      if (hit) { game.running = false; setStatus('over'); if (!preview) apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit-game-score', score: game.score }) }).then(setGameData).catch(() => {}) ; return }
      frame = requestAnimationFrame(loop)
    }
    gameRef.current.loop = loop
    const flap = () => { if (gameRef.current.running) gameRef.current.velocity = -330 }
    const keydown = (event) => { if (event.code === 'Space') { event.preventDefault(); flap() } }
    window.addEventListener('keydown', keydown); canvas.addEventListener('pointerdown', flap); draw()
    return () => { window.removeEventListener('keydown', keydown); canvas.removeEventListener('pointerdown', flap); if (frame) cancelAnimationFrame(frame) }
  }, [code])

  const start = () => { gameRef.current = { ...gameRef.current, running: true, y: 210, velocity: 0, obstacles: [], score: 0, spawn: .5, time: 0, last: performance.now() }; setScore(0); setStatus('running'); gameRef.current.loop?.(gameRef.current.last) }
  return <section className="game-page"><button className="back-button inline" onClick={onBack}>← Tillbaka</button><div className="game-layout"><div><p className="eyebrow">Simpaus</p><h1>Håll dig mellan vågorna</h1><p className="game-intro">Tryck på skärmen eller mellanslag för att simma uppåt. Hur långt kommer du?</p><div className="game-board"><canvas ref={canvasRef} width="320" height="420" aria-label="Simpaus-spelet" />{status !== 'running' && <div className="game-overlay"><span>{status === 'over' ? '🌊' : '🏊'}</span><strong>{status === 'over' ? `Du fick ${score} poäng` : 'Redo?'}</strong><small>{status === 'over' ? 'Försök slå ditt rekord!' : 'Tryck på start och klicka sedan för att simma.'}</small><button className="primary-button" onClick={start}>{status === 'over' ? 'Spela igen' : 'Starta spelet'}</button></div>}</div></div><section className="game-scoreboard"><p className="eyebrow">Veckans highscore</p><h2>Topplistan</h2><p className="game-best">Ditt rekord: <strong>{gameData.ownBest || 0}</strong></p>{gameData.leaderboard.length ? <div>{gameData.leaderboard.map((item) => <article key={item.profileId}><b>{item.rank}</b><span>{item.emoji}</span><strong>{item.displayName}</strong><em>{item.score}</em></article>)}</div> : <p className="empty">Ingen har spelat ännu.</p>}<small>Spelpoäng påverkar inte din träningspoäng eller nivå.</small></section></div></section>
}

function weekStart(date = new Date()) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  value.setDate(value.getDate() - ((value.getDay() + 6) % 7))
  return value
}

function currentSeasonGoal(training) {
  const today = todayKey()
  return training?.seasonGoals?.find((goal) => goal.active && goal.startDate <= today && goal.endDate >= today) || training?.seasonGoals?.find((goal) => goal.active)
}

function currentWeekSwims(training) {
  const start = weekStart()
  const end = new Date(start); end.setDate(end.getDate() + 7)
  const startKey = dateKey(start), endKey = dateKey(end)
  return training?.sessions?.filter((item) => item.type === 'swim' && (item.date ? item.date >= startKey && item.date < endKey : new Date(item.completedAt) >= start && new Date(item.completedAt) < end)).length || 0
}

const WEEK_SLOTS = [
  { key: 'morning_swim', short: 'Morgon', icon: '🌅' }, { key: 'strength', short: 'Styrka', icon: '🏋️' },
  { key: 'dryland', short: 'Land', icon: '🤸' }, { key: 'afternoon_swim', short: 'Eftermiddag', icon: '🌇' },
]

function SwimmerCompactWeek({ training, profileId }) {
  const start = weekStart()
  const end = new Date(start); end.setDate(end.getDate() + 6)
  const startKey = dateKey(start), endKey = dateKey(end), today = todayKey()
  const days = Array.from({ length: 7 }, (_, index) => {
    const value = new Date(start); value.setDate(value.getDate() + index)
    return { date: dateKey(value), label: value.toLocaleDateString('sv-SE', { weekday: 'short' }).replace('.', ''), number: value.getDate() }
  })
  const sessions = (training?.sessions || []).filter((item) => item.profileId === profileId && item.date >= startKey && item.date <= endKey)
  const plans = (training?.plannedSessions || []).filter((item) => item.profileId === profileId && item.date >= startKey && item.date <= endKey)
  const sessionSlot = (item) => item.slot || (item.type === 'swim' ? 'afternoon_swim' : item.type)
  const completedKeys = new Set(sessions.map((item) => `${item.date}|${sessionSlot(item)}`))
  const plannedKeys = new Set(plans.map((item) => `${item.date}|${item.slot}`))

  return <section className="swimmer-compact-week" aria-labelledby={`compact-week-${profileId}`}>
    <header><div><p className="eyebrow">Veckoplanering</p><h3 id={`compact-week-${profileId}`}>Veckan i korthet</h3></div><small><b>{completedKeys.size}</b> genomförda · <b>{plannedKeys.size}</b> planerade</small></header>
    <div className="compact-week-grid" role="table" aria-label="Planerade och genomförda pass denna vecka">
      <span className="compact-week-corner" aria-hidden="true">Pass</span>
      {days.map((day) => <span role="columnheader" className={day.date === today ? 'today' : ''} key={day.date}><b>{day.label}</b><small>{day.number}</small></span>)}
      {WEEK_SLOTS.map((slot) => <React.Fragment key={slot.key}>
        <span role="rowheader" className="compact-week-slot" title={slot.short} aria-label={slot.short}>{slot.icon}</span>
        {days.map((day) => {
          const key = `${day.date}|${slot.key}`
          const completed = completedKeys.has(key), planned = plannedKeys.has(key)
          const state = completed && planned ? 'planerat och genomfört' : completed ? 'genomfört' : planned ? 'planerat' : 'inget registrerat'
          return <span role="cell" className={`compact-week-cell${day.date === today ? ' today' : ''}${planned ? ' planned' : ''}${completed ? ' completed' : ''}`} title={`${slot.short} ${day.date}: ${state}`} aria-label={`${slot.short} ${day.date}: ${state}`} key={day.date}>
            <i aria-hidden="true">{planned ? '◆' : ''}</i><b aria-hidden="true">{completed ? '✓' : ''}</b>
          </span>
        })}
      </React.Fragment>)}
    </div>
    <details className="compact-week-help swimmer-disclosure"><summary>Så läses veckan</summary><p><span>◆ Planerat</span><span>✓ Genomfört</span><span>Markerad kolumn = idag</span></p></details>
  </section>
}

function WeeklySwimCard({ training, showStars, halloween, onOpen, onToggle, onPlan }) {
  const [saving, setSaving] = useState(() => new Set())
  const savingRef = useRef(new Set())
  const planDesiredRef = useRef(new Map())
  const planWorkersRef = useRef(new Set())
  const [cheer, setCheer] = useState('')
  const [localSessions, setLocalSessions] = useState(null)
  const [localPlans, setLocalPlans] = useState(null)
  useEffect(() => { setLocalSessions(training?.sessions || []); setLocalPlans(training?.plannedSessions || []) }, [training])
  const goal = currentSeasonGoal(training)
  const completed = currentWeekSwims({ sessions: localSessions || training?.sessions || [] })
  const start = weekStart(), today = todayKey()
  const weeklySessions = (localSessions || []).filter((item) => item.date >= dateKey(start) && item.date <= today)
  const weeklySwimSessions = weeklySessions.filter((item) => item.type === 'swim')
  const weeklyMeters = weeklySwimSessions.reduce((sum, item) => sum + (Number(item.distanceMeters) || 0), 0)
  const weeklyMinutes = weeklySwimSessions.reduce((sum, item) => sum + (Number(item.durationMinutes) || 0), 0)
  const plannedSessions = (localPlans || []).filter((item) => item.weekStart === dateKey(start))
  const plannedDays = new Set(plannedSessions.map((item) => item.date)).size
  const crossGoal = training?.crossGoals?.find((item) => item.startDate <= today && (!item.endDate || item.endDate >= today))
  const typeProgress = {
    strength: { completed: weeklySessions.filter((item) => item.type === 'strength').length, target: crossGoal?.strengthTarget || 0 },
    dryland: { completed: weeklySessions.filter((item) => item.type === 'dryland').length, target: crossGoal?.drylandTarget || 0 },
  }
  const stars = currentStarState(training)
  useEffect(() => {
    const card = document.querySelector('.weekly-training-card .weekly-summary')
    const heading = card?.querySelector('h3')
    if (!card || !heading) return
    card.querySelectorAll('.weekly-volume-summary').forEach((item) => item.remove())
    const volume = document.createElement('div')
    volume.className = 'weekly-volume-summary'
    volume.innerHTML = `<span><strong>${weeklyMeters ? weeklyMeters.toLocaleString('sv-SE') : '–'}</strong><small>genomförda simmeter</small></span><span><strong>${weeklyMinutes || '–'}</strong><small>genomförda minuter</small></span>`
    heading.insertAdjacentElement('afterend', volume)
  }, [weeklyMeters, weeklyMinutes, weeklySessions.length])
  const setSavingKey = (key, active) => {
    if (active) savingRef.current.add(key)
    else savingRef.current.delete(key)
    setSaving((current) => { const next = new Set(current); active ? next.add(key) : next.delete(key); return next })
  }
  const toggle = async (date, slot, checked) => {
    const key = `${date}-${slot}`
    if (savingRef.current.has(key)) return
    const previous = localSessions || training?.sessions || []
    const previousItem = previous.find((item) => item.date === date && item.slot === slot)
    const type = slot.includes('swim') ? 'swim' : slot
    setLocalSessions((current) => { const base = current || training?.sessions || []; return checked ? [...base.filter((item) => !(item.date === date && item.slot === slot)), { date, slot, type }] : base.filter((item) => !(item.date === date && item.slot === slot)) })
    setSavingKey(key, true)
    try {
      const result = await onToggle(date, slot, checked)
      setCheer(result?.message || (checked ? 'Passet är registrerat! ✓' : 'Passet är avmarkerat.'))
    } catch (error) {
      setLocalSessions((current) => { const base = (current || training?.sessions || []).filter((item) => !(item.date === date && item.slot === slot)); return previousItem ? [...base, previousItem] : base })
      window.alert(error.message)
    } finally { setSavingKey(key, false) }
  }
  const togglePlan = async (date, slot) => {
    const key = `plan-${date}-${slot}`
    const currentPlans = localPlans || training?.plannedSessions || []
    const previousItem = currentPlans.find((item) => item.date === date && item.slot === slot)
    const planned = planDesiredRef.current.has(key) ? planDesiredRef.current.get(key) : Boolean(previousItem)
    const nextValue = !planned
    planDesiredRef.current.set(key, nextValue)
    setLocalPlans((current) => { const base = current || training?.plannedSessions || []; return nextValue ? [...base.filter((item) => !(item.date === date && item.slot === slot)), { date, slot, weekStart: planningMonday(date) }] : base.filter((item) => !(item.date === date && item.slot === slot)) })
    if (planWorkersRef.current.has(key)) return
    planWorkersRef.current.add(key)
    setSavingKey(key, true)
    let lastResult = null
    let lastError = null
    let finalValue = nextValue
    try {
      while (planDesiredRef.current.has(key)) {
        const desired = planDesiredRef.current.get(key)
        planDesiredRef.current.delete(key)
        finalValue = desired
        try {
          lastResult = await onPlan(date, slot, desired)
          lastError = null
        } catch (error) {
          lastError = error
          if (!planDesiredRef.current.has(key)) break
        }
      }
      if (lastError) {
        setLocalPlans((current) => { const base = (current || training?.plannedSessions || []).filter((item) => !(item.date === date && item.slot === slot)); return previousItem ? [...base, previousItem] : base })
        window.alert(lastError.message)
      } else {
        setCheer(lastResult?.message || (finalValue ? 'Passet är planerat! 🗓️' : 'Planeringen är uppdaterad.'))
      }
    } finally {
      planWorkersRef.current.delete(key)
      setSavingKey(key, false)
    }
  }
  const savingPlan = [...saving].some((key) => key.startsWith('plan-'))
  const savingTraining = [...saving].some((key) => !key.startsWith('plan-'))
  const percentage = goal ? Math.round((completed / goal.target) * 100) : null
  return <section className="weekly-training-card">
    <div className="weekly-summary"><div><p className="eyebrow">Min träning den här veckan</p><h3>{goal ? `${completed} av ${goal.target} simpass · ${percentage} %` : `${completed} simpass`}</h3>{goal ? <><div className="session-dots">{Array.from({ length: goal.target }, (_, index) => <i className={index < completed ? 'done' : ''} key={index} />)}</div><small>{completed >= goal.target ? 'Veckomålet är uppnått!' : `${goal.target - completed} simpass kvar enligt din överenskommelse`} · {weeklySessions.length} pass totalt</small></> : <small>{weeklySessions.length} pass totalt · <button onClick={onOpen}>sätt ett simmål</button></small>}<small>{plannedDays} planerade dagar · planera minst 3 dagar för +2 poäng</small>{showStars && <><StarProgress stars={stars} /><small className="star-status">{stars.fourWeeksExpected ? `Simmål senaste 4 veckorna: ${stars.fourWeeksCompleted} av ${stars.fourWeeksExpected} · ${stars.fourWeeksPercentage} %` : 'Sätt ett simmål för att följa simstjärnan.'}</small></>}</div><button onClick={onOpen}>Mina mål →</button>{halloween && <span className="weekly-halloween-spider" aria-hidden="true">🕷️</span>}</div>
    {crossGoal && <div className="cross-progress"><MiniGoal icon="🏋️" label="Styrka" {...typeProgress.strength} /><MiniGoal icon="🤸" label="Landträning" {...typeProgress.dryland} /></div>}
    {showStars && <details className="star-guide"><summary>Vad ger stjärnorna?</summary><small>Planera minst tre dagar · ha mål för simning, styrka och landträning · genomför simmålet under de fyra senaste avslutade veckorna.</small></details>}
    <SwimmerWeekPlanner today={today} sessions={localSessions || []} plans={localPlans || []} saving={saving} onToggle={toggle} onPlan={togglePlan} onWeekChange={() => setCheer('')} /><div className="week-status-slot"><div className="week-save-status" role="status" aria-live="polite">{savingPlan || savingTraining ? <><span aria-hidden="true">⏳</span>{savingPlan && savingTraining ? 'Sparar planering och genomförd träning…' : savingPlan ? 'Sparar din planering…' : 'Sparar genomförd träning…'}</> : cheer ? <><span aria-hidden="true">✨</span><strong>{cheer}</strong><button type="button" aria-label="Dölj bekräftelsen" onClick={() => setCheer('')}>×</button></> : null}</div></div>
  </section>
}

function MiniGoal({ icon, label, completed, target }) {
  const percentage = target ? Math.round((completed / target) * 100) : 0
  return <div><span>{icon}</span><p><strong>{label}: {completed} av {target}</strong><i><b style={{ width: `${Math.min(100, percentage)}%` }} /></i><small>{completed >= target ? 'Målet är klart!' : `${target - completed} pass kvar`}</small></p></div>
}

function RewardCard({ points, onCommunity, featured = false }) {
  if (!points?.current) return null
  const remaining = points.next ? points.next.minPoints - points.total : 0
  const range = points.next ? points.next.minPoints - points.current.minPoints : 1
  const progress = points.next ? ((points.total - points.current.minPoints) / range) * 100 : 100
  return <>{!featured && points.recentRewards?.length > 0 && <RewardCelebration rewards={points.recentRewards} />}<section className={`reward-card${featured ? ' hero-level-card' : ''}`}><span aria-hidden="true">{points.current.emoji}</span><div><p className="eyebrow">Din nivå</p><h3>{points.current.name} · {points.total} poäng</h3><div className="reward-progress"><i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div><small>{points.next ? `${remaining} poäng till ${points.next.name}` : 'Du har nått högsta nivån!'}</small></div><button type="button" onClick={onCommunity}>Ge pepp →</button></section></>
}

function RewardCelebration({ rewards }) {
  const storageKey = 'simkoll-rewards-seen'
  const [seen, setSeen] = useState(() => { try { return new Set(JSON.parse(window.localStorage.getItem(storageKey) || '[]')) } catch { return new Set() } })
  const visible = rewards.filter((item) => item.id && !seen.has(item.id))
  if (!visible.length) return null
  const dismiss = () => { const next = new Set(seen); visible.forEach((item) => next.add(item.id)); const trimmed = [...next].slice(-100); window.localStorage.setItem(storageKey, JSON.stringify(trimmed)); setSeen(new Set(trimmed)) }
  return <section className="reward-celebration"><span>🎉</span><div><strong>{visible[0].message}</strong><small>+{visible.reduce((sum, item) => sum + item.points, 0)} poäng från dina senaste aktiviteter</small></div><button onClick={dismiss}>×</button></section>
}

function WorkoutCard({ workout, locked }) {
  const [expanded, setExpanded] = useState(false)
  const workouts = (Array.isArray(workout) ? workout : workout ? [workout] : []).filter(Boolean)
  return (
    <section className={`workout-card ${workouts.length ? '' : 'workout-empty'}`}>
      <div className="workout-label"><span>🏊</span><div><p className="eyebrow">Endast för profiler</p><h2>Dagens pass</h2></div>{workouts.length > 0 && !locked && <button type="button" className="workout-expand-button" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Dölj ↑' : `Visa ${workouts.length > 1 ? 'pass' : 'pass'} ↓`}</button>}</div>
      {locked ? <div className="locked-workout"><span>🔒</span><div><strong>Checka in för att se passet</strong><small>Du kan fortfarande välja att svara anonymt.</small></div></div> : workouts.length ? <div className="workout-body">{workouts.map((item) => <article className="workout-day-item" key={item.id}><h3>{item.title}</h3><WorkoutMeta workout={item} />{expanded && <><WorkoutContent content={item.content} />{item.note && <aside><strong>Kommentar från tränaren</strong>{item.note}</aside>}</>}</article>)}</div> : <p className="empty">Tränaren har inte lagt upp något pass idag.</p>}
    </section>
  )
}

function WorkoutContent({ content }) {
  const lines = String(content || '').split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) return null
  const isSection = (line) => { const clean = line.replace(/^#+\s*/, ''); return /^(insim|uppvärmning|huvudserie|serie|ben|arm|spec|teknik|fart|avsim|nedvarvning|styrka)\b/i.test(clean) || (/^[^·]{1,42}:$/.test(clean) && !/\d/.test(clean)) }
  return <div className="workout-content">{lines.map((line, index) => { const indented = /^\s+/.test(line); const clean = line.trim().replace(/^#+\s*/, '').replace(/^[-•]\s*/, ''); if (isSection(clean)) return <h4 key={`${index}-${clean}`}>{clean.replace(/:$/, '')}</h4>; const parts = clean.split(/\s*·\s*/).map((part) => part.trim()).filter(Boolean); const timeIndex = parts.findIndex((part) => /^(?:st\.?|start|starttid)\s*[:.]?\s*[\d:.,-]+/i.test(part)); let start = timeIndex >= 0 ? parts.splice(timeIndex, 1)[0] : ''; if (!start) { const match = clean.match(/\s+(st\.?\s*[\d:.,-]+)\s*$/i); if (match) { start = match[1]; parts.splice(0, parts.length, clean.slice(0, match.index).trim()) } } return <div className={`workout-set${indented ? ' indented' : ''}`} key={`${index}-${clean}`}><span className="workout-set-main">{parts.join(' · ')}</span>{start && <span className="workout-set-time">{start.replace(/^st\.?\s*/i, 'Start ')}</span>}</div> })}</div>
}

function WorkoutMeta({ workout }) {
  const focus = WORKOUT_FOCUSES.find(([value]) => value === workout.focus)?.[1]
  const groupLabels = { ungdom_orange: 'Orange', ungdom_svart: 'Svart', junior: 'Junior' }
  if (!focus && !workout.distanceMeters && !workout.durationMinutes && !workout.targetGroups?.length) return null
  return <div className="workout-meta"><span>{focus || 'Pass'}</span>{workout.distanceMeters && <span>{Number(workout.distanceMeters).toLocaleString('sv-SE')} m</span>}{workout.durationMinutes && <span>{workout.durationMinutes} min</span>}{workout.targetGroups?.length && <span>{workout.targetGroups.map((group) => groupLabels[group] || group).join(' · ')}</span>}</div>
}

function AccountChoice({ onLogin, onCreate }) {
  return (
    <div className="account-page">
      <section className="account-intro">
        <p className="eyebrow">Profilåtkomst</p>
        <h1>Välkommen tillbaka</h1>
        <p>Logga in med din profil eller skapa en ny profil för godkännande.</p>
        <div className="account-options">
          <button className="account-option" onClick={onLogin}><span>👋</span><div><strong>Logga in</strong><small>Fortsätt med din profil</small></div><b>→</b></button>
          <button className="account-option" onClick={onCreate}><span>✨</span><div><strong>Skapa profil</strong><small>Välj namn och gubbe</small></div><b>→</b></button>
        </div>
      </section>
    </div>
  )
}

const PROFILE_EMOJIS = ['🏊', '🐬', '🦈', '🐙', '🐢', '🦦', '🐳', '⚡', '🌊', '🔥']

function SwimmerTerms({ code, profile, onAccepted, onLogout }) {
  const [saving, setSaving] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const accept = async () => {
    setSaving(true)
    try { const data = await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accept-terms' }) }); onAccepted(data.profile) } catch (error) { window.alert(error.message) } finally { setSaving(false) }
  }
  return <div className="profile-access-page"><section className="profile-form"><p className="eyebrow">Hej {profile.displayName} {profile.emoji}</p><h1>En viktig sak först</h1><p>Läs igenom hur Simkoll används och hur information hanteras. Du kan alltid hitta texten igen under <strong>Info & villkor</strong>.</p><details open><summary>Info & villkor för simmare</summary><p>Simkoll är ett stöd för träningsfeedback, planering och utveckling. Svara så ärligt du vill, men skriv inte diagnoser, personnummer eller andra privata uppgifter i fritext.</p><p>Vissa svar kan sammanställas för tränarna. AI- och språkmodellstöd används bara enligt klubbens regler och är ett stöd – inte ett automatiskt beslut om träning eller hälsa.</p><p>Du kan fråga klubben om vilka uppgifter som finns sparade och be om rättelse eller radering.</p></details><label className="remember-login"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /> Jag har läst och godkänner Info & villkor.</label><button className="primary-button" onClick={accept} disabled={saving || !accepted}>{saving ? 'Sparar…' : 'Fortsätt till Simkoll →'}</button><button className="form-link" onClick={onLogout}>Logga ut</button></section></div>
}

function ProfileAccess({ mode, code, onBack, onMode, onSuccess }) {
  const [form, setForm] = useState({ emoji: '🏊', remember: false, acceptedTerms: false })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const action = mode === 'create' ? 'create' : mode === 'reset' ? 'reset-pin' : 'login'
      if (mode === 'create' && !form.acceptedTerms) { setError('Läs och godkänn Info & villkor först.'); setLoading(false); return }
      const data = await apiRequest('/api/profiles', code, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...form }),
      })
      if (data.pending) setPending(true)
      else onSuccess(data.profile || null)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setLoading(false)
    }
  }

  const title = mode === 'create' ? 'Skapa din profil' : mode === 'reset' ? 'Välj en ny PIN' : 'Välkommen tillbaka'
  if (pending) return <div className="profile-access-page"><button className="back-button" onClick={onBack}>← Tillbaka</button><section className="profile-form pending-profile-message"><span>⏳</span><p className="eyebrow">Profilen är skapad</p><h1>Inväntar medgivande</h1><p>Vi inväntar medgivande från din vårdnadshavare. Se informationsmailet. Tränaren aktiverar sedan din åtkomst.</p><button className="primary-button" onClick={onBack}>Klart</button></section></div>
  return (
    <div className="profile-access-page">
      <button className="back-button" onClick={onBack}>← Tillbaka</button>
      <form className="profile-form" onSubmit={submit}>
        <p className="eyebrow">Din profil</p><h1>{title}</h1>
        {mode === 'create' && <>
          <label>Vad vill du kallas?<input required maxLength="40" placeholder="Ditt namn eller smeknamn" value={form.displayName || ''} onChange={(event) => update('displayName', event.target.value)} /></label>
          <fieldset><legend>Välj din gubbe</legend><div className="avatar-picker">{PROFILE_EMOJIS.map((emoji) => <button className={form.emoji === emoji ? 'selected' : ''} type="button" key={emoji} onClick={() => update('emoji', emoji)}>{emoji}</button>)}</div></fieldset>
        </>}
        <label>Användarnamn<input required minLength="3" maxLength="24" autoCapitalize="none" autoComplete="username" placeholder="t.ex. delfinen7" value={form.username || ''} onChange={(event) => update('username', event.target.value)} /></label>
        {mode === 'reset' && <label>Återställningskod<input required inputMode="numeric" maxLength="8" placeholder="8 siffror" value={form.resetCode || ''} onChange={(event) => update('resetCode', event.target.value.replace(/\D/g, ''))} /></label>}
        <label>{mode === 'reset' ? 'Ny fyrsiffrig PIN' : 'Fyrsiffrig PIN'}<input required inputMode="numeric" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} maxLength="4" placeholder="••••" value={(mode === 'reset' ? form.newPin : form.pin) || ''} onChange={(event) => update(mode === 'reset' ? 'newPin' : 'pin', event.target.value.replace(/\D/g, ''))} /></label>
        {mode === 'create' && <label className="remember-login"><input type="checkbox" checked={form.acceptedTerms === true} onChange={(event) => update('acceptedTerms', event.target.checked)} /> Jag har läst och godkänner Info & villkor.</label>}
        {mode === 'login' && <label className="remember-login"><input type="checkbox" checked={form.remember === true} onChange={(event) => update('remember', event.target.checked)} /> Håll mig inloggad på den här enheten</label>}
        {error && <span className="form-error">{error}</span>}
        <button className="primary-button" disabled={loading}>{loading ? 'Vänta…' : mode === 'create' ? 'Skapa profil →' : mode === 'reset' ? 'Spara ny PIN →' : 'Logga in →'}</button>
        {mode === 'login' && <><button type="button" className="form-link" onClick={() => onMode('reset')}>Glömt din PIN?</button><button type="button" className="form-link" onClick={() => onMode('create')}>Skapa ny profil</button></>}
      </form>
    </div>
  )
}

function PrivacyChoice({ profile, lateEntry = false, onBack, onChoose }) {
  return (
    <div className="privacy-choice-page">
      <button className="back-button" onClick={onBack}>← Tillbaka</button>
      <section>
        <p className="eyebrow">Din check-in</p><h1>Hur vill du svara?</h1>
        <p>{lateEntry ? 'Efterregistrera gårdagens svar. Du bestämmer om det kopplas till profilen.' : 'Du bestämmer för varje gång.'}</p>
        <div className="account-options">
          <button className="account-option" onClick={() => onChoose(true)}><span>{profile.emoji}</span><div><strong>Som {profile.displayName}</strong><small>Syns i din historik och för tränaren</small></div><b>→</b></button>
          <button className="account-option anonymous" onClick={() => onChoose(false)}><span>🥷</span><div><strong>Anonymt</strong><small>Kan inte kopplas till din profil</small></div><b>→</b></button>
        </div>
      </section>
    </div>
  )
}

const KUDOS_OPTIONS = [
  ['great_job', 'Grymt jobbat idag! 💪'], ['great_energy', 'Bra energi! ⚡'],
  ['nice_technique', 'Snygg teknik! 🌊'], ['thanks', 'Tack för peppen! 🙌'],
  ['fun_together', 'Kul att träna med dig! 😊'], ['strong_effort', 'Stark insats! 🔥'], ['custom', 'Skriv eget peppmeddelande…'],
]
const GROUP_PEP_OPTIONS = [
  ['group_start', 'Nu kör vi! 🔥'], ['group_energy', 'Bra energi i gruppen idag ⚡'],
  ['group_great_job', 'Det blir ett grymt pass idag 💪'], ['group_build', 'Idag bygger vi vidare 🌊'],
  ['group_focus', 'Håll ihop hela vägen 🎯'], ['group_next', 'Ser fram emot nästa pass 🙌'],
  ['group_fun', 'Kul att simma med er! 😊'], ['custom', 'Skriv eget gruppmeddelande…'],
]

function CoachInfoPage({ code, profile, onBack }) {
  return <main className="page-content coach-info-page"><header className="coach-info-header"><button type="button" className="back-button" onClick={onBack} aria-label="Tillbaka">←</button><h1>Info från tränarna</h1></header><OpenChatPanel code={code} profileId={profile?.id} fitViewport /></main>
}


function Community({ profile, code, points, customPepEnabled = true, openChatEnabled = false, initialView = 'group', onBack, onPointsChange }) {
  const [items, setItems] = useState([])
  const [privateKudos, setPrivateKudos] = useState([])
  const [messages, setMessages] = useState([])
  const [profiles, setProfiles] = useState([])
  const [feedView, setFeedView] = useState(initialView)
  useEffect(() => { setFeedView(initialView) }, [initialView])
  const [openChat, setOpenChat] = useState({ enabled: openChatEnabled, backgroundImage: '', messages: [] })
  const [recipientId, setRecipientId] = useState('')
  const [content, setContent] = useState('')
  const [templateKey, setTemplateKey] = useState('great_job')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reactionBusy, setReactionBusy] = useState('')
  useEffect(() => { if (!customPepEnabled && templateKey === 'custom') setTemplateKey('great_job') }, [customPepEnabled, templateKey])

  const load = async () => {
    const cacheBust = `?feed=${Date.now()}`
    const [feed, directory] = await Promise.all([apiRequest(`/api/community${cacheBust}`, code), apiRequest('/api/profiles?directory=true', code)])
    setItems(feed.items || []); setPrivateKudos(feed.privateKudos || []); setMessages(feed.messages || []); setProfiles(directory.profiles || []); setOpenChat(feed.openChat || { enabled: false, messages: [] }); setLoading(false); setLoadError('')
  }
  useEffect(() => {
    const refresh = () => load().catch((error) => { setLoadError(error.message); setLoading(false) })
    refresh()
    window.addEventListener('focus', refresh)
    const interval = window.setInterval(() => { if (!document.hidden) refresh() }, 15000)
    return () => { window.removeEventListener('focus', refresh); window.clearInterval(interval) }
  }, [code])

  const sendKudos = async (event) => {
    event.preventDefault(); setStatus('Skickar…')
    try {
      const body = { mode: 'private', recipientId, templateKey, content: templateKey === 'custom' ? content : undefined }
      await apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const nextPoints = await apiRequest('/api/points', code)
      onPointsChange(nextPoints); setStatus('Peppen är skickad! +1 poäng'); setRecipientId(''); setContent(''); await load()
    } catch (error) { setStatus(error.message) }
  }
  const sendGroupMessage = async (body) => {
    const result = await apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (result.message) setItems((current) => [...current.filter((item) => item.id !== result.message.id), result.message].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)))
    // Uppdatera hela flödet efter att avsändaren redan fått kvitto.
    window.setTimeout(() => { load().catch(() => {}) }, 1200)
    if (result.moderationPending && result.message?.id) {
      const messageId = result.message.id
      const refreshModeration = async (attempt = 0) => {
        try {
          const state = await apiRequest(`/api/community?pepStatus=${encodeURIComponent(messageId)}`, code)
          const stillProcessing = state.status === 'pending' || (state.status === 'approved' && state.pointEligible)
          if (stillProcessing && attempt < 20) {
            window.setTimeout(() => refreshModeration(attempt + 1), 900)
            return
          }
          setItems((current) => current.map((item) => item.id !== messageId ? item : {
            ...item,
            moderationStatus: state.status,
            content: state.status === 'rejected' ? '' : item.content,
            moderationMessage: state.status === 'rejected' ? state.message : null,
          }))
          if (state.status === 'approved' && result.pointEligible && !state.pointEligible) onPointsChange(await apiRequest('/api/points', code))
        } catch { /* Feedens ordinarie uppdatering hämtar slutstatusen senare. */ }
      }
      window.setTimeout(() => refreshModeration(), 900)
    } else if (result.awardedPoints) {
      window.setTimeout(() => { apiRequest('/api/points', code).then(onPointsChange).catch(() => {}) }, 800)
    }
    return result
  }
  const toggleReaction = async ({ messageType, messageId, emoji }) => {
    const busyKey = `${messageType === 'group_pep' ? 'group' : 'coach'}-${messageId}-${emoji}`
    setReactionBusy(busyKey)
    try {
      await apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle-reaction', messageType, messageId, emoji }) })
      await load()
    } catch (error) { setLoadError(error.message) } finally { setReactionBusy('') }
  }
  const removePrivateMessage = async (id) => { if (!window.confirm('Ta bort ditt privata meddelande?')) return; try { await apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-private-message', id }) }); await load() } catch (error) { setStatus(error.message) } }

  return <div className="community-page pep-channel-page"><header className="coach-info-header"><button type="button" className="back-button" onClick={onBack} aria-label="Tillbaka">←</button><h1>Peppflödet</h1>{points?.current && <small className="pep-points">{points.current.emoji} {points.total} p</small>}</header>
    <nav className="feed-tabs"><button className={feedView === 'group' ? 'active' : ''} onClick={() => setFeedView('group')}>Öppen kanal</button><button className={feedView === 'private' ? 'active' : ''} onClick={() => setFeedView('private')}>Min privata pepp</button></nav><div className={`community-layout${feedView === 'group' ? ' pep-channel-layout' : ''}`}>
    <section className="feed-column">
      {loadError && <p className="form-error" role="status">{loadError}</p>}
      {loading ? <p className="empty" role="status">{status || 'Hämtar flödet…'}</p> : feedView === 'group' ? <PeppChannelPanel items={items} profileId={profile.id} backgroundImage={openChat.backgroundImage} customPepEnabled={customPepEnabled} templates={GROUP_PEP_OPTIONS} EmojiPicker={ChatEmojiPicker} onSend={sendGroupMessage} onReact={toggleReaction} reactionBusy={reactionBusy} /> : (privateKudos.length ? <div className="feed-list">{privateKudos.map((item) => <article className="feed-item private-post" key={`private-${item.id}`}><span>{item.sender.emoji}</span><div><strong>{item.sender.id === profile.id ? `Du → ${item.recipient.emoji} ${item.recipient.displayName}` : `${item.sender.displayName} → dig`}</strong><p>{item.content}</p><small>🔒 Privat · {formatFeedDate(item.createdAt)}</small></div></article>)}</div> : <p className="empty">Du har ingen privat pepp ännu.</p>)}
      {feedView === 'private' && messages.length > 0 && <section className="private-messages"><p className="eyebrow">Privata meddelanden</p>{messages.map((item) => <article key={item.id}><span>✉️</span><div><strong>{item.fromCoach ? 'Tränarna → dig' : 'Du → tränarna'}</strong><p>{item.content}</p><small>{formatFeedDate(item.createdAt)}</small></div>{item.toCoach && !item.fromCoach && <button type="button" className="text-button danger-text" onClick={() => removePrivateMessage(item.id)}>Ta bort</button>}</article>)}</section>}
    </section>
    {feedView === 'private' && <aside className="kudos-panel"><p className="eyebrow">Sprid bra energi</p><h2>Skicka privat pepp</h2><p>En hälsning till en simmarkompis.</p><small className="kudos-limit">4 poänggivande pepp per dag, inklusive öppna kanalen.</small>
      <p className="settings-help">Frågor till tränarna ställer du i Info från tränarna. Här skickar du privat pepp till en simmare.</p>
      <form onSubmit={sendKudos}><label>Till<select required value={recipientId} onChange={(event) => setRecipientId(event.target.value)}><option value="">Välj simmare…</option>{profiles.map((item) => <option key={item.id} value={item.id}>{item.emoji} {item.displayName}</option>)}</select></label><label>Hälsning<select value={templateKey} onChange={(event) => setTemplateKey(event.target.value)}>{KUDOS_OPTIONS.filter(([key]) => customPepEnabled || key !== 'custom').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>{customPepEnabled && templateKey === 'custom' && <label>Eget peppmeddelande<textarea required maxLength="300" placeholder="Skriv något schysst till din kompis…" value={content} onChange={(event) => setContent(event.target.value)} /><small>Texten kontrolleras innan den skickas.</small></label>}<button className="primary-button">Skicka pepp →</button>{status && <small className="kudos-status">{status}</small>}</form>
    </aside>}
  </div></div>
}

function formatFeedDate(value) {
  const date = new Date(value)
  const isToday = dateKey(date) === todayKey()
  return isToday ? `Idag ${date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}` : date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

const GOAL_STATUS = { planned: 'Planerat', active: 'Pågår', paused: 'Pausat', complete: 'Klart' }

function strengthResultPlaceholder(name) {
  const value = String(name || '').toLowerCase()
  if (value.includes('planka') || value.includes('håll') || value.includes('rygglyft')) return 't.ex. 30 sek'
  if (value.includes('chins') || value.includes('pull') || value.includes('utfall') || value.includes('benlyft') || value.includes('rollout')) return 't.ex. 8 reps · kroppsvikt'
  return 't.ex. 40 kg · 8 reps'
}

function StrengthProgramRunner({ assignment, logs, code, onSaved }) {
  const passes = strengthPasses(assignment.program)
  const [selectedPass, setSelectedPass] = useState(null)
  const [weights, setWeights] = useState({})
  const [previousWeights, setPreviousWeights] = useState({})
  const [previousDate, setPreviousDate] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState('')
  const thisWeek = dateKey(weekStart())
  const today = todayKey()
  const completed = (passNumber) => logs.some((log) => log.assignmentId === assignment.id && log.passNumber === passNumber && log.sessionDate >= thisWeek && log.sessionDate <= today)
  const openPass = (pass) => {
    const previous = logs.find((log) => log.assignmentId === assignment.id && log.passNumber === pass.passNumber && log.sessionDate >= thisWeek && log.sessionDate <= today)
    const last = logs.filter((log) => log.assignmentId === assignment.id && log.passNumber === pass.passNumber && log.sessionDate < thisWeek).sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))[0]
    setSelectedPass(pass); setWeights(previous?.weights || {}); setPreviousWeights(last?.weights || {}); setPreviousDate(last?.sessionDate || ''); setNotes(previous?.notes || ''); setStatus('')
  }
  const save = async (event) => {
    event.preventDefault(); if (!selectedPass) return
    setStatus('Sparar passet…')
    try {
      await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'log-strength-pass', assignmentId: assignment.id, passNumber: selectedPass.passNumber, sessionDate: today, weights, notes }) })
      setStatus('Passet är registrerat ✓'); await onSaved()
    } catch (error) { setStatus(error.message) }
  }
  return <div className="strength-program-runner"><p className="strength-runner-intro">Välj veckans styrkepass. När ett pass är registrerat markeras det som klart till nästa vecka.</p><div className="strength-pass-picker">{passes.map((pass) => <button type="button" key={pass.passNumber} className={completed(pass.passNumber) ? 'completed' : selectedPass?.passNumber === pass.passNumber ? 'selected' : ''} onClick={() => openPass(pass)}>{completed(pass.passNumber) ? '✓ ' : ''}Pass {pass.passNumber}<small>{pass.title}</small></button>)}</div>{selectedPass && <form className="strength-pass-form" onSubmit={save}><div className="strength-pass-form-heading"><div><p className="eyebrow">Pass {selectedPass.passNumber}</p><h3>{selectedPass.title}</h3></div><button type="button" className="secondary-button" onClick={() => setSelectedPass(null)}>Stäng</button></div><p className="strength-weight-hint">Fyll i ditt resultat per övning. Det kan vara vikt, repetitioner, sekunder eller hjälpmedel – till exempel <em>40 kg · 8 reps</em>, <em>30 sek</em> eller <em>8 reps · gummiband</em>.</p>{previousDate && <p className="strength-previous-hint">Senast registrerat {new Date(`${previousDate}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} – använd som riktmärke för den här veckan.</p>}<div className="strength-exercise-list">{strengthExercises(selectedPass.content).map((exercise, exerciseIndex) => <label key={exercise.resultKey}><span><strong>{exercise.name}</strong><small>{exercise.dosage}</small><SwimmerExerciseImage name={exercise.name} image={assignment.program.exerciseImages?.find((image) => image.passNumber === selectedPass.passNumber && image.exerciseIndex === exerciseIndex && image.exerciseName === exercise.name)} />{exercise.instructions && <small className="strength-exercise-instruction">{exercise.instructions}</small>}{previousWeights[exercise.resultKey] && <em className="strength-previous-result">Senast: {previousWeights[exercise.resultKey]}</em>}</span><input aria-label={`Resultat för ${exercise.name}`} value={weights[exercise.resultKey] || ''} placeholder={strengthResultPlaceholder(exercise.name)} onChange={(event) => setWeights((current) => ({ ...current, [exercise.resultKey]: event.target.value }))} /></label>)}</div><label className="strength-notes-field">Kommentar (valfritt)<textarea maxLength="1000" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Hur kändes passet?" /></label><button className="primary-button">Spara pass och resultat ✓</button>{status && <small className="coach-note-status">{status}</small>}<details className="strength-full-content"><summary>Visa hela passet</summary><pre>{selectedPass.content}</pre></details></form>}</div>
}

function StrengthProgramPage({ code, onTrainingChange, onBack }) {
  const [training, setTraining] = useState(null)
  const [loading, setLoading] = useState(true)
  const load = () => apiRequest('/api/training', code).then((data) => { setTraining(data); onTrainingChange(data) }).finally(() => setLoading(false))
  useEffect(() => { load().catch(() => setLoading(false)) }, [code])
  const assignment = training?.assignments?.find((item) => item.program?.type === 'strength')
  return <div className="goals-page strength-program-page"><button className="back-button" onClick={onBack}>← Tillbaka</button><div className="goals-content"><p className="eyebrow">Från tränarna</p><h1>Mitt styrkeprogram 🏋️</h1>{loading ? <p className="empty">Hämtar programmet…</p> : assignment ? <section className="assigned-programs"><article><header><span>🏋️</span><div><strong>{assignment.program.title}</strong><small>Styrketräning</small></div></header><p>{assignment.program.description}</p><StrengthProgramRunner assignment={assignment} logs={training.strengthLogs || []} code={code} onSaved={load} /></article></section> : <p className="empty">Du har inget aktivt styrkeprogram just nu.</p>}</div></div>
}

function MyGoals({ code, onTrainingChange, onBack }) {
  const [goals, setGoals] = useState([])
  const [training, setTraining] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reflection, setReflection] = useState({})
  const [sendingReflection, setSendingReflection] = useState('')
  const [talks, setTalks] = useState([])
  const [seasonForm, setSeasonForm] = useState({ title: 'Mitt höstmål', target: 4, startDate: localDateValue(), endDate: `${new Date().getFullYear()}-12-20`, reflection: '' })
  const load = () => Promise.all([apiRequest('/api/goals', code), apiRequest('/api/training', code), apiRequest('/api/goals?talks=true', code)]).then(([goalData, trainingData, talkData]) => {
    setGoals(goalData.goals); setTraining(trainingData); setTalks(talkData.talks || []); onTrainingChange(trainingData)
    const unseenIds = (goalData.goals || []).filter((goal) => !goal.swimmerSeenAt && goal.status !== 'complete').map((goal) => goal.id)
    if (unseenIds.length) apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mark-viewed', goalIds: unseenIds }) }).catch(() => {})
  }).finally(() => setLoading(false))
  useEffect(() => { load().catch((error) => window.alert(error.message)) }, [])
  const addReflection = async (goalId) => {
    const content = String(reflection[goalId] || '').trim()
    if (!content || sendingReflection) return
    setSendingReflection(goalId)
    try {
      await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goalId, content }) })
      setReflection({ ...reflection, [goalId]: '' }); await load()
    } catch (error) { window.alert(error.message) } finally { setSendingReflection('') }
  }
  const saveSeasonGoal = async (event) => {
    event.preventDefault()
    try { await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'season-goal', ...seasonForm, target: Number(seasonForm.target) }) }); await load() } catch (error) { window.alert(error.message) }
  }
  const completeProgram = async (assignment) => {
    try { await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'complete-program', assignmentId: assignment.id, programType: assignment.program.type }) }); await load() } catch (error) { window.alert(error.message) }
  }
  const submitProgramGoal = async (goalId) => {
    try { await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit-program-goal', goalId }) }); await load() } catch (error) { window.alert(error.message) }
  }
  const activeSeason = currentSeasonGoal(training)
  const weekCount = currentWeekSwims(training)
  return <div className="goals-page"><button className="back-button" onClick={onBack}>← Tillbaka</button><div className="goals-content"><p className="eyebrow">Ditt ansvar · din utveckling</p><h1>Min träning och mina mål</h1>{loading ? <p className="empty">Hämtar mål…</p> : <>
    <section className="season-goal-section"><div className="section-title"><div><p className="eyebrow">Simmål per vecka</p><h2>Mitt terminsmål</h2></div>{activeSeason && <span>{weekCount} / {activeSeason.target} den här veckan</span>}</div>{activeSeason ? <div className="season-active"><div className="big-session-count"><strong>{weekCount}</strong><span>av {activeSeason.target} simpass</span></div><div><h3>{activeSeason.title}</h3><p>Du har själv valt {activeSeason.target} pass per vecka.</p><div className="session-dots">{Array.from({ length: activeSeason.target }, (_, index) => <i className={index < weekCount ? 'done' : ''} key={index} />)}</div><small>{activeSeason.startDate} – {activeSeason.endDate}</small></div></div> : <form className="season-form" onSubmit={saveSeasonGoal}><label>Vad kallar du målet?<input required value={seasonForm.title} onChange={(event) => setSeasonForm({ ...seasonForm, title: event.target.value })} /></label><label>Antal simpass per vecka<input type="number" min="1" max="14" required value={seasonForm.target} onChange={(event) => setSeasonForm({ ...seasonForm, target: event.target.value })} /></label><label>Från<input type="date" required value={seasonForm.startDate} onChange={(event) => setSeasonForm({ ...seasonForm, startDate: event.target.value })} /></label><label>Till<input type="date" required value={seasonForm.endDate} onChange={(event) => setSeasonForm({ ...seasonForm, endDate: event.target.value })} /></label><label className="wide">Min tanke efter utvecklingssamtalet<textarea maxLength="1000" value={seasonForm.reflection} onChange={(event) => setSeasonForm({ ...seasonForm, reflection: event.target.value })} /></label><button className="primary-button">Spara mitt mål →</button></form>}</section>
    <section className="assigned-programs"><p className="eyebrow">Från tränarna</p><h2>Mina program</h2>{training?.assignments?.length ? training.assignments.map((assignment) => { const programGoals = training.programGoals.filter((goal) => goal.assignmentId === assignment.id); return <article key={assignment.id}><header><span>{assignment.program.type === 'strength' ? '🏋️' : '🤸'}</span><div><strong>{assignment.program.title}</strong><small>{assignment.program.type === 'strength' ? 'Styrketräning' : 'Landträning'}</small></div></header><p>{assignment.program.description}</p>{assignment.program.type === 'strength' ? <StrengthProgramRunner assignment={assignment} logs={training.strengthLogs || []} code={code} onSaved={load} /> : <DrylandProgramRunner assignment={assignment} logs={training.drylandLogs || []} sessions={training.sessions || []} code={code} onSaved={load} />}{programGoals.map((goal) => <div className="program-goal" key={goal.id}><strong>🎯 {goal.title} · {goal.rewardPoints} poäng</strong><p>{goal.description}</p><span>{goal.status === 'approved' ? `Godkänt! ${goal.coachFeedback}` : goal.status === 'submitted' ? 'Väntar på tränaren' : goal.status === 'continue' ? `Fortsätt jobba · ${goal.coachFeedback}` : ''}</span>{['active', 'continue'].includes(goal.status) && <button onClick={() => submitProgramGoal(goal.id)}>Redo för godkännande →</button>}</div>)}</article> }) : <p className="empty">Inga styrke- eller landträningsprogram ännu.</p>}</section>
<section className="development-section"><p className="eyebrow">Privat mellan dig och tränarna</p><h2>Mina utvecklingsmål</h2><p className="development-guidance">Läs målet och skriv gärna vad du tänker eller undrar. Ditt svar går till tränarna här på målet. De kan svara med återkoppling, och ni kan fortsätta prata om det tillsammans.</p>{goals.length ? <div className="goal-list">{goals.map((goal) => <article className="goal-card" key={goal.id}><header><span className={`goal-status ${goal.status}`}>{GOAL_STATUS[goal.status]}</span><small>{goal.targetDate ? `Mål: ${new Date(`${goal.targetDate}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}` : 'Inget slutdatum'}</small></header><h2>{goal.title}</h2><p>{goal.description}</p><GoalAnalysisImage goal={goal} code={code} />{goal.nextStep && <div className="next-step"><strong>Nästa steg</strong><span>{goal.nextStep}</span></div>}<div className="goal-timeline">{goal.updates.map((update) => <div key={update.id}><span>{update.authorRole === 'coach' ? '🎯' : '💭'}</span><p><strong>{update.authorRole === 'coach' ? 'Tränarna' : 'Mitt svar'} {update.points > 0 && <b>+{update.points} poäng</b>}</strong><small>{update.content}</small></p></div>)}</div>{goal.status !== 'complete' && <div className="reflection-box"><input maxLength="1000" placeholder="Vad tänker du om målet?" value={reflection[goal.id] || ''} onChange={(event) => setReflection({ ...reflection, [goal.id]: event.target.value })} /><button type="button" disabled={Boolean(sendingReflection)} onClick={() => addReflection(goal.id)}>{sendingReflection === goal.id ? 'Skickar…' : 'Skicka till tränarna'}</button></div>}</article>)}</div> : <p className="empty">Inga utvecklingsmål ännu.</p>}</section>
  </>}</div></div>
}

function MyProfile({ profile, points, code, onProfileChange, onBack, onDiary, onOpenTalk, onProfileLogout }) {
  const [responses, setResponses] = useState([])
  const [artifacts, setArtifacts] = useState([])
  const [competitionResults, setCompetitionResults] = useState([])
  const [developmentTalks, setDevelopmentTalks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ displayName: profile.displayName, emoji: profile.emoji })
  const [editError, setEditError] = useState('')
  useEffect(() => {
    apiRequest('/api/responses?mine=true', code).then((data) => setResponses(data.responses)).finally(() => setLoading(false))
    apiRequest('/api/points?artifacts=true', code).then((data) => setArtifacts(data.artifacts || [])).catch(() => {})
    apiRequest('/api/profiles?competitionResults=true', code).then((data) => setCompetitionResults(data.results || [])).catch(() => {})
    apiRequest('/api/goals?talks=true', code).then((data) => setDevelopmentTalks(data.talks || [])).catch(() => {})
  }, [code])
  return (
    <div className="my-profile-page">
      <button className="back-button" onClick={onBack}>← Tillbaka</button>
      <section className="profile-summary"><span>{profile.emoji}</span><div><p className="eyebrow">Min profil</p><h1>{profile.displayName}</h1><small>@{profile.username}</small></div>{points?.current && <div className="profile-level"><b>{points.current.emoji} {points.current.name}</b><span>{points.total} poäng</span></div>}</section>
      {!editing ? <button className="profile-edit-button" onClick={() => { setEditForm({ displayName: profile.displayName, emoji: profile.emoji }); setEditError(''); setEditing(true) }}>✏️ Ändra namn eller emoji</button> : <form className="profile-edit-form" onSubmit={async (event) => { event.preventDefault(); setEditError(''); try { const data = await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update-profile', ...editForm }) }); onProfileChange(data.profile); setEditing(false) } catch (error) { setEditError(error.message) } }}><label>Visningsnamn<input maxLength="40" required value={editForm.displayName} onChange={(event) => setEditForm({ ...editForm, displayName: event.target.value })} /></label><fieldset><legend>Välj emoji</legend><div className="avatar-picker">{PROFILE_EMOJIS.map((emoji) => <button type="button" className={editForm.emoji === emoji ? 'selected' : ''} key={emoji} onClick={() => setEditForm({ ...editForm, emoji })}>{emoji}</button>)}</div><input className="custom-emoji-input" maxLength="16" aria-label="Egen emoji" placeholder="Eller skriv en egen emoji" value={editForm.emoji} onChange={(event) => setEditForm({ ...editForm, emoji: event.target.value })} /></fieldset>{editError && <p className="form-error">{editError}</p>}<div><button type="button" className="secondary-button" onClick={() => setEditing(false)}>Avbryt</button><button className="primary-button">Spara ändringar</button></div></form>}
      <section className="artifact-collection"><div><p className="eyebrow">Min samling</p><h2>Artefakter</h2><small>Små bevis på vanor, utveckling och lagkänsla.</small></div>{artifacts.length ? <div className="artifact-grid">{artifacts.map((artifact) => <article key={artifact.id} title={artifact.description}><span>{artifact.emoji}</span><strong>{artifact.name}</strong><small>{new Date(artifact.awardedAt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</small></article>)}</div> : <p className="empty">Din samling är tom än så länge.</p>}</section>
      <button type="button" className="profile-diary-link" onClick={onDiary}><span><strong>📖 Min träningsdagbok</strong><small>Pass, träningsmängd, utveckling och egna reflektioner</small></span><b>→</b></button>
      <PushNotificationControl code={code} />
      {competitionResults.length > 0 && <details className="my-competition-results"><summary><span><p className="eyebrow">Tävlingsresultat</p><h2>Mina tävlingsresultat</h2><small>{competitionResults.length} sparade resultat · tryck för att visa</small></span><b>＋</b></summary><div className="competition-event-list">{[...new Set(competitionResults.map((item) => item.event))].sort((a, b) => a.localeCompare(b, 'sv')).map((event) => { const items = competitionResults.filter((item) => item.event === event); const best = items.slice().sort((a, b) => (a.result_time || 999999) - (b.result_time || 999999))[0]; return <details key={event}><summary><span>{event}</span><b>{best.swim_time}</b></summary><div className="competition-history">{items.slice(0, 20).map((item) => <span key={item.id}>{item.pool || 'Bassäng saknas'} · {item.result_date ? new Date(`${item.result_date}T12:00:00`).toLocaleDateString('sv-SE') : item.result_year ? `Cirka ${item.result_year}` : 'Datum okänt'} · {item.swim_time}{item.source === 'manual' ? ' · Manuellt tillagt' : ''}</span>)}</div></details> })}</div></details>}
      <SwimmerTalkHistory talks={developmentTalks} onOpenTalk={onOpenTalk} />
      <details className="my-history"><summary><span><h2>Min historik</h2><small>Endast svar du valde att koppla till profilen</small></span><b>＋</b></summary>{loading ? <p className="empty">Hämtar…</p> : responses.length ? responses.map((item) => <article key={item.id}><span>{FEELINGS[item.feeling - 1]?.emoji}</span><div><strong>{responseDate(item).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'short' })}</strong><small>{DAY_TYPES.find((type) => type.value === item.type)?.title}{item.lateEntry && ` · Efterregistrerad ${new Date(item.submittedAt || item.createdAt).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`}</small></div>{item.rpe && <b>RPE {item.rpe}</b>}</article>) : <p className="empty">Inga profilsvar ännu.</p>}</details>
      {!showAnalytics ? <button className="primary-button profile-stats-button" onClick={() => setShowAnalytics(true)}>📊 Visa min statistik →</button> : <AnalysisDashboard code={code} profile={profile} selfView onBack={() => setShowAnalytics(false)} />}
      <button className="profile-logout" onClick={onProfileLogout}>Logga ut från profilen</button>
    </div>
  )
}

function CheckIn({ code, activityDate, identified, hasProfile, competitionToday, competitionStatusLoaded = true, lateEntry = false, followUp = false, raceFollowUp = false, plannedWorkouts = [], plannedSwimSlots = [], onBack, onSubmit }) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(() => followUp || raceFollowUp ? { type: 'after', ...(raceFollowUp ? { competition: true } : {}) } : {})
  const [competitionDecision, setCompetitionDecision] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [sleepStatus, setSleepStatus] = useState('loading')
  const [sleepError, setSleepError] = useState('')
  const [sleepRetry, setSleepRetry] = useState(0)
  const [sleepSaved, setSleepSaved] = useState(false)
  const [workoutOptions, setWorkoutOptions] = useState([])
  const [optionsStatus, setOptionsStatus] = useState('loading')
  const [optionsRetry, setOptionsRetry] = useState(0)
  useEffect(() => {
    if (!hasProfile) { setOptionsStatus('done'); return }
    let active = true
    setOptionsStatus('loading')
    apiRequest(`/api/workouts?checkinChoices=true&date=${activityDate}`, code).then((data) => {
      if (active) { setWorkoutOptions(data.options || []); setOptionsStatus('done') }
    }).catch(() => { if (active) setOptionsStatus('error') })
    return () => { active = false }
  }, [code, activityDate, hasProfile, optionsRetry])
  useEffect(() => {
    if (!identified || !hasProfile) { setSleepStatus('done'); return }
    let active = true
    setSleepStatus('loading'); setSleepError('')
    apiRequest(`/api/responses?sleep=true&start=${activityDate}&end=${activityDate}`, code).then((data) => { if (active) setSleepStatus(data.records?.length ? 'done' : 'needed') }).catch((error) => { if (active) { setSleepError(error.message); setSleepStatus('error') } })
    return () => { active = false }
  }, [code, activityDate, identified, hasProfile, sleepRetry])
  const typeQuestions = form.type ? getQuestions(form.type, form.activityType).filter((question) => question.key !== 'sleep') : []
  const raceQuestions = competitionToday && hasProfile && form.competition === true ? [{ key: 'body', title: form.type === 'after' ? 'Hur kändes kroppen under tävlingen?' : 'Hur känns kroppen inför tävlingen?', hint: '1 = väldigt tung · 5 = väldigt bra', kind: 'scale', count: 5, left: 'Tung', right: 'Bra' }, { key: 'energy', title: 'Hur känns energin?', hint: '1 = låg · 5 = hög', kind: 'scale', count: 5, left: 'Låg', right: 'Hög' }, { key: 'motivation', title: form.type === 'after' ? 'Hur kändes huvudet?' : 'Hur känns huvudet?', hint: '1 = stressat eller oroligt · 5 = lugnt och fokuserat', kind: 'scale', count: 5, left: 'Oroligt', right: 'Fokuserat' }, { key: 'speedFeeling', title: form.type === 'after' ? 'Hur var fartkänslan i tävlingen?' : 'Hur redo känns du för att tävla?', hint: '1 = låg/trög · 5 = riktigt bra', kind: 'scale', count: 5, left: 'Låg', right: 'Bra' }, { key: 'raceConcern', title: 'Behöver tränaren veta något?', hint: 'Välj bara om något behöver fångas upp idag.', kind: 'concern' }, { key: 'comment', title: 'Något du vill säga?', hint: 'Helt frivilligt – skriv en kort rad till tränaren.', kind: 'comment' }] : []
  const questions = [...(identified && hasProfile && sleepStatus !== 'done' ? [{ key: 'dailySleep', title: lateEntry ? 'Hur sov du inför gårdagen?' : 'Hur sov du i natt?', hint: 'Berätta ungefär hur länge och hur det kändes.', kind: 'dailySleep' }] : []), ...(form.competition === true ? raceQuestions : typeQuestions)]
  const needsActivity = form.type === 'after' && form.competition !== true
  const swimPlans = hasProfile ? workoutOptions : (Array.isArray(plannedWorkouts) ? plannedWorkouts : [plannedWorkouts]).filter(Boolean)
  const primarySwimPlan = swimPlans[0] || null
  const hasPlannedSwim = Boolean(primarySwimPlan || plannedSwimSlots.length)
  const needsPassChoice = form.competition !== true && (form.type === 'before' || (needsActivity && form.activityType === 'swim'))
  const needsSwimSlot = needsPassChoice && form.activityType === 'swim'
  const slotStep = needsActivity ? 2 : 1
  const needsWorkoutChoice = needsActivity && form.activityType === 'swim'
  const workoutStep = slotStep + 1
  const slotTime = form.trainingSlot === 'morning_swim' ? 'morning' : 'afternoon'
  const slotOptions = swimPlans.filter((plan) => !plan.timeOfDay || plan.timeOfDay === slotTime)
  const selectedOption = slotOptions.find((plan) => workoutReference(plan) === form.workoutReference)
  const questionOffset = (needsActivity ? 3 : 2) + (needsPassChoice ? 1 : 0) + (needsWorkoutChoice ? 1 : 0)
  const total = questionOffset + questions.length

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const chooseActivity = (activityType, plannedCompletion = null) => setForm((current) => ({
    ...current,
    activityType,
    plannedCompletion: plannedCompletion || (activityType === 'swim' ? 'full' : current.plannedCompletion === 'no' ? 'no' : null),
    // Planerad mängd ligger redan i planeringen och ska inte presenteras som
    // självrapporterad mängd, särskilt inte när simmaren väljer "Delvis".
    activityDistanceMeters: null,
    activityMinutes: null,
    trainingSlot: null,
    workoutReference: null,
  }))
  const next = () => setStep((current) => current + 1)
  const submit = async () => {
    if (needsSwimSlot && !['morning_swim', 'afternoon_swim'].includes(form.trainingSlot)) { setSubmitError('Välj morgonpass eller eftermiddag / kväll innan du skickar.'); return }
    if (needsWorkoutChoice && (optionsStatus !== 'done' || (slotOptions.length && !selectedOption))) { setSubmitError('Gå tillbaka och välj vilket upplägg du tränade.'); return }
    setSubmitting(true)
    setSubmitted(true)
    setSubmitError('')
    try {
      await onSubmit(form)
    } catch (error) {
      setSubmitError(error.message || 'Kunde inte skicka svaret. Försök igen.')
      setSubmitted(false)
      setSubmitting(false)
    }
  }

  let content
  if (step === 0) {
    if (!lateEntry && hasProfile && !competitionStatusLoaded) {
      content = <Question eyebrow="Snabbkoll" title="Hämtar dagens tävlingsinfo…" hint="Ett ögonblick, så visar vi rätt check-in för idag."><div className="loading-state" role="status">Laddar…</div></Question>
    } else {
    const showCompetitionChoice = !lateEntry && competitionToday && hasProfile && competitionDecision === null
    content = (
      <Question eyebrow={lateEntry ? 'Efterregistrering' : 'Snabbkoll'} title={lateEntry ? 'Vad gjorde du igår?' : showCompetitionChoice ? 'Ska du tävla idag?' : raceFollowUp ? 'Hur gick simtävlingen?' : followUp ? 'Hur gick simträningen?' : 'Hur ser din dag ut?'} hint={lateEntry ? 'Välj det som bäst beskriver gårdagen.' : showCompetitionChoice ? 'Tävlingscheck-in ersätter träningsfrågan idag.' : raceFollowUp ? 'Svara kort på hur tävlingen gick.' : followUp ? 'Jag har tränat är förvalt – ändra om det inte stämmer.' : 'Välj det som stämmer bäst just nu.'}>
        <div className="choice-stack">
          {showCompetitionChoice ? <><button className="choice-card" onClick={() => { setCompetitionDecision('before'); setForm((current) => ({ ...current, competition: true, workoutReference: null, type: 'before', registerTraining: hasProfile, trainingSlot: 'afternoon_swim' })); next() }}><span className="choice-icon">🏁</span>Ja, jag ska tävla<span>›</span></button><button className="choice-card" onClick={() => { setCompetitionDecision('after'); setForm((current) => ({ ...current, competition: true, workoutReference: null, type: 'after', registerTraining: hasProfile, trainingSlot: 'afternoon_swim' })); next() }}><span className="choice-icon">🏅</span>Jag har tävlat<span>›</span></button><button className="choice-card" onClick={() => { setCompetitionDecision('none') }}><span className="choice-icon">→</span>Nej<span>›</span></button></> : DAY_TYPES.filter((type) => !lateEntry || type.value !== 'before').map((type) => (
              <button key={type.value} className={`choice-card${(followUp || lateEntry) && type.value === 'after' ? ' selected' : ''}`} onClick={() => { const countsAsAttendance = hasProfile && type.value === 'after'; setForm((current) => ({ ...current, type: type.value, competition: false, workoutReference: null, activityType: type.value === 'before' ? 'swim' : null, registerTraining: countsAsAttendance, trainingSlot: null })); next() }}>
              <span className="choice-icon">{type.icon}</span>{lateEntry ? ({ after: 'Jag tränade / tävlade', rest: 'Jag vilade', sick: 'Jag var sjuk' }[type.value]) : type.title}<span>›</span>
            </button>
          ))}
        </div>
      </Question>
    )
    }
  } else if (step === 1 && needsActivity) {
    content = <Question eyebrow="Din träning" title={hasPlannedSwim ? 'Genomförde du simträningen?' : 'Vad tränade du?'} hint={hasPlannedSwim ? 'Du väljer morgon/eftermiddag och upplägg i nästa steg.' : 'Välj det som stämmer bäst.'}>
      {hasPlannedSwim && <p className="checkin-selection-note">Dina passuppgifter finns i planeringen. Du väljer vilket upplägg du körde efter valet av morgon eller eftermiddag.</p>}
      {hasPlannedSwim && <div className="checkin-completion-choice"><button type="button" className={form.activityType === 'swim' && form.plannedCompletion === 'full' ? 'active' : ''} onClick={() => { chooseActivity('swim', 'full'); next() }}>Ja, hela passet</button><button type="button" className={form.activityType === 'swim' && form.plannedCompletion === 'partial' ? 'active' : ''} onClick={() => { chooseActivity('swim', 'partial'); next() }}>Delvis</button><button type="button" className={form.plannedCompletion === 'no' ? 'active' : ''} onClick={() => setForm((current) => ({ ...current, activityType: null, plannedCompletion: 'no', activityDistanceMeters: null, activityMinutes: null }))}>Nej</button></div>}
      {(!hasPlannedSwim || form.plannedCompletion === 'no') && <p className="checkin-alternative-label">{hasPlannedSwim ? 'Tränade du något annat?' : 'Välj aktivitet'}</p>}
      {(!hasPlannedSwim || form.plannedCompletion === 'no') && <div className="choice-stack checkin-activity-choices">{[{ key: 'swim', label: 'Simning', detail: 'Simpass utan kopplad planering', emoji: '🏊' }, { key: 'strength', label: 'Styrka', detail: 'Styrketräning på gymmet', emoji: '🏋️' }, { key: 'other', label: 'Annat', detail: 'Till exempel löpning eller cykling', emoji: '👟' }].filter((activity) => !hasPlannedSwim || activity.key !== 'swim').map((activity) => <button type="button" className={`choice-card choice-card-with-description${form.activityType === activity.key ? ' selected' : ''}`} aria-pressed={form.activityType === activity.key} key={activity.key} onClick={() => chooseActivity(activity.key)}><span><span className="checkin-activity-choice-title">{activity.emoji} {activity.label}</span><small>{activity.detail}</small></span><span aria-hidden="true">›</span></button>)}</div>}
      {form.activityType === 'other' && <div className="checkin-activity-details other"><label>Vad tränade du?<textarea maxLength="300" placeholder="Till exempel: Jag löptränade 5 km" value={form.comment || ''} onChange={(event) => update('comment', event.target.value)} /></label><label>Ungefär hur länge? <small>(frivilligt)</small><div className="checkin-time-input"><input type="number" min="1" max="1440" inputMode="numeric" value={form.activityMinutes ?? ''} onChange={(event) => update('activityMinutes', event.target.value ? Number(event.target.value) : null)} /><span>min</span></div></label></div>}
      {form.activityType === 'strength' && <p className="checkin-selection-note">Styrkepasset registreras utan att du behöver ange tid.</p>}
      {form.activityType === 'swim' && !hasPlannedSwim && <p className="checkin-selection-note">Simpasset registreras. Du behöver inte ange tid eller distans.</p>}
      {(!hasPlannedSwim || form.plannedCompletion === 'no') && <button type="button" className="primary-button" disabled={!form.activityType || (form.activityMinutes != null && (form.activityMinutes <= 0 || form.activityMinutes > 1440))} onClick={next}>Fortsätt →</button>}
    </Question>
  } else if (needsPassChoice && step === slotStep && form.type === 'before') {
    content = <Question eyebrow="Din träning" title="Vilket pass ska du träna?" hint="Välj passet du planerar. Det räknas som genomfört först när du rapporterar efteråt.">
      <div className="choice-stack">{BEFORE_TRAINING_CHOICES.map((option) => <button type="button" key={option.slot || option.activityType} className={`choice-card choice-card-with-description${form.activityType === option.activityType && form.trainingSlot === option.slot ? ' selected' : ''}`} onClick={() => { setForm((current) => selectBeforeTraining(current, option)); next() }}><span>{option.label}<small>{option.activityType === 'strength' ? 'Jag ska träna på gymmet' : swimPlans.filter((plan) => plan.timeOfDay === option.time).map((plan) => plan.title).join(' · ') || (plannedSwimSlots.includes(option.slot) ? 'Finns i din veckoplan' : 'Välj om detta är passet du menar')}</small></span><span>›</span></button>)}</div>
    </Question>
  } else if (needsSwimSlot && step === slotStep) {
    content = <Question eyebrow="Vilket simpass?" title={form.type === 'before' ? 'Vilket pass ska du träna?' : 'Vilket pass tränade du?'} hint="Svaret kopplas bara till det pass du väljer. Rapportera båda separat om du tränat två simpass.">
      <div className="choice-stack">{[{ slot: 'morning_swim', time: 'morning', label: '🌅 Morgonpass' }, { slot: 'afternoon_swim', time: 'afternoon', label: '🌇 Eftermiddag / kväll' }].map((option) => <button type="button" key={option.slot} className={`choice-card choice-card-with-description${form.trainingSlot === option.slot ? ' selected' : ''}`} onClick={() => { const options = swimPlans.filter((plan) => !plan.timeOfDay || plan.timeOfDay === option.time); setForm((current) => ({ ...current, trainingSlot: option.slot, workoutReference: current.type === 'after' && options.length === 1 ? workoutReference(options[0]) : null, activityDistanceMeters: null, activityMinutes: null })); next() }}><span>{option.label}<small>{swimPlans.filter((plan) => plan.timeOfDay === option.time).map((plan) => plan.title).join(' · ') || (plannedSwimSlots.includes(option.slot) ? 'Finns i din veckoplan' : 'Välj om detta är passet du menar')}</small></span><span>›</span></button>)}</div>
    </Question>
  } else if (needsWorkoutChoice && step === workoutStep) {
    content = <Question eyebrow="Ditt simpass" title={slotOptions.length > 1 ? 'Vilket upplägg körde du?' : 'Stämmer passuppgifterna?'} hint="Bara det valda upplägget räknas. Justera mängden om du simmade något annat.">
      {optionsStatus === 'loading' ? <p role="status">Hämtar passalternativ…</p> : optionsStatus === 'error' ? <div><p className="form-error">Passalternativen kunde inte hämtas.</p><button type="button" className="secondary-button" onClick={() => setOptionsRetry((value) => value + 1)}>Försök igen</button></div> : <>
        <div className="choice-stack">{slotOptions.map((plan) => <button type="button" key={workoutReference(plan)} className={`choice-card choice-card-with-description${form.workoutReference === workoutReference(plan) ? ' selected' : ''}`} aria-pressed={form.workoutReference === workoutReference(plan)} onClick={() => setForm((current) => ({ ...current, workoutReference: workoutReference(plan), activityDistanceMeters: null, activityMinutes: null }))}><span>{plan.title}<small>{[plan.focus, plan.distanceMeters && `${Number(plan.distanceMeters).toLocaleString('sv-SE')} m`, plan.durationMinutes && `${plan.durationMinutes} min`].filter(Boolean).join(' · ')}</small></span><span>{form.workoutReference === workoutReference(plan) ? '✓' : '○'}</span></button>)}</div>
        {!slotOptions.length && <p>Inget upplagt pass hittades för den här träningen. Du kan ange mängden själv.</p>}
        {(selectedOption || !slotOptions.length) && <div className="workout-choice-amounts"><label>Simmade meter <small>{selectedOption?.distanceMeters ? `Planerat: ${selectedOption.distanceMeters.toLocaleString('sv-SE')} m` : 'Frivilligt'}</small><input type="number" min="1" max="1000000" inputMode="numeric" value={form.activityDistanceMeters ?? ''} placeholder={form.plannedCompletion === 'full' ? String(selectedOption?.distanceMeters || '') : 'Ange om du vet'} onChange={(event) => update('activityDistanceMeters', event.target.value ? Number(event.target.value) : null)} /></label><label>Träningstid i minuter <small>{selectedOption?.durationMinutes ? `Planerat: ${selectedOption.durationMinutes} min` : 'Frivilligt'}</small><input type="number" min="1" max="1440" inputMode="numeric" value={form.activityMinutes ?? ''} placeholder={form.plannedCompletion === 'full' ? String(selectedOption?.durationMinutes || '') : 'Ange om du vet'} onChange={(event) => update('activityMinutes', event.target.value ? Number(event.target.value) : null)} /></label></div>}
        <p className="settings-help">Lämna fälten tomma för att använda det valda passets planerade mängd som uppskattning vid helt genomfört pass. Vid delvis genomfört pass räknas bara den mängd du anger.</p>
        <button type="button" className="primary-button" disabled={Boolean(slotOptions.length && !selectedOption) || [form.activityDistanceMeters, form.activityMinutes].some((value) => value != null && (!Number.isInteger(value) || value <= 0)) || form.activityDistanceMeters > 1000000 || form.activityMinutes > 1440} onClick={next}>Fortsätt →</button>
      </>}
    </Question>
  } else if (step === questionOffset - 1) {
    content = (
      <Question eyebrow={lateEntry ? 'Efterregistrering' : 'Snabbkoll'} title={lateEntry ? 'Hur mådde du igår?' : 'Hur känns det idag?'} hint="Gå på magkänslan.">
        <div className="feeling-grid">
          {FEELINGS.map((feeling) => (
            <button key={feeling.value} onClick={() => { update('feeling', feeling.value); next() }}>
              <span>{feeling.emoji}</span><small>{feeling.label}</small>
            </button>
          ))}
        </div>
      </Question>
    )
  } else {
    const question = questions[step - questionOffset]
    content = (
      <Question eyebrow={lateEntry ? 'Efterregistrering' : 'Snabbkoll'} title={lateEntry ? question.title.replaceAll('idag', 'igår').replaceAll('nu?', 'igår?') : question.title} hint={question.hint}>
        {question.kind === 'dailySleep' && (sleepSaved ? <div><p>Sömnkollen är hanterad för den här dagen.</p><button type="button" className="primary-button" onClick={next}>Fortsätt →</button></div> : sleepStatus === 'loading' ? <p role="status">Kontrollerar om du redan svarat idag…</p> : sleepStatus === 'error' ? <div><p className="form-error" role="alert">{sleepError}</p><button type="button" className="secondary-button" onClick={() => setSleepRetry((value) => value + 1)}>Försök igen</button><button type="button" className="text-button" onClick={next}>Fortsätt utan sömnkoll</button></div> : <SleepQuestion date={activityDate} code={code} request={apiRequest} lateEntry={lateEntry} onContinue={() => { setSleepSaved(true); next() }} />)}
        {question.kind === 'scale' && (
          <Scale
            count={question.count}
            left={question.left}
            right={question.right}
            onChange={(value) => { update(question.key, value); next() }}
          />
        )}
        {question.kind === 'options' && <div className={`checkin-feedback-options${question.options.some((option) => typeof option !== 'string') ? ' strength-feel-options' : ''}`}>{question.options.map((option, index) => { const label = typeof option === 'string' ? option : option.label; return <button type="button" key={label} aria-label={label} onClick={() => { update(question.key, index + 1); next() }}>{typeof option === 'string' ? label : <><span aria-hidden="true">{option.emoji}</span><strong>{label}</strong></>}</button> })}</div>}
        {question.kind === 'rating' && (
          <div className="thumb-grid">
            {[{ value: 1, icon: '👎', label: 'Inte bra' }, { value: 3, icon: '😐', label: 'Helt okej' }, { value: 5, icon: '👍', label: 'Bra' }].map((option) => (
              <button key={option.value} onClick={() => { update(question.key, option.value); next() }}>
                <span>{option.icon}</span><small>{option.label}</small>
              </button>
            ))}
          </div>
        )}
        {question.kind === 'concern' && <div className="concern-choice"><button type="button" onClick={() => { update('raceConcern', 'sick_or_pain'); next() }}>⚠️ Jag känner mig sjuk eller har ont</button><button type="button" onClick={() => { update('raceConcern', 'none'); next() }}>Nej, inget särskilt</button></div>}
        {question.kind === 'comment' && (
          <div className="comment-box">
            <textarea autoFocus maxLength="300" placeholder="Skriv här…" value={form.comment || ''} onChange={(event) => update('comment', event.target.value)} />
            {hasProfile && (form.type === 'after' || (competitionToday && ['before', 'after'].includes(form.type) && form.competition === true)) && <div className="training-register"><label className="training-toggle"><input type="checkbox" checked={form.registerTraining === true} disabled={competitionToday && form.competition === true} onChange={(event) => update('registerTraining', event.target.checked)} /><span><strong>{competitionToday && form.competition === true ? 'Tävlingscheck-in räknas som närvaro' : `Registrera ${activityLabel(form.activityType).toLowerCase()} i träningsloggen`}</strong><small>{competitionToday && form.competition === true ? 'Ditt tävlingsdeltagande läggs i veckans simnärvaro.' : 'Läggs i din personliga träningslogg med vald aktivitet. Feedbacken kan fortfarande vara anonym.'}</small></span></label>{form.registerTraining && form.activityType === 'swim' && !(competitionToday && form.competition === true) && <p className="checkin-selection-note">Valt pass: {form.trainingSlot === 'morning_swim' ? '🌅 Morgon' : '🌇 Eftermiddag / kväll'}. Ändra via Tillbaka om det blev fel.</p>}</div>}
            {submitError && <span className="error-text">{submitError}</span>}
            {submitted ? <div className="submit-confirmation" role="status"><span>✓</span><strong>Svaret sparas…</strong><small>Du kommer vidare strax.</small></div> : <div><button className="skip-button" disabled={submitting} onClick={submit}>Skicka utan kommentar</button><button className="primary-button small" disabled={submitting} onClick={submit}>Skicka svar →</button></div>}
          </div>
        )}
      </Question>
    )
  }

  return (
    <div className="checkin-page">
      <div className="progress"><span style={{ width: `${((step + 1) / total) * 100}%` }} /></div>
      <button className="back-button" onClick={step === 0 ? onBack : () => setStep((current) => current - 1)}>← Tillbaka</button>
      <div className="question-wrap">{content}</div>
      <div className="step-count">{Math.min(step + 1, total)} / {total}</div>
    </div>
  )
}

function Question({ eyebrow = 'Snabbkoll', title, hint, children }) {
  return <section className="question"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{hint}</p>{children}</section>
}

function Scale({ count, left, right, onChange }) {
  return (
    <div className="scale-wrap">
      <div className={`scale-grid scale-${count}`}>
        {Array.from({ length: count }, (_, index) => <button key={index} onClick={() => onChange(index + 1)}>{index + 1}</button>)}
      </div>
      <div className="scale-labels"><span>{left}</span><span>{right}</span></div>
    </div>
  )
}

function getQuestions(type, activityType = null) {
  const comment = { key: 'comment', title: 'Något du vill säga?', hint: 'Helt frivilligt. Tränaren ser inte vem som har skrivit.', kind: 'comment' }
  if (type === 'after') {
    const activityFeel = activityType === 'strength'
      ? { key: 'body', title: 'Hur kändes kroppen på gymmet idag?', hint: 'Välj det som bäst beskriver kroppens kraft och spänst.', kind: 'options', options: [{ emoji: '😩', label: 'Kraftlös' }, { emoji: '😕', label: 'Seg' }, { emoji: '😐', label: 'Normal' }, { emoji: '💪', label: 'Stark' }, { emoji: '🔥', label: 'Explosiv' }] }
      : { key: 'speedFeeling', title: 'Hur var fartkänslan?', hint: 'Din egen känsla av fart i passet.', kind: 'scale', count: 5, left: 'Trög', right: 'Riktigt bra fart' }
    return [
      { key: 'rpe', title: 'Hur jobbigt var passet?', hint: '1 är väldigt lätt. 10 är maxjobbigt.', kind: 'scale', count: 10, left: 'Väldigt lätt', right: 'Maxjobbigt' },
      activityFeel,
      { key: 'temperature', title: 'Hur kändes temperaturen?', hint: 'Tänk på helheten i träningsmiljön, inne eller ute.', kind: 'scale', count: 5, left: 'Väldigt kallt', right: 'För varmt' },
      { key: 'pass', title: 'Hur var passet?', hint: 'Din upplevelse – det finns inget rätt svar.', kind: 'rating' },
      { key: 'setup', title: 'Funkade upplägget för dig?', hint: 'Tänk på passet som helhet.', kind: 'rating' },
      ...(activityType === 'strength' ? [] : [{ key: 'body', title: 'Hur känns kroppen nu?', hint: '1 är tung eller öm. 5 är pigg och fräsch.', kind: 'scale', count: 5, left: 'Tung', right: 'Pigg' }]),
      comment,
    ]
  }
  if (type === 'before') return [
    { key: 'energy', title: 'Hur mycket energi har du?', hint: 'Gå på känslan just nu.', kind: 'scale', count: 5, left: 'Ingen energi', right: 'Full fart' },
    { key: 'body', title: 'Hur känns kroppen?', hint: '1 är tung eller öm. 5 är pigg och fräsch.', kind: 'scale', count: 5, left: 'Tung', right: 'Pigg' },
    { key: 'motivation', title: 'Hur taggad är du?', hint: 'På dagens träning.', kind: 'scale', count: 5, left: 'Inte alls', right: 'Mycket' },
    comment,
  ]
  if (type === 'sick') return [
    { key: 'body', title: 'Hur känns kroppen?', hint: '1 är riktigt hängig. 5 känns ändå okej.', kind: 'scale', count: 5, left: 'Hängig', right: 'Okej' },
    { key: 'comment', title: 'Vill du lämna en kort rad?', hint: 'Helt frivilligt – skriv inga diagnoser eller känsliga detaljer.', kind: 'comment' },
  ]
  return [
    { key: 'energy', title: 'Hur mycket energi har du?', hint: 'Gå på känslan just nu.', kind: 'scale', count: 5, left: 'Ingen energi', right: 'Full fart' },
    { key: 'body', title: 'Hur känns kroppen?', hint: '1 är tung eller öm. 5 är pigg och fräsch.', kind: 'scale', count: 5, left: 'Tung', right: 'Pigg' },
    { key: 'sleep', title: 'Hur sov du?', hint: 'Tänk på natten som helhet.', kind: 'scale', count: 5, left: 'Dåligt', right: 'Jättebra' },
    comment,
  ]
}

function Thanks({ responses, profile, identified, activityDate = todayKey(), lateEntry = false, workout, onDone }) {
  const todayResponses = responses.filter((response) => dateKey(responseDate(response)) === activityDate)
  return (
    <div className="thanks-page">
      <div className="success-mark">✓</div>
      <p className="eyebrow">Klart</p>
      <h1>{lateEntry ? 'Tack för gårdagens check-in!' : 'Tack för din check-in!'}</h1>
      <p>{identified ? 'Svaret har sparats i din profil.' : 'Svaret är anonymt och hjälper tränaren att göra passen bättre.'}</p>
      {!lateEntry && profile && workout && <p className="unlock-message">🔓 Dagens pass är upplåst!</p>}
      <div className="mini-moods">{todayResponses.slice(-7).map((response) => <span key={response.id}>{FEELINGS[response.feeling - 1]?.emoji}</span>)}</div>
      <button className="primary-button" onClick={onDone}>{!lateEntry && profile && workout ? 'Se dagens pass →' : 'Till dagens läge →'}</button>
    </div>
  )
}

function CoachActivitySummary({ code, selectedDate, onDateChange, aiEnabled = true }) {
  const date = selectedDate
  const [notes, setNotes] = useState([])
  const [activities, setActivities] = useState([{ type: 'day', id: date, label: 'Dagens sammanfattning' }])
  const [scope, setScope] = useState(`day:${date}`)
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [polishing, setPolishing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recorderRef = useRef(null)
  const [message, setMessage] = useState('')

  const load = async () => {
    try {
      const noteData = await apiRequest(`/api/workouts?notes=true&date=${date}`, code)
      const loadedNotes = noteData.notes || []
      setNotes(loadedNotes)
      const dayScope = `day:${date}`
      setScope(dayScope)
      setContent(loadedNotes.find((item) => item.scopeKey === dayScope)?.content || '')
      setMessage('')
      const [planResult, calendarResult, workoutResult] = await Promise.allSettled([
        apiRequest('/api/workouts?planning=true', code),
        apiRequest('/api/workouts?calendar=true', code),
        apiRequest(`/api/workouts?date=${date}`, code),
      ])
      const planData = planResult.status === 'fulfilled' ? planResult.value : { plans: [] }
      const calendarData = calendarResult.status === 'fulfilled' ? calendarResult.value : { competitions: [] }
      const workoutData = workoutResult.status === 'fulfilled' ? workoutResult.value : {}
      const planActivities = (planData.plans || []).filter((item) => item.date === date).map((item) => ({ type: item.activityType === 'competition' ? 'competition' : 'workout', id: item.id, label: `${item.activityType === 'competition' ? 'Tävling' : 'Pass'} · ${item.title}` }))
      const competitionActivities = (calendarData.competitions || []).filter((item) => item.startDate <= date && (item.endDate || item.startDate) >= date).map((item) => ({ type: 'competition', id: item.id, label: `Tävling · ${item.title}` }))
      const workoutActivity = workoutData.workout ? [{ type: 'workout', id: workoutData.workout.id, label: `Pass · ${workoutData.workout.title}` }] : []
      const activityOptions = [{ type: 'day', id: date, label: 'Dagens sammanfattning' }, ...workoutActivity, ...planActivities, ...competitionActivities]
      setActivities(activityOptions.filter((item, index, all) => all.findIndex((candidate) => candidate.type === item.type && candidate.label === item.label) === index))
    } catch (error) {
      setMessage('Kunde inte hämta sammanfattningen.')
    }
  }

  useEffect(() => { load(); setScope(`day:${date}`) }, [code, date])
  useEffect(() => {
    const note = notes.find((item) => item.scopeKey === scope)
    setContent(note?.content || '')
    setMessage('')
  }, [scope, notes])
  const selectedActivity = activities.find((item) => `${item.type}:${item.id}` === scope) || activities[0]
  const save = async () => {
    if (!content.trim()) return setMessage('Skriv något innan du sparar.')
    setSaving(true); setMessage('')
    try {
      const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-coach-note', noteDate: date, activityType: selectedActivity.type, activityId: selectedActivity.type === 'day' ? null : selectedActivity.id, content }) })
      setNotes((current) => [data.note, ...current.filter((item) => item.scopeKey !== data.note.scopeKey)])
      setScope(data.note.scopeKey); setMessage('Sammanfattningen är sparad.')
    } catch (error) { setMessage(error.message) } finally { setSaving(false) }
  }
  const polish = async () => {
    if (!aiEnabled) return setMessage('AI-stöd är avstängt i webapp-inställningarna.')
    if (!content.trim()) return setMessage('Skriv några stödord först.')
    setPolishing(true); setMessage('Förbättrar texten…')
    try {
      const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'polish-coach-note', noteDate: date, activityLabel: selectedActivity.label, content }) })
      setContent(data.text || content); setMessage(data.usedAi ? 'Texten är förbättrad – kontrollera den och spara.' : 'AI-stöd är inte tillgängligt just nu. Du kan redigera texten själv.')
    } catch (error) { setMessage(error.message) } finally { setPolishing(false) }
  }
  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return setMessage('Den här webbläsaren stöder inte ljudinspelning.')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type)) || ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks = []
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        const reader = new FileReader()
        reader.onload = async () => {
          setTranscribing(true); setMessage('Transkriberar inspelningen…')
          try {
            const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'transcribe-audio', dataUrl: reader.result, mimeType: blob.type }) })
            if (data.error) throw new Error(data.error)
            setContent((current) => current.trim() ? `${current.trim()}\n\n${data.text || ''}`.trim() : (data.text || ''))
            setMessage(data.text ? 'Transkriberingen är klar – kontrollera texten före sparning.' : 'Inget tal kunde urskiljas.')
          } catch (error) { setMessage(error.message) } finally { setTranscribing(false) }
        }
        reader.readAsDataURL(blob)
      }
      recorderRef.current = recorder; recorder.start(); setRecording(true); setMessage('Spelar in… tryck på stoppa när du är klar.')
    } catch (error) { setMessage(error.name === 'NotAllowedError' ? 'Mikrofontillstånd nekades. Tillåt mikrofonen i webbläsaren.' : 'Kunde inte starta inspelningen.') }
  }
  const stopRecording = () => { recorderRef.current?.stop(); recorderRef.current = null; setRecording(false) }
  return <section className="coach-card coach-activity-summary"><div className="coach-activity-summary-head"><div><p className="eyebrow">Gruppens dokumentation</p><h2>{date === todayKey() ? 'Sammanfatta idag' : 'Sammanfatta vald dag'}</h2><p className="muted">Koppla texten till dagen, ett pass eller en tävling. Tidigare sammanfattningar kan öppnas och ändras.</p></div><span className="coach-note-icon">📝</span></div><label>Vad gäller sammanfattningen?<select value={scope} onChange={(event) => setScope(event.target.value)}>{activities.map((item) => <option key={`${item.type}:${item.id}`} value={`${item.type}:${item.id}`}>{item.label}</option>)}</select></label><textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Skriv stödord eller en kort sammanfattning…" maxLength={5000} /><div className="coach-recording-actions"><button type="button" className={recording ? 'recording-button' : transcribing ? 'secondary-button competition-import-button is-importing' : 'secondary-button'} onClick={recording ? stopRecording : startRecording} disabled={transcribing || polishing || saving}>{recording ? '⏹ Stoppa inspelning' : transcribing ? <span className="competition-import-label"><span className="competition-import-icon" aria-hidden="true">🧠</span>Transkriberar…</span> : '🎙️ Spela in sammanfattning'}</button>{transcribing && <small>Bearbetar ljudet…</small>}</div><div className="coach-activity-summary-actions">{aiEnabled ? <button type="button" className={`secondary-button competition-import-button${polishing ? ' is-importing' : ''}`} onClick={polish} disabled={polishing || saving || recording || transcribing}>{polishing ? <span className="competition-import-label"><span className="competition-import-icon" aria-hidden="true">🧠</span>Förbättrar texten…</span> : '✨ Förbättra med språkmodell'}</button> : <small className="settings-note">AI-stöd är avstängt</small>}<button type="button" className="primary-button small" onClick={save} disabled={saving || polishing || recording || transcribing}>{saving ? 'Sparar…' : 'Spara sammanfattning'}</button></div>{message && <small className="coach-note-status">{message}</small>}{aiEnabled && <p className="coach-note-disclaimer">Ljudet används bara för transkribering och sparas inte i Simkoll. Kontrollera alltid texten före sparning.</p>}</section>
}

function CoachGameLibrary({ code }) {
  const [catalog, setCatalog] = useState(GAME_CATALOG)
  const [schedule, setSchedule] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [testing, setTesting] = useState('')
  useEffect(() => { apiRequest('/api/points?games=true', code).then((data) => { setCatalog(data.catalog || GAME_CATALOG); setSchedule(data.schedule || []) }).catch((error) => setMessage(error.message)).finally(() => setLoading(false)) }, [code])
  const add = () => { const game = catalog[0]; if (!game) return; const start = todayKey(); const end = new Date(`${start}T12:00:00`); end.setDate(end.getDate() + 6); setSchedule((current) => [...current, { id: `draft-${Date.now()}`, gameKey: game.key, startDate: start, endDate: dateKey(end), published: false }]) }
  const update = (id, key, value) => setSchedule((current) => current.map((item) => item.id === id ? { ...item, [key]: value } : item))
  const remove = (id) => setSchedule((current) => current.filter((item) => item.id !== id))
  const save = async () => { setSaving(true); setMessage(''); try { const data = await apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-game-schedule', schedule }) }); setSchedule(data.schedule || []); setMessage('Spelplaneringen är sparad.') } catch (error) { setMessage(error.message) } finally { setSaving(false) } }
  if (testing) {
    const game = catalog.find((item) => item.key === testing)
    if (testing === 'hurdles100') return <section className="game-library"><button className="back-button inline" onClick={() => setTesting('')}>← Tillbaka till spelbiblioteket</button><div className="game-test-banner"><strong>Testläge · {game?.title}</strong><span>Resultat och poäng sparas inte när du testar som tränare.</span></div><HurdlesGame code={code} onBack={() => setTesting('')} preview request={apiRequest} /></section>
    return <section className="game-library"><button className="back-button inline" onClick={() => setTesting('')}>← Tillbaka till spelbiblioteket</button><div className="game-test-banner"><strong>Testläge · {game?.title}</strong><span>Resultat och poäng sparas inte när du testar som tränare.</span></div>{testing === 'swimgames' && <Swimgames code={code} onBack={() => setTesting('')} preview />}{testing === 'vanda' && <Vandningsmastaren code={code} onBack={() => setTesting('')} preview />}{testing === 'simpaus' && <Simpaus code={code} onBack={() => setTesting('')} preview />}{testing === 'aljakten' && <Aljakten code={code} onBack={() => setTesting('')} preview />}{testing === 'longjump' && <LongJumpGame code={code} onBack={() => setTesting('')} preview request={apiRequest} />}{testing === 'sprint100' && <SprintGame code={code} onBack={() => setTesting('')} preview request={apiRequest} />}{testing === 'breakout' && <PreppeBreakout code={code} onBack={() => setTesting('')} preview />}{testing === 'bikerun' && <BikeRun code={code} onBack={() => setTesting('')} preview />}{testing === 'twenty48' && <Twenty48 code={code} onBack={() => setTesting('')} preview />}{testing === 'balance' && <BalanceGame code={code} onBack={() => setTesting('')} preview request={apiRequest} />}{testing === 'dino' && <DinoRunner code={code} onBack={() => setTesting('')} preview request={apiRequest} />}</section>
  }
  return <section className="game-library"><div className="period-heading"><div><p className="eyebrow">Tränarverktyg</p><h1>Veckans spel</h1><small>Testa spelen först och planera sedan vad simmarna ska få tillgång till.</small></div><div className="big-count"><strong>{schedule.filter((item) => item.published).length}</strong><span>publicerade perioder</span></div></div><section className="settings-card game-library-catalog"><h2>Spelbibliotek</h2><p className="settings-help">Testläget använder samma spel, men sparar inga rekord eller poäng.</p><div className="game-library-list">{catalog.map((game) => <article key={game.key}><div><strong>{game.emoji} {game.title}</strong><small>{game.description}</small></div><button className="secondary-button" onClick={() => setTesting(game.key)}>Testa spelet</button></article>)}</div></section><section className="settings-card game-schedule-card"><div className="game-schedule-head"><div><h2>Planera publicering</h2><p className="settings-help">Lägg in perioder i kalendern. Avpublicerade spel syns inte för simmarna, men deras rekord finns kvar.</p></div><button className="secondary-button" onClick={add}>＋ Lägg till period</button></div>{loading ? <p className="empty">Hämtar spelplanering…</p> : schedule.length ? <div className="game-schedule-list">{schedule.map((item) => <article key={item.id}><select value={item.gameKey} onChange={(event) => update(item.id, 'gameKey', event.target.value)}>{catalog.map((game) => <option key={game.key} value={game.key}>{game.emoji} {game.title}</option>)}</select><label>Från<input type="date" value={item.startDate} onChange={(event) => update(item.id, 'startDate', event.target.value)} /></label><label>Till<input type="date" value={item.endDate} onChange={(event) => update(item.id, 'endDate', event.target.value)} /></label><label className="game-publish-toggle"><input type="checkbox" checked={item.published !== false} onChange={(event) => update(item.id, 'published', event.target.checked)} /> Publicerat</label><button className="text-button" onClick={() => remove(item.id)}>Ta bort</button></article>)}</div> : <p className="empty">Ingen period planerad ännu.</p>}<div className="settings-actions"><button className="primary-button" onClick={save} disabled={saving}>{saving ? 'Sparar…' : 'Spara spelplanering'}</button>{message && <small className="settings-saved">{message}</small>}</div></section></section>
}

function CoachAccountManagement({ code, currentAccountId }) {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const load = () => { setLoading(true); apiRequest('/api/auth', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'coach-list' }) }).then((data) => setAccounts(data.accounts || [])).catch((error) => setMessage(error.message)).finally(() => setLoading(false)) }
  useEffect(load, [code])
  const update = async (accountId, payload) => { setMessage(''); try { const data = await apiRequest('/api/auth', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, action: payload.role ? 'coach-set-role' : 'coach-approve', accountId }) }); setAccounts((current) => current.map((item) => item.id === accountId ? { ...item, ...data.account } : item)); setMessage('Ändringen är sparad.') } catch (error) { setMessage(error.message) } }
  const reject = async (account) => {
    if (!confirmDestructive(`Tränaransökan från ${account.display_name} (${account.email}) tas bort permanent. Personen får inget tränarkonto och kan ansöka på nytt senare.`, 'TA BORT')) return
    setMessage('')
    try {
      await apiRequest('/api/auth', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'coach-reject', accountId: account.id }) })
      setAccounts((current) => current.filter((item) => item.id !== account.id))
      setMessage(`Ansökan från ${account.display_name} är borttagen.`)
    } catch (error) { setMessage(error.message) }
  }
  const changeStatus = (account) => { const activating = account.status !== 'active'; if (!activating && !confirmDestructive(`Tränarkontot för ${account.display_name} stängs av och kan inte logga in.`, 'STÄNG AV')) return; update(account.id, { approved: activating }) }
  const changeRole = (account, role) => update(account.id, { role, ...(account.status === 'suspended' ? { approved: true } : {}) })
  return <section className="coach-account-management"><div className="period-heading"><div><p className="eyebrow">Säkerhet</p><h1>Tränarkonton</h1><small>Godkänn eller ta bort ansökningar, aktivera, stäng av och byt roll. Destruktiva val kräver bekräftelse.</small></div><div className="big-count"><strong>{accounts.filter((item) => item.status === 'active').length}</strong><span>aktiva konton</span></div></div>{message && <p className="settings-saved">{message}</p>}{loading ? <p className="empty">Hämtar tränarkonton…</p> : <section className="settings-card coach-account-list">{accounts.map((account) => <article key={account.id}><div><strong>{account.display_name}</strong><small>{account.email} · {coachRoleLabel(account.role)} · {account.status === 'pending' ? 'Väntar på godkännande' : account.status === 'active' ? 'Aktiv' : 'Avstängd'}</small></div><div className="coach-account-actions">{account.status === 'pending' ? <><button className="primary-button" onClick={() => update(account.id, { approved: true })}>Godkänn</button><button className="text-button danger-text" onClick={() => reject(account)}>Ta bort ansökan</button></> : <button className={account.status === 'active' ? 'text-button danger-text' : 'primary-button'} disabled={account.id === currentAccountId && account.status === 'active'} title={account.id === currentAccountId && account.status === 'active' ? 'Du kan inte stänga av ditt eget konto' : undefined} onClick={() => changeStatus(account)}>{account.status === 'active' ? 'Stäng av' : 'Aktivera'}</button>}<select value={account.role} disabled={account.id === currentAccountId && account.role === 'superadmin'} onChange={(event) => changeRole(account, event.target.value)}><option value="coach">Tränare</option><option value="head_coach">Huvudtränare</option><option value="superadmin">Superadmin</option></select></div></article>)}</section>}</section>
}

function CoachActivityFeed({ code }) {
  const [events, setEvents] = useState([])
  const [status, setStatus] = useState('')
  const load = () => apiRequest('/api/community?coachFeed=true', code).then((data) => setEvents(data.events || [])).catch((error) => setStatus(error.message))
  useEffect(() => { load() }, [code])
  const remove = async (id) => { if (!confirmDestructive('Händelsen tas bort från tränarflödet.')) return; try { await apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-coach-feed-event', id }) }); setEvents((current) => current.filter((item) => item.id !== id)) } catch (error) { setStatus(error.message) } }
  const clear = async () => { if (!events.length || !confirmDestructive('Alla händelser tas bort från tränarflödet. Poäng, resultat och annan grunddata påverkas inte.')) return; try { await apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear-coach-feed' }) }); setEvents([]) } catch (error) { setStatus(error.message) } }
  return <section className="coach-activity-feed"><div className="period-heading"><div><p className="eyebrow">Intern uppföljning</p><h1>Tränarflöde</h1><small>Automatiska viktiga händelser samlade på ett ställe.</small></div><div className="coach-feed-heading-actions"><div className="big-count"><strong>{events.length}</strong><span>händelser</span></div><button type="button" className="text-button danger-text" onClick={clear} disabled={!events.length}>Rensa flödet</button></div></div>{status && <p className="form-error">{status}</p>}<p className="coach-feed-auto-note">Här visas systemets viktiga signaler – till exempel personbästa, uppnådda mål, styrkeutveckling och poäng. Pepmeddelanden och vanliga klubbflödesinlägg hör hemma i klubbflödet.</p><div className="coach-feed-list">{events.length ? events.map((item) => <article key={item.id}><div className="coach-feed-icon">{item.eventType === 'personal_best' ? '🏆' : item.eventType === 'strength' ? '🏋️' : item.eventType === 'star' ? '⭐' : item.eventType === 'attendance' ? '📅' : item.eventType === 'note' ? '📝' : '✨'}</div><div><div className="coach-feed-meta"><strong>{item.profile?.emoji || '👥'} {item.profile?.displayName || 'Gruppen'}</strong><small>{new Date(item.createdAt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}</small></div><h3>{item.title}</h3>{item.detail && <p>{item.detail}</p>}<div className="coach-feed-badges">{item.points > 0 && <span>+{item.points} poäng</span>}{item.stars > 0 && <span>{'★'.repeat(item.stars)} stjärna{item.stars === 1 ? '' : 'r'}</span>}{item.sender === 'Simkoll' && <span>Automatisk händelse</span>}</div></div><button type="button" className="text-button danger-text coach-feed-delete" onClick={() => remove(item.id)}>Ta bort</button></article>) : <p className="empty">Inga automatiska händelser ännu.</p>}</div></section>
}

function CoachProfileSettings({ code, groups, globalSettings = {}, onSaved, accountRole = 'coach' }) {
  const [account, setAccount] = useState(null)
  const [managedGroups, setManagedGroups] = useState([])
  const [personalEnabled, setPersonalEnabled] = useState(false)
  const [personalSettings, setPersonalSettings] = useState({ overview: {}, coach: {} })
  const [linkedProfile, setLinkedProfile] = useState(null)
  const [profileUsername, setProfileUsername] = useState('')
  const [profilePin, setProfilePin] = useState('')
  const [linking, setLinking] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const menuFeatures = COACH_MENU_FEATURES
  const overviewFeatures = COACH_OVERVIEW_FEATURES
  useEffect(() => { apiRequest('/api/auth', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'coach-profile' }) }).then((data) => { const next = data.account || {}; const fallback = { overview: globalSettings.overview || {}, coach: globalSettings.coach || {} }; setAccount(next); setLinkedProfile(data.linkedProfile || null); setManagedGroups(Array.isArray(next.managed_groups) ? next.managed_groups : []); setPersonalEnabled(next.personal_settings_enabled === true); setPersonalSettings(next.personal_settings_enabled ? (next.personal_settings || fallback) : fallback) }).catch((error) => setMessage(error.message)).finally(() => setLoading(false)) }, [code])
  useEffect(() => { if (!personalEnabled) setPersonalSettings({ overview: globalSettings.overview || {}, coach: globalSettings.coach || {} }) }, [globalSettings, personalEnabled])
  const toggle = (role, key) => setPersonalSettings((current) => ({ ...current, [role]: { ...(current[role] || {}), [key]: current[role]?.[key] === false } }))
  const save = async () => { setSaving(true); setMessage(''); try { const data = await apiRequest('/api/auth', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'coach-profile', update: true, managedGroups, personalSettingsEnabled: personalEnabled, personalSettings }) }); const saved = data.account || {}; setAccount(saved); onSaved?.(saved, managedGroups); setMessage('Tränarkontot är sparat.') } catch (error) { setMessage(error.message) } finally { setSaving(false) } }
  const linkSwimmerProfile = async (unlink = false) => { setLinking(true); setMessage(''); try { const action = unlink ? 'coach-unlink-swimmer-profile' : 'coach-link-swimmer-profile'; const data = await apiRequest('/api/auth', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, username: profileUsername, pin: profilePin }) }); setLinkedProfile(data.linkedProfile || null); setProfileUsername(''); setProfilePin(''); setMessage(unlink ? 'Simmarprofilen är frånkopplad.' : 'Din simmarprofil är kopplad. PIN-koden sparas inte.') } catch (error) { setMessage(error.message) } finally { setLinking(false) } }
  const list = (role, items) => <div className="settings-list">{items.map(([key, label]) => <label key={key}><span><strong>{label}</strong><small>{personalSettings[role]?.[key] === false ? 'Dold' : 'Synlig'}</small></span><input type="checkbox" checked={personalSettings[role]?.[key] !== false} onChange={() => toggle(role, key)} /></label>)}</div>
  return <section className="coach-profile-settings"><div className="period-heading"><div><p className="eyebrow">Tränarkonto</p><h1>{account?.display_name || 'Mitt tränarkonto'}</h1><small>{account?.email || 'Personliga grupper och vyinställningar'} · {coachRoleLabel(account?.role || accountRole)}</small></div></div>{loading ? <p className="empty">Hämtar kontoinställningar…</p> : <><section className="settings-card"><h2>Grupper jag hanterar</h2><p className="settings-help">Välj vilka grupper som ska vara förvalda när du öppnar tränarvyn. Du kan fortfarande ändra gruppfiltret tillfälligt högst upp.</p><div className="competition-group-checkboxes coach-managed-groups">{groups.map(([value, label]) => <label key={value}><input type="checkbox" checked={managedGroups.length === 0 || managedGroups.includes(value)} onChange={(event) => setManagedGroups((current) => { const base = current.length ? current : groups.map(([id]) => id); return event.target.checked ? [...new Set([...base, value])] : base.filter((item) => item !== value) })} />{label}</label>)}</div><small className="settings-note">Om alla grupper är valda visas alla som standard.</small></section>{accountRole !== 'coach' && <section className="settings-card coach-own-swimmer-link"><h2>Min simmarprofil</h2><p className="settings-help">Koppla ditt eget simmarkonto en gång med användarnamn och PIN. Uppgifterna verifieras och sparas inte. Därefter kan du öppna din egen simmarvy utan att logga in igen. Andra simmares profiler går inte att välja.</p>{linkedProfile ? <div className="coach-linked-profile"><span>{linkedProfile.emoji || '🏊'}</span><div><strong>{linkedProfile.displayName}</strong><small>{linkedProfile.trainingGroup || 'Ingen grupp angiven'} · endast din egen profil</small></div><button type="button" className="text-button danger-text" onClick={() => linkSwimmerProfile(true)} disabled={linking}>{linking ? 'Sparar…' : 'Koppla från'}</button></div> : <form className="coach-link-profile-form" onSubmit={(event) => { event.preventDefault(); linkSwimmerProfile() }}><label>Användarnamn<input autoComplete="username" value={profileUsername} onChange={(event) => setProfileUsername(event.target.value)} required minLength={3} maxLength={24} /></label><label>PIN-kod<input type="password" inputMode="numeric" autoComplete="current-password" value={profilePin} onChange={(event) => setProfilePin(event.target.value.replace(/\D/g, '').slice(0, 4))} required pattern="[0-9]{4}" maxLength={4} /></label><button className="primary-button" type="submit" disabled={linking || !profileUsername || profilePin.length !== 4}>{linking ? 'Verifierar…' : 'Verifiera och koppla'}</button></form>}</section>} {accountRole !== 'coach' && <section className="settings-card"><h2>Egna inställningar</h2><p className="settings-help">När detta är på används dina personliga meny- och översiktsval på ditt konto. De kan avvika från klubbens standard men påverkar inte tränarnas inställningar.</p><label className="settings-toggle-row"><span><strong>Använd egna inställningar</strong><small>{personalEnabled ? 'På – dina personliga val används' : 'Av – klubbens standard används'}</small></span><input type="checkbox" checked={personalEnabled} onChange={(event) => setPersonalEnabled(event.target.checked)} /></label>{personalEnabled && <><h3 className="personal-settings-subtitle">Tränarvyns meny</h3>{list('coach', menuFeatures)}<h3 className="personal-settings-subtitle">Översiktens genvägar</h3>{list('overview', overviewFeatures)}</>}</section>}<div className="settings-actions">{accountRole !== 'coach' && <button className="primary-button" onClick={save} disabled={saving}>{saving ? 'Sparar…' : 'Spara tränarkonto'}</button>}{message && <span className="settings-saved">{message}</span>}</div></>}</section>
}

function HeadCoachSettings({ code }) {
  const [settings, setSettings] = useState({ overview: {}, coach: {} })
  const [saved, setSaved] = useState(false)
  const coachFeatures = COACH_MENU_FEATURES
  const overviewFeatures = COACH_OVERVIEW_FEATURES
  useEffect(() => { apiRequest('/api/goals?settings=true', code).then((data) => setSettings({ overview: data.settings?.overview || {}, coach: data.settings?.coach || {} })).catch(() => {}) }, [code])
  const toggle = (role, key) => setSettings((current) => ({ ...current, [role]: { ...current[role], [key]: current[role]?.[key] === false } }))
  const list = (role, items) => <div className="settings-list">{items.map(([key, label]) => <label key={key}><span><strong>{label}</strong><small>{settings[role]?.[key] === false ? 'Dold' : 'Synlig'}</small></span><input type="checkbox" checked={settings[role]?.[key] !== false} onChange={() => toggle(role, key)} /></label>)}</div>
  const save = async () => { await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-settings', settings }) }); window.dispatchEvent(new CustomEvent('simkoll-settings-updated', { detail: settings })); setSaved(true); setTimeout(() => setSaved(false), 1800) }
  return <section className="webapp-settings"><div className="period-heading"><div><p className="eyebrow">Huvudtränare</p><h1>Tränarvyns innehåll</h1><small>Styr globalt vilka delar alla vanliga tränare ser. Huvudtränare och superadmin kan välja egna avvikelser i Mitt tränarkonto.</small></div></div><PushReminderSettings code={code} /><section className="settings-card"><h2>Tränarvyns meny</h2><p className="settings-help">Påverkar flikar, huvudmenyn och Verktyg. Avstängda delar tas bort från alla dessa menyvägar för tränare.</p>{list('coach', coachFeatures)}</section><section className="settings-card"><h2>Översiktens genvägar</h2><p className="settings-help">Välj vilka direktflikar som ska visas på översiktssidan. Funktionen kan fortfarande nås via menyn eller Verktyg om den är på i tränarvyns meny.</p>{list('overview', overviewFeatures)}</section><div className="settings-actions"><button className="primary-button" onClick={save}>Spara menyinställningar</button>{saved && <span className="settings-saved">Sparat ✓</span>}</div></section>
}

function Coach({ accountRole = 'coach', responses, profiles, pendingProfiles, onProfilesChange, activeProfilesToday, code, loading, onLogout, onSwitchToSwimmer, onClear }) {
  const [view, setView] = useState('today')
  const [focusedSwimmerId, setFocusedSwimmerId] = useState('')
  const [goalNavigation, setGoalNavigation] = useState(null)
  const [goalReplyCount, setGoalReplyCount] = useState(0)
  useEffect(() => { const open = () => setView('community'); window.addEventListener('simkoll-coach-open-messages', open); return () => window.removeEventListener('simkoll-coach-open-messages', open) }, [])
  useEffect(() => { const open = () => setView('goals'); window.addEventListener('simkoll-coach-open-goals', open); return () => window.removeEventListener('simkoll-coach-open-goals', open) }, [])
  useEffect(() => {
    const refresh = () => apiRequest('/api/goals?coachAlerts=true', code).then((data) => setGoalReplyCount(data.count || 0)).catch(() => {})
    refresh()
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('simkoll-goal-replies-read', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('simkoll-goal-replies-read', refresh) }
  }, [code])
  const [coachMessageCount, setCoachMessageCount] = useState(0)
  const [assistantOpen, setAssistantOpen] = useState(false)
  useEffect(() => { const open = () => setAssistantOpen(true); window.addEventListener('simkoll-assistant-open', open); return () => window.removeEventListener('simkoll-assistant-open', open) }, [])
  const [summaryDate, setSummaryDate] = useState(todayKey())
  const [summaryWorkouts, setSummaryWorkouts] = useState([])
  const [summaryPlanning, setSummaryPlanning] = useState({ plans: [], competitions: [] })
  const [selectedGroups, setSelectedGroups] = useState(['ungdom_orange', 'ungdom_svart', 'junior'])
  const [availableGroups, setAvailableGroups] = useState([['ungdom_orange', 'Ungdom Orange'], ['ungdom_svart', 'Ungdom Svart'], ['junior', 'Junior']])
  const [competitionResults, setCompetitionResults] = useState([])
  const [tempusSyncedAt, setTempusSyncedAt] = useState(null)
  const [competitionLoading, setCompetitionLoading] = useState(false)
  const [competitionSyncProfile, setCompetitionSyncProfile] = useState(null)
  const [submissionCompetitionId, setSubmissionCompetitionId] = useState('')
  const [talksGlobalEnabled, setTalksGlobalEnabled] = useState(true)
  const [globalNavigationSettings, setGlobalNavigationSettings] = useState({ overview: {}, coach: {} })
  const [coachProfile, setCoachProfile] = useState(null)
  const coachMessageSeenKey = `simkoll-coach-messages-seen-${coachProfile?.id || String(code || '').slice(-12)}`
  useEffect(() => { if (view !== 'community') return; try { localStorage.setItem(coachMessageSeenKey, String(Date.now())) } catch {} setCoachMessageCount(0) }, [view, coachMessageSeenKey])
  useEffect(() => {
    if (view === 'community') return
    let active = true
    const stop = startVisiblePolling(() => {
      let seenAt = 0
      try { seenAt = Number(localStorage.getItem(coachMessageSeenKey) || 0) || 0 } catch {}
      return apiRequest(`/api/community?messageCount=true&since=${seenAt}`, code).then((data) => { if (active) setCoachMessageCount(data.count || 0) })
    }, 15000)
    return () => { active = false; stop() }
  }, [code, coachMessageSeenKey, view === 'community'])
  useEffect(() => { apiRequest('/api/goals?talks=true', code).then((data) => setTalksGlobalEnabled(data.globalEnabled !== false)).catch(() => {}) }, [code])
  useEffect(() => { apiRequest('/api/goals?settings=true', code).then((data) => setGlobalNavigationSettings(data.settings || { overview: {}, coach: {} })).catch(() => {}) }, [code])
  useEffect(() => { apiRequest('/api/auth', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'coach-profile' }) }).then((data) => { const account = data.account || {}; setCoachProfile(account); if (Array.isArray(account.managed_groups) && account.managed_groups.length) setSelectedGroups(account.managed_groups) }).catch(() => {}) }, [code])
  useEffect(() => { const onSettings = (event) => setGlobalNavigationSettings(event.detail || { overview: {}, coach: {} }); window.addEventListener('simkoll-settings-updated', onSettings); return () => window.removeEventListener('simkoll-settings-updated', onSettings) }, [])
  useEffect(() => {
    const closeMenus = (event) => {
      if (event.target.closest('.coach-header-menu, .coach-group-filter')) return
      document.querySelectorAll('.coach-header-menu[open], .coach-group-filter[open]').forEach((menu) => { menu.open = false })
    }
    document.addEventListener('click', closeMenus)
    return () => document.removeEventListener('click', closeMenus)
  }, [])
  const personalSettingsEnabled = accountRole !== 'coach' && coachProfile?.personal_settings_enabled === true
  const navigationSettings = useMemo(() => {
    if (!personalSettingsEnabled || !coachProfile?.personal_settings) return globalNavigationSettings
    const personal = coachProfile.personal_settings
    return { ...globalNavigationSettings, ...personal, coach: { ...(globalNavigationSettings.coach || {}), ...(personal.coach || {}) }, overview: { ...(globalNavigationSettings.overview || {}), ...(personal.overview || {}) } }
  }, [globalNavigationSettings, coachProfile, personalSettingsEnabled])
  const aiEnabled = navigationSettings.aiEnabled !== false
  const overviewVisible = (key) => key === 'today' || key === 'settings' || navigationSettings.overview?.[key] !== false
  const coachVisible = (key) => key === 'today' || key === 'settings' || navigationSettings.coach?.[key] !== false
  const overviewItems = COACH_NAV_ITEMS
  const orderedOverviewKeys = [...(navigationSettings.overviewOrder || []), ...overviewItems.map((item) => item.key)].filter((key, index, keys) => keys.indexOf(key) === index)
  const orderedOverviewItems = orderedOverviewKeys.map((key) => overviewItems.find((item) => item.key === key)).filter((item) => item && item.key !== 'community')
  const legacyToolKeys = ['trends', 'history', 'week', 'talks', 'competition', 'workout-library', 'community', 'goals', 'programs', 'strength-programs', 'dryland-programs', 'rewards', 'faq', 'legal']
  const navItem = (key) => COACH_NAV_ITEMS.find((item) => item.key === key)
  useEffect(() => {
    if (COACH_NAV_ITEMS.some((item) => item.key === view) && !coachVisible(view)) setView('today')
  }, [view, navigationSettings])
  const toggleAllTalks = async () => { try { const next = !talksGlobalEnabled; await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle-talk-global', enabled: next }) }); setTalksGlobalEnabled(next) } catch (error) { window.alert(error.message) } }
  const loadCompetitionResults = () => { setCompetitionLoading(true); apiRequest('/api/profiles?tempusResults=true', code).then((data) => { setCompetitionResults(data.results || []); setTempusSyncedAt(data.tempusSync?.syncedAt || null) }).catch(() => {}).finally(() => setCompetitionLoading(false)) }
  useEffect(() => { apiRequest('/api/profiles?groups=true', code).then((data) => { const groups = (data.groups || []).filter((item) => item.active !== false).map((item) => [item.id, item.name]).filter(([id, name]) => id && name); if (groups.length) { setAvailableGroups(groups); setSelectedGroups((current) => current.length === 3 && current.every((value) => ['ungdom_orange', 'ungdom_svart', 'junior'].includes(value)) ? groups.map(([id]) => id) : current) } }).catch(() => {}) }, [code])
  const groupOptions = availableGroups
  const allGroupsSelected = selectedGroups.length === groupOptions.length
  const profileGroupKey = (profile) => { const value = String(profile.trainingGroup || '').trim().toLowerCase(); return ({ 'ungdom orange': 'ungdom_orange', 'ungdom svart': 'ungdom_svart', 'ungdoms orange': 'ungdom_orange', 'ungdoms svart': 'ungdom_svart', junior: 'junior' }[value] || value) }
  const groupFilteredProfiles = allGroupsSelected ? profiles : profiles.filter((profile) => selectedGroups.includes(profileGroupKey(profile)))
  const groupFilteredIds = new Set(groupFilteredProfiles.map((profile) => profile.id))
  const groupFilteredResponses = responses.filter((response) => !response.profileId ? allGroupsSelected : groupFilteredIds.has(response.profileId))
  const summaryCompetitionPlans = [
    ...summaryPlanning.plans.filter((item) => item.activityType === 'competition' && item.date === summaryDate && (!item.targetGroups?.length || item.targetGroups.some((group) => selectedGroups.includes(group)))),
    ...summaryPlanning.competitions.filter((item) => item.startDate <= summaryDate && (item.endDate || item.startDate) >= summaryDate && (!item.targetGroups?.length || item.targetGroups.some((group) => selectedGroups.includes(group)))),
  ].filter((item, index, items) => items.findIndex((candidate) => String(candidate.title || candidate.name || '').toLocaleLowerCase('sv-SE') === String(item.title || item.name || '').toLocaleLowerCase('sv-SE')) === index)
  const previousWeek = previousWeekRange()
  const todayResponses = groupFilteredResponses.filter((response) => dateKey(responseDate(response)) === todayKey())
  const selectedDateResponses = groupFilteredResponses.filter((response) => dateKey(responseDate(response)) === summaryDate)
  const hasCompetitionOnSummaryDate = summaryCompetitionPlans.length > 0 || selectedDateResponses.some((item) => item.competition === true)
  const selectedActiveProfiles = new Set(selectedDateResponses.map((item) => item.profileId).filter(Boolean)).size
  const previousWeekResponses = groupFilteredResponses.filter((response) => {
    const date = responseDate(response)
    return date >= previousWeek.start && date <= previousWeek.end
  })
  const scopedResponses = view === 'today' ? todayResponses : previousWeekResponses

  const previousWeekLabel = `${previousWeek.start.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}–${previousWeek.end.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}`
  const selectCoachView = (nextView) => { if (nextView === 'goals') setGoalNavigation(null); setView(nextView); if (nextView === 'competition') loadCompetitionResults() }
  const openViewFromMenu = (nextView) => { selectCoachView(nextView); document.querySelectorAll('.coach-header-menu, .legacy-tools').forEach((menu) => { menu.open = false }) }
  const openGoalsForProfile = (profileId, goalId = '', create = false) => {
    setGoalNavigation({ profileId, goalId, create, key: Date.now() })
    setView('goals')
  }
  const shiftSummaryDate = (days) => { const next = new Date(`${summaryDate}T12:00:00`); next.setDate(next.getDate() + days); setSummaryDate(dateKey(next)) }
  const summaryDateLabel = new Date(`${summaryDate}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  useEffect(() => {
    if (!code || view !== 'today') return
    apiRequest(`/api/workouts?date=${summaryDate}`, code).then((data) => setSummaryWorkouts(data.workouts || (data.workout ? [data.workout] : []))).catch(() => setSummaryWorkouts([]))
  }, [code, summaryDate, view])
  useEffect(() => {
    if (!code || view !== 'today') return
    Promise.allSettled([apiRequest('/api/workouts?planning=true', code), apiRequest('/api/workouts?calendar=true', code)]).then(([planning, calendar]) => setSummaryPlanning({
      plans: planning.status === 'fulfilled' ? planning.value.plans || [] : [],
      competitions: calendar.status === 'fulfilled' ? calendar.value.competitions || [] : [],
    }))
  }, [code, view])

  const applyCoachProfile = (savedAccount, groups) => { if (savedAccount) setCoachProfile(savedAccount); if (Array.isArray(groups) && groups.length) setSelectedGroups(groups); else if (groups && !groups.length) setSelectedGroups(groupOptions.map(([value]) => value)) }
  const renderCoachMenuLink = (key) => {
    if (key === 'storage') return accountRole === 'superadmin' ? <button type="button" key={key} onClick={() => openViewFromMenu(key)}>Lagring och historik</button> : null
    if (key === 'push-settings') return <button type="button" key={key} onClick={() => openViewFromMenu(key)}>🔔 Notiser på min enhet</button>
    const item = navItem(key)
    if (!item || !coachVisible(key)) return null
    return <button type="button" key={key} onClick={() => openViewFromMenu(key)}>{item.label}{key === 'goals' && goalReplyCount > 0 && <b className="tab-count">{goalReplyCount}</b>}</button>
  }
  return (
    <main className="coach-shell">
      {assistantOpen && <Assistant code={code} role="coach" onClose={() => setAssistantOpen(false)} />}
      <CoachHeader brand={<ClubBrand assistantEnabled={aiEnabled} onAssistant={aiEnabled ? () => setAssistantOpen(true) : undefined} />} groups={groupOptions} selectedGroups={selectedGroups} onGroupsChange={setSelectedGroups} messagesVisible={coachVisible('community')} messageCount={coachMessageCount} messagesActive={view === 'community'} onMessages={() => openViewFromMenu('community')}>
        <details className="coach-header-menu"><summary aria-label="Öppna tränarmenyn"><span className="coach-menu-compact">Meny <span aria-hidden="true">☰</span></span><span className="coach-badge">{coachRoleLabel(accountRole)}⌄</span></summary><div>{canSwitchToOwnSwimmerView(accountRole) && <button type="button" className="coach-preview-menu-item" onClick={onSwitchToSwimmer}>🏊 Byt till min simmarvy</button>}{COACH_MENU_SECTIONS.map(([section, keys]) => { const links = keys.map(renderCoachMenuLink).filter(Boolean); return links.length ? <React.Fragment key={section}><strong>{section}</strong>{links}</React.Fragment> : null })}{accountRole === 'superadmin' && <button type="button" onClick={() => openViewFromMenu('logs')}>Loggar</button>}{accountRole !== 'coach' && <><button type="button" onClick={() => openViewFromMenu('settings')}>Inställningar</button><button type="button" onClick={() => openViewFromMenu('coach-profile')}>Mitt tränarkonto</button></>}{accountRole === 'superadmin' && <button type="button" onClick={() => openViewFromMenu('coach-accounts')}>Tränarkonton</button>}<button type="button" onClick={onLogout}>Logga ut</button></div></details>
      </CoachHeader>
      <div className="coach-content">
        <nav className="coach-tabs" aria-label="Tränarens meny">
          <div className="coach-tab-group"><span className="coach-tab-label">Översikt</span><div className="coach-tab-buttons">
            {orderedOverviewItems.filter((item) => overviewVisible(item.key) && coachVisible(item.key)).map((item) => <button key={item.key} className={view === item.key ? 'active' : ''} onClick={() => selectCoachView(item.key)}><span className="desktop-tab-label">{item.label}</span><span className="mobile-tab-label">{item.mobile}</span>{item.key === 'swimmers' && pendingProfiles.length > 0 && <b className="tab-count">{pendingProfiles.length}</b>}{item.key === 'goals' && goalReplyCount > 0 && <b className="tab-count">{goalReplyCount}</b>}</button>)}
          </div></div>
          <details className="coach-tools-menu legacy-tools"><summary>Verktyg <span>⌄</span></summary><div className="coach-tab-buttons">
            {legacyToolKeys.filter(coachVisible).map((key) => { const item = navItem(key); return item ? <button key={key} className={view === key ? 'active' : ''} onClick={() => openViewFromMenu(key)}><span className="desktop-tab-label">{item.label}</span><span className="mobile-tab-label">{item.mobile}</span>{key === 'goals' && goalReplyCount > 0 && <b className="tab-count">{goalReplyCount}</b>}</button> : null })}
          </div></details>
        </nav>
        {view === 'today' && <section className="coach-heading coach-overview-card"><div><p className="eyebrow">Gruppens läge</p><h1>{summaryDate === todayKey() ? 'Idag' : 'Överblick'}</h1><div className="coach-top-date-controls"><button type="button" className="secondary-button" onClick={() => shiftSummaryDate(-1)} aria-label="Föregående dag">←</button><span>{summaryDateLabel}</span><input type="date" value={summaryDate} onChange={(event) => event.target.value && setSummaryDate(event.target.value)} aria-label="Välj datum" /><button type="button" className="secondary-button" onClick={() => shiftSummaryDate(1)} aria-label="Nästa dag">→</button><button type="button" className="secondary-button" onClick={() => setSummaryDate(todayKey())}>Idag</button></div></div><div className="usage-summary"><div className="usage-stat"><strong>{summaryDate === todayKey() ? activeProfilesToday : selectedActiveProfiles}</strong><span>{summaryDate === todayKey() ? 'aktiva profiler idag' : 'profiler med svar'}</span></div><b className="usage-divider">·</b><div className="usage-stat"><strong>{selectedDateResponses.length}</strong><span>svar</span></div>{selectedDateResponses.some((item) => item.type === 'sick') && <><b className="usage-divider">·</b><div className="usage-stat"><strong className="sick-count">{selectedDateResponses.filter((item) => item.type === 'sick').length}</strong><span>sjuka</span></div></>}</div></section>}
        {view === 'today' && <CompetitionDaySummary date={summaryDate} plans={summaryCompetitionPlans} responses={selectedDateResponses} profiles={groupFilteredProfiles} />}
        {view === 'today' && <TodayWorkoutSummary workouts={summaryWorkouts} selectedGroups={selectedGroups} hasCompetition={hasCompetitionOnSummaryDate} date={summaryDate} responses={selectedDateResponses} profiles={groupFilteredProfiles} />}
        {view === 'talks' && <section className="global-talk-setting"><span><strong>Utvecklingssamtal för gruppen</strong><small>{talksGlobalEnabled ? 'Simmarna kan förbereda och redigera sina samtal.' : 'Samtalen är skrivskyddade och dolda som genväg.'}</small></span><button className={`talk-switch ${talksGlobalEnabled ? 'on' : ''}`} onClick={toggleAllTalks}>{talksGlobalEnabled ? 'På' : 'Av'}</button></section>}

        {loading ? <section className="empty-period"><span>≈</span><h2>Hämtar svar…</h2></section> : view === 'coach-profile' ? (
          <CoachProfileSettings code={code} groups={groupOptions} globalSettings={globalNavigationSettings} onSaved={applyCoachProfile} accountRole={accountRole} />
        ) : view === 'coach-accounts' ? (
          <CoachAccountManagement code={code} currentAccountId={coachProfile?.id} />
        ) : view === 'logs' ? (
          <AuditLogs code={code} />
        ) : view === 'storage' ? (
          accountRole === 'superadmin' ? <StorageAdmin code={code} /> : <p>Endast superadmin kan se lagringsöversikten.</p>
        ) : view === 'faq' ? (
          <Faq role="coach" />
        ) : view === 'legal' ? (
          <><LegalPurpose /><LegalPage /><CoachTermsSection /><SwimmerTermsSection /></>
        ) : view === 'coach-feed' ? (
          <CoachActivityFeed code={code} />
        ) : view === 'control-panel' ? (
          <CoachControlPanel profiles={groupFilteredProfiles} responses={groupFilteredResponses} asOf={todayKey()} code={code} request={apiRequest} onOpenSwimmer={(profileId) => { setFocusedSwimmerId(profileId); setView('swimmers') }} onMessage={(profileId) => { setFocusedSwimmerId(profileId); setView('community') }} />
        ) : view === 'trends' ? (
          <AnalysisDashboard code={code} aiEnabled={aiEnabled} groupProfiles={groupFilteredProfiles} includeAnonymous={allGroupsSelected} />
        ) : view === 'rewards' ? (
          <CoachRewards code={code} />
        ) : view === 'meeting' ? (
          <WeeklyMeeting code={code} profiles={groupFilteredProfiles} />
        ) : view === 'programs' ? (
          <CoachPrograms code={code} onOpenDryland={() => setView('dryland-programs')} profiles={groupFilteredProfiles} />
        ) : view === 'strength-programs' ? (
          <CoachStrengthPrograms code={code} profiles={groupFilteredProfiles} accountRole={accountRole} aiEnabled={aiEnabled} />
        ) : view === 'dryland-programs' ? (
          <CoachStrengthPrograms key="dryland" programType="dryland" code={code} profiles={groupFilteredProfiles} accountRole={accountRole} aiEnabled={aiEnabled} />
        ) : view === 'games' ? (
          <CoachGameLibrary code={code} />
        ) : view === 'goals' ? (
          <CoachGoals code={code} profiles={groupFilteredProfiles} aiEnabled={aiEnabled} initialProfileId={goalNavigation?.profileId || ''} initialGoalId={goalNavigation?.goalId || ''} initialCreate={goalNavigation?.create === true} navigationKey={goalNavigation?.key || 0} />
        ) : view === 'talks' ? (
          <DevelopmentTalkCoach code={code} profiles={groupFilteredProfiles} />
        ) : view === 'community' ? (
          <><OpenChatPanel code={code} coach /><CoachCommunity code={code} profiles={groupFilteredProfiles} initialRecipientId={focusedSwimmerId} /></>
        ) : view === 'workout' ? (
          <WorkoutEditor code={code} responses={groupFilteredResponses} aiEnabled={aiEnabled} selectedGroups={selectedGroups} availableGroups={availableGroups} />
        ) : view === 'planning' ? (
          <CoachPlanning code={code} selectedGroups={selectedGroups} availableGroups={availableGroups} />
        ) : view === 'competition-calendar' ? (
          <CompetitionSubmissionBoundary><CompetitionCalendar code={code} canManageCompetitionPrograms={accountRole === 'head_coach' || accountRole === 'superadmin'} onOpenSubmissions={(competitionId) => { setSubmissionCompetitionId(competitionId); setView('competition-entries') }} /></CompetitionSubmissionBoundary>
        ) : view === 'competition-entries' ? (
          <CompetitionSubmissionBoundary><CompetitionSubmissionManager code={code} initialCompetitionId={submissionCompetitionId} /></CompetitionSubmissionBoundary>
        ) : view === 'push-settings' ? (
          <PushNotificationControl code={code} audience="coach" />
        ) : view === 'settings' ? (
          <div className="coach-settings-stack">{accountRole === 'superadmin' ? <><WebappSettings code={code} /><OpenChatSettings code={code} /><PushAdminSettings code={code} /><SportAdminCalendarSettings code={code} /><SessionSettings code={code} /></> : accountRole === 'head_coach' ? <HeadCoachSettings code={code} /> : <section className="empty"><h2>Inställningar är låsta</h2><p>Be en huvudtränare eller superadmin om hjälp.</p></section>}</div>
        ) : view === 'groups' ? (
          <CoachGroups code={code} profiles={groupFilteredProfiles} onProfilesChange={onProfilesChange} />
        ) : view === 'app-feedback' ? (
          <CoachAppFeedback code={code} accountRole={accountRole} />
        ) : view === 'workout-library' ? (
          <WorkoutLibrary code={code} responses={responses} />
        ) : view === 'swimmers' ? (
          <Swimmers profiles={groupFilteredProfiles} pendingProfiles={pendingProfiles} onProfilesChange={onProfilesChange} responses={groupFilteredResponses} code={code} aiEnabled={aiEnabled} goalsEnabled={coachVisible('goals')} initialProfileId={focusedSwimmerId} onOpenGoal={(profileId, goalId) => openGoalsForProfile(profileId, goalId)} onCreateGoal={(profileId) => openGoalsForProfile(profileId, '', true)} />
        ) : view === 'competition' ? (
          <CompetitionResults profiles={profiles} results={competitionResults} loading={competitionLoading} syncingProfileId={competitionSyncProfile} lastSyncedAt={tempusSyncedAt} accountRole={accountRole} code={code} onResultsChanged={loadCompetitionResults} onSync={() => { setCompetitionLoading(true); apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync-tempus-results' }) }).then((data) => { if (data.syncedAt) setTempusSyncedAt(data.syncedAt); if (data.failures?.length) window.alert(`Tempus synk: ${data.synced} sparade, ${data.failures.length} misslyckades.`); return loadCompetitionResults() }).finally(() => setCompetitionLoading(false)) }} onSyncProfile={(profileId) => { setCompetitionSyncProfile(profileId); apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync-tempus-results', profileId }) }).then((data) => { if (data.syncedAt) setTempusSyncedAt(data.syncedAt); if (data.failures?.length) window.alert(`Tempus synk misslyckades: ${data.failures[0]}`); return loadCompetitionResults() }).finally(() => setCompetitionSyncProfile(null)) }} />
        ) : view === 'history' ? (
          <History responses={groupFilteredResponses} />
        ) : (
          <>{view === 'today' && <AttendancePanel code={code} profiles={groupFilteredProfiles} responses={selectedDateResponses} date={summaryDate} />}<PeriodOverview
            responses={view === 'today' ? selectedDateResponses : scopedResponses}
            title={view === 'today' ? (summaryDate === todayKey() ? 'Idag' : 'Vald dag') : 'Förra veckan'}
            profiles={groupFilteredProfiles}
            hasPlannedCompetition={view === 'today' && summaryCompetitionPlans.length > 0}
            periodLabel={view === 'today'
              ? summaryDateLabel
              : previousWeekLabel}
            showDays={view === 'week'}
          />{view === 'today' && <CoachActivitySummary code={code} selectedDate={summaryDate} onDateChange={setSummaryDate} aiEnabled={aiEnabled} />}</>
        )}
        {view === 'today' && <button className="clear-button" onClick={async () => {
          if (!confirmDestructive('Alla incheckningar och all historik kommer att raderas permanent.')) return
          try { await onClear() } catch (error) { window.alert(error.message) }
        }}>Radera alla svar</button>}
        <footer className="app-meta"><span>Simkoll v{APP_VERSION}</span><span>Uppdaterad {new Date(BUILD_TIME).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' })}</span><span>Build {COMMIT_SHA}</span></footer>
      </div>
    </main>
  )
}

function AttendancePanel({ code, profiles, responses, date: selectedDate }) {
  const [open, setOpen] = useState(false)
  const [attendance, setAttendance] = useState({})
  const [checkinResponses, setCheckinResponses] = useState([])
  const [attendanceLoading, setAttendanceLoading] = useState(true)
  const [savingProfiles, setSavingProfiles] = useState(() => new Set())
  const savingProfilesRef = useRef(new Set())
  const [sortPresent, setSortPresent] = useState(false)
  const [group, setGroup] = useState('all')
  const [lanePlannerOpen, setLanePlannerOpen] = useState(false)
  const date = selectedDate || todayKey()
  const [slot, setSlot] = useState(new Date().getHours() < 13 ? 'morning_swim' : 'afternoon_swim')
  const responseSignature = responses.map((item) => `${item.profileId || ''}:${item.type || ''}:${item.createdAt || ''}`).join('|')
  useEffect(() => {
    let active = true
    setAttendanceLoading(true)
    setCheckinResponses([])
    Promise.all([
      apiRequest(`/api/profiles?attendance=true&date=${date}&slot=${slot}`, code),
      apiRequest(`/api/responses?date=${date}`, code).then((data) => data.responses || []),
    ]).then(([data, currentResponses]) => {
      if (!active) return
      const dayResponses = currentResponses.filter((item) => dateKey(responseDate(item)) === date)
      setCheckinResponses(dayResponses.slice().sort(compareCheckinsNewest))
      const nextAttendance = attendanceFromCheckins(data.attendance || [], dayResponses, slot)
      setAttendance((current) => {
        savingProfilesRef.current.forEach((profileId) => { nextAttendance[profileId] = current[profileId] })
        return nextAttendance
      })
    }).catch((error) => { if (active && open) window.alert(error.message || 'Kunde inte hämta närvaron.') })
      .finally(() => { if (active) setAttendanceLoading(false) })
    return () => { active = false }
  }, [code, date, slot, responseSignature, open])
  const groupOrder = { ungdom_orange: 1, ungdom_svart: 2, junior: 3 }
  const visible = profiles.filter((profile) => group === 'all' || profile.trainingGroup === group).slice().sort((a, b) => {
    if (sortPresent && Boolean(attendance[b.id]) !== Boolean(attendance[a.id])) return Number(Boolean(attendance[b.id])) - Number(Boolean(attendance[a.id]))
    return (group === 'all' ? (groupOrder[a.trainingGroup] || 9) - (groupOrder[b.trainingGroup] || 9) : 0) || a.displayName.localeCompare(b.displayName, 'sv')
  })
  const presentCount = visible.filter((profile) => attendance[profile.id]).length
  const toggle = async (profile) => {
    const profileId = profile.id
    if (attendanceLoading || savingProfilesRef.current.has(profileId)) return
    const previous = Boolean(attendance[profileId])
    const next = !previous
    savingProfilesRef.current.add(profileId)
    setSavingProfiles((current) => new Set(current).add(profileId))
    setAttendance((current) => ({ ...current, [profileId]: next }))
    try {
      const result = await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-attendance', profileId, date, slot, present: next }) })
      if (result.attendance?.present !== next) throw new Error('Närvaron kunde inte bekräftas. Försök igen.')
      setAttendance((current) => ({ ...current, [profileId]: result.attendance.present }))
    } catch (error) {
      setAttendance((current) => ({ ...current, [profileId]: previous }))
      window.alert(error.message)
    } finally {
      savingProfilesRef.current.delete(profileId)
      setSavingProfiles((current) => { const nextSaving = new Set(current); nextSaving.delete(profileId); return nextSaving })
    }
  }
  const checkinLabel = (item) => {
    if (!item) return 'Ej checkat in'
    if (item.competition) return 'Incheckad · Tävling, inte detta simpass'
    if (['before', 'after'].includes(item.type) && item.activityType && item.activityType !== 'swim') return `Incheckad · ${activityLabel(item.activityType)}, inte detta simpass`
    if (['before', 'after'].includes(item.type) && !item.trainingSlot) return 'Incheckad · Pass ej angivet'
    if (['before', 'after'].includes(item.type) && item.trainingSlot !== slot) return `Incheckad för ${item.trainingSlot === 'morning_swim' ? 'morgonpasset' : 'eftermiddag / kväll'}, inte detta pass`
    const status = item.competition && item.type === 'before' ? '🏁 Ska tävla'
      : item.competition && item.type === 'after' ? '🏅 Har tävlat'
        : item.type === 'after' ? '✓ Har tränat'
          : item.type === 'before' ? '→ Ska träna'
            : item.type === 'sick' ? '🤒 Incheckad · Känner sig sjuk'
              : item.type === 'rest' ? '⏸️ Incheckad · Ingen träning idag' : '✓ Incheckad'
    return item.lateEntry ? `${status} · Efterregistrerad` : status
  }
  return <section className="attendance-panel"><div className="attendance-panel-head"><button className="attendance-toggle" onClick={() => setOpen((value) => !value)}>{open ? '▲ Dölj närvaro' : '📋 Närvaro under simpass'}<span>{attendanceLoading ? 'Hämtar närvaro…' : `${presentCount}/${visible.length} närvarande`}</span></button><button type="button" className="lane-planner-button" onClick={() => setLanePlannerOpen(true)} disabled={attendanceLoading || savingProfiles.size > 0 || !presentCount}>🏊 Banor</button></div>{open && <div className="attendance-body"><div className="library-controls"><label>Simpass<select value={slot} onChange={(event) => setSlot(event.target.value)}><option value="morning_swim">Morgonpass</option><option value="afternoon_swim">Eftermiddag / kväll</option></select></label><label>Grupper<select value={group} onChange={(event) => setGroup(event.target.value)}><option value="all">Alla grupper</option><option value="ungdom_orange">Ungdom Orange</option><option value="ungdom_svart">Ungdom Svart</option><option value="junior">Junior</option></select></label><label className="attendance-sort"><input type="checkbox" checked={sortPresent} onChange={(event) => setSortPresent(event.target.checked)} /> Visa närvarande först</label></div>{attendanceLoading && <p className="attendance-loading" role="status">⏳ Hämtar närvaron och check-in-svar…</p>}<div className="attendance-list">{visible.map((profile) => { const item = checkinResponses.find((response) => response.profileId === profile.id && response.trainingSlot === slot && response.competition !== true && (!response.activityType || response.activityType === 'swim')) || checkinResponses.find((response) => response.profileId === profile.id); const saving = savingProfiles.has(profile.id); return <button key={profile.id} className={attendance[profile.id] ? 'present' : ''} disabled={attendanceLoading || saving} aria-busy={saving} onClick={() => toggle(profile)}><span>{profile.emoji}</span><strong>{profile.displayName}</strong><small>{saving ? 'Sparar närvaro…' : checkinLabel(item)}</small><b>{saving ? '…' : attendance[profile.id] ? '✓' : '○'}</b></button> })}</div></div>}{lanePlannerOpen && <LaneAssignmentAssistant code={code} profiles={visible.filter((profile) => attendance[profile.id])} date={date} slot={slot} onClose={() => setLanePlannerOpen(false)} />}</section>
}

function LaneAssignmentAssistant({ code, profiles, date, slot, onClose }) {
  const [lanes, setLanes] = useState(4)
  const [mode, setMode] = useState('balanced_freestyle')
  const [distance, setDistance] = useState(50)
  const [fastLane, setFastLane] = useState('none')
  const [extraLane, setExtraLane] = useState(false)
  const [laneConfig, setLaneConfig] = useState(() => Array.from({ length: 4 }, () => ({ stroke: 'freestyle', sprinters: false })))
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [generated, setGenerated] = useState(false)
  const [published, setPublished] = useState(false)
  const [laneMap, setLaneMap] = useState({})
  const [laneLabels, setLaneLabels] = useState([])
  const [laneOrder, setLaneOrder] = useState([])
  const [excludedProfileIds, setExcludedProfileIds] = useState([])
  const [draggingProfileId, setDraggingProfileId] = useState(null)
  const [fullScreen, setFullScreen] = useState(false)
  const plannerRef = useRef(null)
  const restoredLanePlan = useRef(false)
  const laneStorageKey = `simkoll-lanes-${code}-${date || todayKey()}-${slot || 'afternoon_swim'}`
  useEffect(() => { apiRequest('/api/profiles?tempusResults=true', code).then((data) => setResults(data.results || [])).catch(() => {}).finally(() => setLoading(false)) }, [code])
  useEffect(() => { setLaneConfig((current) => Array.from({ length: Math.max(1, Number(lanes) || 1) }, (_, index) => current[index] || { stroke: 'freestyle', sprinters: false })); if (restoredLanePlan.current) restoredLanePlan.current = false; else { setGenerated(false); setPublished(false) } }, [lanes])
  useEffect(() => { setLaneLabels((current) => Array.from({ length: Math.max(1, Number(lanes) || 1) }, (_, index) => current[index] || String(index + 1))) }, [lanes])
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(laneStorageKey) || 'null')
      if (!saved?.laneMap) return
      restoredLanePlan.current = true
      if (saved.lanes) setLanes(saved.lanes)
      if (saved.mode) setMode(saved.mode)
      if (saved.distance) setDistance(saved.distance)
      if (Array.isArray(saved.laneConfig)) setLaneConfig(saved.laneConfig)
      if (Array.isArray(saved.laneLabels)) setLaneLabels(saved.laneLabels)
      if (Array.isArray(saved.laneOrder)) setLaneOrder(saved.laneOrder)
      if (Array.isArray(saved.excludedProfileIds)) setExcludedProfileIds(saved.excludedProfileIds)
      setLaneMap(saved.laneMap)
      setGenerated(true)
      setPublished(true)
    } catch { /* en skadad lokal sparning ska inte stoppa banvyn */ }
  }, [laneStorageKey])
  useEffect(() => { const sync = () => setFullScreen(Boolean(document.fullscreenElement)); document.addEventListener('fullscreenchange', sync); return () => document.removeEventListener('fullscreenchange', sync) }, [])
  const strokeLabel = { freestyle: 'Frisim', backstroke: 'Ryggsim', breaststroke: 'Bröstsim', butterfly: 'Fjäril', individual_medley: 'Medley' }
  // Tempus-resultat är normalt lagrade som hundradelar (t.ex. 2773 = 27,73 s
  // och 6004 = 1:00,04). Decimalvärden som redan är sekunder lämnas orörda.
  const normalizedTime = (value) => { const number = Number(value); return Number.isFinite(number) ? (number >= 100 ? number / 100 : number) : Infinity }
  const strokeTerms = { freestyle: ['frisim', 'freestyle'], backstroke: ['rygg', 'backstroke'], breaststroke: ['bröst', 'breaststroke'], butterfly: ['fjäril', 'butterfly'], individual_medley: ['medley'] }
  const bestTime = (profile, stroke = null) => results.filter((item) => {
    if (item.profile_id !== profile.id || !Number.isFinite(Number(item.result_time)) || !new RegExp(`\\b${distance}\\s*(m|meter)?\\b`, 'i').test(String(item.event || ''))) return false
    const terms = stroke ? strokeTerms[stroke] : null
    return !terms || terms.some((term) => String(item.event || '').toLowerCase().includes(term))
  }).reduce((best, item) => Math.min(best, normalizedTime(item.result_time)), Infinity)
  const formatSwimTime = (seconds) => { const minutes = Math.floor(seconds / 60); const remainder = (seconds - minutes * 60).toFixed(2).padStart(5, '0'); return `${minutes}:${remainder}` }
  const timeLabel = (profile, stroke = null) => Number.isFinite(bestTime(profile, stroke)) ? formatSwimTime(bestTime(profile, stroke)) : 'Tid saknas'
  const compareTimes = (a, b, stroke = null) => { const aTime = bestTime(a, stroke || (mode === 'special' ? a.primaryStroke : null)), bTime = bestTime(b, stroke || (mode === 'special' ? b.primaryStroke : null)); if (aTime !== bTime) { if (!Number.isFinite(aTime)) return 1; if (!Number.isFinite(bTime)) return -1; return aTime - bTime } return a.displayName.localeCompare(b.displayName, 'sv') }
  const create = () => {
    const specialStrokeOrder = { freestyle: 0, butterfly: 1, breaststroke: 2, backstroke: 3, individual_medley: 4 }
    const sorted = profiles.slice().sort((a, b) => (mode === 'balanced_special' ? (specialStrokeOrder[a.primaryStroke] ?? 99) - (specialStrokeOrder[b.primaryStroke] ?? 99) : 0) || compareTimes(a, b))
    const next = {}
    const count = Math.max(1, Number(lanes) || 1)
    // I jämna frisimheat placeras de snabbaste centralt, sedan utåt.
    // Exempel: 4 banor => 2, 3, 1, 4 · 3 banor => 2, 1, 3.
    const centerOutOrder = Array.from({ length: count }, (_, index) => index).sort((a, b) => Math.abs(a - (count - 1) / 2) - Math.abs(b - (count - 1) / 2) || a - b)
    const sprintLane = laneConfig.findIndex((config) => config.sprinters)
    const fastestCount = Math.max(1, Math.ceil(sorted.length / count))
    const baseSize = Math.floor(sorted.length / count)
    const remainder = sorted.length % count
    sorted.forEach((profile, index) => {
      let lane
      if (mode === 'balanced_freestyle') lane = centerOutOrder[index % count]
      else if (mode === 'balanced_lanes_freestyle') {
        // Sammanhängande snabbhetsgrupper: snabbast på bana 1, därefter bana 2 osv.
        const largeLaneSize = baseSize + 1
        lane = remainder > 0 && index < remainder * largeLaneSize
          ? Math.floor(index / largeLaneSize)
          : remainder + (baseSize ? Math.floor((index - remainder * largeLaneSize) / baseSize) : 0)
        lane = Math.min(count - 1, lane)
      } else lane = index % count
      if (mode === 'special') { const preferred = laneConfig.findIndex((config) => config.stroke === (profile.primaryStroke || 'freestyle') && !config.sprinters); lane = preferred >= 0 ? preferred : lane }
      if (mode === 'special' && sprintLane >= 0 && index < fastestCount) lane = sprintLane
      if (mode === 'balanced_freestyle' && fastLane !== 'none' && index < fastestCount) lane = Number(fastLane) - 1
      next[profile.id] = lane + 1
    })
    setLaneMap(next); setLaneOrder(sorted.map((profile) => profile.id)); setExcludedProfileIds([]); setGenerated(true); setPublished(false)
  }
  const count = Math.max(1, Number(lanes) || 1)
  const assignmentCount = count + (extraLane ? 1 : 0)
  const assignments = Array.from({ length: assignmentCount }, (_, index) => profiles.filter((profile) => !excludedProfileIds.includes(profile.id) && laneMap[profile.id] === index + 1).sort((a, b) => { const aOrder = laneOrder.indexOf(a.id), bOrder = laneOrder.indexOf(b.id); if (aOrder >= 0 && bOrder >= 0 && aOrder !== bOrder) return aOrder - bOrder; return compareTimes(a, b, mode === 'special' ? laneConfig[index]?.stroke : null) }))
  const orderedLaneViews = assignments.map((lane, index) => ({ lane, index })).sort((a, b) => {
    const aLabel = Number(laneLabels[a.index]); const bLabel = Number(laneLabels[b.index])
    if (Number.isFinite(aLabel) && Number.isFinite(bLabel)) return aLabel - bLabel
    if (Number.isFinite(aLabel)) return -1
    if (Number.isFinite(bLabel)) return 1
    return a.index - b.index
  })
  const moveProfile = (profileId, targetLane) => {
    const target = Number(targetLane)
    if (!target || target < 1 || target > assignmentCount) return
    setLaneMap((current) => {
      const next = { ...current }
      if (!next[profileId] || Number(next[profileId]) === target) return current
      // En manuell flytt ska bara flytta den valda simmaren. Mållanan kan
      // därför tillfälligt innehålla fler simmare – tränaren styr upplägget.
      next[profileId] = target
      return next
    })
    setPublished(false)
  }
  const startDraggingProfile = (event, profileId) => {
    setDraggingProfileId(profileId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', profileId)
  }
  const dropOnLane = (event, laneIndex) => {
    event.preventDefault()
    const profileId = event.dataTransfer.getData('text/plain') || draggingProfileId
    if (profileId) moveProfile(profileId, laneIndex + 1)
    setDraggingProfileId(null)
  }
  const reorderProfile = (profileId, beforeProfileId) => {
    if (!profileId || !beforeProfileId || profileId === beforeProfileId) return
    setLaneOrder((current) => {
      const next = current.filter((id) => id !== profileId)
      const targetIndex = next.indexOf(beforeProfileId)
      next.splice(targetIndex < 0 ? next.length : targetIndex, 0, profileId)
      return next
    })
    setPublished(false)
  }
  const toggleProfileIncluded = (profileId) => {
    setExcludedProfileIds((current) => current.includes(profileId) ? current.filter((id) => id !== profileId) : [...current, profileId])
    setPublished(false)
  }
  const updateLaneLabel = (index, value) => {
    const currentLabels = laneLabels
    const other = currentLabels.findIndex((label, labelIndex) => labelIndex !== index && String(label).trim() === String(value).trim() && String(value).trim() !== '')
    const nextLabels = [...currentLabels]
    if (other >= 0) {
      nextLabels[other] = currentLabels[index]
      setLaneMap((current) => {
        const next = { ...current }
        Object.keys(next).forEach((profileId) => {
          if (Number(next[profileId]) === index + 1) next[profileId] = other + 1
          else if (Number(next[profileId]) === other + 1) next[profileId] = index + 1
        })
        return next
      })
      setLaneConfig((current) => {
        const next = [...current]
        const temporary = next[index]
        next[index] = next[other]
        next[other] = temporary
        return next
      })
    }
    nextLabels[index] = value
    setLaneLabels(nextLabels)
    setPublished(false)
  }
  const dropOnProfile = (event, targetProfileId) => {
    event.preventDefault()
    event.stopPropagation()
    const profileId = event.dataTransfer.getData('text/plain') || draggingProfileId
    if (profileId) {
      if (Number(laneMap[profileId]) === Number(laneMap[targetProfileId])) reorderProfile(profileId, targetProfileId)
      else moveProfile(profileId, laneMap[targetProfileId])
    }
    setDraggingProfileId(null)
  }
  const dragOverProfile = (event, targetProfileId) => {
    event.preventDefault()
    event.stopPropagation()
    const profileId = event.dataTransfer.getData('text/plain') || draggingProfileId
    if (!profileId || profileId === targetProfileId || Number(laneMap[profileId]) !== Number(laneMap[targetProfileId])) return
    const target = event.currentTarget.getBoundingClientRect()
    const targetLane = assignments.find((items) => items.some((item) => item.id === targetProfileId)) || []
    const sourceIndex = targetLane.findIndex((item) => item.id === profileId)
    const targetIndex = targetLane.findIndex((item) => item.id === targetProfileId)
    if (event.clientY < target.top + target.height / 2 && sourceIndex > targetIndex) reorderProfile(profileId, targetProfileId)
    if (event.clientY >= target.top + target.height / 2 && sourceIndex < targetIndex) reorderProfile(targetProfileId, profileId)
  }
  const saveLanePlan = () => {
    try {
      localStorage.setItem(laneStorageKey, JSON.stringify({ lanes, mode, distance, laneConfig, laneLabels, laneOrder, excludedProfileIds, laneMap, savedAt: new Date().toISOString() }))
      setPublished(true)
    } catch { window.alert('Banfördelningen kunde inte sparas på den här enheten.') }
  }
  const toggleFullscreen = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else if (plannerRef.current?.requestFullscreen) await plannerRef.current.requestFullscreen(); else setFullScreen((value) => !value) } catch { setFullScreen((value) => !value) } }
  return <div className="lane-planner-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={plannerRef} className={`lane-planner-modal${fullScreen ? ' lane-planner-fullscreen' : ''}`} role="dialog" aria-modal="true" aria-labelledby="lane-planner-title"><div className="lane-planner-heading"><div><p className="eyebrow">Närvarande idag · {profiles.length} simmare</p><h2 id="lane-planner-title">Banindelning</h2></div><div className="lane-planner-heading-actions"><button type="button" className="secondary-button" onClick={toggleFullscreen}>{fullScreen || document.fullscreenElement ? '↙ Lämna fullskärm' : '⛶ Fullskärm'}</button><button type="button" className="text-button" onClick={onClose}>Stäng ×</button></div></div><div className="lane-planner-form"><label>Antal banor<input type="number" min="1" max="20" value={lanes} onChange={(event) => { setLanes(event.target.value); setGenerated(false) }} /></label><label>Upplägg<select value={mode} onChange={(event) => { setMode(event.target.value); setGenerated(false) }}><option value="balanced_freestyle">Jämna heat frisim</option><option value="balanced_lanes_freestyle">Jämna banor frisim</option><option value="balanced_special">Jämna heat special</option><option value="special">Specialpass efter simsätt</option></select></label><label>Relevant distans<select value={distance} onChange={(event) => { setDistance(Number(event.target.value)); setGenerated(false) }}><option value="50">50 m · fart</option><option value="100">100 m</option><option value="200">200 m · längre serie</option><option value="400">400 m+</option></select></label>{mode === 'balanced_freestyle' && <label>Snabb bana<select value={fastLane} onChange={(event) => { setFastLane(event.target.value); setGenerated(false) }}><option value="none">Ingen – fördela jämnt</option>{Array.from({ length: Math.max(1, Number(lanes) || 1) }, (_, index) => <option key={index + 1} value={index + 1}>Bana {index + 1} – snabbaste gruppen</option>)}</select></label>}{mode === 'special' && <div className="lane-config-grid lane-planner-wide"><strong>Simsätt per bana</strong><small>Tryck på varje bana och välj simsätt. Markera en bana för sprinters om den ska samla de snabbaste simmarna.</small>{laneConfig.map((config, index) => <article key={index}><strong>Bana {index + 1}</strong><select value={config.stroke} onChange={(event) => { setLaneConfig((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, stroke: event.target.value } : item)); setGenerated(false) }}>{STROKE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label><input type="checkbox" checked={Boolean(config.sprinters)} onChange={(event) => { setLaneConfig((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, sprinters: event.target.checked } : item)); setGenerated(false) }} /> Sprinterbana</label></article>)}</div>}</div><p className="lane-planner-help">{loading ? 'Hämtar relevanta Tempus-resultat…' : 'Snabbaste sparade tid på vald distans läggs först. Välj snabb bana om de snabbaste ska samlas på samma bana.'}</p><button type="button" className="primary-button" onClick={create}>Skapa banfördelning →</button>{generated && <><div className="lane-planner-results">{orderedLaneViews.map(({ lane, index }) => <article key={index} onDragEnter={(event) => event.preventDefault()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOnLane(event, index)} onClick={() => { if (draggingProfileId) { moveProfile(draggingProfileId, index + 1); setDraggingProfileId(null) } }}><label className="lane-number">Bana <input type="text" inputMode="numeric" value={laneLabels[index] ?? String(index + 1)} onChange={(event) => updateLaneLabel(index, event.target.value)} /></label>{lane.length ? lane.map((profile) => <span key={profile.id} draggable="true" className={draggingProfileId === profile.id ? 'is-dragging' : ''} onDragStart={(event) => startDraggingProfile(event, profile.id)} onDragOver={(event) => dragOverProfile(event, profile.id)} onDrop={(event) => dropOnProfile(event, profile.id)} onDragEnd={() => setDraggingProfileId(null)} onClick={(event) => { event.stopPropagation(); if (draggingProfileId && draggingProfileId !== profile.id) { if (Number(laneMap[draggingProfileId]) === Number(laneMap[profile.id])) reorderProfile(draggingProfileId, profile.id); else moveProfile(draggingProfileId, laneMap[profile.id]); setDraggingProfileId(null) } else setDraggingProfileId(profile.id) }}><span>{profile.emoji} {profile.displayName}</span>{!fullScreen && <small>{timeLabel(profile, mode === 'special' ? laneConfig[index]?.stroke : null)}</small>}<small className="lane-drag-hint">Dra simmaren uppåt eller nedåt</small><button type="button" className="lane-exclude-button" onClick={(event) => { event.stopPropagation(); toggleProfileIncluded(profile.id) }}>Ta bort</button></span>) : <small>Tom</small>}</article>)}</div>{excludedProfileIds.length > 0 && <div className="lane-excluded-list"><strong>Inte med i banfördelningen</strong>{profiles.filter((profile) => excludedProfileIds.includes(profile.id)).map((profile) => <button type="button" key={profile.id} onClick={() => toggleProfileIncluded(profile.id)}>{profile.emoji} {profile.displayName} · Lägg tillbaka</button>)}</div>}<div className="lane-planner-publish-actions"><button type="button" className="secondary-button" onClick={saveLanePlan}>Spara banfördelning</button>{published && <span>Publicerad för närvarande grupp</span>}</div>{published && !fullScreen && <section className="lane-published-view"><p className="eyebrow">Publicerad banfördelning</p><h3>Så här ser dagens upplägg ut</h3><div>{orderedLaneViews.map(({ lane, index }) => <article key={index}><strong>Bana {laneLabels[index] || index + 1}</strong><small>{laneConfig[index] ? `${strokeLabel[laneConfig[index].stroke] || 'Frisim'}${laneConfig[index].sprinters ? ' · Sprinters' : ''}` : 'Frisim'}</small>{lane.length ? lane.map((profile) => <span key={profile.id}>{profile.emoji} {profile.displayName}</span>) : <em>Tom bana</em>}</article>)}</div></section>}</>}</section></div>
}

function LaneAssignmentAssistantNewDraft({ code, profiles, onClose }) {
  const [lanes, setLanes] = useState(4)
  const [distance, setDistance] = useState(50)
  const [fastLane, setFastLane] = useState('none')
  const [extraLane, setExtraLane] = useState(false)
  const [results, setResults] = useState([])
  const [generated, setGenerated] = useState(false)
  const [published, setPublished] = useState(false)
  const [laneMap, setLaneMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [fullScreen, setFullScreen] = useState(false)
  const plannerRef = useRef(null)
  const count = Math.max(1, Number(lanes) || 1), totalLanes = count + (extraLane ? 1 : 0)
  useEffect(() => { apiRequest('/api/profiles?tempusResults=true', code).then((data) => setResults(data.results || [])).catch(() => {}).finally(() => setLoading(false)) }, [code])
  const normalizedTime = (value) => { const number = Number(value); return Number.isFinite(number) ? (number >= 100 ? number / 100 : number) : Infinity }
  const bestTime = (profile) => results.filter((item) => item.profile_id === profile.id && Number.isFinite(Number(item.result_time)) && new RegExp(`\\b${distance}\\s*(m|meter)?\\b`, 'i').test(String(item.event || ''))).reduce((best, item) => Math.min(best, normalizedTime(item.result_time)), Infinity)
  const formatSwimTime = (seconds) => { const minutes = Math.floor(seconds / 60); const remainder = (seconds - minutes * 60).toFixed(2).padStart(5, '0'); return `${minutes}:${remainder}` }
  const timeLabel = (profile) => Number.isFinite(bestTime(profile)) ? formatSwimTime(bestTime(profile)) : 'Tid saknas'
  const assignments = Array.from({ length: totalLanes }, (_, index) => profiles.filter((profile) => Number(laneMap[profile.id]) === index + 1))
  const create = () => { const sorted = profiles.slice().sort((a, b) => bestTime(a) - bestTime(b) || a.displayName.localeCompare(b.displayName, 'sv')); const next = {}; const fastestCount = Math.max(1, Math.ceil(sorted.length / count)); sorted.forEach((profile, index) => { next[profile.id] = fastLane !== 'none' && index < fastestCount ? Number(fastLane) : (index % count) + 1 }); setLaneMap(next); setGenerated(true); setPublished(false) }
  const moveProfile = (profileId, value) => { const target = Number(value); if (!target || target > totalLanes) return; setLaneMap((current) => { const next = { ...current }, source = Number(next[profileId]); if (!source || source === target) return current; const occupant = profiles.find((profile) => Number(next[profile.id]) === target && profile.id !== profileId); next[profileId] = target; if (occupant) next[occupant.id] = source; return next }); setPublished(false) }
  const toggleFullscreen = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else if (plannerRef.current?.requestFullscreen) await plannerRef.current.requestFullscreen(); else setFullScreen((value) => !value) } catch { setFullScreen((value) => !value) } }
  return <div className="lane-planner-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={plannerRef} className={`lane-planner-modal${fullScreen ? ' lane-planner-fullscreen' : ''}`} role="dialog" aria-modal="true" aria-labelledby="lane-planner-title"><div className="lane-planner-heading"><div><p className="eyebrow">Närvarande idag · {profiles.length} simmare</p><h2 id="lane-planner-title">Banindelning</h2></div><div className="lane-planner-heading-actions"><button type="button" className="secondary-button" onClick={toggleFullscreen}>{fullScreen || document.fullscreenElement ? '↙ Lämna fullskärm' : '⛶ Fullskärm'}</button><button type="button" className="text-button" onClick={onClose}>Stäng ×</button></div></div><div className="lane-planner-form"><label>Antal ordinarie banor<input type="number" min="1" max="20" value={lanes} onChange={(event) => { setLanes(event.target.value); setGenerated(false) }} /></label><label>Relevant distans<select value={distance} onChange={(event) => { setDistance(Number(event.target.value)); setGenerated(false) }}><option value="50">50 m · fart</option><option value="100">100 m</option><option value="200">200 m · längre serie</option><option value="400">400 m+</option></select></label><label>Snabb bana<select value={fastLane} onChange={(event) => { setFastLane(event.target.value); setGenerated(false) }}><option value="none">Ingen – jämna heat</option>{Array.from({ length: count }, (_, index) => <option key={index + 1} value={index + 1}>Bana {index + 1} – snabbaste gruppen</option>)}</select></label><label className="lane-extra-toggle"><span>Extra bana</span><input type="checkbox" checked={extraLane} onChange={(event) => { setExtraLane(event.target.checked); setGenerated(false); setPublished(false) }} /> Visa Bana X</label></div><p className="lane-planner-help">{loading ? 'Hämtar sparade tider…' : 'Snabbaste simmarna placeras först på bana 1, 2, 3 osv. Välj snabb bana om de ska samlas på samma bana.'}</p><button type="button" className="primary-button" onClick={create}>Skapa banfördelning →</button>{generated && <><div className="lane-planner-results">{assignments.map((lane, index) => <article key={index}><strong>{index === count ? 'Bana X' : `Bana ${index + 1}`}</strong>{lane.length ? lane.map((profile) => <span key={profile.id}><span>{profile.emoji} {profile.displayName}</span><small>{timeLabel(profile)}</small><select aria-label={`Flytta ${profile.displayName}`} value={laneMap[profile.id]} onChange={(event) => moveProfile(profile.id, event.target.value)}>{Array.from({ length: totalLanes }, (_, laneIndex) => <option key={laneIndex + 1} value={laneIndex + 1}>{laneIndex === count ? 'Bana X' : `Bana ${laneIndex + 1}`}</option>)}</select></span>) : <small>Tom</small>}</article>)}</div><div className="lane-planner-publish-actions"><button type="button" className="secondary-button" onClick={() => setPublished(true)}>Publicera banfördelning</button>{published && <span>Publicerad för närvarande grupp</span>}</div>{published && <section className="lane-published-view"><p className="eyebrow">Publicerad banfördelning</p><h3>Så här ser dagens upplägg ut</h3><div>{assignments.map((lane, index) => <article key={index}><strong>{index === count ? 'Bana X' : `Bana ${index + 1}`}</strong><small>{index === count ? 'Extra simmare' : 'Jämnt heat'}</small>{lane.length ? lane.map((profile) => <span key={profile.id}>{profile.emoji} {profile.displayName}</span>) : <em>Tom bana</em>}</article>)}</div></section>}</>}</section></div>
}

function TodayWorkoutSummary({ workouts = [], selectedGroups = [], hasCompetition = false, date = todayKey(), responses = [], profiles = [] }) {
  const [selected, setSelected] = useState(null)
  const visible = workouts.filter((workout) => !workout.targetGroups?.length || selectedGroups.length === 0 || workout.targetGroups.some((group) => selectedGroups.includes(group)))
  const focusLabel = (workout) => WORKOUT_FOCUSES.find(([value]) => value === workout.focus)?.[1] || workout.focus || 'Träningspass'
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
  const latestByProfile = responses.filter((item) => item.profileId && profileById.has(item.profileId)).slice().sort(compareCheckinsNewest).reduce((result, item) => {
    if (!result.has(item.profileId)) result.set(item.profileId, item)
    return result
  }, new Map())
  const participants = [...latestByProfile.entries()].map(([profileId, item]) => ({ profile: profileById.get(profileId), item }))
  const intending = participants.filter(({ item }) => item.type === 'before' && item.competition !== true)
  const completed = participants.filter(({ item }) => item.type === 'after' && item.competition !== true && (!item.activityType || item.activityType === 'swim'))
  const otherResponses = participants.filter(({ item }) => !intending.some((entry) => entry.profile.id === item.profileId) && !completed.some((entry) => entry.profile.id === item.profileId))
  const answeredIds = new Set(latestByProfile.keys())
  const notReported = profiles.filter((profile) => !answeredIds.has(profile.id))
  const rows = [
    { title: 'Ska träna idag', items: intending, icon: '→', tone: 'planned', detail: ({ item }) => item.activityType === 'strength' ? 'Planerad styrketräning' : 'Planerat simpass' },
    { title: 'Har tränat idag', items: completed, icon: '✓', tone: 'done', detail: ({ item }) => item.lateEntry ? 'Efterregistrerat' : item.activityType === 'swim' ? 'Simträning rapporterad' : 'Träning rapporterad' },
    { title: 'Tävling, vila eller annan aktivitet', items: otherResponses, icon: 'ℹ', tone: 'other', detail: ({ item }) => item.competition ? (item.type === 'after' ? 'Har tävlat idag' : 'Ska tävla idag') : item.type === 'sick' ? 'Har anmält sjukdom' : item.type === 'rest' ? 'Har anmält vila' : item.activityType ? `${activityLabel(item.activityType)} · räknas inte som simpass` : item.type === 'before' ? 'Ska träna · simpass ej bekräftat' : 'Aktivitet ej angiven' },
    { title: 'Ingen incheckning idag', items: notReported.map((profile) => ({ profile, item: null })), icon: '…', tone: 'not-reported', detail: () => 'Ej rapporterat' },
  ]
  const dayLabel = new Date(`${date}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
  return <section className="today-workout-summary coach-card">
    <div className="competition-day-heading"><div><p className="eyebrow">🏊 Dagens träning · {dayLabel}</p><h2>Pass och inriktning</h2><small>{visible.length ? 'Dagens pass och simmarnas check-in-status' : hasCompetition ? 'Inget simpass upplagt · tävlingsläget visas ovan' : 'Ingen träningsplanering upplagd för dagen'}</small></div><span className="competition-day-total"><strong>{latestByProfile.size}</strong><small>svar från<br />profiler</small></span></div>
    <div className="competition-day-groups">{rows.map((row) => <details className={`competition-day-group ${row.tone}`} key={row.title}><summary><span aria-hidden="true">{row.icon}</span><strong>{row.title}</strong><b>{row.items.length}</b><small>{row.items.length ? 'Visa namn' : 'Inga'}</small></summary><div>{row.items.map((entry) => <article key={entry.profile.id}><span>{entry.profile.emoji || '🏊'}</span><strong>{entry.profile.displayName}</strong><small>{row.detail(entry)}</small></article>)}</div></details>)}</div>
    {visible.length ? <><p className="today-workout-status-note">Planerade pass för dagen</p><div className="today-workout-summary-list">{visible.map((workout) => <button type="button" className="today-workout-summary-item" key={workout.id} onClick={() => setSelected(workout)}><span className="today-workout-focus">{focusLabel(workout)}</span><strong>{workout.title || 'Träningspass'}</strong><small>{[workout.distanceMeters ? `${Number(workout.distanceMeters).toLocaleString('sv-SE')} m` : '', workout.durationMinutes ? `${workout.durationMinutes} min` : '', workout.timeOfDay === 'morning' ? 'Morgon' : workout.timeOfDay === 'afternoon' ? 'Eftermiddag / kväll' : 'Tid ej angiven'].filter(Boolean).join(' · ') || 'Öppna passet'}</small><b>→</b></button>)}</div></> : <small className="competition-day-note">Svarslistan visar bara simmare i valda grupper. Tävling, vila, sjukdom och annan aktivitet hålls isär från rapporterad simträning.</small>}
    {selected && <div className="workout-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null) }}><section className="workout-preview-modal" role="dialog" aria-modal="true" aria-labelledby="today-workout-title"><button type="button" className="workout-preview-close" onClick={() => setSelected(null)} aria-label="Stäng">×</button><p className="eyebrow">{focusLabel(selected)}</p><h2 id="today-workout-title">{selected.title || 'Träningspass'}</h2><WorkoutMeta workout={selected} /><WorkoutContent content={selected.content} />{selected.note && <aside><strong>Kommentar från tränaren</strong>{selected.note}</aside>}</section></div>}
  </section>
}

function CompetitionDaySummary({ date, plans = [], responses = [], profiles = [] }) {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
  const latestByProfile = [...responses].filter((item) => item.profileId && profileById.has(item.profileId)).sort(compareCheckinsNewest).reduce((result, item) => {
    if (!result.has(item.profileId)) result.set(item.profileId, item)
    return result
  }, new Map())
  const participants = [...latestByProfile.entries()].map(([profileId, item]) => ({ profile: profileById.get(profileId), item }))
  const completed = participants.filter(({ item }) => item.competition === true && item.type === 'after')
  const intending = participants.filter(({ item }) => item.competition === true && item.type !== 'after')
  const swimTraining = participants.filter(({ item }) => item.type === 'after' && item.competition !== true && item.activityType === 'swim')
  const unspecifiedTraining = participants.filter(({ item }) => item.type === 'after' && item.competition !== true && !item.activityType)
  const otherTraining = participants.filter(({ item }) => item.type === 'after' && item.competition !== true && item.activityType && item.activityType !== 'swim')
  const noTraining = participants.filter(({ item }) => ['rest', 'sick'].includes(item.type))
  const planningTraining = participants.filter(({ item }) => item.type === 'before' && item.competition !== true)
  const answeredIds = new Set(latestByProfile.keys())
  const notReported = profiles.filter((profile) => !answeredIds.has(profile.id))
  const hasCompetition = plans.length > 0 || completed.length > 0 || intending.length > 0
  if (!hasCompetition) return null
  const rows = [
    { title: 'Har tävlat idag', items: completed, icon: '🏅', tone: 'done' },
    { title: 'Ska tävla idag', items: intending, icon: '🏁', tone: 'race' },
    { title: 'Har simtränat', items: swimTraining, icon: '🏊', tone: 'swim' },
    { title: 'Har tränat · aktivitet ej angiven', items: unspecifiedTraining, icon: '✅', tone: 'other' },
    { title: 'Annan träning', items: otherTraining, icon: '🏋️', tone: 'other' },
    { title: 'Vila eller sjuk', items: noTraining, icon: '⏸️', tone: 'rest' },
    { title: 'Planerar träning', items: planningTraining, icon: '📋', tone: 'planned' },
  ]
  return <section className="competition-day-summary coach-card">
    <div className="competition-day-heading"><div><p className="eyebrow">🏆 Tävlingsdag · {new Date(`${date}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}</p><h2>{plans[0]?.title || plans[0]?.name || 'Dagens tävling'}</h2><small>{plans.length ? 'Tävlingsplanering från kalendern och dagens incheckningar' : 'Visas eftersom simmare har checkat in som tävlande idag'}</small></div><span className="competition-day-total"><strong>{completed.length + intending.length}</strong><small>tävlings-<br />incheckningar</small></span></div>
    {plans.length > 1 && <div className="competition-day-events">{plans.slice(1).map((plan, index) => <span key={`${plan.id || plan.title || plan.name}-${index}`}>📅 {plan.title || plan.name || 'Tävling'}</span>)}</div>}
    <div className="competition-day-groups">{rows.filter((row) => row.items.length).map((row) => <details className={`competition-day-group ${row.tone}`} key={row.title}><summary><span aria-hidden="true">{row.icon}</span><strong>{row.title}</strong><b>{row.items.length}</b><small>Visa namn</small></summary><div>{row.items.map(({ profile, item }) => <article key={profile.id}><span>{profile.emoji || '🏊'}</span><strong>{profile.displayName}</strong><small>{item.activityType && item.activityType !== 'swim' ? activityLabel(item.activityType) : item.type === 'after' && item.competition ? 'Tävlingsdagen rapporterad' : ''}</small></article>)}</div></details>)}
      <details className="competition-day-group not-reported"><summary><span aria-hidden="true">…</span><strong>Ingen incheckning idag</strong><b>{notReported.length}</b><small>Visa namn</small></summary><div>{notReported.map((profile) => <article key={profile.id}><span>{profile.emoji || '🏊'}</span><strong>{profile.displayName}</strong><small>Ej rapporterat</small></article>)}</div></details>
    </div>
    <small className="competition-day-note">Tävlingsplanering är inte samma sak som bekräftat deltagande. “Ska tävla” visar simmarens egen incheckning; simträning och annan aktivitet hålls isär.</small>
  </section>
}

function WeeklyMeeting({ code, profiles = [] }) {
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('this_week')
  const profileIds = profiles.map((profile) => profile.id).join(',')
  const range = useMemo(() => {
    const thisMonday = weekStart(new Date())
    const end = new Date(thisMonday)
    if (period === 'this_week') {
      end.setDate(end.getDate() + 7)
      return { start: thisMonday, end }
    }
    if (period === 'four_weeks') {
      const start = new Date(end); start.setDate(start.getDate() - 28)
      return { start, end }
    }
    if (period === 'term') {
      const now = new Date()
      const seasonStart = now.getMonth() >= 7 ? new Date(now.getFullYear(), 7, 1) : new Date(now.getFullYear(), 0, 1)
      return { start: weekStart(seasonStart), end }
    }
    const start = new Date(end); start.setDate(start.getDate() - 7)
    return { start, end }
  }, [period])
  useEffect(() => {
    setReport(null); setError('')
    const query = new URLSearchParams({ start: range.start.toISOString(), end: range.end.toISOString(), startDay: dateKey(range.start), endDay: dateKey(range.end), profileIds })
    apiRequest(`/api/weekly-report?${query}`, code).then(setReport).catch((nextError) => setError(nextError.message))
  }, [code, range, profileIds])
  const label = `${range.start.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}–${new Date(range.end.getTime() - 1).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}`
  if (error) return <EmptyPeriod title={error} periodLabel="Veckomöte" />
  if (!report) return <section className="empty-period"><span>≈</span><h2>Skapar veckobilden…</h2></section>
  const positives = [
    report.checkins > 0 && `${report.checkins} incheckningar gav tränarna bättre underlag.`,
    report.activeProfiles > 0 && `${report.activeProfiles} profiler var aktiva under ${report.activeDays} dagar.`,
    report.kudos > 0 && `${report.kudos} pepphälsningar stärkte gruppen.`,
    report.approvedGoals > 0 && `${report.approvedGoals} mål blev godkända.`,
    report.passRating >= 4 && `Passen fick ett starkt snittbetyg på ${report.passRating} av 5.`,
  ].filter(Boolean)
  const attention = [
    report.signals.lowBody > 0 && `${report.signals.lowBody} svar visade tung eller öm kropp.`,
    report.signals.highRpe > 0 && `${report.signals.highRpe} pass skattades som mycket ansträngande (RPE 9–10).`,
    report.signals.lowPass > 0 && `${report.signals.lowPass} svar gav passet lägsta betyg.`,
  ].filter(Boolean)
  const attendanceRows = [...(report.attendanceProfiles || [])].sort((a, b) => (b.percentage ?? -1) - (a.percentage ?? -1) || a.displayName.localeCompare(b.displayName, 'sv'))
  return <section className="weekly-meeting"><div className="period-heading"><div><p className="eyebrow">Underlag för söndags- eller måndagsmötet</p><h2>Veckobilden</h2></div><div className="big-count"><strong>{label}</strong><span>{period === 'this_week' ? 'den här veckan' : period === 'previous_week' ? 'förra veckan' : period === 'term' ? 'avslutade veckor i terminen' : period === 'four_weeks' ? 'senaste fyra avslutade veckorna' : 'senast avslutade vecka'}</span></div></div><div className="meeting-period-switcher" role="group" aria-label="Välj period"><button className={period === 'this_week' ? 'active' : ''} onClick={() => setPeriod('this_week')}>Den här veckan</button><button className={period === 'previous_week' ? 'active' : ''} onClick={() => setPeriod('previous_week')}>Förra veckan</button><button className={period === 'four_weeks' ? 'active' : ''} onClick={() => setPeriod('four_weeks')}>Senaste 4 veckorna</button><button className={period === 'term' ? 'active' : ''} onClick={() => setPeriod('term')}>Terminen</button></div><div className="meeting-stats"><Stat title="Aktiva profiler" value={report.activeProfiles} note={`${report.activeDays} aktiva dagar`} /><Stat title="Incheckningar" value={report.checkins} note={`${report.afterSessions} efter simpass`} /><Stat title="Registrerad träning" value={report.swims + report.strength + report.dryland} note={`${report.swims} sim · ${report.strength} styrka · ${report.dryland} land`} /><Stat title="Erbjudna simmeter" value={report.offeredMeters ? `${report.offeredMeters.toLocaleString('sv-SE')} m` : '–'} note="Planerade eller publicerade pass" /><Stat title="Uppskattat snitt" value={report.estimatedMeters == null ? '–' : `${report.estimatedMeters.toLocaleString('sv-SE')} m`} note={report.completedPassesPerSwimmer == null ? 'Registrerade pass per simmare' : `${report.completedPassesPerSwimmer.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} simpass per simmare i snitt`} /><Stat title="Närvaro mot mål" value={report.attendancePercentage == null ? '–' : `${report.attendancePercentage}%`} note={report.expectedSwimPasses ? `${report.completedSwimPasses} av ${report.expectedSwimPasses} överenskomna simpass` : 'Inga överenskomna simmål'} /><Stat title="Pepp i gruppen" value={report.kudos} note={`${report.approvedGoals} godkända mål`} /><Stat title="Personbästa" value={report.personalBests || 0} note="Nya Tempus-resultat" /></div><details className="coach-card meeting-attendance"><summary className="meeting-attendance-summary"><div><p className="eyebrow">Individuell uppföljning</p><h2>Närvaro mot eget mål</h2></div><small>{report.expectedSwimPasses ? `${report.completedSwimPasses} av ${report.expectedSwimPasses} överenskomna pass totalt` : 'Visa simmarlistan'}</small></summary><div className="meeting-attendance-body">{attendanceRows.length ? <div className="attendance-goal-list">{attendanceRows.map((item) => <article key={item.profileId}><span>{item.emoji}</span><div><strong>{item.displayName}</strong><small>{item.expected ? `${item.completed} av ${item.expected} pass` : 'Inget simmål registrerat'}</small></div><b className={item.percentage == null ? 'muted' : item.percentage >= 100 ? 'good' : item.percentage >= 75 ? 'ok' : 'low'}>{item.percentage == null ? '–' : `${item.percentage}%`}</b></article>)}</div> : <p className="empty">Inga simmarprofiler hittades i perioden.</p>}<small className="attendance-goal-note">Procenten visar genomförda simpass i förhållande till den överenskomna mängden. Extra pass syns som över 100 %, till exempel 5 av 4 pass = 125 %.</small></div></details><div className="meeting-columns"><section className="coach-card meeting-highlights"><p className="eyebrow">Det här tar vi med oss</p><h2>Veckans positiva</h2>{positives.length ? positives.map((item) => <p key={item}><span>✓</span>{item}</p>) : <p className="empty">Mer data behövs för att skapa positiva highlights.</p>}</section><section className="coach-card meeting-attention"><p className="eyebrow">Följ upp tillsammans</p><h2>Signaler att vara nyfiken på</h2>{attention.length ? attention.map((item) => <p key={item}><span>!</span>{item}</p>) : <p><span>✓</span>Inga tydliga varningssignaler i veckans svar.</p>}<small>Visas endast på gruppnivå. Prata med gruppen och dra inte slutsatser om enskilda simmare från en ensam skattning.</small></section></div><section className="coach-card meeting-ratings"><h2>Träningsupplevelsen</h2><div><Stat title="Känsla" value={report.feeling == null ? '–' : `${report.feeling}/5`} note="Alla incheckningar" /><Stat title="Kroppen" value={report.body == null ? '–' : `${report.body}/5`} note="Självskattning" /><Stat title="Ansträngning" value={report.rpe == null ? '–' : `${report.rpe}/10`} note="Efter pass" /><Stat title="Passet" value={report.passRating == null ? '–' : `${report.passRating}/5`} note="Simmarnas betyg" /></div></section></section>
}

const ANALYSIS_PERIODS = [
  { key: 'yesterday', label: 'Föregående dag' }, { key: '7', label: '7 dagar' }, { key: 'previous_week', label: 'Förra veckan' },
  { key: 'this_month', label: 'Den här månaden' }, { key: 'previous_month', label: 'Föregående månad' }, { key: '30', label: '30 dagar' }, { key: '90', label: '3 månader' },
]

function analysisRange(period) {
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'yesterday') {
    const start = new Date(today); start.setDate(start.getDate() - 1)
    const previousStart = new Date(start); previousStart.setDate(previousStart.getDate() - 1)
    return { start, end: today, previousStart }
  }
  if (period === 'previous_week') {
    const thisMonday = weekStart(today), end = new Date(thisMonday)
    const start = new Date(end); start.setDate(start.getDate() - 7)
    const previousStart = new Date(start); previousStart.setDate(previousStart.getDate() - 7)
    return { start, end, previousStart }
  }
  if (period === 'this_month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1), end = new Date(today); end.setDate(end.getDate() + 1)
    const previousStart = new Date(start.getFullYear(), start.getMonth() - 1, 1)
    const previousMonthDays = new Date(start.getFullYear(), start.getMonth(), 0).getDate()
    const previousEnd = new Date(previousStart.getFullYear(), previousStart.getMonth(), Math.min(today.getDate(), previousMonthDays))
    return { start, end, previousStart, previousEnd }
  }
  if (period === 'previous_month') {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1), end = new Date(today.getFullYear(), today.getMonth(), 1)
    const previousStart = new Date(today.getFullYear(), today.getMonth() - 2, 1)
    return { start, end, previousStart }
  }
  const days = Number(period)
  const end = new Date(today); end.setDate(end.getDate() + 1)
  const start = new Date(end); start.setDate(start.getDate() - days)
  const previousStart = new Date(start); previousStart.setDate(previousStart.getDate() - days)
  return { start, end, previousStart }
}

function TrainingMeterChart({ items }) {
  const rows = items.map((item) => {
    const reportedSwimMeters = (item.activities || []).filter((activity) => activity.type === 'swim' && Number.isFinite(Number(activity.distanceMeters))).reduce((sum, activity) => sum + Number(activity.distanceMeters), 0)
    return { ...item, reportedSwimMeters }
  }).filter((item) => item.distanceMeters != null || item.reportedSwimMeters > 0)
  if (!rows.length) return null
  const maxMeters = Math.max(...rows.flatMap((item) => [Number(item.distanceMeters) || 0, item.reportedSwimMeters]), 1000)
  const scaleMax = Math.ceil(maxMeters / 1000) * 1000
  const format = (value) => `${Number(value).toLocaleString('sv-SE')} m`
  return <section className="training-meter-section"><div className="training-meter-heading"><div><h3>Simmeter per dag</h3><p>Planerad distans jämförs separat med simning som simmaren själv har rapporterat.</p></div><div className="training-meter-legend"><span><i className="planned" />Planerat</span><span><i className="reported" />Rapporterat</span></div></div><div className="training-meter-list">{rows.map((item, index) => <article key={`${item.date}-${index}`}><strong>{new Date(`${item.date}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })}</strong><div className="training-meter-values">{item.distanceMeters != null && <div><span>Planerat</span><div className="training-meter-track"><i className="planned" style={{ width: `${Math.max(2, Number(item.distanceMeters) / scaleMax * 100)}%` }} /></div><b>{format(item.distanceMeters)}</b></div>}{item.reportedSwimMeters > 0 && <div><span>Rapporterat</span><div className="training-meter-track"><i className="reported" style={{ width: `${Math.max(2, item.reportedSwimMeters / scaleMax * 100)}%` }} /></div><b>{format(item.reportedSwimMeters)}</b></div>}</div></article>)}</div><small className="training-meter-footnote">Gemensam skala: 0–{format(scaleMax)}. Planerat är inte ett uppmätt resultat. Cykling och annan landträning visas separat.</small></section>
}

function TrainingVolumeChart({ items }) {
  const colors = { swim: '#26b7b0', strength: '#9b8cff', dryland: '#f0b45b', cycling: '#7eaa45', other: '#8a9ba0', unknown: '#b5c0c3' }
  const rows = items.map((item) => {
    const minutesByType = (item.activities || []).reduce((totals, activity) => {
      if (activity.minutes == null || !Number.isFinite(Number(activity.minutes))) return totals
      const type = activity.type || 'unknown'
      totals[type] = (totals[type] || 0) + Number(activity.minutes)
      return totals
    }, {})
    return { ...item, minutesByType, totalMinutes: Object.values(minutesByType).reduce((sum, minutes) => sum + minutes, 0) }
  }).filter((item) => item.totalMinutes > 0)
  if (!rows.length) return null
  const maxMinutes = Math.max(...rows.map((item) => item.totalMinutes))
  const scaleMax = Math.ceil(maxMinutes / 30) * 30
  const types = [...new Set(rows.flatMap((item) => Object.keys(item.minutesByType)))]
  return <section className="training-volume-section"><div className="training-meter-heading"><div><h3>Rapporterad träningstid</h3><p>Minuter som simmaren själv har angett, uppdelade efter aktivitet.</p></div><div className="training-meter-legend">{types.map((type) => <span key={type}><i style={{ background: colors[type] || colors.other }} />{type === 'unknown' ? 'Typ saknas' : activityLabel(type)}</span>)}</div></div><div className="training-volume-list">{rows.map((item, index) => <article key={`${item.date}-${index}`}><div className="training-volume-date"><strong>{new Date(`${item.date}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })}</strong><b>{item.totalMinutes} min</b></div><div className="training-volume-track" role="img" aria-label={`${item.totalMinutes} minuter rapporterad träning`}>{types.map((type) => { const minutes = item.minutesByType[type] || 0; return minutes ? <i key={type} title={`${type === 'unknown' ? 'Typ saknas' : activityLabel(type)}: ${minutes} min`} style={{ width: `${minutes / scaleMax * 100}%`, background: colors[type] || colors.other }} /> : null })}</div></article>)}</div><small className="training-meter-footnote">Gemensam skala: 0–{scaleMax} min per dag. Planerad passtid räknas inte som genomförd träning.</small></section>
}

function TrendLineChart({ items }) {
  const [hoverIndex, setHoverIndex] = useState(null)
  const [visible, setVisible] = useState({ feeling: true, body: true, rpe: true, speedFeeling: true, passRating: true, swimMeterScale: true })
  if (!items?.length) return <p className="empty">Inga genomförda pass under perioden.</p>
  items = withTrendSwimMeters(items)
  const meterScaleMax = Math.max(10, Math.ceil(Math.max(...items.map((item) => item.swimMeterScale || 0))))
  const metrics = [{ key: 'feeling', label: 'Känsla', color: '#26b7b0', max: 5 }, { key: 'body', label: 'Kropp', color: '#a9d33e', max: 5 }, { key: 'rpe', label: 'RPE', color: '#f59e9e', max: 10 }, { key: 'speedFeeling', label: 'Fartkänsla', color: '#9b8cff', max: 5 }, { key: 'passRating', label: 'Passet', color: '#f0b45b', max: 5 }]
  metrics.push({ key: 'swimMeterScale', label: 'Simmeter (streckad)', color: '#145f75', max: meterScaleMax, dashed: true })
  const width = Math.max(560, items.length * 92), height = 230, left = 34, right = 92, top = 16, bottom = 34, chartWidth = width - left - right, chartHeight = height - top - bottom
  const dateLayout = trendDateLayout(items)
  const dayWidth = chartWidth * dateLayout.dayWidth
  const x = (index) => left + dateLayout.positions[index] * chartWidth
  const dayX = (date) => left + dateLayout.labels.find((label) => label.date === date).position * chartWidth
  const y = (value, max) => top + chartHeight - (Number(value) / max) * chartHeight
  const lineSegments = (metric) => visible[metric.key] ? trendSegments(items, metric.key) : []
  const slotLabels = { morning_swim: 'Förmiddag', afternoon_swim: 'Eftermiddag' }
  return <div className="trend-line-section">
    <div className="trend-line-filter"><strong>Visa i diagrammet</strong>{metrics.map((metric) => <button type="button" className={visible[metric.key] ? 'active' : ''} key={metric.key} onClick={() => setVisible((current) => ({ ...current, [metric.key]: !current[metric.key] }))}><i style={{ background: metric.color }} />{metric.label}</button>)}</div>
    <div className="trend-line-wrap"><svg className="trend-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Träningsupplevelse och simmeter över tid. Vänster skala 0–5, höger RPE 0–10 och separat meterskala 0–${meterScaleMax * 1000} meter.`}>
      {[0, 1, 2, 3, 4, 5].map((tick) => <g key={tick}><line x1={left} x2={width - right} y1={y(tick, 5)} y2={y(tick, 5)} /><text x={left - 8} y={y(tick, 5) + 3}>{tick}</text></g>)}
      {[0, 2, 4, 6, 8, 10].map((tick) => <text className="trend-rpe-axis" key={`rpe-${tick}`} x={width - right + 8} y={y(tick, 10) + 3}>{tick}</text>)}
      {visible.swimMeterScale && [0, 1, 2, 3, 4, 5].map((tick) => <text key={`meter-${tick}`} x={width - right + 30} y={y(tick, 5) + 3}>{(tick / 5 * meterScaleMax).toLocaleString('sv-SE', { maximumFractionDigits: 1 })}k m</text>)}
      {items.map((item, index) => item.competition && <g key={`competition-${item.date}-${index}`} className="trend-competition-marker" role="button" tabIndex="0" aria-label={`Tävlingsdag ${new Date(`${item.date}T12:00:00`).toLocaleDateString('sv-SE')}${item.competitionReportDelayDays > 0 ? `, återkoppling registrerad ${item.competitionReportDelayDays} dagar senare` : ''}`} onMouseEnter={() => setHoverIndex(index)} onMouseLeave={() => setHoverIndex(null)} onFocus={() => setHoverIndex(index)} onBlur={() => setHoverIndex(null)} onClick={() => setHoverIndex((current) => current === index ? null : index)}><rect x={dayX(item.date) - dayWidth / 2} y={top} width={dayWidth} height={chartHeight} fill="rgba(240, 180, 91, 0.18)" /><circle cx={x(index)} cy={top + 8} r="5" fill="#bd7412" /><title>{`Tävlingsdag${item.competitionReportDelayDays > 0 ? ` · återkoppling registrerad ${item.competitionReportDelayDays} dagar senare` : ''}`}</title></g>)}
      {metrics.map((metric) => lineSegments(metric).map((segment, segmentIndex) => <path key={`${metric.key}-${segmentIndex}`} className={`trend-line-${metric.key}`} d={smoothTrendPath(segment.map((point) => ({ x: x(point.index), y: y(point.value, metric.max) })))} fill="none" stroke={metric.color} strokeDasharray={metric.dashed ? '7 5' : undefined} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />))}
      {metrics.map((metric) => visible[metric.key] && items.map((item, index) => hasTrendValue(item[metric.key]) ? <circle key={`${metric.key}-${index}`} className={`trend-dot-${metric.key}`} cx={x(index)} cy={y(Number(item[metric.key]), metric.max)} r="4" fill={metric.color} onMouseEnter={() => setHoverIndex(index)} onMouseLeave={() => setHoverIndex(null)} /> : null))}
      {dateLayout.labels.map((label) => <text className="trend-x-label" key={label.date} x={dayX(label.date)} y={height - 10}>{new Date(`${label.date}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</text>)}
    </svg></div>
    {hoverIndex != null && <div className="trend-hover-card"><strong>{new Date(`${items[hoverIndex].date}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</strong>{metrics.filter((metric) => visible[metric.key]).map((metric) => hasTrendValue(items[hoverIndex][metric.key]) && <span key={metric.key}><i style={{ background: metric.color }} />{metric.dashed ? `Simmeter: ${items[hoverIndex].swimMeters.toLocaleString('sv-SE')} m · ${items[hoverIndex].swimMeterSource}` : `${metric.label}: ${items[hoverIndex][metric.key]}`}</span>)}{items[hoverIndex].competition && <span className="trend-competition-detail"><i style={{ background: '#bd7412' }} />Tävlingsdag{items[hoverIndex].competitionReportDelayDays > 0 ? ` · återkoppling registrerad ${items[hoverIndex].competitionReportDelayDays} dagar senare` : ''}</span>}</div>}
    <p className="trend-curve-note">Punkterna visar registrerade värden; linjen är bara en visuell förbindelse. Vänster skala: skattningar 0–5. Höger: RPE 0–10 och simmeter i tusental (1k m = 1 000 m). Streckad linje: rapporterade simmeter per dag, annars uppskattade planerade meter från kopplade registrerade simpass. Saknade värden visas som luckor, inte noll. Gul markering visar en tävlingsincheckning; återkoppling utan RPE eller passbetyg lämnas tom. {meterScaleMax > 10 && 'Meterskalan har utökats för dagar över 10 000 m.'}</p>
    <div className="trend-line-legend">{metrics.map((metric) => <span key={metric.key}><i style={{ background: metric.color }} />{metric.label}</span>)}{items.some((item) => item.competition) && <span><i style={{ background: '#bd7412' }} />Tävlingsdag</span>}</div>
    <TrainingMeterChart items={items} />
    <TrainingVolumeChart items={items} />
    <div className="trend-pass-list">{items.map((item, index) => <article key={`${item.date}-${index}`}><strong>{new Date(`${item.date}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</strong><span>{item.title}{item.mixedActivities && ' · Flera aktivitetstyper – passvärden visas separat'}{item.focus ? ` · ${item.focus}` : ''}{item.sessionSlots?.length ? ` · ${item.sessionSlots.map((slot) => slotLabels[slot] || slot).join(' + ')}` : ''}</span><small>{[item.durationMinutes != null && `${item.durationMinutes} min`, `${item.count} svar`].filter(Boolean).join(' · ')}</small>{item.activities?.map((activity, activityIndex) => <div className="trend-activity-note" key={activityIndex}><b>{activity.type ? activityLabel(activity.type) : 'Äldre svar · aktivitetstyp saknas'}</b><small>{activity.distanceMeters != null ? `${activity.type === 'swim' ? Number(activity.distanceMeters).toLocaleString('sv-SE') + ' m' : activity.type ? (Number(activity.distanceMeters) / 1000).toLocaleString('sv-SE') + ' km' : 'Rapporterad distans'}${activity.minutes != null ? ' · ' : ''}` : ''}{activity.minutes != null && `${activity.minutes} min`}</small>{activity.rpe != null && <small>RPE {activity.rpe}/10</small>}{activity.comment && <p>{activity.comment}</p>}</div>)}</article>)}</div>
  </div>
}

function GroupTrendIndicator({ trend, personal = false }) {
  if (!trend) return null
  const heading = personal ? 'Simmarens riktning' : 'Gruppens riktning'
  const directionHelp = personal ? 'Jämför simmarens skattade känsla och kropp med föregående lika långa period. Minst tre dagar med giltiga värden krävs i båda perioderna. Varje dag väger lika. Gränsen för förändring är 0,2 på skalan 1–5.' : HELP_TEXT['Gruppens riktning']
  const states = {
    up: { arrow: '↗', title: 'Träningsläget förbättras', label: 'Ökar' },
    down: { arrow: '↘', title: 'Träningsläget har sjunkit', label: 'Minskar' },
    steady: { arrow: '→', title: 'Träningsläget är stabilt', label: 'Stabilt' },
    mixed: { arrow: '↕', title: 'Blandad utveckling', label: 'Blandat' },
    insufficient: { arrow: '—', title: 'För lite underlag', label: 'För lite underlag' },
  }
  const state = states[trend.state] || states.insufficient
  const continuity = trend.continuity
  const continuityState = states[continuity.state] || states.insufficient
  const volume = trend.volume
  const metersState = states[volume?.meters?.state] || states.insufficient
  const minutesState = states[volume?.minutes?.state] || states.insufficient
  const number = (value) => value == null ? '–' : value.toLocaleString('sv-SE', { maximumFractionDigits: 2 })
  const whole = (value) => value == null ? '–' : Math.round(value).toLocaleString('sv-SE')
  const percent = (value) => value == null ? 'nytt underlag' : `${value > 0 ? '+' : ''}${value} %`
  const delta = (value) => value == null ? 'För lite underlag' : `${value > 0 ? '+' : ''}${number(value)}`
  const date = (value) => new Date(`${value}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
  const lastDay = (value) => { const day = new Date(`${value}T12:00:00`); day.setDate(day.getDate() - 1); return date(dateKey(day)) }
  return <section className={`group-trend-indicator trend-state-${trend.state}`} aria-label={`${heading} för vald period`}>
    <div className="group-trend-heading">
      <span className="group-trend-direction" tabIndex="0" title={directionHelp} aria-label={`${state.label}. ${directionHelp}`}>{state.arrow}</span>
      <div><p className="eyebrow">{heading} <HelpTip term={heading} /></p><h3>{state.title}</h3><p>{date(trend.periods.start)}–{lastDay(trend.periods.end)} jämfört med {date(trend.periods.previousStart)}–{lastDay(trend.periods.previousEnd)}</p></div>
    </div>
    <div className="group-trend-values">
      <div><span>Känsla <HelpTip term={personal ? 'Simmarens förändring i känsla' : 'Förändring i känsla'} /></span><strong title={HELP_TEXT[personal ? 'Simmarens förändring i känsla' : 'Förändring i känsla']}>{delta(trend.changes.feeling)}</strong><small>{number(trend.previous.metrics.feeling.value)} → {number(trend.current.metrics.feeling.value)} av 5</small></div>
      <div><span>Kroppen <HelpTip term={personal ? 'Simmarens förändring i kroppen' : 'Förändring i kroppen'} /></span><strong title={HELP_TEXT[personal ? 'Simmarens förändring i kroppen' : 'Förändring i kroppen']}>{delta(trend.changes.body)}</strong><small>{number(trend.previous.metrics.body.value)} → {number(trend.current.metrics.body.value)} av 5</small></div>
      <div className={`group-trend-continuity trend-state-${continuity.state}`}><span>Kontinuitet <HelpTip term={personal ? 'Simmarens kontinuitet' : 'Gruppens kontinuitet'} /></span><strong tabIndex="0" title={HELP_TEXT[personal ? 'Simmarens kontinuitet' : 'Gruppens kontinuitet']} aria-label={`${continuityState.label}. ${HELP_TEXT[personal ? 'Simmarens kontinuitet' : 'Gruppens kontinuitet']}`}><span aria-hidden="true">{continuityState.arrow} </span>{continuityState.label}</strong><small>{continuity.state === 'insufficient' ? 'Fler registrerade pass behövs' : `${number(continuity.previous)} → ${number(continuity.current)} pass / simmare / vecka`}</small></div>
    </div>
    {volume && <div className="group-trend-volume">
      <div className={`group-trend-volume-card trend-state-${volume.meters.state}`}><span>Planerade simmeter i gruppen <HelpTip term="Simmeter i Grupptrend" /></span><strong tabIndex="0" title={HELP_TEXT['Simmeter i Grupptrend']}><b aria-hidden="true">{metersState.arrow}</b> {whole(volume.current.metersPerWeek)} m</strong><small>{volume.meters.state === 'insufficient' ? 'Ingen planeringsdata för jämförelseperioderna' : `${whole(volume.previous.metersPerWeek)} → ${whole(volume.current.metersPerWeek)} m / vecka · ${percent(volume.meters.percent)}`}</small></div>
      <div className={`group-trend-volume-card trend-state-${volume.minutes.state}`}><span>Planerad träningstid i gruppen <HelpTip term="Total träningstid i Grupptrend" /></span><strong tabIndex="0" title={HELP_TEXT['Total träningstid i Grupptrend']}><b aria-hidden="true">{minutesState.arrow}</b> {whole(volume.current.minutesPerWeek)} min</strong><small>{volume.minutes.state === 'insufficient' ? 'Ingen planeringsdata för jämförelseperioderna' : `${whole(volume.previous.minutesPerWeek)} → ${whole(volume.current.minutesPerWeek)} min / vecka · ${percent(volume.minutes.percent)}`}</small></div>
      <details className="group-trend-volume-breakdown"><summary>Visa tidsfördelning <HelpTip term="Träningstidens uppdelning" /></summary><p>Vald period · gruppens planerade minuter per vecka</p><div><span>🏊 Simning <strong>{whole(volume.current.minutesByType.swim)} min</strong></span><span>🏋️ Gym <strong>{whole(volume.current.minutesByType.strength)} min</strong></span><span>🤸 Land <strong>{whole(volume.current.minutesByType.dryland)} min</strong></span></div><p>Föregående period · gruppens planerade minuter per vecka</p><div><span>🏊 Simning <strong>{whole(volume.previous.minutesByType.swim)} min</strong></span><span>🏋️ Gym <strong>{whole(volume.previous.minutesByType.strength)} min</strong></span><span>🤸 Land <strong>{whole(volume.previous.minutesByType.dryland)} min</strong></span></div><small>Summan hämtas direkt från planeringen och räknar varje aktivitet en gång. Träningsloggen visar individuell registrering separat.</small><small>Loggens genomsnitt för simmeter per simmare: {whole(volume.registered.current.metersPerSwimmerWeek)} m denna period, {whole(volume.registered.previous.metersPerSwimmerWeek)} m föregående period.</small></details>
    </div>}
    <details className="group-trend-explanation"><summary>Så läser du riktningen <span aria-hidden="true">⌄</span></summary>
      {personal ? <div><p>{directionHelp}</p><p>↗ förbättring, → stabilt, ↘ minskning och ↕ blandad utveckling. Om känsla och kropp går åt motsatta håll visas blandad utveckling.</p><p>Underlag: känsla {trend.current.metrics.feeling.days} / {trend.previous.metrics.feeling.days} dagar, kropp {trend.current.metrics.body.days} / {trend.previous.metrics.body.days} dagar (vald / föregående period).</p><p>Kontinuitet: {continuity.currentPasses} mot {continuity.previousPasses} registrerade simpass. Antalet räknas om till pass per vecka; mer träning är inte automatiskt bättre.</p>{trend.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : <div><p>Varje dags genomsnitt väger lika. En förändring på minst 0,2 på skalan 1–5 ger en riktning. Om känsla och kropp förändras åt motsatta håll visas blandad utveckling.</p>
        <p>Varje skattning behöver minst sex giltiga svar i båda perioderna, normalt över minst två dagar. Underlaget ska omfatta minst tre profilkopplade simmare eller sex anonyma svar. En enskild dag kräver också minst sex svar.</p>
        <p>Vald period: {trend.current.responses} svar, varav {trend.current.anonymousResponses} anonyma och {trend.current.linkedSwimmers} profilkopplade simmare. Föregående period: {trend.previous.responses} svar, varav {trend.previous.anonymousResponses} anonyma och {trend.previous.linkedSwimmers} profilkopplade simmare.</p>
        <p>Kontinuitet: {continuity.currentPasses} mot {continuity.previousPasses} registrerade simpass för samma {continuity.swimmers} simmare. Antalet normaliseras per vecka. Skillnader under 0,15 pass per simmare och vecka visas som stabila. Mer träning behöver bedömas mot gruppens planering.</p>
        <p>Volympilarna jämför gruppens planerade simmeter och träningstid per vecka. Förändringar inom ±5 % visas som stabila. Ökad planerad mängd betyder inte automatiskt bättre utveckling; volymen påverkar inte huvudriktningen för känsla och kropp.</p>
        <p>Meter och minuter summeras direkt från planeringen, inklusive simning, styrketräning och landträning. Länkade aktiviteter räknas bara en gång. Värdena beskriver planerad mängd för gruppen, inte faktisk individuell träning. I tidsfördelningen visas även träningsloggens genomsnitt per simmare som ett separat mått.</p>
        {trend.warnings.map((warning) => <p className="group-trend-warning" key={warning}>{warning}</p>)}
      </div>}
    </details>
    {trend.warnings.length > 0 && <p className="group-trend-caveat">Det finns information om underlaget – öppna förklaringen för detaljer.</p>}
  </section>
}

function AnalysisDashboard({ code, profile, pointInfo, onBack, selfView = false, aiEnabled = true, groupProfiles, includeAnonymous = true }) {
  const [period, setPeriod] = useState('7')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [aiInsight, setAiInsight] = useState(null)
  const [aiCreatedAt, setAiCreatedAt] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [trainingContext, setTrainingContext] = useState({ phase: 'normal', minVolume: 30000, maxVolume: 40000 })
  const groupProfileIds = groupProfiles?.map((item) => item.id).sort().join(',')
  useEffect(() => {
    let cancelled = false
    setData(null); setError(''); setAiInsight(null); setAiCreatedAt(null)
    const range = analysisRange(period)
    if (!profile) {
      const days = Math.round((new Date(`${dateKey(range.end)}T12:00:00Z`) - new Date(`${dateKey(range.start)}T12:00:00Z`)) / 86400000)
      range.previousEnd = new Date(range.start)
      range.previousStart = new Date(range.start); range.previousStart.setDate(range.previousStart.getDate() - days)
    }
    const query = new URLSearchParams({ start: range.start.toISOString(), end: range.end.toISOString(), previousStart: range.previousStart.toISOString(), previousEnd: (range.previousEnd || range.start).toISOString() })
    query.set('period', period)
    if (profile) query.set('profileId', profile.id)
    else if (groupProfileIds !== undefined) { query.set('profileIds', groupProfileIds); query.set('includeAnonymous', String(includeAnonymous)) }
    apiRequest(`/api/analytics?${query}`, code).then((nextData) => { if (cancelled) return; const safeData = { ...nextData, current: nextData.current || {}, previous: nextData.previous || {}, trend: Array.isArray(nextData.trend) ? nextData.trend : [], workoutAnalysis: nextData.workoutAnalysis || { focuses: [], workload: [] } }; setData(safeData); setAiInsight(safeData.savedInsight?.insight || null); setAiCreatedAt(safeData.savedInsight?.created_at || null) }).catch((nextError) => { if (!cancelled) setError(nextError.message) })
    return () => { cancelled = true }
  }, [code, profile?.id, period, groupProfileIds, includeAnonymous])
  useEffect(() => {
    if (!data) return undefined
    const card = document.querySelector('.trend-card'); if (!card || card.querySelector('.trend-controls')) return undefined
    const controls = document.createElement('div'); controls.className = 'trend-controls'; controls.innerHTML = '<span>Visa:</span>';
    [['feeling', 'Känsla'], ['body', 'Kropp'], ['rpe', 'RPE'], ['speed', 'Fartkänsla'], ['pass', 'Passet']].forEach(([key, label]) => { const item = document.createElement('label'); const input = document.createElement('input'); input.type = 'checkbox'; input.checked = true; input.addEventListener('change', () => card.classList.toggle(`hide-trend-${key}`, !input.checked)); item.append(input, ` ${label}`); controls.append(item) })
    card.insertBefore(controls, card.firstChild)
    return () => controls.remove()
  }, [data])
  const change = (key) => {
    if (!data?.current || !data?.previous || data.current[key] == null || data.previous[key] == null) return null
    return Number((data.current[key] - data.previous[key]).toFixed(1))
  }
  const createAiInsight = async ({ customInstructions = '', guardrailOverrides = '' } = {}) => {
    if (!data || aiLoading) return
    setAiLoading(true); setAiError('')
    try {
      const label = ANALYSIS_PERIODS.find((item) => item.key === period)?.label || 'vald period'
      const result = await apiRequest('/api/analytics', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ai-insights', periodLabel: label, period, profileId: profile?.id, trainingContext: selfView ? null : trainingContext, customInstructions, guardrailOverrides, data }) })
      setAiInsight(result.insight); setAiCreatedAt(result.createdAt)
    } catch (nextError) { setAiError(nextError.message) } finally { setAiLoading(false) }
  }
  const Metric = ({ title, metric, suffix = '', note }) => { const delta = change(metric); const value = data.current[metric]; return <><article className="analysis-metric"><span>{title} <HelpTip term={title} /></span><strong>{value == null ? '–' : `${value}${suffix}`}</strong>{delta != null && delta !== 0 ? <small className={delta > 0 ? 'up' : 'down'}>{delta > 0 ? '↑' : '↓'} {Math.abs(delta)} mot förra perioden</small> : <small>{note || 'Oförändrat mot förra perioden'}</small>}</article>{metric === 'checkins' && <><WorkoutTrendAnalysis analysis={data.workoutAnalysis} />{!selfView && (!profile || profile.aiAnalysisStatus === 'approved') && <AiInsightCard title={profile ? `AI-analys: ${profile.displayName}` : 'Veckans tränarsammanfattning'} insight={aiInsight} createdAt={aiCreatedAt} loading={aiLoading} error={aiError} onGenerate={createAiInsight} profileSpecific={Boolean(profile && !selfView)} />}{!selfView && profile && profile.aiAnalysisStatus !== 'approved' && <section className="ai-insight-card swimmer-ai-locked"><p className="eyebrow">Personlig AI-analys</p><h2>{profile.aiAnalysisStatus === 'pending' ? 'Godkännande inväntas' : 'Inte aktiverad'}</h2><p>Registrera vårdnadshavarens godkännande under Profilinställningar → AI-stöd på simmarkortet innan du skapar en analys. Ingen personlig analys skapas eller visas för simmaren innan dess.</p></section>}{selfView && profile?.aiAnalysisStatus === 'approved' && <AiInsightCard title="Min personliga analys" insight={aiInsight} createdAt={aiCreatedAt} swimmerView />}{selfView && profile?.aiAnalysisStatus !== 'approved' && <section className="ai-insight-card swimmer-ai-locked"><p className="eyebrow">Personlig analys</p><h2>Inte aktiverad ännu</h2><p>Tränaren kan aktivera en personlig sammanfattning efter godkännande från vårdnadshavare.</p></section>}{profile && !selfView && <GoalCompliance data={data} code={code} profile={profile} />}</>}</> }
  const swimGoal = data?.goalProgress || data?.currentWeekGoal
  const strengthGoal = data?.crossProgress?.strength || data?.currentCrossGoals?.strength
  const drylandGoal = data?.crossProgress?.dryland || data?.currentCrossGoals?.dryland
  const goalNote = (goal) => goal ? `Mål ${goal.expected ?? goal.target} · ${goal.percentage}%` : 'Inget mål för perioden'
  return <section className="analysis-dashboard">{onBack && <button className="back-button inline" onClick={onBack}>← Alla simmare</button>}<div className="period-heading"><div><p className="eyebrow">{profile ? 'Endast svar kopplade till profilen' : 'Anonym sammanställning på gruppnivå'}</p><h2>{profile ? `${profile.emoji} ${profile.displayName}` : 'Gruppens utveckling'}</h2></div>{profile && pointInfo && <PointProgress info={pointInfo} compact />}</div><nav className="analysis-periods">{ANALYSIS_PERIODS.map((item) => <button className={period === item.key ? 'active' : ''} key={item.key} onClick={() => setPeriod(item.key)}>{item.label}</button>)}</nav>{error ? <p className="form-error">{error}</p> : !data ? <section className="empty-period"><span>≈</span><h2>Hämtar statistik…</h2></section> : <>{!selfView && <GroupTrendIndicator trend={profile ? data.swimmerTrend : data.groupTrend} personal={Boolean(profile)} />}<div className="analysis-metrics"><Metric title="Incheckningar" metric="checkins" /><Metric title="Aktiva dagar" metric="activeDays" /><Metric title="Sjukdagar" metric="sickDays" /><Metric title="Vilodagar" metric="restDays" /><Metric title="Känsla" metric="feeling" suffix="/5" /><Metric title="Kroppen" metric="body" suffix="/5" /><Metric title="RPE" metric="rpe" suffix="/10" /><Metric title="Fartkänsla" metric="speedFeeling" suffix="/5" /><Metric title="Passet" metric="passRating" suffix="/5" /> <Metric title="Personbästa" metric="personalBests" note="Nya Tempus-resultat" /></div>{data.privacyLimited && <p className="privacy-limit">🔒 Minst tre gruppsvar behövs för att visa genomsnitt.</p>}<div className="analysis-columns"><section className="coach-card trend-card"><p className="eyebrow">Över tid</p><h2>Träningsupplevelsen över tid</h2>{data.trend.length ? <div className="trend-bars">{data.trend.map((item) => <div key={item.date}><div><i className="feeling-bar" style={{ height: `${(item.feeling || 0) * 18}%` }} title={`Känsla ${item.feeling ?? 'dold'}`} /><i className="body-bar" style={{ height: `${(item.body || 0) * 18}%` }} title={`Kropp ${item.body ?? 'dold'}`} /><i className="rpe-bar" style={{ height: `${(item.rpe || 0) * 9}%` }} title={`RPE ${item.rpe ?? 'dold'}`} /><i className="speed-bar" style={{ height: `${(item.speedFeeling || 0) * 18}%` }} title={`Fartkänsla ${item.speedFeeling ?? 'dold'}`} /><i className="pass-bar" style={{ height: `${(item.passRating || 0) * 18}%` }} title={`Passet ${item.passRating ?? 'dold'}`} /></div><small>{new Date(`${item.date}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</small><b>{item.count}</b></div>)}</div> : <p className="empty">Ingen data under perioden.</p>}<div className="chart-legend"><span><i className="legend-feeling" /> Känsla</span><span><i className="legend-body" /> Kropp</span><span><i className="legend-rpe" /> RPE</span><span><i className="legend-speed" /> Fartkänsla</span><span><i className="legend-pass" /> Passet</span></div></section><section className="coach-card training-summary"><p className="eyebrow">Registrerad träning</p><h2>Genomförda pass</h2><div><p><span>🏊</span><strong>{data.current.swimSessions}</strong><small>Simpass</small><em>{goalNote(swimGoal)}</em></p><p><span>🏋️</span><strong>{data.current.strengthSessions}</strong><small>Styrkepass</small><em>{goalNote(strengthGoal)}</em></p><p><span>🤸</span><strong>{data.current.drylandSessions}</strong><small>Landpass</small><em>{goalNote(drylandGoal)}</em></p></div></section></div>{profile && <section className="coach-card analysis-comments"><p className="eyebrow">Profilsvar</p><h2>Kommentarer under perioden</h2>{data.recent.length ? data.recent.map((item) => <blockquote key={`${item.date}-${item.comment}`}>{FEELINGS[item.feeling - 1]?.emoji} “{item.comment}” <small>{new Date(item.date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</small></blockquote>) : <p className="empty">Inga profilkopplade kommentarer under perioden.</p>}</section>}</>}</section>
}

function AiAnalysisPeriod({ insight }) {
  if (!insight?.periodLabel) return null
  const start = new Date(`${insight.period?.start}T12:00:00Z`), end = new Date(`${insight.period?.endExclusive}T12:00:00Z`)
  end.setUTCDate(end.getUTCDate() - 1)
  const format = (date) => date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Stockholm' })
  return <small className="ai-analysis-period">{insight.periodLabel}{Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) ? ` · ${format(start)}–${format(end)}` : ''}</small>
}

function AiDeepFindings({ insight, swimmerView = false }) {
  if (!insight.findings?.length) return null
  const sourceLabels = { checkin: 'Check-in', workout: 'Passunderlag', coach_note: 'Tränarobservation', strength: 'Styrkelogg', competition: 'Tävlingsresultat' }
  const supportLabels = { limited: 'Begränsat underlag', moderate: 'Visst stöd', strong: 'Tydligt återkommande stöd' }
  return <details className="ai-deep-findings"><summary>Fördjupning · {insight.findings.length} fynd <span>Belägg och uppföljning</span></summary><div className="ai-finding-list">{insight.findings.map((finding, index) => <article key={`${index}-${finding.title}`}><div className="ai-finding-heading"><h3>{finding.title}</h3><span>{finding.kind === 'pattern' ? supportLabels[finding.confidence] || 'Begränsat underlag' : 'Enskild observation'}</span></div><p>{finding.observation}</p>{finding.hypothesis && <div><strong>Möjlig förklaring</strong><p>{finding.hypothesis}</p></div>}{finding.alternativeExplanation && <div><strong>Alternativ att överväga</strong><p>{finding.alternativeExplanation}</p></div>}<details className="ai-finding-evidence"><summary>Visa belägg · {finding.evidence?.length || 0} källor</summary><ul>{(finding.evidence || []).map((row) => <li key={row.id}><strong>{row.date} · {sourceLabels[row.source] || 'Underlag'}</strong><p>{swimmerView && row.source === 'coach_note' ? 'Tränarens dokumenterade observation.' : row.text}</p></li>)}</ul></details>{finding.followUp && <div className="ai-finding-followup"><strong>Följ upp</strong><p>{finding.followUp}</p></div>}</article>)}</div></details>
}

function LegacyAiInsightCard({ title = 'Veckans tränarsammanfattning', insight, createdAt, loading, error, onGenerate, swimmerView = false, profileSpecific = false }) {
  if (title === 'Veckans tränarsammanfattning') title = 'Tränarsammanfattning för vald period'
  const [expanded, setExpanded] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [guardrailOverrides, setGuardrailOverrides] = useState('')
  return <section className={`ai-insight-card${expanded ? ' expanded' : ''}`}><div className="ai-insight-header"><div><p className="eyebrow">{swimmerView ? 'Din personliga analys' : 'AI-stöd för tränaren'}</p><h2>{title}</h2><AiAnalysisPeriod insight={insight} />{createdAt && <small>Senast skapad {new Date(createdAt).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' })}</small>}</div><div className="ai-insight-actions">{insight && <button type="button" className="ai-expand-button" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Minimera ↑' : 'Visa hela analysen ↓'}</button>}{onGenerate && <button className={`secondary-button${loading ? ' ai-working' : ''}`} onClick={() => onGenerate({ customInstructions: customPrompt, guardrailOverrides })} disabled={loading}>{loading ? 'Analyserar…' : profileSpecific ? (insight ? 'Uppdatera analys för simmaren' : 'Skapa analys för simmaren') : insight ? 'Skapa ny analys' : 'Skapa analys'}</button>}</div></div>{profileSpecific && onGenerate && <p className="settings-help">Analysen tar med simmarens svar och kommentarer, tränings- och styrkeloggar, tävlingsresultat, mål och personliga tränaranteckningar för perioden. Äldre data sammanfattas. Privata meddelanden och andra simmares uppgifter ingår inte. Analysen skapas först när tränaren väljer knappen ovan; det kan använda AI-kvoten.</p>}{onGenerate && <><details className="ai-prompt-editor"><summary>🎛️ Anpassa analysens instruktion</summary><p>Beskriv vad tränaren vill att modellen fokuserar extra på.</p><textarea maxLength={2000} value={customPrompt} onChange={(event) => setCustomPrompt(event.target.value)} placeholder="Exempel: Fokusera extra på om lägre mängd verkar sammanfalla med bättre fartkänsla inför tävlingen." /></details><details className="ai-prompt-editor ai-guardrail-editor"><summary>⚙️ Redigera tillfälliga skyddsregler</summary><p>Dessa regler ersätter analysens mjuka standardinstruktioner för nästa körning och sparas inte. Tekniska minimikrav för säkerhet, dataskydd och giltig JSON ligger alltid kvar i backend.</p><textarea maxLength={2000} value={guardrailOverrides} onChange={(event) => setGuardrailOverrides(event.target.value)} placeholder="Exempel: Skriv ett längre resonemang, jämför senaste tre passen och prioritera fartkänsla." /></details></>}{error && <p className="form-error">{error}</p>}{insight ? <div className="ai-insight-body"><p>{insight.summary}</p>{insight.positives?.length > 0 && <div><strong>Det ser bra ut</strong>{insight.positives.map((item) => <span key={item}>✓ {item}</span>)}</div>}{insight.attention?.length > 0 && <div><strong>Följ upp</strong>{insight.attention.map((item) => <span key={item}>! {item}</span>)}</div>}{insight.limitations?.length > 0 && <small>Begränsningar: {insight.limitations.join(' · ')}</small>}</div> : <p className="ai-insight-empty">Ingen sparad analys för den valda perioden ännu.</p>}{insight && <AiDeepFindings insight={insight} swimmerView={swimmerView} />}</section>
}

const DEFAULT_AI_PROMPT_DISPLAY = `Du är ett försiktigt och noggrant analysstöd för simtränare. Analysera endast den data som skickas med och skriv på svenska.

• Beskriv datagrundens storlek, periodens volym och antal pass.
• Leta efter riktning över tid och jämför tidigare och senaste del av perioden.
• Jämför passinriktning med upplevd känsla, kropp, RPE, fartkänsla, temperatur och passbetyg.
• Beskriv möjliga samband som hypoteser – skriv ”samvarierar med” eller ”kan vara värt att undersöka”, aldrig ”beror på” utan tydligt stöd.
• Sjukdagar och vilodagar ska beskrivas neutralt. Dra aldrig medicinska slutsatser.
• Om underlaget är litet eller saknar svar ska det anges tydligt.
• Hitta inte på orsaker, värden, träningspass eller rekommendationer som inte stöds av underlaget.
• Tränarens dokumentation får användas som kontext, men observationer och tolkningar ska hållas isär.
• I personlig analys: leta efter positiva motexempel och skillnader mellan likvärdiga pass. Skilj en stark enskild prestation från återkommande mönster.
• Redovisa belägg med datum, möjliga och alternativa förklaringar samt konkret uppföljning i en fördjupning.
• Koppla inte samma dagsvar till både morgon- och eftermiddagspass. Oklara passkopplingar ska redovisas.
• Returnera en kort, konkret och evidensnära sammanfattning på svenska.`

function AiInsightCard(props) {
  return <div className="ai-insight-with-prompt"><LegacyAiInsightCard {...props} />{props.onGenerate && <details className="ai-prompt-editor ai-default-prompt"><summary>👁 Visa standardprompt</summary><p>Detta är grundinstruktionerna. Periodens statistik, träningspass, dokumentation och eventuella extra instruktioner läggs till separat när analysen skapas.</p><pre>{DEFAULT_AI_PROMPT_DISPLAY}</pre></details>}</div>
}

function CoachGroups({ code, profiles, onProfilesChange }) {
  const [groups, setGroups] = useState([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = () => { setLoading(true); apiRequest('/api/profiles?groups=true', code).then((data) => setGroups(data.groups || [])).catch((err) => setError(err.message || 'Kunde inte hämta grupper.')).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [code])
  const mutate = async (body) => { setError(''); try { await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); load(); onProfilesChange?.() } catch (err) { setError(err.message || 'Något gick fel.') } }
  const create = async (event) => { event.preventDefault(); if (!newName.trim()) return; await mutate({ action: 'create-group', name: newName.trim() }); setNewName('') }
  const assign = (profileId, trainingGroup) => mutate({ action: 'set-training-group', profileId, trainingGroup: trainingGroup || null })
  const active = groups.filter((group) => group.active !== false)
  const archived = groups.filter((group) => group.active === false)
  const withoutGroup = profiles.filter((profile) => !profile.trainingGroup)
  return <section className="coach-groups"><div className="period-heading"><div><p className="eyebrow">Tränarverktyg</p><h1>Grupper</h1><small>Samla simmarna rätt och håll gruppindelningen uppdaterad.</small></div><div className="big-count"><strong>{active.length}</strong><span>aktiva grupper</span></div></div><form className="group-form coach-card" onSubmit={create}><div><h2>Lägg till grupp</h2><p>Skapa en grupp när ni startar en ny träningsgrupp.</p></div><div className="group-form-row"><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Exempel: Ungdom Orange" maxLength={80} /><button className="primary-button" type="submit">Skapa grupp</button></div></form>{error && <p className="form-error">{error}</p>}{loading ? <p className="empty">Hämtar grupper…</p> : <><div className="group-grid">{active.map((group) => { const members = profiles.filter((profile) => profile.trainingGroup === group.id); return <details className="group-card coach-card" key={group.id} open><summary><span><strong>{group.name}</strong><small>{members.length} {members.length === 1 ? 'simmare' : 'simmare'}</small></span><span>⌄</span></summary><div className="group-members">{members.length ? members.map((profile) => <div className="group-member" key={profile.id}><span className="profile-chip"><b>{profile.emoji}</b>{profile.displayName}</span><select aria-label={`Grupp för ${profile.displayName}`} value={profile.trainingGroup || ''} onChange={(event) => assign(profile.id, event.target.value)}><option value="">Utan grupp</option>{active.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>) : <p className="empty">Inga simmare i gruppen ännu.</p>}<button className="text-button danger-text" type="button" onClick={() => { if (window.confirm(`Arkivera ${group.name}?`)) mutate({ action: 'archive-group', id: group.id }) }}>Arkivera grupp</button></div></details> })}</div><section className="coach-card unassigned-card"><p className="eyebrow">Behöver placeras</p><h2>Profiler utan grupp</h2>{withoutGroup.length ? withoutGroup.map((profile) => <div className="group-member" key={profile.id}><span className="profile-chip"><b>{profile.emoji}</b>{profile.displayName}</span><select aria-label={`Välj grupp för ${profile.displayName}`} value="" onChange={(event) => assign(profile.id, event.target.value)}><option value="">Välj grupp…</option>{active.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></div>) : <p className="empty">Alla godkända profiler har en grupp ✓</p>}</section>{archived.length > 0 && <details className="coach-card archived-groups"><summary>Arkiverade grupper ({archived.length})</summary>{archived.map((group) => <span key={group.id}>{group.name}</span>)}</details>}</>}</section>
}

function AuditLogs({ code }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('all')
  useEffect(() => { apiRequest('/api/profiles?audit=true', code).then(setData).catch((nextError) => setError(nextError.message)) }, [code])
  if (error) return <EmptyPeriod title={error} periodLabel="Loggar" />
  if (!data) return <section className="empty-period"><span>◷</span><h2>Hämtar loggar…</h2></section>
  const eventLabels = { group_login: 'Gruppkod verifierad · profilinloggning krävs', group_code_verified: 'Gruppkod verifierad · profilinloggning krävs', profile_login: 'Simmare loggade in', coach_login: 'Tränare loggade in', coach_account_bootstrap: 'Första superadmin skapad', profile_approval: 'Profil godkänd', profile_rejection: 'Profil nekad', profile_access_change: 'Profilåtkomst ändrad', 'ai:trend_analysis': 'AI trendanalys' }
const aiFeatureLabels = { dryland_program_import: 'Importera landträningsprogram', goal_text_polish: 'Förbättra utvecklingsmål', strength_exercise_image: 'Skapa övningsbild', strength_program_import: 'Importera styrkeprogram', assistant_chat: 'Simkoll-assistenten', trend_analysis: 'Trendanalys', swimmer_note: 'Förbättra tränaranteckning', coach_summary: 'Tränarsammanfattning', audio_transcription: 'Ljudtranskribering', workout_text_polish: 'Förbättra passtext', workout_image_import: 'Tolka passbild', workout_import: 'Importera pass', workout_generation: 'Skapa passförslag', community_post: 'Förbättra klubbmeddelande', pep_moderation: 'Kontroll av eget peppmeddelande' }
  const swedishRegions = { AB: 'Stockholm', C: 'Uppsala', D: 'Södermanland', E: 'Östergötland', F: 'Jönköping', G: 'Kronoberg', H: 'Kalmar', I: 'Gotland', K: 'Blekinge', M: 'Skåne', N: 'Halland', O: 'Västra Götaland', S: 'Värmland', T: 'Örebro', U: 'Västmanland', W: 'Dalarna', X: 'Gävleborg', Y: 'Västernorrland', Z: 'Jämtland', AC: 'Västerbotten', BD: 'Norrbotten' }
  const countryNames = typeof Intl !== 'undefined' && Intl.DisplayNames ? new Intl.DisplayNames(['sv'], { type: 'region' }) : null
  const readableLocation = (location) => { if (!location) return ''; const country = location.country ? (countryNames?.of(location.country) || location.country) : ''; const region = location.country === 'SE' ? (swedishRegions[location.region] || location.region || '') : (location.region || ''); return [country, region].filter(Boolean).join(' · ') }
  const month = data.month || { calls: 0, totalTokens: 0, estimatedCostUsd: 0, tokenLimit: 0, byModel: [] }
  const money = (value) => value == null ? 'Pris saknas' : `${Number(value).toFixed(4).replace('.', ',')} USD`
  const periodBounds = () => { if (period === 'all') return { from: 0, to: Infinity }; const now = new Date(); const start = new Date(now); start.setHours(0, 0, 0, 0); if (period === 'today') { const end = new Date(start); end.setDate(end.getDate() + 1); return { from: start.getTime(), to: end.getTime() } } if (period === 'week') { const day = start.getDay() || 7; start.setDate(start.getDate() - day + 1); const end = new Date(start); end.setDate(end.getDate() + 7); return { from: start.getTime(), to: end.getTime() } } if (period === 'month') { start.setDate(1); const end = new Date(start); end.setMonth(end.getMonth() + 1); return { from: start.getTime(), to: end.getTime() } } start.setDate(1); start.setMonth(start.getMonth() - 1); const end = new Date(start); end.setMonth(end.getMonth() + 1); return { from: start.getTime(), to: end.getTime() } }
  const { from, to } = periodBounds()
  const inPeriod = (item) => { const timestamp = item.created_at ? new Date(item.created_at).getTime() : 0; return timestamp >= from && timestamp < to }
  const filteredLogs = data.logs.filter(inPeriod)
  const filteredAiUsage = data.aiUsage.filter(inPeriod)
  const filteredTotals = filteredAiUsage.reduce((sum, item) => ({ calls: sum.calls + 1, successful: sum.successful + (item.status === 'success' ? 1 : 0), promptTokens: sum.promptTokens + Number(item.prompt_tokens || 0), completionTokens: sum.completionTokens + Number(item.completion_tokens || 0), totalTokens: sum.totalTokens + Number(item.total_tokens || 0) }), { calls: 0, successful: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 })
  const periodByModel = Object.values(filteredAiUsage.reduce((all, item) => { const key = item.model || 'Okänd modell'; all[key] ||= { model: key, calls: 0, totalTokens: 0, estimatedCostUsd: 0, pricedCalls: 0 }; all[key].calls += 1; all[key].totalTokens += Number(item.total_tokens || 0); if (item.estimated_cost_usd != null) { all[key].estimatedCostUsd += Number(item.estimated_cost_usd); all[key].pricedCalls += 1 }; return all }, {})).sort((a, b) => b.totalTokens - a.totalTokens)
  const usageByUser = Object.values(filteredAiUsage.reduce((all, item) => { const key = item.actor_user_key || `unknown:${item.role || 'unknown'}`; all[key] ||= { key, name: item.actor_name || 'Användare · ej identifierad', role: item.actor_role || item.role || 'unknown', calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0, pricedCalls: 0, items: [] }; const user = all[key]; user.calls += 1; user.promptTokens += Number(item.prompt_tokens || 0); user.completionTokens += Number(item.completion_tokens || 0); user.totalTokens += Number(item.total_tokens || 0); if (item.estimated_cost_usd != null) { user.estimatedCostUsd += Number(item.estimated_cost_usd); user.pricedCalls += 1 }; user.items.push(item); return all }, {})).sort((a, b) => b.totalTokens - a.totalTokens)
  const periodCost = filteredAiUsage.reduce((sum, item) => sum + (item.estimated_cost_usd == null ? 0 : Number(item.estimated_cost_usd)), 0)
  const pricedPeriodCalls = filteredAiUsage.filter((item) => item.estimated_cost_usd != null).length
  const periodNames = { all: 'Totalt', today: 'Idag', week: 'Denna vecka', month: 'Denna månad', previousMonth: 'Förra månaden' }
  return <section className="audit-page"><div className="period-heading"><div><p className="eyebrow">Teknisk överblick</p><h1>Loggar</h1><small>Maskerade tekniska händelser och AI-användning. Råa IP-adresser visas endast för superadmin.</small></div><div className="big-count"><strong>{filteredLogs.length}</strong><span>{periodNames[period].toLowerCase()} händelser</span></div></div><section className="coach-card audit-period-filter"><p className="eyebrow">Visa loggar för</p><div className="audit-period-buttons">{Object.entries(periodNames).map(([value, label]) => <button type="button" className={period === value ? 'active' : ''} key={value} onClick={() => setPeriod(value)}>{label}</button>)}</div></section><section className="audit-stats"><Stat title="AI-anrop" value={filteredTotals.calls} note={`${filteredTotals.successful} lyckade`} /><Stat title="Totala tokens" value={filteredTotals.totalTokens.toLocaleString('sv-SE')} note={`${filteredTotals.promptTokens.toLocaleString('sv-SE')} in · ${filteredTotals.completionTokens.toLocaleString('sv-SE')} ut`} /><Stat title="Inloggningar" value={filteredLogs.filter((item) => item.event_type.includes('login')).length} note={`I ${periodNames[period].toLowerCase()}`} /></section><section className="coach-card audit-month"><div className="audit-month-heading"><div><p className="eyebrow">{periodNames[period]}</p><h2>AI-användning</h2></div><strong>{pricedPeriodCalls ? money(periodCost) : 'Pris saknas'}</strong></div><div className="audit-month-metrics"><span><b>{filteredTotals.totalTokens.toLocaleString('sv-SE')}</b>{period === 'month' && month.tokenLimit ? ` / ${month.tokenLimit.toLocaleString('sv-SE')}` : ''} tokens</span><span><b>{filteredTotals.calls}</b> anrop</span><small>Uppskattad tokenkostnad, inte faktureringsdata.{period === 'month' && month.tokenLimit ? ' Tokenstaket gäller från inställningarna.' : ''}</small></div>{periodByModel.length ? <div className="audit-model-list">{periodByModel.map((item) => <article key={item.model}><div><strong>{item.model}</strong><small>{item.calls} anrop · {item.totalTokens.toLocaleString('sv-SE')} tokens</small></div><span>{item.pricedCalls ? money(item.estimatedCostUsd) : 'Pris saknas'}</span></article>)}</div> : <p className="empty">Inga AI-anrop i vald period.</p>}</section><section className="coach-card audit-users"><h2>AI-anrop per användare</h2><p className="settings-help">Summering för vald period. Öppna en användare för att se modell och kostnad per anrop. Historiska anrop som saknar användar-ID visas separat.</p>{usageByUser.length ? <div className="audit-user-list">{usageByUser.map((user) => <details key={user.key}><summary><span><strong>{user.name}</strong><small>{user.role === 'swimmer' ? 'Simmare' : user.role === 'coach' ? 'Tränare' : 'Ej identifierad'} · {user.calls} anrop</small></span><span className="audit-user-totals"><b>{user.totalTokens.toLocaleString('sv-SE')} tokens</b><small>{user.pricedCalls ? money(user.estimatedCostUsd) : 'Pris saknas'}</small></span></summary><div className="audit-user-calls">{user.items.map((item) => <article key={item.id}><div><strong>{aiFeatureLabels[item.feature] || item.feature}</strong><small>{item.model || 'Okänd modell'} · {new Date(item.created_at).toLocaleString('sv-SE')} · {Number(item.prompt_tokens || 0).toLocaleString('sv-SE')} in / {Number(item.completion_tokens || 0).toLocaleString('sv-SE')} ut</small></div><span>{item.estimated_cost_usd != null ? money(item.estimated_cost_usd) : 'Pris saknas'}</span></article>)}</div></details>)}</div> : <p className="empty">Inga AI-anrop i vald period.</p>}</section><section className="coach-card audit-ai"><h2>AI-anrop · {periodNames[period].toLowerCase()}</h2>{filteredAiUsage.length ? <div className="audit-list">{filteredAiUsage.slice(0, 100).map((item) => <article key={item.id}><div><strong>{aiFeatureLabels[item.feature] || item.feature}</strong><small>{item.actor_name} · {item.model || 'Okänd modell'} · {new Date(item.created_at).toLocaleString('sv-SE')}</small></div><span className={item.status === 'success' ? 'audit-ok' : 'audit-fail'}>{item.status === 'success' ? (Number(item.total_tokens || 0) ? `${item.total_tokens.toLocaleString('sv-SE')} tokens` : 'Tokenmätning saknas') : 'Misslyckat'}</span></article>)}</div> : <p className="empty">Inga AI-anrop i vald period.</p>}</section><section className="coach-card audit-events"><h2>Händelser · {periodNames[period].toLowerCase()}</h2>{filteredLogs.length ? <div className="audit-list">{filteredLogs.map((item) => { const place = readableLocation(item.details?.location); const alias = item.details?.alias || item.details?.targetAlias || item.details?.actorName; const eventLabel = item.event_type === 'profile_login' && item.details?.login === 'remembered-session' ? 'Simmare loggade in (sparad profil)' : eventLabels[item.event_type] || item.event_type; const fingerprint = item.ip_hash ? ` · IP-fingerprint ${String(item.ip_hash).slice(0, 8)}` : ''; const action = item.event_type === 'profile_access_change' ? (item.details?.action === 'access-enabled' ? ' (åtkomst aktiverad)' : ' (åtkomst pausad)') : ''; return <article key={item.id}><div><strong>{alias ? `${alias} · ` : ''}{eventLabel}{action}</strong><small>{item.role === 'coach' ? 'Tränare' : item.role === 'swimmer' ? 'Simmare' : item.role || 'Okänd roll'} · {new Date(item.created_at).toLocaleString('sv-SE')}{place ? ` · ${place}` : ' · Region saknas'}{fingerprint}</small></div><span className={item.status === 'success' ? 'audit-ok' : 'audit-fail'}>{item.status === 'success' ? 'OK' : 'Fel'}</span></article> })}</div> : <p className="empty">Inga händelser i vald period.</p>}</section></section>
}

function CoachAppFeedback({ code, accountRole = 'coach' }) {
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('active')
  const [error, setError] = useState('')
  const superadmin = accountRole === 'superadmin'
  const load = () => apiRequest('/api/community?appFeedback=true', code).then(setData).catch(() => setData({ total: 0, comments: [], counts: {}, feedback: [] }))
  useEffect(() => { load() }, [code])
  const list = (values = {}) => Object.entries(values).sort((a, b) => b[1] - a[1])
  const labels = { checkin: 'Check-in', goals: 'Mina mål', games: 'Veckans spel', planning: 'Träningsplanering', messages: 'Pepp och meddelanden', speed: 'Snabbhet och enkelhet', design: 'Design och utseende', content: 'Innehåll', features: 'Funktioner', statistics: 'Mer statistik', other: 'Annat' }
  const post = (body) => apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const reset = async () => { if (!window.confirm('Nollställ all appfeedback? Detta går inte att ångra.')) return; await post({ action: 'reset-app-feedback' }); setData({ total: 0, comments: [], counts: {}, feedback: [] }) }
  const items = (data?.feedback || []).filter((item) => Boolean(item.archivedAt) === (tab === 'archive'))
  const send = async (body) => { setError(''); try { await post(body); await load() } catch (requestError) { setError(requestError.message || 'Kunde inte spara ändringen.') } }
  return <section className="app-feedback-page"><div className="period-heading"><div><p className="eyebrow">Tränarverktyg</p><h1>Hur kan vi göra Simkoll bättre?</h1><small>Samlad feedback från simmare och tränare.</small></div><div className="big-count"><strong>{data?.total || 0}</strong><span>svar</span></div></div><AppFeedbackCard code={code} coach />{data?.total ? <><section className="feedback-summary-grid"><article className="coach-card"><p className="eyebrow">Helhetskänsla</p><strong className="feedback-average">{data.averageRating} <small>/ 5</small></strong></article><article className="coach-card"><p className="eyebrow">Vanligast uppskattat</p>{list(data.counts?.bestAreas).slice(0, 3).map(([key, count]) => <p className="feedback-stat" key={key}><span>{labels[key] || key}</span><b>{count}</b></p>)}</article><article className="coach-card"><p className="eyebrow">Vanligast att förbättra</p>{list(data.counts?.improveAreas).slice(0, 3).map(([key, count]) => <p className="feedback-stat" key={key}><span>{labels[key] || key}</span><b>{count}</b></p>)}</article></section>{superadmin ? <section className="coach-card feedback-comments"><p className="eyebrow">Förslagslåda</p><h2>Tankar och önskemål</h2><div className="feedback-tabs"><button className={tab === 'active' ? 'is-active' : ''} onClick={() => setTab('active')}>Aktiva ({(data.feedback || []).filter((item) => !item.archivedAt).length})</button><button className={tab === 'archive' ? 'is-active' : ''} onClick={() => setTab('archive')}>Arkiv ({(data.feedback || []).filter((item) => item.archivedAt).length})</button></div>{error && <p className="form-error">{error}</p>}{items.length ? <div className="feedback-manage-list">{items.map((item) => <AppFeedbackManageItem key={item.id} item={item} archived={tab === 'archive'} onSave={send} />)}</div> : <p className="empty">{tab === 'archive' ? 'Arkivet är tomt.' : 'Inga aktiva förslag just nu.'}</p>}</section> : <section className="coach-card feedback-comments"><p className="eyebrow">Fritext</p><h2>Tankar och önskemål</h2>{data.comments?.length ? data.comments.map((item, index) => <blockquote key={`${item.createdAt}-${index}`}>“{item.comment}”<small>{new Date(item.createdAt).toLocaleDateString('sv-SE')}</small></blockquote>) : <p className="empty">Inga fritextsvar ännu.</p>}</section>}</> : <section className="coach-card empty-period"><span>💬</span><h2>Inga svar ännu</h2><p>När feedback börjar komma visas sammanställningen här.</p></section>}<button type="button" className="text-button danger-text" onClick={reset}>Nollställ appfeedback</button></section>
}

function AppFeedbackManageItem({ item, archived, onSave }) {
  const [status, setStatus] = useState(item.status || 'new')
  const [note, setNote] = useState(item.adminNote || '')
  const [reply, setReply] = useState('')
  const [saving, setSaving] = useState(false)
  const act = async (body) => { setSaving(true); try { await onSave({ id: item.id, ...body }) } finally { setSaving(false) } }
  const statusLabels = { new: 'Ny', in_progress: 'Pågår', completed: 'Klarmarkerad', not_implementing: 'Kommer inte implementeras' }
  return <article className="feedback-manage-item"><div className="feedback-manage-head"><div><strong>{item.profileEmoji ? `${item.profileEmoji} ` : ''}{item.profileName || (item.submittedByRole === 'coach' ? 'Tränare' : 'Simmare')}</strong><small>{new Date(item.createdAt).toLocaleString('sv-SE')} · {item.submittedByRole === 'coach' ? 'Tränare' : 'Simmare'}</small></div><span className={`feedback-status status-${item.status}`}>{statusLabels[item.status] || statusLabels.new}</span></div><blockquote>“{item.comment}”</blockquote>{item.rating && <small>Betyg: {item.rating}/5</small>}{item.featureRequest && <p><strong>Önskad funktion:</strong> {item.featureRequest}</p>}{item.adminNote && <p className="feedback-admin-note"><strong>Intern kommentar:</strong> {item.adminNote}</p>}{item.adminReply && <p className="feedback-admin-note"><strong>Skickat svar:</strong> {item.adminReply}</p>}{!archived && <><label className="feedback-admin-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="new">Ny</option><option value="in_progress">Pågår</option><option value="completed">Klarmarkerad</option><option value="not_implementing">Kommer inte implementeras</option></select></label><label className="feedback-admin-field"><span>Intern kommentar</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} placeholder="Syns bara för superadmin" /></label><button type="button" className="secondary-button" disabled={saving} onClick={() => act({ action: 'update-app-feedback', status, adminNote: note })}>{saving ? 'Sparar…' : 'Spara status och kommentar'}</button>{item.profileId && item.submittedByRole === 'swimmer' && <div className="feedback-reply"><label className="feedback-admin-field"><span>Meddelande till simmaren</span><textarea value={reply} onChange={(event) => setReply(event.target.value)} maxLength={1000} disabled={Boolean(item.adminReplySentAt)} placeholder="Skriv ett privat svar…" /></label>{item.adminReplySentAt ? <small>Svar skickat {new Date(item.adminReplySentAt).toLocaleString('sv-SE')}</small> : <button type="button" className="primary-button small" disabled={saving || !reply.trim()} onClick={() => act({ action: 'reply-app-feedback', content: reply })}>{saving ? 'Skickar…' : 'Skicka svar privat'}</button>}</div>}{['completed', 'not_implementing'].includes(status) && <button type="button" className="primary-button small" disabled={saving} onClick={() => act({ action: 'close-app-feedback', status, adminNote: note })}>{saving ? 'Arkiverar…' : status === 'completed' ? 'Klarmarkera och arkivera' : 'Avsluta utan implementering och arkivera'}</button>}</>}{archived && <button type="button" className="secondary-button" disabled={saving} onClick={() => act({ action: 'archive-app-feedback', archived: false })}>Återställ till aktiva</button>}</article>
}

function SwimOccasion({ occasion, children }) {
  if (occasion.items.length < 2) return children
  const morning = occasion.time ? Number(occasion.time.split(':')[0]) < 12 : occasion.timeOfDay === 'morning'
  return <section className="swim-occasion"><header><strong>{morning ? '🌅 Morgonträning' : '🌇 Eftermiddagsträning'} {occasion.time} · {occasion.items.length} passalternativ</strong><small>{occasion.location ? `${occasion.location} · ` : ''}Välj ett upplägg, mängderna läggs inte ihop.</small></header><div className="swim-occasion-options">{children}</div></section>
}

function amountRangeLabel(range) {
  return range.max ? range.min === range.max ? range.max.toLocaleString('sv-SE') : `${range.min.toLocaleString('sv-SE')}–${range.max.toLocaleString('sv-SE')}` : '–'
}

function CoachPlanning({ code, selectedGroups = ['ungdom_orange', 'ungdom_svart', 'junior'], availableGroups = [['ungdom_orange', 'Ungdom Orange'], ['ungdom_svart', 'Ungdom Svart'], ['junior', 'Junior']] }) {
  const [plans, setPlans] = useState([])
  const [workouts, setWorkouts] = useState([])
  const [cycles, setCycles] = useState([])
  const [cyclesAvailable, setCyclesAvailable] = useState(true)
  const [planningView, setPlanningView] = useState('week')
  const [cycleDraft, setCycleDraft] = useState(null)
  const [cycleSaving, setCycleSaving] = useState(false)
  const [cycleError, setCycleError] = useState('')
  const [sportAdminActivities, setSportAdminActivities] = useState([])
  const [workoutToEdit, setWorkoutToEdit] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [weekOffset, setWeekOffset] = useState(0)
  const [sportAdmin, setSportAdmin] = useState({ activities: [], fetchedAt: null })
  const [sportAdminLoading, setSportAdminLoading] = useState(false)
  const [sportAdminError, setSportAdminError] = useState('')
  const group = selectedGroups
  const setGroup = () => {}
  const topGroupFilter = selectedGroups.length === availableGroups.length ? null : selectedGroups
  const planningGroupKey = (value) => ({ 'ungdom orange': 'ungdom_orange', 'ungdom svart': 'ungdom_svart', 'ungdoms orange': 'ungdom_orange', 'ungdoms svart': 'ungdom_svart', junior: 'junior' }[String(value || '').trim().toLowerCase()] || String(value || '').trim().toLowerCase())
  const importSportAdmin = async () => { setSportAdminLoading(true); setSportAdminError(''); try { setSportAdmin(await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'import-sportadmin-calendar' }) })) } catch (error) { setSportAdminError(error.message || 'Kunde inte läsa SportAdmin-kalendern.') } finally { setSportAdminLoading(false) } }

  useEffect(() => {
    setLoading(true)
    setError('')
    apiRequest('/api/workouts?planning=true', code)
      .then((data) => { setPlans(data.plans || []); setWorkouts(data.workouts || []); setSportAdminActivities(data.sportAdminActivities || []); setCycles(data.cycles || []); setCyclesAvailable(data.cyclesAvailable !== false) })
      .catch((requestError) => setError(requestError.message || 'Kunde inte hämta planeringen.'))
      .finally(() => setLoading(false))
  }, [code])
  useEffect(() => {
    const openWorkout = (event) => setWorkoutToEdit(event.detail || null)
    window.addEventListener('simkoll-open-workout', openWorkout)
    return () => window.removeEventListener('simkoll-open-workout', openWorkout)
  }, [])
  useEffect(() => {
    const removeDetachedPlan = (event) => {
      const id = event.detail?.id
      if (id) setPlans((current) => current.filter((item) => item.id !== id))
    }
    window.addEventListener('simkoll-plan-detached', removeDetachedPlan)
    return () => window.removeEventListener('simkoll-plan-detached', removeDetachedPlan)
  }, [])

  const baseMonday = useMemo(() => {
    const value = new Date()
    value.setHours(0, 0, 0, 0)
    value.setDate(value.getDate() - ((value.getDay() + 6) % 7))
    return value
  }, [])
  const monday = useMemo(() => {
    const value = new Date(baseMonday)
    value.setDate(value.getDate() + weekOffset * 7)
    return value
  }, [baseMonday, weekOffset])
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    const key = dateKey(date)
    const matchesGroup = (item) => {
      if (!topGroupFilter) return true
      const itemGroups = [...new Set((Array.isArray(item.targetGroups) ? item.targetGroups : []).map(planningGroupKey).filter(Boolean))].sort()
      const selected = [...new Set(topGroupFilter.map(planningGroupKey).filter(Boolean))].sort()
      return itemGroups.some((value) => selected.includes(value))
    }
    const workoutFingerprint = (item) => [item.date || item.workoutDate || '', item.title || '', item.focus || '', item.distanceMeters || '', item.durationMinutes || '', item.timeOfDay || '', Array.isArray(item.targetGroups) ? [...item.targetGroups].sort().join(',') : '', item.content || ''].join('|')
    const uniqueActivities = (items, keyFor) => { const seen = new Set(); return items.filter((item) => { const keyValue = keyFor(item); if (seen.has(keyValue)) return false; seen.add(keyValue); return true }) }
    const findLinkedWorkout = (plan) => {
      const exact = workouts.find((workout) => workout.id === plan.sourceWorkoutId)
      const exactMatchesPlan = exact && exact.date === key && (!plan.timeOfDay || !exact.timeOfDay || exact.timeOfDay === plan.timeOfDay) && (!plan.distanceMeters || !exact.distanceMeters || Number(plan.distanceMeters) === Number(exact.distanceMeters))
      if (exactMatchesPlan) return exact
      if (plan.calendarLink && !plan.sourceWorkoutId) return null
      if (plan.activityType !== 'swim') return null
      const planGroups = new Set(plan.targetGroups || [])
      const candidates = workouts.filter((workout) => workout.date === key && (!plan.timeOfDay || !workout.timeOfDay || workout.timeOfDay === plan.timeOfDay) && (!planGroups.size || !workout.targetGroups?.length || workout.targetGroups.some((group) => planGroups.has(group))))
      return candidates.map((workout) => {
        let score = 0
        if (plan.focus && workout.focus === plan.focus) score += 5
        if (Number(plan.distanceMeters) > 0 && Number(workout.distanceMeters) === Number(plan.distanceMeters)) score += 4
        if (Number(plan.durationMinutes) > 0 && Number(workout.durationMinutes) === Number(plan.durationMinutes)) score += 3
        if (plan.timeOfDay && workout.timeOfDay === plan.timeOfDay) score += 3
        if (workout.title && plan.title && workout.title !== plan.title) score += 1
        return { workout, score }
      }).sort((a, b) => b.score - a.score)[0]?.workout || null
    }
    const planned = uniqueActivities(plans.filter((item) => item.date === key && matchesGroup(item)).map((item) => { const linkedWorkout = findLinkedWorkout(item); return { ...item, alternativeGroupId: item.alternativeGroupId || linkedWorkout?.alternativeGroupId || null, linkedWorkout } }), (item) => item.sourceWorkoutId ? `workout:${item.sourceWorkoutId}` : `plan:${item.date}|${item.activityType}|${item.title}|${item.focus}|${item.distanceMeters}|${item.durationMinutes}|${item.timeOfDay}|${(item.targetGroups || []).slice().sort().join(',')}`)
    const linkedIds = new Set(planned.map((item) => item.sourceWorkoutId).filter(Boolean))
    const linkedFingerprints = new Set(planned.map((item) => item.linkedWorkout).filter(Boolean).map(workoutFingerprint))
    const published = uniqueActivities(workouts.filter((workout) => workout.date === key && !linkedIds.has(workout.id) && !linkedFingerprints.has(workoutFingerprint(workout)) && matchesGroup(workout)).map((workout) => ({ id: `workout-${workout.id}`, date: key, activityType: 'swim', title: workout.title, focus: workout.focus, distanceMeters: workout.distanceMeters, durationMinutes: workout.durationMinutes, targetGroups: workout.targetGroups, sourceWorkoutId: workout.id, alternativeGroupId: workout.alternativeGroupId || null, timeOfDay: workout.timeOfDay, linkedWorkout: workout, syncStatus: 'linked' })), (item) => `workout-fingerprint:${workoutFingerprint(item.linkedWorkout || item)}`)
    const cleanCalendarTitle = (title) => String(title || 'Kalenderaktivitet').replace(/\s*(?:-|·)\s*(?:träning\s*-\s*)?(?:ungdoms?\s*(?:orange|svart)|junior)\s*$/i, '').trim() || 'Kalenderaktivitet'
    const importedRows = sportAdminActivities.filter((activity) => activity.date === key && matchesGroup(activity)).map((activity) => ({ ...activity, calendarKey: calendarActivityKey(activity), id: `sportadmin-${activity.id}`, date: key, activityType: 'sportadmin', title: cleanCalendarTitle(activity.title), time: activity.time, location: activity.location, notes: activity.notes, targetGroups: activity.targetGroups || [], source: 'SportAdmin' }))
    // Flera kalendrar kan beskriva samma gemensamma pass. Slå ihop dem när
    // datum, klockslag och plats är samma, så att grupperna visas tillsammans.
    const importedBySlot = importedRows.reduce((all, item) => {
      const slot = `${item.date}|${item.time || ''}|${item.location || ''}`
      const current = all.get(slot)
      if (!current) all.set(slot, { ...item, targetGroups: [...new Set(item.targetGroups)], calendarItems: [item] })
      else {
        current.targetGroups = [...new Set([...current.targetGroups, ...(item.targetGroups || [])])]
        current.title = [...new Set([current.title, item.title].filter(Boolean))].join(' · ')
        current.calendarItems.push(item)
      }
      return all
    }, new Map())
    const imported = [...importedBySlot.values()]
    const timeOfDayFor = (time) => { const hour = Number(String(time || '').split(':')[0]); return Number.isFinite(hour) ? (hour < 12 ? 'morning' : 'afternoon') : '' }
    const calendarForPlan = (plan) => {
      const explicit = explicitCalendarMatches(plan, imported)
      if (explicit !== null) return explicit
      const candidates = plan.timeOfDay ? imported.filter((item) => timeOfDayFor(item.time) === plan.timeOfDay) : imported
      const slotKey = (item) => `${item.time || ''}|${item.location || ''}`
      const slots = new Set(candidates.map(slotKey))
      if (slots.size <= 1) return candidates
      const planGroups = new Set(plan.targetGroups || [])
      const overlapping = candidates.filter((item) => (item.targetGroups || []).some((value) => planGroups.has(value)))
      const overlappingSlots = new Set(overlapping.map(slotKey))
      return overlappingSlots.size === 1 ? overlapping : []
    }
    const linkedCalendarIds = new Set()
    const plannedWithCalendar = [...planned, ...published].map((plan) => {
      const matching = calendarForPlan(plan)
      matching.forEach((item) => linkedCalendarIds.add(item.id))
      if (!matching.length) return plan
      const calendarNote = matching.map((item) => [item.time, item.location, item.notes].filter(Boolean).join(' · ')).filter(Boolean).join(' | ')
      return { ...plan, time: matching[0]?.time || plan.time || '', location: plan.location || matching.find((item) => item.location)?.location || '', notes: calendarNote || plan.notes || '', originalNotes: plan.notes || '', targetGroups: plan.calendarLink ? plan.targetGroups : [...new Set([...(plan.targetGroups || []), ...matching.flatMap((item) => item.targetGroups || [])])], calendarItems: matching }
    })
    const rawActivities = [...plannedWithCalendar, ...imported.filter((item) => !linkedCalendarIds.has(item.id))]
    // A pass can exist both as an older grundplan row and as an imported or
    // linked workout. Treat identical session data as one activity, while
    // keeping separate morning/afternoon sessions visible.
    const activityRank = (item) => (item.sourceWorkoutId ? 8 : 0) + (item.location ? 2 : 0) + (item.focus ? 2 : 0) + (item.notes ? 1 : 0) + (item.title && !/^image\.jpg$|^importerat träningspass$/i.test(item.title) ? 1 : 0)
    const deduplicated = []
    const duplicateKeys = new Map()
    rawActivities.forEach((item) => {
      const groups = [...new Set((item.targetGroups || []).map(planningGroupKey).filter(Boolean))].sort().join(',')
      const baseKey = [item.date || key, item.activityType || '', item.distanceMeters || '', item.durationMinutes || '', groups, item.sourceWorkoutId || item.title || ''].join('|')
      // SportAdmin can have a morning and an afternoon event with identical
      // group metadata. Their clock time is therefore part of the identity;
      // otherwise the later row is treated as a duplicate and disappears.
      const activityKey = `${baseKey}|${item.activityType === 'sportadmin' ? (item.time || '') : ''}|${item.timeOfDay || ''}`
      // An unspecified time is a wildcard for duplicate cleanup, but two
      // explicit sessions (morning vs afternoon) must remain separate.
      const previousIndex = item.activityType === 'sportadmin' ? duplicateKeys.get(activityKey) : duplicateKeys.get(activityKey) ?? duplicateKeys.get(`${baseKey}||`) ?? [...duplicateKeys.entries()].find(([candidate]) => candidate.startsWith(`${baseKey}|`) && (!candidate.split('|').pop() || !item.timeOfDay))?.[1]
      if (previousIndex == null) { duplicateKeys.set(activityKey, deduplicated.length); deduplicated.push(item); return }
      const previous = deduplicated[previousIndex]
      const preferred = activityRank(item) > activityRank(previous) ? item : previous
      const mergedGroups = [...new Set([...(previous.targetGroups || []), ...(item.targetGroups || [])])]
      deduplicated[previousIndex] = { ...preferred, targetGroups: mergedGroups, calendarItems: [...(previous.calendarItems || []), ...(item.calendarItems || [])] }
    })
    const timeOrder = (item) => item.timeOfDay === 'morning' ? 0 : item.timeOfDay === 'afternoon' ? 1 : 2
    const activities = deduplicated.sort((a, b) => timeOrder(a) - timeOrder(b) || String(a.time || '').localeCompare(String(b.time || '')) || activityRank(b) - activityRank(a))
    return { date, key, activities }
  }), [group, monday, plans, workouts, sportAdminActivities, topGroupFilter])
  const totalMeters = amountRangeLabel(planningAmountRange(days.flatMap((day) => day.activities.filter((item) => item.activityType === 'swim')), 'distanceMeters'))
  const totalMinutes = amountRangeLabel(planningAmountRange(days.flatMap((day) => day.activities), 'durationMinutes'))
  const weekLabel = `${monday.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}–${days[6].date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}`
  const focusLabel = (focus) => WORKOUT_FOCUSES.find(([value]) => value === focus)?.[1] || 'Ingen inriktning'
  const groupLabel = (value) => Array.isArray(value) ? value.map((item) => ({ ungdom_orange: 'Ungdom Orange', ungdom_svart: 'Ungdom Svart', junior: 'Junior' }[item] || item)).join(' · ') : ({ ungdom_orange: 'Ungdom Orange', ungdom_svart: 'Ungdom Svart', junior: 'Junior' }[value] || value)
  const typeLabel = (type) => ({ swim: 'Simning', strength: 'Styrka', dryland: 'Landträning', competition: 'Tävling', sportadmin: 'Kalender' }[type] || type)
  const cyclePhases = [['adaptation', 'Anpassning'], ['build', 'Uppbyggnad'], ['specific', 'Tävlingsspecifik'], ['taper', 'Formtoppning'], ['recovery', 'Återhämtning']]
  const cycleDateLabel = (start, end) => `${new Date(`${start}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}–${new Date(`${end}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}`
  const startCycleDraft = (type, parent = null, cycle = null) => {
    const now = new Date()
    const year = now.getFullYear()
    const fallTerm = now.getMonth() >= 6
    const defaultStart = `${year}-${fallTerm ? '08-10' : '01-10'}`
    const defaultEnd = `${year}-${fallTerm ? '12-20' : '06-15'}`
    const startDate = cycle?.startDate || (parent ? parent.startDate : defaultStart)
    const endDate = cycle?.endDate || (parent ? parent.endDate : defaultEnd)
    setCycleError('')
    setCycleDraft({ id: cycle?.id || '', type, parentId: parent?.id || cycle?.parentId || '', name: cycle?.name || (type === 'term' ? 'Hösttermin' : ''), startDate, endDate, targetGroups: cycle?.targetGroups?.length ? cycle.targetGroups : (selectedGroups || []), focus: cycle?.focus || '', goal: cycle?.goal || '', phase: cycle?.phase || 'build', notes: cycle?.notes || '' })
  }
  const saveCycle = async (event) => {
    event.preventDefault(); if (!cycleDraft) return
    setCycleSaving(true); setCycleError('')
    try {
      const result = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-training-cycle', ...cycleDraft }) })
      setCycles((current) => [...current.filter((item) => item.id !== result.cycle.id), result.cycle].sort((a, b) => a.startDate.localeCompare(b.startDate)))
      setCycleDraft(null)
    } catch (error) { setCycleError(error.message || 'Planeringsperioden kunde inte sparas.') }
    finally { setCycleSaving(false) }
  }
  const deleteCycle = async (cycle) => {
    if (!window.confirm(cycle.type === 'term' ? 'Ta bort terminen och dess träningsblock? Veckoplaneringen påverkas inte.' : 'Ta bort träningsblocket? Veckoplaneringen påverkas inte.')) return
    try {
      await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-training-cycle', id: cycle.id }) })
      setCycles((current) => current.filter((item) => item.id !== cycle.id && item.parentId !== cycle.id))
    } catch (error) { setCycleError(error.message || 'Perioden kunde inte tas bort.') }
  }
  const selectCycleWeek = (date) => {
    const target = new Date(`${date}T12:00:00`)
    const targetMonday = new Date(target); targetMonday.setDate(target.getDate() - ((target.getDay() + 6) % 7))
    setWeekOffset(Math.round((targetMonday - baseMonday) / (7 * 24 * 60 * 60 * 1000)))
    setPlanningView('week')
  }
  const cycleMatchesGroups = (item) => !topGroupFilter || !item.targetGroups?.length || item.targetGroups.some((value) => topGroupFilter.includes(value))
  const todayForCycles = todayKey()
  const defaultTerm = cycles.find((item) => item.type === 'term' && item.startDate <= todayForCycles && item.endDate >= todayForCycles) || cycles.find((item) => item.type === 'term')
  if (workoutToEdit) return <section className="workout-library-edit"><button className="back-button inline" onClick={() => setWorkoutToEdit(null)}>← Tillbaka till veckoplaneringen</button><WorkoutEditor code={code} responses={[]} initialWorkout={workoutToEdit} selectedGroups={selectedGroups} availableGroups={availableGroups} onClose={() => setWorkoutToEdit(null)} /></section>
  const currentDay = todayKey()
  return <section className="coach-planning"><div className="period-heading"><div><p className="eyebrow">Planera & följa upp</p><h1>{planningView === 'week' ? 'Veckans grundplan' : planningView === 'blocks' ? 'Träningsblock' : 'Terminsplanering'}</h1><small>{planningView === 'week' ? `${weekLabel} · ${groupLabel(selectedGroups)}` : 'Från terminens riktning till veckans konkreta pass'}</small></div><div className="big-count"><strong>{planningView === 'week' ? days.reduce((sum, day) => sum + groupSwimOccasions(day.activities).length, 0) : cycles.filter((item) => planningView === 'term' ? item.type === 'term' : item.type === 'block').length}</strong><span>{planningView === 'week' ? 'aktiviteter' : planningView === 'term' ? 'terminer' : 'träningsblock'}</span></div></div><nav className="planning-horizon-tabs" aria-label="Planeringsnivå"><button className={planningView === 'term' ? 'active' : ''} onClick={() => setPlanningView('term')}>🧭 Termin</button><button className={planningView === 'blocks' ? 'active' : ''} onClick={() => setPlanningView('blocks')}>📈 Träningsblock</button><button className={planningView === 'week' ? 'active' : ''} onClick={() => setPlanningView('week')}>📅 Vecka</button></nav>{loading ? <p className="empty">Hämtar planering…</p> : error ? <p className="form-error">{error}</p> : <>
    {planningView === 'week' && <><div className="planning-controls"><button className="secondary-button" onClick={() => setWeekOffset((value) => value - 1)}>← Föregående vecka</button><button className="secondary-button" onClick={() => setWeekOffset(0)}>Den här veckan</button><button className="secondary-button" onClick={() => setWeekOffset((value) => value + 1)}>Nästa vecka →</button></div><div className="planning-summary"><div><strong>{totalMeters ? totalMeters.toLocaleString('sv-SE') : '–'}</strong><span>simmetrar</span></div><div><strong>{totalMinutes || '–'}</strong><span>minuter</span></div><div><strong>{days.reduce((sum, day) => sum + groupSwimOccasions(day.activities).length, 0)}</strong><span>aktiviteter</span></div></div><div className="planning-day-list">{days.map((day) => <article className={`planning-day${day.activities.length ? ' has-workout' : ''}${day.key < currentDay ? ' is-past' : ''}${day.key === currentDay ? ' is-today' : ''}`} key={day.key}><header><div><strong>{day.date.toLocaleDateString('sv-SE', { weekday: 'long' })}</strong><small>{day.date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })}{day.key === currentDay && <b className="planning-today-label">Idag</b>}</small></div><div className="planning-day-actions"><PlanningEditButton code={code} calendarActivities={sportAdminActivities} date={day.key} group={group} onSaved={(saved) => setPlans((current) => [...current, saved])} label="+ Lägg till" /><PlanningDayDeleteButton code={code} date={day.key} onDeleted={() => setPlans((current) => current.filter((item) => item.date !== day.key))} /></div></header>{day.activities.length ? groupSwimOccasions(day.activities).map((occasion) => <SwimOccasion key={occasion.key} occasion={occasion}>{occasion.items.map((plan) => <div className="planning-workout" key={plan.id}><div className="planning-activity-title"><span className={`planning-type planning-type-${plan.activityType}`}>{typeLabel(plan.activityType)}</span><h2>{plan.title}</h2></div>{plan.focus && <span className="workout-focus-pill">{focusLabel(plan.focus)}</span>}<div className="workout-library-stats">{plan.distanceMeters && <span>{Number(plan.distanceMeters).toLocaleString('sv-SE')} m</span>}{plan.durationMinutes && <span>{plan.durationMinutes} min</span>}{plan.location && <span>{plan.location}</span>}</div>{plan.notes && <p>{plan.notes}</p>}<PlanningEditButton code={code} calendarActivities={sportAdminActivities} plan={plan} date={day.key} group={group} onSaved={(saved) => setPlans((current) => [...current.filter((item) => item.id !== saved.id), saved])} /></div>)}</SwimOccasion>) : <p className="planning-empty">Ingen aktivitet planerad</p>}</article>)}</div></>}
    {planningView !== 'week' && <><div className="planning-cycle-intro"><div><strong>{planningView === 'term' ? 'Sätt riktningen för säsongen' : 'Dela upp terminen i träningsfaser'}</strong><p>{planningView === 'term' ? 'Terminen ramar in helheten. Träningsblocken och veckopassen ligger kvar under den.' : 'Blocken kan till exempel vara uppbyggnad, tävlingsspecifik träning eller återhämtning.'}</p></div><button className="primary-button" onClick={() => planningView === 'term' ? startCycleDraft('term') : (cycles.find((item) => item.type === 'term') ? startCycleDraft('block', cycles.find((item) => item.type === 'term')) : setCycleError('Skapa en termin först så kan träningsblocken kopplas till den.'))}>＋ {planningView === 'term' ? 'Ny termin' : 'Nytt träningsblock'}</button></div>{!cyclesAvailable && <p className="form-error">Termins- och blockplanering kräver databasuppdatering 071. Veckoplaneringen fungerar som vanligt.</p>}{cycleError && !cycleDraft && <p className="form-error">{cycleError}</p>}{cycleDraft && <form className="planning-cycle-form" onSubmit={saveCycle}><div className="planning-cycle-form-heading"><div><span>{cycleDraft.type === 'term' ? 'TERMINSPLAN' : 'TRÄNINGSBLOCK'}</span><h2>{cycleDraft.id ? 'Redigera period' : cycleDraft.type === 'term' ? 'Planera en termin' : 'Lägg in ett träningsblock'}</h2></div><button type="button" className="text-button" onClick={() => setCycleDraft(null)}>Stäng</button></div><div className="planning-cycle-fields"><label>Namn<input required maxLength="100" value={cycleDraft.name} onChange={(event) => setCycleDraft({ ...cycleDraft, name: event.target.value })} placeholder={cycleDraft.type === 'term' ? 'Hösttermin 2026' : 'Uppbyggnad · aerob kapacitet'} /></label><label>Startdatum<input required type="date" value={cycleDraft.startDate} onChange={(event) => setCycleDraft({ ...cycleDraft, startDate: event.target.value })} /></label><label>Slutdatum<input required type="date" value={cycleDraft.endDate} onChange={(event) => setCycleDraft({ ...cycleDraft, endDate: event.target.value })} /></label><label>Fas<select value={cycleDraft.phase} onChange={(event) => setCycleDraft({ ...cycleDraft, phase: event.target.value })}>{cyclePhases.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Fokus<input value={cycleDraft.focus} maxLength="160" onChange={(event) => setCycleDraft({ ...cycleDraft, focus: event.target.value })} placeholder="Ex. aerob kapacitet och teknik" /></label><label>Mål<textarea value={cycleDraft.goal} maxLength="500" onChange={(event) => setCycleDraft({ ...cycleDraft, goal: event.target.value })} placeholder="Vad vill ni att gruppen ska utveckla under perioden?" /></label><label className="wide">Anteckningar<textarea value={cycleDraft.notes} maxLength="2000" onChange={(event) => setCycleDraft({ ...cycleDraft, notes: event.target.value })} placeholder="Valfri information till tränarteamet" /></label></div><fieldset className="competition-form"><legend>Berörda grupper</legend><div className="competition-group-checkboxes">{availableGroups.map(([value, label]) => <label key={value}><input type="checkbox" checked={cycleDraft.targetGroups.includes(value)} onChange={(event) => setCycleDraft({ ...cycleDraft, targetGroups: event.target.checked ? [...cycleDraft.targetGroups, value] : cycleDraft.targetGroups.filter((item) => item !== value) })} />{label}</label>)}</div></fieldset>{cycleError && <p className="form-error">{cycleError}</p>}<div className="planning-cycle-form-actions"><button type="button" className="secondary-button" onClick={() => setCycleDraft(null)}>Avbryt</button><button className="primary-button" disabled={cycleSaving || !cyclesAvailable}>{cycleSaving ? 'Sparar…' : 'Spara planering'}</button></div></form>}
    {(planningView === 'term' ? cycles.filter((item) => item.type === 'term' && cycleMatchesGroups(item)) : cycles.filter((item) => item.type === 'block' && cycleMatchesGroups(item))).map((cycle) => { const term = cycle.type === 'term' ? cycle : cycles.find((item) => item.id === cycle.parentId); const blocks = cycles.filter((item) => item.type === 'block' && item.parentId === (cycle.type === 'term' ? cycle.id : cycle.parentId) && cycleMatchesGroups(item)); const shownBlocks = cycle.type === 'term' ? blocks : [cycle]; return <article className={`planning-cycle-card planning-cycle-${cycle.type}`} key={cycle.id}><header><div><span className="planning-cycle-kicker">{cycle.type === 'term' ? 'MACROCYKEL · TERMIN' : 'MESOCYKEL · TRÄNINGSBLOCK'}</span><h2>{cycle.name}</h2><small>{cycleDateLabel(cycle.startDate, cycle.endDate)}</small></div><div className="planning-cycle-actions"><button className="text-button" onClick={() => startCycleDraft(cycle.type, term, cycle)}>Redigera</button><button className="text-button" onClick={() => deleteCycle(cycle)}>Ta bort</button></div></header>{cycle.type === 'term' && <div className="planning-term-progress"><span>{blocks.length} träningsblock</span><button className="secondary-button" onClick={() => startCycleDraft('block', cycle)}>＋ Lägg till block</button></div>}{cycle.focus && <p><strong>Fokus:</strong> {cycle.focus}</p>}{cycle.goal && <p><strong>Mål:</strong> {cycle.goal}</p>}{cycle.notes && <p className="planning-cycle-notes">{cycle.notes}</p>}{cycle.targetGroups.length > 0 && <div className="planning-group-pills">{cycle.targetGroups.map((value) => <span key={value}>{groupLabel(value)}</span>)}</div>}{cycle.type === 'term' && <div className="planning-block-list">{shownBlocks.map((block) => <div className="planning-block-row" key={block.id}><div><span className={`planning-phase phase-${block.phase}`}>{cyclePhases.find(([value]) => value === block.phase)?.[1] || 'Uppbyggnad'}</span><strong>{block.name}</strong><small>{cycleDateLabel(block.startDate, block.endDate)}{block.focus ? ` · ${block.focus}` : ''}</small></div><button className="text-button" onClick={() => selectCycleWeek(block.startDate)}>Visa veckor →</button></div>)}{!blocks.length && <p className="planning-empty">Lägg till träningsblock när terminsriktningen är på plats.</p>}</div>}{cycle.type === 'block' && <button className="secondary-button" onClick={() => selectCycleWeek(cycle.startDate)}>Öppna veckoplaneringen →</button>}</article>})}{!cycles.some((item) => item.type === (planningView === 'term' ? 'term' : 'block') && cycleMatchesGroups(item)) && <div className="planning-cycle-empty"><span>🧭</span><h2>{planningView === 'term' ? 'Börja med terminsriktningen' : 'Inga träningsblock ännu'}</h2><p>{planningView === 'term' ? 'Skapa en gemensam ram för perioden. Därefter kan du dela upp den i block och lägga de konkreta passen i veckoplaneringen.' : 'Träningsblocken placeras inom en termin och beskriver periodens fokus och mål.'}</p></div>}</>}
  </>}</section>
}

function BackupTools({ code }) {
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const exportBackup = async () => {
    setBusy(true); setProgress(10); setStatus('Hämtar databasen…')
    try {
      const backup = await apiRequest('/api/profiles?backup=export', code)
      setProgress(75); setStatus('Skapar lokal fil…')
      const stamp = new Date().toISOString().slice(0, 10), blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), link = document.createElement('a')
      link.href = url; link.download = `simkoll-backup-${stamp}-v${APP_VERSION}.json`; link.click(); URL.revokeObjectURL(url)
      const size = `${(blob.size / 1024).toFixed(1)} KB`; setProgress(100); setStatus(`Backup nedladdad (${size}).`)
    } catch (error) { setStatus(error.message) } finally { setBusy(false) }
  }
  const importBackup = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    if (file.size > 25 * 1024 * 1024) return setStatus('Filen är större än 25 MB och kan inte importeras här.')
    if (!window.confirm(`Importera ${file.name}? Befintliga poster kan uppdateras. Detta bör göras först efter att en aktuell backup har sparats.`)) return
    setBusy(true); setProgress(15); setStatus('Läser lokal backup…')
    try {
      const backup = JSON.parse(await file.text())
      setProgress(45); setStatus('Kontrollerar och importerar…')
      const result = await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'backup-import', backup }) })
      setProgress(100); setStatus(result.warnings?.length ? `Import klar med varningar: ${result.warnings.join(', ')}.` : 'Import klar. Ladda om sidan för att se ändringarna.')
    } catch (error) { setStatus(error instanceof SyntaxError ? 'Filen innehåller inte giltig JSON.' : error.message) } finally { setBusy(false) }
  }
  return <section className="settings-card backup-tools"><h2>Exportera eller importera databas</h2><p className="settings-help">Säkerhetskopiera data lokalt på den här enheten eller läs in en tidigare Simkoll-backup. Filnamnet innehåller datum och Simkoll-version.</p><div className="backup-actions"><button type="button" className="secondary-button" onClick={exportBackup} disabled={busy}>⬇️ {busy ? 'Arbetar…' : 'Exportera backup'}</button><label className="secondary-button backup-file-button">⬆️ Importera backup<input type="file" accept="application/json,.json" onChange={importBackup} disabled={busy} /></label></div>{busy || progress > 0 ? <div className="backup-progress" role="progressbar" aria-valuenow={progress}><i style={{ width: `${progress}%` }} /></div> : null}{status && <small className="backup-status">{status}</small>}<small className="settings-note">Backupen sparas eller läses från din lokala enhet. Den skickas inte till en språkmodell. Hantera filen som personuppgift.</small></section>
}

function SessionSettings({ code }) {
  const [settings, setSettings] = useState({ coachSessionDays: 30, swimmerSessionDays: 30 })
  const [saved, setSaved] = useState(false)
  useEffect(() => { apiRequest('/api/goals?settings=true', code).then((data) => setSettings((current) => ({ ...current, ...(data.settings || {}) }))).catch(() => {}) }, [code])
  const save = async () => { const data = await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-settings', settings }) }); setSettings((current) => ({ ...current, ...(data.settings || {}) })); setSaved(true); setTimeout(() => setSaved(false), 1800) }
  const select = (key, label) => <label className="settings-field"><span><strong>{label}</strong><small>Maximal tid när “Håll mig inloggad” är valt</small></span><select value={settings[key] || 30} onChange={(event) => setSettings((current) => ({ ...current, [key]: Number(event.target.value) }))}>{[1, 7, 14, 30, 60, 90].map((days) => <option value={days} key={days}>{days} dagar</option>)}</select></label>
  return <section className="settings-card session-settings"><h2>Inloggning</h2><p className="settings-help">Bestäm hur länge en aktiv session får finnas kvar på enheten. Lösenord och PIN sparas aldrig i webbläsaren.</p>{select('coachSessionDays', 'Tränare')}{select('swimmerSessionDays', 'Simmare')}<div className="settings-actions"><button className="primary-button" onClick={save}>Spara sessionstid</button>{saved && <span className="settings-saved">Sparat ✓</span>}</div></section>
}

function WebappSettingsLegacy({ code }) {
  const [settings, setSettings] = useState({ swimmer: {}, coach: {} })
  const [saved, setSaved] = useState(false)
  const swimmerFeatures = [['planning', 'Veckoplanering'], ['workout', 'Dagens pass'], ['competition', 'Tävlingsresultat'], ['talks', 'Utvecklingssamtal'], ['games', 'Veckans spel'], ['community', 'Pepp och meddelanden'], ['stars', 'Träningsstjärnor']]
  const coachFeatures = COACH_MENU_FEATURES
  const overviewFeatures = COACH_OVERVIEW_FEATURES
  useEffect(() => { apiRequest('/api/goals?settings=true', code).then((data) => setSettings(data.settings || { swimmer: {}, coach: {} })).catch(() => {}) }, [code])
  const toggle = (role, key) => setSettings((current) => ({ ...current, [role]: { ...current[role], [key]: current[role]?.[key] === false } }))
  const save = async () => { await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-settings', settings }) }); window.dispatchEvent(new CustomEvent('simkoll-settings-updated', { detail: settings })); setSaved(true); setTimeout(() => setSaved(false), 1800) }
  const reset = async () => { const result = await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset-settings' }) }); setSettings(result.settings) }
  const list = (role, features) => <div className="settings-list">{features.map(([key, label]) => <label key={key}><span><strong>{label}</strong><small>{settings[role]?.[key] === false ? 'Dold' : 'Synlig'}</small></span><input type="checkbox" checked={settings[role]?.[key] !== false} onChange={() => toggle(role, key)} /></label>)}</div>
  const updateChatBackground = (event) => { const file = event.target.files?.[0]; if (!file) return; if (!file.type.startsWith('image/')) return window.alert('Välj en bildfil.'); if (file.size > 1500000) return window.alert('Bilden får vara högst 1,5 MB.'); const reader = new FileReader(); reader.onload = () => setSettings((current) => ({ ...current, openChat: { ...(current.openChat || {}), backgroundImage: String(reader.result || '') } })); reader.readAsDataURL(file) }
  return <section className="webapp-settings"><div className="period-heading"><div><p className="eyebrow">Tränarverktyg</p><h1>Webapp-inställningar</h1><small>Styr vad som syns utan att radera någon data.</small></div></div><section className="settings-card"><h2>Språkmodellstöd</h2><p className="settings-help">Stäng av alla anrop till språkmodeller. Trendanalyser, textförbättring och importtolkning blockeras då även på serversidan.</p><label className="settings-toggle-row"><span><strong>AI-stöd</strong><small>{settings.aiEnabled === false ? 'Avstängt – inga anrop görs' : 'På – AI-funktioner är tillgängliga'}</small></span><input type="checkbox" checked={settings.aiEnabled !== false} onChange={() => setSettings((current) => ({ ...current, aiEnabled: current.aiEnabled === false }))} /></label><label className="settings-field ai-token-limit"><span><strong>Tokenstak per månad</strong><small>0 betyder obegränsat. När taket nås stoppas nya AI-anrop tills nästa månad.</small></span><input type="number" min="0" step="1000" value={settings.aiMonthlyTokenLimit || 0} onChange={(event) => setSettings((current) => ({ ...current, aiMonthlyTokenLimit: Math.max(0, Number(event.target.value) || 0) }))} /></label></section><section className="settings-card"><h2>Simmarnas välkomstpepp</h2><p className="settings-help">Visa tävlingsnedräkning, passpepp och diskreta färgeffekter på simmarnas startsida.</p><label className="settings-toggle-row"><span><strong>Visuella effekter</strong><small>{settings.swimmerEffects === false ? 'Avstängda för alla simmare' : 'På för alla simmare'}</small></span><input type="checkbox" checked={settings.swimmerEffects !== false} onChange={() => setSettings((current) => ({ ...current, swimmerEffects: current.swimmerEffects === false }))} /></label></section><section className="settings-card"><h2>Genvägar i översiktskortet</h2><p className="settings-help">Välj vilka genvägar som ska visas. Idag är alltid kvar som startsida.</p>{list('overview', overviewFeatures)}</section><section className="settings-card"><h2>Simmarvyn</h2>{list('swimmer', swimmerFeatures)}</section><section className="settings-card"><h2>Appfeedback för simmare</h2><p className="settings-help">Visa eller dölj frågan “Hur kan vi göra Simkoll bättre?” längst ned på simmarens startsida.</p><label className="settings-toggle-row"><span><strong>Appfeedback</strong><small>{settings.swimmer?.appFeedback === false ? 'Dold för simmare' : 'Synlig för simmare'}</small></span><input type="checkbox" checked={settings.swimmer?.appFeedback !== false} onChange={() => toggle('swimmer', 'appFeedback')} /></label></section><section className="settings-card"><h2>Egna peppmeddelanden</h2><p className="settings-help">Tillåt simmare att skriva egna peppmeddelanden till en lagkompis eller hela gruppen. Meddelandet kontrolleras innan det skickas.</p><label className="settings-toggle-row"><span><strong>Egna meddelanden</strong><small>{settings.swimmer?.customPep === false ? 'Avstängda för simmare' : 'På för simmare'}</small></span><input type="checkbox" checked={settings.swimmer?.customPep !== false} onChange={() => toggle('swimmer', 'customPep')} /></label></section><section className="settings-card"><h2>Tränarvyns meny</h2>{list('coach', coachFeatures)}</section><div className="settings-actions"><button className="primary-button" onClick={save}>Spara inställningar</button><button className="secondary-button" onClick={reset}>Återställ standard</button>{saved && <span className="settings-saved">Sparat ✓</span>}</div><BackupTools code={code} /><p className="settings-note">Webapp-inställningar kan inte döljas och är alltid tillgängliga för tränare.</p></section>
}

function PermissionOverview() {
  const rows = [['Tränarmeny och översiktskort', 'Använder', 'Kan styra', 'Kan styra'], ['Egna inställningar', 'Nej', 'Ja', 'Ja'], ['Globala webbapp-inställningar', 'Nej', 'Nej', 'Ja'], ['AI, chatt och SportAdmin', 'Använder', 'Använder · ej inställning', 'Kan styra'], ['Loggar och säkerhet', 'Nej', 'Nej', 'Ja'], ['Tränarkonton och roller', 'Nej', 'Nej', 'Ja']]
  return <section className="settings-card settings-permission-overview"><h2>Behörighetsöversikt</h2><p className="settings-note">Här kan superadmin se skillnaden mellan rollerna och vad en huvudtränare har tillgång till. “Använder” betyder att funktionen kan användas, medan “Kan styra” betyder att inställningen kan ändras.</p><div className="settings-permission-grid"><div><strong>Tränare</strong><small>Arbetar i tilldelade grupper och använder relevanta tränarvyer.</small></div><div><strong>Huvudtränare</strong><small>Kan styra tränarens menyer, genvägar och översiktskort.</small></div><div><strong>Superadmin</strong><small>Har alla vyer samt globala inställningar, säkerhet, loggar och tränarkonton.</small></div></div><div className="settings-permission-table"><div className="settings-permission-row settings-permission-header"><strong>Område</strong><strong>Tränare</strong><strong>Huvudtränare</strong><strong>Superadmin</strong></div>{rows.map(([area, coach, head, admin]) => <div className="settings-permission-row" key={area}><span>{area}</span><small>{coach}</small><small>{head}</small><small>{admin}</small></div>)}</div></section>
}

function WebappSettings({ code }) {
  return <><PermissionOverview /><WebappSettingsContent code={code} /></>
}

function WebappSettingsContent({ code }) {
  const [settings, setSettings] = useState({ swimmer: {}, coach: {} })
  const [saved, setSaved] = useState(false)
  const swimmerFeatures = [['planning', 'Veckoplanering'], ['workout', 'Dagens pass'], ['competition', 'Tävlingsresultat'], ['talks', 'Utvecklingssamtal'], ['games', 'Veckans spel'], ['community', 'Pepp och meddelanden'], ['stars', 'Träningsstjärnor']]
  const coachFeatures = COACH_MENU_FEATURES
  const overviewFeatures = COACH_OVERVIEW_FEATURES
  useEffect(() => { apiRequest('/api/goals?settings=true', code).then((data) => setSettings(data.settings || { swimmer: {}, coach: {} })).catch(() => {}) }, [code])
  const toggle = (role, key) => setSettings((current) => ({ ...current, [role]: { ...current[role], [key]: current[role]?.[key] === false } }))
  const save = async () => { await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-settings', settings }) }); window.dispatchEvent(new CustomEvent('simkoll-settings-updated', { detail: settings })); setSaved(true); setTimeout(() => setSaved(false), 1800) }
  const reset = async () => { const result = await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset-settings' }) }); setSettings(result.settings) }
  const list = (role, features) => <div className="settings-list">{features.map(([key, label]) => <label key={key}><span><strong>{label}</strong><small>{settings[role]?.[key] === false ? 'Dold' : 'Synlig'}</small></span><input type="checkbox" checked={settings[role]?.[key] !== false} onChange={() => toggle(role, key)} /></label>)}</div>
  return <section className="webapp-settings"><div className="period-heading"><div><p className="eyebrow">Tränarverktyg</p><h1>Webapp-inställningar</h1><small>Styr vad som syns utan att radera någon data.</small></div></div><section className="settings-card"><h2>Språkmodellstöd</h2><p className="settings-help">Stäng av alla anrop till språkmodeller. Trendanalyser, textförbättring och importtolkning blockeras då även på serversidan.</p><label className="settings-toggle-row"><span><strong>AI-stöd</strong><small>{settings.aiEnabled === false ? 'Avstängt – inga anrop görs' : 'På – AI-funktioner är tillgängliga'}</small></span><input type="checkbox" checked={settings.aiEnabled !== false} onChange={() => setSettings((current) => ({ ...current, aiEnabled: current.aiEnabled === false }))} /></label><label className="settings-field ai-token-limit"><span><strong>Tokenstak per månad</strong><small>0 betyder obegränsat. När taket nås stoppas nya AI-anrop tills nästa månad.</small></span><input type="number" min="0" step="1000" value={settings.aiMonthlyTokenLimit || 0} onChange={(event) => setSettings((current) => ({ ...current, aiMonthlyTokenLimit: Math.max(0, Number(event.target.value) || 0) }))} /></label></section><section className="settings-card"><h2>Simmarnas välkomstpepp</h2><p className="settings-help">Visa tävlingsnedräkning, passpepp och diskreta färgeffekter på simmarnas startsida.</p><label className="settings-toggle-row"><span><strong>Visuella effekter</strong><small>{settings.swimmerEffects === false ? 'Avstängda för alla simmare' : 'På för alla simmare'}</small></span><input type="checkbox" checked={settings.swimmerEffects !== false} onChange={() => setSettings((current) => ({ ...current, swimmerEffects: current.swimmerEffects === false }))} /></label><label className="settings-toggle-row"><span><strong>Säsongsteman</strong><small>{settings.swimmerThemesEnabled === false ? 'Avstängda för simmare' : 'På för simmare'}</small></span><input type="checkbox" checked={settings.swimmerThemesEnabled !== false} onChange={() => setSettings((current) => ({ ...current, swimmerThemesEnabled: current.swimmerThemesEnabled === false }))} /></label><label className="settings-field"><span><strong>Välj tema</strong><small>Temat ändrar bara färg och stämning.</small></span><select value={settings.swimmerTheme || 'none'} onChange={(event) => setSettings((current) => ({ ...current, swimmerTheme: event.target.value }))}><option value="none">Standard</option><option value="halloween">Halloween 🎃</option><option value="snow">Snö ❄️</option><option value="christmas">Jul 🎄</option></select></label></section><section className="settings-card"><h2>Genvägar i översiktskortet</h2><p className="settings-help">Välj vilka genvägar som ska visas. Idag är alltid kvar som startsida.</p>{list('overview', overviewFeatures)}</section><section className="settings-card"><h2>Simmarvyn</h2>{list('swimmer', swimmerFeatures)}</section><section className="settings-card"><h2>Appfeedback för simmare</h2><p className="settings-help">Visa eller dölj frågan “Hur kan vi göra Simkoll bättre?” längst ned på simmarens startsida.</p><label className="settings-toggle-row"><span><strong>Appfeedback</strong><small>{settings.swimmer?.appFeedback === false ? 'Dold för simmare' : 'Synlig för simmare'}</small></span><input type="checkbox" checked={settings.swimmer?.appFeedback !== false} onChange={() => toggle('swimmer', 'appFeedback')} /></label></section><section className="settings-card"><h2>Egna peppmeddelanden</h2><p className="settings-help">Tillåt simmare att skriva egna peppmeddelanden. Meddelandet kontrolleras innan det skickas.</p><label className="settings-toggle-row"><span><strong>Egna meddelanden</strong><small>{settings.swimmer?.customPep === false ? 'Avstängda för simmare' : 'På för simmare'}</small></span><input type="checkbox" checked={settings.swimmer?.customPep !== false} onChange={() => toggle('swimmer', 'customPep')} /></label></section><section className="settings-card"><h2>Tränarvyns meny</h2>{list('coach', coachFeatures)}</section><div className="settings-actions"><button className="primary-button" onClick={save}>Spara inställningar</button><button className="secondary-button" onClick={reset}>Återställ standard</button>{saved && <span className="settings-saved">Sparat ✓</span>}</div><BackupTools code={code} /><p className="settings-note">Webapp-inställningar kan inte döljas och är alltid tillgängliga för tränare.</p></section>
}

function OpenChatSettings({ code }) {
  const presets = [['/assets/open-chat-bg-teal.jpg', 'Ljust poolvatten · rekommenderad'], ['/assets/open-chat-bg.jpg', 'Poolblå'], ['/assets/open-chat-bg-navy.jpg', 'Navy med limeaccent']]
  const [settings, setSettings] = useState({ enabled: false, coachOnly: false, swimmerPrivate: true, backgroundImage: presets[0][0] })
  const [saved, setSaved] = useState(false)
  useEffect(() => { apiRequest('/api/goals?settings=true', code).then((data) => { const savedBackground = chatBackgroundUrl(data.settings?.openChat?.backgroundImage); const backgroundImage = presets.some(([path]) => path === savedBackground) ? savedBackground : presets[0][0]; setSettings({ enabled: data.settings?.openChat?.enabled === true, coachOnly: data.settings?.openChat?.coachOnly === true, swimmerPrivate: data.settings?.openChat?.swimmerPrivate !== false, backgroundImage }) }).catch(() => {}) }, [code])
  const save = async () => { const current = await apiRequest('/api/goals?settings=true', code); const next = { ...(current.settings || {}), openChat: settings }; await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-settings', settings: next }) }); window.dispatchEvent(new CustomEvent('simkoll-settings-updated', { detail: next })); setSaved(true); setTimeout(() => setSaved(false), 1800) }
  return <section className="settings-card open-chat-settings"><h2>Info från tränarna</h2><p className="settings-help">En gemensam informationskanal för tränare och simmare. Den öppnas via kuvertet i “Idag i gruppen”.</p><label className="settings-toggle-row"><span><strong>Aktivera info från tränarna</strong><small>{settings.enabled ? (settings.coachOnly ? 'Endast tränare kan skriva' : 'Simmare och tränare kan skriva') : 'Avstängd för alla'}</small></span><input type="checkbox" checked={settings.enabled} onChange={() => setSettings((current) => ({ ...current, enabled: !current.enabled }))} /></label>{settings.enabled && <label className="settings-toggle-row"><span><strong>Endast tränare kan skriva</strong><small>Simmare kan läsa kanalen men kan inte skicka nya meddelanden.</small></span><input type="checkbox" checked={settings.coachOnly} onChange={() => setSettings((current) => ({ ...current, coachOnly: !current.coachOnly }))} /></label>}<label className="settings-field"><span><strong>Chattema</strong><small>Välj en färdig, responsiv Simkoll-bakgrund. Egna bilder stöds inte för att hålla chatten snabb och säker.</small></span><select value={settings.backgroundImage} onChange={(event) => setSettings((current) => ({ ...current, backgroundImage: event.target.value }))}>{presets.map(([path, label]) => <option value={path} key={path}>{label}</option>)}</select></label><div className="chat-background-swatches">{presets.map(([path, label]) => <button type="button" key={path} aria-label={label} className={settings.backgroundImage === path ? 'selected' : ''} style={{ backgroundImage: `url(${path})` }} onClick={() => setSettings((current) => ({ ...current, backgroundImage: path }))} />)}</div><div className="settings-actions"><button type="button" className="primary-button" onClick={save}>Spara inställning</button>{saved && <span className="settings-saved">Sparat ✓</span>}</div></section>
}

function ChatBackgroundSettings({ code }) {
  const presets = [['/assets/open-chat-bg.jpg', 'Poolblå · standard'], ['/assets/open-chat-bg-teal.jpg', 'Turkos lagkänsla'], ['/assets/open-chat-bg-navy.jpg', 'Navy med limeaccent']]
  const [value, setValue] = useState(presets[0][0]); const [saved, setSaved] = useState(false)
  useEffect(() => { apiRequest('/api/goals?settings=true', code).then((data) => setValue(chatBackgroundUrl(data.settings?.openChat?.backgroundImage) || presets[0][0])).catch(() => {}) }, [code])
  const save = async () => { const current = await apiRequest('/api/goals?settings=true', code); const next = { ...(current.settings || {}), openChat: { ...(current.settings?.openChat || {}), backgroundImage: value } }; await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-settings', settings: next }) }); setSaved(true); setTimeout(() => setSaved(false), 1800) }
  return <section className="settings-card"><h2>Chattbakgrund</h2><p className="settings-help">Välj en förberedd bakgrund som fungerar på mobil, surfplatta och dator och har tillräcklig kontrast för texten.</p><label className="settings-field"><span><strong>Bakgrund</strong><small>Simkoll-bilderna är optimerade för chatten.</small></span><select value={value} onChange={(event) => setValue(event.target.value)}>{presets.map(([path, label]) => <option value={path} key={path}>{label}</option>)}</select></label><div className="chat-background-swatches">{presets.map(([path, label]) => <button type="button" key={path} aria-label={label} className={value === path ? 'selected' : ''} style={{ backgroundImage: `url(${path})` }} onClick={() => setValue(path)} />)}</div><div className="settings-actions"><button type="button" className="primary-button" onClick={save}>Spara bakgrund</button>{saved && <span className="settings-saved">Sparat ✓</span>}</div></section>
}

function SportAdminCalendarSettings({ code }) {
  const [groups, setGroups] = useState([['ungdom_orange', 'Ungdom Orange'], ['ungdom_svart', 'Ungdom Svart'], ['junior', 'Junior']])
  const [calendars, setCalendars] = useState([])
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [selectedGroups, setSelectedGroups] = useState(['ungdom_orange', 'ungdom_svart', 'junior'])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { apiRequest('/api/goals?settings=true', code).then((data) => setCalendars(data.settings?.sportAdminCalendars || [])).catch(() => {}); apiRequest('/api/profiles?groups=true', code).then((data) => { const list = (data.groups || []).filter((item) => item.active !== false).map((item) => [item.id, item.name]).filter(([id, label]) => id && label); if (list.length) { setGroups(list); setSelectedGroups(list.map(([id]) => id)) } }).catch(() => {}) }, [code])
  const add = () => {
    if (!url.trim()) return setMessage('Klistra in en SportAdmin Webcal-länk först.')
    setCalendars((current) => [...current, { id: `sportadmin-${Date.now()}`, name: name.trim() || `SportAdmin-kalender ${current.length + 1}`, url: url.trim(), groups: selectedGroups, enabled: true }])
    setUrl(''); setName(''); setMessage('Kalendern är tillagd – spara inställningarna.')
  }
  const save = async () => {
    setLoading(true); setMessage(''); try { const result = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-sportadmin-calendars', calendars }) }); setCalendars(result.calendars || calendars); setMessage(`${result.activities?.length || 0} kalenderaktiviteter lästes in.`) } catch (error) { setMessage(error.message || 'Kunde inte spara kalendern.') } finally { setLoading(false) }
  }
  const remove = (id) => setCalendars((current) => current.filter((item) => item.id !== id))
  const toggleGroup = (value) => setSelectedGroups((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  return <section className="settings-card sportadmin-settings"><h2>SportAdmin-kalendrar</h2><p className="settings-help">Lägg till en eller flera Webcal-länkar. Aktiviteterna visas i veckoplaneringen och filtreras efter grupperna du väljer.</p><div className="sportadmin-calendar-form"><label>Namn (valfritt)<input value={name} onChange={(event) => setName(event.target.value)} placeholder="t.ex. Junior kalender" /></label><label>SportAdmin Webcal-länk<input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://portalweb.sportadmin.se/webcal?id=…" /></label><fieldset><legend>Visa för grupper</legend><div className="competition-group-checkboxes">{groups.map(([value, label]) => <label key={value}><input type="checkbox" checked={selectedGroups.includes(value)} onChange={() => toggleGroup(value)} />{label}</label>)}</div></fieldset><button type="button" className="secondary-button" onClick={add}>＋ Lägg till kalender</button></div>{calendars.length ? <div className="sportadmin-calendar-list">{calendars.map((calendar) => <article key={calendar.id}><div><strong>{calendar.name}</strong><small>{calendar.url}</small><small>{calendar.groups?.length ? calendar.groups.map((group) => groups.find(([value]) => value === group)?.[1] || group).join(' · ') : 'Alla grupper'}</small></div><button type="button" className="text-button" onClick={() => remove(calendar.id)}>Ta bort</button></article>)}</div> : <p className="empty">Ingen SportAdmin-kalender tillagd.</p>}<div className="settings-actions"><button type="button" className="primary-button" onClick={save} disabled={loading}>{loading ? 'Läser in…' : 'Spara och synka kalendrar'}</button>{message && <small className="settings-saved">{message}</small>}</div></section>
}

function CoachCompetitionEntries({ code }) {
  const [competitions, setCompetitions] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [data, setData] = useState({ events: [], entries: [] })
  const [loading, setLoading] = useState(true)
  useEffect(() => { apiRequest('/api/workouts?calendar=true', code).then((result) => { const list = result.competitions || []; setCompetitions(list); if (list[0]) setSelectedId(list[0].id) }).catch(() => {}).finally(() => setLoading(false)) }, [code])
  useEffect(() => { if (!selectedId) return; setLoading(true); apiRequest(`/api/workouts?program=true&id=${selectedId}`, code).then(setData).catch(() => setData({ events: [], entries: [] })).finally(() => setLoading(false)) }, [code, selectedId])
  const safeEvents = Array.isArray(data.events) ? data.events : []
  const safeEvnents = safeEvents
  const safeEntries = Array.isArray(data.entries) ? data.entries : []
  const submitted = safeEntries.filter((entry) => entry.status === 'submitted')
  return <section className="competition-submissions"><div className="period-heading"><div><p className="eyebrow">Tävlingsplanering</p><h1>Tävlingsanmälningar</h1><small>Se vilka grenar simmarna har skickat in.</small></div></div>{competitions.length ? <label className="settings-field"><strong>Välj tävling</strong><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{competitions.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.startDate}</option>)}</select></label> : <p className="empty">Inga tävlingar är skapade ännu.</p>}{loading ? <p className="empty">Hämtar anmälningar…</p> : data.events.length ? <div className="competition-submission-list">{data.events.map((event) => { const names = submitted.filter((entry) => entry.event_id === event.id || entry.eventId === event.id); return <article key={event.id}><div><strong>{event.eventNumber ? `${event.eventNumber} · ` : ''}{event.label}</strong><small>{event.gender || 'Alla'} · {event.ageClass || 'Alla åldrar'}</small></div><span>{names.length ? names.map((entry) => `${entry.profileEmoji || '🏊'} ${entry.profileName || 'Simmare'}`).join(', ') : 'Ingen inskickad ännu'}</span></article> })}</div> : <p className="empty">Tävlingsprogrammet är inte inläst ännu.</p>}</section>
}

class CompetitionSubmissionBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) { console.error('Competition submission view failed:', error) }
  render() { return this.state.error ? <section className="empty-period"><span>⚠️</span><h2>Tävlingsanmälningarna kunde inte visas</h2><p>{this.state.error.message || 'Ett oväntat fel uppstod.'}</p><small>Öppna webbläsarens konsol om felet behöver felsökas vidare.</small><button className="secondary-button" onClick={() => this.setState({ error: null })}>Försök igen</button></section> : this.props.children }
}

function CompetitionSubmissionManager({ code, initialCompetitionId = '' }) {
  const [competitions, setCompetitions] = useState([]), [selectedId, setSelectedId] = useState(initialCompetitionId), [data, setData] = useState({ events: [], entries: [] }), [selectedProfile, setSelectedProfile] = useState(''), [chosen, setChosen] = useState([]), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const load = () => { setLoading(true); apiRequest('/api/workouts?calendar=true', code).then((result) => { const list = result.competitions || []; setCompetitions(list); if (!selectedId && list[0]) setSelectedId(list[0].id) }).catch(() => {}).finally(() => setLoading(false)) }
  useEffect(load, [code])
  useEffect(() => { if (!selectedId) return; setLoading(true); apiRequest(`/api/workouts?program=true&id=${selectedId}`, code).then((result) => { setData(result); setSelectedProfile(''); setChosen([]) }).catch(() => setData({ events: [], entries: [] })).finally(() => setLoading(false)) }, [code, selectedId])
  const safeEvents = Array.isArray(data.events) ? data.events : []
  const safeEntries = Array.isArray(data.entries) ? data.entries : []
  const submitted = safeEntries.filter((entry) => entry.status === 'submitted')
  const profiles = [...new Map(submitted.map((entry) => [entry.profile_id, entry])).values()]
  const selectProfile = (profileId) => { setSelectedProfile(profileId); setChosen(submitted.filter((entry) => entry.profile_id === profileId).map((entry) => entry.event_id)) }
  useEffect(() => { document.querySelectorAll('.competition-edit-selection .competition-entry-list label').forEach((label, index) => { const event = safeEvents[index]; if (event?.selectable === false) { label.classList.add('competition-info-row'); const input = label.querySelector('input'); if (input) input.disabled = true } }) }, [safeEvents])
  const save = async () => { if (savingRef.current || !selectedId || !selectedProfile) return; savingRef.current = true; setSaving(true); try { await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'coach-update-competition-entry', competitionId: selectedId, profileId: selectedProfile, eventIds: chosen }) }); const result = await apiRequest(`/api/workouts?program=true&id=${selectedId}`, code); setData(result); window.alert('Grenval sparat.') } catch (error) { window.alert(error.message) } finally { savingRef.current = false; setSaving(false) } }
  const exportCsv = () => {
    const eventById = new Map(safeEvents.map((event, index) => [event.id, { ...event, order: Number.isFinite(Number(event.eventOrder)) ? Number(event.eventOrder) : index }]))
    const orderedEntries = [...submitted].sort((a, b) => {
      const nameOrder = String(a.profileName || 'Simmare').localeCompare(String(b.profileName || 'Simmare'), 'sv', { sensitivity: 'base' })
      if (nameOrder) return nameOrder
      return (eventById.get(a.event_id)?.order ?? Number.MAX_SAFE_INTEGER) - (eventById.get(b.event_id)?.order ?? Number.MAX_SAFE_INTEGER)
    })
    const lines = [['Simmare', 'Grennummer', 'Gren', 'Kön', 'Klass'], ...orderedEntries.map((entry) => {
      const event = eventById.get(entry.event_id)
      return [entry.profileName || 'Simmare', event?.eventNumber || '', event?.label || '', event?.gender || '', event?.ageClass || '']
    })]
    const csv = lines.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(';')).join('\n')
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `simkoll-tavlingsanmalningar-${todayKey()}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }
  return <section className="competition-submissions"><div className="period-heading"><div><p className="eyebrow">Tävlingsplanering</p><h1>Tävlingsanmälningar</h1><small>Välj en simmare för att granska eller justera grenvalet.</small></div><button className="secondary-button" onClick={exportCsv} disabled={!submitted.length}>Exportera CSV</button></div>{competitions.length ? <label className="settings-field"><strong>Välj tävling</strong><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{competitions.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.startDate}</option>)}</select></label> : <p className="empty">Inga tävlingar är skapade ännu.</p>}{profiles.length ? <div className="competition-swimmer-picker">{profiles.map((profile) => <button type="button" className={selectedProfile === profile.profile_id ? 'active' : ''} key={profile.profile_id} onClick={() => selectProfile(profile.profile_id)}>{profile.profileEmoji || '🏊'} {profile.profileName || 'Simmare'}<small>{submitted.filter((entry) => entry.profile_id === profile.profile_id).length} grenar</small></button>)}</div> : !loading && <p className="empty">Ingen simmare har skickat in sitt grenval ännu.</p>}{selectedProfile && <section className="competition-edit-selection"><h2>Justera grenval</h2><div className="competition-entry-list">{safeEvents.map((event) => <label key={event.id}><input type="checkbox" disabled={event.selectable === false} checked={event.selectable !== false && chosen.includes(event.id)} onChange={() => event.selectable !== false && setChosen((current) => current.includes(event.id) ? current.filter((id) => id !== event.id) : [...current, event.id])} /><span><strong>{event.eventNumber ? `${event.eventNumber} · ` : ''}{event.label}</strong><small>{event.gender} · {event.ageClass}</small></span></label>)}</div><button className="primary-button" onClick={save} disabled={saving}>{saving ? 'Sparar…' : 'Spara ändrat grenval'}</button></section>}</section>
}

/* unused program draft
function CompetitionCalendarDraft({ code }) {
  const [competitions, setCompetitions] = useState([])
  const [programs, setPrograms] = useState({})
  const [programLoading, setProgramLoading] = useState({})
  const [group, setGroup] = useState('all')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ startDate: todayKey(), endDate: todayKey(), title: '', category: '', location: '', notes: '', targetGroups: ['ungdom_orange', 'ungdom_svart', 'junior'] })
  const groups = [['ungdom_orange', 'Ungdom Orange'], ['ungdom_svart', 'Ungdom Svart'], ['junior', 'Junior']]
  const load = () => apiRequest('/api/workouts?calendar=true', code).then((data) => setCompetitions(data.competitions || [])).catch(() => {})
  useEffect(() => { document.querySelectorAll('.competition-calendar-list article').forEach((card) => { const date = card.querySelector('.eyebrow')?.textContent?.trim().slice(-10); const past = /^\d{4}-\d{2}-\d{2}$/.test(date) && date < todayKey(); card.classList.toggle('past-competition', past) }) }, [competitions])
  const loadProgram = async (competitionId) => { try { const data = await apiRequest(`/api/workouts?program=true&id=${competitionId}`, code); setPrograms((current) => ({ ...current, [competitionId]: data.events || [] })) } catch (error) { window.alert(error.message) } }
  const importProgram = async (event, competitionId) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if (!/^(image\/(png|jpe?g|webp)|application/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|text\/plain)$/i.test(file.type)) return window.alert('Välj en bild, PDF eller Word-fil.'); if (file.size > 9 * 1024 * 1024) return window.alert('Filen är för stor. Välj en fil under 9 MB.'); const reader = new FileReader(); reader.onload = async () => { setProgramLoading((current) => ({ ...current, [competitionId]: true })); try { const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'import-competition-program', competitionId, fileData: reader.result, mimeType: file.type, fileName: file.name }) }); if (data.error) throw new Error(data.error); setPrograms((current) => ({ ...current, [competitionId]: data.events || [] })) } catch (error) { window.alert(error.message) } finally { setProgramLoading((current) => ({ ...current, [competitionId]: false })) } }; reader.readAsDataURL(file) }
  useEffect(() => { load() }, [code])
  const save = async (event) => { event.preventDefault(); try { const result = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-competition', ...form }) }); setCompetitions((current) => [...current, result.competition].sort((a, b) => a.startDate.localeCompare(b.startDate))); setForm({ ...form, title: '', notes: '' }); setOpen(false) } catch (error) { window.alert(error.message) } }
  const remove = async (item) => { if (!window.confirm(`Ta bort ${item.title}?`)) return; await apiRequest(`/api/workouts?calendar=true&id=${item.id}`, code, { method: 'DELETE' }); setCompetitions((current) => current.filter((entry) => entry.id !== item.id)) }
  const visible = competitions.filter((item) => group === 'all' || item.targetGroups.includes(group))
  const groupName = (value) => groups.find(([key]) => key === value)?.[1] || value
  return <section className="competition-calendar"><div className="period-heading"><div><p className="eyebrow">Planera & följa upp</p><h1>Tävlingskalender</h1><small>Tävlingar syns automatiskt i veckoplaneringen.</small></div><div className="big-count"><strong>{visible.length}</strong><span>visas</span></div></div><div className="calendar-group-filter"><span>Visa grupp</span>{[['all', 'Alla grupper'], ...groups].map(([value, label]) => <button type="button" className={group === value ? 'active' : ''} key={value} onClick={() => setGroup(value)}>{label}</button>)}</div><details className="competition-add-card" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}><summary>＋ Lägg till tävling</summary><form className="competition-form" onSubmit={save}><div className="competition-form-grid"><label>Från<input required type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label><label>Till<input required type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label><label>Tävlingsnamn<input required value={form.title} placeholder="t.ex. Sundsvall Swim" onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label>Plats<input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></label></div><label>Typ av tävling<input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label><fieldset><legend>Berörda grupper</legend><div className="competition-group-checkboxes">{groups.map(([value, label]) => <label key={value}><input type="checkbox" checked={form.targetGroups.includes(value)} onChange={(event) => setForm({ ...form, targetGroups: event.target.checked ? [...form.targetGroups, value] : form.targetGroups.filter((item) => item !== value) })} />{label}</label>)}</div></fieldset><label>Kommentar<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label><button className="primary-button" type="submit">Spara tävling</button></form></details><div className="competition-calendar-list">{visible.length ? visible.map((item) => <article key={item.id}><div><p className="eyebrow">{item.startDate === item.endDate ? item.startDate : `${item.startDate} – ${item.endDate}`}</p><h2>{item.title}</h2><p>{[item.category, item.location].filter(Boolean).join(' · ')}</p><small>{item.targetGroups.map(groupName).join(' · ')}</small>{item.notes && <p>{item.notes}</p>}</div><button type="button" className="text-button" onClick={() => remove(item)}>Ta bort</button></article>) : <p className="empty">Inga tävlingar matchar gruppen ännu.</p>}</div></section>
}

}
*/
function CompetitionProgramPanel({ code, competition, canManage = false }) {
  const [events, setEvents] = useState(null)
  const [entries, setEntries] = useState([])
  const [snapshot, setSnapshot] = useState(null)
  const [sessions, setSessions] = useState([])
  const [draft, setDraft] = useState(null)
  const [source, setSource] = useState(null)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const publishBusy = useRef(false)
  const sourceRef = useRef(null)
  useEffect(() => () => { if (sourceRef.current) URL.revokeObjectURL(sourceRef.current) }, [])
  const load = async () => {
    setLoading(true); setError('')
    try {
      const data = await apiRequest(`/api/workouts?program=true&id=${competition.id}`, code)
      setEvents(data.events || []); setEntries(data.entries || []); setSnapshot(data.programSnapshot || []); setSessions(data.sessions || [])
      return true
    } catch (e) { setError(e.message); return false } finally { setLoading(false) }
  }
  const importFile = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    const type = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : /\.png$/i.test(file.name) ? 'image/png' : /\.webp$/i.test(file.name) ? 'image/webp' : /\.jpe?g$/i.test(file.name) ? 'image/jpeg' : '')
    if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(type)) return setError('Välj en bild eller PDF. Exportera Word till PDF för att bevara tabellernas layout.')
    if (file.size > 3 * 1024 * 1024) return setError('Välj en fil under 3 MB så att den ryms i uppladdningen. Exportera eller komprimera dokumentet och försök igen.')
    setImporting(true); setError(''); setSuccess('')
    if (!await load()) { setImporting(false); return }
    const reader = new FileReader()
    reader.onerror = () => { setError('Filen kunde inte läsas.'); setImporting(false) }
    reader.onload = async () => {
      try {
        const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'import-competition-program', competitionId: competition.id, fileData: reader.result, mimeType: type, fileName: file.name }) })
        if (!data.draft) throw new Error('Inget granskningsutkast kom tillbaka.')
        if (sourceRef.current) URL.revokeObjectURL(sourceRef.current)
        sourceRef.current = URL.createObjectURL(file)
        setSource({ url: sourceRef.current, type }); setDraft(data.draft)
      } catch (e) { setError(e.message) } finally { setImporting(false) }
    }
    reader.readAsDataURL(file)
  }
  const publish = async (reviewedDraft) => {
    if (publishBusy.current) return
    publishBusy.current = true
    setSaving(true); setError(''); setSuccess('')
    try {
      const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'publish-competition-program', competitionId: competition.id, draft: reviewedDraft, programSnapshot: snapshot, reviewed: true }) })
      setEvents(data.events); setSnapshot(data.programSnapshot); setSessions(data.sessions || []); setDraft(null)
      setSuccess('✓ Grenprogrammet har sparats. Det sparade programmet är uppdaterat och befintliga anmälningar för oförändrade grenar är kvar.')
    } catch (e) { setError(e.message) } finally { publishBusy.current = false; setSaving(false) }
  }
  return <details className="competition-program" onToggle={(event) => event.target === event.currentTarget && event.currentTarget.open && events === null && !loading && load()}>
    <summary>{events?.length ? `Grenprogram · ${events.filter((e) => e.itemType === 'race').length} grenar` : 'Grenprogram · lägg till'}</summary>
    <div className="competition-program-actions">
      <button type="button" className="secondary-button" onClick={() => { if (draft && !window.confirm('Lämna det osparade utkastet och visa det sparade grenprogrammet?')) return; setDraft(null); load() }} disabled={loading || importing || saving}>{loading ? 'Laddar…' : 'Visa sparat program'}</button>
      {canManage ? <><label className={`secondary-button competition-import-button${importing ? ' is-importing' : ''}`}><span className="competition-import-label"><span className="competition-import-icon" aria-hidden="true">{importing ? '🧠' : '📎'}</span>{importing ? 'Analyserar pass och grenar…' : 'Läs in bild / PDF'}</span><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={importFile} disabled={importing || saving || !!draft} /></label><small>AI läser pass och grenrader separat. Du granskar och godkänner innan något sparas. Word? Exportera först till PDF.</small></> : <small>Inläsning och AI-analys av tävlings-PM hanteras av huvudtränare eller superadmin.</small>}
    </div>
    {importing && <p role="status" className="program-analysis-status">Läser tabellernas struktur och kontrollerar grenordningen. Större dokument kan ta ett par minuter.</p>}
    {error && !draft && <p role="alert" className="program-warning">{error}</p>}
    {success && <p role="status" className="program-save-success">{success}</p>}
    {draft && <CompetitionProgramReview draft={draft} setDraft={setDraft} saving={saving} publishError={error} onPublish={publish} onCancel={() => { setDraft(null); setError('') }} sourceUrl={source.url} sourceType={source.type} />}
    {!draft && sessions.length > 0 && <div className="program-saved-sessions">{sessions.map((s) => <p key={s.label}><strong>{s.label}</strong> · {[s.date, s.warmup && `Insim ${s.warmup}`, s.start && `Start ${s.start}`].filter(Boolean).join(' · ')}</p>)}</div>}
    {!draft && events?.length ? <div className="competition-event-list">{events.map((item) => {
      const names = entries.filter((entry) => (entry.event_id === item.id || entry.eventId === item.id) && entry.status === 'submitted')
      return <span key={item.id}>{item.eventNumber ? `${item.eventNumber} · ` : ''}{item.label} · {item.gender} · {item.ageClass}{names.length ? ` · ${names.map((entry) => `${entry.profileEmoji || '🏊'} ${entry.profileName || 'Simmare'}`).join(', ')}` : ''}</span>
    })}</div> : !draft && events && !importing ? <p className="empty">Inga grenar sparade ännu.</p> : null}
  </details>
}

function CompetitionCalendar({ code, onOpenSubmissions, canManageCompetitionPrograms = false }) {
  return <CompetitionCalendarView code={code} request={apiRequest} today={todayKey()} onOpenSubmissions={onOpenSubmissions} renderProgram={(competition) => <CompetitionProgramPanel code={code} competition={competition} canManage={canManageCompetitionPrograms} />} />
}

function PlanningEditButton({ code, plan, date, group, calendarActivities = [], calendarActivity = null, onSaved, onDetached, onOpenWorkout, label = 'Redigera' }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(null)
  const [customDistance, setCustomDistance] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [calendarOnly, setCalendarOnly] = useState(false)
  const dayCalendar = [...new Map(calendarActivities.filter((item) => item.date === date).map((item) => [calendarActivityKey(item), item])).values()]
  const swimDistanceOptions = Array.from({ length: 13 }, (_, index) => 1000 + index * 500)
  const types = [['swim', 'Simning'], ['strength', 'Styrketräning'], ['dryland', 'Landträning'], ['competition', 'Tävling']]
  const suggestions = { swim: 'Träningspass', strength: 'Styrkepass', dryland: 'Landträningspass', competition: 'Tävlingsdag' }
  const detach = async () => {
    if (!window.confirm('Koppla loss det upplagda passet från grundplaneringen? Själva passet finns kvar i passbiblioteket.')) return
    try {
      const result = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'detach-plan', id: plan.id }) })
      window.dispatchEvent(new CustomEvent('simkoll-plan-detached', { detail: result.plan }))
    } catch (error) { window.alert(error.message || 'Kunde inte koppla loss passet.') }
  }
  useEffect(() => {
    if (!plan?.sourceWorkoutId || String(plan.id || '').startsWith('workout-')) return undefined
    const card = [...document.querySelectorAll('.planning-workout')].find((element) => element.querySelector('h2')?.textContent === plan.title)
    if (!card || card.querySelector('.planning-detach-button')) return undefined
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'text-button planning-detach-button'
    button.textContent = 'Koppla loss pass'
    button.title = 'Koppla loss passet från grundplaneringen'
    button.addEventListener('click', detach)
    card.appendChild(button)
    return () => { button.removeEventListener('click', detach); button.remove() }
  }, [plan?.id, plan?.sourceWorkoutId, plan?.title])
  const openEditor = (onlyCalendar = false) => {
    if (plan?.linkedWorkout && !onlyCalendar) { window.dispatchEvent(new CustomEvent('simkoll-open-workout', { detail: plan.linkedWorkout })); return }
    setCalendarOnly(Boolean(plan?.linkedWorkout && onlyCalendar))
    const activityType = plan?.activityType || 'swim'
    const distance = Number(plan?.distanceMeters) || ''
    setCustomDistance(Boolean(distance && !swimDistanceOptions.includes(distance)))
    setForm({ activityType, title: plan?.title || suggestions[activityType], focus: plan?.focus || '', distanceMeters: distance, durationMinutes: plan?.durationMinutes || (activityType === 'swim' ? 120 : ''), timeOfDay: plan?.timeOfDay || '', targetGroups: plan?.targetGroups?.length ? plan.targetGroups : group === 'all' ? ['ungdom_orange', 'ungdom_svart', 'junior'] : Array.isArray(group) ? group : [group], location: plan?.location || '', notes: plan?.originalNotes ?? plan?.notes ?? '' })
    setForm((current) => {
      const activities = calendarActivity ? calendarActivity.calendarItems?.length ? calendarActivity.calendarItems : [calendarActivity] : []
      const values = activities.length ? calendarFormValues(activities) : null
      return { ...current, calendarLink: plan?.calendarLink || null, ...values, targetGroups: [...new Set([...(current.targetGroups || []), ...(values?.targetGroups || [])])] }
    })
    setSaveError('')
    setOpen(true)
  }
  const selectType = (activityType) => setForm((current) => ({ ...current, activityType, title: current.title === suggestions[current.activityType] || !current.title ? suggestions[activityType] : current.title, durationMinutes: activityType === 'swim' && !current.durationMinutes ? 120 : current.durationMinutes }))
  if (plan?.linkedWorkout) label = 'Öppna upplagt pass →'
  const selectCalendar = (key) => {
    const keys = calendarLinkKeys(form.calendarLink)
    const nextKeys = keys.includes(key) ? keys.filter((value) => value !== key) : [...keys, key]
    const selected = nextKeys.map((value) => dayCalendar.find((item) => calendarActivityKey(item) === value))
    if (selected.some((item) => !item)) { setSaveError('En tidigare vald kalenderaktivitet saknas. Avmarkera den innan du väljer nya aktiviteter.'); return }
    if (selected.length && !sameCalendarOccasion(selected)) { setSaveError('Välj kalenderaktiviteter med samma datum, starttid och plats för ett gemensamt pass.'); return }
    setSaveError('')
    setForm((current) => {
      const values = selected.length ? calendarFormValues(selected) : { calendarLink: { mode: 'none' } }
      return { ...current, ...values, targetGroups: [...new Set([...(current.targetGroups || []), ...(values.targetGroups || [])])] }
    })
  }
  const save = async (event) => {
    event.preventDefault(); if (saving) return
    setSaving(true); setSaveError('')
    try {
      const result = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-plan', id: plan?.id && !String(plan.id).startsWith('workout-') ? plan.id : undefined, sourceWorkoutId: plan?.sourceWorkoutId || undefined, date, ...form }) })
      onSaved(result.plan); setOpen(false)
    } catch (error) { setSaveError(error.message || 'Planeringen kunde inte sparas.') }
    finally { setSaving(false) }
  }
  if (plan?.source === 'SportAdmin') return <div className="sportadmin-planning-meta">{plan.time || plan.location ? <small>{plan.time ? `⏰ ${plan.time}` : ''}{plan.location ? ` · ${plan.location}` : ''}</small> : null}<div className="planning-group-pills">{plan.targetGroups?.length ? plan.targetGroups.map((value) => <span className="planning-type" key={value}>{({ ungdom_orange: 'Orange', ungdom_svart: 'Svart', junior: 'Junior' }[value] || value)}</span>) : <span className="planning-type">Alla grupper</span>}</div><PlanningEditButton code={code} date={date} group={group} calendarActivities={calendarActivities} calendarActivity={plan} onSaved={onSaved} label="＋ Lägg till pass här" /></div>
  return <>
    <div className="planning-group-pills">{plan?.targetGroups?.length ? plan.targetGroups.map((value) => <span className="planning-type" key={value}>{({ ungdom_orange: 'Orange', ungdom_svart: 'Svart', junior: 'Junior' }[value] || value)}</span>) : null}</div>
    <button type="button" className="text-button" onClick={() => openEditor()}>{label}</button>
    {plan?.linkedWorkout && <button type="button" className="text-button" onClick={() => openEditor(true)}>Ändra kalenderkoppling</button>}
    {open && form && <div className="planning-editor-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
      <form className="planning-editor" onSubmit={save}>
        <div className="planning-editor-head"><h2>{plan ? 'Redigera aktivitet' : 'Lägg till aktivitet'}</h2><button type="button" className="text-button" onClick={() => setOpen(false)}>Stäng</button></div>
        {!calendarOnly && <fieldset><legend>Vad planeras?</legend><div className="planning-type-buttons">{types.map(([value, text]) => <button type="button" className={form.activityType === value ? 'active' : ''} key={value} onClick={() => selectType(value)}>{text}</button>)}</div></fieldset>}
        <fieldset className="planning-calendar-choice"><legend>Koppla till kalenderaktiviteter</legend>
          <div className="planning-calendar-modes"><button type="button" aria-pressed={!form.calendarLink} onClick={() => { setSaveError(''); setForm((current) => ({ ...current, calendarLink: null, location: '', timeOfDay: '' })) }}>Automatisk koppling</button><button type="button" aria-pressed={form.calendarLink?.mode === 'none'} onClick={() => { setSaveError(''); setForm((current) => ({ ...current, calendarLink: { mode: 'none' }, location: '', timeOfDay: '' })) }}>Ingen koppling</button></div>
          <p>Välj en eller flera gruppers kalenderaktiviteter för samma träning. Starttid och plats ska vara samma. Grupperna läggs till utan att dina tidigare gruppval tas bort.</p>
          <div className="planning-calendar-list">{dayCalendar.map((item) => <label className="planning-calendar-option" key={calendarActivityKey(item)}><input type="checkbox" checked={calendarLinkKeys(form.calendarLink).includes(calendarActivityKey(item))} onChange={() => selectCalendar(calendarActivityKey(item))} /><span><strong>{item.time || 'Tid saknas'} · {item.title}</strong><small>{[item.location, item.targetGroups?.map((value) => ({ junior: 'Junior', ungdom_svart: 'Svart', ungdom_orange: 'Orange' }[value] || value)).join(', ')].filter(Boolean).join(' · ')}</small></span></label>)}{calendarLinkKeys(form.calendarLink).filter((key) => !dayCalendar.some((item) => calendarActivityKey(item) === key)).map((key) => <label className="planning-calendar-option" key={key}><input type="checkbox" checked onChange={() => selectCalendar(key)} /><span><strong>{form.calendarLink.title}</strong><small>Tidigare vald aktivitet saknas i kalendern. Avmarkera för att ta bort kopplingen.</small></span></label>)}</div>
          {!dayCalendar.length && <p>Inga kalenderaktiviteter hittades för dagen.</p>}
        </fieldset>
        {!calendarOnly && <div className="planning-editor-fields">
        {form.activityType === 'swim' && <>
          <label>Huvudinriktning<select value={form.focus} onChange={(event) => setForm({ ...form, focus: event.target.value })}><option value="">Välj inriktning</option>{WORKOUT_FOCUSES.map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></label>
          <label>Tid på dagen<select value={form.timeOfDay} onChange={(event) => setForm({ ...form, timeOfDay: event.target.value, durationMinutes: event.target.value === 'morning' ? 90 : event.target.value === 'afternoon' ? 120 : form.durationMinutes })}><option value="">Välj tid</option><option value="morning">Förmiddag / morgon</option><option value="afternoon">Eftermiddag / kväll</option></select></label>
        </>}
        <label className="planning-editor-wide">Rubrik<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        {form.activityType === 'swim' && <>
          <label>Distans<select value={customDistance ? 'custom' : form.distanceMeters} onChange={(event) => {
            if (event.target.value === 'custom') { setCustomDistance(true); setForm((current) => ({ ...current, distanceMeters: '' })) }
            else { setCustomDistance(false); setForm((current) => ({ ...current, distanceMeters: event.target.value ? Number(event.target.value) : '' })) }
          }}><option value="">Välj meter</option>{swimDistanceOptions.map((value) => <option value={value} key={value}>{value.toLocaleString('sv-SE')} m</option>)}<option value="custom">Annat (skriv nedan)</option></select></label>
          {customDistance && <label>Egen distans<input type="number" min="1" max="50000" step="1" required inputMode="numeric" value={form.distanceMeters} onChange={(event) => setForm((current) => ({ ...current, distanceMeters: event.target.value ? Number(event.target.value) : '' }))} placeholder="Ange meter" /></label>}
        </>}
        <label>Tidsåtgång<select value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })}><option value="">Välj tid</option><option value="60">1 timme</option><option value="90">1,5 timmar</option><option value="120">2 timmar</option></select></label>
        <fieldset className="planning-editor-wide"><legend>Berörda grupper</legend><div className="competition-group-checkboxes">{[['ungdom_orange', 'Ungdom Orange'], ['ungdom_svart', 'Ungdom Svart'], ['junior', 'Junior']].map(([value, text]) => <label key={value}><input type="checkbox" checked={form.targetGroups.includes(value)} onChange={(event) => setForm({ ...form, targetGroups: event.target.checked ? [...form.targetGroups, value] : form.targetGroups.filter((item) => item !== value) })} />{text}</label>)}</div></fieldset>
        <label className="planning-editor-wide">Kommentar eller plats<textarea rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label></div>}
        {saveError && <p className="form-error" role="alert">{saveError}</p>}
        <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Sparar planering…' : 'Spara planering'}</button>
      </form>
    </div>}
  </>
}

function PlanningDayDeleteButton({ code, date, onDeleted }) {
  const remove = async () => {
    if (!window.confirm(`Ta bort all planering för ${date}? Detta kan inte ångras.`)) return
    try {
      await apiRequest(`/api/workouts?planning=true&date=${encodeURIComponent(date)}`, code, { method: 'DELETE' })
      onDeleted?.()
    } catch (error) { window.alert(error.message || 'Kunde inte ta bort dagen.') }
  }
  return <button type="button" className="text-button planning-delete-button" onClick={remove} title="Ta bort hela dagens planering">Ta bort dag</button>
}

function PlanningDetachButton({ code, plan, onDetached }) {
  if (!plan?.sourceWorkoutId) return null
  const detach = async () => {
    if (!window.confirm('Koppla loss det upplagda passet från veckoplaneringen? Själva passet finns kvar i passbiblioteket.')) return
    try {
      const result = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'detach-plan', id: plan.id }) })
      onDetached?.(result.plan)
    } catch (error) { window.alert(error.message || 'Kunde inte koppla loss passet.') }
  }
  return <button type="button" className="text-button planning-detach-button" onClick={detach} title="Koppla loss passet från grundplaneringen">Koppla loss pass</button>
}

function WorkoutLibrary({ code, responses }) {
  const [workouts, setWorkouts] = useState([])
  const [filter, setFilter] = useState('all')
  const [category, setCategory] = useState('training')
  const [sort, setSort] = useState('date')
  const [editingWorkout, setEditingWorkout] = useState(null)
  const focusLabels = Object.fromEntries(WORKOUT_FOCUSES)
  const load = () => apiRequest('/api/workouts?history=true', code).then((data) => setWorkouts(data.workouts || [])).catch(() => {})
  useEffect(() => { load() }, [code])
  const editWorkout = (workout) => setEditingWorkout(workout)
  const deleteWorkout = async (workout) => {
    if (!confirmDestructive(`Träningspasset “${workout.title || 'utan rubrik'}” för ${workout.date} tas bort permanent och försvinner från passbiblioteket.`)) return
    try { await apiRequest(`/api/workouts?id=${encodeURIComponent(workout.id)}&date=${encodeURIComponent(workout.date)}`, code, { method: 'DELETE' }); await load() } catch (error) { window.alert(error.message) }
  }
  const today = todayKey()
  const visible = workouts.filter((workout) => (category === 'all' || (category === 'competition' ? ['tavlingsinsim', 'tavling'].includes(workout.focus) : !['tavlingsinsim', 'tavling'].includes(workout.focus))) && (filter === 'all' || (filter === 'upcoming' ? workout.date >= today : workout.date < today))).map((workout) => {
    const after = responses.filter((item) => item.type === 'after' && dateKey(responseDate(item)) === workout.date)
    const avg = (key) => { const values = after.map((item) => Number(item[key])).filter(Number.isFinite); return values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1) : null }
    return { ...workout, focusLabel: focusLabels[workout.focus] || workout.focus || 'Ingen inriktning', responses: after.length, rpe: avg('rpe'), pass: avg('pass'), setup: avg('setup') }
  }).sort((a, b) => sort === 'date' ? b.date.localeCompare(a.date) : sort === 'distance' ? (b.distanceMeters || 0) - (a.distanceMeters || 0) : sort === 'duration' ? (b.durationMinutes || 0) - (a.durationMinutes || 0) : sort === 'rpe' ? (Number(b.rpe) || -1) - (Number(a.rpe) || -1) : sort === 'pass' ? (Number(b.pass) || -1) - (Number(a.pass) || -1) : (Number(b.setup) || -1) - (Number(a.setup) || -1))
  if (editingWorkout) return <section className="workout-library-edit"><button className="back-button inline" onClick={() => { setEditingWorkout(null); load() }}>← Tillbaka till passbiblioteket</button><WorkoutEditor code={code} responses={responses} initialWorkout={editingWorkout} onClose={() => { setEditingWorkout(null); load() }} /></section>
  return <section className="workout-library">
    <div className="period-heading"><div><p className="eyebrow">Träningspass och tävlingspass</p><h1>Passbibliotek</h1></div><div className="big-count"><strong>{visible.length}</strong><span>pass</span></div></div>
    <div className="library-controls">
      <label>Typ av pass<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="training">Träningspass</option><option value="competition">Tävlingsrelaterat</option><option value="all">Alla pass</option></select></label>
      <label>Visa<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Alla datum</option><option value="upcoming">Kommande</option><option value="past">Tidigare</option></select></label>
      <label>Sortera efter<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="date">Datum</option><option value="distance">Distans</option><option value="duration">Tid</option><option value="rpe">RPE</option><option value="pass">Passbetyg</option><option value="setup">Upplägg</option></select></label>
    </div>
    <small className="workout-library-category-note">Tävlingsinsim och tävling visas under Tävlingsrelaterat. Äldre pass utan vald inriktning behöver märkas manuellt.</small>
    {visible.length ? <div className="workout-library-list">{visible.map((workout) => {
      const incomplete = !workout.title || !workout.content || !focusLabels[workout.focus]
      return <article key={workout.id} className={`${workout.date >= today ? 'upcoming' : ''}${incomplete ? ' incomplete' : ''}`}>
        <div className="workout-library-title"><div><p className="eyebrow">{new Date(`${workout.date}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}</p><h2>{workout.title || 'Pass utan rubrik'}</h2><span className="workout-focus-pill">{workout.focusLabel}</span></div>{incomplete && <span className="workout-incomplete-flag" title="Passet behöver kompletteras">⚑</span>}</div>
        <p className="workout-content-preview">{workout.content}</p>
        <div className="workout-library-stats"><span>{workout.distanceMeters ? `${workout.distanceMeters.toLocaleString('sv-SE')} m` : '– m'}</span><span>{workout.durationMinutes ? `${workout.durationMinutes} min` : '– min'}</span><span>{workout.responses ? `${workout.responses} svar` : 'Inga svar'}</span><span>{workout.pass ? `Pass ${workout.pass}/5` : 'Pass –'}</span><span>{workout.rpe ? `RPE ${workout.rpe}/10` : 'RPE –'}</span></div>
        <details className="workout-library-details"><summary>Visa hela passet</summary><button type="button" className="secondary-button workout-edit-button" onClick={() => editWorkout(workout)}>Redigera pass</button><WorkoutContent content={workout.content} />{workout.note && <aside><strong>Kommentar från tränaren</strong>{workout.note}</aside>}</details>
      </article>
    })}</div> : <p className="empty">Inga pass matchar urvalet ännu.</p>}
  </section>
}

function CompetitionResultsTempus({ profiles, results: rawResults, loading, syncingProfileId, lastSyncedAt, onSync: performSync, onSyncProfile }) {
  const [profileFilter, setProfileFilter] = useState('all')
  const safeResults = Array.isArray(rawResults) ? rawResults : []
  const safeProfiles = Array.isArray(profiles) ? profiles : []
  const results = safeResults.filter((item, index, all) => {
    const same = all.filter((other) => other.profile_id === item.profile_id && other.event === item.event && (other.pool || '') === (item.pool || '')).sort((a, b) => String(b.result_date || '').localeCompare(String(a.result_date || '')))
    return same.indexOf(item) < 20
  })
  const visibleProfiles = safeProfiles.filter((profile) => profile.tempusId && (profileFilter === 'all' || profile.id === profileFilter))
  const latestSync = safeResults.reduce((latest, item) => !latest || (item.synced_at && item.synced_at > latest) ? item.synced_at : latest, null)
  const onSync = () => {
    const previous = latestSync ? `Senaste hämtning: ${new Date(latestSync).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' })}.` : 'Ingen tidigare hämtning finns sparad.'
    if (window.confirm(`Hämta Tempus-data för alla simmare?\n\n${previous}\n\nHämtningen kan ta en stund om många simmare har Tempus-ID.`)) performSync()
  }
  const strokeOrder = (event) => {
    const name = String(event || '').toLowerCase()
    const stroke = name.includes('bröst') || name.includes('breast') ? 0 : name.includes('frisim') || name.includes('freestyle') ? 1 : name.includes('rygg') || name.includes('backstroke') ? 2 : name.includes('fjäril') || name.includes('butterfly') ? 3 : name.includes('medley') ? 4 : 5
    const distance = Number((name.match(/\d+/) || ['99999'])[0])
    return [stroke, distance, name]
  }
  const syncLabel = loading ? 'Hämtar senaste Tempus-data…' : lastSyncedAt ? 'Tempus-data uppdaterad' : 'Ingen Tempus-synk registrerad ännu'
  const syncDetail = loading ? 'Resultaten uppdateras just nu.' : lastSyncedAt ? `Senast hämtad ${new Date(lastSyncedAt).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Kör en manuell hämtning eller invänta nattens cronjobb.'
  return <section className="competition-results"><div className="period-heading"><div><p className="eyebrow">Tempus Open</p><h1>Tävlingsresultat</h1></div><button className="primary-button" disabled={loading || Boolean(syncingProfileId)} onClick={onSync}>{loading ? 'Hämtar…' : 'Hämta Tempus-data för alla'}</button></div><div className={`tempus-sync-status${loading ? ' is-loading' : ''}`}><span className="tempus-sync-icon" aria-hidden="true">↻</span><div><strong>{syncLabel}</strong><small>{syncDetail}</small></div>{loading && <span className="tempus-sync-pulse" aria-hidden="true" />}</div><div className="library-controls"><label>Simmare<select value={profileFilter} onChange={(event) => setProfileFilter(event.target.value)}><option value="all">Alla simmare</option>{safeProfiles.filter((profile) => profile.tempusId).map((profile) => <option key={profile.id} value={profile.id}>{profile.emoji} {profile.displayName}</option>)}</select></label></div>{visibleProfiles.length ? <div className="competition-profile-list">{visibleProfiles.map((profile) => { const grouped = new Map(); results.filter((item) => item.profile_id === profile.id).forEach((item) => { const key = item.event; if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(item) }); const syncing = syncingProfileId === profile.id; return <details className="competition-profile-card" key={profile.id}><summary><span>{profile.emoji} {profile.displayName}<small>Tempus-ID {profile.tempusId}</small></span><span><small>{grouped.size} event</small><button className="secondary-button" disabled={loading || Boolean(syncingProfileId)} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onSyncProfile(profile.id) }}>{syncing ? 'Hämtar…' : 'Hämta'}</button></span></summary>{grouped.size ? <div className="competition-event-list">{[...grouped.entries()].sort(([a], [b]) => { const aa = strokeOrder(a); const bb = strokeOrder(b); return aa[0] - bb[0] || aa[1] - bb[1] || aa[2].localeCompare(bb[2], 'sv') }).map(([event, eventItems]) => { const pools = new Map(); eventItems.forEach((item) => { const pool = item.pool || ''; if (!pools.has(pool)) pools.set(pool, []); pools.get(pool).push(item) }); const poolEntries = [...pools.entries()].sort(([a], [b]) => { const short = (value) => /25|kort|short/i.test(value) ? 0 : /50|lång|long/i.test(value) ? 1 : 2; return short(a) - short(b) || a.localeCompare(b, 'sv') }); return <details key={event}><summary><span>{event}</span></summary><div className="competition-history">{poolEntries.map(([pool, items]) => { const best = items.slice().sort((a, b) => (a.result_time || 999999) - (b.result_time || 999999))[0]; return <div key={pool || 'unknown'}><strong>{pool || 'Bassäng saknas'} · {best.swim_time}</strong>{items.slice().sort((a, b) => String(b.result_date || '').localeCompare(String(a.result_date || ''))).map((item) => <span key={item.id}>{item.result_date ? new Date(item.result_date).toLocaleDateString('sv-SE') : 'Datum saknas'} · {item.swim_time}{item.aqua_points != null ? ` · ${item.aqua_points} Aqua` : ''}</span>)}</div>})}</div></details> })}</div> : <p className="empty">Inga sparade resultat. Klicka Hämta.</p>}</details> })}</div> : <p className="empty">Inga sparade resultat ännu. Hämta Tempus-data för en simmare eller hela gruppen.</p>}</section>
}

function CompetitionResults(props) {
  return <><CompetitionResultsTempus {...props} /><ManualHistoricalResults profiles={props.profiles} results={props.results} code={props.code} accountRole={props.accountRole} onResultsChanged={props.onResultsChanged} /></>
}

function ManualHistoricalResults({ profiles = [], results = [], code, accountRole, onResultsChanged }) {
  const [profileId, setProfileId] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [datePrecision, setDatePrecision] = useState('unknown')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const profile = profiles.find((item) => item.id === profileId) || null
  const manualResults = results.filter((item) => item.profile_id === profileId && item.source === 'manual')
  const elevated = ['head_coach', 'superadmin'].includes(accountRole)
  const resultDateLabel = (item) => item.result_date ? new Date(`${item.result_date}T12:00:00`).toLocaleDateString('sv-SE') : item.result_year ? `Cirka ${item.result_year}` : 'Datum okänt'
  const startEdit = (item) => { setEditing(item); setDatePrecision(item.date_precision || (item.result_date ? 'exact' : item.result_year ? 'year' : 'unknown')); setOpen(true); setError('') }
  const save = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true); setError('')
    try {
      await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: editing ? 'update-manual-result' : 'add-manual-result', resultId: editing?.id, profileId, event: form.get('event'), pool: form.get('pool'), swimTime: form.get('swimTime'), competitionName: form.get('competitionName'), datePrecision, resultDate: form.get('resultDate'), resultYear: form.get('resultYear') }) })
      setOpen(false); setEditing(null); await onResultsChanged()
    } catch (cause) { setError(cause.message || 'Resultatet kunde inte sparas.') } finally { setBusy(false) }
  }
  const remove = async (item) => {
    if (!window.confirm(`Ta bort ${item.event} · ${item.swim_time} för ${profile?.displayName}?`)) return
    try {
      await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-manual-result', profileId, resultId: item.id }) })
      await onResultsChanged()
    } catch (cause) { window.alert(cause.message) }
  }
  return <section className="manual-historical-results"><div><p className="eyebrow">Äldre rekord</p><h2>Lägg till historiskt personbästa</h2><p className="settings-help">Registrera tider som inte längre finns i Tempus Open. De märks som manuella och påverkar inte Tempus-notiser eller poäng.</p></div><label>Simmare<select value={profileId} onChange={(event) => { setProfileId(event.target.value); setOpen(false); setEditing(null) }}><option value="">Välj simmare</option>{profiles.map((item) => <option key={item.id} value={item.id}>{item.emoji || '🏊'} {item.displayName}</option>)}</select></label>{profile && <><button type="button" className="secondary-button" onClick={() => { setEditing(null); setDatePrecision('unknown'); setOpen((value) => !value); setError('') }}>＋ Lägg till äldre personbästa för {profile.displayName}</button>{manualResults.length > 0 && <div className="manual-historical-list">{manualResults.map((item) => <article key={item.id}><div><strong>{item.event} · {item.swim_time}</strong><small>{item.pool || 'Bassäng okänd'} · {resultDateLabel(item)}{item.competition_name ? ` · ${item.competition_name}` : ''} · Manuellt tillagt</small></div>{elevated && <div><button type="button" className="text-button" onClick={() => startEdit(item)}>Rätta</button><button type="button" className="text-button danger-text" onClick={() => remove(item)}>Ta bort</button></div>}</article>)}</div>}{open && <form className="manual-result-editor" onSubmit={save}><div className="manual-result-editor-title"><strong>{editing ? 'Rätta manuellt resultat' : 'Nytt äldre resultat'}</strong><button type="button" className="text-button" onClick={() => { setOpen(false); setEditing(null) }}>Stäng</button></div><div className="manual-result-editor-grid"><label>Gren<input name="event" required maxLength="100" placeholder="100 m frisim" defaultValue={editing?.event || ''} /></label><label>Bassäng<select name="pool" defaultValue={editing?.pool || '25m'}><option value="25m">25 meter</option><option value="50m">50 meter</option></select></label><label>Tid<input name="swimTime" required inputMode="decimal" placeholder="1:08.42" defaultValue={editing?.swim_time || ''} /></label><label>Tävling (valfritt)<input name="competitionName" maxLength="120" defaultValue={editing?.competition_name || ''} /></label><label>Datum<select value={datePrecision} onChange={(event) => setDatePrecision(event.target.value)}><option value="exact">Exakt datum</option><option value="year">Ungefärligt år</option><option value="unknown">Okänt</option></select></label>{datePrecision === 'exact' && <label>Tävlingsdatum<input name="resultDate" type="date" required defaultValue={editing?.result_date || ''} /></label>}{datePrecision === 'year' && <label>År<input name="resultYear" type="number" min="1900" max={new Date().getFullYear()} required defaultValue={editing?.result_year || ''} placeholder="t.ex. 2018" /></label>}</div>{error && <p className="form-error" role="alert">{error}</p>}<div className="manual-result-editor-actions"><button className="primary-button" disabled={busy}>{busy ? 'Sparar…' : editing ? 'Spara rättning' : 'Spara resultat'}</button><button type="button" className="secondary-button" onClick={() => { setOpen(false); setEditing(null) }}>Avbryt</button></div></form>}</>}</section>
}

function WorkoutTrendAnalysis({ analysis }) {
  if (!analysis?.focuses?.length && !analysis?.workload?.length && !analysis?.trend?.length) return null
  return <section className="workout-trend-analysis"><div className="workout-trend-heading"><div><p className="eyebrow">Passens innehåll och upplevelse</p><h2>Hur passen upplevs</h2></div><small>{analysis.personal ? 'Dagsfeedback används bara vid entydig passkoppling' : 'Inriktning jämförs med simmarnas svar'}</small></div>{analysis.basis && <p className="settings-help">{analysis.basis}</p>}{analysis.trend?.length > 0 && <TrendLineChart items={analysis.trend} />}{analysis.focuses?.length > 0 && <div className="workout-focus-list">{analysis.focuses.map((item) => <article key={item.focus}><div><strong>{item.label}</strong><small>{item.workouts} {analysis.personal ? 'registrerade simpass' : 'planerade pass'}{item.sessions > item.workouts ? ` · ${item.sessions} registrerade pass` : ''}{item.distance ? ` · ${item.distance.toLocaleString('sv-SE')} m` : ''}{item.duration ? ` · ${item.duration} min` : ''}</small></div><div className="workout-focus-metrics"><span>{item.rpe == null ? '–' : `RPE ${item.rpe}${item.rpeSpread != null ? ` ±${item.rpeSpread}` : ''}`}</span><span>{item.feeling == null ? '–' : `Känsla ${item.feeling}/5`}</span><span>{item.speedFeeling == null ? '–' : `Fart ${item.speedFeeling}/5`}</span><span>{item.temperature == null ? '–' : `Temp ${item.temperature}/5`}</span><span>{item.passRating == null ? '–' : `Pass ${item.passRating}/5`}</span></div></article>)}</div>}{analysis.workload?.length > 0 && <div className="workload-trend"><p className="eyebrow">Mängd över tid</p>{analysis.workload.map((item) => <div key={item.weekStart}><span>{new Date(`${item.weekStart}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</span><b>{item.distance ? `${item.distance.toLocaleString('sv-SE')} m` : '–'}</b><small>{item.duration ? `${item.duration} min` : 'Ingen tidsdata'} · {item.workouts} pass</small></div>)}</div>}</section>
}

function GoalCompliance({ data, code, profile }) {
  const [targets, setTargets] = useState({ strengthTarget: 3, drylandTarget: 3 })
  const [scheduled, setScheduled] = useState(null)
  useEffect(() => { apiRequest('/api/training', code).then((training) => { const latest = training.crossGoals?.filter((goal) => goal.profileId === profile.id).sort((a, b) => b.startDate.localeCompare(a.startDate))[0]; if (latest) { setTargets({ strengthTarget: latest.strengthTarget, drylandTarget: latest.drylandTarget }); setScheduled(latest) } }).catch(() => {}) }, [code, profile.id])
  const save = async (event) => { event.preventDefault(); try { const result = await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cross-goals', profileId: profile.id, ...targets, strengthTarget: Number(targets.strengthTarget), drylandTarget: Number(targets.drylandTarget) }) }); setScheduled({ ...targets, startDate: result.startDate }); window.alert(`Målen börjar gälla ${result.startDate}.`) } catch (error) { window.alert(error.message) } }
  return <section className="goal-compliance"><div className="goal-compliance-title"><p className="eyebrow">Överenskomna träningspass</p><strong>Uppföljning för vald period</strong><small>Genomförda pass jämförs med veckomålet.</small></div>
    {data.currentWeekGoal && <GoalProgressBlock title="Pågående vecka · simning" completed={data.currentWeekGoal.completed} target={data.currentWeekGoal.target} percentage={data.currentWeekGoal.percentage} detail={data.currentWeekGoal.remaining ? `${data.currentWeekGoal.remaining} pass kvar enligt överenskommelsen` : 'Veckomålet är uppnått'} />}
    {data.goalProgress && <GoalProgressBlock title="Avslutade veckor · simning" completed={data.goalProgress.completed} target={data.goalProgress.expected} percentage={data.goalProgress.percentage} detail={`Målet nåddes ${data.goalProgress.weeksReached} av ${data.goalProgress.weeksCount} veckor · ${Math.max(0, data.goalProgress.expected - data.goalProgress.completed)} pass under mål`} />}
    {data.currentCrossGoals?.strength?.target > 0 && <GoalProgressBlock title="Pågående vecka · styrka" completed={data.currentCrossGoals.strength.completed} target={data.currentCrossGoals.strength.target} percentage={data.currentCrossGoals.strength.percentage} detail={`${data.currentCrossGoals.strength.remaining} pass kvar`} />}
    {data.currentCrossGoals?.dryland?.target > 0 && <GoalProgressBlock title="Pågående vecka · landträning" completed={data.currentCrossGoals.dryland.completed} target={data.currentCrossGoals.dryland.target} percentage={data.currentCrossGoals.dryland.percentage} detail={`${data.currentCrossGoals.dryland.remaining} pass kvar`} />}
    {data.crossProgress?.strength && <GoalProgressBlock title="Vald period · styrka" completed={data.crossProgress.strength.completed} target={data.crossProgress.strength.expected} percentage={data.crossProgress.strength.percentage} detail={`Målet nåddes ${data.crossProgress.strength.weeksReached} av ${data.crossProgress.strength.weeksCount} veckor · ${Math.max(0, data.crossProgress.strength.expected - data.crossProgress.strength.completed)} pass under mål`} />}
    {data.crossProgress?.dryland && <GoalProgressBlock title="Vald period · landträning" completed={data.crossProgress.dryland.completed} target={data.crossProgress.dryland.expected} percentage={data.crossProgress.dryland.percentage} detail={`Målet nåddes ${data.crossProgress.dryland.weeksReached} av ${data.crossProgress.dryland.weeksCount} veckor · ${Math.max(0, data.crossProgress.dryland.expected - data.crossProgress.dryland.completed)} pass under mål`} />}
    <form onSubmit={save}><p className="eyebrow">Simning, landträning och styrka</p><label>Styrkepass / vecka<input type="number" min="0" max="7" value={targets.strengthTarget} onChange={(event) => setTargets({ ...targets, strengthTarget: event.target.value })} /></label><label>Landträningar / vecka<input type="number" min="0" max="7" value={targets.drylandTarget} onChange={(event) => setTargets({ ...targets, drylandTarget: event.target.value })} /></label><button>Spara från nästa måndag</button><small>Simmaren anger sitt eget simmål under Mina mål. Förslag: landträning mån/ons/fre · styrka tis/tor/sön.</small>{scheduled && <small>Senast planerat: {scheduled.strengthTarget} styrka + {scheduled.drylandTarget} land från {scheduled.startDate}</small>}</form>
  </section>
}

function GoalProgressBlock({ title, completed, target, percentage, detail }) {
  return <div><p className="eyebrow">{title}</p><strong>{completed} av {target} pass · {percentage}%</strong><span><i style={{ width: `${Math.min(100, percentage)}%` }} /></span><small>{detail}</small></div>
}

function PointProgress({ info, compact = false }) {
  if (!info?.level) return null
  const range = info.next ? info.next.minPoints - info.level.minPoints : 1
  const progress = info.next ? ((info.total - info.level.minPoints) / range) * 100 : 100
  return <div className={`point-progress ${compact ? 'compact' : ''}`}><div><strong>{info.level.emoji} {info.level.name}</strong><b>{info.total} poäng</b></div><span><i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></span><small>{info.next ? `${info.next.remaining} poäng kvar till ${info.next.name}` : 'Högsta nivån är nådd'}</small></div>
}

function CoachRewards({ code }) {
  const [data, setData] = useState({ levels: [], rules: [], profiles: [] })
  const [drafts, setDrafts] = useState({})
  const [newLevel, setNewLevel] = useState({ name: 'Platina', emoji: '🏅', minPoints: 400 })
  const [status, setStatus] = useState('')
  const load = () => apiRequest('/api/points', code).then((next) => { setData(next); setDrafts(Object.fromEntries(next.levels.map((level) => [level.id, { ...level }]))); setStatus('') })
  useEffect(() => { load().catch((error) => setStatus(error.message)) }, [code])
  const levelFor = (total, levels) => [...levels].sort((a, b) => b.minPoints - a.minPoints).find((level) => total >= level.minPoints) || levels[0]
  const updateDraft = (id, key, value) => setDrafts((current) => ({ ...current, [id]: { ...current[id], [key]: value } }))
  const save = async (level) => {
    const draft = drafts[level.id]
    const previewLevels = data.levels.map((item) => item.id === level.id ? { ...draft, minPoints: Number(draft.minPoints) } : item)
    const affected = data.profiles.filter((profile) => levelFor(profile.total, data.levels)?.id !== levelFor(profile.total, previewLevels)?.id).length
    if (draft.minPoints === 0 && level.minPoints !== 0) return window.alert('Startnivån måste ligga på 0 poäng.')
    if (!window.confirm(`${affected} profil${affected === 1 ? '' : 'er'} kan få en annan nivå. Vill du spara ändringen?`)) return
    try { await apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update-level', ...draft, minPoints: Number(draft.minPoints) }) }); await load() } catch (error) { window.alert(error.message) }
  }
  const add = async (event) => {
    event.preventDefault()
    try { await apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add-level', ...newLevel, minPoints: Number(newLevel.minPoints) }) }); setNewLevel({ name: '', emoji: '🏅', minPoints: '' }); await load() } catch (error) { window.alert(error.message) }
  }
  const remove = async (level) => {
    if (!confirmDestructive(`Nivån “${level.name}” tas bort. Simmarnas poäng behålls och deras nivå räknas om.`)) return
    try { await apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-level', id: level.id }) }); await load() } catch (error) { window.alert(error.message) }
  }
  return <section className="coach-rewards"><div className="period-heading"><div><p className="eyebrow">Aktivitet i appen – inte simprestation</p><h2>Poäng & nivåer</h2></div></div>{status ? <p className="form-error">{status}</p> : <><div className="reward-admin-grid"><section className="coach-card"><h3>Så får simmarna poäng</h3><div className="point-rules">{data.rules.map((rule) => <div key={rule.activity}><strong>{rule.activity}</strong><b>+{rule.points} p</b><small>{rule.limit}</small></div>)}</div></section><section className="coach-card"><h3>Fördelning just nu</h3><div className="level-distribution">{data.levels.map((level) => <div key={level.id}><span>{level.emoji}</span><strong>{data.profiles.filter((profile) => profile.level?.name === level.name).length}</strong><small>{level.name}</small></div>)}</div><p className="reward-note">Nivån visar aktivitet och positiva bidrag i Simkoll. Den bedömer inte simmarens prestation eller förmåga.</p></section></div><section className="level-editor"><div><h3>Nivågränser</h3><small>Simmarnas poäng förändras inte när en gräns ändras.</small></div>{data.levels.map((level, index) => { const draft = drafts[level.id] || level; return <article key={level.id}><input className="emoji-input" aria-label="Emoji" maxLength="16" value={draft.emoji} onChange={(event) => updateDraft(level.id, 'emoji', event.target.value)} /><input aria-label="Nivåns namn" maxLength="30" value={draft.name} onChange={(event) => updateDraft(level.id, 'name', event.target.value)} /><label>Från <input type="number" min={index === 0 ? 0 : 1} disabled={index === 0} value={draft.minPoints} onChange={(event) => updateDraft(level.id, 'minPoints', event.target.value)} /> poäng</label><span>{data.profiles.filter((profile) => levelFor(profile.total, Object.values(drafts).map((item) => ({ ...item, minPoints: Number(item.minPoints) })))?.id === level.id).length} profiler i förhandsvisningen</span><button onClick={() => save(level)}>Spara</button>{index > 0 && <button className="delete-level" onClick={() => remove(level)}>Radera</button>}</article> })}<form className="add-level" onSubmit={add}><input className="emoji-input" required maxLength="16" value={newLevel.emoji} onChange={(event) => setNewLevel({ ...newLevel, emoji: event.target.value })} /><input required maxLength="30" placeholder="Ny nivå" value={newLevel.name} onChange={(event) => setNewLevel({ ...newLevel, name: event.target.value })} /><label>Från <input type="number" min="1" required value={newLevel.minPoints} onChange={(event) => setNewLevel({ ...newLevel, minPoints: event.target.value })} /> poäng</label><button className="primary-button">Lägg till nivå +</button></form></section></>}</section>
}

function DevelopmentTalkCoach({ code, profiles }) {
  const [talks, setTalks] = useState([])
  const [selected, setSelected] = useState(null)
  const [status, setStatus] = useState('')
  const [selectedProfileIds, setSelectedProfileIds] = useState([])
  const [meetingDate, setMeetingDate] = useState(todayKey())
  const load = () => apiRequest('/api/goals?talks=true', code).then((data) => setTalks(data.talks || []))
  useEffect(() => { load().catch((error) => setStatus(error.message)) }, [code])
  const open = (talk) => { setSelected(talk); setStatus('') }
  const profileIds = new Set(profiles.map((profile) => profile.id))
  const visibleTalks = talks.filter((talk) => profileIds.has(talk.swimmerId))
  const latestTalkBySwimmer = new Map()
  visibleTalks.forEach((talk) => { const previous = latestTalkBySwimmer.get(talk.swimmerId); if (!previous || ((!previous.enabled || previous.status === 'completed') && talk.enabled && talk.status !== 'completed')) latestTalkBySwimmer.set(talk.swimmerId, talk) })
  const statusFor = (talk) => {
    if (!talk) return { label: 'Inte bokat', tone: 'unbooked' }
    if (talk.status === 'completed') return { label: 'Genomfört · kan bokas igen', tone: 'done' }
    if (!talk.enabled) return { label: 'Avstängt · kan bokas igen', tone: 'off' }
    if (talk.status === 'prepared') return { label: 'Redo för samtal', tone: 'ready' }
    const hasAnswers = Object.entries(talk.swimmerAnswers || {}).some(([key, value]) => key !== '__step' && String(value || '').trim())
    if (hasAnswers) return { label: 'Påbörjat', tone: 'started' }
    if (talk.swimmerSeenAt) return { label: 'Öppnat · inte påbörjat', tone: 'seen' }
    return { label: 'Inte öppnat', tone: 'waiting' }
  }
  const canSchedule = (profile) => { const latest = latestTalkBySwimmer.get(profile.id); return !latest || !latest.enabled || latest.status === 'completed' }
  const scheduleableProfiles = profiles.filter(canSchedule)
  const toggle = async (talk) => { try { const data = await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle-talk', id: talk.id, enabled: !talk.enabled }) }); setTalks((current) => current.map((item) => item.id === talk.id ? data.talk : item)); if (selected?.id === talk.id) setSelected(data.talk) } catch (error) { setStatus(error.message) } }
  const createMany = async (event) => {
    event.preventDefault()
    if (!selectedProfileIds.length) return
    try {
      const data = await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create-talks', profileIds: selectedProfileIds, meetingDate }) })
      await load()
      setSelectedProfileIds([])
      setStatus(data.talks?.length ? `${data.talks.length} samtal skapat${data.skipped ? ` · ${data.skipped} redan aktiva hoppades över` : ''}. Pushnotis skickas där det är aktiverat.` : (data.message || 'Inga nya samtal skapades.'))
    } catch (error) { setStatus(error.message) }
  }
  const remove = async (talk) => {
    const swimmer = profiles.find((item) => item.id === talk.swimmerId)
    if (!confirmDestructive(`Radera utvecklingssamtalet för ${swimmer?.displayName || 'simmaren'} den ${talk.meetingDate}? Svaren och anteckningarna tas bort permanent.`)) return
    try {
      await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-talk', id: talk.id }) })
      setTalks((current) => current.filter((item) => item.id !== talk.id))
      if (selected?.id === talk.id) setSelected(null)
      setStatus('Samtalet är raderat.')
    } catch (error) { setStatus(error.message) }
  }
  const saved = (talk) => { setSelected(talk); setTalks((current) => current.map((item) => item.id === talk.id ? talk : item)) }
  return <section className="coach-card talk-coach"><div className="period-heading"><div><p className="eyebrow">Förberedelser och överenskommelser</p><h2>Utvecklingssamtal</h2></div></div>{!selected ? <>
    <form className="talk-bulk-form" onSubmit={createMany}>
      <div className="talk-roster-heading"><div><h3>Gruppens förberedelser</h3><p>{scheduleableProfiles.length ? `${scheduleableProfiles.length} utan aktiv bokning · välj simmare för nytt samtal.` : 'Alla i gruppen har ett aktivt samtal. Öppna en rad för att se svaren.'}</p></div>{scheduleableProfiles.length > 0 && <button type="button" className="secondary-button" onClick={() => setSelectedProfileIds(selectedProfileIds.length === scheduleableProfiles.length ? [] : scheduleableProfiles.map((profile) => profile.id))}>{selectedProfileIds.length === scheduleableProfiles.length ? 'Avmarkera alla' : `Markera alla utan bokning (${scheduleableProfiles.length})`}</button>}</div>
      <DevelopmentTalkRoster profiles={profiles} latestTalkBySwimmer={latestTalkBySwimmer} statusFor={statusFor} canSchedule={canSchedule} selectedProfileIds={selectedProfileIds} onToggleProfile={(id, checked) => setSelectedProfileIds((current) => checked ? [...new Set([...current, id])] : current.filter((value) => value !== id))} onOpen={open} />
      {scheduleableProfiles.length > 0 && selectedProfileIds.length > 0 && <div className="talk-bulk-actions"><label>Datum för samtalet<input type="date" value={meetingDate} onChange={(event) => setMeetingDate(event.target.value)} required /></label><button className="primary-button" type="submit">Skapa samtal för {selectedProfileIds.length} simmare +</button></div>}
      <small className="talk-bulk-hint">Redo för samtal betyder att simmaren skickat sina förberedelser. Öppna samtalet, gå igenom svaren tillsammans och markera det som genomfört efter mötet.</small>
    </form>
    <details className="talk-all-records"><summary>Samtal och svar ({visibleTalks.length})</summary><div className="talk-coach-list">{visibleTalks.length ? visibleTalks.map((talk) => { const swimmer = profiles.find((item) => item.id === talk.swimmerId); const state = statusFor(talk); return <article key={talk.id} className="talk-coach-row"><button type="button" className="talk-row-open" onClick={() => open(talk)}><span>{swimmer?.emoji || '🏊'}</span><strong>{swimmer?.displayName || 'Simmare'}</strong><small>{talk.meetingDate} · {state.label}</small>→</button><button type="button" className={`talk-switch ${talk.enabled ? 'on' : ''}`} onClick={() => toggle(talk)} aria-label={`${talk.enabled ? 'Inaktivera' : 'Aktivera'} utvecklingssamtal`}>{talk.enabled ? 'På' : 'Av'}</button><button type="button" className="talk-delete-button" onClick={() => remove(talk)} aria-label={`Radera samtal för ${swimmer?.displayName || 'simmare'}`}>Radera</button></article> }) : <p className="empty">Inga samtal ännu.</p>}</div></details>
    {status && <small className="coach-note-status" role="status">{status}</small>}
  </> : <><DevelopmentTalkEditor key={selected.id} talk={selected} swimmerName={profiles.find((item) => item.id === selected.swimmerId)?.displayName || 'Simmare'} code={code} request={apiRequest} onBack={() => setSelected(null)} onSaved={saved} onRemove={remove} />{status && <p role="status">{status}</p>}</>}</section>
}

const DEFAULT_STRENGTH_PROGRAMS = [
  { title: 'Basstyrka · 30 min', description: 'Ett enkelt helkroppspass med fokus på teknik och kontroll.', content: '1. Uppvärmning: 5 min lätt cykel eller jogg\n2. Knäböj: 3 x 8\n3. Armhävningar: 3 x 8–12\n4. Höftlyft: 3 x 12\n5. Planka: 3 x 30 sek\n6. Nedvarvning och rörlighet: 5 min' },
  { title: 'Bål och stabilitet · 20 min', description: 'Kort program för bål, balans och kontroll runt axlar och höfter.', content: '1. Dead bug: 3 x 8 per sida\n2. Sidoplanka: 3 x 20 sek per sida\n3. Bird dog: 3 x 8 per sida\n4. Höftlyft på ett ben: 3 x 8 per sida\n5. Pallof press: 3 x 10 per sida' },
  { title: 'Explosivitet · 25 min', description: 'Kontrollerad explosiv styrka med lång vila och bra teknik.', content: '1. Uppvärmning: 5 min\n2. Kettlebell-sving: 4 x 6\n3. Utfallshopp: 3 x 5 per sida\n4. Medicinbollskast: 4 x 5\n5. Excentriska chins eller rodd: 3 x 6\n6. Rörlighet: 5 min' },
]

function StrengthProgramLibrary({ code, onChanged, canManagePrograms, aiEnabled, programType = 'strength' }) {
  const kind = programKind(programType)
  const [imageEditing, setImageEditing] = useState(null)
  const [programs, setPrograms] = useState([]); const [editing, setEditing] = useState(null); const [status, setStatus] = useState('')
  const load = () => apiRequest('/api/training', code).then((data) => setPrograms((data.programs || []).filter((item) => item.type === programType)))
  useEffect(() => { load().catch(() => {}) }, [code])
  const save = async () => { if (!editing) return; setStatus('Sparar…'); try { await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update-program', type: programType, programId: editing.id, title: editing.title, description: editing.description, content: editing.content }) }); setEditing(null); setStatus('Programmet är uppdaterat ✓'); await load(); onChanged?.() } catch (error) { setStatus(error.message) } }
  const archive = async (program) => { if (!window.confirm(`Arkivera “${program.title}”? Det döljer programmet från nya tilldelningar men sparar historiken.`)) return; try { await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'archive-program', type: programType, programId: program.id }) }); setStatus('Programmet är arkiverat ✓'); await load(); onChanged?.() } catch (error) { setStatus(error.message) } }
  const remove = async (program) => { if (program.assignedCount) return setStatus(`Programmet används av ${program.assignedCount} simmare. Ta bort tilldelningarna först.`); if (!window.confirm(`Radera “${program.title}” permanent?`)) return; try { await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-program', type: programType, programId: program.id }) }); setStatus('Programmet är raderat.'); await load(); onChanged?.() } catch (error) { setStatus(error.message) } }
  return <section className="coach-card strength-program-library"><div className="period-heading"><div><p className="eyebrow">Redigerbara mallar</p><h3>{programType === 'dryland' ? 'Bibliotek för landträning' : 'Styrkeprogrambibliotek'}</h3></div><small>{programs.filter((program) => program.active !== false).length} aktiva program</small></div>{imageEditing ? <StrengthProgramImagesEditor program={imageEditing} code={code} request={apiRequest} aiEnabled={aiEnabled} onClose={() => setImageEditing(null)} onSaved={async () => { setImageEditing(null); await load(); onChanged?.() }} /> : editing ? <div className="program-edit-form"><label>Namn<input value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} /></label><label>Beskrivning<textarea value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} /></label><label>Övningar, set och repetitioner<textarea className="program-content-input" value={editing.content} onChange={(event) => setEditing({ ...editing, content: event.target.value })} /></label><div><button type="button" className="primary-button" onClick={save}>Spara ändring</button><button type="button" className="secondary-button" onClick={() => setEditing(null)}>Avbryt</button></div></div> : <div className="strength-program-library-list">{programs.map((program) => <article key={program.id} className={program.active === false ? 'archived' : ''}><div><strong>{program.title}{program.active === false && <em> · Arkiverat</em>}</strong><small>{program.description}</small><small>{program.assignedCount ? `Används av ${program.assignedCount} simmare` : 'Inte tilldelat'}</small></div>{canManagePrograms && <div className="program-library-actions"><button type="button" className="secondary-button" onClick={() => setImageEditing(program)}>Övningsbilder</button><button type="button" className="secondary-button" onClick={() => setEditing({ ...program })}>Redigera</button>{program.active !== false && <button type="button" className="secondary-button" onClick={() => archive(program)}>Arkivera</button>}<button type="button" className="danger-button" onClick={() => remove(program)}>Radera</button></div>}</article>)}{!programs.length && <p className="empty">Inga programmallar ännu. Kör de senaste databasmigreringarna för att lägga in dem.</p>}</div>}{status && <small className="coach-note-status">{status}</small>}</section>
}

function CoachStrengthPrograms({ code, profiles, accountRole, aiEnabled, programType = 'strength' }) {
  const kind = programKind(programType)
  const [training, setTraining] = useState(null)
  const [libraryRevision, setLibraryRevision] = useState(0)
  const [savingProfile, setSavingProfile] = useState('')
  const [status, setStatus] = useState('')
  const [goalForm, setGoalForm] = useState({})
  const [reviews, setReviews] = useState({})
  const elevated = ['head_coach', 'superadmin'].includes(accountRole)
  const load = () => apiRequest('/api/training', code).then(setTraining)
  useEffect(() => { load().catch((error) => setStatus(error.message)) }, [code])
  const programs = (training?.programs || []).filter((program) => program.type === programType && program.active !== false)
  const visibleProfileIds = new Set(profiles.map((profile) => profile.id))
  const assignments = (training?.assignments || []).filter((assignment) => assignment.program.type === programType && visibleProfileIds.has(assignment.profileId))
  const assignmentFor = (profileId) => assignments.find((assignment) => assignment.profileId === profileId)
  const profileFor = (profileId) => profiles.find((profile) => profile.id === profileId)
  const assign = async (profileId, programId) => {
    if (!programId) return
    setSavingProfile(profileId); setStatus('')
    try {
      await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'assign', type: programType, programId, profileId }) })
      await load(); setStatus(`${kind.title}met är tilldelat ✓`)
    } catch (error) { setStatus(error.message) } finally { setSavingProfile('') }
  }
  const remove = async (profile, assignment) => {
    if (!window.confirm(`Ta bort “${assignment.program.title}” från ${profile.displayName}? Genomförda pass och resultat sparas.`)) return
    setSavingProfile(profile.id); setStatus('')
    try {
      await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'remove-assignment', assignmentId: assignment.id }) })
      await load(); setStatus('Tilldelningen är borttagen. Historiken är sparad.')
    } catch (error) { setStatus(error.message) } finally { setSavingProfile('') }
  }
  const addGoal = async (assignmentId) => {
    const form = goalForm[assignmentId] || { rewardPoints: 5 }
    if (!form.title?.trim() || !form.description?.trim()) return
    try {
      await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'program-goal', assignmentId, ...form, rewardPoints: Number(form.rewardPoints || 5) }) })
      setGoalForm((current) => ({ ...current, [assignmentId]: { rewardPoints: 5, title: '', description: '' } })); await load()
    } catch (error) { window.alert(error.message) }
  }
  const review = async (goalId, approved) => {
    try {
      await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'review-program-goal', goalId, approved, feedback: reviews[goalId] || '' }) })
      setReviews((current) => ({ ...current, [goalId]: '' })); await load()
    } catch (error) { window.alert(error.message) }
  }
  const activeProfiles = profiles
  return <section className="coach-programs coach-strength-programs">
    <div className="period-heading strength-page-heading"><div><p className="eyebrow">Bibliotek · import · tilldelningar</p><h2>{kind.title}</h2><small>Skapa program på ett ställe och koppla dem till rätt simmare.</small></div><span aria-hidden="true">{kind.icon}</span></div>
    <section className="strength-page-summary" aria-label={`Översikt ${kind.name}`}><article><span>📚</span><strong>{programs.length}</strong><small>aktiva program</small></article><article><span>🏊</span><strong>{new Set(assignments.map((item) => item.profileId)).size}</strong><small>simmare med program</small></article><article><span>＋</span><strong>{Math.max(0, activeProfiles.length - new Set(assignments.map((item) => item.profileId)).size)}</strong><small>utan program</small></article></section>
    {elevated ? <StrengthProgramImport programType={programType} code={code} request={apiRequest} aiEnabled={aiEnabled} onSaved={() => { setLibraryRevision((value) => value + 1); load().catch((error) => setStatus(error.message)) }} /> : <section className="coach-card strength-role-note"><span>🔒</span><div><strong>Import och redigering hanteras av huvudtränare</strong><small>Du kan använda klubbens färdiga program och tilldela dem till simmare nedan.</small></div></section>}
    {elevated && <StrengthProgramBuilder programType={programType} programs={programs} profiles={profiles} code={code} request={apiRequest} aiEnabled={aiEnabled} onSaved={() => { setLibraryRevision((value) => value + 1); return load().catch((error) => setStatus(error.message)) }} />}
    <StrengthProgramLibrary programType={programType} key={libraryRevision} code={code} onChanged={load} canManagePrograms={elevated} aiEnabled={aiEnabled} />
    <ProgramBulkAssign programs={programs} profiles={profiles} programType={programType} code={code} onChanged={load} />
    <section className="coach-card strength-assignment-manager"><div className="period-heading"><div><p className="eyebrow">Per simmare</p><h3>Tilldela {kind.name}</h3></div><small>{assignments.length} aktiva tilldelningar</small></div><div className="strength-assignment-list">{profiles.map((profile) => { const assignment = assignmentFor(profile.id); const busy = savingProfile === profile.id; return <article key={profile.id} className={assignment ? 'assigned' : ''}><span className="strength-assignment-avatar">{profile.emoji || '🏊'}</span><div><strong>{profile.displayName}</strong><small>{assignment ? assignment.program.title : `Inget ${kind.name}`}</small></div><label><span className="sr-only">Välj program för {profile.displayName}</span><select value={assignment?.program.id || ''} disabled={busy || !programs.length} onChange={(event) => assign(profile.id, event.target.value)}><option value="">{programs.length ? 'Välj program…' : 'Inga aktiva program'}</option>{programs.map((program) => <option value={program.id} key={program.id}>{program.title}</option>)}</select></label>{assignment && <button type="button" className="strength-assignment-remove" disabled={busy} onClick={() => remove(profile, assignment)} aria-label={`Ta bort ${assignment.program.title} från ${profile.displayName}`} title="Ta bort tilldelningen">{busy ? '…' : '×'}</button>}</article> })}</div>{!profiles.length && <p className="empty">Inga simmare finns i valda grupper.</p>}{status && <small className="coach-note-status" role="status">{status}</small>}</section>
    {assignments.length > 0 && <section className="strength-program-followup"><div className="period-heading"><div><p className="eyebrow">Aktiva program</p><h3>Innehåll och programmål</h3></div></div><div className="coach-program-list">{assignments.map((assignment) => { const profile = profileFor(assignment.profileId); const goals = (training?.programGoals || []).filter((goal) => goal.assignmentId === assignment.id); const form = goalForm[assignment.id] || { rewardPoints: 5 }; return <article key={assignment.id}><header><span>{kind.icon}</span><div><strong>{assignment.program.title}</strong><small>{profile ? `${profile.emoji} ${profile.displayName}` : 'Okänd profil'}</small></div></header><p>{assignment.program.description}</p>{programType === 'dryland' && <DrylandHistory logs={training?.drylandLogs || []} sessions={training?.sessions || []} profileId={assignment.profileId} />}<details><summary>Visa programmet</summary><pre>{assignment.program.content}</pre></details><div className="coach-program-goals">{goals.map((goal) => <div key={goal.id}><strong>🎯 {goal.title} · {goal.rewardPoints} p</strong><p>{goal.description}</p><small>{goal.status === 'submitted' ? 'Väntar på godkännande' : goal.status === 'approved' ? 'Godkänt' : goal.status === 'continue' ? 'Simmaren fortsätter jobba' : 'Pågår'}</small>{goal.status === 'submitted' && <div className="review-goal"><input maxLength="500" placeholder="Återkoppling till simmaren…" value={reviews[goal.id] || ''} onChange={(event) => setReviews((current) => ({ ...current, [goal.id]: event.target.value }))} /><button onClick={() => review(goal.id, false)}>Fortsätt jobba</button><button className="approve" onClick={() => review(goal.id, true)}>Godkänn +{goal.rewardPoints} p</button></div>}</div>)}</div><div className="new-program-goal"><input placeholder="Nytt mål" value={form.title || ''} onChange={(event) => setGoalForm((current) => ({ ...current, [assignment.id]: { ...form, title: event.target.value } }))} /><input placeholder="Vad ska simmaren klara?" value={form.description || ''} onChange={(event) => setGoalForm((current) => ({ ...current, [assignment.id]: { ...form, description: event.target.value } }))} /><select value={form.rewardPoints || 5} onChange={(event) => setGoalForm((current) => ({ ...current, [assignment.id]: { ...form, rewardPoints: Number(event.target.value) } }))}><option value="5">5 poäng</option><option value="10">10 poäng</option><option value="20">20 poäng</option></select><button onClick={() => addGoal(assignment.id)}>Lägg till mål</button></div></article> })}</div></section>}
  </section>
}

function CoachPrograms({ code, profiles, onOpenDryland }) {
  const [training, setTraining] = useState(null)
  const [goalForm, setGoalForm] = useState({})
  const [reviews, setReviews] = useState({})
  const [status, setStatus] = useState('')
  const load = () => apiRequest('/api/training', code).then(setTraining)
  useEffect(() => { load().catch((error) => setStatus(error.message)) }, [])
  const addGoal = async (assignmentId) => {
    const form = goalForm[assignmentId] || { rewardPoints: 5 }
    if (!form.title?.trim() || !form.description?.trim()) return
    try {
      await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'program-goal', assignmentId, ...form, rewardPoints: Number(form.rewardPoints || 5) }) })
      setGoalForm({ ...goalForm, [assignmentId]: { rewardPoints: 5, title: '', description: '' } }); await load()
    } catch (error) { window.alert(error.message) }
  }
  const review = async (goalId, approved) => {
    try {
      await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'review-program-goal', goalId, approved, feedback: reviews[goalId] || '' }) })
      setReviews({ ...reviews, [goalId]: '' }); await load()
    } catch (error) { window.alert(error.message) }
  }
  const profileFor = (id) => profiles.find((profile) => profile.id === id)
  const weekSessions = (profileId) => currentWeekSwims({ sessions: training?.sessions?.filter((item) => item.profileId === profileId) || [] })
  const weekCount = (profileId, type) => (training?.sessions || []).filter((item) => item.profileId === profileId && item.type === type && item.date >= dateKey(weekStart(new Date())) && item.date <= todayKey()).length
  const activeGoalFor = (profileId) => (training?.seasonGoals || []).find((goal) => goal.profileId === profileId && goal.active && localDateValue() >= goal.startDate && localDateValue() <= goal.endDate)
  const activeCrossGoalFor = (profileId) => (training?.crossGoals || []).find((goal) => goal.profileId === profileId && goal.startDate <= todayKey() && (!goal.endDate || goal.endDate >= todayKey()))
  return <section className="coach-programs">
    <div className="period-heading"><div><p className="eyebrow">Landträning · eget ansvar</p><h2>Träningsprogram</h2><small>Styrkeprogram hanteras nu under den egna menypunkten Styrkeprogram.</small></div></div>
    <section className="coach-card season-overview"><h3>Veckans träningsmål</h3><div>{profiles.map((profile) => { const goal = activeGoalFor(profile.id), cross = activeCrossGoalFor(profile.id); const count = weekSessions(profile.id), strength = weekCount(profile.id, 'strength'), dryland = weekCount(profile.id, 'dryland'); const goals = [{ label: 'Simning', icon: '🏊', count, target: goal?.target }, { label: 'Styrka', icon: '🏋️', count: strength, target: cross?.strengthTarget }, { label: 'Land', icon: '🤸', count: dryland, target: cross?.drylandTarget }]; return <article key={profile.id}><span>{profile.emoji}</span><div><strong>{profile.displayName}</strong><small>{goals.map((item) => `${item.icon} ${item.target != null ? `${item.count}/${item.target}` : `${item.label}: inget mål`}`).join('  ')}</small></div><b>{goals.some((item) => item.target != null && item.count < item.target) ? 'Pågår' : goals.some((item) => item.target != null) ? '✓' : 'Saknar mål'}</b></article> })}</div></section>
    <section className="coach-card missing-weekly-goals"><h3>Profiler utan komplett veckomål</h3><div>{profiles.filter((profile) => !activeGoalFor(profile.id) || !activeCrossGoalFor(profile.id)).map((profile) => { const missing = []; if (!activeGoalFor(profile.id)) missing.push('simning'); if (!activeCrossGoalFor(profile.id)) missing.push('styrka/land'); return <span key={profile.id}>{profile.emoji} {profile.displayName} <small>saknar {missing.join(' och ')}</small></span> })}</div>{!profiles.some((profile) => !activeGoalFor(profile.id) || !activeCrossGoalFor(profile.id)) && <p className="empty">Alla aktiva profiler har kompletta veckomål.</p>}</section>
    <section className="coach-card"><h3>Landträningsprogram</h3><p>Skapa, importera och tilldela program via det egna menyvalet. Befintliga program finns kvar där.</p><button type="button" className="primary-button" onClick={onOpenDryland}>Öppna landträningsprogram →</button></section>
    <div className="coach-program-list">{training?.assignments?.filter((assignment) => assignment.program.type !== 'strength').map((assignment) => { const profile = profileFor(assignment.profileId); const goals = training.programGoals.filter((goal) => goal.assignmentId === assignment.id); const form = goalForm[assignment.id] || { rewardPoints: 5 }; return <article key={assignment.id}><header><span>🤸</span><div><strong>{assignment.program.title}</strong><small>{profile ? `${profile.emoji} ${profile.displayName}` : 'Okänd profil'}</small></div></header><p>{assignment.program.description}</p><details><summary>Visa programmet</summary><pre>{assignment.program.content}</pre></details><div className="coach-program-goals">{goals.map((goal) => <div key={goal.id}><strong>🎯 {goal.title} · {goal.rewardPoints} p</strong><p>{goal.description}</p><small>{goal.status === 'submitted' ? 'Väntar på godkännande' : goal.status === 'approved' ? 'Godkänt' : goal.status === 'continue' ? 'Simmaren fortsätter jobba' : 'Pågår'}</small>{goal.status === 'submitted' && <div className="review-goal"><input maxLength="500" placeholder="Återkoppling till simmaren…" value={reviews[goal.id] || ''} onChange={(event) => setReviews({ ...reviews, [goal.id]: event.target.value })} /><button onClick={() => review(goal.id, false)}>Fortsätt jobba</button><button className="approve" onClick={() => review(goal.id, true)}>Godkänn +{goal.rewardPoints} p</button></div>}</div>)}</div><div className="new-program-goal"><input placeholder="Nytt mål" value={form.title || ''} onChange={(event) => setGoalForm({ ...goalForm, [assignment.id]: { ...form, title: event.target.value } })} /><input placeholder="Vad ska simmaren klara?" value={form.description || ''} onChange={(event) => setGoalForm({ ...goalForm, [assignment.id]: { ...form, description: event.target.value } })} /><select value={form.rewardPoints || 5} onChange={(event) => setGoalForm({ ...goalForm, [assignment.id]: { ...form, rewardPoints: Number(event.target.value) } })}><option value="5">5 poäng</option><option value="10">10 poäng</option><option value="20">20 poäng</option></select><button onClick={() => addGoal(assignment.id)}>Lägg till mål</button></div></article> })}</div>
  </section>
}

const FEEDBACK_OPTIONS = [
  ['progress', 'Bra framsteg · +5'], ['strong_week', 'Stark träningsvecka · +5'],
  ['milestone', 'Delmål klart · +10'], ['goal_complete', 'Utvecklingsmål klart · +20'],
]

function CoachGoalCard({ goal, code, owner, entry, setFeedback, updateGoal, updateStatus, sendFeedback, remove, onRead, onMediaSaved, initialAttachment, externalBusy = false, initiallyExpanded = false }) {
  const [expanded, setExpanded] = useState(initiallyExpanded)
  const [editing, setEditing] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [mediaBusy, setMediaBusy] = useState(false)
  const [editDraft, setEditDraft] = useState({ title: goal.title, description: goal.description, nextStep: goal.nextStep || '' })
  const panelId = `coach-goal-${goal.id}`
  useEffect(() => { if (initiallyExpanded) setExpanded(true) }, [initiallyExpanded])
  const beginEdit = () => { setEditDraft({ title: goal.title, description: goal.description, nextStep: goal.nextStep || '' }); setEditing(true) }
  const saveEdit = async (event) => {
    event.preventDefault()
    if (!editDraft.title.trim() || !editDraft.description.trim()) return
    setSavingEdit(true)
    try { await updateGoal(goal.id, editDraft); setEditing(false) } catch (error) { window.alert(error.message) } finally { setSavingEdit(false) }
  }
  const visiblyUpdated = goal.updatedAt && goal.createdAt && new Date(goal.updatedAt) - new Date(goal.createdAt) > 60000
  const unreadReplies = goal.updates.filter((update) => update.authorRole === 'swimmer' && !update.coachSeenAt).length
  return <article id={`coach-goal-card-${goal.id}`} className={`coach-goal-card${expanded ? ' expanded' : ''}`}>
    <button type="button" className="coach-goal-toggle" disabled={mediaBusy || externalBusy} aria-expanded={expanded} aria-controls={panelId} onClick={() => { if (!expanded && unreadReplies) onRead(goal.id); setExpanded((current) => !current) }}>
      <span className="coach-goal-owner-emoji">{owner?.emoji}</span>
      <span className="coach-goal-heading"><strong>{goal.title}</strong><small>{owner?.displayName || 'Okänd profil'}</small></span>
      {unreadReplies > 0 && <span className="goal-reply-badge">{unreadReplies} {unreadReplies === 1 ? 'nytt svar' : 'nya svar'}</span>}
      <span className={`goal-status ${goal.status}`}>{GOAL_STATUS[goal.status]}</span>
      <span className="coach-goal-chevron" aria-hidden="true">⌄</span>
    </button>
    {expanded && <div className="coach-goal-content" id={panelId}>
      <div className="coach-goal-controls"><label className="coach-goal-status-control">Status<select value={goal.status} disabled={savingEdit || mediaBusy || externalBusy} onChange={(event) => updateStatus(goal.id, event.target.value)}>{Object.entries(GOAL_STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>{!editing && <button type="button" className="secondary-button" disabled={mediaBusy || externalBusy} onClick={beginEdit}>Redigera mål</button>}</div>
      {editing ? <form className="coach-goal-edit-form" onSubmit={saveEdit}><label>Rubrik<input required maxLength="100" value={editDraft.title} onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })} /></label><label>Beskrivning<textarea required maxLength="2000" value={editDraft.description} onChange={(event) => setEditDraft({ ...editDraft, description: event.target.value })} /></label><label>Nästa steg<input maxLength="500" value={editDraft.nextStep} onChange={(event) => setEditDraft({ ...editDraft, nextStep: event.target.value })} /></label><div><button type="button" className="text-button" disabled={savingEdit} onClick={() => setEditing(false)}>Avbryt</button><button className="primary-button" disabled={savingEdit || !editDraft.title.trim() || !editDraft.description.trim()}>{savingEdit ? 'Sparar…' : 'Spara ändringar'}</button></div></form> : <><p>{goal.description}</p>{goal.nextStep && <div className="next-step"><strong>Nästa steg</strong><span>{goal.nextStep}</span></div>}</>}
      <GoalAnalysisImage goal={goal} code={code} />
      <GoalMediaEditor goal={goal} code={code} onSaved={onMediaSaved} initialAttachment={initialAttachment} disabled={savingEdit || editing || externalBusy} onBusyChange={setMediaBusy} />
      {visiblyUpdated && <small className="coach-goal-updated">Senast uppdaterat {new Date(goal.updatedAt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}</small>}
      <details><summary>Historik och återkoppling ({goal.updates.length})</summary><div className="goal-timeline">{goal.updates.map((update) => <div key={update.id}><span>{update.authorRole === 'coach' ? '🎯' : '💭'}</span><p><strong>{update.authorRole === 'coach' ? 'Tränarna' : owner?.displayName} {update.points > 0 && <b>+{update.points} p</b>}</strong><small>{update.content}</small></p></div>)}</div></details>
      <div className="feedback-form"><select value={entry.type} onChange={(event) => setFeedback((current) => ({ ...current, [goal.id]: { ...entry, type: event.target.value } }))}>{FEEDBACK_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><input maxLength="1000" placeholder="Skriv privat återkoppling…" value={entry.content} onChange={(event) => setFeedback((current) => ({ ...current, [goal.id]: { ...entry, content: event.target.value } }))} /><button type="button" disabled={mediaBusy || externalBusy} onClick={() => sendFeedback(goal.id)}>Skicka</button></div>
      <button type="button" className="delete-goal" disabled={savingEdit || mediaBusy || externalBusy} onClick={() => remove(goal)}>Radera mål</button>
    </div>}
  </article>
}

function CoachGoals({ code, profiles, aiEnabled = true, initialProfileId = '', initialGoalId = '', initialCreate = false, navigationKey = 0 }) {
  const [goals, setGoals] = useState([])
  const [form, setForm] = useState({ profileId: initialProfileId, title: '', description: '', nextStep: '', startDate: localDateValue(), targetDate: '' })
  const [feedback, setFeedback] = useState({})
  const [showCreate, setShowCreate] = useState(initialCreate)
  const [goalToolsBusy, setGoalToolsBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [focusedGoalId, setFocusedGoalId] = useState('')
  const [createMessage, setCreateMessage] = useState(''), [retryVideos, setRetryVideos] = useState({})
  const creationController = useRef(null), active = useRef(true), creatingGuard = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false; creationController.current?.abort() } }, [])
  const load = () => apiRequest('/api/goals', code).then((data) => setGoals(data.goals))
  useEffect(() => { load().catch((error) => window.alert(error.message)) }, [])
  useEffect(() => {
    if (initialProfileId) setForm((current) => ({ ...current, profileId: initialProfileId }))
    if (initialCreate) setShowCreate(true)
  }, [initialProfileId, initialCreate, navigationKey])
  useEffect(() => {
    if (!initialGoalId || !goals.some((goal) => goal.id === initialGoalId)) return undefined
    const timer = window.setTimeout(() => document.getElementById(`coach-goal-card-${initialGoalId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
    return () => window.clearTimeout(timer)
  }, [goals, initialGoalId, navigationKey])
  const create = async (event) => {
    event.preventDefault()
    if (creatingGuard.current || goalToolsBusy) return
    creatingGuard.current = true; setCreating(true); setCreateMessage('Sparar utvecklingsmålet…')
    creationController.current = new AbortController()
    try {
      const { videoAttachment, ...values } = form
      const result = await apiRequest('/api/goals', code, { method: 'POST', signal: creationController.current.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', ...values }) })
      if (!active.current) return
      setGoals((current) => [result.goal, ...current]); setFocusedGoalId(result.goal.id)
      setForm({ profileId: '', title: '', description: '', nextStep: '', startDate: localDateValue(), targetDate: '' }); setShowCreate(false)
      if (videoAttachment) {
        try {
          const uploaded = await uploadGoalVideo(apiRequest, code, result.goal.id, videoAttachment, { signal: creationController.current.signal, onProgress: (message) => { if (active.current) setCreateMessage(message) } })
          if (active.current) { setGoals((current) => current.map((goal) => goal.id === result.goal.id ? { ...goal, ...uploaded.goal } : goal)); setCreateMessage('✓ Målet och videon är sparade.') }
        } catch (error) { if (active.current) { setRetryVideos((current) => ({ ...current, [result.goal.id]: videoAttachment })); setCreateMessage(`Målet är sparat, men videon kunde inte kopplas: ${error.message} Öppna målets bilaga nedan för att försöka igen.`) } }
      } else setCreateMessage('✓ Målet är sparat.')
    } catch (error) { if (active.current && error.name !== 'AbortError') setCreateMessage(error.message) }
    finally { creatingGuard.current = false; if (active.current) setCreating(false) }
  }
  const mediaSaved = (saved) => { setGoals((current) => current.map((goal) => goal.id === saved.id ? { ...goal, ...saved, updates: goal.updates } : goal)); setRetryVideos((current) => { const next = { ...current }; delete next[saved.id]; return next }) }
  const updateStatus = async (goalId, status) => {
    try { await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status', goalId, status }) }); await load() } catch (error) { window.alert(error.message) }
  }
  const updateGoal = async (goalId, values) => {
    await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'edit', goalId, title: values.title, description: values.description, nextStep: values.nextStep }) })
    await load()
  }
  const sendFeedback = async (goalId) => {
    const entry = feedback[goalId] || { type: 'progress', content: '' }
    if (!entry.content?.trim()) return
    try {
      await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'feedback', goalId, feedbackType: entry.type || 'progress', content: entry.content }) })
      setFeedback({ ...feedback, [goalId]: { type: 'progress', content: '' } }); await load()
    } catch (error) { window.alert(error.message) }
  }
  const remove = async (goal) => {
    if (!confirmDestructive(`Utvecklingsmålet “${goal.title}” och all tillhörande återkoppling raderas permanent.`)) return
    try { await apiRequest(`/api/goals?id=${goal.id}`, code, { method: 'DELETE' }); await load() } catch (error) { window.alert(error.message) }
  }
  const profileFor = (id) => profiles.find((profile) => profile.id === id)
  const unreadGoals = goals.map((goal) => ({ goal, count: goal.updates.filter((update) => update.authorRole === 'swimmer' && !update.coachSeenAt).length })).filter((item) => item.count)
  const markRepliesRead = async (goalId) => {
    try { await apiRequest('/api/goals', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mark-coach-seen', goalId }) }); await load(); window.dispatchEvent(new Event('simkoll-goal-replies-read')) } catch (error) { window.alert(error.message) }
  }
  useEffect(() => {
    if (initialGoalId && unreadGoals.some(({ goal }) => goal.id === initialGoalId)) markRepliesRead(initialGoalId)
  }, [initialGoalId, goals])
  const openReply = (goalId) => { setFocusedGoalId(goalId); markRepliesRead(goalId); window.setTimeout(() => document.getElementById(`coach-goal-card-${goalId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80) }
  return <section className="coach-goals"><div className="period-heading"><div><p className="eyebrow">Privat tränare + simmare</p><h2>Utvecklingsmål</h2></div><button type="button" className="primary-button" disabled={creating || goalToolsBusy} onClick={() => setShowCreate(!showCreate)}>{showCreate ? 'Stäng' : 'Nytt mål +'}</button></div>
    {createMessage && <p className="goal-video-progress" role="status" aria-live="polite">{createMessage}</p>}
    {unreadGoals.length > 0 && <section className="goal-replies-notice"><strong>💬 Nya svar från simmare</strong><p>Öppna ett mål för att läsa svaret och ge återkoppling.</p><div>{unreadGoals.map(({ goal, count }) => <button type="button" key={goal.id} onClick={() => openReply(goal.id)}>{profileFor(goal.profileId)?.displayName || 'Simmare'} · {goal.title} <b>{count} {count === 1 ? 'svar' : 'svar'} →</b></button>)}</div></section>}
    {showCreate && <form className="goal-form" onSubmit={create}><fieldset className="goal-fields wide" disabled={creating || goalToolsBusy}><label>Simmare<select required value={form.profileId} onChange={(event) => setForm({ ...form, profileId: event.target.value })}><option value="">Välj profil…</option>{profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.emoji} {profile.displayName}</option>)}</select></label><label>Rubrik<input required maxLength="100" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label className="wide">Beskrivning<textarea required maxLength="2000" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Skriv stödord eller en påbörjad måltext…" /></label><label className="wide">Nästa steg<input maxLength="500" value={form.nextStep} onChange={(event) => setForm({ ...form, nextStep: event.target.value })} /></label><label>Startdatum<input type="date" required value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label><label>Måldatum<input type="date" value={form.targetDate} onChange={(event) => setForm({ ...form, targetDate: event.target.value })} /></label></fieldset><GoalCreationTools code={code} request={apiRequest} form={form} onChange={setForm} aiEnabled={aiEnabled} swimmerName={profileFor(form.profileId)?.displayName || ''} disabled={creating} onBusyChange={setGoalToolsBusy} /><button type="submit" className="primary-button" disabled={creating || goalToolsBusy}>{creating ? 'Sparar…' : 'Skapa mål →'}</button></form>}
    {goals.length ? <div className="coach-goal-list">{goals.map((goal) => <CoachGoalCard code={code} onMediaSaved={mediaSaved} initialAttachment={retryVideos[goal.id]} externalBusy={creating} key={goal.id} goal={goal} owner={profileFor(goal.profileId)} entry={feedback[goal.id] || { type: 'progress', content: '' }} setFeedback={setFeedback} updateGoal={updateGoal} updateStatus={updateStatus} sendFeedback={sendFeedback} remove={remove} onRead={markRepliesRead} initiallyExpanded={goal.id === initialGoalId || goal.id === focusedGoalId} />)}</div> : !showCreate && <EmptyPeriod title="Inga mål ännu" periodLabel="Utvecklingsmål" />}</section>
}

function OpenChatPanel({ code, coach = false, profileId = '', fitViewport = false }) {
  const [privateReply, setPrivateReply] = useState(null)
  const privateReplyTrigger = useRef(null)
  const closePrivateReply = () => { setPrivateReply(null); privateReplyTrigger.current?.focus() }
  const [chat, setChat] = useState({ enabled: false, backgroundImage: '', messages: [] }); const [content, setContent] = useState(''); const [status, setStatus] = useState('')
  const deletingMessage = useRef(false)
  const [deletingMessageId, setDeletingMessageId] = useState(null)
  const panelActive = useRef(true)
  const chatPanelRef = useRef(null)
  const load = () => apiRequest(`/api/community?openChat=${Date.now()}`, code).then((data) => {
    if (!panelActive.current) return
    const next = data.openChat || { enabled: false, messages: [] }
    setChat((current) => {
      const visibleMessages = Array.isArray(next.messages) ? next.messages : []
      const pending = (current.messages || []).filter((item) => item.pending && !visibleMessages.some((loaded) => loaded.id === item.id))
      return { ...next, messages: [...visibleMessages, ...pending].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) }
    })
    if (!coach && profileId && next.enabled) {
      const latest = latestCoachMessageId(next.messages)
      if (latest) markCoachMessageRead(window.localStorage, profileId, latest)
    }
  }).catch((error) => { if (panelActive.current) setStatus(error.message) })
  useEffect(() => { panelActive.current = true; load(); const refresh = window.setInterval(() => { if (!document.hidden) load() }, 15000); return () => { panelActive.current = false; window.clearInterval(refresh) } }, [code, coach, profileId])
  useLayoutEffect(() => {
    if (!fitViewport || !chat.enabled || !chatPanelRef.current) return
    const panel = chatPanelRef.current
    const footer = document.querySelector('.swimmer-app-meta')
    const viewport = window.visualViewport
    const measure = () => {
      const viewportHeight = viewport?.height || window.innerHeight
      const viewportTop = viewport?.offsetTop || 0
      const panelTop = panel.getBoundingClientRect().top - viewportTop
      const footerHeight = footer?.getBoundingClientRect().height || 0
      const footerGap = 12
      const available = Math.min(768, viewportHeight - panelTop - footerHeight - footerGap)
      panel.style.setProperty('--coach-info-chat-height', `${Math.max(180, available)}px`)
    }
    measure()
    window.addEventListener('resize', measure)
    viewport?.addEventListener('resize', measure)
    viewport?.addEventListener('scroll', measure)
    return () => {
      window.removeEventListener('resize', measure)
      viewport?.removeEventListener('resize', measure)
      viewport?.removeEventListener('scroll', measure)
    }
  }, [fitViewport, chat.enabled])
  const send = async (event) => {
    event.preventDefault()
    const messageContent = content.trim()
    if (!messageContent) return
    const pendingId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const pendingMessage = { id: pendingId, content: messageContent, createdAt: new Date().toISOString(), senderRole: coach ? 'coach' : 'swimmer', senderProfileId: profileId || null, sender: coach ? { displayName: 'Tränare', emoji: '🧑‍🏫' } : { displayName: 'Du', emoji: '🏊' }, pending: true }
    setChat((current) => ({ ...current, messages: [...(current.messages || []), pendingMessage] }))
    setContent('')
    setStatus('Skickar…')
    try {
      const result = await apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'open-chat-message', content: messageContent }) })
      const savedMessage = result.message || { ...pendingMessage, pending: false }
      setChat((current) => ({ ...current, messages: [...(current.messages || []).filter((item) => item.id !== pendingId && item.id !== savedMessage.id), savedMessage].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) }))
      setStatus('')
      // Uppdatera övriga meddelanden i bakgrunden; sändningen väntar inte på en full omladdning.
      load()
    } catch (error) {
      setChat((current) => ({ ...current, messages: (current.messages || []).filter((item) => item.id !== pendingId) }))
      setContent((current) => current || messageContent)
      setStatus(error.message)
    }
  }
  const remove = async (item) => {
    if (deletingMessage.current) return
    deletingMessage.current = true
    const label = item.sender?.displayName || (item.senderRole === 'coach' ? 'Tränaren' : 'Simmaren')
    const excerpt = item.content.length > 100 ? `${item.content.slice(0, 100)}…` : item.content
    if (!window.confirm(`Ta bort just ${label}s inlägg?\n\n”${excerpt}”`)) { deletingMessage.current = false; return }
    setDeletingMessageId(item.id)
    try {
      await apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-open-chat-message', id: item.id }) })
      await load()
    } catch (error) {
      window.alert(error.message)
    } finally {
      deletingMessage.current = false
      setDeletingMessageId(null)
    }
  }
  const clear = async () => { if (!window.confirm('Rensa alla meddelanden i den öppna chatten?')) return; await apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear-open-chat' }) }); await load() }
  if (!chat.enabled) return null
  const chatBackground = chatBackgroundUrl(chat.backgroundImage || '/assets/open-chat-bg-teal.png')
  return <section ref={chatPanelRef} className={`open-chat-panel coach-open-chat${fitViewport ? ' swimmer-info-chat' : ''}`} style={{ backgroundImage: `linear-gradient(rgba(4,16,65,.48),rgba(4,16,65,.48)),url(${chatBackground})` }}>
    <div className="open-chat-heading">
      {coach && <div><p className="eyebrow">Tränarinfo</p><h2>Info från tränarna 💬</h2></div>}
      <small>{coach ? 'Tränarinfo till gruppen · privata svar märks med 🔒' : chat.coachOnly ? 'Meddelanden från tränarna' : chat.swimmerPrivate !== false ? 'Dina frågor och privata svar syns bara för dig och tränarna' : 'Gruppchatt · svar märkta 🔒 är privata'}</small>
      {coach && <button type="button" className="text-button danger-text" onClick={clear}>Rensa chatten</button>}
    </div>
    <div className="open-chat-messages">{chat.messages?.length ? chat.messages.map((item) => {
      const canReply = coach && item.senderRole === 'swimmer' && item.senderProfileId && !item.pending
      const openReply = (event) => { privateReplyTrigger.current = event.currentTarget; setPrivateReply(item) }
      const original = <><strong>{item.sender?.displayName || 'Simmare'}</strong><span className="private-question-content">{item.content}</span><small>{item.pending ? 'Skickar…' : formatFeedDate(item.createdAt)}</small>{canReply && <small className="private-reply-hint">↩ Svara privat till {item.sender?.displayName || 'simmaren'}</small>}</>
      return <article className={`${item.senderRole === 'swimmer' ? 'swimmer-message' : 'coach-message'}${item.pending ? ' pending-message' : ''}`} key={item.id}>
        <span>{item.senderRole === 'coach' ? '🧑‍🏫' : (item.sender?.emoji || '🏊')}</span>
        <div>{canReply ? <button type="button" className="private-reply-message" onClick={openReply} aria-expanded={privateReply?.id === item.id}>{original}</button> : original}
          {item.privateReplies?.map((reply) => <section className="private-thread-reply" key={reply.id}><strong>🔒 {coach ? `Privat svar till ${item.sender?.displayName || 'simmaren'}` : 'Tränarnas privata svar till dig'}</strong><p>{reply.content}</p><small>{formatFeedDate(reply.createdAt)}</small></section>)}
          {privateReply?.id === item.id && <PrivateChatReply key={item.id} message={item} code={code} request={apiRequest} onClose={closePrivateReply} onSent={(reply) => {
            if (reply) setChat((current) => ({...current,messages:current.messages.map((message) => message.id === item.id ? {...message,privateReplies:[...(message.privateReplies || []).filter((row) => row.id !== reply.id),reply]} : message)}))
            window.dispatchEvent(new Event('simkoll-private-message-sent'))
            load()
          }} />}
        </div>
        {!item.pending && (coach || item.senderProfileId === profileId) && <button type="button" className="text-button danger-text" disabled={deletingMessageId !== null} onClick={() => remove(item)}>{deletingMessageId === item.id ? 'Tar bort…' : 'Ta bort'}</button>}
      </article>
    }) : <p className="empty">Chatten är tom – skriv den första hälsningen!</p>}</div>
    {(!chat.coachOnly || coach) && !privateReply && <form className="open-chat-compose" onSubmit={send}><div className="chat-compose-input"><textarea required maxLength={1000} value={content} placeholder={coach ? 'Skriv till gruppen…' : 'Ställ en fråga…'} onChange={(event) => setContent(event.target.value)} /><ChatEmojiPicker onPick={(emoji) => setContent((value) => `${value}${emoji}`)} /></div><button className="primary-button">Skicka 💬</button>{status && <small>{status}</small>}</form>}
    {chat.privateRepliesWarning && <p className="private-replies-warning" role="status">{chat.privateRepliesWarning}</p>}
  </section>
}

function CoachCommunity({ code, profiles, initialRecipientId = '' }) {
  const [content, setContent] = useState('')
  const [polishing, setPolishing] = useState(false)
  const [message, setMessage] = useState('')
  const [recipientId, setRecipientId] = useState('')
  const privateMessageRef = useRef(null)
  useEffect(() => { if (initialRecipientId) setRecipientId(initialRecipientId) }, [initialRecipientId])
  const [items, setItems] = useState([])
  const [messages, setMessages] = useState([])
  const [openChat, setOpenChat] = useState({ enabled: false, backgroundImage: '', messages: [] })
  const [openChatContent, setOpenChatContent] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => { if (initialRecipientId && !loading) privateMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [initialRecipientId, loading])
  const load = () => apiRequest(`/api/community?feed=${Date.now()}`, code).then((data) => { setItems(data.items); setMessages(data.messages || []); setOpenChat(data.openChat || { enabled: false, messages: [] }) }).finally(() => setLoading(false))
  useEffect(() => {
    const refreshPrivate = () => { load().catch(() => {}) }
    window.addEventListener('simkoll-private-message-sent', refreshPrivate)
    return () => window.removeEventListener('simkoll-private-message-sent', refreshPrivate)
  }, [code])
  useEffect(() => { load().catch((error) => window.alert(error.message)) }, [])
  const publish = async (event) => {
    event.preventDefault(); setLoading(true)
    try {
      await apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) })
      setContent(''); await load()
    } catch (error) { window.alert(error.message); setLoading(false) }
  }
  const improvePost = async () => {
    if (!content.trim()) return
    setPolishing(true)
    try {
      const result = await apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'polish-community-post', content }) })
      setContent(result.text || content)
    } catch (error) { window.alert(error.message) } finally { setPolishing(false) }
  }
  const remove = async (id) => {
    if (!confirmDestructive('Meddelandet tas bort från alla simmares flöde.')) return
    try { await apiRequest(`/api/community?id=${id}`, code, { method: 'DELETE' }); await load() } catch (error) { window.alert(error.message) }
  }
  const sendMessage = async (event) => { event.preventDefault(); try { await apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'message', recipientId, content: message }) }); setMessage(''); setRecipientId(''); await load() } catch (error) { window.alert(error.message) } }
  const removePrivateMessage = async (id) => { if (!window.confirm('Ta bort det privata meddelandet?')) return; try { await apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-private-message', id }) }); await load() } catch (error) { window.alert(error.message) } }
  const sendOpenChat = async (event) => { event.preventDefault(); if (!openChatContent.trim()) return; try { await apiRequest('/api/community', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'open-chat-message', content: openChatContent }) }); setOpenChatContent(''); await load() } catch (error) { window.alert(error.message) } }
  return <section className="coach-community"><div className="period-heading"><div><p className="eyebrow">Syns för alla profiler</p><h2>Klubbflödet</h2></div></div><form onSubmit={publish}><textarea required maxLength="1000" placeholder="Skriv ett meddelande till gruppen…" value={content} onChange={(event) => setContent(event.target.value)} /><div className="community-post-actions"><button type="button" className={`text-button${polishing ? ' ai-working' : ''}`} disabled={polishing || !content.trim()} onClick={improvePost}>{polishing ? 'Förbättrar texten…' : '✨ Förbättra text med AI'}</button><small>{content.length}/1000</small><button className="primary-button" disabled={loading || polishing}>Publicera →</button></div></form><section className="coach-private-message" ref={privateMessageRef}><h3>Skicka privat till simmare</h3><form onSubmit={sendMessage}><select required value={recipientId} onChange={(event) => setRecipientId(event.target.value)}><option value="">Välj simmare…</option>{profiles.filter((profile) => !profile.isTestProfile).map((profile) => <option value={profile.id} key={profile.id}>{profile.emoji} {profile.displayName}</option>)}</select><textarea required maxLength="1000" placeholder="Skriv ett privat meddelande…" value={message} onChange={(event) => setMessage(event.target.value)} /><button className="primary-button">Skicka privat →</button></form></section><section className="coach-messages"><h3>Privata meddelanden</h3>{messages.length ? messages.map((item) => <article key={item.id}><span>{item.fromCoach ? '📣' : (item.sender?.emoji || '👤')}</span><div><strong>{item.fromCoach ? `Tränare → ${item.recipient?.displayName || 'simmare'}` : `${item.sender?.displayName || 'Simmare'} → tränarna`}</strong><p>{item.content}</p><small>{formatFeedDate(item.createdAt)}</small></div><button type="button" className="text-button danger-text" onClick={() => removePrivateMessage(item.id)}>Ta bort</button></article>) : <p className="empty">Inga privata meddelanden ännu.</p>}</section><div className="coach-feed">{items.map((item) => <article key={`${item.type}-${item.id}`}><span>{item.type === 'coach' ? '📣' : item.sender?.emoji}</span><div><strong>{item.type === 'coach' ? 'Tränarna' : `${item.sender?.displayName} → hela gruppen`}</strong><p>{item.content}</p><small>{formatFeedDate(item.createdAt)}</small></div>{item.type === 'coach' && <button onClick={() => remove(item.id)}>Ta bort</button>}</article>)}</div></section>
}

function localDateValue() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function rankWorkoutLibrary(workouts, responses, criteria, focusPreference) {
  const answersByDate = new Map()
  for (const item of responses) {
    if (item.type !== 'after') continue
    const key = dateKey(responseDate(item))
    if (!answersByDate.has(key)) answersByDate.set(key, [])
    answersByDate.get(key).push(item)
  }
  return workouts.map((workout) => {
    const answers = answersByDate.get(workout.date) || []
    const average = (key) => {
      const values = answers.map((item) => item[key]).filter((value) => value != null && Number.isFinite(Number(value))).map(Number)
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
    }
    return { ...workout, pass: average('pass'), rpe: average('rpe') }
  }).sort((a, b) => {
    for (const key of criteria) {
      const value = (workout) => key === 'focus' ? (focusPreference ? Number(workout.focus === focusPreference) : Number(Boolean(workout.focus))) : key === 'distance' ? (workout.distanceMeters || 0) : key === 'duration' ? (workout.durationMinutes || 0) : (workout[key] ?? -1)
      const difference = value(b) - value(a)
      if (difference) return difference
    }
    return b.date.localeCompare(a.date)
  })
}

function WorkoutEditor({ code, responses, aiEnabled = true, initialWorkout = null, onClose, selectedGroups = ['ungdom_orange', 'ungdom_svart', 'junior'], availableGroups = [['ungdom_orange', 'Ungdom Orange'], ['ungdom_svart', 'Ungdom Svart'], ['junior', 'Junior']] }) {
  const blankWorkout = () => ({ title: '', content: '', note: '', focus: '', distanceMeters: '', durationMinutes: '', timeOfDay: '', targetGroups: selectedGroups.length ? selectedGroups : availableGroups.map(([value]) => value) })
  const [date, setDate] = useState(initialWorkout?.date || localDateValue())
  const [form, setForm] = useState(initialWorkout || blankWorkout())
  const [existingWorkouts, setExistingWorkouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [polishing, setPolishing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recorderRef = useRef(null)
  const [saved, setSaved] = useState(false)
  const [library, setLibrary] = useState([])
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryLoaded, setLibraryLoaded] = useState(false)
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libraryError, setLibraryError] = useState('')
  const [librarySearch, setLibrarySearch] = useState('')
  const [libraryVisibleCount, setLibraryVisibleCount] = useState(20)
  const [selectingLibraryId, setSelectingLibraryId] = useState('')
  const [driveOpen, setDriveOpen] = useState(false)
  const [driveFolderId, setDriveFolderId] = useState('')
  const [driveItems, setDriveItems] = useState([])
  const [driveLoading, setDriveLoading] = useState(false)
  const [workbookImport, setWorkbookImport] = useState(null)
  const [publishedAlternatives, setPublishedAlternatives] = useState(0)
  const loadOccasionChoices = useMemo(() => (requestedDate, exclude, signal) => apiRequest(`/api/workouts?occasionChoices=true&date=${encodeURIComponent(requestedDate)}${exclude ? `&exclude=${encodeURIComponent(exclude)}` : ''}`, code, { signal }), [code])
  const loadSingleOccasions = useMemo(() => (signal) => loadOccasionChoices(date, form.id || '', signal), [loadOccasionChoices, date, form.id])
  const [criteria, setCriteria] = useState(['focus', 'pass', 'rpe'])
  const [focusPreference, setFocusPreference] = useState('')
  const [generatorOpen, setGeneratorOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const generatingRef = useRef(false)
  const [generationResult, setGenerationResult] = useState(null)
  const [generator, setGenerator] = useState({ focus: 'fart', distanceMeters: 4000, durationMinutes: 90, rpe: '6–7', groups: selectedGroups.length ? selectedGroups : availableGroups.map(([value]) => value), request: '', innovationLevel: 2 })
  const visibleExistingWorkouts = existingWorkouts.filter((workout) => selectedGroups.length === availableGroups.length || workout.targetGroups?.some((group) => selectedGroups.includes(group)))
  const loadLibrary = async () => {
    setLibraryOpen(true)
    if (libraryLoaded || libraryLoading) return
    setLibraryLoading(true); setLibraryError('')
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    try {
      const data = await apiRequest('/api/workouts?library=true', code, { signal: controller.signal })
      setLibrary((data.workouts || []).filter((workout) => workout.focus !== 'tavling')); setLibraryLoaded(true)
    } catch (error) { setLibraryError(controller.signal.aborted ? 'Hämtningen tog för lång tid. Försök igen.' : error.message) }
    finally { window.clearTimeout(timeout); setLibraryLoading(false) }
  }
  const chooseLibraryWorkout = async (workout) => {
    setSelectingLibraryId(workout.id); setLibraryError('')
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    try {
      const data = await apiRequest(`/api/workouts?libraryItem=${encodeURIComponent(workout.id)}`, code, { signal: controller.signal })
      const selected = data.workout
      setForm({ ...blankWorkout(), title: selected.title, content: selected.content, note: selected.note || '', focus: selected.focus || '', distanceMeters: selected.distanceMeters || '', durationMinutes: selected.durationMinutes || '', timeOfDay: selected.timeOfDay || '', targetGroups: selected.targetGroups || blankWorkout().targetGroups })
      setLibraryOpen(false); setSaved(false)
    } catch (error) { setLibraryError(controller.signal.aborted ? 'Passet tog för lång tid att hämta. Välj det igen.' : error.message) }
    finally { window.clearTimeout(timeout); setSelectingLibraryId('') }
  }
  const loadDriveFolder = async (folderId = '') => { setDriveLoading(true); try { const data = await apiRequest(`/api/workouts?drive=true${folderId ? `&folderId=${encodeURIComponent(folderId)}` : ''}`, code); setDriveFolderId(data.folderId || folderId); setDriveItems(data.items || []); setDriveOpen(true) } catch (error) { window.alert(error.message) } finally { setDriveLoading(false) } }
  const importDriveFile = async (item) => { setDriveLoading(true); try { const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'import-drive-file', fileId: item.id }) }); setWorkbookImport(data); setPublishedAlternatives(0); setSaved(false); setDriveOpen(false) } catch (error) { window.alert(error.message) } finally { setDriveLoading(false) } }
  const publishWorkbook = async (publication) => {
    const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'publish-workout-alternatives', ...publication }) })
    if (!data.workouts?.length) throw new Error('Publiceringen kunde inte bekräftas. Försök igen.')
    setExistingWorkouts((current) => [...current.filter((item) => !data.workouts.some((saved) => saved.id === item.id)), ...data.workouts])
    setDate(publication.date); setForm(data.workouts[0]); setPublishedAlternatives(data.workouts.length); setSaved(true); setWorkbookImport(null)
  }
  const rankedLibrary = useMemo(() => rankWorkoutLibrary(library, responses, criteria, focusPreference), [library, responses, criteria, focusPreference])
  const matchingLibrary = useMemo(() => {
    const search = librarySearch.trim().toLocaleLowerCase('sv-SE')
    return search ? rankedLibrary.filter((workout) => `${workout.title} ${WORKOUT_FOCUSES.find(([value]) => value === workout.focus)?.[1] || workout.focus} ${workout.date}`.toLocaleLowerCase('sv-SE').includes(search)) : rankedLibrary
  }, [rankedLibrary, librarySearch])
  const importSheet = async () => { setLoading(true); try { const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'import-sheet', url: 'https://docs.google.com/spreadsheets/d/1V_Y170h0mOPf3AsrF-9wW9o3paL_X579n4w7aKQgeoc/edit?usp=sharing' }) }); setForm((current) => ({ ...current, ...data.draft })); setSaved(false) } catch (error) { window.alert(error.message) } finally { setLoading(false) } }
  const generateFromLibrary = async (event) => {
    event.preventDefault()
    if (generatingRef.current) return
    if (!aiEnabled) return window.alert('AI-stöd är avstängt i webapp-inställningarna.')
    if (!generator.groups.length) return window.alert('Välj minst en grupp.')
    const settings = { ...generator, groups: [...generator.groups] }
    generatingRef.current = true
    setGenerating(true); setGenerationResult(null)
    try {
      const history = await apiRequest('/api/workouts?history=true', code)
      const targetRpe = Number(settings.rpe.split('–')[0]) + 0.5
      const source = rankWorkoutLibrary((history.workouts || []).filter((workout) => workout.focus !== 'tavling' && workout.content?.trim()), responses, criteria, settings.focus).sort((a, b) => Number(b.focus === settings.focus) - Number(a.focus === settings.focus) || (b.pass ?? -1) - (a.pass ?? -1) || Math.abs((a.rpe ?? 99) - targetRpe) - Math.abs((b.rpe ?? 99) - targetRpe)).slice(0, 8)
      const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate-from-library', ...settings, request: String(settings.request || '').slice(0, 300), library: source }) })
      if (data.error) throw new Error(data.error)
      if (!data.draft?.content) throw new Error('Inget passförslag kunde hämtas. Försök igen.')
      setForm((current) => ({ ...current, ...data.draft, targetGroups: settings.groups }))
      setGenerationResult({ ...data.provenance, model: data.model })
      setSaved(false); setGeneratorOpen(false)
    } catch (error) { window.alert(error.message) }
    finally { generatingRef.current = false; setGenerating(false) }
  }
  const polishContent = async () => { if (!form.content?.trim()) return; setPolishing(true); try { const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'polish-workout-content', content: form.content, title: form.title, focus: form.focus }) }); setForm((current) => ({ ...current, content: data.text || current.content })); setSaved(false) } catch (error) { window.alert(error.message) } finally { setPolishing(false) } }
  const importImage = async (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) { window.alert('Välj en PNG-, JPG- eller WebP-bild.'); return } if (file.size > 6 * 1024 * 1024) { window.alert('Bilden är för stor. Välj en bild under cirka 6 MB.'); return } const reader = new FileReader(); reader.onload = async () => { setLoading(true); try { const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'interpret-workout-image', fileData: reader.result, mimeType: file.type, fileName: file.name }) }); if (data.error) throw new Error(data.error); setForm((current) => ({ ...current, ...data.draft })); setSaved(false) } catch (error) { window.alert(error.message) } finally { setLoading(false) } }; reader.readAsDataURL(file) }

  const importTextFile = async (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if (!/\.(txt|csv|md)$/i.test(file.name) && !/^text\//i.test(file.type)) { window.alert('Välj en text-, CSV- eller Markdown-fil.'); return } const reader = new FileReader(); reader.onload = async () => { setLoading(true); try { const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'polish-workout-content', content: String(reader.result || ''), title: file.name.replace(/\.[^.]+$/, ''), focus: form.focus }) }); setForm((current) => ({ ...current, title: current.title || file.name.replace(/\.[^.]+$/, ''), content: data.text || String(reader.result || '') })); setSaved(false) } catch (error) { window.alert(error.message) } finally { setLoading(false) } }; reader.readAsText(file) }

  const startWorkoutRecording = async () => {
    if (!aiEnabled) return window.alert('AI-stöd är avstängt i webapp-inställningarna.')
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return window.alert('Den här webbläsaren stöder inte ljudinspelning.')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type)) || ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks = []
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        const reader = new FileReader()
        reader.onload = async () => {
          setTranscribing(true)
          try {
            const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'transcribe-audio', dataUrl: reader.result, mimeType: blob.type }) })
            if (data.error) throw new Error(data.error)
            setForm((current) => ({ ...current, content: current.content?.trim() ? `${current.content.trim()}\n\n${data.text || ''}`.trim() : (data.text || '') }))
            setSaved(false)
          } catch (error) { window.alert(error.message) } finally { setTranscribing(false) }
        }
        reader.readAsDataURL(blob)
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch (error) { window.alert(error.name === 'NotAllowedError' ? 'Mikrofontillstånd nekades. Tillåt mikrofonen i webbläsaren.' : 'Kunde inte starta inspelningen.') }
  }
  const stopWorkoutRecording = () => { recorderRef.current?.stop(); recorderRef.current = null; setRecording(false) }

  useEffect(() => {
    if (initialWorkout) { setDate(initialWorkout.date); setForm(initialWorkout); setLoading(false); return undefined }
    setLoading(true)
    apiRequest(`/api/workouts?date=${date}`, code)
      .then((data) => { setExistingWorkouts(data.workouts || (data.workout ? [data.workout] : [])); setForm(blankWorkout()) })
      .catch((error) => window.alert(error.message))
      .finally(() => setLoading(false))
  }, [code, date, initialWorkout])

  const save = async (event) => {
    event.preventDefault()
    const occasionMode = form.occasionMode || (form.id ? 'keep' : 'new')
    if (occasionMode === 'existing' && !form.alternativeToWorkoutId) { window.alert('Välj vilket befintligt träningstillfälle passet hör till.'); return }
    setLoading(true)
    setSaved(false)
    try {
      const data = await apiRequest('/api/workouts', code, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, date, occasionMode }),
      })
      setForm(data.workout)
      setExistingWorkouts((current) => current.some((item) => item.id === data.workout.id) ? current.map((item) => item.id === data.workout.id ? data.workout : item) : [...current, data.workout])
      setSaved(true)
    } catch (error) { window.alert(error.message) } finally { setLoading(false) }
  }

  const remove = async () => {
    if (!confirmDestructive(`Passet för ${date} försvinner för alla simmare.`)) return
    try {
      await apiRequest(`/api/workouts?id=${encodeURIComponent(form.id || '')}&date=${date}`, code, { method: 'DELETE' })
      setExistingWorkouts((current) => current.filter((item) => item.id !== form.id))
      setForm(blankWorkout())
      setSaved(false)
      if (onClose) onClose()
    } catch (error) { window.alert(error.message) }
  }

  if (workbookImport) return <section className="workout-editor"><WorkoutWorkbookReview workbook={workbookImport} date={date} timeOfDay={form.timeOfDay || ''} groups={form.targetGroups || selectedGroups} initialOccasion={form} loadChoices={loadOccasionChoices} availableGroups={availableGroups} focuses={WORKOUT_FOCUSES} onPublish={publishWorkbook} onClose={() => setWorkbookImport(null)} /></section>

  return (
    <section className="workout-editor">
      <div className="period-heading"><div><p className="eyebrow">Syns för inloggade simmare</p><h2>{initialWorkout || form.id ? 'Redigera simpass' : 'Lägg upp ett pass'}</h2><small className="workout-import-hint">{initialWorkout ? 'Ändra passet i samma formulär som när du lägger upp ett nytt.' : 'Se redan upplagda pass för dagen och lägg till fler vid behov.'}</small></div><div className="editor-import-actions">{!initialWorkout && <><button type="button" className={`secondary-button${driveLoading ? ' ai-working' : ''}`} aria-expanded={driveOpen} aria-busy={driveLoading} onClick={() => loadDriveFolder()} disabled={driveLoading}>{driveLoading ? 'Öppnar Google Drive…' : '📁 Välj från delad Drive-mapp'}</button><button type="button" className={`secondary-button${libraryLoading ? ' ai-working' : ''}`} aria-expanded={libraryOpen} aria-busy={libraryLoading} disabled={libraryLoading} onClick={() => libraryOpen ? setLibraryOpen(false) : loadLibrary()}>{libraryLoading ? 'Hämtar pass…' : 'Hämta från bibliotek'}</button>{aiEnabled && <button type="button" className="secondary-button" aria-expanded={generatorOpen} onClick={() => setGeneratorOpen((open) => !open)}>✨ Skapa passförslag</button>}</>}</div></div>
      {publishedAlternatives > 0 && <p className="push-feedback" role="status">✓ {publishedAlternatives} {publishedAlternatives === 1 ? 'pass har publicerats' : 'passalternativ har publicerats för samma träning'}. De visas i veckoplaneringen och som val i efterincheckningen.</p>}
      {driveOpen && <section className="workout-picker drive-picker" aria-busy={driveLoading}><div className="workout-picker-head"><div><h3>Välj träningspass från Google Drive</h3><small>Google Kalkylark och Excel (XLS/XLSX) stöds. Alla flikar läses in för granskning.</small></div><button type="button" className="text-button" disabled={driveLoading} onClick={() => setDriveOpen(false)}>Stäng</button></div>{driveLoading && <p role="status">Hämtar filen och läser flikarna…</p>}<div className="drive-picker-list">{driveFolderId && <button type="button" className="drive-item drive-back" onClick={() => loadDriveFolder()} disabled={driveLoading}>← Öppna huvudmappen igen</button>}{driveItems.length ? driveItems.map((item) => <button type="button" className="drive-item" key={item.id} onClick={() => item.folder ? loadDriveFolder(item.id) : importDriveFile(item)} disabled={driveLoading || (!item.folder && !Object.hasOwn(SWIM_WORKBOOK_TYPES, item.mimeType))}><span>{item.folder ? '📁' : SWIM_WORKBOOK_TYPES[item.mimeType] ? '📊' : '📄'}</span><span><strong>{item.name}</strong><small>{item.folder ? 'Öppna mapp' : SWIM_WORKBOOK_TYPES[item.mimeType] ? `${SWIM_WORKBOOK_TYPES[item.mimeType]} · Senast ändrad ${item.modifiedTime ? new Date(item.modifiedTime).toLocaleDateString('sv-SE') : 'okänt datum'}` : 'Formatet stöds inte'}</small></span><b>{item.folder ? 'Öppna →' : SWIM_WORKBOOK_TYPES[item.mimeType] ? 'Granska flikar →' : '—'}</b></button>) : <p className="empty">Mappen är tom eller inga filer kunde hittas.</p>}</div></section>}
      {!initialWorkout && visibleExistingWorkouts.length > 0 && <section className="existing-workouts coach-card"><div className="workout-picker-head"><div><p className="eyebrow">{date}</p><h3>Pass som redan är upplagda</h3></div><button type="button" className="secondary-button" onClick={() => { setForm(blankWorkout()); setSaved(false) }}>＋ Lägg till pass</button></div><div className="existing-workout-list">{visibleExistingWorkouts.map((workout) => <article key={workout.id}><div><strong>{workout.title}</strong><small>{[workout.targetGroups?.map((group) => ({ ungdom_orange: 'Orange', ungdom_svart: 'Svart', junior: 'Junior' }[group] || group)).join(' · '), workout.focus, workout.distanceMeters && `${Number(workout.distanceMeters).toLocaleString('sv-SE')} m`, workout.durationMinutes && `${workout.durationMinutes} min`].filter(Boolean).join(' · ')}</small></div><button type="button" className="text-button" onClick={() => { setForm(workout); setSaved(false) }}>Redigera</button></article>)}</div></section>}
      {generatorOpen && <WorkoutGenerator generator={generator} setGenerator={setGenerator} generating={generating} focuses={WORKOUT_FOCUSES} onSubmit={generateFromLibrary} onClose={() => setGeneratorOpen(false)} />}
      {generationResult && <WorkoutGenerationResult result={generationResult} />}
      {libraryOpen && <section className="workout-picker">
        <div className="workout-picker-head"><div><h3>Välj ett tidigare pass</h3><small>Sök bland tidigare pass eller sortera efter dina prioriteringar.</small></div><button type="button" className="text-button" onClick={() => setLibraryOpen(false)}>Stäng</button></div>
        {libraryLoading && <p role="status">Hämtar passöversikten…</p>}
        {libraryError && <div className="workout-picker-error" role="alert"><span>{libraryError}</span>{!libraryLoaded && <button type="button" className="secondary-button" onClick={loadLibrary}>Försök igen</button>}</div>}
        {libraryLoaded && <>
          <label className="workout-picker-search">Sök pass<input type="search" value={librarySearch} onChange={(event) => { setLibrarySearch(event.target.value); setLibraryVisibleCount(20) }} placeholder="Rubrik, inriktning eller datum" /></label>
          <p>Välj upp till tre prioriteringar. Bäst match hamnar först.</p>
          <div className="workout-picker-criteria">{[0, 1, 2].map((index) => <label key={index}>{index + 1}. prioritet<select value={criteria[index]} onChange={(event) => { const next = [...criteria]; next[index] = event.target.value; setCriteria(next) }}><option value="focus">Huvudinriktning</option><option value="pass">Passbetyg</option><option value="rpe">RPE</option><option value="distance">Meter</option><option value="duration">Tidsåtgång</option></select></label>)}</div>
          {criteria.includes('focus') && <label className="workout-focus-preference">Vilken huvudinriktning?<select value={focusPreference} onChange={(event) => setFocusPreference(event.target.value)}><option value="">Alla inriktningar</option>{WORKOUT_FOCUSES.filter(([value]) => value !== 'tavling').map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>}
          <small className="workout-picker-count">Visar {Math.min(libraryVisibleCount, matchingLibrary.length)} av {matchingLibrary.length} matchande pass{library.length >= 1000 ? ' · de 1 000 senaste finns i listan' : ''}.</small>
          <div className="workout-picker-list">{matchingLibrary.slice(0, libraryVisibleCount).map((workout) => <button type="button" key={workout.id} disabled={Boolean(selectingLibraryId)} onClick={() => chooseLibraryWorkout(workout)}><span><strong>{workout.title}</strong><small>{workout.date} · {WORKOUT_FOCUSES.find(([value]) => value === workout.focus)?.[1] || 'Ingen inriktning'} · {workout.distanceMeters ? `${workout.distanceMeters} m` : 'meter saknas'} · {workout.pass != null ? `Pass ${workout.pass.toFixed(1)}/5` : 'inget betyg'}</small></span><b>{selectingLibraryId === workout.id ? 'Hämtar…' : 'Välj →'}</b></button>)}{!matchingLibrary.length && <p className="empty">{library.length ? 'Inga pass matchar sökningen.' : 'Inga tidigare pass finns i biblioteket.'}</p>}</div>
          {libraryVisibleCount < matchingLibrary.length && <button type="button" className="secondary-button workout-picker-more" onClick={() => setLibraryVisibleCount((count) => count + 20)}>Visa fler pass ↓</button>}
        </>}
      </section>}
      <form onSubmit={save}>
        <label>Datum<input type="date" value={date} onChange={(event) => { setSaved(false); setDate(event.target.value); setForm((current) => ({ ...current, alternativeToWorkoutId: '' })) }} /></label>
        <WorkoutOccasionChoice form={form} loadChoices={loadSingleOccasions} disabled={loading} onChange={(update) => { setForm((current) => ({ ...current, ...update })); setSaved(false) }} />
        <label>Rubrik<input required maxLength="80" placeholder="Till exempel: Tröskel + teknik" value={form.title || ''} onChange={(event) => { setSaved(false); setForm({ ...form, title: event.target.value }) }} /></label>
        <div className="workout-meta-fields"><label>Huvudinriktning<select value={form.focus || ''} onChange={(event) => { setSaved(false); setForm({ ...form, focus: event.target.value }) }}><option value="">Välj inriktning…</option>{WORKOUT_FOCUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Tid på dagen<select value={form.timeOfDay || ''} onChange={(event) => { setSaved(false); setForm({ ...form, timeOfDay: event.target.value }) }}><option value="">Välj tid…</option><option value="morning">Förmiddag / morgon</option><option value="afternoon">Eftermiddag / kväll</option></select></label><label>Längd (meter)<input type="number" min="1" max="50000" placeholder="t.ex. 4000" value={form.distanceMeters ?? ''} onChange={(event) => { setSaved(false); setForm({ ...form, distanceMeters: event.target.value }) }} /></label><label>Tidsåtgång (minuter)<input type="number" min="1" max="600" placeholder="t.ex. 75" value={form.durationMinutes ?? ''} onChange={(event) => { setSaved(false); setForm({ ...form, durationMinutes: event.target.value }) }} /></label></div>
        <fieldset className="workout-groups"><legend>Passet gäller för</legend><div>{[['ungdom_orange', 'Ungdom Orange'], ['ungdom_svart', 'Ungdom Svart'], ['junior', 'Junior']].map(([value, label]) => <label key={value}><input type="checkbox" checked={(form.targetGroups || []).includes(value)} onChange={(event) => { setSaved(false); const groups = new Set(form.targetGroups || []); event.target.checked ? groups.add(value) : groups.delete(value); setForm({ ...form, targetGroups: [...groups] }) }} />{label}</label>)}</div><small>Välj en eller flera grupper. Passet visas bara för valda grupper.</small></fieldset>
        <label>Huvudserie<textarea required maxLength="5000" placeholder={'Till exempel:\n8 × 50 m teknik\nHuvudserie…'} value={form.content || ''} onChange={(event) => { setSaved(false); setForm({ ...form, content: event.target.value }) }} /><div className="workout-ai-actions">{aiEnabled && <button type="button" className={`secondary-button${polishing ? ' ai-working' : ''}`} onClick={polishContent} disabled={polishing || loading || recording || transcribing || !form.content?.trim()}>{polishing ? 'Förbättrar passet…' : '✨ Förbättra träningspass med AI'}</button>}{aiEnabled && <button type="button" className={recording ? 'recording-button' : transcribing ? 'secondary-button ai-working' : 'secondary-button'} onClick={recording ? stopWorkoutRecording : startWorkoutRecording} disabled={loading || polishing || transcribing}>{recording ? '⏹ Stoppa inspelning' : transcribing ? 'Transkriberar…' : '🎙️ Läs in med röst'}</button>}<label className={`secondary-button workout-upload-button${loading ? ' ai-working' : ''}`}>🖼️ {loading ? 'Tolkar passbild…' : 'Tolka bild av pass'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={importImage} disabled={loading || polishing || recording || transcribing} /></label></div><small className="settings-note">Du kan läsa in passet med rösten. Kontrollera alltid texten och formateringen före publicering.</small></label>
        <label>Meddelande till simmarna <small>Frivilligt</small><textarea className="short" maxLength="500" placeholder="Fokus för dagen eller något att tänka på…" value={form.note || ''} onChange={(event) => { setSaved(false); setForm({ ...form, note: event.target.value }) }} /></label>
        <div className="editor-actions">{form.id && <button type="button" className="delete-workout" onClick={remove}>Radera pass</button>}<span>{saved ? '✓ Sparat och publicerat' : ''}</span>{onClose && <button type="button" className="secondary-button" onClick={onClose}>Avbryt</button>}<button className="primary-button" disabled={loading}>{loading ? 'Vänta…' : initialWorkout ? 'Spara ändringar →' : 'Publicera passet →'}</button></div>
      </form>
    </section>
  )
}

function SwimmerNotes({ profile, code }) {
  const [notes, setNotes] = useState([])
  const [date, setDate] = useState(todayKey())
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [polishing, setPolishing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recorderRef = useRef(null)
  const [editing, setEditing] = useState(null)
  const [editDraft, setEditDraft] = useState({ date: '', content: '' })
  const [status, setStatus] = useState('')
  const load = () => apiRequest(`/api/profiles?notes=true&profileId=${profile.id}`, code).then((data) => setNotes(data.notes || [])).catch(() => setStatus('Kunde inte hämta observationer.'))
  useEffect(() => { load() }, [code, profile.id])
  const save = async (event) => {
    event.preventDefault(); if (!content.trim()) return
    setSaving(true); setStatus('')
    try { await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-swimmer-note', profileId: profile.id, noteDate: date, content }) }); setContent(''); setStatus('Sparad.'); await load() } catch (error) { setStatus(error.message) } finally { setSaving(false) }
  }
  const improve = async (text, noteDate, onResult) => {
    if (!text.trim()) return
    setPolishing(true); setStatus('Förbättrar text…')
    try { const result = await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'polish-swimmer-note', noteDate, content: text }) }); onResult(result.text || text); setStatus(result.usedAi ? 'Texten är förbättrad – kontrollera den före sparning.' : 'Texten kunde inte förbättras just nu.') } catch (error) { setStatus(error.message) } finally { setPolishing(false) }
  }
  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return setStatus('Den här webbläsaren stöder inte ljudinspelning.')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type)) || ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks = []
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        const reader = new FileReader()
        reader.onload = async () => {
          setTranscribing(true); setStatus('Transkriberar inspelningen…')
          try {
            const data = await apiRequest('/api/workouts', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'transcribe-audio', dataUrl: reader.result, mimeType: blob.type }) })
            if (data.error) throw new Error(data.error)
            setContent((current) => current.trim() ? `${current.trim()}\n\n${data.text || ''}`.trim() : (data.text || ''))
            setStatus(data.text ? 'Transkriberingen är klar – kontrollera texten före sparning.' : 'Inget tal kunde urskiljas.')
          } catch (error) { setStatus(error.message) } finally { setTranscribing(false) }
        }
        reader.readAsDataURL(blob)
      }
      recorderRef.current = recorder; recorder.start(); setRecording(true); setStatus('Spelar in… tryck på stoppa när du är klar.')
    } catch (error) { setStatus(error.name === 'NotAllowedError' ? 'Mikrofontillstånd nekades. Tillåt mikrofonen i webbläsaren.' : 'Kunde inte starta inspelningen.') }
  }
  const stopRecording = () => { recorderRef.current?.stop(); recorderRef.current = null; setRecording(false) }
  const startEdit = (note) => { setEditing(note.id); setEditDraft({ date: note.noteDate, content: note.content }); setStatus('') }
  const saveEdit = async () => {
    if (!editDraft.content.trim()) return
    setSaving(true); setStatus('')
    try { await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update-swimmer-note', noteId: editing, profileId: profile.id, noteDate: editDraft.date, content: editDraft.content }) }); setEditing(null); setStatus('Anteckningen är uppdaterad.'); await load() } catch (error) { setStatus(error.message) } finally { setSaving(false) }
  }
  const remove = async (note) => {
    if (!confirmDestructive('Anteckningen tas bort permanent.')) return
    setSaving(true); setStatus('')
    try { await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-swimmer-note', noteId: note.id, profileId: profile.id }) }); setStatus('Anteckningen är raderad.'); await load() } catch (error) { setStatus(error.message) } finally { setSaving(false) }
  }
  const latestNote = [...notes].sort((a, b) => String(b.noteDate || '').localeCompare(String(a.noteDate || '')))[0]
  return (
    <details className="swimmer-notes">
      <summary><span><strong>Tränarens observationer</strong><small>Sparas med datum och syns bara för tränare.</small></span><span className="swimmer-notes-summary-meta"><b>{notes.length} {notes.length === 1 ? 'anteckning' : 'anteckningar'}</b>{latestNote && <small>Senast {new Date(`${latestNote.noteDate}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</small>}</span></summary>
      <div className="swimmer-notes-body">
        <form onSubmit={save}><div><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /><textarea maxLength={3000} placeholder="Skriv en observation eller något att följa upp…" value={content} onChange={(event) => setContent(event.target.value)} /><div className="swimmer-note-tools">{recording ? <button type="button" className="recording-button" onClick={stopRecording} disabled={transcribing}>⏹ Stoppa inspelning</button> : <button type="button" className={`text-button note-ai-button${transcribing ? ' ai-working' : ''}`} onClick={startRecording} disabled={polishing || transcribing}>🎙️ {transcribing ? 'Transkriberar…' : 'Läs in med röst'}</button>}<button type="button" className={`text-button note-ai-button${polishing ? ' ai-working' : ''}`} disabled={polishing || transcribing || !content.trim()} onClick={() => improve(content, date, setContent)}>{polishing ? 'Förbättrar texten…' : '✨ Förbättra text med AI'}</button></div></div><button className="secondary-button" disabled={saving || polishing || recording || transcribing || !content.trim()}>{saving ? 'Sparar…' : transcribing ? 'Transkriberar…' : 'Spara anteckning'}</button></form>
        {status && <small className="coach-note-status">{status}</small>}
        {notes.length > 0 ? <div className="swimmer-notes-list">{notes.map((note) => <article key={note.id}><details><summary><time dateTime={note.noteDate}>{new Date(`${note.noteDate}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}</time><span>{note.content.slice(0, 90)}{note.content.length > 90 ? '…' : ''}</span></summary>
          {editing === note.id ? <div className="swimmer-note-edit"><input type="date" value={editDraft.date} onChange={(event) => setEditDraft({ ...editDraft, date: event.target.value })} /><textarea maxLength={3000} value={editDraft.content} onChange={(event) => setEditDraft({ ...editDraft, content: event.target.value })} /><div><button type="button" className={`text-button${polishing ? ' ai-working' : ''}`} disabled={polishing || !editDraft.content.trim()} onClick={() => improve(editDraft.content, editDraft.date, (text) => setEditDraft((current) => ({ ...current, content: text })))}>{polishing ? 'Förbättrar texten…' : '✨ Förbättra text med AI'}</button><button type="button" className="secondary-button" disabled={saving} onClick={saveEdit}>Spara ändring</button><button type="button" className="text-button" onClick={() => setEditing(null)}>Avbryt</button></div></div> : <><p>{note.content}</p><div className="swimmer-note-actions"><button type="button" className="text-button" onClick={() => startEdit(note)}>Redigera</button><button type="button" className="text-button danger-text" disabled={saving} onClick={() => remove(note)}>Radera</button></div></>}
        </details></article>)}</div> : <p className="notes-empty">Inga sparade anteckningar ännu.</p>}
      </div>
    </details>
  )
}

function SwimmerDevelopmentGoalsCard({ profile, code, goals = [], onOpenGoal, onCreateGoal }) {
  const sortedGoals = [...goals].sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
  const activeGoals = sortedGoals.filter((goal) => goal.status !== 'complete')
  const previousGoals = sortedGoals.filter((goal) => goal.status === 'complete')
  const dateLabel = (value) => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }) : ''
  const goalRow = (goal) => <details className="swimmer-development-goal swimmer-disclosure" key={goal.id}>
    <summary><span><strong>{goal.title}</strong><small><span className={`goal-status ${goal.status}`}>{GOAL_STATUS[goal.status] || goal.status}</span>{goal.targetDate ? ` · mål ${dateLabel(goal.targetDate)}` : ''}</small></span></summary>
    <div className="swimmer-development-goal-content"><p>{goal.description}</p>{goal.nextStep && <div className="next-step"><strong>Nästa steg</strong><span>{goal.nextStep}</span></div>}<div className="swimmer-development-goal-image"><GoalAnalysisImage goal={goal} code={code} /></div><button type="button" className="secondary-button" onClick={() => onOpenGoal?.(profile.id, goal.id)}>Öppna och redigera →</button></div>
  </details>
  return <section className="swimmer-development-goals-card">
    <header><div><p className="eyebrow">Tränare + {profile.displayName}</p><h3>Utvecklingsmål</h3><small>{activeGoals.length ? `${activeGoals.length} ${activeGoals.length === 1 ? 'aktivt mål' : 'aktiva mål'}` : 'Inget aktivt mål just nu'}</small></div><button type="button" className="text-button" onClick={() => onCreateGoal?.(profile.id)}>Nytt mål +</button></header>
    {activeGoals.length ? <div className="swimmer-development-goal-list">{activeGoals.map(goalRow)}</div> : <button type="button" className="swimmer-development-goals-empty" onClick={() => onCreateGoal?.(profile.id)}><span>🎯</span><span><strong>Skapa ett gemensamt mål</strong><small>Simmaren väljs automatiskt</small></span><b>→</b></button>}
    {previousGoals.length > 0 && <details className="swimmer-previous-goals"><summary>Tidigare mål ({previousGoals.length})</summary><div>{previousGoals.map((goal) => <button type="button" key={goal.id} onClick={() => onOpenGoal?.(profile.id, goal.id)}><span><strong>{goal.title}</strong><small>{dateLabel(goal.updatedAt || goal.targetDate || goal.createdAt)} · Avslutat</small></span><span>→</span></button>)}</div></details>}
  </section>
}

function SwimmerStrengthProgramCard({ profile, training, code, onChanged, programType = 'strength' }) {
  const kind = programKind(programType)
  const direction = programActivityDirection(training?.sessions, profile.id, programType, todayKey())
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const programs = (training?.programs || []).filter((program) => program.type === programType && program.active !== false)
  const assignment = (training?.assignments || []).find((item) => item.profileId === profile.id && item.program.type === programType)
  const changeProgram = async (programId) => {
    if (!programId && assignment && !window.confirm(`Ta bort “${assignment.program.title}” från ${profile.displayName}? Genomförda pass och resultat sparas.`)) return
    setSaving(true); setStatus('')
    try {
      await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(programId ? { action: 'assign', type: programType, programId, profileId: profile.id } : { action: 'remove-assignment', assignmentId: assignment.id }) })
      await onChanged?.()
      setStatus(programId ? `${kind.title}met är tilldelat ✓` : 'Tilldelningen är borttagen. Historiken är sparad.')
    } catch (error) { setStatus(error.message) } finally { setSaving(false) }
  }
  return <details className={`swimmer-strength-program-card swimmer-disclosure${assignment ? ' assigned' : ''}`}>
    <SwimmerCardSummary icon={kind.icon} eyebrow={kind.title} title={assignment?.program.title || 'Inget program tilldelat'} direction={direction} status={assignment ? 'Aktivt' : 'Tilldela'} />
    <div className="swimmer-strength-program-body">
      <DirectionExplanation direction={direction} />
      {assignment && <p>{assignment.program.description}</p>}
      <label><span>{assignment ? 'Byt eller ta bort program' : `Tilldela program till ${profile.displayName}`}</span><select value={assignment?.program.id || ''} disabled={saving || !programs.length} onChange={(event) => changeProgram(event.target.value)}><option value="">{assignment ? 'Inget program' : programs.length ? `Välj ${kind.name}…` : 'Inga aktiva program'}</option>{programs.map((program) => <option value={program.id} key={program.id}>{program.title}</option>)}</select></label>
      <small>Program skapas och redigeras på sidan {kind.title}.</small>
      {programType === 'dryland' && <DrylandHistory logs={training?.drylandLogs || []} sessions={training?.sessions || []} profileId={profile.id} />}
      {status && <small className="coach-note-status" role="status">{status}</small>}
    </div>
  </details>
}

function Swimmers({ profiles, pendingProfiles, onProfilesChange, responses, code, aiEnabled = true, goalsEnabled = true, initialProfileId = '', onOpenGoal, onCreateGoal }) {
  const [reset, setReset] = useState(null)
  const [search, setSearch] = useState('')
  const [trafficFilter, setTrafficFilter] = useState('all')
  const [expandedProfile, setExpandedProfile] = useState(null)
  const [setupHelpProfile, setSetupHelpProfile] = useState(null)
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [swimmerTrendSummaries, setSwimmerTrendSummaries] = useState({})
  const [profilePoints, setProfilePoints] = useState({})
  const [artifactCatalog, setArtifactCatalog] = useState([])
  const [artifactAssignments, setArtifactAssignments] = useState([])
  const [artifactStatus, setArtifactStatus] = useState({})
  const [artifactError, setArtifactError] = useState('')
  const [training, setTraining] = useState(null)
  const [sleepRecords, setSleepRecords] = useState([])
  const [trainingGoalDrafts, setTrainingGoalDrafts] = useState({})
  const [trainingGoalStatus, setTrainingGoalStatus] = useState({})
  const [groupStatus, setGroupStatus] = useState({})
  const [tempusResults, setTempusResults] = useState({})
  const [tempusLoading, setTempusLoading] = useState({})
  const [developmentGoals, setDevelopmentGoals] = useState([])
  useEffect(() => { if (!initialProfileId) return; const profile = profiles.find((item) => item.id === initialProfileId); if (profile) { setSearch(profile.displayName); setTrafficFilter('all'); setExpandedProfile(profile.id) } }, [initialProfileId])
  useEffect(() => { apiRequest('/api/points?artifacts=true', code).then((data) => { setArtifactCatalog(data.catalog || []); setArtifactAssignments(data.assignments || []); setArtifactError('') }).catch((error) => setArtifactError(error.message || 'Kunde inte hämta artefakterna.')) }, [code])
  useEffect(() => { apiRequest('/api/points', code).then((data) => setProfilePoints(Object.fromEntries((data.profiles || []).map((item) => [item.profileId, item])))).catch(() => {}) }, [code])
  const loadTraining = () => apiRequest('/api/training', code).then(setTraining)
  useEffect(() => { loadTraining().catch(() => {}) }, [code])
  useEffect(() => {
    let active = true
    const end = todayKey()
    const start = new Date(Date.parse(`${end}T12:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10)
    apiRequest(`/api/responses?sleep=true&start=${start}&end=${end}`, code).then((data) => { if (active) setSleepRecords(data.records || []) }).catch(() => { if (active) setSleepRecords([]) })
    return () => { active = false }
  }, [code])
  useEffect(() => {
    if (!goalsEnabled) { setDevelopmentGoals([]); return }
    apiRequest('/api/goals', code).then((data) => setDevelopmentGoals(data.goals || [])).catch(() => setDevelopmentGoals([]))
  }, [code, goalsEnabled])
  useEffect(() => {
    if (!expandedProfile) return undefined
    let active = true
    const range = analysisRange('7')
    const query = new URLSearchParams({ start: range.start.toISOString(), end: range.end.toISOString(), previousStart: range.previousStart.toISOString(), previousEnd: (range.previousEnd || range.start).toISOString(), period: '7', profileId: expandedProfile })
    setSwimmerTrendSummaries((current) => ({ ...current, [expandedProfile]: { loading: true, trend: current[expandedProfile]?.trend || null } }))
    apiRequest(`/api/analytics?${query}`, code)
      .then((data) => { if (active) setSwimmerTrendSummaries((current) => ({ ...current, [expandedProfile]: { loading: false, trend: data.swimmerTrend || null } })) })
      .catch(() => { if (active) setSwimmerTrendSummaries((current) => ({ ...current, [expandedProfile]: { loading: false, trend: null, error: true } })) })
    return () => { active = false }
  }, [expandedProfile, code])
  const reviewProfile = async (profile, approved) => {
    if (!approved && !confirmDestructive(`Profilförfrågan från “${profile.displayName}” tas bort. Användarnamnet blir ledigt igen.`)) return
    try { await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: approved ? 'approve-profile' : 'reject-profile', profileId: profile.id }) }); await onProfilesChange() } catch (error) { window.alert(error.message) }
  }
  const createReset = async (profile) => {
    try {
      const data = await apiRequest('/api/profiles', code, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-reset', profileId: profile.id }),
      })
      setReset({ profile, code: data.resetCode })
    } catch (error) { window.alert(error.message) }
  }
  const toggleTestProfile = async (profile) => {
    try {
      await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-test-profile', profileId: profile.id, isTestProfile: !profile.isTestProfile }) })
      await onProfilesChange()
    } catch (error) { window.alert(error.message) }
  }
  const toggleProfileAccess = async (profile) => {
    const approved = profile.approvalStatus === 'approved'
    if (approved && !window.confirm(`Stäng av åtkomsten för ${profile.displayName}? Simmaren kan då inte logga in förrän åtkomsten aktiveras igen.`)) return
    try {
      await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-profile-access', profileId: profile.id, approved: !approved }) })
      await onProfilesChange()
    } catch (error) { window.alert(error.message) }
  }
  const removeProfile = async (profile) => {
    if (!confirmDestructive(`Profilen “${profile.displayName}” och all kopplad historik tas bort permanent. Detta går inte att ångra.`, 'RADERA PROFIL')) return
    try { await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-profile', profileId: profile.id }) }); await onProfilesChange() } catch (error) { window.alert(error.message) }
  }
  const trafficColorFor = (profile) => { const recent = responses.filter((item) => item.profileId === profile.id && responseDate(item) >= new Date(Date.now() - 6 * 86400000)); const sick = new Set(recent.filter((item) => item.type === 'sick').map((item) => dateKey(responseDate(item)))).size; const lowBody = recent.filter((item) => Number(item.body) <= 2).length; const lowFeeling = recent.filter((item) => Number(item.feeling) <= 2).length; if (!recent.length) return 'unknown'; if (sick >= 2 || (lowBody >= 2 && lowFeeling >= 2)) return 'red'; if (sick || lowBody || lowFeeling) return 'yellow'; return 'green' }
  const visibleProfiles = profiles
    .filter((profile) => trafficFilter === 'all' || trafficColorFor(profile) === trafficFilter)
    .filter((profile) => `${profile.displayName} ${profile.username}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      const latestToday = (profile) => responses
        .filter((item) => item.profileId === profile.id && dateKey(responseDate(item)) === todayKey())
        .sort(compareCheckinsNewest)[0]
      const activityRank = (item) => item?.type === 'after' ? 3 : item?.type === 'before' && item.competition === true ? 2 : item ? 1 : 0
      return activityRank(latestToday(b)) - activityRank(latestToday(a)) || a.displayName.localeCompare(b.displayName, 'sv')
    })
  const grantArtifact = async (profile, artifact) => {
    setArtifactStatus((current) => ({ ...current, [`${profile.id}-${artifact.artifact_key}`]: 'Sparar…' }))
    try {
      const result = await apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'grant-artifact', profileId: profile.id, artifactKey: artifact.artifact_key }) })
      if (!result.alreadyAssigned) setArtifactAssignments((current) => [...current, { profile_id: profile.id, artifact_id: artifact.id }])
      setArtifactStatus((current) => ({ ...current, [`${profile.id}-${artifact.artifact_key}`]: result.alreadyAssigned ? 'Redan tilldelad' : 'Tilldelad ✓' }))
    } catch (error) { setArtifactStatus((current) => ({ ...current, [`${profile.id}-${artifact.artifact_key}`]: error.message })) }
  }
  const revokeArtifact = async (profile, artifact) => {
    const key = `${profile.id}-${artifact.artifact_key}`
    if (!window.confirm(`Återkalla ${artifact.name} från ${profile.displayName}? Artefakten tas bort, men intjänade poäng påverkas inte.`)) return
    setArtifactStatus((current) => ({ ...current, [key]: 'Återkallar…' }))
    try {
      await apiRequest('/api/points', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'revoke-artifact', profileId: profile.id, artifactKey: artifact.artifact_key }) })
      setArtifactAssignments((current) => current.filter((item) => !(item.profile_id === profile.id && item.artifact_id === artifact.id)))
      setArtifactStatus((current) => ({ ...current, [key]: 'Återkallad' }))
    } catch (error) { setArtifactStatus((current) => ({ ...current, [key]: error.message })) }
  }
  const saveTrainingGoals = async (profile, swimGoal, crossGoal) => {
    const draft = trainingGoalDrafts[profile.id] || {}
    const swimTarget = Number(draft.swim ?? swimGoal?.target), strengthTarget = Number(draft.strength ?? crossGoal?.strengthTarget ?? 3), drylandTarget = Number(draft.dryland ?? crossGoal?.drylandTarget ?? 3)
    if (!Number.isInteger(swimTarget) || swimTarget < 1 || swimTarget > 14 || !Number.isInteger(strengthTarget) || strengthTarget < 0 || strengthTarget > 7 || !Number.isInteger(drylandTarget) || drylandTarget < 0 || drylandTarget > 7) { setTrainingGoalStatus((current) => ({ ...current, [profile.id]: 'Kontrollera målen: simning 1–14, land/styrka 0–7.' })); return }
    setTrainingGoalStatus((current) => ({ ...current, [profile.id]: 'Sparar…' }))
    try {
      await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'coach-season-goal', profileId: profile.id, target: swimTarget, title: swimGoal?.title || 'Mitt simmål', startDate: localDateValue(), endDate: `${new Date().getFullYear()}-12-20`, reflection: swimGoal?.reflection || '' }) })
      await apiRequest('/api/training', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cross-goals', profileId: profile.id, strengthTarget, drylandTarget }) })
      await loadTraining()
      setTrainingGoalStatus((current) => ({ ...current, [profile.id]: 'Sparat ✓' }))
    } catch (error) { setTrainingGoalStatus((current) => ({ ...current, [profile.id]: error.message })) }
  }
  const saveGroup = async (profile, trainingGroup) => {
    setGroupStatus((current) => ({ ...current, [profile.id]: 'Sparar…' }))
    try { await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-training-group', profileId: profile.id, trainingGroup: trainingGroup || null }) }); await onProfilesChange(); setGroupStatus((current) => ({ ...current, [profile.id]: 'Sparat ✓' })) } catch (error) { setGroupStatus((current) => ({ ...current, [profile.id]: error.message })) }
  }
  const loadTempusResults = async (profile) => {
    setTempusLoading((current) => ({ ...current, [profile.id]: true }))
    try { const data = await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get-tempus-results', tempusId: profile.tempusId }) }); setTempusResults((current) => ({ ...current, [profile.id]: data })) } catch (error) { window.alert(error.message) } finally { setTempusLoading((current) => ({ ...current, [profile.id]: false })) }
  }

  if (selectedProfile) return <AnalysisDashboard code={code} profile={selectedProfile} pointInfo={profilePoints[selectedProfile.id]} onBack={() => setSelectedProfile(null)} />
  return (
    <section className="swimmers-section">
      <div className="period-heading"><div><p className="eyebrow">Frivilliga profiler</p><h2>Simmare</h2></div><div className="big-count"><strong>{profiles.length}</strong><span>profiler</span></div></div>
      <label className="swimmer-search"><span>🔎</span><input type="search" placeholder="Sök namn eller användarnamn…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="swimmer-traffic-filters" aria-label="Filtrera trafikljus"><span>Visa:</span>{[['all', 'Alla'], ['red', '🔴 Röda'], ['yellow', '🟡 Gula'], ['green', '🟢 Gröna']].map(([value, label]) => <button type="button" className={trafficFilter === value ? 'active' : ''} key={value} onClick={() => setTrafficFilter(value)}>{label}</button>)}</div>
      {artifactError && <p className="form-error">Artefakter kunde inte laddas. Kontrollera att migration 013 är körd i Supabase.</p>}
      {pendingProfiles.length > 0 && <section className="pending-profiles"><div><p className="eyebrow">Behöver granskas</p><h3>Nya profilförfrågningar</h3></div>{pendingProfiles.map((profile) => <article key={profile.id}><span>{profile.emoji}</span><div><strong>{profile.displayName}</strong><small>@{profile.username} · skapad {new Date(profile.createdAt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</small></div><button className="approve-profile" onClick={() => reviewProfile(profile, true)}>Godkänn</button><button onClick={() => reviewProfile(profile, false)}>Avvisa</button></article>)}</section>}
      {reset && <div className="reset-banner"><span>{reset.profile.emoji}</span><div><small>Engångskod för {reset.profile.displayName} · giltig 30 minuter</small><strong>{reset.code}</strong></div><button onClick={() => setReset(null)}>×</button></div>}
      {visibleProfiles.length ? <div className="swimmer-grid">{visibleProfiles.map((profile) => {
        const items = responses.filter((item) => item.profileId === profile.id)
        const todayItem = latestCheckinForDay(items, todayKey())
        const after = items.filter((item) => item.type === 'after')
        const level = profilePoints[profile.id]?.level || { emoji: '🥉', name: 'Brons' }
        const profileStars = currentStarState(training, profile.id)
        const starCount = [profileStars.weeklyPlan, profileStars.crossGoals, profileStars.swimGoal, profileStars.monthlySwim].filter(Boolean).length
        const earnedArtifacts = artifactAssignments.filter((item) => item.profile_id === profile.id).map((item) => artifactCatalog.find((artifact) => artifact.id === item.artifact_id)).filter(Boolean)
        const weekStartDate = dateKey(weekStart(new Date()))
        const profileSessions = training?.sessions?.filter((item) => item.profileId === profile.id && item.date >= weekStartDate && item.date <= todayKey()) || []
        const hasSwimToday = profileSessions.some((item) => item.type === 'swim' && item.date === todayKey())
        const raceBefore = todayItem?.type === 'before' && todayItem.competition === true
        const raceAfter = todayItem?.type === 'after' && todayItem.competition === true
        const status = hasSwimToday && !todayItem ? ['after', '✓ Har tränat idag'] : todayItem && ({ sick: ['sick', '🤒 Sjuk idag'], rest: ['rest', '⏸️ Tränar inte idag'], before: [raceBefore ? 'race' : 'before', raceBefore ? '🏁 Ska tävla idag' : '→ Ska träna idag'], after: [raceAfter ? 'race' : 'after', raceAfter ? '🏅 Har tävlat idag' : `✓ ${checkinStatus(todayItem)} idag`] }[todayItem.type])
        const attention = hasSwimToday && !todayItem ? '🏊 Tränat idag' : raceBefore ? '🏁 Ska tävla idag' : raceAfter ? '🏅 Har tävlat idag' : todayItem?.type === 'after' ? `✓ ${checkinStatus(todayItem)} idag` : todayItem?.type === 'sick' ? '🤒 Sjuk idag' : todayItem?.type === 'rest' ? '⏸️ Tränar inte idag' : todayItem?.body <= 2 ? `⚠️ Kroppen ${todayItem.body}/5` : todayItem?.feeling <= 2 ? `⚠️ Känsla ${todayItem.feeling}/5` : todayItem ? '✓ Aktiv idag' : 'Ingen aktivitet idag'
        const swimGoal = training?.seasonGoals?.find((goal) => goal.profileId === profile.id && goal.active && goal.startDate <= todayKey() && goal.endDate >= todayKey())
        const crossGoal = training?.crossGoals?.find((goal) => goal.profileId === profile.id && goal.startDate <= todayKey() && (!goal.endDate || goal.endDate >= todayKey()))
        const recentItems = items.filter((item) => { const date = responseDate(item); const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 6); return date >= cutoff })
        const trendSummary = swimmerTrendSummaries[profile.id]?.trend
        const trendStates = { up: { arrow: '↗', title: 'Träningsläget förbättras', tone: 'up' }, down: { arrow: '↘', title: 'Träningsläget har sjunkit', tone: 'down' }, steady: { arrow: '→', title: 'Träningsläget är stabilt', tone: 'neutral' }, mixed: { arrow: '↕', title: 'Blandad utveckling', tone: 'mixed' }, insufficient: { arrow: '—', title: 'För lite underlag', tone: 'neutral' } }
        const trendState = trendStates[trendSummary?.state] || trendStates.insufficient
        const trendLoading = !swimmerTrendSummaries[profile.id] || swimmerTrendSummaries[profile.id].loading
        const trendError = swimmerTrendSummaries[profile.id]?.error
        const trendDate = (value) => new Date(`${value}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
        const trendLastDay = (value) => { const day = new Date(`${value}T12:00:00`); day.setDate(day.getDate() - 1); return trendDate(dateKey(day)) }
        const lowBody = recentItems.filter((item) => Number(item.body) <= 2).length, lowFeeling = recentItems.filter((item) => Number(item.feeling) <= 2).length, sickDays = new Set(recentItems.filter((item) => item.type === 'sick').map((item) => dateKey(responseDate(item)))).size
        const sleepEnd = todayKey()
        const sleepStart = new Date(Date.parse(`${sleepEnd}T12:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10)
        const recentSleep = sleepRecords.filter((row) => row.profile_id === profile.id && row.activity_date >= sleepStart && row.activity_date <= sleepEnd)
        const sleepReasons = sleepFollowUpReasons(recentSleep)
        const plannedRecent = training?.plannedSessions?.filter((item) => item.profileId === profile.id && item.date >= weekStartDate && item.date <= todayKey()) || []
        const missedPlanned = plannedRecent.filter((item) => !profileSessions.some((session) => session.date === item.date && session.slot === item.slot)).length
        const signalReasons = []
        if (sickDays) signalReasons.push(`${sickDays} sjukdag${sickDays > 1 ? 'ar' : ''}`)
        if (lowBody) signalReasons.push(`tung kropp ${lowBody} gång${lowBody > 1 ? 'er' : ''}`)
        if (lowFeeling) signalReasons.push(`låg känsla ${lowFeeling} gång${lowFeeling > 1 ? 'er' : ''}`)
        if (missedPlanned) signalReasons.push(`${missedPlanned} missat planerat pass`)
        signalReasons.push(...sleepReasons)
        const hasActivityData = recentItems.length > 0 || recentSleep.length > 0 || profileSessions.length > 0 || plannedRecent.length > 0
        const traffic = !hasActivityData ? { color: 'unknown', label: 'För lite data', icon: '⚪' } : (sickDays >= 2 || missedPlanned >= 3 || (lowBody >= 2 && lowFeeling >= 2) || sleepReasons.length > 0) ? { color: 'red', label: 'Följ upp', icon: '🔴' } : signalReasons.length ? { color: 'yellow', label: 'Var uppmärksam', icon: '🟡' } : { color: 'green', label: 'Ser stabilt ut', icon: '🟢' }
        const trainingGoals = [{ icon: '🏊', label: 'Simning', completed: profileSessions.filter((item) => item.type === 'swim').length, target: swimGoal?.target }, { icon: '🤸', label: 'Landträning', completed: profileSessions.filter((item) => item.type === 'dryland').length, target: crossGoal?.drylandTarget ?? 3 }, { icon: '🏋️', label: 'Styrka', completed: profileSessions.filter((item) => item.type === 'strength').length, target: crossGoal?.strengthTarget ?? 3 }].filter((item) => item.target > 0)
        const setupChecks = [
          { key: 'tempus', label: 'Tempus-ID', complete: Boolean(profile.tempusId) },
          { key: 'stroke', label: 'specialinriktning', complete: Boolean(profile.primaryStroke || profile.secondaryStroke) },
          { key: 'goals', label: 'överenskomna mål för simning, landträning och styrka', complete: Boolean(swimGoal?.target != null && crossGoal?.drylandTarget != null && crossGoal?.strengthTarget != null) },
          { key: 'group', label: 'träningsgrupp', complete: Boolean(profile.trainingGroup) },
        ]
        const setupCompleteCount = setupChecks.filter((item) => item.complete).length
        const setupIndicatorColor = setupCompleteCount === 3 ? 'gray' : setupCompleteCount === 2 ? 'green' : setupCompleteCount === 1 ? 'yellow' : 'red'
        const setupMissing = setupChecks.filter((item) => !item.complete).map((item) => item.label)
        const setupIndicatorTitle = setupCompleteCount === 4
          ? 'Profilinställningar kompletta'
          : `${setupCompleteCount} av 4 profilinställningar klara. Saknas: ${setupMissing.join(', ')}.`
        const isExpanded = expandedProfile === profile.id
        return <article key={profile.id} className={`swimmer-card ${isExpanded ? 'expanded' : 'compact'}`}>
          <button type="button" className="swimmer-card-toggle" aria-expanded={isExpanded} onClick={() => setExpandedProfile(isExpanded ? null : profile.id)}>
            <div className="swimmer-name"><span>{profile.emoji}</span><div><strong>{profile.displayName}</strong><small>@{profile.username}</small></div><b className="swimmer-level">{level.emoji} {level.name}</b></div>
            <div className="swimmer-card-meta"><span className="swimmer-stars" title={`${starCount} av 4 träningsstjärnor`}>★ {starCount}/4</span><span className={`swimmer-traffic ${traffic.color}`} title={signalReasons.length ? signalReasons.join(' · ') : traffic.label}>{traffic.icon} <small>{traffic.label}</small></span><span className="swimmer-mood" title={todayItem?.feeling ? 'Simmarens känsla idag' : undefined}>{todayItem?.feeling ? FEELINGS[Number(todayItem.feeling) - 1]?.emoji : ''}</span><span className={`swimmer-attention ${todayItem?.type === 'sick' || todayItem?.body <= 2 || todayItem?.feeling <= 2 ? 'needs-attention' : ''}`}>{attention}</span>{!isExpanded && aiEnabled && profile.assistantEnabled !== false && <span className="swimmer-feature-icon" title="Simkoll-assistenten är aktiverad" aria-label="Simkoll-assistenten är aktiverad">🦉</span>}{!isExpanded && aiEnabled && profile.aiAnalysisStatus === 'approved' && <span className="swimmer-feature-icon" title="Personlig AI-analys är aktiverad" aria-label="Personlig AI-analys är aktiverad">🔍</span>}{!isExpanded && setupCompleteCount < 4 && <span className={`swimmer-setup-indicator ${setupIndicatorColor}`} title={setupIndicatorTitle} aria-label={setupIndicatorTitle} role="button" tabIndex="0" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setSetupHelpProfile(setupHelpProfile === profile.id ? null : profile.id) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setSetupHelpProfile(setupHelpProfile === profile.id ? null : profile.id) } }}>?</span>}<span className="swimmer-expand-hint">{isExpanded ? '▲ Dölj' : '▼ Visa mer'}</span></div>
          </button>
          {!isExpanded && setupCompleteCount < 4 && setupHelpProfile === profile.id && <div className={`swimmer-setup-help ${setupIndicatorColor}`} role="status"><div><strong>{setupCompleteCount}/4 inställningar klara</strong><button type="button" onClick={() => setSetupHelpProfile(null)} aria-label="Stäng informationen">×</button></div><p>Saknas: {setupMissing.join(', ')}.</p></div>}
          {isExpanded && <div className="swimmer-card-details">
            {profile.isTestProfile && <div className="test-profile-badge">🧪 Testprofil · räknas inte i gruppstatistik</div>}
            {signalReasons.length > 0 && <div className={`swimmer-traffic-reasons ${traffic.color}`}><strong>{traffic.icon} Att följa upp</strong><span>{signalReasons.join(' · ')}</span></div>}
            {status && <div className={`swimmer-status ${status[0]}`}>{status[1]}</div>}
            <button type="button" className="swimmer-trend-card" onClick={() => setSelectedProfile(profile)} aria-label={`Öppna statistik för ${profile.displayName}`}>
              <span className={`swimmer-trend-arrow ${trendState.tone}`} aria-hidden="true">{trendLoading && !trendSummary ? '…' : trendState.arrow}</span>
              <span className="swimmer-trend-copy"><small>Simmarens riktning</small><strong>{trendLoading && !trendSummary ? 'Hämtar riktning…' : trendError ? 'Riktningen kunde inte hämtas' : trendState.title}</strong><span>{trendSummary?.periods ? `${trendDate(trendSummary.periods.start)}–${trendLastDay(trendSummary.periods.end)} jämfört med ${trendDate(trendSummary.periods.previousStart)}–${trendLastDay(trendSummary.periods.previousEnd)}` : 'Senaste 7 dagarna jämfört med föregående 7 dagar'}</span></span>
              <b className="swimmer-trend-open">Öppna statistik →</b>
            </button>
            <SwimmerCompactWeek training={training} profileId={profile.id} />
            {profilePoints[profile.id] && <PointProgress info={profilePoints[profile.id]} compact />}
            <section className="swimmer-training-goals"><p className="eyebrow">Simning, landträning och styrka</p>{trainingGoals.length ? <div>{trainingGoals.map((item) => <div key={item.label}><span>{item.icon}</span><p><strong>{item.completed} av {item.target} {item.label.toLowerCase()}</strong><i><b style={{ width: `${Math.min(100, Math.round((item.completed / item.target) * 100))}%` }} /></i></p></div>)}</div> : <small>Inga aktiva träningsmål registrerade.</small>}<details className="swimmer-goal-edit"><summary>Ändra överenskomna mål</summary><form onSubmit={(event) => { event.preventDefault(); saveTrainingGoals(profile, swimGoal, crossGoal) }}><label>Simning / vecka<input type="number" min="1" max="14" value={trainingGoalDrafts[profile.id]?.swim ?? swimGoal?.target ?? ''} onChange={(event) => setTrainingGoalDrafts((current) => ({ ...current, [profile.id]: { ...(current[profile.id] || {}), swim: event.target.value } }))} /></label><label>Land / vecka<input type="number" min="0" max="7" value={trainingGoalDrafts[profile.id]?.dryland ?? crossGoal?.drylandTarget ?? 3} onChange={(event) => setTrainingGoalDrafts((current) => ({ ...current, [profile.id]: { ...(current[profile.id] || {}), dryland: event.target.value } }))} /></label><label>Styrka / vecka<input type="number" min="0" max="7" value={trainingGoalDrafts[profile.id]?.strength ?? crossGoal?.strengthTarget ?? 3} onChange={(event) => setTrainingGoalDrafts((current) => ({ ...current, [profile.id]: { ...(current[profile.id] || {}), strength: event.target.value } }))} /></label><button type="submit">Spara mål</button>{trainingGoalStatus[profile.id] && <small>{trainingGoalStatus[profile.id]}</small>}</form><small>Ändras efter dialog med simmaren.</small></details></section>
            <SwimmerStrengthProgramCard profile={profile} training={training} code={code} onChanged={loadTraining} />
            <SwimmerStrengthProgramCard programType="dryland" profile={profile} training={training} code={code} onChanged={loadTraining} />
            <SwimmerTrainingTimesCard profile={profile} code={code} request={apiRequest} />
            <SleepHistory profileId={profile.id} code={code} request={apiRequest} responses={responses.filter((item) => item.profileId === profile.id)} />
            {goalsEnabled && <SwimmerDevelopmentGoalsCard code={code} profile={profile} goals={developmentGoals.filter((goal) => goal.profileId === profile.id)} onOpenGoal={onOpenGoal} onCreateGoal={onCreateGoal} />}
            <div className="swimmer-stats"><div><strong>{items.length}</strong><small>svar</small></div><div><strong>{average('feeling', items)}</strong><small>känsla</small></div><div><strong>{average('rpe', after)}</strong><small>RPE</small></div></div>
            <SwimmerNotes profile={profile} code={code} />
            {items.length > 0 && <details className="swimmer-details"><summary>Visa senaste svar</summary>{items.slice(0, 5).map((item) => <div key={item.id}><span>{FEELINGS[item.feeling - 1]?.emoji}</span><p><strong>{new Date(item.createdAt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</strong><small>{item.rpe ? `RPE ${item.rpe}` : DAY_TYPES.find((type) => type.value === item.type)?.title}{item.temperature ? ` · 🌡️ ${TEMPERATURE_LABELS[Number(item.temperature) - 1] || `${item.temperature}/5`}` : ''}{item.comment ? ` · “${item.comment}”` : ''}</small></p></div>)}</details>}
            {artifactCatalog.length > 0 && <details className="artifact-picker"><summary>⭐ Artefakter för {profile.displayName}</summary><div>{artifactCatalog.map((artifact) => { const key = `${profile.id}-${artifact.artifact_key}`; const assigned = earnedArtifacts.some((item) => item.id === artifact.id); const busy = artifactStatus[key] === 'Sparar…' || artifactStatus[key] === 'Återkallar…'; return <button type="button" key={artifact.id} disabled={busy} className={assigned ? 'assigned' : ''} onClick={() => assigned ? revokeArtifact(profile, artifact) : grantArtifact(profile, artifact)} title={artifact.description}>{artifact.emoji} <span>{assigned ? 'Återkalla' : `Ge ${artifact.name}`}</span>{artifactStatus[key] && <small>{artifactStatus[key]}</small>}</button> })}</div></details>}
            <details className="profile-tools profile-settings"><summary>⚙️ Profilinställningar</summary><div>
              <small className="profile-settings-section-title">Träningsprofil</small>
              <div className="tempus-edit"><div><strong>Tempus-ID</strong><small>{profile.tempusId ? 'Används i Tävlingsresultat' : 'Lägg till för att koppla resultat'}</small></div><form onSubmit={(event) => { event.preventDefault(); const value = event.currentTarget.elements.tempusId.value.trim(); apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-tempus-id', profileId: profile.id, tempusId: value }) }).then(() => onProfilesChange()).catch((error) => window.alert(error.message)) }}><label><input name="tempusId" inputMode="numeric" pattern="[0-9]{1,12}" maxLength="12" defaultValue={profile.tempusId || ''} placeholder="t.ex. 273688" /></label><button type="submit">Spara</button></form></div>
              <div className="tempus-edit"><div><strong>Träningsgrupp</strong><small>Styr vilka pass simmaren ser</small></div><label><select value={profile.trainingGroup || ''} onChange={(event) => saveGroup(profile, event.target.value)}><option value="">Ingen grupp</option><option value="ungdom_orange">Ungdom Orange</option><option value="ungdom_svart">Ungdom Svart</option><option value="junior">Junior</option></select></label>{groupStatus[profile.id] && <small>{groupStatus[profile.id]}</small>}</div>
              <SwimmerSpecialtyEditor profile={profile} code={code} onSaved={() => onProfilesChange()} />
              <small className="profile-settings-section-title divided">AI-stöd</small>
              <div className="ai-profile-setting"><section><strong>Simkoll-assistenten</strong><small>{aiEnabled ? (profile.assistantEnabled === false ? 'Avstängd för simmaren.' : 'Påslagen för simmaren.') : 'AI-stöd är avstängt globalt i inställningarna.'}</small><button type="button" disabled={!aiEnabled} onClick={async () => { try { await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-assistant-status', profileId: profile.id, enabled: profile.assistantEnabled === false }) }); await onProfilesChange() } catch (error) { window.alert(error.message) } }}>{profile.assistantEnabled === false ? 'Aktivera assistenten' : 'Stäng av assistenten'}</button></section><section><strong>Personlig AI-analys</strong><small>{profile.aiAnalysisStatus === 'approved' ? 'På för simmaren. Tränaren skapar eller uppdaterar analysen under Visa statistik; simmaren kan läsa den sparade analysen.' : profile.aiAnalysisStatus === 'pending' ? 'Godkännande inväntas. Ingen analys skapas eller visas för simmaren ännu.' : profile.aiAnalysisStatus === 'revoked' ? 'Avstängd. Simmaren kan inte se sin personliga analys.' : 'Avstängd. Inhämta först vårdnadshavarens godkännande enligt klubbens rutin.'}</small>{profile.aiAnalysisStatus === 'approved' ? <button type="button" onClick={async () => { try { await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-ai-analysis-status', profileId: profile.id, status: 'revoked' }) }); await onProfilesChange() } catch (error) { window.alert(error.message) } }}>Stäng av analysen för simmaren</button> : <button type="button" onClick={async () => { if (!window.confirm('Har vårdnadshavarens godkännande hämtats in enligt klubbens rutin? När du aktiverar detta kan simmaren läsa en analys som tränaren skapar. Aktiveringen i sig kör ingen AI-analys och kostar inget.')) return; try { await apiRequest('/api/profiles', code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-ai-analysis-status', profileId: profile.id, status: 'approved' }) }); await onProfilesChange() } catch (error) { window.alert(error.message) } }}>Aktivera analys för simmaren</button>}{profile.aiAnalysisStatus !== 'approved' && <small>Ingen förfrågan skickas automatiskt. Aktivera först när godkännandet är inhämtat.</small>}</section></div>
              <small className="profile-settings-section-title account">Konto och åtkomst</small>
              <small className="profile-created-date">Profil skapad <strong>{profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' }) : 'datum saknas'}</strong></small><button onClick={() => toggleProfileAccess(profile)}>{profile.approvalStatus === 'approved' ? 'Stäng av simmaråtkomst' : 'Aktivera simmaråtkomst'}</button><small className="profile-access-status">{profile.approvalStatus === 'approved' ? 'Åtkomst aktiv · medgivande registrerat' : 'Åtkomst avstängd · inväntar medgivande'}</small><button onClick={() => createReset(profile)}>Återställ PIN</button><button className="test-profile-toggle" onClick={() => toggleTestProfile(profile)}>{profile.isTestProfile ? 'Ta med i statistik igen' : 'Markera som testprofil'}</button><button className="delete-profile-button" onClick={() => removeProfile(profile)}>Radera profil</button>
            </div></details>
          </div>}
        </article>
      })}</div> : <EmptyPeriod title={profiles.length ? 'Ingen simmare matchar sökningen' : 'Inga profiler ännu'} periodLabel="Simmare" />}
    </section>
  )
}

function PeriodOverview({ responses, profiles, title, periodLabel, showDays, hasPlannedCompetition = false }) {
  const [selectedFeeling, setSelectedFeeling] = useState(null)
  const [selectedMetric, setSelectedMetric] = useState(null)
  useEffect(() => { setSelectedMetric(null) }, [periodLabel])
  const metricSummaries = useMemo(() => Object.fromEntries(['feeling', 'rpe', 'pass', 'setup'].map((key) => [key, coachMetricDetails(key, responses, profiles)])), [responses, profiles])
  const profileById = useMemo(() => new Map((profiles || []).map((profile) => [profile.id, profile])), [profiles])
  const distribution = useMemo(() => FEELINGS.map((feeling) => ({
    ...feeling,
    count: responses.filter((item) => item.feeling === feeling.value).length,
  })), [responses])
  const selectedItems = selectedFeeling ? responses.filter((item) => item.feeling === selectedFeeling) : []
  const identifiedItems = selectedItems.filter((item) => item.profileId && profileById.has(item.profileId))
  const anonymousCount = responses.filter((item) => !item.profileId || !profileById.has(item.profileId)).length
  const normalActivityCounts = DAY_TYPES.map((type) => {
      const matching = responses.filter((item) => item.type === type.value && !(type.value === 'before' && item.competition === true))
      return { ...type, profiles: new Set(matching.map((item) => item.profileId).filter((id) => id && profileById.has(id))).size, answers: matching.length }
  })
  const raceResponses = responses.filter((item) => item.type === 'before' && item.competition === true)
  const raceActivity = { value: 'race', title: 'Ska tävla idag', profiles: new Set(raceResponses.map((item) => item.profileId).filter((id) => id && profileById.has(id))).size, answers: raceResponses.length, planned: hasPlannedCompetition }
  const activityCounts = raceActivity.answers || hasPlannedCompetition ? [raceActivity, ...normalActivityCounts] : normalActivityCounts
  const latestByProfile = [...identifiedItems].sort(compareCheckinsNewest).reduce((result, item) => {
    if (!result.some((entry) => entry.profileId === item.profileId)) result.push(item)
    return result
  }, [])
  const signalFor = (item) => item.raceConcern === 'sick_or_pain' ? '⚠️ Sjuk eller ont inför tävling' : item.type === 'sick' ? '🤒 Känner sig sjuk' : item.type === 'rest' ? '⏸️ Tränar inte idag' : item.body <= 2 ? `Kroppen ${item.body}/5` : item.feeling <= 2 ? `Känsla ${item.feeling}/5` : ''

  if (!responses.length) {
    return <EmptyPeriod title={title} periodLabel={periodLabel} />
  }

  return (
    <>
      <div className="period-heading"><div><p className="eyebrow">{periodLabel}</p><h2>{title}</h2></div><div className="big-count"><strong>{anonymousCount}</strong><span>anonyma svar</span></div></div>
      <section className="stats-grid">
        <Stat title="Gruppens känsla" helpTerm="Känsla" value={`${metricSummaries.feeling.average} / 5`} note={`${metricSummaries.feeling.entries.length} svar · alla incheckningar`} onOpen={() => setSelectedMetric('feeling')} />
        <Stat title="Upplevd ansträngning" helpTerm="RPE" value={`${metricSummaries.rpe.average} / 10`} note={`${metricSummaries.rpe.entries.length} svar efter träning`} onOpen={() => setSelectedMetric('rpe')} />
        <Stat title="Passet" value={`${metricSummaries.pass.average} / 5`} note={`${metricSummaries.pass.entries.length} svar · simmarnas betyg`} onOpen={() => setSelectedMetric('pass')} />
        <Stat title="Upplägget" value={`${metricSummaries.setup.average} / 5`} note={`${metricSummaries.setup.entries.length} svar · hur det fungerade`} onOpen={() => setSelectedMetric('setup')} />
      </section>
      {selectedMetric && <CoachMetricDetails key={selectedMetric} metricKey={selectedMetric} responses={responses} profiles={profiles} periodLabel={periodLabel} onClose={() => setSelectedMetric(null)} />}

      {showDays && <WeekDays responses={responses} />}

      <section className="coach-card">
        <div className="section-heading"><div><p className="eyebrow">Överblick</p><h2>Så känns det i gruppen</h2></div></div>
        <div className="distribution">
          {distribution.map((item) => (
            <button type="button" className={`distribution-item ${selectedFeeling === item.value ? 'selected' : ''}`} key={item.value} onClick={() => setSelectedFeeling(selectedFeeling === item.value ? null : item.value)}><span className="dist-emoji">{item.emoji}</span><span className="bar-track"><span style={{ height: `${Math.max(8, (item.count / responses.length) * 100)}%` }} /></span><strong>{item.count}</strong><small>{item.label}</small></button>
          ))}
        </div>
        {selectedFeeling && <section className="feeling-followup"><div><p className="eyebrow">Profilerade svar · {FEELINGS[selectedFeeling - 1].label}</p><h3>Vilka valde detta?</h3></div><button type="button" onClick={() => setSelectedFeeling(null)}>Stäng</button>{latestByProfile.length ? <div className="feeling-profile-list">{latestByProfile.map((item) => { const owner = profileById.get(item.profileId); return <article key={item.profileId}><span>{owner.emoji}</span><div><strong>{owner.displayName}</strong><small>{signalFor(item) || 'Svarade på känslan'} · {new Date(item.createdAt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</small></div></article> })}</div> : <p className="empty">Inga profilerade svar på denna nivå.</p>}<small className="feeling-anonymous">{selectedItems.length - identifiedItems.length} anonyma svar visas inte individuellt.</small></section>}
      </section>

      <div className="coach-columns">
        <section className="coach-card">
          <p className="eyebrow">Aktivitet</p><h2>Vad har gruppen gjort?</h2>
          <div className="type-list">
            {activityCounts.map((item) => <button type="button" className="activity-response-button" key={item.value} onClick={() => setSelectedMetric(`activity:${item.value}`)} aria-haspopup="dialog" aria-label={`${item.title}: visa ${item.answers} svar från ${item.profiles} profiler`}><span>{item.title}<small>{item.planned && !item.answers ? 'Planerad tävling · Ingen har checkat in ännu' : `${item.answers} svar · Visa vilka →`}</small></span><strong>{item.profiles}<small>{item.profiles === 1 ? 'profil' : 'profiler'}</small></strong></button>)}
          </div>
        </section>
        <section className="coach-card comments-card">
          <p className="eyebrow">Anonymt</p><h2>Kommentarer</h2>
          {(() => { const comments = [...new Map(responses.filter((item) => item.comment?.trim()).map((item) => [item.comment.trim().toLocaleLowerCase('sv-SE'), item.comment.trim()])).values()]; return comments.length ? comments.map((comment) => <blockquote key={comment}>“{comment}”</blockquote>) : <p className="empty">Inga kommentarer under perioden.</p> })()}
        </section>
      </div>
    </>
  )
}

function WeekDays({ responses }) {
  const { start } = previousWeekRange()
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const items = responses.filter((response) => dateKey(responseDate(response)) === dateKey(date))
    return { date, items }
  })

  return (
    <section className="coach-card week-card">
      <p className="eyebrow">Dag för dag</p><h2>Veckans utveckling</h2>
      <div className="week-days">
        {days.map(({ date, items }) => (
          <div key={dateKey(date)} className={items.length ? '' : 'no-data'}>
            <span>{date.toLocaleDateString('sv-SE', { weekday: 'short' }).replace('.', '')}</span>
            <strong>{items.length ? FEELINGS[Math.max(0, Math.round(Number(average('feeling', items))) - 1)]?.emoji : '–'}</strong>
            <small>{items.length} svar</small>
          </div>
        ))}
      </div>
    </section>
  )
}

function History({ responses }) {
  const groups = useMemo(() => {
    const byDay = responses.reduce((result, response) => {
      const key = dateKey(responseDate(response))
      result[key] = [...(result[key] || []), response]
      return result
    }, {})
    return Object.entries(byDay).sort(([a], [b]) => b.localeCompare(a))
  }, [responses])

  if (!groups.length) return <EmptyPeriod title="Ingen historik ännu" periodLabel="Tidigare svar" />

  return (
    <section className="history-section">
      <div className="period-heading"><div><p className="eyebrow">Alla registrerade dagar</p><h2>Historik</h2></div><div className="big-count"><strong>{groups.length}</strong><span>dagar med svar</span></div></div>
      <div className="history-list">
        {groups.map(([key, items]) => {
          const after = items.filter((item) => item.type === 'after')
          const temperature = average('temperature', after)
          const temperatureLabel = temperature === '–' ? 'temperatur' : TEMPERATURE_LABELS[Math.max(0, Math.round(Number(temperature)) - 1)] || 'temperatur'
          return (
            <article key={key} className="history-row">
              <div className="history-date"><strong>{new Date(`${key}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'long' })}</strong><span>{new Date(`${key}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
              <div className="history-mood"><span>{FEELINGS[Math.max(0, Math.round(Number(average('feeling', items))) - 1)]?.emoji}</span><small>Känsla {average('feeling', items)}/5</small></div>
              <div><strong>{items.length}</strong><small>svar</small></div>
              <div><strong>{average('rpe', after)}</strong><small>RPE</small></div>
              <div><strong>{average('pass', after)}</strong><small>passet</small></div>
              <div><strong>{temperature === '–' ? '–' : `${temperature}/5`}</strong><small>🌡️ {temperatureLabel}</small></div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function EmptyPeriod({ title, periodLabel }) {
  return <section className="empty-period"><span>≈</span><p className="eyebrow">{periodLabel}</p><h2>{title}</h2><p>När simmarna har svarat visas sammanställningen här.</p></section>
}

function Stat({ title, value, note, helpTerm, onOpen }) {
  return <article className={`stat${onOpen ? ' stat-drilldown' : ''}`}>{onOpen && <button type="button" className="stat-drilldown-trigger" onClick={onOpen} aria-label={`Se alla svar för ${title}`} aria-haspopup="dialog" />}<span className="stat-title">{title} <HelpTip term={helpTerm || title} /></span><strong>{value}</strong><small>{note}</small>{onOpen && <span className="stat-drilldown-hint" aria-hidden="true">Visa svar →</span>}</article>
}

createRoot(document.getElementById('root')).render(<App />)
