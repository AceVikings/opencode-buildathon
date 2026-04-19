import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { AuthPage } from './components/AuthPage'
import { HomePage } from './components/HomePage'

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

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
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

  return user ? <Navigate to="/" replace /> : <>{children}</>
}

function App() {
  return (
    <Routes>
      <Route
        path="/auth"
        element={
          <PublicOnlyRoute>
            <AuthPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
