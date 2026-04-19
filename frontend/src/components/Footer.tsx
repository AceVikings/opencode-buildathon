const FOOTER_LINKS = {
  Platform: ['Virtual Influencers', 'Content Engine', 'Analytics', 'Brand Studio', 'API Access'],
  Company: ['About Loque', 'Studio', 'Careers', 'Press Kit', 'Contact'],
  Resources: ['Case Studies', 'Documentation', 'Blog', 'Changelog', 'Status'],
  Legal: ['Privacy Policy', 'Terms of Service', 'Cookie Policy', 'GDPR', 'Security'],
}

export function Footer() {
  return (
    <footer className="bg-charcoal border-t border-white/10">
      <div className="max-w-[1600px] mx-auto px-8 lg:px-16">

        {/* ── Main footer body ── */}
        <div className="py-20 lg:py-24 grid grid-cols-1 lg:grid-cols-12 gap-16">

          {/* ── Brand column ── */}
          <div className="lg:col-span-4">
            <a
              href="#"
              className="font-playfair text-3xl tracking-[0.18em] uppercase text-alabaster hover:text-gold transition-colors duration-500 inline-block mb-6"
            >
              Loque
            </a>
            <p className="font-inter text-sm leading-relaxed text-white/40 max-w-xs mb-8">
              The luxury AI influencer platform for brands that refuse to
              compromise on presence, authenticity, or scale.
            </p>

            {/* Social links (text-based, no icons) */}
            <div className="flex gap-6">
              {['Instagram', 'LinkedIn', 'X'].map(social => (
                <a
                  key={social}
                  href="#"
                  className="font-inter text-[10px] uppercase tracking-[0.22em] text-white/25 hover:text-gold transition-colors duration-500"
                >
                  {social}
                </a>
              ))}
            </div>
          </div>

          {/* ── Link columns ── */}
          <div className="lg:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-10 lg:gap-8">
            {Object.entries(FOOTER_LINKS).map(([category, links]) => (
              <div key={category}>
                <p className="font-inter text-[10px] uppercase tracking-[0.28em] text-white/25 mb-6">
                  {category}
                </p>
                <ul className="flex flex-col gap-4">
                  {links.map(link => (
                    <li key={link}>
                      <a
                        href="#"
                        className="font-inter text-sm text-white/45 hover:text-gold transition-colors duration-500"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* ── Bottom bar ── */}
        <div className="border-t border-white/10 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="font-inter text-[10px] text-white/20">
            © 2026 Loque Inc. All rights reserved. Registered in Delaware, USA.
          </p>
          <div className="flex items-center gap-3">
            <span className="h-px w-6 bg-gold/40 inline-block" />
            <p className="font-playfair italic text-sm text-white/20">
              Influence, architected.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
