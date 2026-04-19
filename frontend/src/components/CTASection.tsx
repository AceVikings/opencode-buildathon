import { useState } from 'react'

export function CTASection() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (email.trim()) {
      setSubmitted(true)
    }
  }

  return (
    <section className="bg-charcoal border-t border-white/10 py-24 lg:py-36 overflow-hidden">
      <div className="max-w-[1600px] mx-auto px-8 lg:px-16 relative">

        {/* ── Decorative large background text ── */}
        <p
          className="font-playfair text-[8rem] lg:text-[14rem] leading-none text-white/[0.03] absolute -top-8 -left-4 select-none pointer-events-none whitespace-nowrap"
          aria-hidden="true"
        >
          Loque
        </p>

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">

          {/* ── Left: headline ── */}
          <div className="lg:col-span-6">
            <div className="flex items-center gap-4 mb-8">
              <span className="h-px w-8 bg-white/20" />
              <p className="font-inter text-[10px] uppercase tracking-[0.3em] text-white/40">
                Get Early Access
              </p>
            </div>
            <h2 className="font-playfair text-5xl lg:text-6xl leading-tight text-alabaster mb-6">
              Your Brand's
              <br />
              <em className="not-italic italic text-gold">Moment</em>
              <br />
              Is Now.
            </h2>
            <p className="font-inter text-base leading-relaxed text-white/50 max-w-sm">
              Join the waitlist and receive priority access to Loque — along with
              a complimentary brand strategy session with our creative studio.
            </p>
          </div>

          {/* ── Right: email form ── */}
          <div className="lg:col-span-5 lg:col-start-8">
            {submitted ? (
              <div className="border-l-2 border-gold pl-8 py-4">
                <p className="font-playfair text-2xl italic text-alabaster mb-2">
                  Welcome to Loque.
                </p>
                <p className="font-inter text-sm text-white/50">
                  You're on the list. We'll be in touch with your priority access details
                  and a personal invitation to our studio briefing.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="waitlist-email"
                    className="font-inter text-[10px] uppercase tracking-[0.25em] text-white/40"
                  >
                    Your Email
                  </label>
                  <input
                    id="waitlist-email"
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="hello@yourbrand.com"
                    className="w-full h-12 bg-transparent border-b border-white/20 focus:border-gold focus:outline-none font-inter text-sm text-white placeholder:font-playfair placeholder:italic placeholder:text-white/20 transition-colors duration-500"
                    style={{ borderRadius: 0 }}
                  />
                </div>

                <button
                  type="submit"
                  className="group relative overflow-hidden inline-flex items-center justify-center h-12 px-10 bg-gold text-charcoal font-inter text-[10px] uppercase tracking-[0.22em] font-medium hover:shadow-[0_8px_32px_rgba(212,175,55,0.4)] transition-shadow duration-500"
                >
                  Join the Waitlist
                </button>

                <p className="font-inter text-[10px] text-white/25 leading-relaxed">
                  No spam. Unsubscribe anytime. Your information is never shared or sold.
                </p>
              </form>
            )}
          </div>
        </div>

        {/* ── Decorative bottom border ── */}
        <div className="mt-24 pt-12 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-8">
            {['14-Day Free Trial', 'No Credit Card Required', 'Cancel Anytime'].map(item => (
              <span key={item} className="font-inter text-[10px] uppercase tracking-[0.18em] text-white/25">
                {item}
              </span>
            ))}
          </div>
          <p className="font-playfair italic text-xl text-white/15">
            "Influence, perfected."
          </p>
        </div>
      </div>
    </section>
  )
}
