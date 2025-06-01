import React, { useState, useEffect } from 'react';
import { getDebugInfo, downloadDebugLogs, getDeviceInfo } from '../services/audioService';

const AudioDebugger = () => {
  const [debugInfo, setDebugInfo] = useState({});
  const [testResults, setTestResults] = useState({});
  const [isVisible, setIsVisible] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(null);

  useEffect(() => {
    runDiagnostics();
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        updateDebugInfo();
      }, 2000); // Update every 2 seconds
      setRefreshInterval(interval);
    } else {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        setRefreshInterval(null);
      }
    }

    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [autoRefresh]);

  const updateDebugInfo = () => {
    try {
      const currentDebugInfo = getDebugInfo();
      const deviceInfo = getDeviceInfo();
      
      setDebugInfo({
        ...deviceInfo,
        ...currentDebugInfo,
        lastUpdate: new Date().toLocaleTimeString()
      });
    } catch (error) {
      console.error('Error updating debug info:', error);
    }
  };

  const runDiagnostics = async () => {
    const info = {
      // Device Detection
      userAgent: navigator.userAgent,
      isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
      isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
      
      // API Support
      mediaRecorderSupported: !!window.MediaRecorder,
      audioContextSupported: !!(window.AudioContext || window.webkitAudioContext),
      getUserMediaSupported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      
      // Screen info
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      devicePixelRatio: window.devicePixelRatio,
      
      // Memory info
      memoryInfo: performance.memory ? {
        used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
        total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
        limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
      } : null,
      
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

    // Get current debug info from audio service
    try {
      const audioServiceDebug = getDebugInfo();
      info.audioServiceDebug = audioServiceDebug;
    } catch (error) {
      info.audioServiceError = error.message;
    }

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

  const handleDownloadLogs = () => {
    try {
      downloadDebugLogs();
      alert('Debug logs downloaded! Check your Downloads folder.');
    } catch (error) {
      console.error('Error downloading logs:', error);
      alert('Error downloading logs. Check console for details.');
    }
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
      maxWidth: '450px',
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
        <h3 style={{ margin: 0 }}>Audio Debug Panel</h3>
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

      {/* Auto-refresh toggle */}
      <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <input 
            type="checkbox" 
            checked={autoRefresh} 
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto-refresh
        </label>
        {debugInfo.lastUpdate && (
          <span style={{ color: '#666', fontSize: '11px' }}>
            Last update: {debugInfo.lastUpdate}
          </span>
        )}
      </div>

      {/* Memory Usage */}
      {debugInfo.memoryInfo && (
        <div style={{ marginBottom: '15px' }}>
          <h4>Memory Usage</h4>
          <div style={{ 
            background: debugInfo.memoryInfo.used > debugInfo.memoryInfo.limit * 0.8 ? '#f8d7da' : '#d4edda',
            padding: '8px',
            borderRadius: '4px',
            fontSize: '11px'
          }}>
            <div><strong>Used:</strong> {debugInfo.memoryInfo.used}MB</div>
            <div><strong>Total:</strong> {debugInfo.memoryInfo.total}MB</div>
            <div><strong>Limit:</strong> {debugInfo.memoryInfo.limit}MB</div>
            <div><strong>Usage:</strong> {Math.round(debugInfo.memoryInfo.used / debugInfo.memoryInfo.limit * 100)}%</div>
          </div>
        </div>
      )}

      {/* Audio Service Status */}
      {debugInfo.audioServiceDebug && (
        <div style={{ marginBottom: '15px' }}>
          <h4>Audio Service Status</h4>
          <div style={{ 
            background: '#f8f9fa',
            padding: '8px',
            borderRadius: '4px',
            fontSize: '11px'
          }}>
            <div><strong>Buffer Size:</strong> {debugInfo.audioServiceDebug.bufferState?.bufferSize || 0}</div>
            <div><strong>Max Buffer:</strong> {debugInfo.audioServiceDebug.bufferState?.maxBufferSize || 0}</div>
            <div><strong>Recording Active:</strong> {debugInfo.audioServiceDebug.bufferState?.isRecordingActive ? '✅' : '❌'}</div>
            <div><strong>Total Chunks:</strong> {debugInfo.audioServiceDebug.bufferState?.totalRecordedChunks || 0}</div>
            <div><strong>Chunk Duration:</strong> {debugInfo.audioServiceDebug.bufferState?.chunkDuration || 0}ms</div>
          </div>
        </div>
      )}

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
          color: debugInfo.recommendedMimeType !== 'none' ? '#155724' : '#721c24',
          fontSize: '11px'
        }}>
          {debugInfo.recommendedMimeType || 'No supported format found!'}
        </div>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <h4>Supported MIME Types</h4>
        <div style={{ maxHeight: '100px', overflow: 'auto' }}>
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

      {/* Recent Logs */}
      {debugInfo.audioServiceDebug?.recentLogs && (
        <div style={{ marginBottom: '15px' }}>
          <h4>Recent Logs</h4>
          <div style={{ 
            maxHeight: '120px', 
            overflow: 'auto', 
            background: '#f8f9fa',
            padding: '8px',
            borderRadius: '4px',
            fontSize: '10px'
          }}>
            {debugInfo.audioServiceDebug.recentLogs.map((log, index) => (
              <div key={index} style={{ 
                marginBottom: '4px',
                borderBottom: '1px solid #eee',
                paddingBottom: '2px'
              }}>
                <strong>{new Date(log.timestamp).toLocaleTimeString()}:</strong> {log.message}
                {log.data && <div style={{ color: '#666', marginLeft: '10px' }}>{log.data}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.keys(testResults).length > 0 && (
        <div style={{ marginBottom: '15px' }}>
          <h4>Test Results</h4>
          {testResults.mediaRecorderCreated ? (
            <div style={{ color: 'green', fontSize: '11px' }}>
              ✅ MediaRecorder created successfully<br/>
              <strong>Actual MIME:</strong> {testResults.actualMimeType}<br/>
              <strong>State:</strong> {testResults.state}
            </div>
          ) : (
            <div style={{ color: 'red', fontSize: '11px' }}>
              ❌ MediaRecorder failed<br/>
              <strong>Error:</strong> {testResults.error}
            </div>
          )}
        </div>
      )}

      <div style={{ 
        display: 'flex', 
        gap: '8px',
        flexWrap: 'wrap',
        marginBottom: '10px'
      }}>
        <button 
          onClick={runDiagnostics}
          style={{
            background: '#28a745',
            color: 'white',
            border: 'none',
            padding: '6px 10px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px'
          }}
        >
          Re-test
        </button>
        <button 
          onClick={updateDebugInfo}
          style={{
            background: '#17a2b8',
            color: 'white',
            border: 'none',
            padding: '6px 10px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px'
          }}
        >
          Refresh Status
        </button>
        <button 
          onClick={copyToClipboard}
          style={{
            background: '#007bff',
            color: 'white',
            border: 'none',
            padding: '6px 10px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px'
          }}
        >
          Copy Debug Info
        </button>
        <button 
          onClick={handleDownloadLogs}
          style={{
            background: '#dc3545',
            color: 'white',
            border: 'none',
            padding: '6px 10px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 'bold'
          }}
        >
          📥 Download Full Logs
        </button>
      </div>

      {debugInfo.audioServiceError && (
        <div style={{ 
          background: '#f8d7da',
          color: '#721c24',
          padding: '8px',
          borderRadius: '4px',
          fontSize: '11px',
          marginBottom: '10px'
        }}>
          <strong>Audio Service Error:</strong> {debugInfo.audioServiceError}
        </div>
      )}

      <div style={{ 
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