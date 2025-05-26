// Updated App.js - Only the imports and return statement change
import React, { useState, useEffect } from 'react';
import AudioPlayer from './components/AudioPlayer';
import ExplanationDisplay from './components/ExplanationDisplay';
import AudioUploader from './components/AudioUploader';
import AuthWrapper from './components/AuthWrapper'; // Add this import
import { initializeAudio, stopRecording, getCurrentPlaybackTime, setCurrentPlaybackTime } from './services/audioService';
import { processAudioAndGetExplanation } from './services/apiService';
import './App.css';
import AudioDebugger from './components/AudioDebugger';

function App() {
  console.log('[App.js] Initializing App component');
  
  const [audioFile, setAudioFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [isExplaining, setIsExplaining] = useState(false);
  const [audioContext, setAudioContext] = useState(null);
  const [audioSource, setAudioSource] = useState(null);
  const [minExplanationTime, setMinExplanationTime] = useState(null);
  const [pausedAtTime, setPausedAtTime] = useState(0);

  // All your existing useEffect hooks and handlers remain exactly the same
  // ... (keeping all the existing code from your original App.js)

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
    console.log('[App.js] File uploaded:', file.name);
    setAudioFile(file);
    setFileName(file.name);
    // Reset states when a new file is uploaded
    setExplanation('');
    setIsPlaying(false);
    setIsExplaining(false);
    setMinExplanationTime(null);
    setPausedAtTime(0);
    
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close();
      setAudioContext(null);
      setAudioSource(null);
    }
  };

  const handlePlay = async (seekTime = null) => {
    console.log('[App.js] Starting audio playbook');
    
    try {
      if (!audioFile) {
        console.error('[App.js] No audio file selected');
        return;
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
      
      setIsPlaying(true);
    } catch (error) {
      console.error('[App.js] Error starting playback:', error);
    }
  };

  const handlePause = () => {
    console.log('[App.js] Pausing audio playback');
    if (audioContext && audioContext.state === 'running') {
      // Store current playback position
      const currentTime = getCurrentPlaybackTime();
      setPausedAtTime(currentTime);
      
      audioContext.suspend();
      setIsPlaying(false);
    }
  };

  const handleSeek = async (time) => {
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
  };

  const handleExplain = async () => {
    console.log('[App.js] Explaining audio content');
    setIsExplaining(true);
    
    try {
      if (!audioContext) {
        console.error('[App.js] No audio context available');
        setIsExplaining(false);
        return;
      }
      
      // Store current position before pausing
      if (isPlaying) {
        const currentTime = getCurrentPlaybackTime();
        setPausedAtTime(currentTime);
        
        if (audioSource) {
          audioSource.stop();
          setAudioSource(null);
        }
        if (audioContext && audioContext.state !== 'closed') {
          audioContext.close();
          setAudioContext(null);
        }
        setIsPlaying(false);
      }
      
      // Get audio data for explanation
      const recordedAudioData = await stopRecording();
      console.log('[App.js] Audio data captured for explanation');
      
      // Process the audio data and get explanation from API
      const response = await processAudioAndGetExplanation(recordedAudioData, fileName);
      console.log('[App.js] Received explanation response');
      
      // Set a minimum time for the explanation to be displayed
      setMinExplanationTime(Date.now() + 10000); // 10 seconds minimum display time
      
      setExplanation(response.explanation);
    } catch (error) {
      console.error('[App.js] Error getting explanation:', error);
    } finally {
      setIsExplaining(false);
    }
  };

  const handleResume = () => {
    console.log('[App.js] Resuming audio playback');
    if (!isPlaying) {
      handlePlay(pausedAtTime);
    }
  };
  
  // Handler for when text-to-speech finishes
  const handleSpeechEnd = () => {
    console.log('[App.js] Speech ended, checking if we can auto-resume audiobook');
    
    // Check if minimum explanation time has passed
    const canResume = !minExplanationTime || Date.now() >= minExplanationTime;
    
    if (canResume) {
      console.log('[App.js] Minimum explanation time passed, auto-resuming audiobook');
      // Add a small delay before resuming
      setTimeout(() => {
        // Auto-resume the audiobook only if it's not already playing
        if (!isPlaying) {
          handleResume();
          
          // Clear the explanation after a delay
          setTimeout(() => {
            setExplanation('');
            setMinExplanationTime(null);
          }, 1000);
        }
      }, 500);
    } else {
      console.log('[App.js] Minimum explanation time not yet passed, waiting...');
      // Wait until minimum time has passed, then auto-resume
      const remainingTime = minExplanationTime - Date.now();
      setTimeout(() => {
        if (!isPlaying) {
          handleResume();
          
          // Clear the explanation after a delay
          setTimeout(() => {
            setExplanation('');
            setMinExplanationTime(null);
          }, 1000);
        }
      }, remainingTime + 500);
    }
  };

  // Wrap your existing JSX with AuthWrapper
  return (
    <AuthWrapper>
      <div className="app-container">
        <h1>Audio Book Explainer</h1>
        
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
      </div>
      <AudioDebugger />  {/* Add this line */}
      </AuthWrapper>
  );
}

export default App;