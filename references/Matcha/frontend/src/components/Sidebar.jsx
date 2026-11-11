import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAuth0 } from '@auth0/auth0-react'

function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { logout, user, isAuthenticated } = useAuth()
  const { logout: auth0Logout } = useAuth0()

  const navItems = [
    { path: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { path: '/results', icon: 'group', label: 'Matches' },
    { path: '/ideas', icon: 'lightbulb', label: 'Ideas' },
    { path: '/messages', icon: 'chat_bubble', label: 'Messages', badge: 3 },
    { path: '/team', icon: 'groups', label: 'Team' },
    { path: '/settings', icon: 'settings', label: 'Settings' },
  ]

  const isActive = (path) => location.pathname === path

  const handleLogout = () => {
    // Check if user is logged in via Auth0
    if (user?.provider === 'auth0') {
      auth0Logout({ returnTo: window.location.origin + '/' })
    } else {
      logout()
    }
  }

  return (
    <aside className="hidden lg:flex flex-col border-r border-[#28392e] bg-[#111813] p-6 sticky top-0 h-screen">
      <div className="flex flex-col gap-8 flex-1 min-h-0">
        {/* Logo */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="bg-primary/20 flex h-10 w-10 items-center justify-center rounded-xl">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: '24px' }}>emoji_food_beverage</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold leading-none text-white">Matcha</h1>
            <p className="text-text-secondary text-xs font-normal">Brewing Teams</p>
          </div>
        </div>

        {/* Nav Links */}
        <nav className="flex flex-col gap-2 flex-1 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`group flex items-center gap-3 rounded-lg px-4 py-3 transition-colors ${
                isActive(item.path)
                  ? 'bg-[#28392e] text-white'
                  : 'text-[#9db9a6] hover:bg-[#1f2b23] hover:text-white'
              }`}
            >
              <span className={`material-symbols-outlined ${isActive(item.path) ? 'text-primary' : 'group-hover:text-primary'} transition-colors`} data-weight={isActive(item.path) ? 'fill' : undefined}>
                {item.icon}
              </span>
              <span className="text-sm font-medium">{item.label}</span>
              {item.badge && (
                <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-[#111813]">
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {/* Bottom Action - Always visible at bottom */}
        <div className="flex-shrink-0 pt-4 border-t border-[#28392e]">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 rounded-lg px-4 py-3 text-[#9db9a6] hover:bg-[#1f2b23] hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined">logout</span>
            <span className="text-sm font-medium">Logout</span>
          </button>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
