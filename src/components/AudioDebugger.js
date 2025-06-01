import React, { useState, useEffect } from 'react';

const AudioDebugger = () => {
  const [debugInfo, setDebugInfo] = useState({});
  const [testResults, setTestResults] = useState({});
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    runDiagnostics();
  }, []);

  const runDiagnostics = async () => {
    const info = {
      // Device Detection
      userAgent: navigator.userAgent,
      isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
      isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
      
      // API Suppor
      mediaRecorderSupported: !!window.MediaRecorder,
      audioContextSupported: !!(window.AudioContext || window.webkitAudioContext),
      getUserMediaSupported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      
      // Screen info
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      devicePixelRatio: window.devicePixelRatio,
      
      // Browser capabilities
      localStorage: !!window.localStorage,
      sessionStorage: !!window.sessionStorage,
      indexedDB: !!window.indexedDB
    };

    // MediaRecorder MIME type testing
    const mimeTypes = [
      'audio/webm',
      'audio/webm;codecs=opus',
      'audio/ogg',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/mp4;codecs="mp4a.40.2"',
      'audio/mp4;codecs="mp4a.40.5"',
      'audio/wav',
      'audio/mpeg',
      'video/mp4',
      'video/mp4;codecs="avc1.42E01E,mp4a.40.2"'
    ];

    const supportedTypes = {};
    if (window.MediaRecorder) {
      mimeTypes.forEach(type => {
        supportedTypes[type] = MediaRecorder.isTypeSupported(type);
      });
    }

    info.supportedMimeTypes = supportedTypes;
    
    // Find the first supported type
    const firstSupported = mimeTypes.find(type => 
      window.MediaRecorder && MediaRecorder.isTypeSupported(type)
    );
    info.recommendedMimeType = firstSupported || 'none';

    setDebugInfo(info);

    // Test actual MediaRecorder creation
    if (window.MediaRecorder && firstSupported) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream, { mimeType: firstSupported });
        
        setTestResults({
          mediaRecorderCreated: true,
          actualMimeType: recorder.mimeType,
          state: recorder.state
        });

        // Clean up
        stream.getTracks().forEach(track => track.stop());
      } catch (error) {
        setTestResults({
          mediaRecorderCreated: false,
          error: error.message
        });
      }
    }
  };

  const copyToClipboard = () => {
    const debugData = {
      debugInfo,
      testResults,
      timestamp: new Date().toISOString()
    };
    
    navigator.clipboard.writeText(JSON.stringify(debugData, null, 2))
      .then(() => alert('Debug info copied to clipboard!'))
      .catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = JSON.stringify(debugData, null, 2);
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('Debug info copied to clipboard!');
      });
  };

  if (!isVisible) {
    return (
      <button 
        onClick={() => setIsVisible(true)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          background: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: '60px',
          height: '60px',
          fontSize: '24px',
          cursor: 'pointer',
          zIndex: 1000,
          boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
        }}
      >
        🐛
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: 'white',
      border: '2px solid #ccc',
      borderRadius: '8px',
      padding: '20px',
      maxWidth: '400px',
      maxHeight: '80vh',
      overflow: 'auto',
      zIndex: 1000,
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      fontSize: '12px'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '15px'
      }}>
        <h3 style={{ margin: 0 }}>Audio Debug Info</h3>
        <button 
          onClick={() => setIsVisible(false)}
          style={{ 
            background: 'none', 
            border: 'none', 
            fontSize: '20px',
            cursor: 'pointer' 
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <h4>Device Info</h4>
        <div><strong>iOS:</strong> {debugInfo.isIOS ? '✅ Yes' : '❌ No'}</div>
        <div><strong>Safari:</strong> {debugInfo.isSafari ? '✅ Yes' : '❌ No'}</div>
        <div><strong>Screen:</strong> {debugInfo.screenWidth}×{debugInfo.screenHeight}</div>
        <div><strong>Pixel Ratio:</strong> {debugInfo.devicePixelRatio}</div>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <h4>API Support</h4>
        <div><strong>MediaRecorder:</strong> {debugInfo.mediaRecorderSupported ? '✅' : '❌'}</div>
        <div><strong>AudioContext:</strong> {debugInfo.audioContextSupported ? '✅' : '❌'}</div>
        <div><strong>getUserMedia:</strong> {debugInfo.getUserMediaSupported ? '✅' : '❌'}</div>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <h4>Recommended Format</h4>
        <div style={{ 
          background: debugInfo.recommendedMimeType !== 'none' ? '#d4edda' : '#f8d7da',
          padding: '8px',
          borderRadius: '4px',
          color: debugInfo.recommendedMimeType !== 'none' ? '#155724' : '#721c24'
        }}>
          {debugInfo.recommendedMimeType || 'No supported format found!'}
        </div>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <h4>Supported MIME Types</h4>
        <div style={{ maxHeight: '150px', overflow: 'auto' }}>
          {Object.entries(debugInfo.supportedMimeTypes || {}).map(([type, supported]) => (
            <div key={type} style={{ 
              fontSize: '10px',
              color: supported ? 'green' : 'red',
              wordBreak: 'break-all'
            }}>
              {supported ? '✅' : '❌'} {type}
            </div>
          ))}
        </div>
      </div>

      {Object.keys(testResults).length > 0 && (
        <div style={{ marginBottom: '15px' }}>
          <h4>Test Results</h4>
          {testResults.mediaRecorderCreated ? (
            <div style={{ color: 'green' }}>
              ✅ MediaRecorder created successfully<br/>
              <strong>Actual MIME:</strong> {testResults.actualMimeType}<br/>
              <strong>State:</strong> {testResults.state}
            </div>
          ) : (
            <div style={{ color: 'red' }}>
              ❌ MediaRecorder failed<br/>
              <strong>Error:</strong> {testResults.error}
            </div>
          )}
        </div>
      )}

      <div style={{ 
        display: 'flex', 
        gap: '10px',
        flexWrap: 'wrap'
      }}>
        <button 
          onClick={runDiagnostics}
          style={{
            background: '#28a745',
            color: 'white',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          Re-test
        </button>
        <button 
          onClick={copyToClipboard}
          style={{
            background: '#007bff',
            color: 'white',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          Copy Debug Info
        </button>
      </div>

      <div style={{ 
        marginTop: '15px', 
        fontSize: '10px', 
        color: '#666',
        borderTop: '1px solid #eee',
        paddingTop: '10px'
      }}>
        <strong>User Agent:</strong><br/>
        <div style={{ wordBreak: 'break-all' }}>
          {debugInfo.userAgent}
        </div>
      </div>
    </div>
  );
};

export default AudioDebugger;