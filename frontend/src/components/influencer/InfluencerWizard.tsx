import { useEffect, useRef, useState } from 'react'
import type { Influencer } from '../../lib/api'
import { Step1Persona } from './Step1Persona'
import { Step2Brand } from './Step2Brand'
import { Step3Appearance } from './Step3Appearance'
import { InfluencerAgentPanel } from './InfluencerAgentPanel'

export type WizardStep = 1 | 2 | 3 | 4

interface Props {
  /** null = create new; pass existing draft to resume */
  initialInfluencer?: Influencer | null
  onClose: () => void
  onComplete: (inf: Influencer) => void
}

function stepFromStatus(inf: Influencer | null | undefined): WizardStep {
  if (!inf) return 1
  switch (inf.status) {
    case 'draft':
    case 'persona_done':
      return 2
    case 'brand_done':
    case 'image_generated':
      return 3
    case 'complete':
      return 3
    default:
      return 1
  }
}

const STEP_LABELS = ['Persona', 'Brand', 'Appearance', 'Agents']

export function InfluencerWizard({ initialInfluencer, onClose, onComplete }: Props) {
  const [influencer, setInfluencer] = useState<Influencer | null>(initialInfluencer ?? null)
  const [step, setStep] = useState<WizardStep>(stepFromStatus(initialInfluencer))
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll to top of modal content on step change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step])

  function handleStep1Saved(inf: Influencer) {
    setInfluencer(inf)
    setStep(2)
  }

  function handleStep2Updated(inf: Influencer) {
    setInfluencer(inf)
  }

  function handleStep3Updated(inf: Influencer) {
    setInfluencer(inf)
  }

  function handleComplete(inf: Influencer) {
    setInfluencer(inf)
    onComplete(inf)
  }

  // Block backdrop click when analysing / generating (handled by step components)
  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ backgroundColor: 'rgba(26,26,26,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={handleBackdropClick}
    >
      <div
        className="relative bg-alabaster w-full sm:max-w-2xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between gap-4 px-6 sm:px-8 py-4 sm:py-5 border-b border-charcoal/10">
          <div className="flex items-center gap-4 min-w-0">
            <span className="font-playfair text-base sm:text-lg tracking-[0.12em] uppercase text-charcoal truncate">
              {influencer ? influencer.name : 'New Influencer'}
            </span>

            {/* Step indicator */}
            <div className="hidden sm:flex items-center gap-0 flex-shrink-0">
              {STEP_LABELS.map((label, i) => {
                const s = (i + 1) as WizardStep
                const done = step > s
                const active = step === s
                return (
                  <div key={label} className="flex items-center">
                    <button
                      onClick={() => {
                        const isComplete = influencer?.status === 'complete'
                        if (s < step || (s <= 3 && influencer) || (s === 4 && isComplete)) setStep(s)
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1 font-inter text-[9px] uppercase tracking-[0.2em] transition-colors ${
                        active
                          ? 'text-charcoal'
                          : done
                          ? 'text-gold cursor-pointer'
                          : 'text-warm-grey/40'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 flex items-center justify-center text-[9px] border ${
                          active
                            ? 'bg-charcoal text-white border-charcoal'
                            : done
                            ? 'bg-gold text-white border-gold'
                            : 'border-charcoal/20 text-warm-grey/40'
                        }`}
                      >
                        {done ? '✓' : s}
                      </span>
                      {label}
                    </button>
                    {i < STEP_LABELS.length - 1 && (
                      <span className="w-6 h-px bg-charcoal/15" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex-shrink-0 font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey hover:text-charcoal transition-colors whitespace-nowrap"
          >
            {influencer ? 'Save draft' : 'Cancel'}
          </button>
        </div>

        {/* Step content — scrollable */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-8">
          {step === 1 && (
            <Step1Persona influencer={influencer} onSaved={handleStep1Saved} />
          )}
          {step === 2 && influencer && (
            <Step2Brand
              influencer={influencer}
              onUpdated={handleStep2Updated}
              onContinue={() => setStep(3)}
            />
          )}
          {step === 3 && influencer && (
            <Step3Appearance
              influencer={influencer}
              onUpdated={handleStep3Updated}
              onComplete={handleComplete}
            />
          )}
          {step === 4 && influencer && (
            <InfluencerAgentPanel
              influencerId={influencer._id}
              influencerName={influencer.name}
              hasXConnection={!!influencer.xConnectionId}
            />
          )}
        </div>

        {/* Mobile step dots */}
        <div className="sm:hidden flex justify-center gap-2 pb-4 flex-shrink-0">
          {([1, 2, 3, 4] as WizardStep[]).map((s) => (
            <div
              key={s}
              className={`w-1.5 h-1.5 transition-colors ${step === s ? 'bg-charcoal' : step > s ? 'bg-gold' : 'bg-charcoal/20'}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
