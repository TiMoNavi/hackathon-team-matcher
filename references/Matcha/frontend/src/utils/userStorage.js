// User data storage utility - saves to localStorage (JSON)
// This will be replaced with MongoDB later

// Browser-compatible version (for client-side)
export const userStorage = {
  // Get all users
  getAllUsers: () => {
    try {
      const data = localStorage.getItem('matcha_users')
      return data ? JSON.parse(data) : []
    } catch (error) {
      console.error('Error reading users:', error)
      return []
    }
  },

  // Get user by ID
  getUserById: (userId) => {
    const users = userStorage.getAllUsers()
    return users.find(user => user.id === userId)
  },

  // Get user by email
  getUserByEmail: (email) => {
    const users = userStorage.getAllUsers()
    return users.find(user => user.email === email)
  },

  // Get current logged in user
  getUser: () => {
    try {
      const data = localStorage.getItem('matcha_current_user')
      return data ? JSON.parse(data) : null
    } catch (error) {
      console.error('Error reading current user:', error)
      return null
    }
  },

  // Clear current user (logout)
  clearUser: () => {
    localStorage.removeItem('matcha_current_user')
  },

  // Save or update user
  saveUser: (userData) => {
    const users = userStorage.getAllUsers()
    const existingIndex = users.findIndex(u => u.id === userData.id || u.email === userData.email)
    
    const userToSave = {
      ...userData,
      updatedAt: new Date().toISOString(),
    }

    if (existingIndex >= 0) {
      // Update existing user
      users[existingIndex] = { ...users[existingIndex], ...userToSave }
    } else {
      // Add new user
      userToSave.createdAt = new Date().toISOString()
      users.push(userToSave)
    }

    localStorage.setItem('matcha_users', JSON.stringify(users))
    return userToSave
  },

  // Update user profile
  updateUserProfile: (userId, profileData) => {
    const users = userStorage.getAllUsers()
    const userIndex = users.findIndex(u => u.id === userId)
    
    if (userIndex >= 0) {
      users[userIndex] = {
        ...users[userIndex],
        ...profileData,
        updatedAt: new Date().toISOString(),
      }
      localStorage.setItem('matcha_users', JSON.stringify(users))
      return users[userIndex]
    }
    return null
  },

  // Delete user
  deleteUser: (userId) => {
    const users = userStorage.getAllUsers()
    const filtered = users.filter(u => u.id !== userId)
    localStorage.setItem('matcha_users', JSON.stringify(filtered))
    return true
  },
}

