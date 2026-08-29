import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import { logger } from './services/logger'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

logger.info('BOOT', 'APP_BOOT: Client bundle initialized');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
