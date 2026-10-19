import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyStoredTheme } from './hooks/useTheme'
import './styles/globals.css'

applyStoredTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
