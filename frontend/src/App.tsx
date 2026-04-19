import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { AuthPage } from './components/AuthPage'
import { HomePage } from './components/HomePage'
import { WaitlistPage } from './components/WaitlistPage'
import { DashboardPage } from './components/DashboardPage'
import { InfluencerDashboard } from './components/influencer/InfluencerDashboard'

const Spinner = () => (
  <div className="min-h-screen bg-alabaster flex items-center justify-center">
    <span className="font-playfair text-2xl tracking-[0.18em] uppercase text-charcoal animate-pulse">
      Loque
    </span>
  </div>
)

/** Route that requires auth. Redirects to /auth while loading or unauthenticated. */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  return user ? <>{children}</> : <Navigate to="/auth" replace />
}

/** Redirect already-authenticated users away from public-only routes (/ and /auth). */
function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  return user ? <Navigate to="/dashboard" replace /> : <>{children}</>
}

/** Where authenticated users land after sign-in/sign-up. */
const APP_HOME = '/dashboard'

function App() {
  return (
    <Routes>
      {/* Public — redirect to dashboard if already signed in */}
      <Route path="/" element={<PublicOnlyRoute><HomePage /></PublicOnlyRoute>} />
      <Route path="/auth" element={<PublicOnlyRoute><AuthPage /></PublicOnlyRoute>} />

      {/* Authenticated */}
      <Route
        path="/waitlist"
        element={
          <ProtectedRoute>
            <WaitlistPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/influencer/:id"
        element={
          <ProtectedRoute>
            <InfluencerDashboard />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export { APP_HOME }
export default App
