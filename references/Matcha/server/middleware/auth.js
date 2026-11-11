const jwt = require('jsonwebtoken')
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'Access token required' })
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' })
    }
    req.user = user
    next()
  })
}

// Optional authentication - allows Auth0 users and JWT users, but doesn't require auth
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  // If token is 'auth0_token', user is authenticated via Auth0
  if (token === 'auth0_token') {
    req.user = { provider: 'auth0' }
    return next()
  }

  // If no token, still allow (for public idea generation based on provided skills)
  if (!token) {
    req.user = { provider: 'public' }
    return next()
  }

  // Try to verify JWT token for email/password users
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      // If token is invalid, still allow but mark as public
      req.user = { provider: 'public' }
      return next()
    }
    req.user = user
    next()
  })
}

module.exports = { authenticateToken, optionalAuth }


