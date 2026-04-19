import { auth } from './firebase'

export const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

export async function getIdToken(): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated')
  return user.getIdToken()
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getIdToken()
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
}

// ── Influencer types ─────────────────────────────────────────────────────────

export interface BrandSource {
  _id: string
  type: 'text' | 'url' | 'pdf'
  label: string
  content: string
  gcsPath?: string | null
  createdAt: string
}

export type InfluencerStatus =
  | 'draft'
  | 'persona_done'
  | 'brand_done'
  | 'image_generated'
  | 'complete'

export interface AvatarCandidate {
  avatarId: string
  groupId: string | null
  previewImageUrl: string | null
  previewVideoUrl: string | null
}

export interface Influencer {
  _id: string
  uid: string
  name: string
  bio: string
  niche: string
  platforms: string[]
  goal: string
  brandSources: BrandSource[]
  brandBrief: string
  imagePrompt: string
  avatarCandidates: AvatarCandidate[]
  heygenAvatarId: string | null
  selectedImageUrl: string | null
  selectedPreviewVideoUrl: string | null
  xConnectionId: string | null
  status: InfluencerStatus
  createdAt: string
  updatedAt: string
}

// ── Influencer API calls ─────────────────────────────────────────────────────

export async function listInfluencers(): Promise<Influencer[]> {
  const res = await apiFetch('/influencers')
  if (!res.ok) throw new Error('Failed to fetch influencers')
  return res.json()
}

export async function createInfluencer(body: {
  name: string
  bio?: string
  niche?: string
  platforms?: string[]
  goal?: string
}): Promise<Influencer> {
  const res = await apiFetch('/influencers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Failed to create influencer')
  }
  return res.json()
}

export async function updatePersona(
  id: string,
  body: Partial<Pick<Influencer, 'name' | 'bio' | 'niche' | 'platforms' | 'goal'>>
): Promise<Influencer> {
  const res = await apiFetch(`/influencers/${id}/persona`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Failed to update persona')
  return res.json()
}

export async function addBrandText(id: string, text: string, label?: string): Promise<{ sources: BrandSource[] }> {
  const res = await apiFetch(`/influencers/${id}/brand/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, label }),
  })
  if (!res.ok) throw new Error('Failed to add text')
  return res.json()
}

export async function addBrandUrl(id: string, url: string): Promise<{ sources: BrandSource[] }> {
  const res = await apiFetch(`/influencers/${id}/brand/url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) throw new Error('Failed to add URL')
  return res.json()
}

export async function addBrandPdf(id: string, file: File): Promise<{ sources: BrandSource[] }> {
  const form = new FormData()
  form.append('pdf', file)
  const res = await apiFetch(`/influencers/${id}/brand/pdf`, { method: 'POST', body: form })
  if (!res.ok) throw new Error('Failed to upload PDF')
  return res.json()
}

export async function deleteBrandSource(id: string, srcId: string): Promise<{ sources: BrandSource[] }> {
  const res = await apiFetch(`/influencers/${id}/brand/${srcId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete source')
  return res.json()
}

export async function analyseBrand(id: string): Promise<{
  brandBrief: string
  refinedBio: string
  imagePrompt: string
  influencer: Influencer
}> {
  const res = await apiFetch(`/influencers/${id}/brand/analyse`, { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Failed to analyse brand')
  }
  return res.json()
}

// ── HeyGen Avatar generation ──────────────────────────────────────────────────

export async function generateAvatars(id: string, prompt?: string): Promise<{
  candidates: AvatarCandidate[]
  influencer: Influencer
}> {
  const res = await apiFetch(`/influencers/${id}/avatars/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prompt ? { prompt } : {}),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Failed to generate avatars')
  }
  return res.json()
}

