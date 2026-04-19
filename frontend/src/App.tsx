import { GridLines } from './components/GridLines'
import { Nav } from './components/Nav'
import { Hero } from './components/Hero'
import { TrustedBy } from './components/TrustedBy'
import { Features } from './components/Features'
import { HowItWorks } from './components/HowItWorks'
import { Showcase } from './components/Showcase'
import { Testimonials } from './components/Testimonials'
import { Pricing } from './components/Pricing'
import { CTASection } from './components/CTASection'
import { Footer } from './components/Footer'

function App() {
  return (
    <>
      {/* Paper grain noise overlay — fixed, z-index 9999, pointer-events none */}
      <div className="noise-overlay" aria-hidden="true" />

      {/* Architectural editorial grid lines */}
      <GridLines />

      {/* Navigation */}
      <Nav />

      {/* Page sections */}
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

export default App
