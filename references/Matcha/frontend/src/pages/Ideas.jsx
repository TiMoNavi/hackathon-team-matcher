import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import { ideaStorage } from '../utils/ideaStorage'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

// Mock hackathon data
const MOCK_HACKATHON = {
  id: 'hack1',
  name: 'TechCrunch Disrupt 2024',
  tracks: ['AI/ML', 'FinTech', 'Healthcare', 'Sustainability'],
  rules: '48-hour hackathon. Teams of 2-4. Must use provided APIs.',
  teamSize: '2-4',
  duration: '48 hours'
}

function Ideas() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  // Get token - use 'auth0_token' for Auth0 users, actual token for email/password users
  const token = localStorage.getItem('token') || (user?.provider === 'auth0' ? 'auth0_token' : null)

  // State management
  const [viewMode, setViewMode] = useState('setup') // 'setup' | 'gallery' | 'detail' | 'shortlisted'
  const [hackathonContext, setHackathonContext] = useState(MOCK_HACKATHON)
  const [skillContext, setSkillContext] = useState('mySkills') // 'mySkills' | 'withTeammates'
  const [selectedTeammate, setSelectedTeammate] = useState(null)
  const [generatedIdeas, setGeneratedIdeas] = useState([])
  const [shortlistedIdeas, setShortlistedIdeas] = useState([])
  const [selectedIdea, setSelectedIdea] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Load from localStorage on mount
  useEffect(() => {
    const stored = ideaStorage.getAll()
    if (stored.generatedIdeas.length > 0) {
      setGeneratedIdeas(stored.generatedIdeas)
      setViewMode('gallery')
    }
    if (stored.shortlistedIdeas.length > 0) {
      setShortlistedIdeas(stored.shortlistedIdeas)
    }
    if (stored.hackathonContext) {
      setHackathonContext(stored.hackathonContext)
    }
  }, [])

  // Check for teammate context from URL
  useEffect(() => {
    const teammateId = searchParams.get('teammateId')
    const teammateName = searchParams.get('teammateName')
    if (teammateId && teammateName) {
      setSelectedTeammate({ id: teammateId, name: teammateName })
      setSkillContext('withTeammates')
    }
  }, [searchParams])


  // Get user skills and roles
  const getUserSkills = () => {
    return Array.isArray(user?.skills) ? user.skills : []
  }

  const getUserRoles = () => {
    const roles = user?.preferredRoles || user?.roles || []
    return Array.isArray(roles) ? roles : []
  }

  // Generate ideas
  const handleGenerate = async () => {
    setLoading(true)
    setError('')

    try {
      const skills = getUserSkills()
      const roles = getUserRoles()

      if (skills.length === 0) {
        setError('Please add skills to your profile in Settings first.')
        setLoading(false)
        return
      }

      // Ensure we have a token (use 'auth0_token' for Auth0 users)
      const authToken = token || (user?.provider === 'auth0' ? 'auth0_token' : 'auth0_token')
      
      console.log('Calling API:', `${API_URL}/ideas/generate`)
      console.log('Request body:', { hackathonContext, skills, roles })
      
      const response = await fetch(`${API_URL}/ideas/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          hackathonContext,
          skills,
          roles,
          teammates: skillContext === 'withTeammates' && selectedTeammate ? [selectedTeammate] : []
        }),
      }).catch((fetchError) => {
        console.error('Fetch error details:', fetchError)
        throw new Error(`Cannot connect to server at ${API_URL}. Make sure the backend is running: cd server && npm start`)
      })

      if (!response) {
        throw new Error('No response from server. Check if backend is running on port 3001.')
      }

      console.log('Response status:', response.status, response.statusText)

      let data
      try {
        data = await response.json()
      } catch (parseError) {
        console.error('Failed to parse response:', parseError)
        throw new Error(`Server returned invalid response (status ${response.status}). Check server logs.`)
      }

      if (!response.ok) {
        throw new Error(data.error || `Server error: ${response.status} ${response.statusText}`)
      }

      const ideas = data.ideas || []
      setGeneratedIdeas(ideas)
      ideaStorage.saveGeneratedIdeas(ideas, hackathonContext)
      setViewMode('gallery')
    } catch (err) {
      console.error('Error generating ideas:', err)
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.name === 'TypeError') {
        setError(`Cannot connect to server. Make sure the backend is running:\n1. Open a terminal\n2. Run: cd server && npm start\n3. Wait for "Server running on http://localhost:3001"`)
      } else {
        setError(err.message || 'Failed to generate ideas. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  // Handle idea interaction
  const handleInterested = (idea) => {
    const updatedIdea = { ...idea, shortlisted: true }
    const updatedShortlisted = [...shortlistedIdeas, updatedIdea]
    setShortlistedIdeas(updatedShortlisted)
    ideaStorage.saveShortlistedIdea(updatedIdea)
  }

  const handleSkip = (ideaId) => {
    // Just remove from current view, don't add to shortlisted
    setGeneratedIdeas(generatedIdeas.filter(i => i.id !== ideaId))
  }

  const handleRemoveShortlisted = (ideaId) => {
    const updated = shortlistedIdeas.filter(i => i.id !== ideaId)
    setShortlistedIdeas(updated)
    ideaStorage.removeShortlistedIdea(ideaId)
  }

  const handleViewDetail = (idea) => {
    setSelectedIdea(idea)
    setViewMode('detail')
  }

  // Get color for feasibility score
  const getFeasibilityColor = (score) => {
    if (score >= 8) return 'text-green-400'
    if (score >= 6) return 'text-yellow-400'
    return 'text-red-400'
  }

  // Get color for scope fit
  const getScopeColor = (scope) => {
    if (scope === 'Small') return 'bg-green-500/20 text-green-400 border-green-500/30'
    if (scope === 'Medium') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    return 'bg-red-500/20 text-red-400 border-red-500/30'
  }

  // Loading View
  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex flex-col items-center justify-center bg-background-dark p-6 overflow-hidden">
          <div className="max-w-4xl w-full text-center">
            {/* Animated Cards */}
            <div className="relative mb-12 flex justify-center">
              <div className="relative w-64 h-80">
                {/* Card 1 - Most prominent - Floating animation */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-primary/10 rounded-xl border border-primary/30 shadow-2xl shadow-primary/20 transform rotate-3 animate-[float_3s_ease-in-out_infinite]">
                  <div className="p-6 h-full flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
                        <span className="material-symbols-outlined text-primary">settings</span>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center animate-pulse" style={{ animationDelay: '0.5s' }}>
                        <span className="material-symbols-outlined text-primary">person</span>
                      </div>
                    </div>
                    <div className="space-y-2 flex-1">
                      <div className="h-3 bg-primary/20 rounded w-full animate-[shimmer_2s_infinite]"></div>
                      <div className="h-3 bg-primary/20 rounded w-3/4 animate-[shimmer_2s_infinite]" style={{ animationDelay: '0.2s' }}></div>
                      <div className="h-3 bg-primary/20 rounded w-5/6 animate-[shimmer_2s_infinite]" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <div className="px-3 py-1 bg-primary/20 rounded text-xs text-primary animate-pulse">React</div>
                      <div className="px-3 py-1 bg-primary/20 rounded text-xs text-primary animate-pulse" style={{ animationDelay: '0.3s' }}>Node</div>
                      <div className="px-3 py-1 bg-primary/20 rounded text-xs text-primary animate-pulse" style={{ animationDelay: '0.6s' }}>AI</div>
                    </div>
                    <div className="absolute top-4 right-4 bg-primary/30 px-2 py-1 rounded text-xs font-bold text-white animate-pulse">
                      MATCH 98%
                    </div>
                  </div>
                </div>
                {/* Card 2 - Behind - Slower floating */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl border border-primary/20 shadow-lg transform -rotate-2 translate-x-4 translate-y-4 opacity-60 animate-[float_4s_ease-in-out_infinite]" style={{ animationDelay: '0.5s' }}>
                </div>
                {/* Card 3 - Furthest - Slowest floating */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl border border-primary/10 shadow transform rotate-1 translate-x-8 translate-y-8 opacity-40 animate-[float_5s_ease-in-out_infinite]" style={{ animationDelay: '1s' }}>
                </div>
              </div>
            </div>

            {/* Title - Fade in and pulse */}
            <h1 className="text-5xl font-bold text-white mb-4 animate-[fadeIn_1s_ease-in,glow_2s_ease-in-out_infinite]">
              Brewing your <span className="text-primary animate-[pulse_2s_ease-in-out_infinite]">perfect idea</span>...
            </h1>
            
            {/* Subtitle - Typing effect simulation */}
            <p className="text-text-secondary text-lg mb-8 animate-[fadeIn_1.5s_ease-in]">
              <span className="inline-block animate-[bounce_1s_ease-in-out_infinite]">Analyzing keywords</span>
              <span className="mx-2">•</span>
              <span className="inline-block animate-[bounce_1s_ease-in-out_infinite]" style={{ animationDelay: '0.3s' }}>Matching skills</span>
              <span className="mx-2">•</span>
              <span className="inline-block animate-[bounce_1s_ease-in-out_infinite]" style={{ animationDelay: '0.6s' }}>Shuffling concepts</span>
            </p>

            {/* Progress Bar - Animated */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-2">
                <span className="text-primary text-sm font-medium animate-pulse">PROCESSING INPUTS</span>
                <span className="text-primary text-sm font-medium animate-[countUp_3s_ease-in-out_infinite]">65%</span>
              </div>
              <div className="w-full h-2 bg-[#28392e] rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary via-[#0fd650] to-primary rounded-full animate-[progress_3s_ease-in-out_infinite] bg-[length:200%_100%]"></div>
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-text-secondary text-sm animate-pulse">Step 3 of 4: Conceptualizing</span>
                <span className="text-text-secondary text-sm animate-pulse">-4.2s remaining</span>
              </div>
            </div>

            {/* Pro Tip - Fade in with delay */}
            <div className="bg-[#28392e] border border-primary/20 rounded-lg p-4 flex items-start gap-3 max-w-2xl mx-auto animate-[fadeIn_2s_ease-in,slideUp_2s_ease-out]">
              <span className="material-symbols-outlined text-primary text-2xl animate-[spin_3s_linear_infinite]">lightbulb</span>
              <p className="text-text-secondary text-sm text-left">
                <span className="text-primary font-semibold">Pro Tip:</span> Teams of 3-4 people are statistically 40% more likely to finish a hackathon project on time.
              </p>
            </div>

            {/* Copyright */}
            <p className="text-text-secondary text-xs mt-12 animate-[fadeIn_2.5s_ease-in]">©2025 Matcha. Powered by caffeine and code.</p>
          </div>
          
          {/* Add CSS animations via style tag */}
          <style>{`
            @keyframes float {
              0%, 100% { transform: translateY(0px) rotate(3deg); }
              50% { transform: translateY(-20px) rotate(3deg); }
            }
            @keyframes shimmer {
              0% { opacity: 0.3; }
              50% { opacity: 1; }
              100% { opacity: 0.3; }
            }
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes glow {
              0%, 100% { text-shadow: 0 0 10px rgba(15, 214, 80, 0.5); }
              50% { text-shadow: 0 0 20px rgba(15, 214, 80, 0.8), 0 0 30px rgba(15, 214, 80, 0.5); }
            }
            @keyframes bounce {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-5px); }
            }
            @keyframes progress {
              0% { width: 0%; background-position: 0% 50%; }
              50% { width: 65%; background-position: 100% 50%; }
              100% { width: 65%; background-position: 0% 50%; }
            }
            @keyframes countUp {
              0% { opacity: 0.5; }
              50% { opacity: 1; }
              100% { opacity: 0.5; }
            }
            @keyframes slideUp {
              from { transform: translateY(20px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </Layout>
    )
  }

  // Setup View
  if (viewMode === 'setup') {
    return (
      <Layout>
        <div className="min-h-screen flex flex-col bg-background-dark p-6 lg:p-10">
          <div className="max-w-4xl mx-auto w-full">
            <h1 className="text-3xl font-bold text-white mb-2">Idea Generation</h1>
            <p className="text-text-secondary mb-8">Generate hackathon project ideas tailored to your skills and team</p>

            {/* Hackathon Context */}
            <div className="bg-surface-dark border border-[#28392e] rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold text-white mb-4">Hackathon Context</h2>
              <div className="space-y-3">
                <div>
                  <span className="text-text-secondary text-sm">Name:</span>
                  <p className="text-white font-medium">{hackathonContext.name}</p>
                </div>
                <div>
                  <span className="text-text-secondary text-sm">Tracks:</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {hackathonContext.tracks.map((track, idx) => (
                      <span key={idx} className="px-3 py-1 bg-primary/20 text-primary rounded-full text-sm font-medium">
                        {track}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-text-secondary text-sm">Rules:</span>
                  <p className="text-white">{hackathonContext.rules}</p>
                </div>
                <div>
                  <span className="text-text-secondary text-sm">Team Size:</span>
                  <p className="text-white">{hackathonContext.teamSize}</p>
                </div>
              </div>
            </div>

            {/* Skill Context Selector */}
            <div className="bg-surface-dark border border-[#28392e] rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold text-white mb-4">Skill Context</h2>
              <div className="space-y-4">
                <div className="flex flex-col gap-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="skillContext"
                      value="mySkills"
                      checked={skillContext === 'mySkills'}
                      onChange={(e) => setSkillContext(e.target.value)}
                      className="w-4 h-4 text-primary focus:ring-primary"
                    />
                    <span className="text-white">My skills only</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="skillContext"
                      value="withTeammates"
                      checked={skillContext === 'withTeammates'}
                      onChange={(e) => setSkillContext(e.target.value)}
                      className="w-4 h-4 text-primary focus:ring-primary"
                    />
                    <span className="text-white">My skills + selected teammates</span>
                  </label>
                </div>

                {selectedTeammate && skillContext === 'withTeammates' && (
                  <div className="mt-4 p-4 bg-[#28392e] rounded-lg">
                    <p className="text-sm text-text-secondary mb-2">Selected Teammate:</p>
                    <p className="text-white font-medium">{selectedTeammate.name}</p>
                  </div>
                )}

                <div className="mt-4">
                  <p className="text-sm text-text-secondary mb-2">Your Skills:</p>
                  <div className="flex flex-wrap gap-2">
                    {getUserSkills().length > 0 ? (
                      getUserSkills().map((skill, idx) => (
                        <span key={idx} className="px-3 py-1 bg-[#28392e] text-white rounded-full text-sm">
                          {skill}
                        </span>
                      ))
                    ) : (
                      <p className="text-text-secondary text-sm">No skills added. Add skills in Settings.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-200">
                {error}
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={loading || getUserSkills().length === 0}
              className="w-full bg-primary hover:bg-[#0fd650] text-black font-bold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin">refresh</span>
                  Generating Ideas...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined">auto_awesome</span>
                  Generate Ideas
                </>
              )}
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  // Gallery View
  if (viewMode === 'gallery') {
    return (
      <Layout>
        <div className="min-h-screen flex flex-col bg-background-dark p-6 lg:p-10">
          <div className="max-w-7xl mx-auto w-full">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Generated Ideas</h1>
                <p className="text-text-secondary">{generatedIdeas.length} ideas generated</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setViewMode('shortlisted')}
                  className="px-4 py-2 bg-[#28392e] hover:bg-[#344a3b] text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-outlined">bookmark</span>
                  Shortlisted ({shortlistedIdeas.length})
                </button>
                <button
                  onClick={() => setViewMode('setup')}
                  className="px-4 py-2 bg-[#28392e] hover:bg-[#344a3b] text-white rounded-lg transition-colors"
                >
                  Generate New
                </button>
              </div>
            </div>

            {generatedIdeas.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-text-secondary mb-4">No ideas generated yet.</p>
                <button
                  onClick={() => setViewMode('setup')}
                  className="px-6 py-3 bg-primary text-black font-bold rounded-lg hover:bg-[#0fd650] transition-colors"
                >
                  Generate Ideas
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {generatedIdeas.map((idea) => (
                  <div
                    key={idea.id}
                    className="bg-surface-dark border border-[#28392e] rounded-lg p-6 hover:border-primary/30 transition-colors cursor-pointer"
                    onClick={() => handleViewDetail(idea)}
                  >
                    <h3 className="text-xl font-bold text-white mb-2">{idea.title}</h3>
                    <p className="text-text-secondary text-sm mb-4 line-clamp-2">{idea.description}</p>

                    {/* Metrics */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-text-secondary">Feasibility</span>
                        <span className={`text-lg font-bold ${getFeasibilityColor(idea.feasibility_score)}`}>
                          {idea.feasibility_score}/10
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-text-secondary">Scope</span>
                        <span className={`px-2 py-1 rounded text-xs font-medium border ${getScopeColor(idea.scope_fit)}`}>
                          {idea.scope_fit}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-text-secondary">Skill Coverage</span>
                        <span className="text-white font-medium">{idea.skill_coverage_percent}%</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {idea.track_alignment?.slice(0, 2).map((track, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-primary/20 text-primary rounded text-xs">
                            {track}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 mt-4 pt-4 border-t border-[#28392e]">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleInterested(idea)
                        }}
                        className="flex-1 px-3 py-2 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-1"
                      >
                        <span className="material-symbols-outlined text-base">thumb_up</span>
                        Interested
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSkip(idea.id)
                        }}
                        className="px-3 py-2 bg-[#28392e] hover:bg-[#344a3b] text-white rounded-lg transition-colors text-sm"
                      >
                        <span className="material-symbols-outlined text-base">close</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Layout>
    )
  }

  // Detail View
  if (viewMode === 'detail' && selectedIdea) {
    // Derive fields if not present (for backward compatibility)
    const problemStatement = selectedIdea.problem_statement || selectedIdea.description || 'No problem statement available.'
    // Use core_features from Gemini response, fallback only if completely missing
    const coreFeatures = (Array.isArray(selectedIdea.core_features) && selectedIdea.core_features.length > 0)
      ? selectedIdea.core_features
      : [
          'Core feature implementation based on project requirements',
          'User interface and interaction design',
          'Data processing and storage',
          'Integration with external services or APIs'
        ]
    const techStack = (Array.isArray(selectedIdea.tech_stack) && selectedIdea.tech_stack.length > 0)
      ? selectedIdea.tech_stack
      : ['React', 'Node.js', 'MongoDB', 'REST API']

    // Tech stack icons mapping
    const techIcons = {
      'React': { icon: '⚛️', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
      'Node.js': { icon: '🟢', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
      'MongoDB': { icon: '🍃', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
      'PostgreSQL': { icon: '🐘', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
      'Python': { icon: '🐍', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
      'Express.js': { icon: '⚡', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
      'Firebase': { icon: '🔥', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
      'Maps API': { icon: '📍', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
      'Google Maps API': { icon: '📍', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
      'LoRaWAN': { icon: '📡', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
      'TensorFlow': { icon: '🧠', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
      'OpenAI API': { icon: '🤖', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
      'Tailwind CSS': { icon: '💨', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
      'Socket.io': { icon: '🔌', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' }
    }

    const getTechIcon = (tech) => {
      for (const [key, value] of Object.entries(techIcons)) {
        if (tech.toLowerCase().includes(key.toLowerCase())) {
          return value
        }
      }
      return { icon: '⚙️', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' }
    }

    return (
      <Layout>
        <div className="min-h-screen flex flex-col bg-background-dark p-6 lg:p-10">
          <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Header */}
              <div>
                <button
                  onClick={() => setViewMode('gallery')}
                  className="mb-4 text-text-secondary hover:text-white transition-colors flex items-center gap-2 text-sm"
                >
                  <span className="material-symbols-outlined">arrow_back</span>
                  Back to Gallery
                </button>
                <div className="inline-block px-3 py-1 bg-primary/20 text-primary rounded-full text-xs font-bold mb-3">
                  HACKATHON IDEA
                </div>
                <div className="flex items-start justify-between">
                  <h1 className="text-4xl font-bold text-white mb-4 flex-1">{selectedIdea.title}</h1>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleInterested(selectedIdea)}
                      className="p-2 hover:bg-[#28392e] rounded-lg transition-colors"
                      title="Bookmark"
                    >
                      <span className="material-symbols-outlined text-text-secondary hover:text-primary">
                        {shortlistedIdeas.some(i => i.id === selectedIdea.id) ? 'bookmark' : 'bookmark_border'}
                      </span>
                    </button>
                    <button
                      className="p-2 hover:bg-[#28392e] rounded-lg transition-colors"
                      title="Share"
                    >
                      <span className="material-symbols-outlined text-text-secondary hover:text-primary">share</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Problem Statement */}
              <div>
                <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                  <span className="text-yellow-400">▲</span>
                  Problem Statement
                </h2>
                <div className="bg-[#1e3626] border border-[#28392e] rounded-lg p-4">
                  <p className="text-text-secondary leading-relaxed">{problemStatement}</p>
                </div>
              </div>

              {/* Core Features */}
              <div>
                <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                  <span className="text-primary">≡</span>
                  Core Features
                </h2>
                <ul className="space-y-2">
                  {coreFeatures.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span className="text-primary mt-1">•</span>
                      <span className="text-text-secondary flex-1">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Tech Stack Suggestion */}
              <div>
                <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                  <span className="text-blue-400">◷</span>
                  Tech Stack Suggestion
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {techStack.map((tech, idx) => {
                    const techInfo = getTechIcon(tech)
                    const label = tech.includes('API') ? 'Location' : 
                                 tech.includes('LoRa') ? 'Connectivity' :
                                 tech.includes('MongoDB') || tech.includes('PostgreSQL') ? 'Database' :
                                 tech.includes('React') || tech.includes('Vue') || tech.includes('Angular') ? 'Frontend' :
                                 tech.includes('Node') || tech.includes('Express') || tech.includes('Python') ? 'Backend' : 'Tool'
                    return (
                      <div
                        key={idx}
                        className={`${techInfo.color} border rounded-lg p-4 flex flex-col items-center gap-2`}
                      >
                        <span className="text-2xl">{techInfo.icon}</span>
                        <span className="text-white font-medium text-sm">{tech}</span>
                        <span className="text-xs text-text-secondary">{label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Risk Factors & Why This Fits - Side by Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Risk Factors */}
                <div>
                  <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <span className="text-red-400">⚬</span>
                    Risk Factors
                  </h2>
                  <div className="bg-[#1e3626] border border-[#28392e] rounded-lg p-4">
                    <p className="text-text-secondary">
                      {selectedIdea.risks?.join('. ') || 'No specific risks identified.'}
                    </p>
                  </div>
                </div>

                {/* Why This Fits */}
                <div>
                  <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <span className="text-pink-400">♥</span>
                    Why this fits the hackathon
                  </h2>
                  <div className="bg-[#1e3626] border border-[#28392e] rounded-lg p-4">
                    <p className="text-text-secondary">{selectedIdea.why_good_fit || 'This idea aligns well with the hackathon themes and team capabilities.'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Gemini-powered Idea Refinement */}
              <div className="bg-surface-dark border border-[#28392e] rounded-lg p-6">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-blue-400 text-sm">auto_awesome</span>
                  </span>
                  Gemini-powered Idea Refinement
                </h3>
                <div className="space-y-3">
                  <button className="w-full bg-[#28392e] hover:bg-[#344a3b] border border-[#28392e] rounded-lg p-4 flex items-center gap-3 transition-colors">
                    <span className="material-symbols-outlined text-primary">open_in_full</span>
                    <div className="text-left">
                      <p className="text-white font-medium text-sm">Expand features</p>
                      <p className="text-text-secondary text-xs">Add complexity & depth.</p>
                    </div>
                  </button>
                  <button className="w-full bg-[#28392e] hover:bg-[#344a3b] border border-[#28392e] rounded-lg p-4 flex items-center gap-3 transition-colors">
                    <span className="material-symbols-outlined text-blue-400">filter_alt</span>
                    <div className="text-left">
                      <p className="text-white font-medium text-sm">Reduce scope</p>
                      <p className="text-text-secondary text-xs">Simplify for MVP.</p>
                    </div>
                  </button>
                  <button className="w-full bg-[#28392e] hover:bg-[#344a3b] border border-[#28392e] rounded-lg p-4 flex items-center gap-3 transition-colors">
                    <span className="material-symbols-outlined text-yellow-400">emoji_events</span>
                    <div className="text-left">
                      <p className="text-white font-medium text-sm">Make it competitive</p>
                      <p className="text-text-secondary text-xs">Analyze winning trends.</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Team Matching */}
              <div className="bg-surface-dark border border-[#28392e] rounded-lg p-6">
                <h3 className="text-lg font-bold text-white mb-2">Team Matching</h3>
                <p className="text-text-secondary text-sm mb-4">Find teammates interested in this idea.</p>
                <button
                  onClick={() => navigate('/results')}
                  className="w-full bg-primary hover:bg-[#0fd650] text-black font-bold py-3 px-4 rounded-lg transition-colors"
                >
                  Find Teammates
                </button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  // Shortlisted View
  if (viewMode === 'shortlisted') {
    return (
      <Layout>
        <div className="min-h-screen flex flex-col bg-background-dark p-6 lg:p-10">
          <div className="max-w-7xl mx-auto w-full">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Shortlisted Ideas</h1>
                <p className="text-text-secondary">{shortlistedIdeas.length} ideas saved</p>
              </div>
              <button
                onClick={() => setViewMode('gallery')}
                className="px-4 py-2 bg-[#28392e] hover:bg-[#344a3b] text-white rounded-lg transition-colors"
              >
                Back to Gallery
              </button>
            </div>

            {shortlistedIdeas.length === 0 ? (
              <div className="text-center py-12">
                <span className="material-symbols-outlined text-6xl text-text-secondary mb-4 block">bookmark_border</span>
                <p className="text-text-secondary mb-4">No shortlisted ideas yet.</p>
                <button
                  onClick={() => setViewMode('gallery')}
                  className="px-6 py-3 bg-primary text-black font-bold rounded-lg hover:bg-[#0fd650] transition-colors"
                >
                  Browse Ideas
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {shortlistedIdeas.map((idea) => (
                  <div
                    key={idea.id}
                    className="bg-surface-dark border border-[#28392e] rounded-lg p-6 hover:border-primary/30 transition-colors cursor-pointer"
                    onClick={() => handleViewDetail(idea)}
                  >
                    <h3 className="text-xl font-bold text-white mb-2">{idea.title}</h3>
                    <p className="text-text-secondary text-sm mb-4 line-clamp-2">{idea.description}</p>

                    <div className="flex items-center justify-between mb-4">
                      <span className={`text-lg font-bold ${getFeasibilityColor(idea.feasibility_score)}`}>
                        {idea.feasibility_score}/10
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${getScopeColor(idea.scope_fit)}`}>
                        {idea.scope_fit}
                      </span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveShortlisted(idea.id)
                      }}
                      className="w-full px-3 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg transition-colors text-sm font-medium"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Layout>
    )
  }

  return null
}

export default Ideas
