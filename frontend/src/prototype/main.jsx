// Standalone entry for the 3D live-dealer feasibility prototype.
// Served at /prototype.html. It imports nothing from the 2D game and needs no backend.
import { createRoot } from 'react-dom/client'
import './prototype.css'
import PrototypeApp from './PrototypeApp.jsx'

createRoot(document.getElementById('root')).render(<PrototypeApp />)
