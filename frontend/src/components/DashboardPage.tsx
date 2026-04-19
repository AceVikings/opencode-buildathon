import { signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { ConnectX } from './ConnectX'

export function DashboardPage() {
  const { user } = useAuth()

  async function handleSignOut() {
    await signOut(auth)
  }

  return (
    <div className="min-h-screen bg-alabaster">
      {/* Noise overlay */}
      <div className="noise-overlay" aria-hidden="true" />

      {/* Top bar */}
      <header className="relative z-10 border-b border-charcoal/10 bg-alabaster/95 sticky top-0" style={{ backdropFilter: 'blur(12px)' }}>
        <div className="max-w-[1600px] mx-auto px-8 lg:px-16 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-playfair text-xl tracking-[0.18em] uppercase text-charcoal">
              Loque
            </span>
            <span className="h-4 w-px bg-charcoal/20" />
            <span className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">
              Dashboard
            </span>
            {/* Dev badge */}
            <span className="font-inter text-[9px] uppercase tracking-[0.18em] text-gold border border-gold/40 px-2 py-0.5">
              Dev
            </span>
          </div>
          <div className="flex items-center gap-6">
            <span className="font-inter text-[11px] text-warm-grey hidden sm:block">
              {user?.displayName ?? user?.email}
            </span>
            <button
              onClick={handleSignOut}
              className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey hover:text-charcoal transition-colors duration-300"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-[1600px] mx-auto px-8 lg:px-16 py-16">

        {/* Page heading */}
        <div className="mb-14">
          <p className="font-inter text-[10px] uppercase tracking-[0.3em] text-warm-grey mb-2">
            Overview
          </p>
          <h1 className="font-playfair text-4xl lg:text-5xl text-charcoal">
            Welcome back{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}.
          </h1>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-charcoal/10 border border-charcoal/10 mb-16">
          {[
            { label: 'Active Influencers', value: '—', sub: 'No fleet yet' },
            { label: 'Total Reach', value: '—', sub: 'Posts pending' },
            { label: 'Campaigns', value: '—', sub: 'None running' },
            { label: 'Engagement Rate', value: '—', sub: 'Awaiting data' },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-alabaster p-8">
              <p className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey mb-3">
                {label}
              </p>
              <p className="font-playfair text-4xl text-charcoal leading-none mb-1">{value}</p>
              <p className="font-inter text-[11px] text-warm-grey/60">{sub}</p>
            </div>
          ))}
        </div>

        {/* Placeholder sections */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-charcoal/10 border border-charcoal/10">

          {/* Main panel */}
          <div className="lg:col-span-8 bg-alabaster p-10">
            <div className="flex items-center justify-between mb-8">
              <p className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">
                Influencer Fleet
              </p>
              <button className="group relative overflow-hidden inline-flex items-center justify-center h-9 px-6 bg-charcoal text-white font-inter text-[9px] uppercase tracking-[0.22em]">
                <span
                  className="absolute inset-0 bg-gold -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
                  style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
                  aria-hidden="true"
                />
                <span className="relative z-10">+ Create Influencer</span>
              </button>
            </div>
            <div className="border border-dashed border-charcoal/15 flex flex-col items-center justify-center py-24 text-center">
              <div className="w-8 h-px bg-gold mx-auto mb-6" />
              <p className="font-playfair text-2xl text-charcoal mb-2">No influencers yet</p>
              <p className="font-inter text-sm text-warm-grey max-w-xs">
                Build your first AI-powered influencer to start amplifying your brand.
              </p>
            </div>
          </div>

          {/* Side panel */}
          <div className="lg:col-span-4 bg-alabaster border-l border-charcoal/10 flex flex-col">
            <div className="p-10 pb-6">
              <p className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey mb-8">
                Recent Activity
              </p>
              <div className="flex flex-col gap-6">
                {['Account created', 'Waitlist confirmed', 'Fleet ready to launch'].map((item, i) => (
                  <div key={item} className="flex items-start gap-4">
                    <div className={`w-1.5 h-1.5 mt-1.5 flex-shrink-0 ${i === 0 ? 'bg-gold' : 'bg-charcoal/20'}`} />
                    <div>
                      <p className="font-inter text-[12px] text-charcoal">{item}</p>
                      <p className="font-inter text-[10px] text-warm-grey/60 mt-0.5">
                        {i === 0 ? 'Just now' : 'Pending'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* X account connection */}
            <div className="mt-auto border-t border-charcoal/10">
              <ConnectX />
            </div>
          </div>
        </div>

      </main>
    </div>
  )
}
