const FEATURES = [
  {
    number: '01',
    title: 'Persona Architecture',
    description:
      'Design influencers with distinct aesthetics, backstories, and personalities that authentically resonate with your target audience segments. Every persona is unique.',
  },
  {
    number: '02',
    title: 'Autonomous Content Engine',
    description:
      'Your influencers create, schedule, and publish content 24/7 — engaging with followers, responding to trends, and organically growing their audiences without manual intervention.',
  },
  {
    number: '03',
    title: 'Brand DNA Alignment',
    description:
      'Every piece of content is calibrated to your brand guidelines, tone of voice, and messaging strategy across all platforms. Consistency without compromise.',
  },
  {
    number: '04',
    title: 'Performance Intelligence',
    description:
      'Real-time analytics on reach, engagement, audience growth, and ROI across your entire influencer fleet — with actionable recommendations delivered weekly.',
  },
]

export function Features() {
  return (
    <section id="platform" className="bg-alabaster border-t border-charcoal/10 py-24 lg:py-36">
      <div className="max-w-[1600px] mx-auto px-8 lg:px-16">

        {/* ── Section intro: asymmetric 2-column ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 mb-20 lg:mb-28">

          {/* Left: headline */}
          <div className="lg:col-span-5">
            <div className="flex items-center gap-4 mb-8">
              <span className="h-px w-8 bg-charcoal/25" />
              <p className="font-inter text-[10px] uppercase tracking-[0.3em] text-warm-grey">
                Platform
              </p>
            </div>
            <h2 className="font-playfair text-5xl lg:text-6xl leading-tight text-charcoal">
              What Makes{' '}
              <em className="not-italic italic text-gold">Loque</em>
              <br />
              Different.
            </h2>
          </div>

          {/* Right: drop cap intro */}
          <div className="lg:col-span-7 lg:col-start-6 flex items-end">
            <p className="drop-cap font-inter text-base lg:text-lg leading-relaxed text-warm-grey max-w-xl">
              eploying authentic virtual influencers was once the domain of
              science fiction. Today, Loque makes it accessible to every brand
              with a vision — pairing cutting-edge AI with the editorial
              sensibility of a luxury creative studio. We don't just generate
              content. We architect presence.
            </p>
          </div>
        </div>

        {/* ── Feature cards: 2×2 grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-charcoal/10">
          {FEATURES.map(({ number, title, description }) => (
            <div
              key={number}
              className="group bg-alabaster p-10 lg:p-14 hover:bg-taupe/40 transition-colors duration-700 flex flex-col gap-6"
            >
              <span className="font-playfair text-5xl text-charcoal/10 leading-none group-hover:text-gold/20 transition-colors duration-700">
                {number}
              </span>
              <div>
                <h3 className="font-playfair text-2xl lg:text-3xl text-charcoal mb-4 leading-tight">
                  {title}
                </h3>
                <p className="font-inter text-sm lg:text-base leading-relaxed text-warm-grey">
                  {description}
                </p>
              </div>
              {/* Gold accent line — appears on hover */}
              <div className="h-px w-0 bg-gold group-hover:w-12 transition-all duration-700 mt-auto" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