export async function selectAvatar(id: string, avatarId: string): Promise<{
  influencer: Influencer
}> {
  const res = await apiFetch(`/influencers/${id}/avatars/select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avatarId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Failed to select avatar')
  }
  return res.json()
}

// ── HeyGen Video / UGC generation ─────────────────────────────────────────────

export interface VideoGenerateOptions {
  script: string
  voiceId?: string
  title?: string
  aspectRatio?: '16:9' | '9:16'
  resolution?: '1080p' | '720p' | '4k'
  motionPrompt?: string
  expressiveness?: 'high' | 'medium' | 'low'
}

export interface VideoStatusResponse {
  videoId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  videoUrl: string | null
  thumbnailUrl: string | null
  duration: number | null
  failureMessage: string | null
}

export async function generateVideo(id: string, opts: VideoGenerateOptions): Promise<{
  videoId: string
  status: string
}> {
  const res = await apiFetch(`/influencers/${id}/videos/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Failed to start video generation')
  }
  return res.json()
}

export async function getVideoStatus(id: string, videoId: string): Promise<VideoStatusResponse> {
  const res = await apiFetch(`/influencers/${id}/videos/${videoId}`)
  if (!res.ok) throw new Error('Failed to fetch video status')
  return res.json()
}

// ── X — per-influencer ───────────────────────────────────────────────────────

/** Initiates OAuth for the given influencer. Returns { authUrl } to redirect the user to. */
export async function connectInfluencerX(influencerId: string): Promise<{ authUrl: string }> {
  const res = await apiFetch(`/twitter/connect/${influencerId}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Failed to start X connection')
  }
  return res.json()
}

export async function getInfluencerXStatus(id: string): Promise<{
  connected: boolean
  xUserId?: string
  xUsername?: string
  xName?: string
}> {
  const res = await apiFetch(`/influencers/${id}/x/status`)
  if (!res.ok) return { connected: false }
  return res.json()
}

export async function postInfluencerTweet(id: string, text: string): Promise<{
  tweet: { id: string; text: string }
}> {
  const res = await apiFetch(`/influencers/${id}/x/post`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Failed to post tweet')
  }
  return res.json()
}

export async function disconnectInfluencerX(id: string): Promise<{ disconnected: boolean }> {
  const res = await apiFetch(`/influencers/${id}/x/disconnect`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to disconnect X account')
  return res.json()
}

export async function deleteInfluencer(id: string): Promise<{ deleted: boolean }> {
  const res = await apiFetch(`/influencers/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete influencer')
  return res.json()
}

// ── Post analytics ───────────────────────────────────────────────────────────

export interface PostMetrics {
  impressions: number | null
  engagements: number | null
  likes: number | null
  retweets: number | null
  replies: number | null
  quote_tweets: number | null
  bookmarks: number | null
  url_clicks: number | null
  user_profile_clicks: number | null
  detail_expands: number | null
  follows: number | null
}

export interface XPostRecord {
  tweetId: string
  text: string
  postedAt: string
  metricsUpdatedAt: string | null
  metrics: PostMetrics
}

export interface AnalyticsResponse {
  postCount: number
  metricsUpdatedAt: string | null
  totals: PostMetrics
  posts: XPostRecord[]
}

export async function getPostAnalytics(influencerId: string): Promise<AnalyticsResponse> {
  const res = await apiFetch(`/influencers/${influencerId}/x/analytics`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Failed to fetch analytics')
  }
  return res.json()
}

export async function getInfluencerPosts(influencerId: string): Promise<{ posts: XPostRecord[] }> {
  const res = await apiFetch(`/influencers/${influencerId}/x/posts`)
  if (!res.ok) throw new Error('Failed to fetch posts')
  return res.json()
}

// ── X Trends ─────────────────────────────────────────────────────────────────

export interface Trend {
  name: string
  postCount: number | null
  category: string | null
  trendingSince: string | null
}

export interface TrendsResponse {
  type: 'personalized' | 'woeid'
  woeid?: number
  trends: Trend[]
}

export async function getTrends(opts?: {
  influencerId?: string
  woeid?: number
}): Promise<TrendsResponse> {
  const params = new URLSearchParams()
  if (opts?.influencerId) params.set('influencerId', opts.influencerId)
  if (opts?.woeid) params.set('woeid', String(opts.woeid))
  const qs = params.toString()
  const res = await apiFetch(`/twitter/trends${qs ? `?${qs}` : ''}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Failed to fetch trends')
  }
  return res.json()
}
