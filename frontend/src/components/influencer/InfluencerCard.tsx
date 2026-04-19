import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Influencer } from '../../lib/api'
import { deleteInfluencer } from '../../lib/api'

const STATUS_LABELS: Record<Influencer['status'], string> = {
  draft: 'Draft',
  persona_done: 'Persona set',
  brand_done: 'Brand ready',
  image_generated: 'Image pending',
  complete: 'Complete',
}

const STATUS_COLOR: Record<Influencer['status'], string> = {
  draft: 'bg-charcoal/20',
  persona_done: 'bg-warm-grey/40',
  brand_done: 'bg-gold/60',
  image_generated: 'bg-gold/80',
  complete: 'bg-gold',
}

interface Props {
  influencer: Influencer
  onEdit: (inf: Influencer) => void
  onDeleted: (id: string) => void
}

export function InfluencerCard({ influencer, onEdit, onDeleted }: Props) {
  const isComplete = influencer.status === 'complete'
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteInfluencer(influencer._id)
      onDeleted(influencer._id)
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="group border border-charcoal/10 bg-alabaster hover:border-charcoal/30 transition-colors duration-300 flex flex-col">
      {/* Portrait / placeholder */}
      <div className="aspect-square bg-taupe/60 relative overflow-hidden">
        {influencer.selectedImageUrl ? (
          <img
            src={influencer.selectedImageUrl}
            alt={influencer.name}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3">
            <div className="w-6 h-px bg-charcoal/20" />
            <span className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey/50">
              No portrait
            </span>
          </div>
        )}

        {/* Status badge */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 flex-shrink-0 ${STATUS_COLOR[influencer.status]}`} />
          <span className="font-inter text-[9px] uppercase tracking-[0.18em] text-charcoal bg-alabaster/90 px-2 py-0.5">
            {STATUS_LABELS[influencer.status]}
          </span>
        </div>

        {/* X link badge */}
        {influencer.xConnectionId && (
          <div className="absolute top-3 right-3 bg-charcoal px-2 py-1">
            <svg viewBox="0 0 24 24" className="w-3 h-3 fill-white" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-5 flex flex-col gap-2 flex-1">
        <div className="min-w-0">
          <p className="font-playfair text-lg text-charcoal leading-tight truncate">{influencer.name}</p>
          {influencer.xConnectionId && (
            <p className="font-inter text-[10px] text-warm-grey mt-0.5">X connected</p>
          )}
        </div>

        {influencer.niche && (
          <p className="font-inter text-[11px] text-warm-grey/80 line-clamp-1">{influencer.niche}</p>
        )}

        {influencer.goal && (
          <p className="font-inter text-[11px] text-warm-grey italic line-clamp-2 mt-auto">
            Goal: {influencer.goal}
          </p>
        )}

        {/* Platforms */}
        {influencer.platforms.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {influencer.platforms.map((p) => (
              <span
                key={p}
                className="font-inter text-[8px] uppercase tracking-[0.15em] text-warm-grey border border-charcoal/15 px-2 py-0.5"
              >
                {p}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="border-t border-charcoal/10 px-5 py-3 flex items-center justify-between gap-3">
        <button
          onClick={() => isComplete ? navigate(`/influencer/${influencer._id}`) : onEdit(influencer)}
          className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey hover:text-charcoal transition-colors duration-200"
        >
          {isComplete ? 'Open Dashboard →' : 'Continue →'}
        </button>

        {/* Delete — two-step confirm */}
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="font-inter text-[10px] uppercase tracking-[0.18em] text-warm-grey/40 hover:text-red-500 transition-colors duration-200"
          >
            Delete
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="font-inter text-[9px] uppercase tracking-[0.18em] text-red-600 hover:text-red-800 transition-colors"
            >
              {deleting ? '…' : 'Confirm'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="font-inter text-[9px] uppercase tracking-[0.18em] text-warm-grey hover:text-charcoal transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
