import { Navigate } from 'react-router-dom'
import Cookies from 'js-cookie'

const RequireAuth = ({ children }) => {
  const token = Cookies.get('access-token')
  if (!token) return <Navigate to="/login" replace />
  return children
}

export default RequireAuth
