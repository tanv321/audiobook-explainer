// Updated App.js - Enhanced error handling and improved audio service integration
import React, { useState, useEffect } from 'react';
import AudioPlayer from './components/AudioPlayer';
import ExplanationDisplay from './components/ExplanationDisplay';
import AudioUploader from './components/AudioUploader';
import AuthWrapper from './components/AuthWrapper';
import ErrorBoundary from './components/ErrorBoundary';
import { initializeAudio, stopRecording, getCurrentPlaybackTime, setCurrentPlaybackTime, getDebugInfo } from './services/audioService';
import { processAudioAndGetExplanation } from './services/apiService';
import './App.css';
import AudioDebugger from './components/AudioDebugger';

function App() {
  console.log('[App.js] Initializing App component with enhanced error handling');
  
  const [audioFile, setAudioFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [isExplaining, setIsExplaining] = useState(false);
  const [audioContext, setAudioContext] = useState(null);
  const [audioSource, setAudioSource] = useState(null);
  const [minExplanationTime, setMinExplanationTime] = useState(null);
  const [pausedAtTime, setPausedAtTime] = useState(0);
  const [wasPlayingBeforeExplanation, setWasPlayingBeforeExplanation] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // iOS detection
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  // Enhanced error handling
  const handleError = (error, context = 'Unknown') => {
    console.error(`[App.js] Error in ${context}:`, error);
    setErrorMessage(`${context}: ${error.message}`);
    
    // Log debug info on error
    try {
      const debugInfo = getDebugInfo();
      console.log('[App.js] Debug info at error:', debugInfo);
    } catch (debugError) {
      console.error('[App.js] Could not get debug info:', debugError);
    }
    
    // Clear error message after 10 seconds
    setTimeout(() => setErrorMessage(''), 10000);
  };

  // Effect to clean up audio context on unmount
  useEffect(() => {
    return () => {
      if (audioContext) {
        console.log('[App.js] Cleaning up audio context');
        if (audioContext.state !== 'closed') {
          audioContext.close();
        }
      }
      if (audioSource) {
        console.log('[App.js] Cleaning up audio source');
        audioSource.disconnect();
      }
    };
  }, [audioContext, audioSource]);

  // Set up global seek handler
  useEffect(() => {
    window.audioPlayerSeek = handleSeek;
    return () => {
      delete window.audioPlayerSeek;
    };
  }, [audioFile, audioContext, isPlaying]);

  const handleFileUpload = (file) => {
    try {
      console.log('[App.js] File uploaded:', file.name);
      setAudioFile(file);
      setFileName(file.name);
      setErrorMessage(''); // Clear any previous errors
      
      // Reset states when a new file is uploaded
      setExplanation('');
      setIsPlaying(false);
      setIsExplaining(false);
      setMinExplanationTime(null);
      setPausedAtTime(0);
      setWasPlayingBeforeExplanation(false);
      
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
        setAudioContext(null);
        setAudioSource(null);
      }
    } catch (error) {
      handleError(error, 'File Upload');
    }
  };

  const handlePlay = async (seekTime = null) => {
    try {
      console.log('[App.js] Starting audio playback');
      setErrorMessage(''); // Clear any previous errors
      
      if (!audioFile) {
        throw new Error('No audio file selected');
      }

      // Use provided seekTime or current paused position
      const startTime = seekTime !== null ? seekTime : pausedAtTime;
      
      // Clean up existing context
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
      }
      
      const { context, source } = await initializeAudio(audioFile, startTime);
      setAudioContext(context);
      setAudioSource(source);
      console.log('[App.js] Audio context and source initialized');
      
      // Clear any existing explanation when starting new playback
      if (explanation) {
        setExplanation('');
        setMinExplanationTime(null);
      }
      
      setIsPlaying(true);
      setWasPlayingBeforeExplanation(false); // Reset this flag
    } catch (error) {
      handleError(error, 'Audio Playback');
      setIsPlaying(false);
    }
  };

  const handlePause = () => {
    try {
      console.log('[App.js] Pausing audio playback');
      if (audioContext && audioContext.state === 'running') {
        // Store current playback position
        const currentTime = getCurrentPlaybackTime();
        setPausedAtTime(currentTime);
        
        audioContext.suspend();
        setIsPlaying(false);
      }
    } catch (error) {
      handleError(error, 'Audio Pause');
    }
  };

  const handleSeek = async (time) => {
    try {
      console.log('[App.js] Seeking to time:', time);
      setPausedAtTime(time);
      
      // If currently playing, restart from new position
      if (isPlaying) {
        // Stop current playback
        if (audioContext && audioContext.state !== 'closed') {
          audioContext.close();
        }
        setAudioContext(null);
        setAudioSource(null);
        setIsPlaying(false);
        
        // Restart with new time
        setTimeout(() => {
          handlePlay(time);
        }, 100);
      }
    } catch (error) {
      handleError(error, 'Audio Seek');
    }
  };

  const handleExplain = async () => {
    try {
      console.log('[App.js] Explaining audio content');
      setIsExplaining(true);
      setErrorMessage(''); // Clear any previous errors
      
      if (!audioContext) {
        throw new Error('No audio context available');
      }
      
      // Remember if we were playing before explanation
      const wasCurrentlyPlaying = isPlaying;
      setWasPlayingBeforeExplanation(wasCurrentlyPlaying);
      
      // Store current position and STOP playback
      if (isPlaying) {
        const currentTime = getCurrentPlaybackTime();
        setPausedAtTime(currentTime);
        console.log('[App.js] Stopping playback for explanation at time:', currentTime);
        
        if (audioSource) {
          audioSource.stop();
          setAudioSource(null);
        }
        if (audioContext && audioContext.state !== 'closed') {
          audioContext.close();
          setAudioContext(null);
        }
        
        // IMPORTANT: Set isPlaying to false immediately so UI reflects paused state
        setIsPlaying(false);
      }
      
      // Get audio data for explanation with enhanced error handling
      console.log('[App.js] Attempting to stop recording and get audio data...');
      const recordedAudioData = await stopRecording();
      console.log('[App.js] Audio data captured for explanation:', {
        size: recordedAudioData.audioBlob.size,
        type: recordedAudioData.mimeType
      });
      
      // Validate audio data before sending to API
      if (!recordedAudioData.audioBlob || recordedAudioData.audioBlob.size === 0) {
        throw new Error('No audio data captured. Try recording for a longer period.');
      }
      
      if (recordedAudioData.audioBlob.size < 1000) {
        throw new Error('Audio data too small. This might indicate a recording issue.');
      }
      
      // Process the audio data and get explanation from API
      console.log('[App.js] Sending audio data to API...');
      const response = await processAudioAndGetExplanation(recordedAudioData, fileName);
      console.log('[App.js] Received explanation response');
      
      // Set a minimum time for the explanation to be displayed
      const minDisplayTime = isIOS ? 12000 : 8000; // 12s for iOS, 8s for others
      setMinExplanationTime(Date.now() + minDisplayTime);
      
      setExplanation(response.explanation);
    } catch (error) {
      console.error('[App.js] Error getting explanation:', error);
      handleError(error, 'Explanation Generation');
      
      // If there was an error, restore play state if we were playing before
      if (wasPlayingBeforeExplanation) {
        setTimeout(() => {
          handlePlay(pausedAtTime);
        }, 1000);
      }
    } finally {
      setIsExplaining(false);
    }
  };

  const handleResume = () => {
    try {
      console.log('[App.js] Resuming audio playback');
      if (!isPlaying) {
        handlePlay(pausedAtTime);
      }
    } catch (error) {
      handleError(error, 'Audio Resume');
    }
  };
  
  // Handler for when text-to-speech finishes
  const handleSpeechEnd = () => {
    try {
      console.log('[App.js] Speech ended, auto-resuming audiobook. Was playing before:', wasPlayingBeforeExplanation);
      
      // Check if minimum explanation time has passed
      const canResume = !minExplanationTime || Date.now() >= minExplanationTime;
      
      const executeResume = () => {
        // Only auto-resume if we were playing before the explanation
        if (wasPlayingBeforeExplanation && !isPlaying) {
          console.log('[App.js] Auto-resuming audiobook playback');
          handleResume();
          
          // Clear the explanation after resuming
          setTimeout(() => {
            setExplanation('');
            setMinExplanationTime(null);
            setWasPlayingBeforeExplanation(false);
          }, 1000);
        } else {
          console.log('[App.js] Not auto-resuming - was not playing before explanation');
          // Just clear the explanation
          setTimeout(() => {
            setExplanation('');
            setMinExplanationTime(null);
            setWasPlayingBeforeExplanation(false);
          }, 1000);
        }
      };
      
      if (canResume) {
        console.log('[App.js] Minimum explanation time passed, proceeding with resume logic');
        setTimeout(executeResume, 500);
      } else {
        console.log('[App.js] Waiting for minimum explanation time to pass');
        const remainingTime = minExplanationTime - Date.now();
        setTimeout(executeResume, remainingTime + 500);
      }
    } catch (error) {
      handleError(error, 'Speech End Handler');
    }
  };

  const clearError = () => {
    setErrorMessage('');
  };

  return (
    <ErrorBoundary>
      <AuthWrapper>
        <div className="app-container">
          <h1>Audio Book Explainer</h1>
          
          {/* Error Display */}
          {errorMessage && (
            <div style={{
              margin: '20px 0',
              padding: '15px',
              backgroundColor: '#f8d7da',
              color: '#721c24',
              border: '1px solid #f5c6cb',
              borderRadius: '8px',
              position: 'relative'
            }}>
              <button 
                onClick={clearError}
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  background: 'none',
                  border: 'none',
                  fontSize: '18px',
                  cursor: 'pointer',
                  color: '#721c24'
                }}
              >
                ✕
              </button>
              <strong>Error:</strong> {errorMessage}
            </div>
          )}
          
          <AudioUploader onFileUpload={handleFileUpload} />
          
          {audioFile && (
            <AudioPlayer 
              isPlaying={isPlaying}
              onPlay={handlePlay}
              onPause={handlePause}
              onExplain={handleExplain}
              onResume={handleResume}
              fileName={fileName}
              isExplaining={isExplaining}
              audioFile={audioFile}
              currentTime={pausedAtTime}
            />
          )}
          
          {explanation && (
            <ExplanationDisplay 
              explanation={explanation} 
              onSpeechEnd={handleSpeechEnd}
            />
          )}
          
          {/* Debug info */}
          {process.env.NODE_ENV === 'development' && (
            <div style={{
              position: 'fixed',
              bottom: isIOS ? '100px' : '80px',
              left: '10px',
              background: 'rgba(0,0,0,0.8)',
              color: 'white',
              padding: '8px',
              borderRadius: '4px',
              fontSize: '12px',
              zIndex: 999
            }}>
              Playing: {isPlaying ? 'Yes' : 'No'} | 
              Explaining: {isExplaining ? 'Yes' : 'No'} | 
              Was Playing Before: {wasPlayingBeforeExplanation ? 'Yes' : 'No'} |
              Paused At: {Math.round(pausedAtTime)}s
              {errorMessage && <div style={{ color: '#ff6b6b' }}>Error: Yes</div>}
            </div>
          )}
        </div>
        <AudioDebugger />
      </AuthWrapper>
    </ErrorBoundary>
  );
}

export default App;