import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return React.createElement('div', { style: { color: '#fff', padding: 40, fontFamily: 'monospace', background: '#000', minHeight: '100vh' } },
        React.createElement('h2', null, 'Error'),
        React.createElement('pre', { style: { color: '#f43f5e', whiteSpace: 'pre-wrap' } }, String(this.state.error)),
        React.createElement('button', { onClick: () => { localStorage.clear(); window.location.reload(); }, style: { marginTop: 20, padding: '10px 20px', background: '#00f0ff', color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer' } }, 'Reset & Reload')
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary><App /></ErrorBoundary>
)
