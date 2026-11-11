// Team management utility - saves to localStorage (JSON)

export const teamStorage = {
  // Get current team members
  getTeam: () => {
    try {
      const data = localStorage.getItem('matcha_team')
      return data ? JSON.parse(data) : []
    } catch (error) {
      console.error('Error reading team:', error)
      return []
    }
  },

  // Add member to team
  addMember: (member) => {
    const team = teamStorage.getTeam()

    // Check if member already exists
    const exists = team.find(m => m.id === member.id)
    if (exists) {
      return team
    }

    const newMember = {
      ...member,
      addedAt: new Date().toISOString(),
      status: 'accepted'
    }

    const updatedTeam = [...team, newMember]
    localStorage.setItem('matcha_team', JSON.stringify(updatedTeam))
    return updatedTeam
  },

  // Remove member from team
  removeMember: (memberId) => {
    const team = teamStorage.getTeam()
    const filtered = team.filter(m => m.id !== memberId)
    localStorage.setItem('matcha_team', JSON.stringify(filtered))
    return filtered
  },

  // Clear entire team
  clearTeam: () => {
    localStorage.removeItem('matcha_team')
    return []
  },

  // Get team size
  getTeamSize: () => {
    return teamStorage.getTeam().length
  },

  // Check if member is in team
  isMemberInTeam: (memberId) => {
    const team = teamStorage.getTeam()
    return team.some(m => m.id === memberId)
  }
}