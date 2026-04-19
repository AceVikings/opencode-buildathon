import { useEffect, useState } from 'react'
import type { Influencer } from '../../lib/api'
import {
  generateImages,
  selectImage,
  connectInfluencerX,
  getInfluencerXStatus,
  disconnectInfluencerX,
} from '../../lib/api'

interface Props {
  influencer: Influencer
  onUpdated: (inf: Influencer) => void
  onComplete: (inf: Influencer) => void
}

interface XStatus {
  connected: boolean
  xUsername?: string
  xName?: string
}

export function Step3Appearance({ influencer, onUpdated, onComplete }: Props) {
  const [prompt, setPrompt] = useState(influencer.imagePrompt)
  const [candidates, setCandidates] = useState<string[]>([])   // signed URLs from this session
  const [gcsPaths, setGcsPaths] = useState<string[]>([])
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [generating, setGenerating] = useState(false)
  const [selecting, setSelecting] = useState(false)

  const [xStatus, setXStatus] = useState<XStatus | null>(null)
  const [xLoading, setXLoading] = useState(true)
  const [xDisconnecting, setXDisconnecting] = useState(false)

  const [error, setError] = useState<string | null>(null)

  // Fetch X status on mount and after OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connectedInf = params.get('inf')
    if (params.get('x_connected') === 'true' && connectedInf === influencer._id) {
      window.history.replaceState({}, '', window.location.pathname)
    } else if (params.get('x_error')) {
      setError(`X connection failed: ${params.get('x_error')}`)
      window.history.replaceState({}, '', window.location.pathname)
    }
    fetchXStatus()
  }, [influencer._id])

  async function fetchXStatus() {
    setXLoading(true)
    try {
      const s = await getInfluencerXStatus(influencer._id)
      setXStatus(s)
    } catch {
      setXStatus({ connected: false })
    } finally {
      setXLoading(false)
    }
  }

  async function handleConnectX() {
    setError(null)
    try {
      const { authUrl } = await connectInfluencerX(influencer._id)
      window.location.href = authUrl
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start X connection')
    }
  }

  async function handleDisconnectX() {
    setXDisconnecting(true)
    setError(null)
    try {
      await disconnectInfluencerX(influencer._id)
      setXStatus({ connected: false })
      onUpdated({ ...influencer, xConnectionId: null })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disconnect')
    } finally {
      setXDisconnecting(false)
    }
  }

  async function handleGenerate() {
    if (!prompt.trim()) { setError('Enter an appearance description first'); return }
    setGenerating(true); setError(null); setSelectedIdx(null)
    try {
      const res = await generateImages(influencer._id, prompt.trim())
      setCandidates(res.candidates)
      setGcsPaths(res.gcspaths)
      onUpdated({ ...influencer, imagePrompt: prompt, imageCandidates: res.gcspaths, status: 'image_generated' })
    } catch (e) { setError(e instanceof Error ? e.message : 'Generation failed') }
    finally { setGenerating(false) }
  }

  async function handleSelect() {
    if (selectedIdx === null) { setError('Select one of the images first'); return }
    setSelecting(true); setError(null)
    try {
      const res = await selectImage(influencer._id, gcsPaths[selectedIdx])
      onUpdated(res.influencer)
      onComplete(res.influencer)
    } catch (e) { setError(e instanceof Error ? e.message : 'Select failed') }
    finally { setSelecting(false) }
  }

  const hasExistingImage = !!influencer.selectedImageUrl
  const canComplete = selectedIdx !== null || hasExistingImage

  return (
    <div className="flex flex-col gap-7">
      <div>
        <p className="font-inter text-[10px] uppercase tracking-[0.28em] text-warm-grey mb-1">Step 3 of 3</p>
        <h2 className="font-playfair text-3xl text-charcoal">Appearance & X Account</h2>
        <p className="font-inter text-sm text-warm-grey mt-2">
          Describe how your influencer looks, then connect the X account they'll post from.
        </p>
      </div>

      {error && (
        <p className="font-inter text-[11px] text-red-600 border border-red-200 bg-red-50 px-4 py-3">
          {error}
        </p>
      )}

      {/* ── Appearance prompt ── */}
      <div className="flex flex-col gap-1.5">
        <label className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">
          Appearance description
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. A 28-year-old South Asian woman with sleek black hair, minimal editorial make-up, wearing neutral luxury tones…"
          rows={3}
          className="border border-charcoal/15 bg-transparent px-4 py-3 font-inter text-sm text-charcoal placeholder-warm-grey/40 resize-none focus:outline-none focus:border-charcoal/40 transition-colors"
        />
        <button
          onClick={handleGenerate}
          disabled={generating || !prompt.trim()}
          className="self-end group relative overflow-hidden inline-flex items-center h-10 px-8 border border-charcoal text-charcoal font-inter text-[10px] uppercase tracking-[0.22em] disabled:opacity-40 hover:text-white transition-colors duration-300 mt-1"
        >
          <span
            className="absolute inset-0 bg-charcoal -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
            style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
            aria-hidden="true"
          />
          <span className="relative z-10">
            {generating ? 'Generating…' : candidates.length > 0 ? 'Regenerate' : 'Generate 4 images'}
          </span>
        </button>
      </div>

      {/* ── Generating spinner ── */}
      {generating && (
        <div className="border border-dashed border-charcoal/15 flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-8 h-px bg-gold" />
          <p className="font-inter text-sm text-warm-grey">Generating portraits…</p>
          <p className="font-inter text-[10px] text-warm-grey/50">This may take 20–40 seconds</p>
        </div>
      )}

      {/* ── Image candidates grid ── */}
      {!generating && candidates.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">
            Select a portrait
          </p>
          <div className="grid grid-cols-2 gap-3">
            {candidates.map((url, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedIdx(i)}
                className={`relative aspect-square overflow-hidden border-2 transition-all duration-200 ${
                  selectedIdx === i ? 'border-gold' : 'border-transparent hover:border-charcoal/30'
                }`}
              >
                <img src={url} alt={`Candidate ${i + 1}`} className="w-full h-full object-cover" />
                {selectedIdx === i && (
                  <div className="absolute inset-0 bg-charcoal/10 flex items-center justify-center">
                    <div className="w-6 h-6 bg-gold flex items-center justify-center">
                      <span className="text-white text-xs font-bold">✓</span>
                    </div>
                  </div>
                )}
                <span className="absolute bottom-2 left-2 font-inter text-[9px] uppercase tracking-[0.15em] text-white bg-charcoal/60 px-2 py-0.5">
                  {i + 1}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Existing portrait (resume) ── */}
      {!generating && candidates.length === 0 && hasExistingImage && (
        <div className="flex flex-col gap-3">
          <p className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">Current portrait</p>
          <div className="w-48 aspect-square border border-charcoal/10 overflow-hidden">
            <img src={influencer.selectedImageUrl!} alt={influencer.name} className="w-full h-full object-cover" />
          </div>
          <p className="font-inter text-[11px] text-warm-grey">Regenerate to get new options, or continue.</p>
        </div>
      )}

      {/* ── X account section ── */}
      <div className="border border-charcoal/10">
        <div className="px-6 py-4 border-b border-charcoal/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-charcoal" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <p className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">
              X Account
            </p>
          </div>
          {xStatus?.connected && (
            <button
              onClick={handleDisconnectX}
              disabled={xDisconnecting}
              className="font-inter text-[9px] uppercase tracking-[0.18em] text-warm-grey hover:text-charcoal transition-colors"
            >
              {xDisconnecting ? '…' : 'Disconnect'}
            </button>
          )}
        </div>

        <div className="px-6 py-5">
          {xLoading ? (
            <p className="font-inter text-[11px] text-warm-grey animate-pulse">Checking connection…</p>
          ) : xStatus?.connected ? (
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-gold flex-shrink-0" />
              <p className="font-inter text-[12px] text-charcoal">
                @{xStatus.xUsername}
                {xStatus.xName && <span className="text-warm-grey ml-2">({xStatus.xName})</span>}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <p className="font-inter text-sm text-warm-grey">
                Connect an X account so this influencer can post on your behalf.
              </p>
              <button
                onClick={handleConnectX}
                className="group relative overflow-hidden flex-shrink-0 inline-flex items-center gap-2 h-9 px-5 bg-charcoal text-white font-inter text-[9px] uppercase tracking-[0.18em]"
              >
                <span
                  className="absolute inset-0 bg-gold -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
                  style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
                  aria-hidden="true"
                />
                <svg viewBox="0 0 24 24" className="relative z-10 w-3.5 h-3.5 fill-current" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                <span className="relative z-10">Connect X</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Complete ── */}
      <div className="flex items-center justify-between pt-2">
        <p className="font-inter text-[11px] text-warm-grey/60">
          {selectedIdx !== null
            ? 'Portrait selected — ready to complete.'
            : hasExistingImage
            ? 'Using existing portrait.'
            : 'Generate and select a portrait to finish.'}
        </p>
        <button
          onClick={handleSelect}
          disabled={selecting || !canComplete}
          className="group relative overflow-hidden inline-flex items-center h-10 px-8 bg-charcoal text-white font-inter text-[10px] uppercase tracking-[0.22em] disabled:opacity-40"
        >
          <span
            className="absolute inset-0 bg-gold -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
            style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
            aria-hidden="true"
          />
          <span className="relative z-10">{selecting ? 'Saving…' : 'Complete Influencer'}</span>
        </button>
      </div>
    </div>
  )
}
