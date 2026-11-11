import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'

function Settings() {
  const navigate = useNavigate()
  const { user, updateProfile } = useAuth()
  const [displayName, setDisplayName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [selectedRoles, setSelectedRoles] = useState([])
  const [experience, setExperience] = useState('')
  const [skills, setSkills] = useState([])
  const [skillInput, setSkillInput] = useState('')
  const [interests, setInterests] = useState([])
  const [interestInput, setInterestInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const roles = [
    { id: 'frontend', label: 'Frontend', icon: 'code' },
    { id: 'backend', label: 'Backend', icon: 'storage' },
    { id: 'design', label: 'Design', icon: 'design_services' },
    { id: 'product', label: 'Product', icon: 'rocket_launch' },
  ]

  useEffect(() => {
    if (user) {
      setDisplayName(user.name || '')
      setEmail(user.email || '')
      // Load saved preferences if available
      if (user.preferredRoles) setSelectedRoles(user.preferredRoles)
      if (user.experience) setExperience(user.experience)
      if (user.skills) setSkills(user.skills)
      if (user.interests) setInterests(user.interests)
    }
  }, [user])

  const toggleRole = (roleId) => {
    if (selectedRoles.includes(roleId)) {
      setSelectedRoles(selectedRoles.filter(r => r !== roleId))
    } else {
      setSelectedRoles([...selectedRoles, roleId])
    }
  }

  const addSkill = (e) => {
    if (e.key === 'Enter' && skillInput.trim()) {
      if (!skills.includes(skillInput.trim())) {
        setSkills([...skills, skillInput.trim()])
      }
      setSkillInput('')
    }
  }

  const removeSkill = (skill) => {
    setSkills(skills.filter(s => s !== skill))
  }

  const addInterest = (e) => {
    if (e.key === 'Enter' && interestInput.trim()) {
      if (!interests.includes(interestInput.trim())) {
        setInterests([...interests, interestInput.trim()])
      }
      setInterestInput('')
    }
  }

  const removeInterest = (interest) => {
    setInterests(interests.filter(i => i !== interest))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setSuccess(false)

    const result = await updateProfile({
      name: displayName,
      preferredRoles: selectedRoles,
      experience,
      skills,
      interests,
    })

    setLoading(false)

    if (result.success) {
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    }
  }

  return (
    <Layout>
      <div className="flex-1 bg-background-dark">
        <div className="max-w-4xl mx-auto p-6 lg:p-10">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={() => navigate('/dashboard')}
              className="mb-4 text-forest hover:text-forest-mid transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Back to Dashboard
            </button>
            <h1 className="text-3xl font-bold text-white mb-2">Profile Settings</h1>
            <p className="text-text-secondary">
              Update your details to find your perfect team. These details will be visible to potential teammates.
            </p>
          </div>

          {success && (
            <div className="mb-6 p-4 bg-forest/20 border border-forest rounded-lg text-forest">
              Profile updated successfully!
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Profile Photo */}
            <div className="flex items-center gap-6">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-surface-dark border-2 border-forest flex items-center justify-center overflow-hidden">
                  {user?.picture ? (
                    <img src={user.picture} alt={displayName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-4xl text-forest font-bold">
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="absolute bottom-0 right-0 w-8 h-8 bg-forest rounded-full flex items-center justify-center border-2 border-background-dark hover:bg-forest-mid transition"
                >
                  <span className="material-symbols-outlined text-white text-sm">edit</span>
                </button>
              </div>
              <div className="flex-1">
                <p className="text-white font-medium mb-1">Profile Photo</p>
                <p className="text-text-secondary text-sm mb-3">Recommended 300x300px</p>
                <button
                  type="button"
                  className="px-4 py-2 bg-surface-dark border border-[#28392e] rounded-lg text-white hover:bg-surface-highlight transition text-sm font-medium"
                >
                  Upload New Photo
                </button>
              </div>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-3 bg-surface-dark border border-[#28392e] rounded-lg text-white placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-forest focus:border-forest"
                required
              />
            </div>

            {/* Email Address */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">Email Address</label>
              <input
                type="email"
                value={email}
                disabled
                className="w-full px-4 py-3 bg-surface-dark border border-[#28392e] rounded-lg text-text-secondary cursor-not-allowed"
              />
              <p className="text-text-secondary text-xs mt-1">Email cannot be changed</p>
            </div>

            {/* Preferred Role(s) */}
            <div>
              <label className="block text-sm font-medium text-white mb-3">Preferred Role(s)</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {roles.map((role) => {
                  const isSelected = selectedRoles.includes(role.id)
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => toggleRole(role.id)}
                      className={`relative p-4 border-2 rounded-lg transition ${
                        isSelected
                          ? 'border-forest bg-forest/10'
                          : 'border-[#28392e] bg-surface-dark hover:border-[#3b5443]'
                      }`}
                    >
                      {isSelected && (
                        <span className="absolute top-2 right-2 text-forest">
                          <span className="material-symbols-outlined text-lg">check_circle</span>
                        </span>
                      )}
                      <div className="flex flex-col items-center gap-2">
                        <span className={`material-symbols-outlined text-2xl ${isSelected ? 'text-forest' : 'text-text-secondary'}`}>
                          {role.icon}
                        </span>
                        <span className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-text-secondary'}`}>
                          {role.label}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Hackathon Experience */}
            <div>
              <label className="block text-sm font-medium text-white mb-3">Hackathon Experience</label>
              <div className="space-y-3">
                {[
                  { value: 'beginner', label: 'Beginner', desc: "This is my first hackathon or I'm new to team projects" },
                  { value: 'intermediate', label: 'Intermediate', desc: "I've participated in 1-3 hackathons before" },
                  { value: 'advanced', label: 'Advanced', desc: "I'm a hackathon veteran with 4+ experiences" },
                ].map((option) => (
                  <label
                    key={option.value}
                    className="flex items-start gap-3 p-4 border border-[#28392e] rounded-lg bg-surface-dark hover:bg-surface-highlight cursor-pointer transition"
                  >
                    <input
                      type="radio"
                      name="experience"
                      value={option.value}
                      checked={experience === option.value}
                      onChange={(e) => setExperience(e.target.value)}
                      className="mt-1 text-forest focus:ring-forest"
                    />
                    <div>
                      <p className="text-white font-medium">{option.label}</p>
                      <p className="text-text-secondary text-sm">{option.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Technical Skills */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">Technical Skills</label>
              <div className="min-h-[3rem] p-3 w-full rounded-lg border border-[#28392e] bg-surface-dark flex flex-wrap gap-2 focus-within:ring-2 focus-within:ring-forest focus-within:border-forest transition">
                {skills.map((skill, idx) => (
                  <div key={idx} className="inline-flex items-center bg-[#28392e] text-white text-sm font-medium px-3 py-1 rounded-full gap-2">
                    {skill}
                    <button
                      type="button"
                      onClick={() => removeSkill(skill)}
                      className="text-text-secondary hover:text-white transition"
                    >
                      <span className="material-symbols-outlined text-base">close</span>
                    </button>
                  </div>
                ))}
                <input
                  type="text"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyPress={addSkill}
                  placeholder="Type and press Enter..."
                  className="flex-1 bg-transparent border-none focus:ring-0 p-0 text-sm text-white placeholder-text-secondary min-w-[200px]"
                />
              </div>
              <p className="text-text-secondary text-xs mt-2">Add skills like languages, frameworks, or tools.</p>
            </div>

            {/* Interests & Domains */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">Interests & Domains</label>
              <div className="min-h-[3rem] p-3 w-full rounded-lg border border-[#28392e] bg-surface-dark flex flex-wrap gap-2 focus-within:ring-2 focus-within:ring-forest focus-within:border-forest transition">
                {interests.map((interest, idx) => (
                  <div key={idx} className="inline-flex items-center bg-[#28392e] text-white text-sm font-medium px-3 py-1 rounded-full gap-2">
                    {interest}
                    <button
                      type="button"
                      onClick={() => removeInterest(interest)}
                      className="text-text-secondary hover:text-white transition"
                    >
                      <span className="material-symbols-outlined text-base">close</span>
                    </button>
                  </div>
                ))}
                <input
                  type="text"
                  value={interestInput}
                  onChange={(e) => setInterestInput(e.target.value)}
                  onKeyPress={addInterest}
                  placeholder="Type and press Enter..."
                  className="flex-1 bg-transparent border-none focus:ring-0 p-0 text-sm text-white placeholder-text-secondary min-w-[200px]"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="px-6 py-3 border border-[#28392e] rounded-lg text-white hover:bg-surface-highlight transition font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 bg-forest text-white rounded-lg hover:bg-forest-mid transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  )
}

export default Settings

