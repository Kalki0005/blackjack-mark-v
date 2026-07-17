import { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'
import { CasinoChip, ChipStack, decomposeAmount } from './components/casino/CasinoChip'
import { CardRow } from './components/casino/PlayingCard'
import { SeatSpot } from './components/casino/SeatSpot'
import { Table2D, SEAT_ANCHORS, DEALER_CARD_ANCHOR, SHOE_ANCHOR } from './components/casino/Table2D'
import { useAudio } from './hooks/useAudio'
import { LearningHub } from './components/LearningHub'
import { AssessmentOverlay } from './components/Assessment'
import { PlayerStats } from './components/PlayerStats'
import { EngineSettings } from './components/EngineSettings'

let socket

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const DEFAULT_SETTINGS = {
  numDecks: 6,
  dealerHitsSoft17: false,
  countVisibility: 'always',
  showStrategyHints: true,
  showBustProb: true,
  showWinProb: true,
  dealSpeed: 'normal',
  audioEnabled: false,
  tableTheme: 'green',
}

// ─── Social auth helpers ─────────────────────────────────────────────────────

let gisPromise = null
function loadGoogleScript() {
  if (gisPromise) return gisPromise
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve()
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load Google script'))
    document.head.appendChild(s)
  })
  return gisPromise
}

// A Google button that MATCHES our Discord button exactly. The visible pill is
// our own markup (identical .social-btn styling); Google's real widget is
// rendered invisibly on top so it still drives the secure ID-token flow —
// clicking the pill actually clicks the transparent Google widget over it.
function GoogleButton({ clientId, onCredential }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    loadGoogleScript().then(() => {
      if (cancelled || !window.google?.accounts?.id || !ref.current) return
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (resp) => onCredential(resp.credential),
      })
      ref.current.innerHTML = ''
      window.google.accounts.id.renderButton(ref.current, {
        type: 'standard', theme: 'filled_black', size: 'large', shape: 'pill',
        text: 'continue_with', width: 330, logo_alignment: 'center',
      })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [clientId, onCredential])
  return (
    <div className="social-google">
      <button type="button" tabIndex={-1} className="social-btn social-btn--google">
        <span className="social-ico">
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
            <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/>
            <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.4 21.3 7.4 24 12 24z"/>
            <path fill="#FBBC05" d="M5.4 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.4C.5 8.2 0 10 0 12s.5 3.8 1.4 5.4l4-3.1z"/>
            <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.7 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/>
          </svg>
        </span> Continue with Google
      </button>
      <div ref={ref} className="social-google-gsi" aria-hidden="true" />
    </div>
  )
}

const SOCIAL_ERRORS = {
  discord_not_configured: 'Discord sign-in isn’t configured yet.',
  discord_denied: 'Discord sign-in was cancelled.',
  discord_failed: 'Discord sign-in failed. Try again.',
}

