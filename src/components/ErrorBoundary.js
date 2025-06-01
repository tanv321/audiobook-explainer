import React from 'react';

// Note: Import these from audioService once the improved version is implemented
// For now, create fallback functions
const downloadDebugLogs = () => {
  console.log('downloadDebugLogs function not yet available');
};

const getDebugInfo = () => {
  return {
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    memoryInfo: performance.memory ? {
      used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
      total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024)
    } : null
  };
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      logsDownloaded: false 
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error details
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    // Automatically download debug logs when an error occurs
    this.downloadLogsOnError(error, errorInfo);
  }

  downloadLogsOnError = async (error, errorInfo) => {
    try {
      // Wait a moment for any pending operations to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Get current debug info
      const debugInfo = getDebugInfo();
      
      // Create comprehensive error report
      const errorReport = {
        timestamp: new Date().toISOString(),
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        },
        errorInfo: {
          componentStack: errorInfo.componentStack
        },
        debugInfo,
        userAgent: navigator.userAgent,
        url: window.location.href,
        memoryInfo: performance.memory ? {
          used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
          total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
          limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
        } : null
      };
      
      // Download the error report as a separate file
      const errorBlob = new Blob([JSON.stringify(errorReport, null, 2)], { type: 'application/json' });
      const errorUrl = URL.createObjectURL(errorBlob);
      const errorLink = document.createElement('a');
      errorLink.href = errorUrl;
      errorLink.download = `audiobook-error-${Date.now()}.json`;
      document.body.appendChild(errorLink);
      errorLink.click();
      document.body.removeChild(errorLink);
      URL.revokeObjectURL(errorUrl);
      
      // Also download the full debug logs
      downloadDebugLogs();
      
      this.setState({ logsDownloaded: true });
      
      console.log('Error logs downloaded automatically');
    } catch (logError) {
      console.error('Failed to download error logs:', logError);
    }
  };

  handleRetry = () => {
    this.setState({ 
      hasError: false, 
      error: null, 
      errorInfo: null,
      logsDownloaded: false 
    });
  };

  handleManualLogDownload = () => {
    try {
      this.downloadLogsOnError(this.state.error, this.state.errorInfo);
    } catch (error) {
      console.error('Manual log download failed:', error);
      alert('Failed to download logs. Check the console for details.');
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '20px',
          margin: '20px',
          border: '2px solid #dc3545',
          borderRadius: '8px',
          backgroundColor: '#f8d7da',
          color: '#721c24'
        }}>
          <h2 style={{ marginTop: 0, color: '#721c24' }}>
            🚨 App Crashed
          </h2>
          
          <p>
            The audiobook app has encountered an error and crashed. This typically happens 
            when there are issues with audio processing on iOS devices.
          </p>
          
          <div style={{
            background: '#ffffff',
            padding: '15px',
            borderRadius: '6px',
            margin: '15px 0',
            border: '1px solid #f5c6cb'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#721c24' }}>Error Details:</h4>
            <pre style={{ 
              fontSize: '12px', 
              color: '#495057',
              wordWrap: 'break-word',
              whiteSpace: 'pre-wrap',
              margin: 0
            }}>
              {this.state.error && this.state.error.message}
            </pre>
          </div>

          <div style={{
            background: this.state.logsDownloaded ? '#d4edda' : '#fff3cd',
            padding: '15px',
            borderRadius: '6px',
            margin: '15px 0',
            border: `1px solid ${this.state.logsDownloaded ? '#c3e6cb' : '#ffeaa7'}`
          }}>
            <h4 style={{ 
              margin: '0 0 10px 0', 
              color: this.state.logsDownloaded ? '#155724' : '#856404' 
            }}>
              📁 Debug Information:
            </h4>
            {this.state.logsDownloaded ? (
              <p style={{ margin: 0, color: '#155724' }}>
                ✅ Debug logs have been automatically downloaded to your device. 
                Please check your Downloads folder for the error report and debug logs.
              </p>
            ) : (
              <p style={{ margin: 0, color: '#856404' }}>
                ⏳ Attempting to download debug logs automatically...
              </p>
            )}
          </div>

          <div style={{ 
            display: 'flex', 
            gap: '10px', 
            flexWrap: 'wrap',
            marginTop: '20px'
          }}>
            <button
              onClick={this.handleRetry}
              style={{
                background: '#28a745',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              🔄 Try Again
            </button>
            
            <button
              onClick={this.handleManualLogDownload}
              style={{
                background: '#007bff',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              📥 Download Logs Manually
            </button>
            
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#6c757d',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              🔄 Reload App
            </button>
          </div>

          <div style={{
            marginTop: '20px',
            padding: '15px',
            background: '#ffffff',
            borderRadius: '6px',
            border: '1px solid #f5c6cb'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#721c24' }}>Troubleshooting Tips:</h4>
            <ul style={{ margin: 0, paddingLeft: '20px', color: '#495057' }}>
              <li>Try using a shorter audio file (less than 30 minutes)</li>
              <li>Clear your browser cache and reload the app</li>
              <li>If using as a PWA, try removing and re-adding it to your home screen</li>
              <li>Try using the app in Safari browser instead of PWA mode</li>
              <li>Close other apps to free up memory on your device</li>
            </ul>
          </div>

          {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
            <details style={{ marginTop: '20px' }}>
              <summary style={{ cursor: 'pointer', color: '#007bff' }}>
                🔍 Component Stack (Development Only)
              </summary>
              <pre style={{ 
                fontSize: '11px', 
                color: '#495057',
                wordWrap: 'break-word',
                whiteSpace: 'pre-wrap',
                background: '#f8f9fa',
                padding: '10px',
                borderRadius: '4px',
                marginTop: '10px'
              }}>
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;