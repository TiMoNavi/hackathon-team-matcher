import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function ProfileSetupStep2() {
  const navigate = useNavigate()
  const { user, updateProfile } = useAuth()
  const [skills, setSkills] = useState(user?.skills || [])
  const [skillInput, setSkillInput] = useState('')
  const [resumeFile, setResumeFile] = useState(null)

  // Load existing user data if available
  useEffect(() => {
    if (user?.skills) {
      setSkills(user.skills)
    }
  }, [user])

  const addSkill = (e) => {
    e.preventDefault()
    if (skillInput.trim()) {
      setSkills([...skills, skillInput.trim()])
      setSkillInput('')
    }
  }

  const removeSkill = (skill) => {
    setSkills(skills.filter(s => s !== skill))
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file && file.type === 'application/pdf' && file.size <= 5 * 1024 * 1024) {
      setResumeFile(file)
    } else if (file) {
      alert('Please upload a PDF file under 5MB')
    }
  }

  const handleSave = async () => {
    // Save step 2 data (skills and resume) before going to dashboard
    if (updateProfile) {
      const result = await updateProfile({
        skills,
        resume: resumeFile ? resumeFile.name : null,
      })

      if (result.success) {
        navigate('/dashboard', { replace: true })
      }
    } else {
      navigate('/dashboard', { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-background-dark flex items-center justify-center p-4">
      <div className="w-full max-w-5xl bg-surface-dark rounded-lg border border-[#28392e] overflow-hidden">
        <div className="grid md:grid-cols-2">
          {/* Left Section - Info */}
          <div className="bg-[#0d1a12] p-12 flex flex-col justify-center items-center text-center">
            <div className="w-24 h-24 bg-[#28392e] rounded-full flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-5xl text-primary">upload_file</span>
            </div>
            <h2 className="text-2xl font-bold mb-4 text-white">Showcase Your Expertise</h2>
            <p className="text-text-secondary">
              Adding your skills and resume helps us brew the perfect team match for you.
            </p>
            <div className="mt-8 w-16 h-16 bg-primary/10 rounded-full opacity-50"></div>
          </div>

          {/* Right Section - Form */}
          <div className="p-8 md:p-12">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-white">Profile Setup</h2>
              <span className="text-sm text-text-secondary">Step 2 of 2</span>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Skills
                </label>
                <div className="min-h-[3rem] p-2 w-full rounded border border-[#3b5443] bg-[#28392e] flex flex-wrap gap-2 focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-colors">
                  {skills.map((skill, idx) => (
                    <div key={idx} className="inline-flex items-center bg-[#3b5443] text-white text-xs font-medium px-2.5 py-1 rounded">
                      {skill}
                      <button
                        onClick={() => removeSkill(skill)}
                        className="ml-1.5 text-text-secondary hover:text-white focus:outline-none"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    </div>
                  ))}
                  <input
                    type="text"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addSkill(e)}
                    placeholder="Type and press Enter to add skills..."
                    className="flex-1 bg-transparent border-none focus:ring-0 p-0 text-sm text-white placeholder-text-secondary min-w-[200px]"
                  />
                </div>
                <p className="text-xs text-text-secondary mt-1">
                  Add at least 3 skills to help us match you better.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Resume
                </label>
                <label className="block">
                  <div className="border-2 border-dashed border-[#3b5443] rounded-lg p-12 text-center hover:border-primary transition cursor-pointer">
                    <span className="material-symbols-outlined text-5xl text-primary mb-4 block">description</span>
                    <p className="text-text-primary font-medium mb-1">Upload resume (PDF)</p>
                    <p className="text-sm text-text-secondary">Optional. PDF up to 5MB.</p>
                    {resumeFile && (
                      <p className="text-sm text-primary mt-2 font-medium">{resumeFile.name}</p>
                    )}
                  </div>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="flex justify-between items-center pt-4">
                <button
                  onClick={() => navigate('/profile/step1')}
                  className="text-text-secondary hover:text-white transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleSave}
                  className="px-6 py-3 bg-primary text-[#111813] rounded-lg font-semibold hover:bg-[#10c94d] transition"
                >
                  Save Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProfileSetupStep2
