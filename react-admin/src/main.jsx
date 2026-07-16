import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { setupAxiosInterceptors } from './utils/axiosSetup'

// Global 401/invalid-token handling: log out on an expired session.
setupAxiosInterceptors()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <App />
        <ToastContainer
          position="top-right"
          autoClose={4000}
          newestOnTop
          theme="colored"
          pauseOnFocusLoss={false}
        />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
