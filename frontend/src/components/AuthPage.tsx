import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth'
import type { AuthError } from 'firebase/auth'
import { auth, googleProvider } from '../lib/firebase'

type Mode = 'signin' | 'signup'

const FIREBASE_MESSAGES: Record<string, string> = {
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/popup-closed-by-user': 'Sign-in popup was closed.',
  'auth/invalid-credential': 'Invalid email or password.',
}

function friendlyError(err: AuthError) {
  return FIREBASE_MESSAGES[err.code] ?? 'Something went wrong. Please try again.'
}

async function addToWaitlist(email: string, uid: string, name: string | null, source: 'email' | 'google') {
  try {
    await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/api/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, uid, name, source }),
    })
  } catch {
    // Non-fatal — Firebase account was created; waitlist write failure shouldn't block the user
    console.warn('Waitlist API unreachable')
  }
}

// ── Waitlist confirmation ────────────────────────────────────────────────────

function WaitlistConfirmation({ email }: { email: string }) {
  return (
    <div className="min-h-screen bg-alabaster flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] bg-charcoal px-16 py-20 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(#F9F8F6 1px, transparent 1px), linear-gradient(90deg, #F9F8F6 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }}
          aria-hidden="true"
        />
        <Link
          to="/"
          className="font-playfair text-2xl tracking-[0.18em] uppercase text-alabaster hover:text-gold transition-colors duration-500 relative z-10"
        >
          Loque
        </Link>
        <div className="relative z-10">
          <p className="font-playfair text-[2.8rem] leading-[1.15] text-alabaster mb-8">
            Brand intelligence<br />for the modern<br />creator economy.
          </p>
          <div className="w-12 h-px bg-gold mb-8" />
          <p className="font-inter text-[12px] uppercase tracking-[0.22em] text-warm-grey">
            Trusted by 2,400+ brands worldwide
          </p>
        </div>
        <p className="font-inter text-[10px] uppercase tracking-[0.18em] text-warm-grey relative z-10">
          &copy; {new Date().getFullYear()} Loque
        </p>
      </div>

      {/* Right — confirmation */}
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 lg:px-20 py-20">
        <Link
          to="/"
          className="lg:hidden font-playfair text-2xl tracking-[0.18em] uppercase text-charcoal hover:text-gold transition-colors duration-500 mb-16 inline-block"
        >
          Loque
        </Link>

        <div className="max-w-[400px] w-full mx-auto lg:mx-0">
          {/* Gold accent line */}
          <div className="w-12 h-px bg-gold mb-10" />

          <p className="font-inter text-[10px] uppercase tracking-[0.28em] text-warm-grey mb-3">
            You're in
          </p>
          <h1 className="font-playfair text-4xl text-charcoal mb-6">
            Welcome to Loque.
          </h1>
          <p className="font-inter text-sm leading-relaxed text-warm-grey mb-10">
            <span className="text-charcoal font-medium">{email}</span> has been added
            to our waitlist. We'll reach out with priority access details and a
            personal invitation to our studio briefing.
          </p>

          <Link
            to="/"
            className="group relative overflow-hidden inline-flex items-center justify-center h-12 px-10 bg-charcoal text-white font-inter text-[10px] uppercase tracking-[0.22em] font-medium"
          >
            <span
              className="absolute inset-0 bg-gold -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
              style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
              aria-hidden="true"
            />
            <span className="relative z-10">Back to home</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

// ── Auth page ────────────────────────────────────────────────────────────────

export function AuthPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [waitlisted, setWaitlisted] = useState(false)
  const [waitlistedEmail, setWaitlistedEmail] = useState('')

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signin') {
        await signInWithEmailAndPassword(auth, email, password)
        navigate('/', { replace: true })
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password)
        await addToWaitlist(email, cred.user.uid, cred.user.displayName, 'email')
        setWaitlistedEmail(email)
        setWaitlisted(true)
      }
    } catch (err) {
      setError(friendlyError(err as AuthError))
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setError('')
    setLoading(true)
    try {
      const cred = await signInWithPopup(auth, googleProvider)
      const isNew = cred.user.metadata.creationTime === cred.user.metadata.lastSignInTime
      if (isNew) {
        await addToWaitlist(
          cred.user.email ?? '',
          cred.user.uid,
          cred.user.displayName,
          'google'
        )
        setWaitlistedEmail(cred.user.email ?? '')
        setWaitlisted(true)
      } else {
        navigate('/', { replace: true })
      }
    } catch (err) {
      setError(friendlyError(err as AuthError))
    } finally {
      setLoading(false)
    }
  }

  if (waitlisted) {
    return <WaitlistConfirmation email={waitlistedEmail} />
  }

  return (
    <div className="min-h-screen bg-alabaster flex">
      {/* ── Left decorative panel ── */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] bg-charcoal px-16 py-20 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(#F9F8F6 1px, transparent 1px), linear-gradient(90deg, #F9F8F6 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }}
          aria-hidden="true"
        />

        <Link
          to="/"
          className="font-playfair text-2xl tracking-[0.18em] uppercase text-alabaster hover:text-gold transition-colors duration-500 relative z-10"
        >
          Loque
        </Link>

        <div className="relative z-10">
          <p className="font-playfair text-[2.8rem] leading-[1.15] text-alabaster mb-8">
            Brand intelligence<br />for the modern<br />creator economy.
          </p>
          <div className="w-12 h-px bg-gold mb-8" />
          <p className="font-inter text-[12px] uppercase tracking-[0.22em] text-warm-grey">
            Trusted by 2,400+ brands worldwide
          </p>
        </div>

        <p className="font-inter text-[10px] uppercase tracking-[0.18em] text-warm-grey relative z-10">
          &copy; {new Date().getFullYear()} Loque
        </p>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 lg:px-20 py-20">
        <Link
          to="/"
          className="lg:hidden font-playfair text-2xl tracking-[0.18em] uppercase text-charcoal hover:text-gold transition-colors duration-500 mb-16 inline-block"
        >
          Loque
        </Link>

        <div className="max-w-[400px] w-full mx-auto lg:mx-0">
          <p className="font-inter text-[10px] uppercase tracking-[0.28em] text-warm-grey mb-3">
            {mode === 'signin' ? 'Welcome back' : 'Join the waitlist'}
          </p>
          <h1 className="font-playfair text-4xl text-charcoal mb-10">
            {mode === 'signin' ? 'Sign in to Loque' : 'Get early access'}
          </h1>

          {/* Google button */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full h-12 flex items-center justify-center gap-3 border border-charcoal/20 bg-white hover:border-charcoal/40 hover:bg-taupe transition-all duration-300 font-inter text-[11px] uppercase tracking-[0.18em] text-charcoal mb-8 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg width="16" height="16" viewBox="0 0 488 512" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"
              />
            </svg>
            {mode === 'signup' ? 'Sign up with Google' : 'Continue with Google'}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-4 mb-8">
            <div className="flex-1 h-px bg-charcoal/10" />
            <span className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">or</span>
            <div className="flex-1 h-px bg-charcoal/10" />
          </div>

          {/* Email / password form */}
          <form onSubmit={handleEmailSubmit} noValidate className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="h-12 px-4 border border-charcoal/20 bg-white font-inter text-[13px] text-charcoal placeholder:text-warm-grey/50 focus:outline-none focus:border-charcoal transition-colors duration-300"
                placeholder="you@example.com"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="h-12 px-4 border border-charcoal/20 bg-white font-inter text-[13px] text-charcoal placeholder:text-warm-grey/50 focus:outline-none focus:border-charcoal transition-colors duration-300"
                placeholder={mode === 'signup' ? 'Min. 6 characters' : '••••••••'}
              />
            </div>

            {error && (
              <p className="font-inter text-[11px] text-red-600 tracking-wide -mt-1">
                {error}
              </p>
            )}

            {mode === 'signup' && (
              <p className="font-inter text-[10px] text-warm-grey leading-relaxed -mt-1">
                By signing up you join our exclusive early-access waitlist.
                No spam — we'll only reach out with your invitation.
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="relative h-12 overflow-hidden bg-charcoal text-white font-inter text-[10px] uppercase tracking-[0.22em] font-medium mt-1 group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span
                className="absolute inset-0 bg-gold -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
                style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
                aria-hidden="true"
              />
              <span className="relative z-10">
                {loading
                  ? 'Please wait…'
                  : mode === 'signin'
                  ? 'Sign in'
                  : 'Join waitlist'}
              </span>
            </button>
          </form>

          {/* Mode toggle */}
          <p className="font-inter text-[11px] text-warm-grey mt-8 text-center">
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError('') }}
              className="text-charcoal underline underline-offset-4 hover:text-gold transition-colors duration-300"
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
