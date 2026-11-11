import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function Survey() {
  const navigate = useNavigate()
  const { user, updateProfile } = useAuth()

  const [step, setStep] = useState(1)
  const [selectedRoles, setSelectedRoles] = useState([])
  const [experience, setExperience] = useState('')
  const [skills, setSkills] = useState([])
  const [skillInput, setSkillInput] = useState('')
  const [interests, setInterests] = useState([])
  const [interestInput, setInterestInput] = useState('')

  const roles = [
    { id: 'frontend', label: 'Frontend', icon: 'code', desc: 'Build user interfaces and experiences' },
    { id: 'backend', label: 'Backend', icon: 'storage', desc: 'Work on servers, databases & APIs' },
    { id: 'design', label: 'Design', icon: 'design_services', desc: 'Create visual designs and prototypes' },
    { id: 'product', label: 'Product', icon: 'rocket_launch', desc: 'Define features and strategy' },
  ]

  const experiences = [
    { value: 'beginner', label: 'Beginner', desc: "This is my first hackathon or I'm new to team projects" },
    { value: 'intermediate', label: 'Intermediate', desc: "I've participated in 1-3 hackathons before" },
    { value: 'advanced', label: 'Advanced', desc: "I'm a hackathon veteran with 4+ experiences" },
  ]

  const toggleRole = (roleId) => {
    if (selectedRoles.includes(roleId)) {
      setSelectedRoles(selectedRoles.filter(r => r !== roleId))
    } else {
      setSelectedRoles([...selectedRoles, roleId])
    }
  }

  const addSkill = (e) => {
    if (e.key === 'Enter' && skillInput.trim()) {
      e.preventDefault()
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
      e.preventDefault()
      if (!interests.includes(interestInput.trim())) {
        setInterests([...interests, interestInput.trim()])
      }
      setInterestInput('')
    }
  }

  const removeInterest = (interest) => {
    setInterests(interests.filter(i => i !== interest))
  }

  const handleNext = () => {
    if (step === 1 && selectedRoles.length === 0) {
      alert('Please select at least one role')
      return
    }
    if (step === 2 && !experience) {
      alert('Please select your experience level')
      return
    }
    if (step < 4) {
      setStep(step + 1)
    }
  }

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1)
    }
  }

  const handleSubmit = async () => {
    if (skills.length === 0) {
      alert('Please add at least one technical skill')
      return
    }
    if (interests.length === 0) {
      alert('Please add at least one interest')
      return
    }

    // Save all survey data to user profile
    const result = await updateProfile({
      preferredRoles: selectedRoles,
      experience,
      skills,
      interests,
      surveyCompleted: true,
    })

    if (result.success) {
      navigate('/dashboard')
    }
  }

  const handleSkip = () => {
    updateProfile({ surveyCompleted: true })
    navigate('/dashboard')
  }

  const progress = (step / 4) * 100

  return (
    <div className="min-h-screen bg-gradient-to-br from-background-dark via-[#0d1a12] to-background-dark flex items-center justify-center p-4">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(#13ec5b 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>

      <div className="relative z-10 bg-surface-dark border border-[#28392e] rounded-2xl shadow-2xl w-full max-w-2xl p-8 md:p-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-forest/20 rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-forest text-xl">local_cafe</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Welcome to Matcha!</h1>
                <p className="text-text-secondary text-sm">Let's personalize your experience</p>
              </div>
            </div>
            <button
              onClick={handleSkip}
              className="text-text-secondary hover:text-white text-sm font-medium transition"
            >
              Skip for now
            </button>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-surface-highlight rounded-full h-2 overflow-hidden">
            <div
              className="bg-forest h-full transition-all duration-300 rounded-full"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-text-secondary text-xs mt-2">Step {step} of 4</p>
        </div>

        {/* Step 1: Preferred Roles */}
        {step === 1 && (
          <div className="space-y-6 animate-fadeIn">
            <div>
              <h2 className="text-xl font-bold text-white mb-2">What's your preferred role?</h2>
              <p className="text-text-secondary">Select all that apply. This helps us match you with complementary teammates.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {roles.map((role) => {
                const isSelected = selectedRoles.includes(role.id)
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => toggleRole(role.id)}
                    className={`relative p-5 border-2 rounded-xl transition text-left ${
                      isSelected
                        ? 'border-forest bg-forest/10'
                        : 'border-[#28392e] bg-surface-dark hover:border-[#3b5443]'
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute top-3 right-3 text-forest">
                        <span className="material-symbols-outlined text-xl">check_circle</span>
                      </span>
                    )}
                    <div className="flex items-start gap-3">
                      <span className={`material-symbols-outlined text-3xl ${isSelected ? 'text-forest' : 'text-text-secondary'}`}>
                        {role.icon}
                      </span>
                      <div>
                        <h3 className={`font-semibold mb-1 ${isSelected ? 'text-white' : 'text-text-secondary'}`}>
                          {role.label}
                        </h3>
                        <p className="text-text-secondary text-sm">{role.desc}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Step 2: Experience Level */}
        {step === 2 && (
          <div className="space-y-6 animate-fadeIn">
            <div>
              <h2 className="text-xl font-bold text-white mb-2">What's your hackathon experience?</h2>
              <p className="text-text-secondary">We'll use this to match you with teammates at a similar level.</p>
            </div>

            <div className="space-y-3">
              {experiences.map((exp) => (
                <label
                  key={exp.value}
                  className={`flex items-start gap-4 p-5 border-2 rounded-xl cursor-pointer transition ${
                    experience === exp.value
                      ? 'border-forest bg-forest/10'
                      : 'border-[#28392e] bg-surface-dark hover:border-[#3b5443]'
                  }`}
                >
                  <input
                    type="radio"
                    name="experience"
                    value={exp.value}
                    checked={experience === exp.value}
                    onChange={(e) => setExperience(e.target.value)}
                    className="mt-1 w-4 h-4 text-forest focus:ring-forest focus:ring-offset-0 bg-surface-dark border-[#28392e]"
                  />
                  <div className="flex-1">
                    <p className={`font-semibold mb-1 ${experience === exp.value ? 'text-white' : 'text-text-secondary'}`}>
                      {exp.label}
                    </p>
                    <p className="text-text-secondary text-sm">{exp.desc}</p>
                  </div>
                  {experience === exp.value && (
                    <span className="text-forest">
                      <span className="material-symbols-outlined">check_circle</span>
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Technical Skills */}
        {step === 3 && (
          <div className="space-y-6 animate-fadeIn">
            <div>
              <h2 className="text-xl font-bold text-white mb-2">What are your technical skills?</h2>
              <p className="text-text-secondary">Add programming languages, frameworks, tools, or technologies you're comfortable with.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-3">Technical Skills</label>
              <div className="min-h-[120px] p-4 w-full rounded-xl border-2 border-[#28392e] bg-surface-dark flex flex-wrap gap-2 focus-within:border-forest transition">
                {skills.map((skill, idx) => (
                  <div key={idx} className="inline-flex items-center bg-forest/20 border border-forest/30 text-white text-sm font-medium px-3 py-1.5 rounded-lg gap-2">
                    <span className="material-symbols-outlined text-base text-forest">code</span>
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
                  placeholder={skills.length === 0 ? "e.g., React, Python, Figma..." : "Add another skill..."}
                  className="flex-1 bg-transparent border-none focus:ring-0 p-2 text-white placeholder-text-secondary min-w-[200px]"
                />
              </div>
              <p className="text-text-secondary text-xs mt-2">
                <span className="material-symbols-outlined text-xs align-middle">info</span>
                {' '}Press Enter to add each skill
              </p>
            </div>

            {/* Skill Suggestions */}
            <div className="flex flex-wrap gap-2">
              <p className="text-text-secondary text-sm w-full">Quick add:</p>
              {['JavaScript', 'Python', 'React', 'Node.js', 'TypeScript', 'Figma', 'MongoDB'].map((suggestion) => (
                !skills.includes(suggestion) && (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setSkills([...skills, suggestion])}
                    className="px-3 py-1 bg-surface-highlight border border-[#28392e] rounded-lg text-text-secondary hover:text-white hover:border-forest text-sm transition"
                  >
                    + {suggestion}
                  </button>
                )
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Interests */}
        {step === 4 && (
          <div className="space-y-6 animate-fadeIn">
            <div>
              <h2 className="text-xl font-bold text-white mb-2">What are your interests?</h2>
              <p className="text-text-secondary">Tell us what domains or problem areas excite you most.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-3">Interests & Domains</label>
              <div className="min-h-[120px] p-4 w-full rounded-xl border-2 border-[#28392e] bg-surface-dark flex flex-wrap gap-2 focus-within:border-forest transition">
                {interests.map((interest, idx) => (
                  <div key={idx} className="inline-flex items-center bg-forest/20 border border-forest/30 text-white text-sm font-medium px-3 py-1.5 rounded-lg gap-2">
                    <span className="material-symbols-outlined text-base text-forest">interests</span>
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
                  placeholder={interests.length === 0 ? "e.g., AI/ML, Web3, Healthcare..." : "Add another interest..."}
                  className="flex-1 bg-transparent border-none focus:ring-0 p-2 text-white placeholder-text-secondary min-w-[200px]"
                />
              </div>
              <p className="text-text-secondary text-xs mt-2">
                <span className="material-symbols-outlined text-xs align-middle">info</span>
                {' '}Press Enter to add each interest
              </p>
            </div>

            {/* Interest Suggestions */}
            <div className="flex flex-wrap gap-2">
              <p className="text-text-secondary text-sm w-full">Quick add:</p>
              {['AI/ML', 'Web3', 'Healthcare', 'FinTech', 'EdTech', 'Climate Tech', 'Gaming'].map((suggestion) => (
                !interests.includes(suggestion) && (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setInterests([...interests, suggestion])}
                    className="px-3 py-1 bg-surface-highlight border border-[#28392e] rounded-lg text-text-secondary hover:text-white hover:border-forest text-sm transition"
                  >
                    + {suggestion}
                  </button>
                )
              ))}
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between gap-4 mt-10 pt-6 border-t border-[#28392e]">
          <button
            onClick={handleBack}
            disabled={step === 1}
            className="px-6 py-3 border border-[#28392e] rounded-lg text-white hover:bg-surface-highlight transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back
          </button>

          {step < 4 ? (
            <button
              onClick={handleNext}
              className="px-6 py-3 bg-forest text-white rounded-lg hover:bg-forest-mid transition font-medium flex items-center gap-2"
            >
              Continue
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="px-6 py-3 bg-forest text-white rounded-lg hover:bg-forest-mid transition font-medium flex items-center gap-2"
            >
              Complete Setup
              <span className="material-symbols-outlined text-sm">check</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default Survey
