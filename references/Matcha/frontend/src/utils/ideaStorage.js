const STORAGE_KEY = 'matcha_ideas'

export const ideaStorage = {
  // Get all stored idea data
  getAll() {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      return data ? JSON.parse(data) : {
        generatedIdeas: [],
        shortlistedIdeas: [],
        hackathonContext: null,
        lastGenerated: null
      }
    } catch (error) {
      console.error('Error reading from localStorage:', error)
      return {
        generatedIdeas: [],
        shortlistedIdeas: [],
        hackathonContext: null,
        lastGenerated: null
      }
    }
  },

  // Save generated ideas
  saveGeneratedIdeas(ideas, hackathonContext) {
    try {
      const data = this.getAll()
      data.generatedIdeas = Array.isArray(ideas) ? ideas : []
      if (hackathonContext) {
        data.hackathonContext = hackathonContext
      }
      data.lastGenerated = new Date().toISOString()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('Error saving generated ideas:', error)
    }
  },

  // Save a shortlisted idea
  saveShortlistedIdea(idea) {
    try {
      const data = this.getAll()
      const existingIndex = data.shortlistedIdeas.findIndex(i => i.id === idea.id)
      
      if (existingIndex >= 0) {
        // Update existing
        data.shortlistedIdeas[existingIndex] = { ...idea, shortlisted: true }
      } else {
        // Add new
        data.shortlistedIdeas.push({ ...idea, shortlisted: true })
      }
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('Error saving shortlisted idea:', error)
    }
  },

  // Remove a shortlisted idea
  removeShortlistedIdea(ideaId) {
    try {
      const data = this.getAll()
      data.shortlistedIdeas = data.shortlistedIdeas.filter(i => i.id !== ideaId)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('Error removing shortlisted idea:', error)
    }
  },

  // Get shortlisted ideas
  getShortlistedIdeas() {
    try {
      const data = this.getAll()
      return data.shortlistedIdeas || []
    } catch (error) {
      console.error('Error getting shortlisted ideas:', error)
      return []
    }
  },

  // Clear all session data
  clearSession() {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (error) {
      console.error('Error clearing session:', error)
    }
  },

  // Get last hackathon context
  getHackathonContext() {
    try {
      const data = this.getAll()
      return data.hackathonContext || null
    } catch (error) {
      console.error('Error getting hackathon context:', error)
      return null
    }
  }
}
