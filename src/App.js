import React, { useState, useEffect } from 'react';
import AudioPlayer from './components/AudioPlayer';
import ExplanationDisplay from './components/ExplanationDisplay';
import AudioUploader from './components/AudioUploader';
import { initializeAudio, stopRecording } from './services/audioService';
import { processAudioAndGetExplanation } from './services/apiService';

function App() {
  console.log('[App.js] Initializing App component');
  
  const [audioFile, setAudioFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [isExplaining, setIsExplaining] = useState(false);
  const [audioContext, setAudioContext] = useState(null);
  const [audioSource, setAudioSource] = useState(null);

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

  const handleFileUpload = (file) => {
    console.log('[App.js] File uploaded:', file.name);
    setAudioFile(file);
    setFileName(file.name);
    // Reset states when a new file is uploaded
    setExplanation('');
    setIsPlaying(false);
    setIsExplaining(false);
    
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close();
    }
  };

  const handlePlay = async () => {
    console.log('[App.js] Starting audio playback');
    
    try {
      if (!audioFile) {
        console.error('[App.js] No audio file selected');
        return;
      }

      // Initialize audio context and source if not already done
      if (!audioContext || audioContext.state === 'closed') {
        const { context, source } = await initializeAudio(audioFile);
        setAudioContext(context);
        setAudioSource(source);
        console.log('[App.js] Audio context and source initialized');
      }
      
      setIsPlaying(true);
    } catch (error) {
      console.error('[App.js] Error starting playback:', error);
    }
  };

  const handlePause = () => {
    console.log('[App.js] Pausing audio playback');
    if (audioContext) {
      audioContext.suspend();
      setIsPlaying(false);
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
      
      // Pause the audio while generating explanation
      audioContext.suspend();
      setIsPlaying(false);
      
      // Get last 10 seconds of audio for explanation
      const recordedAudioData = await stopRecording();
      console.log('[App.js] Audio data captured for explanation');
      
      // Process the audio data and get explanation from API
      const response = await processAudioAndGetExplanation(recordedAudioData, fileName);
      console.log('[App.js] Received explanation response');
      
      setExplanation(response.explanation);
    } catch (error) {
      console.error('[App.js] Error getting explanation:', error);
    } finally {
      setIsExplaining(false);
    }
  };

  const handleResume = () => {
    console.log('[App.js] Resuming audio playback');
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
      setIsPlaying(true);
    }
  };

  return (
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
        />
      )}
      
      {explanation && (
        <ExplanationDisplay explanation={explanation} />
      )}
    </div>
  );
}

export default App;