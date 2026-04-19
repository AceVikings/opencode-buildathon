import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

const NAV_LINKS = ['Platform', 'Influencers', 'Pricing', 'Studio'] as const

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-700 ${
        scrolled
          ? 'bg-alabaster/95 border-b border-charcoal/10'
          : 'bg-transparent border-b border-transparent'
      }`}
      style={{ backdropFilter: scrolled ? 'blur(12px)' : 'none' }}
    >
      <div className="max-w-[1600px] mx-auto px-8 lg:px-16 h-20 flex items-center justify-between">

        {/* ── Logo ── */}
        <a
          href="#"
          className="font-playfair text-2xl tracking-[0.18em] uppercase text-charcoal hover:text-gold transition-colors duration-500"
        >
          Loque
        </a>

        {/* ── Desktop links ── */}
        <div className="hidden lg:flex items-center gap-12">
          {NAV_LINKS.map(link => (
            <a
              key={link}
              href={`#${link.toLowerCase()}`}
              className="font-inter text-[11px] uppercase tracking-[0.22em] text-charcoal hover:text-gold transition-colors duration-500"
            >
              {link}
            </a>
          ))}
        </div>

        {/* ── Desktop CTA ── */}
        <Link
          to="/auth"
          className="hidden lg:inline-flex items-center gap-3 group relative overflow-hidden h-10 px-7 bg-charcoal text-white font-inter text-[10px] uppercase tracking-[0.22em] font-medium shadow-[0_4px_16px_rgba(0,0,0,0.15)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition-shadow duration-500"
        >
          <span
            className="absolute inset-0 bg-gold -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
            style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
            aria-hidden="true"
          />
          <span className="relative z-10">Get Started</span>
        </Link>

        {/* ── Mobile toggle ── */}
        <button
          className="lg:hidden font-inter text-[10px] uppercase tracking-[0.22em] text-charcoal hover:text-gold transition-colors duration-300"
          onClick={() => setMenuOpen(o => !o)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        >
          {menuOpen ? 'Close' : 'Menu'}
        </button>
      </div>

      {/* ── Mobile drawer ── */}
      {menuOpen && (
        <div className="lg:hidden bg-alabaster border-t border-charcoal/10 px-8 py-10 flex flex-col gap-8">
          {NAV_LINKS.map(link => (
            <a
              key={link}
              href={`#${link.toLowerCase()}`}
              className="font-inter text-[11px] uppercase tracking-[0.22em] text-charcoal hover:text-gold transition-colors duration-500"
              onClick={() => setMenuOpen(false)}
            >
              {link}
            </a>
          ))}
          <Link
            to="/auth"
            className="inline-flex items-center justify-center group relative overflow-hidden h-11 px-8 bg-charcoal text-white font-inter text-[10px] uppercase tracking-[0.22em] font-medium mt-2"
            onClick={() => setMenuOpen(false)}
          >
            <span
              className="absolute inset-0 bg-gold -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
              aria-hidden="true"
            />
            <span className="relative z-10">Get Started</span>
          </Link>
        </div>
      )}
    </nav>
  )
}
