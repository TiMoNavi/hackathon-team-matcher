import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { userStorage } from '../utils/userStorage'

const AuthContext = createContext()

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const { user: auth0User, isAuthenticated: auth0IsAuthenticated, isLoading: auth0Loading } = useAuth0()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState(localStorage.getItem('token'))

  // Handle Auth0 authentication
  useEffect(() => {
    if (auth0Loading) {
      setLoading(true)
      return
    }

    if (auth0IsAuthenticated && auth0User) {
      // Save Auth0 user to local storage and set in context immediately
      const auth0UserData = {
        id: auth0User.sub || `auth0_${Date.now()}`,
        email: auth0User.email || '',
        name: auth0User.name || auth0User.nickname || auth0User.email?.split('@')[0] || 'User',
        picture: auth0User.picture || '',
        emailVerified: auth0User.email_verified || false,
        provider: 'auth0',
        auth0Id: auth0User.sub,
        title: 'Full Stack Dev', // Default title
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      // Save to local storage
      userStorage.saveUser(auth0UserData)
      
      // Set user in context immediately
      setUser(auth0UserData)
      setToken('auth0_token') // Placeholder token for Auth0 users
      setLoading(false)
    } else if (token && !auth0IsAuthenticated && token !== 'auth0_token') {
      // Check custom token authentication
      verifyToken()
    } else {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth0IsAuthenticated, auth0User, auth0Loading, token])

  const verifyToken = async () => {
    try {
      const response = await fetch(`${API_URL}/auth/verify`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setUser(data.user)
      } else {
        // Token invalid, clear it
        localStorage.removeItem('token')
        setToken(null)
        setUser(null)
      }
    } catch (error) {
      // If backend is not running, just clear token and continue
      console.warn('Token verification failed (backend may be down):', error)
      localStorage.removeItem('token')
      setToken(null)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const login = async (email, password) => {
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        return { success: false, error: data.error || `Server error: ${response.status}` }
      }

      const data = await response.json()
      setToken(data.token)
      setUser(data.user)
      localStorage.setItem('token', data.token)
      return { success: true, user: data.user }
    } catch (error) {
      console.error('Login error:', error)
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        return { 
          success: false, 
          error: 'Cannot connect to server. Make sure the backend is running on port 3001. Run: npm run dev:server' 
        }
      }
      return { success: false, error: error.message || 'Network error. Please try again.' }
    }
  }

  const register = async (userData) => {
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        return { success: false, error: data.error || `Server error: ${response.status}` }
      }

      const data = await response.json()
      setToken(data.token)
      setUser(data.user)
      localStorage.setItem('token', data.token)
      return { success: true, user: data.user }
    } catch (error) {
      console.error('Registration error:', error)
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        return { 
          success: false, 
          error: 'Cannot connect to server. Make sure the backend is running on port 3001. Run: npm run dev:server' 
        }
      }
      return { success: false, error: error.message || 'Network error. Please try again.' }
    }
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('token')
    
    // If Auth0 user, logout from Auth0
    if (auth0IsAuthenticated) {
      // Auth0 logout will be handled by the component using logoutWithRedirect
      window.location.href = '/'
    } else {
      window.location.href = '/'
    }
  }

  const forgotPassword = async (email) => {
    try {
      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()
      return { success: response.ok, message: data.message || data.error }
    } catch (error) {
      return { success: false, message: 'Network error. Please try again.' }
    }
  }

  const resetPassword = async (token, password) => {
    try {
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, password }),
      })

      const data = await response.json()
      return { success: response.ok, message: data.message || data.error }
    } catch (error) {
      return { success: false, message: 'Network error. Please try again.' }
    }
  }

  const updateProfile = async (profileData) => {
    // Fallback for Auth0 or no backend token: persist locally to userStorage
    const saveLocally = () => {
      const baseUser = user || {}
      const updatedUser =
        userStorage.updateUserProfile(baseUser.id || baseUser.email, { ...profileData }) ||
        userStorage.saveUser({ ...baseUser, ...profileData, id: baseUser.id || baseUser.email })
      setUser(updatedUser)
      return { success: true, user: updatedUser }
    }

    // If no valid backend token (or placeholder Auth0 token), use local storage
    if (!token || token === 'auth0_token') {
      return saveLocally()
    }

    try {
      const response = await fetch(`${API_URL}/users/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(profileData),
      })

      const data = await response.json()

      if (response.ok) {
        setUser(data.user)
        return { success: true, user: data.user }
      } else {
        // If server rejects, fall back to local save
        return saveLocally()
      }
    } catch (error) {
      // Network failure: fall back to local save
      return saveLocally()
    }
  }

  const value = {
    user,
    token,
    loading: loading || auth0Loading,
    login,
    register,
    logout,
    forgotPassword,
    resetPassword,
    updateProfile,
    isAuthenticated: (!!user && !!token) || auth0IsAuthenticated,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}


