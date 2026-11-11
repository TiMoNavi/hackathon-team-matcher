import { Link, useNavigate } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { useAuth } from '../context/AuthContext'
import { useEffect, useState } from 'react'
import processVideo from '../assets/images/process.mp4'
import landingImage from '../assets/images/landing.png'

function Landing() {
  const { loginWithRedirect } = useAuth0()
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [testimonialIndex, setTestimonialIndex] = useState(0)

  const testimonials = [
    { name: 'Andrew Norris', role: 'Developer', quote: 'Huge fan of Matcha, it helps us embed, translate and point users to our support centre. Amazingly responsive team too. Happy customer, let us pay you more!' },
    { name: 'Hilda Griffith', role: 'Designer', quote: 'Support is both attractive and highly adaptable. Support is exactly what our business has been lacking. Support is the most valuable business resource we have EVER purchased.' },
    { name: 'Cora Atkins', role: 'PM Lead', quote: "It's just amazing. 24/7 support, both attractive and highly adaptable. The support concierge is awesome!" },
    { name: 'Marcus Chen', role: 'Full Stack Dev', quote: 'Matcha paired me with a designer in minutes—our hackathon project shipped on time. Best team matching experience ever.' },
    { name: 'Priya Sharma', role: 'ML Engineer', quote: 'Great gradient look, smooth Auth0 login, and the team dashboard keeps me on track. Highly recommend!' },
  ]

  // Auto-scroll testimonials with smooth 3D effect
  useEffect(() => {
    const id = setInterval(() => {
      setTestimonialIndex((prev) => (prev + 1) % testimonials.length)
    }, 5000) // 5 seconds to appreciate the 3D transition
    return () => clearInterval(id)
  }, [testimonials.length])

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true })
    }
  }, [isAuthenticated, navigate])

  // Don't render landing page if authenticated
  if (isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="material-icons-outlined text-forest text-3xl">local_cafe</span>
            <span className="text-xl font-bold tracking-tight text-gray-900">Matcha</span>
          </div>
          <Link className="text-sm font-medium text-gray-500 hover:text-forest transition-colors" to="/login">
            Log in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main 
        className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:py-28"
        style={{ color: 'rgba(47, 96, 73, 1)' }}
      >
        {/* Left content */}
        <div className="max-w-2xl">
          <h1 className="mt-6 text-5xl font-extrabold tracking-tight text-gray-900 sm:text-6xl">
            Brewing your
            <br />
            <span className="text-forest">perfect hack team</span>
          </h1>

          <p className="mt-6 text-lg leading-relaxed text-gray-600">
            Don&apos;t let a great idea go to waste. Connect with developers, designers, and visionaries. Build projects
            that matter in a low-fidelity, high-impact environment.
          </p>

          

          
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              to="/signup"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-forest px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-forest-mid"
              style={{ marginTop: '10px', marginBottom: '10px' }}
            >
              Get Started <span className="material-icons-outlined text-base">arrow_downward</span>
            </Link>
            <a
              href="#about"
              className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-50"
            >
              Learn more
            </a>
          </div>
        </div>

        {/* Right graphic */}
        <div className="relative hidden justify-center lg:flex">
          <div className="relative h-[420px] w-[420px]">
            {/* rings */}
            <div className="absolute inset-0 rounded-full border-2 border-dashed border-gray-300" />
            <div className="absolute inset-10 rounded-full border border-gray-200" />

            {/* center card */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative flex items-center justify-center rounded-3xl border border-gray-200 bg-white shadow-2xl rotate-[-10deg] overflow-hidden" style={{ width: '267px', height: '267px' }}>
                <img 
                  src={landingImage} 
                  alt="Matcha" 
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* floating pills */}
            <div className="absolute right-16 top-10 flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-200 bg-white shadow-lg">
              <span className="material-icons-outlined text-gray-500">code</span>
            </div>
            <div className="absolute bottom-14 left-16 flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 bg-white shadow-lg">
              <span className="material-icons-outlined text-gray-500">groups</span>
            </div>
            <div className="absolute bottom-14 right-16 flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 bg-white shadow-lg">
              <span className="material-icons-outlined text-gray-500">edit</span>
            </div>
          </div>
        </div>
      </main>

      {/* Testimonials - Split layout with 3D carousel */}
      <section className="h-[400px] grid grid-cols-1 lg:grid-cols-2 relative overflow-visible">
        {/* Stories title in top left corner */}
        <div className="absolute top-6 left-6 lg:top-8 lg:left-8 z-20">
          <h2 
            className="text-sm font-semibold text-forest uppercase tracking-widest"
            style={{
              color: 'rgba(20, 47, 34, 1)',
              fontSize: '25px',
              fontFamily: '-apple-system',
              letterSpacing: '4.3px'
            }}
          >
            Stories
          </h2>
        </div>
        {/* Left side - White with title (behind everything) */}
        <div className="bg-white flex flex-col justify-center px-8 lg:px-16 relative z-0" style={{ height: '400px', paddingTop: '43px', paddingBottom: '64px' }}>
          {/* Decorative shapes */}
          <div className="absolute top-10 left-10 w-40 h-40 border-2 border-gray-100 rounded-full opacity-30" style={{ transform: 'scale(1.2)' }} />
          <div className="absolute bottom-20 left-20 w-24 h-24 border border-gray-100 rounded-full opacity-20" />
          
          <div className="relative z-0">
          </div>
        </div>

        {/* Right side - Green background */}
        <div 
          className="bg-gradient-to-br from-forest via-forest-mid to-forest-dark absolute top-1/2 -translate-y-1/2 lg:relative lg:top-0 lg:translate-y-0 h-[150px] lg:h-[400px] w-full lg:w-auto z-0"
          style={{ 
            background: 'linear-gradient(135deg, #52b788 0%, #2d6a4f 50%, #1b4332 100%)',
          }}
        >
        </div>

        {/* 3D Carousel container - centered across entire section for large screens */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none lg:pointer-events-auto overflow-visible z-10" style={{ height: '400px' }}>
          <div className="relative w-full max-w-7xl mx-auto px-6 lg:px-8 min-h-[350px] flex items-center justify-center overflow-visible" style={{ perspective: '1500px', perspectiveOrigin: '50% 50%' }}>
            {testimonials.map((t, idx) => {
              const offset = idx - testimonialIndex
              const absOffset = Math.abs(offset)
              
              // Enhanced 3D transforms - active card pops up more
              let translateX = offset * 320 // More spacing
              let translateZ = idx === testimonialIndex ? 150 : -absOffset * 80 // Active card pops forward
              let rotateY = offset * -20 // More rotation for depth
              let opacity = absOffset > 2 ? 0 : idx === testimonialIndex ? 1 : 1 - absOffset * 0.4
              let scale = idx === testimonialIndex ? 1.1 : 1 - absOffset * 0.15 // Active card is larger
              let zIndex = idx === testimonialIndex ? 10 : testimonials.length - absOffset
              
              // Wrap around for infinite feel
              if (offset > testimonials.length / 2) {
                translateX = (offset - testimonials.length) * 320
                rotateY = (offset - testimonials.length) * -20
              } else if (offset < -testimonials.length / 2) {
                translateX = (offset + testimonials.length) * 320
                rotateY = (offset + testimonials.length) * -20
              }

              return (
                <div
                  key={idx}
                  className="absolute top-1/2 left-1/2 w-[300px] transition-all duration-700 ease-in-out pointer-events-auto"
                  style={{
                    transform: `translate(-50%, -50%) translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
                    opacity,
                    zIndex,
                    transformStyle: 'preserve-3d',
                    willChange: 'transform, opacity',
                    marginTop: idx === testimonialIndex ? '-10px' : '0',
                  }}
                >
                  <div 
                    className={`bg-white rounded-2xl p-6 shadow-2xl transition-all duration-700 ${
                      idx === testimonialIndex 
                        ? 'shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)] ring-2 ring-white/50 overflow-hidden' 
                        : 'shadow-lg overflow-visible'
                    }`}
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className={`h-14 w-14 rounded-full bg-gradient-to-br from-forest/30 to-forest/50 flex items-center justify-center overflow-hidden transition-all duration-700 ${
                        idx === testimonialIndex ? 'ring-2 ring-forest/30' : ''
                      }`}>
                        <span className="text-forest font-bold text-xl">{t.name.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="text-base font-bold text-gray-900">{t.name}</p>
                        <p className="text-xs text-forest font-semibold uppercase tracking-wide">{t.role}</p>
                      </div>
                    </div>
                    <p className="text-gray-600 text-sm leading-relaxed whitespace-normal italic">&ldquo;{t.quote}&rdquo;</p>
                  </div>
                </div>
              )
            })}

            {/* Navigation arrows */}
            <button
              onClick={() => setTestimonialIndex((testimonialIndex - 1 + testimonials.length) % testimonials.length)}
              className="absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 transition-all hover:scale-110 flex items-center justify-center shadow-lg z-20 pointer-events-auto"
              aria-label="Previous testimonial"
            >
              <span className="material-icons-outlined">chevron_left</span>
            </button>
            <button
              onClick={() => setTestimonialIndex((testimonialIndex + 1) % testimonials.length)}
              className="absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 transition-all hover:scale-110 flex items-center justify-center shadow-lg z-20 pointer-events-auto"
              aria-label="Next testimonial"
            >
              <span className="material-icons-outlined">chevron_right</span>
            </button>
          </div>
          
          {/* Dots indicator below cards */}
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 flex gap-2">
            {testimonials.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setTestimonialIndex(idx)}
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  idx === testimonialIndex ? 'w-8 bg-forest' : 'w-1.5 bg-forest/30 hover:bg-forest/50'
                }`}
                aria-label={`Go to testimonial ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* About Section with Video */}
      <section id="about" className="bg-gradient-to-r from-forest-dark to-forest lg:py-24 my-8 lg:my-12" style={{ paddingTop: '31px', paddingBottom: '31px' }}>
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">About Matcha</h2>
            <p className="text-white/90 text-lg max-w-2xl mx-auto">
              Our unique process for brewing the perfect hack team.
            </p>
          </div>
          
          <div className="flex justify-center">
            <video 
              src={processVideo}
              autoPlay
              loop
              muted
              playsInline
              className="w-full max-w-5xl h-auto rounded-lg shadow-2xl"
              aria-label="About Matcha - Our unique process for brewing the perfect hack team"
            >
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Landing
