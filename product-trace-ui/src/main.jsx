// product-trace-ui/src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx' // Crucial: Ensure this points to App.jsx
import './index.css'     // If you have global styles like Tailwind setup

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
