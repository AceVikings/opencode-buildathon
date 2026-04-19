const STEPS = [
  {
    number: '01',
    title: 'Define Your Brand DNA',
    description:
      'Brief our studio on your brand identity, target demographics, content strategy, and aesthetic vision. We study everything — from your tone of voice to your colour palette.',
  },
  {
    number: '02',
    title: 'Meet Your Influencers',
    description:
      'Our AI architects build unique virtual personas tailored precisely to your vision. Backstories, visual identities, posting styles, audience niches — all crafted to specification.',
  },
  {
    number: '03',
    title: 'Watch Them Work',
    description:
      'Your fleet goes live across Instagram, TikTok, YouTube, and beyond. They post, engage, grow — and your brand\'s presence compounds daily while you focus on everything else.',
  },
]

export function HowItWorks() {
  return (
    <section id="influencers" className="bg-charcoal border-t border-white/10 py-24 lg:py-36">
      <div className="max-w-[1600px] mx-auto px-8 lg:px-16">

        {/* ── Section header ── */}
        <div className="flex items-center gap-4 mb-6">
          <span className="h-px w-8 bg-white/20" />
          <p className="font-inter text-[10px] uppercase tracking-[0.3em] text-white/40">
            How It Works
          </p>
        </div>
        <h2 className="font-playfair text-5xl lg:text-6xl leading-tight text-alabaster mb-20 lg:mb-28 max-w-xl">
          Three Steps to{' '}
          <em className="not-italic italic text-gold">Lasting</em>{' '}
          Influence.
        </h2>

        {/* ── Steps ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-white/10">
          {STEPS.map(({ number, title, description }) => (
            <div
              key={number}
              className="group bg-charcoal px-8 lg:px-10 py-12 lg:py-14 hover:bg-white/5 transition-colors duration-700 flex flex-col gap-8 border-t-0"
            >
              {/* Step number */}
              <span className="font-playfair text-6xl lg:text-8xl text-white/8 leading-none group-hover:text-gold/15 transition-colors duration-700 select-none">
                {number}
              </span>

              <div className="flex flex-col gap-4">
                <h3 className="font-playfair text-2xl lg:text-3xl text-alabaster leading-tight">
                  {title}
                </h3>
                <p className="font-inter text-sm lg:text-base leading-relaxed text-white/50">
                  {description}
                </p>
              </div>

              {/* Gold underline on hover */}
              <div className="h-px w-0 bg-gold group-hover:w-10 transition-all duration-700 mt-auto" />
            </div>
          ))}
        </div>

        {/* ── Bottom CTA ── */}
        <div className="mt-20 lg:mt-24 flex flex-col sm:flex-row items-start sm:items-center gap-8 border-t border-white/10 pt-12">
          <p className="font-playfair text-xl italic text-white/40 max-w-sm">
            "From briefing to first post in under 72 hours."
          </p>
          <a
            href="#pricing"
            className="group relative overflow-hidden inline-flex items-center h-12 px-8 bg-transparent border border-white/30 text-white font-inter text-[10px] uppercase tracking-[0.22em] hover:border-gold hover:text-gold transition-colors duration-500 ml-auto"
          >
            View Plans
          </a>
        </div>
      </div>
    </section>
  )
}
