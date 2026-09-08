import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './app/App'
import { ErrorBoundary } from './app/ErrorBoundary'
import { AuthContextWrapper } from './contexts/AuthContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthContextWrapper>
        <App />
      </AuthContextWrapper>
    </ErrorBoundary>
  </StrictMode>,
)
