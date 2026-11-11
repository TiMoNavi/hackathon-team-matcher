import { useAuth } from '../context/AuthContext'
import { Navigate, useLocation } from 'react-router-dom'

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-spin">☕</div>
          <p className="text-primary">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    // Save the attempted location so we can redirect back after login
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}

export default ProtectedRoute
