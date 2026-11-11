import Sidebar from './Sidebar'
import { useAuth } from '../context/AuthContext'

function Layout({ children }) {
  const { user } = useAuth()
  const userTitle = user?.title || 'Full Stack Dev'
  const displayName = user?.name || user?.email?.split('@')[0] || 'User'

  return (
    <div className="min-h-screen bg-gradient-to-br from-background-dark via-[#0d1a12] to-background-dark flex">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-y-auto bg-gradient-to-br from-background-dark via-[#0d1a12] to-background-dark">
        {/* Top Header */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#28392e] bg-[#111813]/90 px-6 py-4 backdrop-blur-md lg:px-10">
          <div className="flex items-center gap-4 lg:hidden">
            <span className="material-symbols-outlined text-white cursor-pointer">menu</span>
          </div>
          <h2 className="hidden text-xl font-bold leading-tight tracking-[-0.015em] text-white lg:block">Dashboard</h2>
          <div className="flex items-center gap-4 lg:gap-6">
            <button className="relative flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[#28392e] text-white transition-colors">
              <span className="material-symbols-outlined">notifications</span>
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary"></span>
            </button>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-white">{displayName}</p>
                <p className="text-xs text-text-secondary">{userTitle}</p>
              </div>
              <div
                className="h-10 w-10 overflow-hidden rounded-full bg-gray-700 bg-center bg-cover border-2 border-[#28392e]"
                style={{
                  backgroundImage: user?.picture
                    ? `url("${user.picture}")`
                    : 'none',
                }}
              >
                {!user?.picture && (
                  <div className="w-full h-full bg-gradient-to-br from-primary to-[#10c94d] flex items-center justify-center">
                    <span className="text-white font-bold">
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        {/* Main Content */}
        <div className="flex-1">
          {children}
        </div>
      </main>
    </div>
  )
}

export default Layout
