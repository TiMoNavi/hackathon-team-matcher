const express = require('express')
const router = express.Router()
const { userStorage } = require('../utils/userStorage')
const { authenticateToken } = require('../middleware/auth')

// Get current user profile
router.get('/me', authenticateToken, (req, res) => {
  try {
    const user = userStorage.getUserById(req.user.userId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const { password: _, ...userWithoutPassword } = user
    res.json({ user: userWithoutPassword })
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Update user profile
router.put('/me', authenticateToken, (req, res) => {
  try {
    const { name, devpostLink, skills, interests, preferredRoles, roles, experience, experienceLevel, resume } = req.body
    const user = userStorage.getUserById(req.user.userId)

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Build update object - only include fields that are provided (not undefined)
    const updateData = {}
    
    if (name !== undefined) updateData.name = name
    if (devpostLink !== undefined) updateData.devpostLink = devpostLink
    if (resume !== undefined) updateData.resume = resume
    
    // Handle skills - ensure it's always an array
    if (skills !== undefined) {
      updateData.skills = Array.isArray(skills) ? skills : (skills ? [skills] : [])
    }
    
    // Handle interests - ensure it's always an array
    if (interests !== undefined) {
      updateData.interests = Array.isArray(interests) ? interests : (interests ? [interests] : [])
    }
    
    // Handle preferredRoles/roles - ensure it's always an array
    if (preferredRoles !== undefined || roles !== undefined) {
      const rolesValue = preferredRoles || roles || []
      updateData.preferredRoles = Array.isArray(rolesValue) ? rolesValue : [rolesValue]
      updateData.roles = updateData.preferredRoles // Keep both for backward compatibility
    }
    
    // Handle experience/experienceLevel
    if (experience !== undefined || experienceLevel !== undefined) {
      const expValue = experience || experienceLevel || ''
      updateData.experience = expValue
      updateData.experienceLevel = expValue // Keep both for backward compatibility
    }

    // Support both old field names (roles, experienceLevel) and new ones (preferredRoles, experience)
    const updatedUser = userStorage.updateUserProfile(req.user.userId, updateData)

    const { password: _, ...userWithoutPassword } = updatedUser
    res.json({ user: userWithoutPassword })
  } catch (error) {
    console.error('Update profile error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router