function ActionBtn({ label, onClick, variant = 'default', disabled = false, icon }) {
  const map = { hit: 'hit', stand: 'stand', double: 'double', split: 'split', deal: 'deal', clear: 'deal', insurance: 'double', decline: 'stand', default: 'stand' }
  return (
    <button onClick={onClick} disabled={disabled}
      className={`action-btn action-btn--${map[variant] || 'stand'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
      {icon && <span className="btn-icon">{icon}</span>}<span>{label}</span>
    </button>
  )
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [userProfile, setUserProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bj_session') || 'null') } catch { return null }
  })
  const [screen, setScreen] = useState(() => localStorage.getItem('bj_session') ? 'MENU' : 'AUTH')
  const [isLogin, setIsLogin] = useState(true)
  const [authUser, setAuthUser] = useState('')
  const [authPass, setAuthPass] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const [roomCode, setRoomCode] = useState('')
  const [joinInput, setJoinInput] = useState('')
  const [tableState, setTableState] = useState(null)
  const [gameMode, setGameMode] = useState('STANDARD')
  const [connected, setConnected] = useState(false)
  const [settings, setSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bj_settings') || 'null') || DEFAULT_SETTINGS } catch { return DEFAULT_SETTINGS }
  })
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [chipPickerOpen, setChipPickerOpen] = useState(false)

  // Social auth + menu/room UI
  const [socialConfig, setSocialConfig] = useState({})
  const [authNotice, setAuthNotice] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)
  const [createVisibility, setCreateVisibility] = useState('private')
  const [createName, setCreateName] = useState('')
  const [createdRoom, setCreatedRoom] = useState(null) // { code }
  // Per-room customization (seeded from account settings when the screen opens)
  const [createTheme, setCreateTheme] = useState('green')
  const [createDecks, setCreateDecks] = useState(6)
  const [createSoft17, setCreateSoft17] = useState(false)
  const [createBots, setCreateBots] = useState(0)
  // Join-screen filters
  const [joinSearch, setJoinSearch] = useState('')
  const [joinPhase, setJoinPhase] = useState('all') // all | betting | playing
  const [publicRooms, setPublicRooms] = useState([])
  const [loadingPublic, setLoadingPublic] = useState(false)
  const [shareToast, setShareToast] = useState('')
  const pendingRoomRef = useRef(null)
  const pendingCreateShareRef = useRef(false)

  // Betting panel
  const [selectedSeats, setSelectedSeats] = useState([])
  // The bet is the exact SEQUENCE of chips the player placed (never merged).
  const [betChips, setBetChips] = useState({ main: [25], pp: [], t3: [] })
  const sumChips = (arr) => arr.reduce((s, v) => s + v, 0)
  const mainBet = sumChips(betChips.main)
  const ppBet = sumChips(betChips.pp)
  const t3Bet = sumChips(betChips.t3)
  const [activeBetTab, setActiveBetTab] = useState('main')
  const [editingBet, setEditingBet] = useState(false)

  // Per-seat queued actions { [seatNumber]: 'hit'|'stand'|'double'|'split' }
  const [pendingActions, setPendingActions] = useState({})
  const [soloMode, setSoloMode] = useState(false)

  // Cut-the-deck ritual (offered when the shoe hit the cut card last round)
  const [cutOpen, setCutOpen] = useState(false)
  const [cutPos, setCutPos] = useState(0.5)

  // Chess.com-style session review: mistakes + outcomes accumulate per round
  // (harvested from each game_over state) and are shown when the player
  // leaves the table or when the shoe hits the cut card.
  const emptyReview = () => ({ hands: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0, net: 0, mistakes: [] })
  const sessionReview = useRef(emptyReview())
  const [assessment, setAssessment] = useState(null) // { mode: 'shoe'|'exit', review }

  const logsEndRef = useRef(null)
  const prevGameState = useRef(null)
  const prevLogCount = useRef(0)
  const [, setLastWin] = useState(null)
  const [decisionSeconds, setDecisionSeconds] = useState(30)
  const timerTickedRef = useRef(false)

  const audio = useAudio(settings.audioEnabled !== false)

  // Themed backdrop art. Only the teal set exists so far — every theme maps to
  // it until the other rooms are regenerated with the same camera framing.
  const THEME_BG = { green: '/art/bg_teal.png', blue: '/art/bg_teal.png' }
  const themeBgUrl = THEME_BG[settings.tableTheme] || THEME_BG.green

  // Menu / auth / sub-screens use a blurred version of the ACTIVE theme's
  // backdrop (the .casino-bg overlay applies the blur + dark wash).
  useEffect(() => {
    document.documentElement.style.setProperty('--theme-bg', `url('${themeBgUrl}')`)
  }, [themeBgUrl])

  // Keep table overlays (chips/cards/zones) glued to the printed felt at every
  // window size: expose the stage's scale vs its 1600px design width as a CSS
  // var that the overlay transforms multiply by.
  const stageRef = useRef(null)
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const apply = () => el.style.setProperty('--tscale', (el.clientWidth / 1600).toFixed(4))
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [screen])

  const userProfileRef = useRef(userProfile)
  userProfileRef.current = userProfile

  const syncBalance = useCallback((state) => {
    const profile = userProfileRef.current
    if (!profile || !state?.players) return
    const me = state.players.find(p => p.name === profile.username)
    if (me && me.balance !== profile.balance) {
      const updated = { ...profile, balance: me.balance }
      setUserProfile(updated)
      localStorage.setItem('bj_session', JSON.stringify(updated))
    }
  }, [])

  // ── Socket ────────────────────────────────────────────────────────

  useEffect(() => {
    socket = io('http://localhost:5000', { transports: ['websocket'] })
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('room_created', (data) => {
      setRoomCode(data.room); setTableState(data.state); syncBalance(data.state)
      if (pendingCreateShareRef.current) {
        pendingCreateShareRef.current = false
        setCreatedRoom({ code: data.room })   // show the share step, stay on menu
      } else {
        setScreen('TABLE')
      }
    })
    socket.on('room_joined', (data) => { setRoomCode(data.room); setTableState(data.state); syncBalance(data.state); setScreen('TABLE') })
    socket.on('state_update', (data) => { setTableState(data); syncBalance(data) })
    socket.on('error', (data) => alert(data.message))
    return () => socket.disconnect()
  }, [syncBalance])

  // Fetch which social providers are enabled (and the Google client id).
  useEffect(() => {
    fetch(`${API_BASE}/api/auth/config`)
      .then(r => r.ok ? r.json() : null)
      .then(cfg => cfg && setSocialConfig(cfg))
      .catch(() => {})
  }, [])

  const startSession = useCallback((profile) => {
    localStorage.setItem('bj_session', JSON.stringify(profile))
    setUserProfile(profile)
    setScreen('MENU')
  }, [])

  // Auto-join a deep-linked room once we're connected and logged in.
  useEffect(() => {
    if (connected && userProfile?.username && pendingRoomRef.current) {
      const code = pendingRoomRef.current
      pendingRoomRef.current = null
      socket.emit('join_room', { room: code, username: userProfile.username })
    }
  }, [connected, userProfile])

  // Handle deep links: ?room=CODE (share link), social-auth callbacks, errors.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const room = params.get('room')
    const socialUser = params.get('social_user')
    const socialBalance = params.get('social_balance')
    const authErr = params.get('auth_error')

    if (room) pendingRoomRef.current = room.toUpperCase().trim()
    if (authErr) setAuthNotice(SOCIAL_ERRORS[authErr] || 'Sign-in failed.')

    if (socialUser) {
      const profile = { username: socialUser, balance: parseInt(socialBalance || '5000', 10) }
      startSession(profile)
    }

    if (room || socialUser || authErr) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [startSession])

  const handleGoogleCredential = useCallback(async (credential) => {
    setAuthError(''); setAuthNotice('')
    try {
      const res = await fetch(`${API_BASE}/api/auth/google`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      })
      const data = await res.json()
      if (!res.ok) { setAuthError(data.error || 'Google sign-in failed.'); return }
      startSession({ username: data.username, balance: data.balance })
    } catch { setAuthError('Cannot reach server.') }
  }, [startSession])

  useEffect(() => {
    if (!userProfile?.username) return
    let cancelled = false
    const loadSettings = async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/settings/${userProfile.username}`)
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) {
          setSettings(data)
          localStorage.setItem('bj_settings', JSON.stringify(data))
        }
      } catch {}
    }
    loadSettings()
    return () => { cancelled = true }
  }, [userProfile?.username])

  const saveSetting = async (key, value) => {
    const next = { ...settings, [key]: value }
    setSettings(next)
    localStorage.setItem('bj_settings', JSON.stringify(next))
    if (!userProfile?.username) return
    try {
      const res = await fetch(`http://localhost:5000/api/settings/${userProfile.username}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (res.ok) {
        const saved = await res.json()
        setSettings(saved)
        localStorage.setItem('bj_settings', JSON.stringify(saved))
      }
    } catch {}
  }

  useEffect(() => {
    if (!tableState) return
    const gs = tableState.gameState
    const logs = tableState.logs || []

    if (gs !== prevGameState.current) {
      if (gs === 'dealer_turn') audio.playStand()
      if (gs === 'game_over') {
        // Let the dealer's draw-out cards land before the result sting.
        const draws = Math.max(0, (tableState.dealerHand?.cards?.length || 0) - 2)
        const revealMs = draws > 0 ? (0.2 + (draws - 1) * 0.45 + 0.6) * 1000 : 250
        for (let k = 0; k < draws; k++) setTimeout(() => audio.playDeal(), (0.2 + k * 0.45) * 1000)
        const winLog = logs.find(l => l.includes('wins') || l.includes('Blackjack!') || l.includes('insurance won'))
        if (winLog) { setTimeout(() => audio.playWin(), revealMs); setLastWin(winLog) }
        else setTimeout(() => audio.playBust(), revealMs)

        // Harvest this round into the session review (once per round).
        const me = userProfileRef.current?.username
        const r = sessionReview.current
        ;(tableState.seats || []).filter(s => s.playerName === me).forEach(s => {
          (s.hands || []).forEach(h => {
            if (!h.outcome) return
            r.hands += 1
            if (h.outcome === 'blackjack') { r.wins += 1; r.blackjacks += 1 }
            else if (h.outcome === 'win') r.wins += 1
            else if (h.outcome === 'push') r.pushes += 1
            else r.losses += 1
            r.net += (h.payout || 0) - (h.bet || 0)
          })
        })
        ;(tableState.roundMistakes || []).forEach(m => { if (m.username === me) r.mistakes.push(m) })

        // Cut card reached → the shoe is done: show the review automatically.
        if (tableState.shoePendingShuffle && r.hands > 0) {
          const snapshot = { ...r, mistakes: [...r.mistakes] }
          sessionReview.current = emptyReview()
          setTimeout(() => setAssessment({ mode: 'shoe', review: snapshot }), 1600)
        }
      }
      // Initial deal: one card-slide per card, in the round-robin order the
      // cards actually fly (seat 1 … seat N, dealer — then the second pass).
      if (prevGameState.current === 'betting' && gs !== 'betting') {
        const n = (tableState.activeSeatNumbers || []).length
        const step = ({ fast: 0.09, normal: 0.16, slow: 0.28 }[settings.dealSpeed] || 0.16) * 1000
        for (let k = 0; k < 2 * (n + 1); k++) setTimeout(() => audio.playDeal(), k * step)
      }
      prevGameState.current = gs
    }

    if (logs.length > prevLogCount.current) {
      const newLogs = logs.slice(prevLogCount.current)
      if (newLogs.some(l => l.includes('bust'))) audio.playBust()
      prevLogCount.current = logs.length
    }
  }, [tableState, audio])

  useEffect(() => {
    if (tableState?.gameState !== 'playing') return
    setDecisionSeconds(30)
    timerTickedRef.current = false // fresh turn — expiry only counts after a real tick
    const t = setInterval(() => {
      timerTickedRef.current = true
      setDecisionSeconds(s => Math.max(0, s - 1))
    }, 1000)
    return () => clearInterval(t)
  }, [tableState?.gameState, tableState?.activeHandIndex, tableState?.activeSeatTurnIdx])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [tableState?.logs])

  // ── Auth ──────────────────────────────────────────────────────────

  const handleAuth = async (e) => {
    e.preventDefault()
    if (!authUser || !authPass) { setAuthError('Fill in both fields.'); return }
    setAuthLoading(true); setAuthError('')
    try {
      const res = await fetch(`${API_BASE}/api/${isLogin ? 'login' : 'register'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUser, password: authPass })
      })
      const data = await res.json()
      if (!res.ok) { setAuthError(data.error); return }
      if (isLogin) {
        startSession({ username: data.username, balance: data.balance })
      } else {
        setIsLogin(true); setAuthUser(''); setAuthPass('')
        alert('Account created! Please log in.')
      }
    } catch { setAuthError('Cannot reach server — is Flask running?') }
    finally { setAuthLoading(false); setAuthPass('') }
  }

  const handleSignOut = () => {
    localStorage.removeItem('bj_session')
    setUserProfile(null); setTableState(null); setScreen('AUTH')
  }

  const openRename = () => {
    setProfileOpen(false)
    setRenameValue(userProfile?.username || '')
    setRenameError('')
    setRenameOpen(true)
  }

  const submitRename = async () => {
    const next = renameValue.trim()
    if (!next) { setRenameError('Enter a username.'); return }
    if (next === (userProfile?.username || '')) { setRenameOpen(false); return }
    setRenameSaving(true); setRenameError('')
    try {
      const res = await fetch(`${API_BASE}/api/account/rename`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userProfile.username, new_username: next }),
      })
      const data = await res.json()
      if (!res.ok) { setRenameError(data.error || 'Could not update username.'); return }
      const updated = { ...userProfile, username: data.username }
      setUserProfile(updated)
      localStorage.setItem('bj_session', JSON.stringify(updated))
      setRenameOpen(false)
      setShareToast('Username updated')
      setTimeout(() => setShareToast(''), 1600)
    } catch { setRenameError('Cannot reach server.') }
    finally { setRenameSaving(false) }
  }

  // ── Room ──────────────────────────────────────────────────────────

  // Leaving the table triggers the chess.com-style session review (if any
  // hands were played), shown on top of the menu.
  const exitToLobby = () => {
    socket.emit('leave_table', { room: roomCode, username: userProfile.username })
    const r = sessionReview.current
    sessionReview.current = emptyReview()
    setOptionsOpen(false)
    setScreen('MENU'); setTableState(null); setLastWin(null)
    if (r.hands > 0) setAssessment({ mode: 'exit', review: r })
  }

  // Solo "Play" — a private, unlisted table that isn't a shareable room.
  const playSolo = () => {
    setGameMode('STANDARD')
    setSoloMode(true)
    sessionReview.current = emptyReview()
    setAssessment(null)
    pendingCreateShareRef.current = false
    socket.emit('create_room', { username: userProfile.username, settings, is_public: false, solo: true })
  }

  // Open the Create Room screen with controls seeded from account settings.
  const openCreateScreen = () => {
    setCreatedRoom(null)
    setCreateName('')
    setCreateTheme(settings.tableTheme || 'green')
    setCreateDecks(settings.numDecks || 6)
    setCreateSoft17(!!settings.dealerHitsSoft17)
    setCreateBots(0)
    setScreen('CREATE')
  }

  // Create a shareable multiplayer room (public or private) with per-room
  // customization overrides and optional computer players.
  const createMultiplayerRoom = () => {
    setGameMode('STANDARD')
    setSoloMode(false)
    sessionReview.current = emptyReview()
    setAssessment(null)
    pendingCreateShareRef.current = true
    socket.emit('create_room', {
      username: userProfile.username,
      settings: { ...settings, tableTheme: createTheme, numDecks: createDecks, dealerHitsSoft17: createSoft17 },
      is_public: createVisibility === 'public',
      room_name: createName,
      bots: createBots,
    })
  }

  const joinRoom = (code) => {
    const c = (code || joinInput).toUpperCase().trim()
    if (!c) { alert('Enter a room code.'); return }
    setSoloMode(false)
    sessionReview.current = emptyReview()
    setAssessment(null)
    socket.emit('join_room', { room: c, username: userProfile.username })
  }

  // Keep the public list live while the Join screen is open.
  useEffect(() => {
    if (screen !== 'JOIN') return
    const t = setInterval(() => refreshPublicRooms(), 5000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen])

  const refreshPublicRooms = useCallback(async () => {
    setLoadingPublic(true)
    try {
      const res = await fetch(`${API_BASE}/api/rooms/public`)
      const data = await res.json()
      setPublicRooms(data.rooms || [])
    } catch { setPublicRooms([]) }
    finally { setLoadingPublic(false) }
  }, [])

  // ── Share helpers ─────────────────────────────────────────────────
  const roomLink = (code) => `${window.location.origin}/?room=${code}`
  const copyText = async (text, label = 'Copied') => {
    try { await navigator.clipboard.writeText(text); setShareToast(label); setTimeout(() => setShareToast(''), 1600) }
    catch { setShareToast('Copy failed'); setTimeout(() => setShareToast(''), 1600) }
  }
  const nativeShare = async (code) => {
    const url = roomLink(code)
    const text = `Join my Blackjack table — room ${code}`
    if (navigator.share) {
      try { await navigator.share({ title: 'Blackjack Mark V', text, url }) } catch { /* cancelled */ }
    } else {
      copyText(url, 'Link copied — paste to share')
    }
  }

  // ── Betting ───────────────────────────────────────────────────────

  const MAX_SEATS = 3 // per-player cap in multiplayer rooms (mirrors backend); solo play is uncapped

  const toggleSeat = (num) => {
    const seat = tableState?.seats?.find(s => s.number === num)
    if (seat?.isOccupied && seat.playerName !== userProfile.username) return
    setSelectedSeats(prev => {
      if (prev.includes(num)) return prev.filter(s => s !== num)
      if (!soloMode && prev.length >= MAX_SEATS) {
        setShareToast(`Max ${MAX_SEATS} seats per player in rooms`)
        setTimeout(() => setShareToast(''), 1600)
        return prev
      }
      return [...prev, num]
    })
  }

  const addChip = (val) => {
    audio.playChip()
    setBetChips(prev => {
      if (activeBetTab === 'main') return { ...prev, main: [...prev.main, val] }
      // side bets may not exceed the main bet
      const cur = sumChips(prev[activeBetTab])
      if (cur + val > sumChips(prev.main)) {
        setShareToast('Side bet can’t exceed main bet')
        setTimeout(() => setShareToast(''), 1500)
        return prev
      }
      return { ...prev, [activeBetTab]: [...prev[activeBetTab], val] }
    })
  }

  // Undo removes the LAST chip placed on the active bet — like a real table.
  const popChip = () => {
    audio.playChip()
    setBetChips(prev => {
      const next = { ...prev, [activeBetTab]: prev[activeBetTab].slice(0, -1) }
      if (activeBetTab === 'main') {
        // shrinking the main bet may invalidate side bets
        const m = sumChips(next.main)
        while (sumChips(next.pp) > m) next.pp = next.pp.slice(0, -1)
        while (sumChips(next.t3) > m) next.t3 = next.t3.slice(0, -1)
      }
      return next
    })
  }

  const clearBet = () => {
    if (activeBetTab === 'main') setBetChips({ main: [], pp: [], t3: [] })
    else setBetChips(prev => ({ ...prev, [activeBetTab]: [] }))
  }

  const lockBets = () => {
    if (selectedSeats.length === 0) { alert('Select at least one seat.'); return }
    if (mainBet <= 0) { alert('Main bet must be > 0.'); return }
    socket.emit('sit_player', { room: roomCode, username: userProfile.username, seats: selectedSeats, main_bet: mainBet, pp_bet: ppBet, t3_bet: t3Bet })
    setSelectedSeats([])
    setEditingBet(false)
  }

  const submitAction = (action) => {
    if (action === 'hit') audio.playDeal()
    if (action === 'stand') audio.playStand()
    if (action === 'double' || action === 'split') audio.playChip()
    socket.emit('submit_action', { room: roomCode, action, username: userProfile.username })
  }
  const buyInsurance = (seatNum, wants) => socket.emit('buy_insurance', { room: roomCode, seat_number: seatNum, wants_insurance: wants })

  // ── Derived state ─────────────────────────────────────────────────

  const seats = tableState?.seats || []
  const dealer = tableState?.dealerHand || { cards: [], total: 0 }
  const logs = tableState?.logs || []
  const counting = tableState?.cardCounting || { runningCount: 0, trueCount: 0, remainingCards: 312 }
  const learner = tableState?.learnerPanel
  const gameState = tableState?.gameState || 'betting'
  const activeHandIndex = tableState?.activeHandIndex ?? 0
  const myPlayerData = tableState?.players?.find(p => p.name === userProfile?.username)
  const myBalance = myPlayerData?.balance ?? userProfile?.balance ?? 0
  const iSatDown = !!myPlayerData
  const activeSeat = seats.find(s => s.isActiveTurn)
  const isMyTurn = activeSeat?.playerName === userProfile?.username
  const myInsuranceSeat = seats.find(s => s.playerName === userProfile?.username && s.isOccupied && !s.insuranceDecisionMade)
  const hideDealer = gameState === 'playing' || gameState === 'insurance'

  // Deal choreography: rotation order + tempo (scaled by the deal-speed setting)
  const activeSeatNumbers = tableState?.activeSeatNumbers || []
  const dealStep = { fast: 0.09, normal: 0.16, slow: 0.28 }[settings.dealSpeed] || 0.16
  const dealerDraws = Math.max(0, (dealer.cards?.length || 0) - 2)
  const resultDelayMs = dealerDraws > 0 ? (0.2 + (dealerDraws - 1) * 0.45 + 0.6) * 1000 : 250

  const showCount = settings.countVisibility !== 'hidden'
  const totalBet = seats.filter(s => s.playerName === userProfile?.username).reduce((sum, s) => sum + s.bet + (s.ppBet || 0) + (s.t3Bet || 0), 0)
    || (selectedSeats.length * (mainBet + ppBet + t3Bet))
  const showHints = settings.showStrategyHints !== false
  const activeHand = activeSeat?.hands?.[activeHandIndex]

  // Round result for the centre popup — derived entirely from hand payouts.
  let resultData = null
  if (gameState === 'game_over') {
    const mySeats = seats.filter(s => s.playerName === userProfile?.username)
    let roundReturn = 0, anyWin = false, anyPush = false
    mySeats.forEach(s => (s.hands || []).forEach(h => {
      roundReturn += h.payout || 0
      if (h.outcome === 'win' || h.outcome === 'blackjack') anyWin = true
      if (h.outcome === 'push') anyPush = true
    }))
    if (anyWin) resultData = { kind: 'win', headline: 'You Win', amount: roundReturn }
    else if (anyPush) resultData = { kind: 'push', headline: 'Push', amount: roundReturn }
    else if (mySeats.length > 0) resultData = { kind: 'loss', headline: 'Dealer Wins', amount: 0 }
    else resultData = { kind: 'push', headline: 'Round Over', amount: 0 }
  }

  // Dealer 3D animation derived from game phase + outcome

  // Quick action: play live if it's this seat's active turn, else queue it.
  const handleQuickAction = (seatNum, action) => {
    if (isMyTurn && activeSeat?.number === seatNum) {
      setPendingActions(p => { const n = { ...p }; delete n[seatNum]; return n })
      submitAction(action)
    } else {
      setPendingActions(p => {
        const n = { ...p }
        if (n[seatNum] === action) delete n[seatNum]; else n[seatNum] = action
        return n
      })
    }
  }

  // Auto-play a queued action the instant that seat's turn arrives.
  useEffect(() => {
    if (gameState !== 'playing' || !isMyTurn || !activeSeat) return
    const num = activeSeat.number
    const pending = pendingActions[num]
    if (!pending) return
    const h = activeHand
    const ok = pending === 'stand'
      || (pending === 'hit' && h?.canHit !== false)
      || (pending === 'double' && !!h?.canDouble)
      || (pending === 'split' && !!h?.canSplit)
    setPendingActions(p => { const n = { ...p }; delete n[num]; return n })
    if (ok) submitAction(pending)
    // submitAction intentionally omitted from deps (stable emit wrapper)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, isMyTurn, activeSeat, activeHandIndex, activeHand, pendingActions])

  // Clear queued actions between rounds.
  useEffect(() => {
    if (gameState === 'betting' || gameState === 'game_over') setPendingActions({})
  }, [gameState])

  // Decision timer expiry: the game plays for you (stand) so the table never stalls.
  // (A queued action would already have fired the moment the turn arrived.)
  // Guarded by timerTickedRef: a stale 0 from a PREVIOUS expired turn must not
  // insta-stand a fresh turn before its 30s reset has rendered.
  useEffect(() => {
    if (decisionSeconds !== 0 || !timerTickedRef.current) return
    if (gameState === 'playing' && isMyTurn) submitAction('stand')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionSeconds, gameState, isMyTurn])

  const editBet = () => {
    const mySeats = seats.filter(s => s.playerName === userProfile?.username)
    if (mySeats.length) {
      setSelectedSeats(mySeats.map(s => s.number))
      setBetChips({
        main: decomposeAmount(mySeats[0].bet || 25, 8),
        pp: decomposeAmount(mySeats[0].ppBet || 0, 8),
        t3: decomposeAmount(mySeats[0].t3Bet || 0, 8),
      })
    }
    setEditingBet(true)
    socket.emit('leave_table', { room: roomCode, username: userProfile.username })
  }

  const OptionsModal = () => optionsOpen && (
    <div className="table-modal-backdrop" onClick={() => setOptionsOpen(false)}>
      <div className="table-modal" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="panel-section-title">Options</div>
            <div className="text-white font-display text-lg mt-1">Table Controls</div>
          </div>
          <button onClick={() => setOptionsOpen(false)} className="text-white/50 hover:text-white text-xl leading-none">x</button>
        </div>
        {/* Table theme */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {[['green', 'Emerald Green'], ['blue', 'Midnight Blue']].map(([id, label]) => (
            <button key={id} onClick={() => saveSetting('tableTheme', id)}
              className={`py-3 rounded-lg border text-xs font-black uppercase tracking-widest transition-all ${
                (settings.tableTheme || 'green') === id
                  ? id === 'green' ? 'border-emerald-500 bg-emerald-900/40 text-emerald-200' : 'border-sky-500 bg-sky-900/40 text-sky-200'
                  : 'border-white/10 text-white/45 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-col text-sm">
          {[
            ['showStrategyHints', 'Strategy hints'],
            ['showBustProb', 'Bust probability'],
            ['showWinProb', 'Win probability'],
            ['audioEnabled', 'Audio effects'],
          ].map(([key, label]) => (
            <button key={key} onClick={() => saveSetting(key, settings[key] === false)}
              className="flex items-center justify-between py-3 border-t border-white/10 text-left">
              <span className="text-white/75">{label}</span>
              <span className={`w-11 h-6 rounded-full p-1 transition-colors ${settings[key] !== false ? 'bg-emerald-600' : 'bg-slate-700'}`}>
                <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${settings[key] !== false ? 'translate-x-5' : ''}`} />
              </span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={() => socket.emit('reload_bankroll', { room: roomCode, username: userProfile.username })}
            disabled={myBalance >= 5000}
            className={`action-btn action-btn--deal flex-1 py-3 text-[10px] ${myBalance >= 5000 ? 'opacity-40 cursor-not-allowed' : ''}`}>
            {myBalance >= 5000 ? 'Balance ≥ $5,000' : 'Reload to $5,000'}
          </button>
          <button onClick={exitToLobby}
            className="action-btn action-btn--stand flex-1 py-3 text-[10px]">Lobby</button>
        </div>
      </div>
    </div>
  )

  const ChipPicker = () => chipPickerOpen && (
    <div className="table-modal-backdrop" onClick={() => setChipPickerOpen(false)}>
      <div className="table-modal" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="panel-section-title">Chips</div>
            <div className="text-white font-display text-lg mt-1">Select Wager</div>
          </div>
          <button onClick={() => setChipPickerOpen(false)} className="text-white/50 hover:text-white text-xl leading-none">x</button>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { id: 'main', label: 'Main', val: mainBet },
            { id: 'pp', label: 'Pairs', val: ppBet },
            { id: 't3', label: '21+3', val: t3Bet },
          ].map(b => (
            <button key={b.id} onClick={() => setActiveBetTab(b.id)}
              className={`py-3 rounded-lg border ${activeBetTab === b.id ? 'border-[#c9a227] bg-[#c9a227]/15' : 'border-white/10'}`}>
              <div className="text-[9px] uppercase tracking-widest text-white/40">{b.label}</div>
              <div className="text-white font-mono font-black">${b.val}</div>
            </button>
          ))}
        </div>
        <div className="flex justify-center gap-3 flex-wrap py-3">
          {[10, 25, 100, 500, 1000].map(v => <CasinoChip key={v} value={v} onClick={() => addChip(v)} />)}
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={popChip} className="action-btn action-btn--stand flex-1 py-3 text-[10px]">↩ Undo Chip</button>
          <button onClick={clearBet} className="action-btn action-btn--stand flex-1 py-3 text-[10px]">Clear</button>
          <button onClick={() => { lockBets(); setChipPickerOpen(false) }} className="action-btn action-btn--deal flex-1 py-3 text-[10px]">Lock Bets</button>
        </div>
      </div>
    </div>
  )

  // ── SCREEN: AUTH ──────────────────────────────────────────────────

  if (screen === 'AUTH') return (
    <div className="auth-screen min-h-screen flex items-center justify-center font-sans p-4">
      <div className="casino-bg" aria-hidden="true" />
      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-7">
          <h1 className="text-4xl font-display font-bold gold-text tracking-[0.18em] uppercase">Blackjack</h1>
          <p className="text-xs text-[#c9a227]/70 font-display mt-1.5 tracking-[0.3em] uppercase">Salon Privé · Mark V</p>
        </div>
        <div className="premium-card rounded-2xl p-7 flex flex-col gap-4">
          <div className="flex rounded-xl overflow-hidden border border-slate-800">
            <button type="button" onClick={() => { setIsLogin(true); setAuthError('') }}
              className={`flex-1 py-2.5 text-xs font-black uppercase tracking-widest transition-colors ${isLogin ? 'bg-emerald-600 text-white' : 'bg-transparent text-slate-500 hover:text-slate-300'}`}>Login</button>
            <button type="button" onClick={() => { setIsLogin(false); setAuthError('') }}
              className={`flex-1 py-2.5 text-xs font-black uppercase tracking-widest transition-colors ${!isLogin ? 'bg-emerald-600 text-white' : 'bg-transparent text-slate-500 hover:text-slate-300'}`}>Register</button>
          </div>

          {/* Social sign-in */}
          <div className="flex flex-col gap-2.5">
            {socialConfig.google && socialConfig.googleClientId
              ? <GoogleButton clientId={socialConfig.googleClientId} onCredential={handleGoogleCredential} />
              : <button type="button" disabled className="social-btn social-btn--google opacity-50 cursor-not-allowed">
                  <span className="social-ico">G</span> Continue with Google
                </button>}
            <button type="button" onClick={() => { window.location.href = `${API_BASE}/api/auth/discord/login` }}
              className="social-btn social-btn--discord">
              <span className="social-ico">◈</span> Continue with Discord
            </button>
          </div>

          <div className="flex items-center gap-3 my-1">
            <div className="flex-1 h-px bg-slate-800" />
            <span className="text-[10px] text-slate-500 uppercase tracking-widest">or</span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          <form onSubmit={handleAuth} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold">Username</label>
              <input type="text" value={authUser} onChange={e => setAuthUser(e.target.value)} placeholder="CardShark99"
                className="bg-[#080c12] border border-slate-700 rounded-xl p-3 text-sm text-white outline-none focus:border-emerald-500 transition-colors placeholder-slate-700" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold">Password</label>
              <input type="password" value={authPass} onChange={e => setAuthPass(e.target.value)} placeholder="••••••••"
                className="bg-[#080c12] border border-slate-700 rounded-xl p-3 text-sm text-white outline-none focus:border-emerald-500 transition-colors placeholder-slate-700" />
            </div>
            {(authError || authNotice) && <p className="text-red-400 text-xs font-mono bg-red-950/30 border border-red-900/50 rounded-lg p-3">{authError || authNotice}</p>}
            <button type="submit" disabled={authLoading}
              className="py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm uppercase tracking-widest rounded-xl transition-all active:scale-95 shadow-lg disabled:opacity-60">
              {authLoading ? 'Connecting...' : isLogin ? 'Enter Casino' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )

  // ── SCREEN: STATIC SCREENS ────────────────────────────────────────

  if (screen === 'THEORY') return <LearningHub onBack={() => setScreen('MENU')} />
  if (screen === 'STATS') return <PlayerStats userProfile={{ ...userProfile, balance: myBalance || userProfile?.balance }} onBack={() => setScreen('MENU')} />
  if (screen === 'SETTINGS') return <EngineSettings userProfile={userProfile} onBack={() => setScreen('MENU')} />

  // ── SCREEN: CREATE ROOM — dedicated page with per-room customization ──

  if (screen === 'CREATE') return (
    <div className="pg-screen">
      <div className="casino-bg" aria-hidden="true" />
      <div className="pg-shell pg-shell--narrow">
        <div className="pg-head">
          <button onClick={() => setScreen('MENU')} className="lh-back">← Menu</button>
          <div className="text-right">
            <h2 className="pg-title font-display gold-text">{createdRoom ? 'Room Ready' : 'Create a Table'}</h2>
            <p className="pg-sub">{createdRoom ? 'Invite your friends' : 'Your table, your rules'}</p>
          </div>
        </div>

        {!createdRoom ? (
          <>
            <div className="lh-card">
              <div className="lh-kicker">Visibility</div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {[
                  { id: 'private', label: 'Private', desc: 'Joinable only with the room code — perfect for friends.' },
                  { id: 'public', label: 'Public', desc: 'Listed in Join Room for anyone to sit down.' },
                ].map(v => (
                  <button key={v.id} onClick={() => setCreateVisibility(v.id)}
                    className={`py-3.5 px-4 rounded-xl border text-left transition-all ${createVisibility === v.id ? 'border-[#c9a227] bg-[#c9a227]/12' : 'border-white/10 hover:border-white/25'}`}>
                    <div className="text-white font-bold text-sm">{v.label}</div>
                    <div className="text-[11px] text-white/40 mt-0.5 leading-snug">{v.desc}</div>
                  </button>
                ))}
              </div>
              <input type="text" value={createName} onChange={e => setCreateName(e.target.value)} maxLength={28}
                placeholder="Table name (optional — e.g. Friday Night Salon)"
                className="w-full bg-[#080c12] border border-slate-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c9a227] transition-colors placeholder-slate-600" />
            </div>

            <div className="lh-card">
              <div className="lh-kicker">Table setup</div>
              <div className="pg-row">
                <div className="pg-row-text">
                  <div className="text-white font-bold text-[13.5px]">Felt theme</div>
                  <div className="lh-dim text-[11.5px] mt-0.5">Everyone at this table sees the theme you pick.</div>
                </div>
                <div className="pg-themes">
                  {[['green', 'Emerald'], ['blue', 'Midnight']].map(([id, label]) => (
                    <button key={id} onClick={() => setCreateTheme(id)}
                      className={`pg-theme pg-theme--${id} ${createTheme === id ? 'pg-theme--on' : ''}`}>
                      <span className="pg-theme-swatch" />{label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pg-row">
                <div className="pg-row-text">
                  <div className="text-white font-bold text-[13.5px]">Decks in the shoe</div>
                  <div className="lh-dim text-[11.5px] mt-0.5">Fewer decks favour the players (and the counters).</div>
                </div>
                <div className="pg-seg">
                  {[1, 2, 4, 6, 8].map(n => (
                    <button key={n} onClick={() => setCreateDecks(n)}
                      className={`pg-seg-opt ${createDecks === n ? 'pg-seg-opt--on' : ''}`}>{n}</button>
                  ))}
                </div>
              </div>
              <div className="pg-row">
                <div className="pg-row-text">
                  <div className="text-white font-bold text-[13.5px]">Dealer hits soft 17</div>
                  <div className="lh-dim text-[11.5px] mt-0.5">The meaner Vegas rule — adds ~0.2% house edge.</div>
                </div>
                <button onClick={() => setCreateSoft17(v => !v)} className={`pg-toggle ${createSoft17 ? 'pg-toggle--on' : ''}`} role="switch" aria-checked={createSoft17}>
                  <span className="pg-toggle-knob" />
                </button>
              </div>
            </div>

            <div className="lh-card">
              <div className="lh-kicker">Computer players</div>
              <div className="pg-row">
                <div className="pg-row-text">
                  <div className="text-white font-bold text-[13.5px]">Seat bots at the table</div>
                  <div className="lh-dim text-[11.5px] mt-0.5 leading-relaxed">
                    Bots bet every round, play flawless basic strategy and never dawdle —
                    the multiplayer feel even before your friends arrive.
                  </div>
                </div>
                <div className="pg-seg">
                  {[0, 1, 2, 3].map(n => (
                    <button key={n} onClick={() => setCreateBots(n)}
                      className={`pg-seg-opt ${createBots === n ? 'pg-seg-opt--on' : ''}`}>{n === 0 ? 'None' : n}</button>
                  ))}
                </div>
              </div>
            </div>

            <button onClick={createMultiplayerRoom} className="action-btn action-btn--deal w-full py-4">Create Table</button>
          </>
        ) : (
          <div className="lh-card">
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <div className="text-[10px] text-white/40 uppercase tracking-widest mb-1">Room Code</div>
                <div className="room-code">{createdRoom.code}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => copyText(createdRoom.code, 'Code copied')} className="share-btn">Copy Code</button>
                <button onClick={() => copyText(roomLink(createdRoom.code), 'Link copied')} className="share-btn">Copy Link</button>
              </div>
              <button onClick={() => nativeShare(createdRoom.code)} className="action-btn action-btn--split w-full py-3">Share Invite</button>
              <div className="flex justify-center gap-2 flex-wrap">
                {[
                  { label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent('Join my Blackjack table: ' + roomLink(createdRoom.code))}` },
                  { label: 'Telegram', href: `https://t.me/share/url?url=${encodeURIComponent(roomLink(createdRoom.code))}&text=${encodeURIComponent('Join my Blackjack table')}` },
                  { label: 'X', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent('Join my Blackjack table: ' + roomLink(createdRoom.code))}` },
                  { label: 'Email', href: `mailto:?subject=${encodeURIComponent('Blackjack invite')}&body=${encodeURIComponent('Join my table: ' + roomLink(createdRoom.code))}` },
                ].map(s => (
                  <a key={s.label} href={s.href} target="_blank" rel="noreferrer" className="share-chip">{s.label}</a>
                ))}
              </div>
              <button onClick={() => setScreen('TABLE')} className="action-btn action-btn--deal w-full py-3.5">Enter Table</button>
              {shareToast && <div className="text-center text-[11px] text-emerald-400">{shareToast}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // ── SCREEN: JOIN ROOM — live public list with filters + private code ──

  if (screen === 'JOIN') {
    const phaseLabel = { betting: 'Taking bets', insurance: 'Insurance', playing: 'In play', dealer_turn: 'In play', game_over: 'Between rounds' }
    const filtered = publicRooms.filter(r => {
      if (joinSearch && !(`${r.name} ${r.host || ''}`.toLowerCase().includes(joinSearch.toLowerCase()))) return false
      if (joinPhase === 'betting' && r.gameState !== 'betting' && r.gameState !== 'game_over') return false
      if (joinPhase === 'playing' && !['playing', 'insurance', 'dealer_turn'].includes(r.gameState)) return false
      return true
    })
    return (
      <div className="pg-screen">
        <div className="casino-bg" aria-hidden="true" />
        <div className="pg-shell">
          <div className="pg-head">
            <button onClick={() => setScreen('MENU')} className="lh-back">← Menu</button>
            <div className="text-right">
              <h2 className="pg-title font-display gold-text">Join a Table</h2>
              <p className="pg-sub">{loadingPublic ? 'Scanning the floor…' : `${publicRooms.length} public table${publicRooms.length === 1 ? '' : 's'} live`}</p>
            </div>
          </div>

          <div className="lh-card">
            <div className="lh-kicker">Have a code? Jump straight in</div>
            <div className="flex gap-2 flex-wrap">
              <input type="text" value={joinInput} onChange={e => setJoinInput(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && joinRoom()}
                placeholder="ROOM CODE"
                className="flex-1 min-w-[180px] bg-[#080c12] border border-slate-700 rounded-xl px-4 py-3 text-sm text-white font-mono uppercase tracking-[0.3em] text-center outline-none focus:border-[#c9a227] transition-colors placeholder-slate-600" />
              <button onClick={() => joinRoom()} className="action-btn action-btn--deal px-8">Join</button>
            </div>
          </div>

          <div className="lh-card">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div className="lh-kicker" style={{ marginBottom: 0 }}>Public tables</div>
              <button onClick={refreshPublicRooms} className="lh-btn">↻ Refresh</button>
            </div>
            <div className="flex gap-2 flex-wrap mb-4">
              <input type="text" value={joinSearch} onChange={e => setJoinSearch(e.target.value)}
                placeholder="Search table or host…"
                className="flex-1 min-w-[200px] bg-[#080c12] border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#c9a227] transition-colors placeholder-slate-600" />
              <div className="pg-seg">
                {[['all', 'All'], ['betting', 'Open to bet'], ['playing', 'Mid-hand']].map(([id, label]) => (
                  <button key={id} onClick={() => setJoinPhase(id)}
                    className={`pg-seg-opt ${joinPhase === id ? 'pg-seg-opt--on' : ''}`}>{label}</button>
                ))}
              </div>
            </div>

            {loadingPublic && publicRooms.length === 0 && (
              <div className="text-white/40 text-sm text-center py-10 animate-pulse">Finding tables…</div>
            )}
            {!loadingPublic && filtered.length === 0 && (
              <div className="text-center py-10">
                <div className="text-white/45 text-sm mb-4">
                  {publicRooms.length === 0 ? 'No public tables right now — be the first to open one.' : 'Nothing matches those filters.'}
                </div>
                {publicRooms.length === 0 && (
                  <button onClick={openCreateScreen} className="lh-btn lh-btn--gold">＋ Create a table</button>
                )}
              </div>
            )}
            <div className="join-grid">
              {filtered.map(r => (
                <div key={r.id} className="join-card">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <span className={`pg-theme-swatch join-swatch ${r.theme === 'blue' ? 'join-swatch--blue' : 'join-swatch--green'}`} />
                    <div className="text-white font-bold text-sm flex-1 truncate">{r.name}</div>
                    <span className={`join-state ${['playing', 'insurance', 'dealer_turn'].includes(r.gameState) ? 'join-state--live' : ''}`}>
                      {phaseLabel[r.gameState] || 'Open'}
                    </span>
                  </div>
                  <div className="text-[11px] text-white/45 mb-3">
                    {r.host ? `Hosted by ${r.host} · ` : ''}{r.playerCount} player{r.playerCount === 1 ? '' : 's'}
                    {r.botCount > 0 ? ` · ${r.botCount} bot${r.botCount === 1 ? '' : 's'}` : ''} · {r.seatsTaken}/7 seats · {r.decks} decks
                  </div>
                  <button onClick={() => joinRoom(r.id)} className="share-btn w-full">Take a Seat</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── SCREEN: MENU ──────────────────────────────────────────────────

  if (screen === 'MENU') {
    const menuItems = [
      { key: 'PLAY', label: 'Play', onClick: playSolo, icon: '♠' },
      { key: 'CREATE', label: 'Create Room', onClick: openCreateScreen, icon: '＋' },
      { key: 'JOIN', label: 'Join Room', onClick: () => { setJoinSearch(''); setJoinPhase('all'); refreshPublicRooms(); setScreen('JOIN') }, icon: '⇲' },
      { key: 'LEARN', label: 'Learning Hub', onClick: () => setScreen('THEORY'), icon: '◆' },
    ]

    return (
      <div className="menu-screen min-h-screen font-sans relative overflow-hidden">
        <div className="casino-bg" aria-hidden="true" />

        <div className="relative z-10 min-h-screen flex flex-col max-w-5xl mx-auto px-6 py-6">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-display font-bold gold-text tracking-[0.15em] uppercase leading-none">Blackjack</h1>
              <p className="text-[11px] text-[#c9a227]/60 font-display mt-1.5 tracking-[0.3em] uppercase">
                Salon Privé · Mark V
                <span className="ml-3">{connected ? <span className="text-emerald-400">● Online</span> : <span className="text-red-400">● Offline</span>}</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <button onClick={() => setProfileOpen(o => !o)} className="profile-btn">
                  <span className="profile-avatar">{(userProfile?.username || '?').slice(0, 1).toUpperCase()}</span>
                  <span className="text-left">
                    <span className="block text-xs text-white font-bold leading-tight max-w-[120px] truncate">{userProfile?.username}</span>
                    <span className="block text-[11px] text-emerald-400 font-mono font-black leading-tight">${(myBalance || userProfile?.balance || 0).toLocaleString()}</span>
                  </span>
                  <span className="text-white/40 text-xs">▾</span>
                </button>
                {profileOpen && (
                  <div className="profile-menu" onMouseLeave={() => setProfileOpen(false)}>
                    <div className="px-4 py-3 border-b border-white/10">
                      <div className="text-[10px] text-white/40 uppercase tracking-widest">Balance</div>
                      <div className="text-emerald-400 font-mono font-black text-lg">${(myBalance || userProfile?.balance || 0).toLocaleString()}</div>
                    </div>
                    <button onClick={openRename} className="profile-menu-item">Change Username</button>
                    <button onClick={() => { setProfileOpen(false); setScreen('STATS') }} className="profile-menu-item">Player Statistics</button>
                    <button onClick={() => { setProfileOpen(false); setScreen('SETTINGS') }} className="profile-menu-item">Engine Settings</button>
                    <button onClick={() => { setProfileOpen(false); handleSignOut() }} className="profile-menu-item profile-menu-item--danger">Log Out</button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Center option list */}
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-full max-w-md flex flex-col gap-3">
              {menuItems.map(item => (
                <button key={item.key} onClick={item.onClick} className="menu-row">
                  <span className="menu-row-icon">{item.icon}</span>
                  <span className="flex-1 text-left text-white font-bold text-base tracking-wide">{item.label}</span>
                  <span className="text-white/25 text-lg">›</span>
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Post-game review shown after leaving a table */}
        {assessment && (
          <AssessmentOverlay review={assessment.review} mode={assessment.mode}
            onClose={() => setAssessment(null)} closeLabel="Done" />
        )}

        {/* Change-username modal */}
        {renameOpen && (
          <div className="table-modal-backdrop" onClick={() => setRenameOpen(false)}>
            <div className="table-modal" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="panel-section-title">Profile</div>
                  <div className="text-white font-display text-lg mt-1">Change Username</div>
                </div>
                <button onClick={() => setRenameOpen(false)} className="text-white/50 hover:text-white text-xl leading-none">×</button>
              </div>
              <p className="text-[11px] text-white/45 mb-3 leading-relaxed">
                This is how you appear at the table and in rooms. 3–20 characters — letters, numbers, spaces, and <span className="text-white/70">. _ -</span>
                {!userProfile?.username?.includes('@') ? ' It’s also your sign-in name.' : ''}
              </p>
              <input autoFocus type="text" value={renameValue} maxLength={20}
                onChange={e => { setRenameValue(e.target.value); setRenameError('') }}
                onKeyDown={e => e.key === 'Enter' && submitRename()}
                placeholder="New username"
                className="w-full bg-[#080c12] border border-slate-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c9a227] transition-colors placeholder-slate-600" />
              {renameError && <p className="text-red-400 text-xs font-mono mt-2">{renameError}</p>}
              <div className="flex gap-2 mt-4">
                <button onClick={() => setRenameOpen(false)} className="action-btn action-btn--stand flex-1 py-3 text-[10px]">Cancel</button>
                <button onClick={submitRename} disabled={renameSaving || !renameValue.trim()}
                  className={`action-btn action-btn--deal flex-1 py-3 text-[10px] ${renameSaving || !renameValue.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {renameSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    )
  }

  // ── SCREEN: TABLE — full-bleed premium view, all HUD as transparent overlays

  // A room renders ITS theme (set at creation) so every player sees the same felt.
  const theme = tableState?.settings?.tableTheme || settings.tableTheme || 'green'
  const myBetSeats = seats.filter(s => s.playerName === userProfile?.username)

  return (
    <div className="h-screen w-screen relative overflow-hidden font-sans table-room" data-theme={theme}>

      {/* Full-bleed table */}
      {/* themed studio backdrop — sharp behind the table, dark toward the felt */}
      <div className="table-bg" style={{ backgroundImage: `url('${themeBgUrl}')` }} />

      <div className="table-stage">
        <div className="table-stage-inner" ref={stageRef}>
          <Table2D theme={theme} className="table-svg"
            shoeFill={Math.max(0.06, (counting.remainingCards || 312) / ((settings.numDecks || 6) * 52))}
            discardFill={Math.min(1, 1 - (counting.remainingCards || 312) / ((settings.numDecks || 6) * 52))} />
          {SEAT_ANCHORS.map(anchor => {
            const num = anchor.seat
            const seat = seats.find(s => s.number === num) || { number: num, isOccupied: false, hands: [], bet: 0, ppBet: 0, t3Bet: 0, isActiveTurn: false }
            const takenByOther = seat.isOccupied && seat.playerName !== userProfile?.username
            const seatIsMine = seat.playerName === userProfile?.username
            const seatResolved = (seat.hands?.length || 0) > 0 && seat.hands.every(h => h.outcome != null)
            // Only show the physical chip trail while it matches the live bet
            // (doubles/splits/rejoins fall back to a clean decomposition).
            const liveBet = seat.hands?.length ? seat.hands.reduce((s, h) => s + (h.bet || 0), 0) : seat.bet
            const trailOk = seatIsMine && sumChips(betChips.main) === liveBet
            // vector from this seat back to the shoe — cards fly in along it
            const ddx = `${(SHOE_ANCHOR.xPct - anchor.xPct).toFixed(1)}vw`
            const ddy = `${((SHOE_ANCHOR.yPct - anchor.yPct) * 0.5625).toFixed(1)}vw`
            return (
              <div key={num}>
                <div className="seat-anchor" style={{ left: `${anchor.xPct}%`, top: `${anchor.yPct}%`, '--ddx': ddx, '--ddy': ddy }}>
                  <SeatSpot
                    seat={seat}
                    isMe={seatIsMine}
                    activeHandIndex={activeHandIndex}
                    isSelected={selectedSeats.includes(num)}
                    selectable={gameState === 'betting' && !iSatDown && !takenByOther}
                    onSelect={() => toggleSeat(num)}
                    gameState={gameState}
                    pendingAction={pendingActions[num] || null}
                    onQuickAction={handleQuickAction}
                    betTrail={trailOk ? betChips.main : null}
                    dealOrder={Math.max(0, activeSeatNumbers.indexOf(num))}
                    dealCount={activeSeatNumbers.length}
                    dealStep={dealStep}
                    isBot={(tableState?.botNames || []).includes(seat.playerName)}
                  />
                </div>
                {seat.ppDisplay > 0 && (
                  <div className="side-anchor" style={{ left: `${anchor.pp.xPct}%`, top: `${anchor.pp.yPct}%` }}>
                    <ChipStack amount={seat.ppDisplay} maxChips={2}
                      chips={seatIsMine && !seatResolved && sumChips(betChips.pp) === seat.ppBet ? betChips.pp : null}
                      result={seatResolved ? 'sidebet' : null} originalBet={seat.ppBet} />
                  </div>
                )}
                {seat.t3Display > 0 && (
                  <div className="side-anchor" style={{ left: `${anchor.t3.xPct}%`, top: `${anchor.t3.yPct}%` }}>
                    <ChipStack amount={seat.t3Display} maxChips={2}
                      chips={seatIsMine && !seatResolved && sumChips(betChips.t3) === seat.t3Bet ? betChips.t3 : null}
                      result={seatResolved ? 'sidebet' : null} originalBet={seat.t3Bet} />
                  </div>
                )}
              </div>
            )
          })}

          {/* Dealer's cards — just under the flat edge */}
          <div className="dealer-cards-anchor"
            style={{ left: `${DEALER_CARD_ANCHOR.xPct}%`, top: `${DEALER_CARD_ANCHOR.yPct}%`,
              '--ddx': `${(SHOE_ANCHOR.xPct - DEALER_CARD_ANCHOR.xPct).toFixed(1)}vw`,
              '--ddy': `${((SHOE_ANCHOR.yPct - DEALER_CARD_ANCHOR.yPct) * 0.5625).toFixed(1)}vw` }}>
            {dealer.cards?.length > 0 && (
              <>
                <CardRow cards={dealer.cards} hideSecond={hideDealer} size="md" dealAnim
                  isDealer dealCount={activeSeatNumbers.length} dealStep={dealStep} />
                <div className="dealer-total-badge">
                  {hideDealer ? (
                    <span className="text-white/70">{dealer.cards[0]}</span>
                  ) : (
                    <span className={dealer.total > 21 ? 'text-red-400' : 'text-white'}>
                      {dealer.total > 21 ? `Bust ${dealer.total}` : dealer.total}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <OptionsModal />
      <ChipPicker />

      {/* Shoe-complete review (cut card reached) */}
      {assessment && (
        <AssessmentOverlay review={assessment.review} mode={assessment.mode}
          onClose={() => setAssessment(null)} />
      )}

      {/* Cut-the-deck ritual — fresh shoe, player chooses where to cut */}
      {cutOpen && (
        <div className="table-modal-backdrop" onClick={() => setCutOpen(false)}>
          <div className="table-modal text-center" onClick={e => e.stopPropagation()}>
            <div className="panel-section-title">Fresh Shoe</div>
            <div className="text-white font-display text-xl mt-1 mb-1">Cut the Deck</div>
            <p className="text-[11px] text-white/45 mb-1">Click anywhere on the deck to place the cut card.</p>
            <div className="cut-deck"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                setCutPos(Math.min(0.95, Math.max(0.05, (e.clientX - r.left) / r.width)))
              }}>
              {Array.from({ length: 40 }).map((_, i) => (
                <div key={i} className="cut-deck-card" style={{ left: `${2 + i * 8.35}px` }} />
              ))}
              <div className="cut-marker" style={{ left: `${cutPos * 100}%` }} />
            </div>
            <div className="text-[10px] text-white/40 mb-3">cutting at {(cutPos * 100).toFixed(0)}%</div>
            <button onClick={() => { setCutOpen(false); audio.playShuffle(); socket.emit('execute_deal', { room: roomCode, cut: cutPos }) }}
              className="action-btn action-btn--deal w-full py-3.5">Cut &amp; Deal</button>
          </div>
        </div>
      )}

      {shareToast && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 bg-emerald-900/90 border border-emerald-500/50 text-emerald-100 text-[11px] font-bold px-4 py-2 rounded-full">
          {shareToast}
        </div>
      )}

      {/* Result popup */}
      {gameState === 'game_over' && resultData && (
        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
          <div className="result-popup" style={{ animationDelay: `${resultDelayMs}ms` }}>
            <div className={`result-headline ${resultData.kind === 'win' ? 'win-overlay' : resultData.kind === 'loss' ? 'text-red-400' : 'text-slate-300'}`}>
              {resultData.headline}
            </div>
            {resultData.kind === 'win' && (
              <div className="result-amount">${resultData.amount.toLocaleString()}</div>
            )}
            {resultData.kind === 'push' && resultData.amount > 0 && (
              <div className="result-amount result-amount--push">${resultData.amount.toLocaleString()} returned</div>
            )}
            {resultData.kind === 'loss' && (
              <div className="result-amount result-amount--loss">Better luck next hand</div>
            )}
          </div>
        </div>
      )}

      {/* Decision dock — upper half (over the dealer area), never over a hand */}
      {gameState === 'playing' && isMyTurn && (
        <div className="decision-dock">
          <div className="decision-dock-label">Make Your Decision</div>
          <div className="decision-timer">
            <span className="text-xl font-display font-bold text-white z-10">{decisionSeconds}</span>
          </div>
          <div className="center-actions">
            <ActionBtn label="Double" variant="double" icon="2×" disabled={!activeHand?.canDouble} onClick={() => submitAction('double')} />
            <ActionBtn label="Hit" variant="hit" icon="+" disabled={activeHand?.canHit === false} onClick={() => submitAction('hit')} />
            <ActionBtn label="Stand" variant="stand" icon="−" onClick={() => submitAction('stand')} />
            <ActionBtn label="Split" variant="split" icon="⑂" disabled={!activeHand?.canSplit} onClick={() => submitAction('split')} />
          </div>
        </div>
      )}

      {/* ── TOP overlay bar (transparent) ── */}
      <div className="top-overlay">
        <button onClick={exitToLobby} className="top-overlay-btn">← Lobby</button>
        <div className="text-center">
          <div className="font-display text-sm tracking-[0.15em] text-[#c9a227]/90 uppercase hud-text">Salon Privé Blackjack</div>
          <div className="text-[9px] text-white/40 tracking-widest mt-0.5 hud-text">
            $10 – $500
            {!soloMode && roomCode && (
              <>
                <span className="mx-2">·</span>
                <button onClick={() => copyText(roomCode, 'Room code copied')} title="Copy room code"
                  className="text-[#c9a227]/70 hover:text-[#c9a227]">{roomCode} ⧉</button>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="mode-toggle">
            <button onClick={() => setGameMode('STANDARD')}
              className={`mode-toggle-opt ${gameMode === 'STANDARD' ? 'mode-toggle-opt--on' : ''}`}>Classic</button>
            <button onClick={() => setGameMode('LEARNER')}
              className={`mode-toggle-opt ${gameMode === 'LEARNER' ? 'mode-toggle-opt--on' : ''}`}>Learner</button>
          </div>
          <button onClick={() => setOptionsOpen(true)} className="top-overlay-btn">Options</button>
        </div>
      </div>

      {/* ── BOTTOM-LEFT: balance / bet as plain text ── */}
      <div className="hud-bl">
        <div className="hud-line"><span className="hud-lbl">Balance</span><span className="hud-val">${myBalance.toLocaleString()}</span></div>
        <div className="hud-line"><span className="hud-lbl">Total bet</span><span className="hud-val">${totalBet.toLocaleString()}</span></div>
        {gameState === 'betting' && myBalance < 5000 && (
          <button onClick={() => socket.emit('reload_bankroll', { room: roomCode, username: userProfile.username })}
            className="hud-reload">↻ Reload to $5,000</button>
        )}
      </div>

      {/* ── BOTTOM-CENTER: phase controls ── */}
      <div className="hud-bc">
        {gameState === 'betting' && !iSatDown && (
          <div className="bet-bar">
            <span className="hud-text text-[10px] uppercase tracking-[0.2em] text-white/50 mr-1">
              Tap seats · {selectedSeats.length} selected{!soloMode ? ` (max ${MAX_SEATS})` : ''}
            </span>
            {[['main', 'Main', mainBet], ['pp', 'PP', ppBet], ['t3', '21+3', t3Bet]].map(([id, label, val]) => (
              <button key={id} onClick={() => setActiveBetTab(id)}
                className={`bet-tab ${activeBetTab === id ? 'bet-tab--on' : ''}`}>
                {label} <b>${val}</b>
              </button>
            ))}
            <button onClick={() => setChipPickerOpen(true)} className="bet-tab" title="Choose chips">
              <CasinoChip value={activeBetTab === 'main' ? Math.max(10, mainBet || 10) : activeBetTab === 'pp' ? Math.max(10, ppBet || 10) : Math.max(10, t3Bet || 10)} size="sm" />
            </button>
            <button onClick={lockBets} className="action-btn action-btn--deal px-6 py-2.5 text-[11px]">Lock Bets</button>
          </div>
        )}
        {gameState === 'betting' && iSatDown && (
          <div className="bet-bar">
            <span className="hud-text text-[11px] text-white/70">
              ${myBetSeats.reduce((s, x) => s + x.bet + (x.ppBet || 0) + (x.t3Bet || 0), 0).toLocaleString()} on {myBetSeats.length} seat{myBetSeats.length === 1 ? '' : 's'}
            </span>
            <button onClick={editBet} className="bet-tab">✎ Adjust</button>
            {tableState?.shoePendingShuffle ? (
              <button onClick={() => { setCutPos(0.5); setCutOpen(true) }}
                className="action-btn action-btn--deal px-8 py-3 text-xs">Shuffle &amp; Cut</button>
            ) : (
              <button onClick={() => { audio.playDeal(); socket.emit('execute_deal', { room: roomCode }) }}
                className="action-btn action-btn--deal px-8 py-3 text-xs">Deal Now</button>
            )}
          </div>
        )}
        {gameState === 'playing' && !isMyTurn && (
          <div className="hud-text text-xs uppercase tracking-[0.2em] text-white/50">
            Waiting for <span className="text-[#c9a227] font-bold">{activeSeat?.playerName || '...'}</span>
            <span className="text-white/35 ml-2">· queue your move below your seat</span>
          </div>
        )}
        {gameState === 'insurance' && myInsuranceSeat && (
          <div className="bet-bar">
            <span className="hud-text text-[10px] text-[#c9a227] uppercase tracking-widest">Dealer shows Ace</span>
            <ActionBtn label={`Insurance $${Math.floor(myInsuranceSeat.bet / 2)}`} variant="insurance" onClick={() => buyInsurance(myInsuranceSeat.number, true)} />
            <ActionBtn label="No Thanks" variant="decline" onClick={() => buyInsurance(myInsuranceSeat.number, false)} />
          </div>
        )}
        {gameState === 'insurance' && !myInsuranceSeat && (
          <div className="hud-text text-xs uppercase tracking-[0.2em] text-white/40 animate-pulse">Insurance decisions...</div>
        )}
        {gameState === 'dealer_turn' && (
          <div className="hud-text text-xs uppercase tracking-[0.2em] text-white/50 animate-pulse font-display">Dealer draws...</div>
        )}
        {gameState === 'game_over' && (
          <ActionBtn label="Next Hand" variant="clear" onClick={() => { setLastWin(null); socket.emit('clear_round', { room: roomCode }) }} />
        )}
      </div>

      {/* ── RIGHT overlay: learner stats as transparent text ── */}
      {gameMode === 'LEARNER' && (
        <div className="hud-r">
          {showCount && (
            <div className="hud-r-block">
              <div className="hud-r-title">Hi-Lo Count</div>
              <div className="hud-line"><span className="hud-lbl">Running</span>
                <span className={`hud-val ${counting.runningCount > 0 ? 'text-emerald-300' : counting.runningCount < 0 ? 'text-red-300' : ''}`}>{counting.runningCount}</span></div>
              <div className="hud-line"><span className="hud-lbl">True</span>
                <span className={`hud-val ${counting.trueCount > 1 ? 'text-emerald-300' : counting.trueCount < -1 ? 'text-red-300' : ''}`}>{counting.trueCount}</span></div>
              <div className="hud-line"><span className="hud-lbl">Cards left</span><span className="hud-val">{counting.remainingCards}</span></div>
            </div>
          )}
          {showHints && learner && (
            <div className="hud-r-block">
              <div className="hud-r-title">Optimal Play</div>
              <div className="hud-r-suggestion">{learner.suggestion}</div>
              <div className="hud-r-reason">{learner.reasoning}</div>
              {settings.showBustProb !== false && (
                <div className="hud-line"><span className="hud-lbl">Bust if hit</span><span className="hud-val text-red-300">{learner.bustIfHit}%</span></div>
              )}
              {settings.showWinProb !== false && (
                <div className="hud-line"><span className="hud-lbl">Win if stand</span><span className="hud-val text-emerald-300">{learner.winIfStand?.win}%</span></div>
              )}
              {learner.optimalPlay && (
                <div className="hud-line"><span className="hud-lbl">Optimal W/L/P</span>
                  <span className="hud-val">{learner.optimalPlay.win}/{learner.optimalPlay.lose}/{learner.optimalPlay.push}%</span></div>
              )}
            </div>
          )}
          {logs.length > 0 && (
            <div className="hud-r-block hud-r-log">{logs[logs.length - 1]}</div>
          )}
        </div>
      )}
    </div>
  )
}
