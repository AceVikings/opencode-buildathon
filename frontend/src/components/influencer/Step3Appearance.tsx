import { useEffect, useRef, useState } from 'react'
import type { AvatarCandidate, Influencer, VideoGenerateOptions, VideoStatusResponse } from '../../lib/api'
import {
  generateAvatars,
  selectAvatar,
  generateVideo,
  getVideoStatus,
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

// ── Video panel sub-component ─────────────────────────────────────────────────

function VideoPanel({ influencerId }: { influencerId: string }) {
  const [script, setScript] = useState('')
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16')
  const [expressiveness, setExpressiveness] = useState<'high' | 'medium' | 'low'>('medium')
  const [submitting, setSubmitting] = useState(false)
  const [video, setVideo] = useState<VideoStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  useEffect(() => () => stopPolling(), [])

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    if (!script.trim()) return
    setSubmitting(true); setError(null); setVideo(null)
    try {
      const opts: VideoGenerateOptions = {
        script: script.trim(),
        aspectRatio,
        expressiveness,
        motionPrompt: 'natural presenting gestures',
      }
      const { videoId, status } = await generateVideo(influencerId, opts)
      const initial: VideoStatusResponse = { videoId, status: status as VideoStatusResponse['status'], videoUrl: null, thumbnailUrl: null, duration: null, failureMessage: null }
      setVideo(initial)

      // Poll every 8 s
      pollRef.current = setInterval(async () => {
        try {
          const result = await getVideoStatus(influencerId, videoId)
          setVideo(result)
          if (result.status === 'completed' || result.status === 'failed') stopPolling()
        } catch { /* silent */ }
      }, 8_000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start video generation')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="border border-charcoal/10">
      <div className="px-6 py-4 border-b border-charcoal/10">
        <p className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">
          Generate UGC Video
        </p>
      </div>
      <div className="p-6 flex flex-col gap-4">
        {error && (
          <p className="font-inter text-[11px] text-red-600 border border-red-200 bg-red-50 px-4 py-3">{error}</p>
        )}

        <form onSubmit={handleGenerate} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">Script</label>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={3}
              placeholder="Write what the influencer will say…"
              className="border border-charcoal/15 bg-transparent px-4 py-3 font-inter text-sm text-charcoal placeholder-warm-grey/40 resize-none focus:outline-none focus:border-charcoal/40 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">Format</label>
              <div className="flex gap-2">
                {(['9:16', '16:9'] as const).map((r) => (
                  <button key={r} type="button" onClick={() => setAspectRatio(r)}
                    className={`flex-1 font-inter text-[9px] uppercase tracking-[0.15em] py-2 border transition-colors ${aspectRatio === r ? 'bg-charcoal text-white border-charcoal' : 'text-warm-grey border-charcoal/20 hover:border-charcoal/40'}`}>
                    {r === '9:16' ? 'Vertical' : 'Widescreen'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">Energy</label>
              <div className="flex gap-2">
                {(['low', 'medium', 'high'] as const).map((e) => (
                  <button key={e} type="button" onClick={() => setExpressiveness(e)}
                    className={`flex-1 font-inter text-[9px] uppercase tracking-[0.15em] py-2 border transition-colors ${expressiveness === e ? 'bg-charcoal text-white border-charcoal' : 'text-warm-grey border-charcoal/20 hover:border-charcoal/40'}`}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button type="submit" disabled={submitting || !script.trim()}
            className="self-end group relative overflow-hidden inline-flex items-center h-9 px-7 bg-charcoal text-white font-inter text-[9px] uppercase tracking-[0.22em] disabled:opacity-40">
            <span className="absolute inset-0 bg-gold -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
              style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }} aria-hidden="true" />
            <span className="relative z-10">{submitting ? 'Starting…' : 'Generate Video'}</span>
          </button>
        </form>

        {/* Video status / result */}
        {video && (
          <div className="border border-charcoal/10 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 ${video.status === 'completed' ? 'bg-gold' : video.status === 'failed' ? 'bg-red-500' : 'bg-warm-grey/40 animate-pulse'}`} />
              <p className="font-inter text-[10px] uppercase tracking-[0.18em] text-warm-grey">
                {video.status === 'completed' ? 'Ready' : video.status === 'failed' ? 'Failed' : 'Generating…'}
              </p>
              {video.duration && <span className="font-inter text-[10px] text-warm-grey/60 ml-auto">{video.duration.toFixed(1)}s</span>}
            </div>

            {video.status === 'failed' && video.failureMessage && (
              <p className="font-inter text-[11px] text-red-600">{video.failureMessage}</p>
            )}

            {video.status === 'completed' && video.videoUrl && (
              <div className="flex flex-col gap-3">
                <video
                  src={video.videoUrl}
                  poster={video.thumbnailUrl ?? undefined}
                  controls
                  className="w-full max-h-64 object-contain bg-charcoal/5"
                />
                <a href={video.videoUrl} target="_blank" rel="noopener noreferrer"
                  className="font-inter text-[10px] uppercase tracking-[0.18em] text-warm-grey hover:text-charcoal transition-colors">
                  Download MP4 →
                </a>
              </div>
            )}

            {(video.status === 'pending' || video.status === 'processing') && (
              <p className="font-inter text-[11px] text-warm-grey/60">
                HeyGen is rendering — typically takes 1–3 minutes. This updates automatically.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function Step3Appearance({ influencer, onUpdated, onComplete }: Props) {
  const [prompt, setPrompt] = useState(influencer.imagePrompt)
  const [candidates, setCandidates] = useState<AvatarCandidate[]>(influencer.avatarCandidates ?? [])
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(influencer.heygenAvatarId)
  const [generating, setGenerating] = useState(false)
  const [selecting, setSelecting] = useState(false)

  const [xStatus, setXStatus] = useState<XStatus | null>(null)
  const [xLoading, setXLoading] = useState(true)
  const [xDisconnecting, setXDisconnecting] = useState(false)

  const [error, setError] = useState<string | null>(null)

  const isComplete = influencer.status === 'complete' || !!influencer.heygenAvatarId

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

  async function handleGenerate() {
    if (!prompt.trim()) { setError('Enter an appearance description first'); return }
    setGenerating(true); setError(null); setSelectedAvatarId(null)
    try {
      const { candidates: newCandidates, influencer: updated } = await generateAvatars(influencer._id, prompt.trim())
      setCandidates(newCandidates)
      onUpdated(updated)
    } catch (e) { setError(e instanceof Error ? e.message : 'Generation failed') }
    finally { setGenerating(false) }
  }

  async function handleSelect() {
    if (!selectedAvatarId) { setError('Select an avatar first'); return }
    setSelecting(true); setError(null)
    try {
      const { influencer: updated } = await selectAvatar(influencer._id, selectedAvatarId)
      onUpdated(updated)
      onComplete(updated)
    } catch (e) { setError(e instanceof Error ? e.message : 'Select failed') }
    finally { setSelecting(false) }
  }

  async function handleConnectX() {
    setError(null)
    try {
      const { authUrl } = await connectInfluencerX(influencer._id)
      window.location.href = authUrl
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not start X connection') }
  }

  async function handleDisconnectX() {
    setXDisconnecting(true); setError(null)
    try {
      await disconnectInfluencerX(influencer._id)
      setXStatus({ connected: false })
      onUpdated({ ...influencer, xConnectionId: null })
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to disconnect') }
    finally { setXDisconnecting(false) }
  }

  const displayCandidates = candidates.length > 0 ? candidates : []

  return (
    <div className="flex flex-col gap-7">
      <div>
        <p className="font-inter text-[10px] uppercase tracking-[0.28em] text-warm-grey mb-1">Step 3 of 3</p>
        <h2 className="font-playfair text-3xl text-charcoal">Avatar & Content</h2>
        <p className="font-inter text-sm text-warm-grey mt-2">
          Describe your influencer's look — HeyGen will generate four realistic avatars to choose from.
          Once selected, generate UGC videos directly.
        </p>
      </div>

      {error && (
        <p className="font-inter text-[11px] text-red-600 border border-red-200 bg-red-50 px-4 py-3">{error}</p>
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
        <button onClick={handleGenerate} disabled={generating || !prompt.trim()}
          className="self-end group relative overflow-hidden inline-flex items-center h-10 px-8 border border-charcoal text-charcoal font-inter text-[10px] uppercase tracking-[0.22em] disabled:opacity-40 hover:text-white transition-colors duration-300 mt-1">
          <span className="absolute inset-0 bg-charcoal -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
            style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }} aria-hidden="true" />
          <span className="relative z-10">
            {generating ? 'Generating… (up to 2 min)' : displayCandidates.length > 0 ? 'Regenerate' : 'Generate 4 Avatars'}
          </span>
        </button>
      </div>

      {/* ── Generating state ── */}
      {generating && (
        <div className="border border-dashed border-charcoal/15 flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-8 h-px bg-gold" />
          <p className="font-inter text-sm text-warm-grey">HeyGen is creating your avatars…</p>
          <p className="font-inter text-[10px] text-warm-grey/50">Training 4 candidates in parallel. Usually takes 30–90 seconds.</p>
        </div>
      )}

      {/* ── Avatar candidate grid ── */}
      {!generating && displayCandidates.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">
            Select your avatar
          </p>
          <div className="grid grid-cols-2 gap-3">
            {displayCandidates.map((c, i) => (
              <button key={c.avatarId} type="button" onClick={() => setSelectedAvatarId(c.avatarId)}
                className={`relative aspect-square overflow-hidden border-2 transition-all duration-200 bg-taupe/40 ${selectedAvatarId === c.avatarId ? 'border-gold' : 'border-transparent hover:border-charcoal/30'}`}>
                {c.previewImageUrl ? (
                  <img src={c.previewImageUrl} alt={`Avatar ${i + 1}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="font-inter text-[10px] text-warm-grey/50 uppercase tracking-[0.2em]">Preview pending</span>
                  </div>
                )}
                {selectedAvatarId === c.avatarId && (
                  <div className="absolute inset-0 bg-charcoal/10 flex items-center justify-center">
                    <div className="w-6 h-6 bg-gold flex items-center justify-center">
                      <span className="text-white text-xs font-bold">✓</span>
                    </div>
                  </div>
                )}
                {/* Preview video hover */}
                {c.previewVideoUrl && (
                  <a href={c.previewVideoUrl} target="_blank" rel="noopener noreferrer"
                    className="absolute bottom-2 right-2 bg-charcoal/80 text-white font-inter text-[8px] uppercase tracking-[0.15em] px-2 py-1"
                    onClick={(e) => e.stopPropagation()}>
                    Preview ▶
                  </a>
                )}
                <span className="absolute bottom-2 left-2 font-inter text-[9px] uppercase tracking-[0.15em] text-white bg-charcoal/60 px-2 py-0.5">{i + 1}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Existing selected avatar (resume) ── */}
      {!generating && displayCandidates.length === 0 && influencer.selectedImageUrl && (
        <div className="flex flex-col gap-3">
          <p className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">Current avatar</p>
          <div className="w-48 aspect-square border border-charcoal/10 overflow-hidden">
            <img src={influencer.selectedImageUrl} alt={influencer.name} className="w-full h-full object-cover" />
          </div>
          <p className="font-inter text-[11px] text-warm-grey">Regenerate to get new options, or continue.</p>
        </div>
      )}

      {/* ── X account ── */}
      <div className="border border-charcoal/10">
        <div className="px-6 py-4 border-b border-charcoal/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-charcoal" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <p className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">X Account</p>
          </div>
          {xStatus?.connected && (
            <button onClick={handleDisconnectX} disabled={xDisconnecting}
              className="font-inter text-[9px] uppercase tracking-[0.18em] text-warm-grey hover:text-charcoal transition-colors">
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
              <p className="font-inter text-sm text-warm-grey">Connect an X account to post as this influencer.</p>
              <button onClick={handleConnectX}
                className="group relative overflow-hidden flex-shrink-0 inline-flex items-center gap-2 h-9 px-5 bg-charcoal text-white font-inter text-[9px] uppercase tracking-[0.18em]">
                <span className="absolute inset-0 bg-gold -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
                  style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }} aria-hidden="true" />
                <svg viewBox="0 0 24 24" className="relative z-10 w-3.5 h-3.5 fill-current" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                <span className="relative z-10">Connect X</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Video generation (shown once avatar is selected) ── */}
      {isComplete && <VideoPanel influencerId={influencer._id} />}

      {/* ── Complete ── */}
      <div className="flex items-center justify-between pt-2">
        <p className="font-inter text-[11px] text-warm-grey/60">
          {selectedAvatarId
            ? 'Avatar selected — ready to complete.'
            : influencer.heygenAvatarId
            ? 'Using existing avatar.'
            : 'Generate and select an avatar to finish.'}
        </p>
        <button onClick={handleSelect} disabled={selecting || (!selectedAvatarId && !influencer.heygenAvatarId)}
          className="group relative overflow-hidden inline-flex items-center h-10 px-8 bg-charcoal text-white font-inter text-[10px] uppercase tracking-[0.22em] disabled:opacity-40">
          <span className="absolute inset-0 bg-gold -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
            style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }} aria-hidden="true" />
          <span className="relative z-10">{selecting ? 'Saving…' : isComplete ? 'Update' : 'Complete Influencer'}</span>
        </button>
      </div>
    </div>
  )
}
