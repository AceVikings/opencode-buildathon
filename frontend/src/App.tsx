import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { AuthPage } from './components/AuthPage'
import { HomePage } from './components/HomePage'
import { WaitlistPage } from './components/WaitlistPage'
import { DashboardPage } from './components/DashboardPage'

const IS_DEV = import.meta.env.DEV

/** Route that requires auth. Redirects to /auth while loading or unauthenticated. */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-alabaster flex items-center justify-center">
        <span className="font-playfair text-2xl tracking-[0.18em] uppercase text-charcoal animate-pulse">
          Loque
        </span>
      </div>
    )
  }

  return user ? <>{children}</> : <Navigate to="/auth" replace />
}

/** Where authenticated users land after sign-in/sign-up. */
const APP_HOME = IS_DEV ? '/dashboard' : '/waitlist'

function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<HomePage />} />
      <Route path="/auth" element={<AuthPage />} />

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

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export { APP_HOME }
export default App
