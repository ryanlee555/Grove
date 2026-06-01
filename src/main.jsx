import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import LandingPage from './pages/LandingPage.jsx'
import Dashboard from './pages/Dashboard.jsx'
import LoginPage from './pages/LoginPage.jsx'
import SignupPage from './pages/SignupPage.jsx'
import OnboardingPage from './pages/OnboardingPage.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import BudgetsPage from './pages/BudgetsPage.jsx'


function Root() {
  const now = new Date()
  const initStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const initEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const [selectedPeriod, setSelectedPeriod] = useState({ preset: 'this-month', start: initStart, end: initEnd })

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/onboarding" element={
          <ProtectedRoute><OnboardingPage /></ProtectedRoute>
        } />
        <Route path="/dashboard" element={
          <ProtectedRoute><Dashboard selectedPeriod={selectedPeriod} setSelectedPeriod={setSelectedPeriod} /></ProtectedRoute>
        } />
        <Route path="/budgets" element={
          <ProtectedRoute><BudgetsPage selectedPeriod={selectedPeriod} setSelectedPeriod={setSelectedPeriod} /></ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
