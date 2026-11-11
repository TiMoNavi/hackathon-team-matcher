import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'

function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [hackathonUrl, setHackathonUrl] = useState('')

  const handleFindTeammates = () => {
    if (hackathonUrl.trim()) {
      // Pass hackathon URL to brewing page via state
      navigate('/brewing', { state: { hackathonUrl } })
    } else {
      alert('Please enter a hackathon URL')
    }
  }

  const displayName = user?.name || user?.email?.split('@')[0] || 'User'
  const firstName = displayName.split(' ')[0]

  return (
    <Layout>
      <div className="flex flex-1 flex-col p-6 lg:p-10 gap-8 max-w-7xl mx-auto w-full bg-gradient-to-br from-background-dark via-[#0d1a12] to-background-dark">
        {/* Welcome Section */}
        <section className="flex flex-col gap-2">
          <h1 className="text-3xl lg:text-4xl font-black leading-tight tracking-[-0.033em] text-white">
            Welcome back, {firstName} <span className="text-primary">.</span>
          </h1>
          <p className="text-text-secondary text-base lg:text-lg">Ready to brew some code today?</p>
        </section>

        {/* Hero / Find Teammates */}
        <section className="relative overflow-hidden rounded-2xl bg-[#18261e] border border-[#28392e]">
          {/* Abstract Background Pattern */}
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#13ec5b 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
          <div className="relative flex flex-col items-center justify-center px-4 py-12 text-center lg:py-16">
            <div className="mb-6 rounded-full bg-primary/10 p-3 ring-1 ring-primary/30">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: '32px' }}>rocket_launch</span>
            </div>
            <h2 className="mb-3 max-w-2xl text-2xl font-bold text-white lg:text-3xl">Ready to brew a new project?</h2>
            <p className="mb-8 max-w-lg text-text-secondary">Paste a Devpost or hackathon URL below to instantly start the matching process with compatible teammates.</p>
            <div className="w-full max-w-xl">
              <div className="flex flex-col sm:flex-row shadow-lg rounded-lg overflow-hidden">
                <input
                  type="text"
                  value={hackathonUrl}
                  onChange={(e) => setHackathonUrl(e.target.value)}
                  placeholder="Paste hackathon URL (e.g. devpost.com/...)"
                  className="flex-1 border-0 bg-[#28392e] px-6 py-4 text-white placeholder-text-secondary focus:ring-2 focus:ring-primary focus:outline-none"
                />
                <button
                  onClick={handleFindTeammates}
                  className="bg-primary px-8 py-4 text-base font-bold text-[#111813] hover:bg-[#10c94d] transition-colors flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-xl">search</span>
                  Find Teammates
                </button>
              </div>
            </div>
          </div>
        </section>

      </div>
    </Layout>
  )
}

export default Dashboard
