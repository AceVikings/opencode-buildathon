import { Link } from 'react-router-dom'
import heroImg from '../assets/hero.png'

export function Hero() {
  return (
    <section className="relative min-h-screen bg-alabaster flex flex-col">

      {/* ── Main content grid ── */}
      <div className="flex-1 max-w-[1600px] mx-auto w-full px-8 lg:px-16 pt-36 pb-0 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-0">

        {/* ── Left column: copy ── */}
        <div className="lg:col-span-7 flex flex-col justify-end pb-20 lg:pb-28">

          {/* Overline */}
          <div className="flex items-center gap-4 mb-10">
            <span className="h-px w-10 bg-charcoal/30 inline-block" />
            <p className="font-inter text-[10px] uppercase tracking-[0.3em] text-warm-grey">
              AI Influencer Platform / 2026
            </p>
          </div>

          {/* Headline — mixed italic for drama */}
          <h1 className="font-playfair text-[3.2rem] sm:text-7xl lg:text-[6rem] xl:text-[7.5rem] leading-[0.88] tracking-tight text-charcoal mb-10">
            The Future
            <br />
            of{' '}
            <em className="not-italic italic text-gold">Brand</em>
            <br />
            Influence.
          </h1>

          {/* Body */}
          <p className="font-inter text-base lg:text-lg leading-relaxed text-warm-grey max-w-md mb-12">
            Deploy a curated fleet of AI-powered virtual influencers — each with a
            distinct persona, audience, and voice — working around the clock to
            amplify your brand across every major platform.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              to="/auth"
              className="group relative overflow-hidden inline-flex items-center justify-center h-13 px-10 bg-charcoal text-white font-inter text-xs uppercase tracking-[0.22em] font-medium shadow-[0_4px_16px_rgba(0,0,0,0.15)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition-shadow duration-500"
            >
              <span
                className="absolute inset-0 bg-gold -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
                style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
                aria-hidden="true"
              />
              <span className="relative z-10">Create Your Fleet</span>
            </Link>
            <a
              href="#platform"
              className="inline-flex items-center justify-center h-13 px-10 border border-charcoal text-charcoal font-inter text-xs uppercase tracking-[0.22em] font-medium hover:bg-charcoal hover:text-white transition-colors duration-500"
            >
              See It In Action
            </a>
          </div>
        </div>

        {/* ── Right column: hero image ── */}
        <div className="lg:col-span-5 relative flex items-end justify-end">

          {/* Vertical editorial label */}
          <p
            className="writing-vertical absolute left-0 bottom-24 font-inter text-[9px] uppercase tracking-[0.3em] text-warm-grey/50 hidden lg:block select-none"
            aria-hidden="true"
          >
            Loque — Creative Studio / Vol. 01
          </p>

          {/* Image container */}
          <div className="relative w-full h-full min-h-[520px] lg:min-h-0 group">
            <div className="absolute inset-0 shadow-[0_8px_40px_rgba(0,0,0,0.10)]">
              <img
                src={heroImg}
                alt="Loque AI Influencer Platform"
                className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-[filter,transform] duration-[1500ms] ease-out group-hover:scale-[1.02] origin-center"
                style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
              />
              {/* Inner border for depth */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ boxShadow: 'inset 0 0 0 1px rgba(26,26,26,0.07)' }}
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="bg-charcoal mt-auto">
        <div className="max-w-[1600px] mx-auto px-8 lg:px-16">
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/10">
            {[
              { value: '500+',  label: 'Brands Served' },
              { value: '12K+',  label: 'Active Influencers' },
              { value: '3.2B',  label: 'Monthly Reach' },
              { value: '24/7',  label: 'Autonomous Posting' },
            ].map(({ value, label }) => (
              <div key={label} className="py-8 px-6 lg:px-10 first:pl-0 last:pr-0">
                <p className="font-playfair text-3xl lg:text-4xl text-alabaster leading-none mb-1">
                  {value}
                </p>
                <p className="font-inter text-[10px] uppercase tracking-[0.22em] text-white/40">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
