import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Table2DViewer from './components/casino/Table2D.jsx'
import Table2DGeminiViewer from './components/casino/Table2DGemini.jsx'
import Table2DChatGPTViewer from './components/casino/Table2DChatGPT.jsx'

// ?table            → current table   |   ?table=gemini / ?table=chatgpt → candidates
const params = new URLSearchParams(window.location.search)
let Root = App
if (params.has('table')) {
  const which = params.get('table')
  Root = which === 'gemini' ? Table2DGeminiViewer
       : which === 'chatgpt' ? Table2DChatGPTViewer
       : Table2DViewer
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
