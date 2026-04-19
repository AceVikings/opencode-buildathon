import { useRef, useState } from 'react'
import type { BrandSource, Influencer } from '../../lib/api'
import { addBrandText, addBrandUrl, addBrandPdf, deleteBrandSource, analyseBrand } from '../../lib/api'

interface Props {
  influencer: Influencer
  onUpdated: (inf: Influencer) => void
  onContinue: () => void
}

type Tab = 'text' | 'url' | 'pdf'

export function Step2Brand({ influencer, onUpdated, onContinue }: Props) {
  const [sources, setSources] = useState<BrandSource[]>(influencer.brandSources)
  const [activeTab, setActiveTab] = useState<Tab>('text')

  // Text tab
  const [textInput, setTextInput] = useState('')
  const [textLabel, setTextLabel] = useState('')

  // URL tab
  const [urlInput, setUrlInput] = useState('')

  // PDF tab
  const fileRef = useRef<HTMLInputElement>(null)
  const [pdfName, setPdfName] = useState<string | null>(null)
  const [pdfFile, setPdfFile] = useState<File | null>(null)

  const [adding, setAdding] = useState(false)
  const [analysing, setAnalysing] = useState(false)
  const [brief, setBrief] = useState(influencer.brandBrief)
  const [imagePromptPreview, setImagePromptPreview] = useState(influencer.imagePrompt)
  const [error, setError] = useState<string | null>(null)

  async function handleAddText() {
    if (!textInput.trim()) return
    setAdding(true); setError(null)
    try {
      const res = await addBrandText(influencer._id, textInput.trim(), textLabel.trim() || undefined)
      setSources(res.sources)
      onUpdated({ ...influencer, brandSources: res.sources })
      setTextInput(''); setTextLabel('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setAdding(false) }
  }

  async function handleAddUrl() {
    if (!urlInput.trim()) return
    setAdding(true); setError(null)
    try {
      const res = await addBrandUrl(influencer._id, urlInput.trim())
      setSources(res.sources)
      onUpdated({ ...influencer, brandSources: res.sources })
      setUrlInput('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setAdding(false) }
  }

  async function handleAddPdf() {
    if (!pdfFile) return
    setAdding(true); setError(null)
    try {
      const res = await addBrandPdf(influencer._id, pdfFile)
      setSources(res.sources)
      onUpdated({ ...influencer, brandSources: res.sources })
      setPdfFile(null); setPdfName(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setAdding(false) }
  }

  async function handleDelete(srcId: string) {
    try {
      const res = await deleteBrandSource(influencer._id, srcId)
      setSources(res.sources)
      onUpdated({ ...influencer, brandSources: res.sources })
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to delete') }
  }

  async function handleAnalyse() {
    setAnalysing(true); setError(null)
    try {
      const res = await analyseBrand(influencer._id)
      setBrief(res.brandBrief)
      setImagePromptPreview(res.imagePrompt)
      onUpdated(res.influencer)
    } catch (e) { setError(e instanceof Error ? e.message : 'Analysis failed') }
    finally { setAnalysing(false) }
  }

  const tabClass = (t: Tab) =>
    `font-inter text-[10px] uppercase tracking-[0.2em] px-5 py-2.5 border-b-2 transition-colors duration-200 ${
      activeTab === t
        ? 'border-charcoal text-charcoal'
        : 'border-transparent text-warm-grey hover:text-charcoal'
    }`

  const typeIcon: Record<BrandSource['type'], string> = { text: '¶', url: '⌂', pdf: '⎘' }

  return (
    <div className="flex flex-col gap-7">
      <div>
        <p className="font-inter text-[10px] uppercase tracking-[0.28em] text-warm-grey mb-1">Step 2 of 3</p>
        <h2 className="font-playfair text-3xl text-charcoal">Brand Intelligence</h2>
        <p className="font-inter text-sm text-warm-grey mt-2">
          Add brand materials — the AI will synthesise a brief and sharpen the persona.
        </p>
      </div>

      {error && (
        <p className="font-inter text-[11px] text-red-600 border border-red-200 bg-red-50 px-4 py-3">
          {error}
        </p>
      )}

      {/* Source input tabs */}
      <div className="border border-charcoal/10">
        {/* Tab bar */}
        <div className="flex border-b border-charcoal/10">
          <button className={tabClass('text')} onClick={() => setActiveTab('text')}>Plain text</button>
          <button className={tabClass('url')} onClick={() => setActiveTab('url')}>URL</button>
          <button className={tabClass('pdf')} onClick={() => setActiveTab('pdf')}>PDF upload</button>
        </div>

        <div className="p-6">
          {activeTab === 'text' && (
            <div className="flex flex-col gap-3">
              <input
                type="text"
                value={textLabel}
                onChange={(e) => setTextLabel(e.target.value)}
                placeholder="Label (optional) — e.g. Brand guidelines"
                className="border border-charcoal/15 bg-transparent px-4 py-2.5 font-inter text-sm text-charcoal placeholder-warm-grey/40 focus:outline-none focus:border-charcoal/40 transition-colors"
              />
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Paste brand copy, guidelines, tone-of-voice notes…"
                rows={4}
                className="border border-charcoal/15 bg-transparent px-4 py-3 font-inter text-sm text-charcoal placeholder-warm-grey/40 resize-none focus:outline-none focus:border-charcoal/40 transition-colors"
              />
              <div className="flex justify-end">
                <AddButton loading={adding} onClick={handleAddText} disabled={!textInput.trim()} />
              </div>
            </div>
          )}

          {activeTab === 'url' && (
            <div className="flex flex-col gap-3">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/about"
                className="border border-charcoal/15 bg-transparent px-4 py-2.5 font-inter text-sm text-charcoal placeholder-warm-grey/40 focus:outline-none focus:border-charcoal/40 transition-colors"
              />
              <p className="font-inter text-[11px] text-warm-grey/60">
                The AI agent will fetch and parse the page content.
              </p>
              <div className="flex justify-end">
                <AddButton loading={adding} onClick={handleAddUrl} disabled={!urlInput.trim()} />
              </div>
            </div>
          )}

          {activeTab === 'pdf' && (
            <div className="flex flex-col gap-3">
              <div
                className="border border-dashed border-charcoal/20 p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-charcoal/40 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <div className="w-6 h-px bg-gold" />
                <p className="font-inter text-sm text-warm-grey">
                  {pdfName ?? 'Click to select a PDF (max 20 MB)'}
                </p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  setPdfFile(f); setPdfName(f?.name ?? null)
                }}
              />
              <div className="flex justify-end">
                <AddButton loading={adding} onClick={handleAddPdf} disabled={!pdfFile} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Source list */}
      {sources.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">
            Added sources ({sources.length})
          </p>
          {sources.map((s) => (
            <div
              key={s._id}
              className="flex items-center justify-between px-4 py-3 border border-charcoal/10 bg-taupe/30"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-playfair text-lg text-gold flex-shrink-0">{typeIcon[s.type]}</span>
                <div className="min-w-0">
                  <p className="font-inter text-[12px] text-charcoal truncate">{s.label || s.type}</p>
                  <p className="font-inter text-[10px] text-warm-grey/60 uppercase tracking-[0.15em]">{s.type}</p>
                </div>
              </div>
              <button
                onClick={() => handleDelete(s._id)}
                className="font-inter text-[10px] text-warm-grey hover:text-charcoal transition-colors ml-4 flex-shrink-0"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Brief output */}
      {brief && (
        <div className="border border-gold/30 bg-gold/5 p-6">
          <p className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey mb-3">
            Brand Brief (AI-generated)
          </p>
          <p className="font-inter text-sm text-charcoal whitespace-pre-wrap leading-relaxed">{brief}</p>
          {imagePromptPreview && (
            <>
              <p className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey mt-5 mb-2">
                Suggested appearance prompt
              </p>
              <p className="font-inter text-sm text-charcoal italic">{imagePromptPreview}</p>
            </>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={handleAnalyse}
          disabled={analysing || sources.length === 0}
          className="group relative overflow-hidden inline-flex items-center h-10 px-8 border border-charcoal text-charcoal font-inter text-[10px] uppercase tracking-[0.22em] disabled:opacity-40 hover:text-white transition-colors duration-300"
        >
          <span
            className="absolute inset-0 bg-charcoal -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
            style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
            aria-hidden="true"
          />
          <span className="relative z-10">{analysing ? 'Analysing…' : 'Analyse brand'}</span>
        </button>

        <button
          onClick={onContinue}
          className="group relative overflow-hidden inline-flex items-center h-10 px-8 bg-charcoal text-white font-inter text-[10px] uppercase tracking-[0.22em]"
        >
          <span
            className="absolute inset-0 bg-gold -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
            style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
            aria-hidden="true"
          />
          <span className="relative z-10">Continue</span>
        </button>
      </div>
    </div>
  )
}

function AddButton({
  loading,
  onClick,
  disabled,
}: {
  loading: boolean
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className="font-inter text-[10px] uppercase tracking-[0.22em] px-6 py-2.5 border border-charcoal/30 text-charcoal hover:bg-charcoal hover:text-white transition-colors duration-200 disabled:opacity-40"
    >
      {loading ? 'Adding…' : '+ Add source'}
    </button>
  )
}
