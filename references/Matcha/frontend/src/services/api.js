/**
 * API Service for Matcha - Connects React Frontend to Flask Backend
 *
 * Backend runs on http://127.0.0.1:5000
 * API endpoints: /api/scrape, /api/find-teammates, /api/stats
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api'

/**
 * Scrape participants from a Devpost hackathon
 * @param {string} hackathonUrl - Full Devpost URL (e.g., https://hackutd-2025.devpost.com/)
 * @returns {Promise<Object>} { success, hackathon, participants_count, message }
 */
export const scrapeHackathon = async (hackathonUrl) => {
  try {
    const response = await fetch(`${API_BASE_URL}/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: hackathonUrl }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to scrape hackathon')
    }

    return await response.json()
  } catch (error) {
    console.error('Scrape hackathon error:', error)
    throw error
  }
}

/**
 * Find AI-matched teammates for a hackathon
 * @param {string} hackathon - Hackathon name (e.g., "hackutd-2025")
 * @returns {Promise<Object>} { success, current_user, matches }
 */
export const findTeammates = async (hackathon) => {
  try {
    const response = await fetch(`${API_BASE_URL}/find-teammates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hackathon }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to find teammates')
    }

    return await response.json()
  } catch (error) {
    console.error('Find teammates error:', error)
    throw error
  }
}

/**
 * Get database statistics
 * @returns {Promise<Object>} { total_participants, hackathons }
 */
export const getStats = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/stats`)

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to get stats')
    }

    return await response.json()
  } catch (error) {
    console.error('Get stats error:', error)
    throw error
  }
}

/**
 * Combined operation: Scrape AND find teammates
 * This is what the "Brewing" page uses
 * @param {string} hackathonUrl - Full Devpost URL
 * @param {function} onProgress - Callback for progress updates (0-100)
 * @param {function} onStepChange - Callback for step description updates
 * @returns {Promise<Object>} Match results with current_user and matches
 */
export const brewTeammates = async (hackathonUrl, onProgress, onStepChange) => {
  try {
    // Step 1: Scrape hackathon (0-50%)
    if (onStepChange) onStepChange('Scraping participant data from Devpost...')
    if (onProgress) onProgress(10)

    const scrapeResult = await scrapeHackathon(hackathonUrl)

    if (onProgress) onProgress(50)

    // Step 2: AI matching (50-100%)
    if (onStepChange) onStepChange(`Analyzing compatibility for ${scrapeResult.participants_count} participants...`)
    if (onProgress) onProgress(60)

    const matchResult = await findTeammates(scrapeResult.hackathon)

    if (onProgress) onProgress(90)
    if (onStepChange) onStepChange('Finalizing your perfect matches...')

    // Add hackathon metadata to results
    matchResult.hackathon_name = scrapeResult.hackathon
    matchResult.total_participants = scrapeResult.participants_count

    if (onProgress) onProgress(100)

    return matchResult
  } catch (error) {
    console.error('Brew teammates error:', error)
    throw error
  }
}

export default {
  scrapeHackathon,
  findTeammates,
  getStats,
  brewTeammates,
}
