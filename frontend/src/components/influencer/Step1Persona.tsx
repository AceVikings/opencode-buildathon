import { useState } from 'react'
import type { Influencer } from '../../lib/api'
import { createInfluencer, updatePersona } from '../../lib/api'

const PLATFORMS = ['X', 'Instagram', 'TikTok', 'YouTube', 'LinkedIn', 'Threads']

interface Props {
  influencer: Influencer | null
  onSaved: (inf: Influencer) => void
}

export function Step1Persona({ influencer, onSaved }: Props) {
  const [name, setName] = useState(influencer?.name ?? '')
  const [bio, setBio] = useState(influencer?.bio ?? '')
  const [niche, setNiche] = useState(influencer?.niche ?? '')
  const [goal, setGoal] = useState(influencer?.goal ?? '')
  const [platforms, setPlatforms] = useState<string[]>(influencer?.platforms ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function togglePlatform(p: string) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    )
  }

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError(null)
    try {
      let saved: Influencer
      if (influencer) {
        saved = await updatePersona(influencer._id, { name, bio, niche, platforms, goal })
      } else {
        saved = await createInfluencer({ name, bio, niche, platforms, goal })
      }
      onSaved(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <div>
        <p className="font-inter text-[10px] uppercase tracking-[0.28em] text-warm-grey mb-1">Step 1 of 3</p>
        <h2 className="font-playfair text-3xl text-charcoal">Define the Persona</h2>
        <p className="font-inter text-sm text-warm-grey mt-2">
          Give your AI influencer an identity. You can refine this at any time.
        </p>
      </div>

      {error && (
        <p className="font-inter text-[11px] text-red-600 border border-red-200 bg-red-50 px-4 py-3">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">
            Name <span className="text-gold">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Aria Voss"
            className="border border-charcoal/15 bg-transparent px-4 py-2.5 font-inter text-sm text-charcoal placeholder-warm-grey/40 focus:outline-none focus:border-charcoal/40 transition-colors"
          />
        </div>

        {/* Niche */}
        <div className="flex flex-col gap-1.5">
          <label className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">
            Niche
          </label>
          <input
            type="text"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            placeholder="e.g. Luxury fashion & lifestyle"
            className="border border-charcoal/15 bg-transparent px-4 py-2.5 font-inter text-sm text-charcoal placeholder-warm-grey/40 focus:outline-none focus:border-charcoal/40 transition-colors"
          />
        </div>

        {/* Goal — spans full width */}
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">
            Current Goal
          </label>
          <input
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. Drive Q3 product launch awareness"
            className="border border-charcoal/15 bg-transparent px-4 py-2.5 font-inter text-sm text-charcoal placeholder-warm-grey/40 focus:outline-none focus:border-charcoal/40 transition-colors"
          />
        </div>
      </div>

      {/* Bio */}
      <div className="flex flex-col gap-1.5">
        <label className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">
          Bio
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="A short description of this influencer's voice and personality…"
          rows={3}
          className="border border-charcoal/15 bg-transparent px-4 py-3 font-inter text-sm text-charcoal placeholder-warm-grey/40 resize-none focus:outline-none focus:border-charcoal/40 transition-colors"
        />
      </div>

      {/* Platforms */}
      <div className="flex flex-col gap-2">
        <label className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">
          Platforms
        </label>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => {
            const active = platforms.includes(p)
            return (
              <button
                key={p}
                type="button"
                onClick={() => togglePlatform(p)}
                className={`font-inter text-[10px] uppercase tracking-[0.18em] px-4 py-2 border transition-colors duration-200 ${
                  active
                    ? 'bg-charcoal text-white border-charcoal'
                    : 'bg-transparent text-warm-grey border-charcoal/20 hover:border-charcoal/50'
                }`}
              >
                {p}
              </button>
            )
          })}
        </div>
      </div>

      {/* Action */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="group relative overflow-hidden inline-flex items-center h-10 px-8 bg-charcoal text-white font-inter text-[10px] uppercase tracking-[0.22em] disabled:opacity-50"
        >
          <span
            className="absolute inset-0 bg-gold -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
            style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
            aria-hidden="true"
          />
          <span className="relative z-10">{saving ? 'Saving…' : 'Save & Continue'}</span>
        </button>
      </div>
    </div>
  )
}
