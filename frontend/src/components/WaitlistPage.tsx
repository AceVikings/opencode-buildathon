import { Link } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'

export function WaitlistPage() {
  const { user } = useAuth()

  async function handleSignOut() {
    await signOut(auth)
  }

  return (
    <div className="min-h-screen bg-alabaster flex flex-col">
      {/* Noise overlay */}
      <div className="noise-overlay" aria-hidden="true" />

      {/* Minimal nav */}
      <header className="relative z-10 max-w-[1600px] mx-auto w-full px-8 lg:px-16 h-20 flex items-center justify-between">
        <Link
          to="/"
          className="font-playfair text-2xl tracking-[0.18em] uppercase text-charcoal hover:text-gold transition-colors duration-500"
        >
          Loque
        </Link>
        <button
          onClick={handleSignOut}
          className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey hover:text-charcoal transition-colors duration-300"
        >
          Sign out
        </button>
      </header>

      {/* Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-8">
        <div className="max-w-[560px] w-full text-center">

          {/* Gold rule */}
          <div className="w-12 h-px bg-gold mx-auto mb-10" />

          <p className="font-inter text-[10px] uppercase tracking-[0.3em] text-warm-grey mb-4">
            You're on the list
          </p>

          <h1 className="font-playfair text-5xl lg:text-6xl text-charcoal leading-tight mb-6">
            Welcome to<br />
            <em className="not-italic italic text-gold">Loque.</em>
          </h1>

          <p className="font-inter text-base leading-relaxed text-warm-grey mb-3">
            Signed in as{' '}
            <span className="text-charcoal font-medium">
              {user?.displayName ?? user?.email}
            </span>
          </p>

          <p className="font-inter text-base leading-relaxed text-warm-grey max-w-sm mx-auto mb-14">
            You have early-access priority. We'll reach out soon with your personal
            invitation to the Loque platform and a complimentary studio briefing.
          </p>

          {/* Stats row */}
          <div className="grid grid-cols-3 divide-x divide-charcoal/10 border border-charcoal/10 mb-14">
            {[
              { value: '500+', label: 'Brands' },
              { value: '12K+', label: 'Influencers' },
              { value: '3.2B', label: 'Monthly reach' },
            ].map(({ value, label }) => (
              <div key={label} className="py-6 px-4">
                <p className="font-playfair text-2xl text-charcoal leading-none mb-1">{value}</p>
                <p className="font-inter text-[10px] uppercase tracking-[0.18em] text-warm-grey">{label}</p>
              </div>
            ))}
          </div>

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
      </main>

      <footer className="relative z-10 max-w-[1600px] mx-auto w-full px-8 lg:px-16 py-8 border-t border-charcoal/10">
        <p className="font-inter text-[10px] uppercase tracking-[0.18em] text-warm-grey/50">
          &copy; {new Date().getFullYear()} Loque
        </p>
      </footer>
    </div>
  )
}
