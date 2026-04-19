import { GridLines } from './GridLines'
import { Nav } from './Nav'
import { Hero } from './Hero'
import { TrustedBy } from './TrustedBy'
import { Features } from './Features'
import { HowItWorks } from './HowItWorks'
import { Showcase } from './Showcase'
import { Testimonials } from './Testimonials'
import { Pricing } from './Pricing'
import { CTASection } from './CTASection'
import { Footer } from './Footer'

export function HomePage() {
  return (
    <>
      {/* Paper grain noise overlay */}
      <div className="noise-overlay" aria-hidden="true" />

      <GridLines />
      <Nav />

      <main>
        <Hero />
        <TrustedBy />
        <Features />
        <HowItWorks />
        <Showcase />
        <Testimonials />
        <Pricing />
        <CTASection />
      </main>

      <Footer />
    </>
  )
}
