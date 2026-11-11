import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { teamStorage } from '../utils/teamStorage'
import { useAuth } from '../context/AuthContext'

function Team() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [team, setTeam] = useState([])

  useEffect(() => {
    // Load team members from storage
    const currentTeam = teamStorage.getTeam()

    // Add current user to team if not already present
    if (user && !teamStorage.isMemberInTeam('current-user')) {
      const currentUserProfile = {
        id: 'current-user',
        name: user.name || user.email?.split('@')[0] || 'You',
        avatar: 'bg-gradient-to-br from-primary to-matcha-dark',
        skills: user.skills || [],
        experience: user.experience || 'intermediate',
        role: user.preferredRoles?.[0] || 'Team Lead',
        addedAt: new Date().toISOString(),
        status: 'accepted',
        isCurrentUser: true
      }
      teamStorage.addMember(currentUserProfile)
      setTeam([currentUserProfile, ...currentTeam])
    } else {
      setTeam(currentTeam)
    }
  }, [user])

  const handleRemoveMember = (memberId) => {
    if (window.confirm('Are you sure you want to remove this team member?')) {
      const updatedTeam = teamStorage.removeMember(memberId)
      setTeam(updatedTeam)
    }
  }

  const handleClearTeam = () => {
    if (window.confirm('Are you sure you want to remove all team members?')) {
      teamStorage.clearTeam()
      setTeam([])
    }
  }

  return (
    <Layout>
      <div className="min-h-screen flex flex-col bg-background-dark">
        <main className="flex-1 w-full max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8">
          {/* Page Header */}
          <div className="flex flex-col gap-6 mb-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="space-y-2">
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
                  Your <span className="text-primary">Team</span>
                </h2>
                <p className="text-[#9db9a6] text-lg max-w-2xl">
                  You have <span className="text-white font-bold">{team.length} {team.length === 1 ? 'member' : 'members'}</span> on your team.
                </p>
              </div>
              {team.length > 0 && (
                <button
                  onClick={handleClearTeam}
                  className="flex items-center gap-2 px-6 py-3 bg-red-600/20 border border-red-600/30 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors font-bold text-sm"
                >
                  <span className="material-symbols-outlined text-[20px]">delete</span>
                  Clear Team
                </button>
              )}
            </div>
            {/* Divider */}
            <div className="border-b border-[#28392e]"></div>
          </div>

          {/* Team Members Grid */}
          {team.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {team.map((member) => (
                <article
                  key={member.id}
                  className="group relative flex flex-col rounded-xl bg-surface-dark border border-[#28392e] p-6 shadow-lg transition hover:border-primary/30 hover:shadow-[0_0_20px_rgba(19,236,91,0.05)]"
                >
                  {/* Member Avatar and Info */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className={`w-16 h-16 ${member.avatar || 'bg-matcha-green'} rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0`}>
                      {member.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-bold text-white truncate group-hover:text-primary transition-colors">
                        {member.name}
                      </h3>
                      <p className="text-[#9db9a6] text-sm font-medium truncate">
                        {member.role || 'Hackathon Participant'}
                      </p>
                      <p className="text-gray-400 text-xs mt-1">
                        {member.experience ? member.experience.charAt(0).toUpperCase() + member.experience.slice(1) : 'Intermediate'} Level
                      </p>
                    </div>
                  </div>

                  {/* Skills */}
                  {member.skills && member.skills.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs text-gray-400 mb-2 font-medium">Skills:</p>
                      <div className="flex flex-wrap gap-2">
                        {member.skills.slice(0, 6).map((skill, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center rounded bg-[#1e3626] px-2 py-1 text-xs font-medium text-white ring-1 ring-inset ring-white/10"
                          >
                            {skill}
                          </span>
                        ))}
                        {member.skills.length > 6 && (
                          <span className="text-xs text-gray-400">+{member.skills.length - 6} more</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Member Actions */}
                  {!member.isCurrentUser && (
                    <div className="mt-auto pt-4 border-t border-white/5 flex gap-2">
                      <button
                        onClick={() => navigate(`/messages?user=${encodeURIComponent(member.id)}&name=${encodeURIComponent(member.name)}`)}
                        className="flex-1 bg-primary/10 border border-primary/30 hover:bg-primary/20 text-primary font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 text-sm transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">chat</span>
                        Message
                      </button>
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        className="bg-red-600/10 border border-red-600/30 hover:bg-red-600/20 text-red-400 font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 text-sm transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">person_remove</span>
                        Remove
                      </button>
                    </div>
                  )}
                  {member.isCurrentUser && (
                    <div className="mt-auto pt-4 border-t border-white/5">
                      <div className="bg-primary/10 border border-primary/30 text-primary font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 text-sm">
                        <span className="material-symbols-outlined text-[18px]">star</span>
                        Team Leader
                      </div>
                    </div>
                  )}

                  {/* Added Date */}
                  <p className="text-xs text-gray-500 mt-3 text-center">
                    Joined {new Date(member.addedAt).toLocaleDateString()}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-6 bg-surface-dark border border-[#28392e] rounded-xl">
              <span className="material-symbols-outlined text-[#9db9a6] text-6xl mb-4">group_off</span>
              <h3 className="text-xl font-bold text-white mb-2">No team members yet</h3>
              <p className="text-[#9db9a6] text-center max-w-md mb-6">
                Start by finding teammates in the Matches section. When you send them a request and they accept, they'll appear here.
              </p>
              <button
                onClick={() => navigate('/dashboard')}
                className="px-6 py-3 bg-primary text-black rounded-lg font-bold hover:bg-[#0fd650] transition-colors"
              >
                Find Teammates
              </button>
            </div>
          )}
        </main>
      </div>
    </Layout>
  )
}

export default Team
