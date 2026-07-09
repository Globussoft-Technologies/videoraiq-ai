import { Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './pages/LoginPage/LoginPage'
import ForgotPasswordPage from './pages/LoginPage/ForgotPasswordPage'
import ResetPasswordPage from './pages/LoginPage/ResetPasswordPage'
import RequireAuth from './components/Auth/RequireAuth'
import AppLayout from './layout/AppLayout'
import Clients from './pages/clients/Clients'
import ClientConfig from './pages/clients/ClientConfig'
import DetectionCatalog from './pages/detectionCatalog/DetectionCatalog'
import SubscriptionPlans from './pages/subscriptionPlans/SubscriptionPlans'
import ComingSoon from './pages/placeholder/ComingSoon'

const App = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/:adminId" element={<ClientConfig />} />
        <Route path="/detection-catalog" element={<DetectionCatalog />} />
        <Route path="/subscription-plans" element={<SubscriptionPlans />} />
        <Route path="/fleet" element={<ComingSoon title="testing CICD" />} />
        <Route path="/feature-roadmap" element={<ComingSoon title="Feature Roadmap" />} />
      </Route>

      <Route path="/" element={<Navigate to="/clients" replace />} />
      <Route path="*" element={<Navigate to="/clients" replace />} />
    </Routes>
  )
}

export default App
