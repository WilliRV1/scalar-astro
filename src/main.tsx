import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registrarServiceWorker } from './features/pwa'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Solo se registra en producción: en desarrollo pelea con el HMR de Vite.
registrarServiceWorker()
