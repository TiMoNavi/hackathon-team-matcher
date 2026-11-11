import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function ProfileSetupStep1() {
  const navigate = useNavigate()
  const { user, updateProfile } = useAuth()
  const [fullName, setFullName] = useState('')
  const [selectedRoles, setSelectedRoles] = useState([])
  const [experienceLevel, setExperienceLevel] = useState('')
  const [interests, setInterests] = useState([])
  const [interestInput, setInterestInput] = useState('')
  
  // Load existing user data if available
  useEffect(() => {
    if (user) {
      setFullName(user.name || '')
      setSelectedRoles(user.preferredRoles || [])
      setExperienceLevel(user.experience || '')
      setInterests(user.interests || [])
    }
  }, [user])

  const roles = [
    { value: 'frontend', label: 'Frontend' },
    { value: 'backend', label: 'Backend' },
    { value: 'ml', label: 'Machine Learning' },
    { value: 'design', label: 'Product Design' },
  ]

  const toggleRole = (roleValue) => {
    if (selectedRoles.includes(roleValue)) {
      setSelectedRoles(selectedRoles.filter(r => r !== roleValue))
    } else {
      setSelectedRoles([...selectedRoles, roleValue])
    }
  }

  const addInterest = (e) => {
    if (e.key === 'Enter' && interestInput.trim()) {
      e.preventDefault()
      setInterests([...interests, interestInput.trim()])
      setInterestInput('')
    }
  }

  const removeInterest = (interest) => {
    setInterests(interests.filter(i => i !== interest))
  }

  const handleNext = async (e) => {
    e.preventDefault()
    
    // Save step 1 data before moving to step 2
    if (updateProfile) {
      await updateProfile({
        name: fullName || user?.name,
        preferredRoles: selectedRoles,
        experience: experienceLevel,
        interests: interests,
      })
    }
    
    navigate('/profile/step2')
  }

  return (
    <div className="bg-background-dark text-white min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-surface-dark rounded-lg border border-[#28392e] p-8 md:p-10 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-primary/10 rounded-full blur-3xl opacity-50 pointer-events-none"></div>

        <div className="relative z-10 mb-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="material-symbols-outlined text-3xl text-primary">local_cafe</span>
            <h1 className="text-3xl font-bold tracking-tight text-white">Matcha</h1>
          </div>
          <p className="text-sm text-text-secondary">Brewing your perfect hack team</p>
        </div>

        <div className="relative z-10 mb-10">
          <div className="flex justify-between items-end mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Step 1 of 2</span>
            <span className="text-xs font-medium text-text-secondary">50% Complete</span>
          </div>
          <div className="w-full bg-[#28392e] rounded-full h-1.5 overflow-hidden">
            <div className="bg-primary h-1.5 rounded-full w-1/2 transition-all duration-500 ease-out"></div>
          </div>
        </div>

        <form className="relative z-10 space-y-8" onSubmit={handleNext}>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-primary" htmlFor="name">Full Name</label>
            <input
              className="block w-full px-4 py-3 rounded border border-[#3b5443] bg-[#28392e] text-white placeholder-text-secondary focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors sm:text-sm"
              id="name"
              name="name"
              placeholder="e.g. Alex Morgan"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-text-primary">
              Preferred Role
              <span className="text-text-secondary font-normal ml-1 text-xs">(Select multiple)</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {roles.map((role) => (
                <label key={role.value} className="relative cursor-pointer group">
                  <input
                    className="peer sr-only"
                    name="role"
                    type="checkbox"
                    value={role.value}
                    checked={selectedRoles.includes(role.value)}
                    onChange={() => toggleRole(role.value)}
                  />
                  <div className="px-4 py-3 text-center border border-[#3b5443] rounded text-sm font-medium text-text-secondary bg-transparent transition-all hover:bg-[#28392e] peer-checked:bg-primary peer-checked:text-[#111813] peer-checked:border-primary">
                    {role.label}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-text-primary">Experience Level</label>
            <div className="space-y-3">
              {['beginner', 'intermediate', 'advanced'].map((level) => (
                <label key={level} className="flex items-center p-3 border border-[#3b5443] rounded hover:bg-[#28392e] cursor-pointer transition-colors">
                  <input
                    className="h-4 w-4 text-primary border-[#3b5443] focus:ring-primary bg-transparent"
                    name="experience"
                    type="radio"
                    value={level}
                    checked={experienceLevel === level}
                    onChange={(e) => setExperienceLevel(e.target.value)}
                  />
                  <span className="ml-3 block text-sm font-medium text-text-primary capitalize">{level}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-primary" htmlFor="interests">Interests</label>
            <div className="min-h-[3rem] p-2 w-full rounded border border-[#3b5443] bg-[#28392e] flex flex-wrap gap-2 focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-colors">
              {interests.map((interest, idx) => (
                <div key={idx} className="inline-flex items-center bg-[#3b5443] text-white text-xs font-medium px-2.5 py-1 rounded">
                  {interest}
                  <button
                    className="ml-1.5 text-text-secondary hover:text-white focus:outline-none"
                    type="button"
                    onClick={() => removeInterest(interest)}
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </div>
              ))}
              <input
                className="flex-1 bg-transparent border-none focus:ring-0 p-0 text-sm text-white placeholder-text-secondary min-w-[120px]"
                id="interests"
                placeholder="Add an interest..."
                type="text"
                value={interestInput}
                onChange={(e) => setInterestInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addInterest(e)}
              />
            </div>
            <p className="text-xs text-text-secondary">Press enter to add tags</p>
          </div>

          <div className="pt-4 flex items-center justify-end">
            <button
              className="group relative flex items-center justify-center py-3 px-8 border border-transparent text-sm font-medium rounded text-[#111813] bg-primary hover:bg-[#10c94d] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all shadow-md hover:shadow-lg"
              type="submit"
            >
              Next Step
              <span className="material-symbols-outlined ml-2 text-base group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ProfileSetupStep1
