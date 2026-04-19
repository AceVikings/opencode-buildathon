import { Star } from 'lucide-react'

type Testimonial = {
  quote: string
  author: string
  title: string
  company: string
  initials: string
  gradient: string
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'Loque transformed our social strategy entirely. Our three virtual influencers now reach more people in a single week than our entire marketing team achieved in a full year.',
    author: 'Alexandra Chen',
    title: 'Chief Marketing Officer',
    company: 'Maison Lumière',
    initials: 'AC',
    gradient: 'linear-gradient(135deg, #fda4af 0%, #9f1239 100%)',
  },
  {
    quote:
      'The brand consistency is remarkable. Every post feels like it was crafted by someone who has lived and breathed our brand for years. The authenticity is genuinely uncanny.',
    author: 'Marcus Webb',
    title: 'Head of Digital',
    company: 'Atelier Noir',
    initials: 'MW',
    gradient: 'linear-gradient(135deg, #a5f3fc 0%, #0369a1 100%)',
  },
  {
    quote:
      'We launched during Paris Fashion Week with six Loque influencers. The campaign generated more press mentions than our actual runway show. The ROI was extraordinary.',
    author: 'Isabelle Fontaine',
    title: 'Brand Director',
    company: 'Côte Collective',
    initials: 'IF',
    gradient: 'linear-gradient(135deg, #d8b4fe 0%, #7c3aed 100%)',
  },
]

function StarRow() {
  return (
    <div className="flex gap-1 group-hover:scale-105 transition-transform duration-500 origin-left">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={12}
          strokeWidth={1.5}
          className="fill-gold text-gold"
        />
      ))}
    </div>
  )
}

export function Testimonials() {
  return (
    <section className="bg-taupe border-t border-charcoal/10 py-24 lg:py-36">
      <div className="max-w-[1600px] mx-auto px-8 lg:px-16">

        {/* ── Header ── */}
        <div className="flex items-center gap-4 mb-8">
          <span className="h-px w-8 bg-charcoal/25" />
          <p className="font-inter text-[10px] uppercase tracking-[0.3em] text-warm-grey">
            Client Stories
          </p>
        </div>
        <h2 className="font-playfair text-5xl lg:text-6xl leading-tight text-charcoal mb-20 lg:mb-24 max-w-2xl">
          Results That{' '}
          <em className="not-italic italic text-gold">Speak</em>
          <br />
          for Themselves.
        </h2>

        {/* ── Testimonial cards ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-charcoal/10">
          {TESTIMONIALS.map(({ quote, author, title, company, initials, gradient }) => (
            <div
              key={author}
              className="group relative bg-taupe pl-8 hover:pl-12 pr-10 py-12 border-l-2 border-charcoal/10 hover:border-gold transition-all duration-500"
            >
              {/* Large decorative quote mark */}
              <span
                className="font-playfair text-[6rem] leading-none text-charcoal/6 absolute -top-2 left-8 select-none group-hover:text-gold/10 transition-colors duration-700"
                aria-hidden="true"
              >
                "
              </span>

              <div className="relative z-10 flex flex-col gap-8">
                <StarRow />

                <blockquote className="font-inter text-sm lg:text-base leading-relaxed text-warm-grey">
                  "{quote}"
                </blockquote>

                {/* Author */}
                <div className="flex items-center gap-4 border-t border-charcoal/10 pt-6">
                  {/* Avatar circle — grayscale to color on hover */}
                  <div
                    className="w-11 h-11 shrink-0 flex items-center justify-center font-playfair text-sm italic text-white grayscale group-hover:grayscale-0 transition-[filter] duration-[1000ms]"
                    style={{ background: gradient }}
                  >
                    {initials}
                  </div>
                  <div>
                    <p className="font-inter text-xs font-medium text-charcoal group-hover:text-gold transition-colors duration-500">
                      {author}
                    </p>
                    <p className="font-inter text-[10px] uppercase tracking-[0.15em] text-warm-grey/60 mt-0.5">
                      {title} · {company}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
