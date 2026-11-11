import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
createRoot(document.getElementById('colab-root')!).render(<StrictMode><App /></StrictMode>)
