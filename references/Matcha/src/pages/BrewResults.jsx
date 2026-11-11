import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'

function BrewResults() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState(['Skill: React', 'Role: Frontend'])

  const removeFilter = (filter) => {
    setFilters(filters.filter(f => f !== filter))
  }

  const brewers = [
    {
      id: 1,
      name: 'Alex Chen',
      title: 'Full Stack Wizard',
      match: 98,
      location: 'San Francisco, CA',
      description: 'Obsessed with clean code and dark mode UIs. Looking for a team to build a fintech tool. I bring coffee ☕️ and killer React skills.',
      skills: ['React', 'Node.js', 'Figma'],
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAwS_Hh67CDAofuHoeOrdA3mM9jab5aJU1vb2VKeq_0saXg6nsiGYOJZJGyNFkRjenXyQ_nmzC_NAXwL5j8tYm1cAmaHDWCKVM4GzOBhIXORfxaD35mnEvSrEG66hoOwrCrN_Y4cmb1TI-w_wi3auuC7hXmMn9z18PinbvMdN8fqzdhsgvrucfmkS8cCykIySbMPWeSJnTx4whss_ewgO1ndsXVJP3mzeLsLSEkFAYuANAeqSNEs4ernD-5-buM_SUEUxH5IlyPCdk',
    },
    {
      id: 2,
      name: 'Sarah Miller',
      title: 'UX/UI Designer',
      match: 85,
      location: 'New York, NY',
      description: 'I turn complex logic into simple, beautiful interfaces. Seeking backend devs to pair with. Let\'s win this hackathon!',
      skills: ['Figma', 'Tailwind', 'Prototyping'],
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCG-4GqU_2hDt1gTPSLHY2n0KZXDObLMJhnyzVDjMm4MRpOXFsO-hnrPnfX5mYtOsyqoO-q--vxLI1UMo3b61TB56JsLfWhFSYRchR_GlqddwwyvW2pKeAHUOGduWydHCbKO_yt6yfSjMeY4wyZLNXypMi1YZJPPHGzsqMsxuJVy0sHdOWpv92UhxUnqGC3Yw0QOR5rVw76dkNwZNnX2aGxFYYqey06fU2zrhN7fDYlN6ehgQNbYWFRAmxJk3HP-t4lucozrNkXw9s',
    },
    {
      id: 3,
      name: 'Davi Patel',
      title: 'Backend Engineer',
      match: 82,
      location: 'Austin, TX',
      description: 'Specialist in Python and Django. I can handle the API architecture while you make it look pretty.',
      skills: ['Python', 'Django', 'SQL'],
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB53ryvqnNh21xzDhquX5Hg6E3CzeJiZp5fQdNtr1Pr7Swg2c7MdYvRcTHS35c-vQB9n8toxS_kyNeei6_AQM_a3eiz1jFvkcQ2DpHbvdh9cjFWxNfamIzFxzRMKD8fRNbS6QBUeahPrdpEXgYpNqffO8AMOjfF5xDXAKlrpq0jmVJsCTXZ6kPK3jNZBxjGnrrSY8PpgB57fxU-QU8X2DsUVw0QTGZYk6r1bVa0TY8aBpUmjDo_SiNqAXQ4ruweNyQtq-QpojN-aB4',
    },
  ]

  const handleChat = (brewerId, brewerName) => {
    navigate(`/messages?user=${brewerId}&name=${encodeURIComponent(brewerName)}`)
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
                  Your <span className="text-primary">Brew</span> Results
                </h2>
                <p className="text-[#9db9a6] text-lg max-w-2xl">
                  We found <span className="text-white font-bold">12 brewers</span> compatible with your skills in <span className="text-white border-b border-primary/50">React</span> and <span className="text-white border-b border-primary/50">Python</span>.
                </p>
              </div>
              {/* Main Actions */}
              <div className="flex gap-3">
                <button className="flex items-center gap-2 px-4 py-2.5 bg-[#1e3626] text-white rounded-lg hover:bg-[#284a33] transition-colors font-medium text-sm">
                  <span className="material-symbols-outlined text-[20px]">tune</span>
                  Filters
                </button>
                <button className="flex items-center gap-2 px-4 py-2.5 bg-primary text-black rounded-lg hover:bg-[#0fd650] transition-colors font-bold text-sm shadow-[0_0_15px_rgba(19,236,91,0.3)]">
                  <span className="material-symbols-outlined text-[20px]">autorenew</span>
                  Refresh Brew
                </button>
              </div>
            </div>
            {/* Chips / Filters */}
            <div className="flex flex-wrap gap-3 pb-4 border-b border-[#28392e]">
              {filters.map((filter, idx) => (
                <button
                  key={idx}
                  onClick={() => removeFilter(filter)}
                  className="group flex h-9 items-center gap-2 rounded-full border border-[#28392e] bg-[#162a1d] pl-4 pr-3 text-sm font-medium text-white transition hover:border-primary/50 hover:bg-[#1e3626]"
                >
                  {filter}
                  <span className="material-symbols-outlined text-gray-400 group-hover:text-primary text-[18px]">close</span>
                </button>
              ))}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm text-[#9db9a6]">Sort by:</span>
                <button className="flex items-center gap-1 text-sm font-bold text-white hover:text-primary">
                  Match % <span className="material-symbols-outlined text-[18px]">arrow_drop_down</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Results Feed (8 cols) */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              {brewers.map((brewer) => (
                <article
                  key={brewer.id}
                  className="group relative flex flex-col sm:flex-row gap-0 sm:gap-6 rounded-xl bg-surface-dark border border-[#28392e] p-5 shadow-lg transition hover:border-primary/30 hover:shadow-[0_0_20px_rgba(19,236,91,0.05)]"
                >
                  {/* Match Badge */}
                  <div className={`absolute -top-3 -right-3 z-10 flex h-14 w-14 flex-col items-center justify-center rounded-full bg-[#102216] border-2 ${brewer.match >= 90 ? 'border-primary' : 'border-[#1e3626]'} shadow-lg`}>
                    <span className={`text-xs font-bold ${brewer.match >= 90 ? 'text-primary' : 'text-white'}`}>{brewer.match}%</span>
                    <span className={`text-[10px] ${brewer.match >= 90 ? 'text-primary/80' : 'text-gray-400'} uppercase tracking-tighter`}>Match</span>
                  </div>
                  {/* Avatar Side */}
                  <div className="flex-shrink-0 w-full sm:w-48 h-48 sm:h-auto relative rounded-lg overflow-hidden bg-gray-800 mb-4 sm:mb-0">
                    <img
                      alt={`Portrait of ${brewer.name}`}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      src={brewer.image}
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                      <div className="flex items-center gap-1 text-xs font-medium text-white">
                        <span className="material-symbols-outlined text-[14px] text-primary">location_on</span>
                        {brewer.location}
                      </div>
                    </div>
                  </div>
                  {/* Content Side */}
                  <div className="flex flex-1 flex-col justify-between gap-4">
                    <div>
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-xl font-bold text-white group-hover:text-primary transition-colors">{brewer.name}</h3>
                          <p className="text-[#9db9a6] text-sm font-medium">{brewer.title}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-gray-300 line-clamp-2">{brewer.description}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {brewer.skills.map((skill, idx) => (
                          <span key={idx} className="inline-flex items-center rounded bg-[#1e3626] px-2 py-1 text-xs font-medium text-white ring-1 ring-inset ring-white/10">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                    {/* Action Bar */}
                    <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-white/5 mt-2">
                      <button className="flex-1 min-w-[120px] bg-primary hover:bg-[#0fd650] text-black font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2 text-sm transition-all transform active:scale-95">
                        <span className="material-symbols-outlined text-[18px]">handshake</span>
                        Request
                      </button>
                      <button
                        onClick={() => handleChat(brewer.id, brewer.name)}
                        className="flex-1 min-w-[100px] bg-[#28392e] hover:bg-[#344a3b] text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 text-sm transition-colors border border-transparent hover:border-white/10"
                      >
                        <span className="material-symbols-outlined text-[18px]">chat</span>
                        Chat
                      </button>
                      <button
                        onClick={() => navigate(`/ideas?teammateId=${brewer.id}&teammateName=${encodeURIComponent(brewer.name)}`)}
                        className="w-full sm:w-auto bg-transparent border border-primary/30 hover:border-primary hover:bg-primary/10 text-primary font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 text-sm transition-colors"
                        title="Generate Ideas with this teammate"
                      >
                        <span className="material-symbols-outlined text-[18px]">lightbulb</span>
                        <span className="sr-only sm:not-sr-only">Ideas</span>
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              {/* Load More */}
              <div className="flex justify-center pt-4">
                <button className="group flex items-center gap-2 text-[#9db9a6] hover:text-white transition-colors text-sm font-medium">
                  <span>Show more candidates</span>
                  <span className="material-symbols-outlined transition-transform group-hover:translate-y-1">expand_more</span>
                </button>
              </div>
            </div>

            {/* Right Column: Sidebar (4 cols) */}
            <aside className="lg:col-span-4 space-y-6">
              {/* Rules Card */}
              <div className="rounded-xl bg-surface-dark border border-[#28392e] p-6 shadow-lg sticky top-24">
                <div className="flex items-center gap-2 mb-6 border-b border-[#28392e] pb-4">
                  <span className="material-symbols-outlined text-primary">gavel</span>
                  <h3 className="text-lg font-bold text-white">Hackathon Rules</h3>
                </div>
                <ul className="space-y-4">
                  <li className="flex gap-3 items-start">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold mt-0.5">1</div>
                    <div className="space-y-1">
                      <p className="text-white text-sm font-bold">No Pre-written Code</p>
                      <p className="text-xs text-[#9db9a6]">All code must be written during the event. Libraries and frameworks are allowed.</p>
                    </div>
                  </li>
                  <li className="flex gap-3 items-start">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold mt-0.5">2</div>
                    <div className="space-y-1">
                      <p className="text-white text-sm font-bold">Team Size Limit</p>
                      <p className="text-xs text-[#9db9a6]">Teams must be between 2 to 4 members. Solo participants can be matched here.</p>
                    </div>
                  </li>
                  <li className="flex gap-3 items-start">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold mt-0.5">3</div>
                    <div className="space-y-1">
                      <p className="text-white text-sm font-bold">Submission Deadline</p>
                      <p className="text-xs text-[#9db9a6]">All projects must be submitted to DevPost by Sunday, 12:00 PM EST.</p>
                    </div>
                  </li>
                </ul>
                <div className="mt-6 pt-4 border-t border-[#28392e]">
                  <h4 className="text-sm font-bold text-white mb-2">Event Status</h4>
                  <div className="w-full bg-[#102216] rounded-full h-2 mb-2">
                    <div className="bg-primary h-2 rounded-full" style={{ width: '35%' }}></div>
                  </div>
                  <div className="flex justify-between text-xs text-[#9db9a6]">
                    <span>Kickoff</span>
                    <span>Judging</span>
                  </div>
                </div>
              </div>
              {/* Promo Card */}
              <div className="rounded-xl bg-gradient-to-br from-[#1e3626] to-[#102216] border border-[#28392e] p-6 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">Need Inspiration?</h3>
                  <span className="material-symbols-outlined text-yellow-400">emoji_objects</span>
                </div>
                <p className="text-sm text-[#9db9a6] mb-4">
                  Use our AI idea generator to find a project that fits your team's skill stack.
                </p>
                <button className="w-full py-2 px-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-bold transition-colors">
                  Launch Idea Generator
                </button>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </Layout>
  )
}

export default BrewResults
