/**
 * Showcase — 6 virtual influencer profile cards.
 * Gradient backgrounds render as rich editorial tones;
 * grayscale filter reveals colour on hover with a 1500ms cinematic transition.
 */

type Influencer = {
  name: string
  niche: string
  followers: string
  gradient: string
  wide?: boolean
}

const INFLUENCERS: Influencer[] = [
  {
    name: 'ARIA',
    niche: 'Fashion & Style',
    followers: '2.4M',
    gradient: 'linear-gradient(160deg, #fda4af 0%, #9f1239 45%, #4c0519 100%)',
    wide: true,
  },
  {
    name: 'NOVA',
    niche: 'Wellness & Lifestyle',
    followers: '1.8M',
    gradient: 'linear-gradient(160deg, #6ee7b7 0%, #059669 45%, #064e3b 100%)',
  },
  {
    name: 'ZARA',
    niche: 'Beauty & Culture',
    followers: '3.1M',
    gradient: 'linear-gradient(160deg, #fde68a 0%, #b45309 45%, #451a03 100%)',
  },
  {
    name: 'EDEN',
    niche: 'Travel & Adventure',
    followers: '1.2M',
    gradient: 'linear-gradient(160deg, #93c5fd 0%, #1d4ed8 45%, #1e1b4b 100%)',
  },
  {
    name: 'LYRA',
    niche: 'Art & Design',
    followers: '980K',
    gradient: 'linear-gradient(160deg, #d8b4fe 0%, #7c3aed 45%, #3b0764 100%)',
  },
  {
    name: 'IRIS',
    niche: 'Food & Hospitality',
    followers: '2.7M',
    gradient: 'linear-gradient(160deg, #fef08a 0%, #ca8a04 45%, #713f12 100%)',
  },
]

function InfluencerCard({ name, niche, followers, gradient }: Influencer) {
  return (
    <div className="group relative overflow-hidden cursor-pointer shadow-[0_4px_24px_rgba(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.15)] transition-shadow duration-700">
      {/* Aspect ratio container */}
      <div className="aspect-[3/4] relative">
        {/* Gradient background — grayscale by default */}
        <div
          className="absolute inset-0 grayscale group-hover:grayscale-0 scale-100 group-hover:scale-[1.05] transition-[filter,transform] duration-[1500ms]"
          style={{
            background: gradient,
            transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          }}
        />

        {/* Inner border for depth */}
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{ boxShadow: 'inset 0 0 0 1px rgba(26,26,26,0.08)' }}
          aria-hidden="true"
        />

        {/* Dark bottom overlay */}
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-charcoal/75 to-transparent z-10" />

        {/* Vertical niche label */}
        <p
          className="writing-vertical absolute right-4 top-6 font-inter text-[8px] uppercase tracking-[0.25em] text-white/35 z-20 hidden lg:block select-none group-hover:text-white/55 transition-colors duration-700"
          aria-hidden="true"
        >
          {niche}
        </p>

        {/* Bottom content */}
        <div className="absolute inset-x-0 bottom-0 p-6 z-20 flex items-end justify-between">
          <div>
            <h3 className="font-playfair text-2xl text-white leading-none mb-1">
              {name}
            </h3>
            <p className="font-inter text-[10px] uppercase tracking-[0.22em] text-white/45 group-hover:text-gold transition-colors duration-700">
              {niche}
            </p>
          </div>
          <p className="font-playfair text-lg italic text-white/55 group-hover:text-white transition-colors duration-700">
            {followers}
          </p>
        </div>
      </div>
    </div>
  )
}

export function Showcase() {
  return (
    <section id="studio" className="bg-alabaster border-t border-charcoal/10 py-24 lg:py-36">
      <div className="max-w-[1600px] mx-auto px-8 lg:px-16">

        {/* ── Header ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-16 lg:mb-20">
          <div className="lg:col-span-6">
            <div className="flex items-center gap-4 mb-8">
              <span className="h-px w-8 bg-charcoal/25" />
              <p className="font-inter text-[10px] uppercase tracking-[0.3em] text-warm-grey">
                The Roster
              </p>
            </div>
            <h2 className="font-playfair text-5xl lg:text-6xl leading-tight text-charcoal">
              Meet Your{' '}
              <em className="not-italic italic text-gold">Future</em>
              <br />
              Influencers.
            </h2>
          </div>
          <div className="lg:col-span-5 lg:col-start-8 flex items-end">
            <p className="font-inter text-base leading-relaxed text-warm-grey">
              Every persona is architectured from the ground up — unique visual
              identity, distinct posting cadence, and an audience that feels
              genuinely earned. Hover to reveal them in full colour.
            </p>
          </div>
        </div>

        {/* ── Editorial 2-row grid ── */}
        {/* Row 1: ARIA (wide 2-col) + NOVA + ZARA */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <div className="sm:col-span-2">
            <InfluencerCard {...INFLUENCERS[0]} />
          </div>
          <div>
            <InfluencerCard {...INFLUENCERS[1]} />
          </div>
          <div>
            <InfluencerCard {...INFLUENCERS[2]} />
          </div>
        </div>

        {/* Row 2: EDEN + LYRA + IRIS (wide 2-col) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <InfluencerCard {...INFLUENCERS[3]} />
          </div>
          <div>
            <InfluencerCard {...INFLUENCERS[4]} />
          </div>
          <div className="sm:col-span-2">
            <InfluencerCard {...INFLUENCERS[5]} />
          </div>
        </div>

        {/* ── Footer note ── */}
        <p className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey/40 text-right mt-8">
          Custom personas available on all plans · Unlimited on Couture
        </p>
      </div>
    </section>
  )
}
