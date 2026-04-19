import { Check } from 'lucide-react'

type Plan = {
  name: string
  price: string
  period: string
  description: string
  features: string[]
  cta: string
  featured: boolean
}

const PLANS: Plan[] = [
  {
    name: 'Atelier',
    price: '$100',
    period: 'per month',
    description: 'For emerging brands ready to explore the power of virtual influence.',
    features: [
      '10 text posts daily',
      '3-4 image posts daily',
      '1 video post daily',
      'Basic Analytics Dashboard',
      'Brand Voice Training',
      'Email Support',
    ],
    cta: 'Begin Your Journey',
    featured: false,
  },
  {
    name: 'Maison',
    price: '$500',
    period: 'per month',
    description: 'For established brands scaling their influence across every channel.',
    features: [
      'Continuous brand analysis',
      'Autoresearch for social growth',
      '5x more posts than Atelier',
      'Advanced Analytics & Reports',
      'Brand DNA Deep Integration',
      'Priority Support',
      'Monthly Strategy Sessions',
      'Trend Intelligence Feed',
    ],
    cta: 'Elevate Your Brand',
    featured: true,
  },
  {
    name: 'Couture',
    price: 'Custom',
    period: 'pricing',
    description: 'For luxury houses and enterprise brands demanding white-glove service.',
    features: [
      'Unlimited Influencers',
      'Custom Platform Integration',
      'Real-time Content Generation',
      'Dedicated Account Team',
      'Custom Brand Studio',
      'Regulatory Compliance',
      'SLA Guarantees',
      'Executive Reporting Suite',
    ],
    cta: 'Contact Our Studio',
    featured: false,
  },
]

export function Pricing() {
  return (
    <section id="pricing" className="bg-alabaster border-t border-charcoal/10 py-24 lg:py-36">
      <div className="max-w-[1600px] mx-auto px-8 lg:px-16">

        {/* ── Header ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-20">
          <div className="lg:col-span-6">
            <div className="flex items-center gap-4 mb-8">
              <span className="h-px w-8 bg-charcoal/25" />
              <p className="font-inter text-[10px] uppercase tracking-[0.3em] text-warm-grey">
                Investment
              </p>
            </div>
            <h2 className="font-playfair text-5xl lg:text-6xl leading-tight text-charcoal">
              Choose Your{' '}
              <em className="not-italic italic text-gold">Level</em>
              <br />
              of Influence.
            </h2>
          </div>
          <div className="lg:col-span-5 lg:col-start-8 flex items-end">
            <p className="font-inter text-base leading-relaxed text-warm-grey">
              Every plan includes brand onboarding, persona creation, and
              platform setup. Cancel or upgrade at any time — no lock-in
              contracts, no hidden fees.
            </p>
          </div>
        </div>

        {/* ── Plans grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-charcoal/10">
          {PLANS.map(({ name, price, period, description, features, cta, featured }) => (
            <div
              key={name}
              className={`flex flex-col p-10 lg:p-12 transition-colors duration-700 ${
                featured
                  ? 'bg-charcoal border-t-4 border-t-gold'
                  : 'bg-alabaster hover:bg-taupe/30 border-t-4 border-t-transparent hover:border-t-charcoal/20'
              }`}
            >
              {/* Plan name */}
              <div className="mb-8">
                <p
                  className={`font-inter text-[10px] uppercase tracking-[0.3em] mb-4 ${
                    featured ? 'text-gold' : 'text-warm-grey'
                  }`}
                >
                  {featured ? '★ Most Popular' : 'Plan'}
                </p>
                <h3
                  className={`font-playfair text-3xl lg:text-4xl leading-tight mb-2 ${
                    featured ? 'text-alabaster' : 'text-charcoal'
                  }`}
                >
                  {name}
                </h3>
                <p
                  className={`font-inter text-sm leading-relaxed ${
                    featured ? 'text-white/50' : 'text-warm-grey'
                  }`}
                >
                  {description}
                </p>
              </div>

              {/* Price */}
              <div
                className={`pb-8 mb-8 border-b ${
                  featured ? 'border-white/10' : 'border-charcoal/10'
                }`}
              >
                <p
                  className={`font-playfair text-5xl leading-none mb-1 ${
                    featured ? 'text-alabaster' : 'text-charcoal'
                  }`}
                >
                  {price}
                </p>
                <p
                  className={`font-inter text-[10px] uppercase tracking-[0.2em] ${
                    featured ? 'text-white/30' : 'text-warm-grey/50'
                  }`}
                >
                  {period}
                </p>
              </div>

              {/* Feature list */}
              <ul className="flex flex-col gap-4 mb-10 flex-1">
                {features.map(feat => (
                  <li key={feat} className="flex items-start gap-3">
                    <Check
                      size={13}
                      strokeWidth={2}
                      className={`shrink-0 mt-0.5 ${featured ? 'text-gold' : 'text-charcoal/40'}`}
                    />
                    <span
                      className={`font-inter text-sm leading-snug ${
                        featured ? 'text-white/70' : 'text-warm-grey'
                      }`}
                    >
                      {feat}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA button */}
              <a
                href="#"
                className={`group relative overflow-hidden inline-flex items-center justify-center h-12 px-8 font-inter text-[10px] uppercase tracking-[0.22em] font-medium transition-shadow duration-500 ${
                  featured
                    ? 'bg-gold text-charcoal hover:shadow-[0_8px_24px_rgba(212,175,55,0.35)]'
                    : 'border border-charcoal text-charcoal hover:bg-charcoal hover:text-white'
                }`}
              >
                {!featured && (
                  <span
                    className="absolute inset-0 bg-charcoal -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
                    style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
                    aria-hidden="true"
                  />
                )}
                <span className={`relative z-10 ${!featured ? 'group-hover:text-white transition-colors duration-500' : ''}`}>
                  {cta}
                </span>
              </a>
            </div>
          ))}
        </div>

        {/* ── Footer note ── */}
        <p className="font-inter text-[10px] uppercase tracking-[0.2em] text-warm-grey/40 text-center mt-10">
          All prices in USD · Annual billing available at 20% discount · 14-day free trial on Atelier & Maison
        </p>
      </div>
    </section>
  )
}
