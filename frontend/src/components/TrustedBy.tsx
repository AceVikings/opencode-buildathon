const BRANDS = [
  'Maison Lumière',
  'Atelier Noir',
  'Côte Collective',
  'Studio Blanc',
  'Verd & Co.',
  'Meridian House',
  'Sable & Stone',
  'Olme Collective',
  'Arc Maison',
  'Lumino Studio',
]

export function TrustedBy() {
  // Duplicate for seamless marquee loop
  const doubled = [...BRANDS, ...BRANDS]

  return (
    <section className="bg-taupe border-t border-charcoal/10 py-14 overflow-hidden">
      <div className="max-w-[1600px] mx-auto px-8 lg:px-16 mb-10">
        <p className="font-inter text-[10px] uppercase tracking-[0.3em] text-warm-grey/60 text-center">
          Trusted by the world's most ambitious brands
        </p>
      </div>

      {/* Marquee */}
      <div className="relative flex overflow-hidden" aria-hidden="true">
        <div className="marquee-track flex shrink-0 gap-16 items-center">
          {doubled.map((brand, i) => (
            <span
              key={i}
              className="font-playfair text-xl italic text-charcoal/30 whitespace-nowrap select-none"
            >
              {brand}
            </span>
          ))}
        </div>
        {/* Gradient fade edges */}
        <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-taupe to-transparent pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-taupe to-transparent pointer-events-none" />
      </div>
    </section>
  )
}
