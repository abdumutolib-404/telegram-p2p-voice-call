import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import './styles/tokens.css'
import './styles/designer-components.css'
import './styles/designer-app.css'
import './styles/design.css'
import './styles/dashboard-polish.css'
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
