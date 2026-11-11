import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isAuthenticated } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Get the intended destination from location state, or default to dashboard
  const from = location.state?.from?.pathname || '/dashboard'

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true })
    }
  }, [isAuthenticated, navigate, from])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const result = await login(email, password)

    // Check if user has completed survey
    if (result.user && !result.user.surveyCompleted) {
      navigate('/survey', { replace: true })
    } else {
      navigate('/dashboard', { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl overflow-hidden">
        <div className="grid md:grid-cols-2 min-h-[700px]">
          {/* Left Panel - Login Form */}
          <div className="p-8 md:p-12 bg-white flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-8">
              <div className="w-8 h-8 bg-forest rounded flex items-center justify-center">
                <span className="material-icons-outlined text-white text-xl">local_cafe</span>
              </div>
              <span className="text-2xl font-bold text-gray-900">Matcha</span>
            </div>

            <h2 className="text-3xl font-bold mb-2 text-gray-900">Welcome Back</h2>
            <p className="text-gray-600 mb-8">
              Find the right teammates for the right hackathon. Let's get brewing.
            </p>

            {/* Simple Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                    <span className="material-icons-outlined text-lg">mail</span>
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
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
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest focus:border-forest text-gray-900 bg-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-forest text-white text-center py-3 rounded-lg font-semibold hover:bg-forest-mid transition"
              >
                Sign In
              </button>
            </form>

            <p className="mt-6 text-center text-gray-600">
              Don't have an account?{' '}
              <Link to="/signup" className="text-forest font-semibold hover:underline">
                Sign up
              </Link>
            </p>
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
                  <span className="material-icons-outlined text-white text-6xl opacity-90">groups</span>
                </div>
                <div className="w-24 h-24 bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/15 -mt-6 ml-20 shadow-lg">
                  <span className="material-icons-outlined text-white text-4xl opacity-80">code</span>
                </div>
              </div>

              <h3 className="text-3xl font-bold text-white mb-4">
                Find Your Perfect Squad
              </h3>
              <p className="text-white/90 text-lg leading-relaxed">
                Connect with talented developers, designers, and builders at hackathons. AI-powered matching helps you form winning teams.
              </p>

              {/* Feature Pills */}
              <div className="mt-10 flex flex-col gap-3">
                <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-3 border border-white/15">
                  <span className="material-icons-outlined text-white">search</span>
                  <span className="text-white text-sm font-medium">AI-Powered Matching</span>
                </div>
                <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-3 border border-white/15">
                  <span className="material-icons-outlined text-white">code</span>
                  <span className="text-white text-sm font-medium">Skill-Based Discovery</span>
                </div>
                <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-3 border border-white/15">
                  <span className="material-icons-outlined text-white">workspace_premium</span>
                  <span className="text-white text-sm font-medium">Build Winning Projects</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
