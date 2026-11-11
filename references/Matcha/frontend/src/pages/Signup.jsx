import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function Signup() {
  const navigate = useNavigate()
  const { login, isAuthenticated } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true })
    }
  }, [isAuthenticated, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    // Accept any email/password
    const result = await login(email, password)

    // New signups should always go to survey
    navigate('/survey', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl overflow-hidden">
        <div className="grid md:grid-cols-2 min-h-[700px]">
          {/* Left Panel - Signup Form */}
          <div className="p-8 md:p-12 bg-white flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-8">
              <div className="w-8 h-8 bg-forest rounded flex items-center justify-center">
                <span className="material-icons-outlined text-white text-xl">local_cafe</span>
              </div>
              <span className="text-2xl font-bold text-gray-900">Matcha</span>
            </div>

            <h2 className="text-3xl font-bold mb-2 text-gray-900">Create Account</h2>
            <p className="text-gray-600 mb-8">
              Join Matcha and start building amazing projects with the perfect team.
            </p>

            {/* Simple Signup Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email address
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                    <span className="material-icons-outlined text-lg">mail</span>
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="test@matcha.app"
                    required
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest focus:border-forest text-gray-900 bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                    <span className="material-icons-outlined text-lg">lock</span>
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest focus:border-forest text-gray-900 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <span className="material-icons-outlined text-lg">
                      {showPassword ? 'visibility' : 'visibility_off'}
                    </span>
                  </button>
                </div>
              </div>
              <button
                type="submit"
                className="w-full bg-forest text-white text-center py-3 rounded-lg font-semibold hover:bg-forest-mid transition"
              >
                Sign Up
              </button>
            </form>

            <p className="mt-6 text-center text-gray-600">
              Already have an account?{' '}
              <Link to="/login" className="text-forest font-semibold hover:underline">
                Log in
              </Link>
            </p>

            <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-800 text-xs text-center">
                ℹ️ Demo Mode: Any email/password will work
              </p>
            </div>
          </div>

          {/* Right Panel - Forest Green Gradient */}
          <div className="hidden md:flex bg-gradient-to-b from-forest-dark to-forest p-12 flex-col items-center justify-center relative overflow-hidden">
            {/* Decorative Elements */}
            <div className="absolute top-10 left-10 w-32 h-32 bg-white/5 rounded-full blur-3xl"></div>
            <div className="absolute bottom-20 right-10 w-48 h-48 bg-black/10 rounded-full blur-3xl"></div>

            <div className="relative z-10 text-center max-w-md">
              {/* Icon Stack */}
              <div className="mb-10 flex flex-col items-center">
                <div className="w-36 h-36 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/20 shadow-xl">
                  <span className="material-icons-outlined text-white text-6xl opacity-90">rocket_launch</span>
                </div>
                <div className="w-24 h-24 bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/15 -mt-6 ml-20 shadow-lg">
                  <span className="material-icons-outlined text-white text-4xl opacity-80">emoji_events</span>
                </div>
              </div>

              <h3 className="text-3xl font-bold text-white mb-4">
                Start Your Journey
              </h3>
              <p className="text-white/80 text-lg mb-10">
                Join thousands of hackers finding their perfect teammates and building winning projects.
              </p>

              {/* Pagination Dots */}
              <div className="flex justify-center gap-2">
                <div className="w-2 h-2 bg-white/40 rounded-full"></div>
                <div className="w-2 h-2 bg-white rounded-full"></div>
                <div className="w-2 h-2 bg-white/40 rounded-full"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Signup