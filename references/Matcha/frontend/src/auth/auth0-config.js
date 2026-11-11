// Auth0 Configuration
// Replace these with your actual Auth0 credentials from https://manage.auth0.com/
export const auth0Config = {
  domain: import.meta.env.VITE_AUTH0_DOMAIN || 'your-domain.auth0.com',
  clientId: import.meta.env.VITE_AUTH0_CLIENT_ID || 'your-client-id',
  authorizationParams: {
    redirect_uri: window.location.origin,
    audience: import.meta.env.VITE_AUTH0_AUDIENCE || '',
  },
}

// Check if Auth0 is properly configured
export const isAuth0Configured = () => {
  return (
    auth0Config.domain !== 'your-domain.auth0.com' &&
    auth0Config.clientId !== 'your-client-id' &&
    auth0Config.domain &&
    auth0Config.clientId
  )
}

