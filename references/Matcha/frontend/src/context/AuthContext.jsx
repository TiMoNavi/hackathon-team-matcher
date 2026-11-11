import { createContext, useContext, useState, useEffect } from 'react'
import { userStorage } from '../utils/userStorage'

const AuthContext = createContext()

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Check for saved user on mount
  useEffect(() => {
    const savedUser = userStorage.getUser()
    if (savedUser) {
      setUser(savedUser)
    }
    setLoading(false)
  }, [])

  const login = async (email, password) => {
    // Simple mock authentication
    const mockUser = {
      id: Date.now(),
      email,
      name: email.split('@')[0],
      picture: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
      emailVerified: true,
      provider: 'email',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    userStorage.saveUser(mockUser)
    setUser(mockUser)
    return { success: true, user: mockUser }
  }

  const logout = () => {
    userStorage.clearUser()
    setUser(null)
    window.location.href = '/'
  }

  const updateProfile = (profileData) => {
    const updatedUser = { ...user, ...profileData, updatedAt: new Date().toISOString() }
    userStorage.saveUser(updatedUser)
    setUser(updatedUser)
    return { success: true, user: updatedUser }
  }

  const value = {
    user,
    loading,
    login,
    logout,
    updateProfile,
    isAuthenticated: !!user,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}