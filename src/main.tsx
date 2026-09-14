import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/open-sans/latin-400.css'
import '@fontsource/open-sans/latin-600.css'
import '@fontsource/open-sans/latin-700.css'
import CloudApp from './CloudApp'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CloudApp />
  </StrictMode>,
)
