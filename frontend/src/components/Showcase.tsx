/**
 * Showcase — 6 virtual influencer profile cards.
 * Real AI-generated portraits; grayscale by default, full colour on hover
 * with a 1500ms cinematic transition.
 *
 * Roster split:
 *   Lifestyle / consumer  — ARIA (Fashion), NOVA (Wellness), ZARA (Beauty), IRIS (Food)
 *   SaaS / B2B brand rep  — EDEN (Enterprise Tech), LYRA (Creative SaaS)
 */

import ariaImg  from '../assets/influencer-aria.png'
import novaImg  from '../assets/influencer-nova.png'
import zaraImg  from '../assets/influencer-zara.png'
import edenImg  from '../assets/influencer-eden.png'
import lyraImg  from '../assets/influencer-lyra.png'
import irisImg  from '../assets/influencer-iris.png'

type Influencer = {
  name: string
  niche: string
  tag: string          // short category badge
  followers: string
  img: string
  wide?: boolean
}

const INFLUENCERS: Influencer[] = [
  {
    name: 'ARIA',
    niche: 'Fashion & Style',
    tag: 'Consumer',
    followers: '2.4M',
    img: ariaImg,
    wide: true,
  },
  {
    name: 'NOVA',
    niche: 'Wellness & Lifestyle',
    tag: 'Consumer',
    followers: '1.8M',
    img: novaImg,
  },
  {
    name: 'ZARA',
    niche: 'Beauty & Culture',
    tag: 'Consumer',
    followers: '3.1M',
    img: zaraImg,
  },
  {
    name: 'EDEN',
    niche: 'SaaS & Enterprise',
    tag: 'B2B',
    followers: '1.2M',
    img: edenImg,
  },
  {
    name: 'LYRA',
    niche: 'Creative Tools',
    tag: 'SaaS',
    followers: '980K',
    img: lyraImg,
  },
  {
    name: 'IRIS',
    niche: 'Food & Hospitality',
    tag: 'Consumer',
    followers: '2.7M',
    img: irisImg,
    wide: true,
  },
]

function InfluencerCard({ name, niche, tag, followers, img }: Influencer) {
  return (
    <div className="group relative overflow-hidden cursor-pointer shadow-[0_4px_24px_rgba(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.18)] transition-shadow duration-700">
      {/* Aspect ratio container */}
      <div className="aspect-[3/4] relative">

        {/* Portrait image — grayscale default, colour on hover */}
        <img
          src={img}
          alt={`${name} — ${niche} AI influencer`}
          className="absolute inset-0 w-full h-full object-cover object-top grayscale group-hover:grayscale-0 scale-100 group-hover:scale-[1.05] transition-[filter,transform] duration-[1500ms]"
          style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
        />

        {/* Inner border for depth */}
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{ boxShadow: 'inset 0 0 0 1px rgba(26,26,26,0.10)' }}
          aria-hidden="true"
        />

        {/* Dark gradient — bottom two-fifths */}
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-charcoal/85 to-transparent z-10" />

        {/* Top-right: category badge */}
        <div className="absolute top-5 right-5 z-20">
          <span className="font-inter text-[8px] uppercase tracking-[0.22em] text-white/50 group-hover:text-gold/80 bg-charcoal/40 group-hover:bg-charcoal/60 backdrop-blur-sm px-2 py-1 transition-colors duration-700">
            {tag}
          </span>
        </div>

        {/* Vertical niche label */}
        <p
          className="writing-vertical absolute left-4 top-6 font-inter text-[8px] uppercase tracking-[0.25em] text-white/30 z-20 hidden lg:block select-none group-hover:text-white/55 transition-colors duration-700"
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
              From luxury fashion to enterprise SaaS — every persona is
              architectured from the ground up with a unique visual identity,
              distinct voice, and an audience that feels genuinely earned.
              Hover to reveal them in full colour.
            </p>
          </div>
        </div>

        {/* ── Category legend ── */}
        <div className="flex items-center gap-8 mb-10">
          {[
            { label: 'Consumer & Lifestyle', dot: 'bg-gold' },
            { label: 'SaaS & B2B',           dot: 'bg-charcoal/40' },
          ].map(({ label, dot }) => (
            <div key={label} className="flex items-center gap-2.5">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />
              <span className="font-inter text-[10px] uppercase tracking-[0.2em] text-warm-grey/60">
                {label}
              </span>
            </div>
          ))}
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
