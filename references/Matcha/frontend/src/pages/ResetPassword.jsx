import { Link } from 'react-router-dom'

function ResetPassword() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-matcha-green rounded flex items-center justify-center">
            <span className="text-white text-xl">☕</span>
          </div>
          <span className="text-2xl font-bold">Matcha</span>
        </div>

        <h2 className="text-3xl font-bold mb-2">Reset Password</h2>
        <p className="text-gray-600 mb-8">
          This feature is coming soon. Please contact support for password reset.
        </p>

        <Link
          to="/login"
          className="block w-full bg-matcha-green text-white text-center py-3 rounded-lg font-semibold hover:bg-matcha-dark transition mb-4"
        >
          Back to Login
        </Link>
      </div>
    </div>
  )
}

export default ResetPassword
