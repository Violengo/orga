import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { Copy, FilePlus2, FolderOpen, LayoutDashboard, LogOut, RefreshCw, Trash2 } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import App, { normalizeChart } from './App'
import { sampleChart } from './sampleData'
import { isSupabaseConfigured, supabase } from './supabase'
import type { OrgChart } from './types'

type CloudChart = {
  id: string
  file_name: string
  title: string
  chart: OrgChart
  created_at: string
  updated_at: string
}

function freshChart(): OrgChart {
  const chart = structuredClone(sampleChart)
  chart.id = crypto.randomUUID()
  chart.fileName = 'Nouvel-organigramme'
  chart.title = 'Nouvel organigramme'
  return chart
}

function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setMessage('')
    const result = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
    setBusy(false)
    if (result.error) setMessage(result.error.message)
    else if (mode === 'signup' && !result.data.session) setMessage('Compte créé. Vérifie ton e-mail pour confirmer ton inscription.')
  }

  return <main className="account-page">
    <section className="auth-card">
      <div className="auth-icon"><LayoutDashboard size={26} /></div>
      <p className="eyebrow">Laurenty Studio</p>
      <h1>{mode === 'signin' ? 'Retrouver mes organigrammes' : 'Créer mon espace'}</h1>
      <p>Connecte-toi pour ouvrir et enregistrer tes organigrammes sur tous tes appareils.</p>
      <form onSubmit={submit}>
        <label>Adresse e-mail<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Mot de passe<input required minLength={6} type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {message && <div className="auth-message" role="status">{message}</div>}
        <button className="button primary auth-submit" disabled={busy}>{busy ? 'Patiente…' : mode === 'signin' ? 'Se connecter' : 'Créer le compte'}</button>
      </form>
      <button className="auth-switch" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage('') }}>
        {mode === 'signin' ? 'Pas encore de compte ? Créer un compte' : 'Déjà un compte ? Se connecter'}
      </button>
    </section>
  </main>
}

function Library({ session, onOpen }: { session: Session; onOpen: (record: CloudChart | null) => void }) {
  const [charts, setCharts] = useState<CloudChart[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setError('')
    const { data, error: queryError } = await supabase.from('org_charts').select('id,file_name,title,chart,created_at,updated_at').order('updated_at', { ascending: false })
    if (queryError) setError(queryError.code === 'PGRST205' ? 'La base Supabase doit encore être initialisée avec la migration fournie.' : queryError.message)
    else {
      const validCharts = (data ?? []).flatMap((record) => {
        const chart = normalizeChart(record.chart)
        return chart ? [{ ...record, chart } as CloudChart] : []
      })
      setCharts(validCharts)
      if (validCharts.length !== (data ?? []).length) setError('Un document présentant une hiérarchie invalide a été isolé pour éviter toute confusion.')
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const duplicate = async (record: CloudChart) => {
    if (!supabase) return
    const chart = structuredClone(record.chart)
    chart.id = crypto.randomUUID()
    chart.fileName = `${record.file_name}-copie`
    chart.title = `${record.title} — copie`
    const { error: insertError } = await supabase.from('org_charts').insert({ owner_id: session.user.id, file_name: chart.fileName, title: chart.title, chart })
    if (insertError) setError(insertError.message)
    else void load()
  }

  const remove = async (record: CloudChart) => {
    if (!supabase || !window.confirm(`Supprimer définitivement « ${record.title} » ?`)) return
    const { error: deleteError } = await supabase.from('org_charts').delete().eq('id', record.id)
    if (deleteError) setError(deleteError.message)
    else setCharts((current) => current.filter((chart) => chart.id !== record.id))
  }

  return <main className="library-page">
    <header className="library-header">
      <div><p className="eyebrow">Laurenty Studio</p><h1>Mes organigrammes</h1><p>{charts.length} document{charts.length > 1 ? 's' : ''} enregistré{charts.length > 1 ? 's' : ''}</p></div>
      <div className="library-actions">
        <span className="account-email">{session.user.email}</span>
        <button className="button ghost" onClick={() => void supabase?.auth.signOut()}><LogOut size={17} />Déconnexion</button>
        <button className="button primary" onClick={() => onOpen(null)}><FilePlus2 size={17} />Nouvel organigramme</button>
      </div>
    </header>
    {error && <div className="library-error">{error}<button onClick={() => void load()}><RefreshCw size={15} />Réessayer</button></div>}
    {loading ? <div className="library-empty"><RefreshCw className="spin" />Chargement des organigrammes…</div> : charts.length === 0 ?
      <section className="library-empty"><FolderOpen size={34} /><h2>Aucun organigramme enregistré</h2><p>Crée ton premier document : il apparaîtra ensuite automatiquement ici.</p><button className="button primary" onClick={() => onOpen(null)}><FilePlus2 size={17} />Créer un organigramme</button></section> :
      <section className="chart-library-grid">{charts.map((record) => <article className="chart-library-card" key={record.id}>
        <button className="chart-card-main" onClick={() => onOpen(record)}>
          <span className="chart-card-mark" style={{ background: record.chart.accent }}><LayoutDashboard size={23} /></span>
          <span><strong>{record.title}</strong><small>{record.file_name}.orgchart</small></span>
          <span className="chart-card-meta">Modifié le {new Intl.DateTimeFormat('fr-BE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.updated_at))}</span>
        </button>
        <footer><button title="Dupliquer" onClick={() => void duplicate(record)}><Copy size={16} />Dupliquer</button><button className="danger" title="Supprimer" onClick={() => void remove(record)}><Trash2 size={16} />Supprimer</button></footer>
      </article>)}</section>}
  </main>
}

export default function CloudApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)
  const [active, setActive] = useState<{ recordId: string | null; chart: OrgChart } | null>(null)

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false) })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => { setSession(nextSession); if (!nextSession) setActive(null) })
    return () => data.subscription.unsubscribe()
  }, [])

  if (!isSupabaseConfigured || !supabase) return <App />
  if (authLoading) return <main className="account-page"><div className="library-empty"><RefreshCw className="spin" />Ouverture de ton espace…</div></main>
  if (!session) return <AuthScreen />
  if (!active) return <Library session={session} onOpen={(record) => setActive(record ? { recordId: record.id, chart: record.chart } : { recordId: null, chart: freshChart() })} />
  const client = supabase

  const saveCloud = async (chart: OrgChart) => {
    const payload = { owner_id: session.user.id, file_name: chart.fileName, title: chart.title, chart }
    if (active.recordId) {
      const { error } = await client.from('org_charts').update(payload).eq('id', active.recordId)
      if (error) throw error
      setActive({ recordId: active.recordId, chart })
    } else {
      const { data, error } = await client.from('org_charts').insert(payload).select('id').single()
      if (error) throw error
      setActive({ recordId: data.id, chart })
    }
  }

  return <App key={active.recordId ?? active.chart.id} initialChart={active.chart} onCloudSave={saveCloud} onBackToLibrary={() => setActive(null)} />
}
