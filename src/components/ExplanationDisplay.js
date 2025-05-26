import React, { useEffect, useState, useRef } from 'react';
import './ExplanationDisplay.css';

function ExplanationDisplay({ explanation, onSpeechEnd }) {
  console.log('[ExplanationDisplay.js] Rendering explanation');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsMethod, setTtsMethod] = useState('google');
  const [requiresUserInteraction, setRequiresUserInteraction] = useState(false);
  const audioRef = useRef(null);
  const isProcessingRef = useRef(false);
  const timeoutIdsRef = useRef([]);
  
  // Detect iOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  
  // Get Google TTS API key from environment
  const GOOGLE_TTS_API_KEY = process.env.REACT_APP_GOOGLE_TTS_API_KEY;
  
  // Simple callback execution
  const callSpeechEndCallback = () => {
    console.log('[ExplanationDisplay.js] Calling speech end callback');
    if (onSpeechEnd) {
      onSpeechEnd();
    }
  };

  // Enhanced Google TTS with multiple event listeners for iOS reliability
  const speakWithGoogleTTS = async (text, userInitiated = false) => {
    if (!text || isProcessingRef.current) return;
    
    isProcessingRef.current = true;
    console.log('[ExplanationDisplay.js] Starting Google TTS for iOS:', isIOS);
    
    try {
      if (!GOOGLE_TTS_API_KEY) {
        throw new Error('Google TTS API key not found');
      }

      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }

      setIsSpeaking(true);
      setRequiresUserInteraction(false);

      // Call Google TTS API
      const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: { text: text },
          voice: {
            languageCode: 'en-US',
            name: 'en-US-Neural2-D',
            ssmlGender: 'MALE'
          },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: 1.0,
            pitch: 0.0,
            volumeGainDb: 0.0
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Google TTS API error: ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      const audioContent = data.audioContent;
      const audioBlob = new Blob([Uint8Array.from(atob(audioContent), c => c.charCodeAt(0))], { type: 'audio/mp3' });
      const audioUrl = URL.createObjectURL(audioBlob);

      // Create audio element
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      // iOS-specific setup
      if (isIOS) {
        audio.setAttribute('playsinline', 'true');
        audio.setAttribute('webkit-playsinline', 'true');
        audio.preload = 'auto';
      }

      // Multiple ways to detect when audio ends (for iOS reliability)
      let hasEnded = false;
      
      const handleAudioEnd = () => {
        if (hasEnded) return; // Prevent multiple calls
        hasEnded = true;
        
        console.log('[ExplanationDisplay.js] Audio ended, cleaning up and calling callback');
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        isProcessingRef.current = false;
        
        // Call the callback immediately
        callSpeechEndCallback();
      };

      // Primary event listener
      audio.onended = handleAudioEnd;
      
      // iOS-specific: Additional event listeners for reliability
      if (isIOS) {
        // Listen for other events that might indicate completion
        audio.onpause = () => {
          // Only treat pause as end if we're near the end of the audio
          if (audio.currentTime > 0 && audio.duration > 0 && 
              (audio.currentTime / audio.duration) > 0.95) {
            console.log('[ExplanationDisplay.js] iOS audio paused near end, treating as completion');
            handleAudioEnd();
          }
        };
        
        audio.onstalled = () => {
          console.log('[ExplanationDisplay.js] iOS audio stalled');
        };
        
        audio.onsuspend = () => {
          console.log('[ExplanationDisplay.js] iOS audio suspended');
        };
      }

      // Backup timer - if audio doesn't end naturally, end it after estimated duration
      const estimatedDuration = Math.max(5000, text.length * 60); // ~60ms per character minimum 5s
      const backupTimer = setTimeout(() => {
        if (!hasEnded && isSpeaking) {
          console.log('[ExplanationDisplay.js] Backup timer triggered - forcing audio end');
          handleAudioEnd();
        }
      }, estimatedDuration + 2000); // Add 2s buffer
      
      timeoutIdsRef.current.push(backupTimer);

      audio.onerror = (event) => {
        console.error('[ExplanationDisplay.js] Audio error:', event);
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        isProcessingRef.current = false;
        
        if (isIOS && !userInitiated) {
          console.log('[ExplanationDisplay.js] Falling back to browser speech');
          fallbackToBrowserSpeech(text);
        } else {
          // Still call callback even on error
          callSpeechEndCallback();
        }
      };

      // Start playback
      try {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          await playPromise;
          console.log('[ExplanationDisplay.js] Google TTS started successfully');
        }
      } catch (playError) {
        console.error('[ExplanationDisplay.js] Play failed:', playError);
        if (isIOS && playError.name === 'NotAllowedError') {
          setRequiresUserInteraction(true);
          setTtsMethod('browser');
          URL.revokeObjectURL(audioUrl);
          fallbackToBrowserSpeech(text);
        } else {
          throw playError;
        }
      }

    } catch (error) {
      console.error('[ExplanationDisplay.js] Google TTS error:', error);
      setIsSpeaking(false);
      isProcessingRef.current = false;
      fallbackToBrowserSpeech(text);
    }
  };

  // Simplified browser speech fallback
  const fallbackToBrowserSpeech = (text) => {
    console.log('[ExplanationDisplay.js] Using browser speech fallback');
    
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text);
      
      if (isIOS) {
        const voices = window.speechSynthesis.getVoices();
        const englishVoice = voices.find(voice => 
          voice.lang.startsWith('en') && !voice.name.includes('Compact')
        );
        if (englishVoice) {
          utterance.voice = englishVoice;
        }
        utterance.rate = 0.9;
      } else {
        utterance.rate = 1.0;
      }

      utterance.onstart = () => {
        console.log('[ExplanationDisplay.js] Browser speech started');
        setIsSpeaking(true);
        setRequiresUserInteraction(false);
      };

      utterance.onend = () => {
        console.log('[ExplanationDisplay.js] Browser speech ended');
        setIsSpeaking(false);
        callSpeechEndCallback();
      };

      utterance.onerror = (event) => {
        console.error('[ExplanationDisplay.js] Browser speech error:', event);
        setIsSpeaking(false);
        if (isIOS && event.error === 'not-allowed') {
          setRequiresUserInteraction(true);
        }
        // Call callback even on error
        callSpeechEndCallback();
      };

      window.speechSynthesis.speak(utterance);
    }, isIOS ? 500 : 100);
  };

  // Manual play for iOS user interaction
  const handleManualPlay = () => {
    console.log('[ExplanationDisplay.js] Manual play triggered');
    setRequiresUserInteraction(false);
    
    if (ttsMethod === 'google' && GOOGLE_TTS_API_KEY) {
      speakWithGoogleTTS(explanation, true);
    } else {
      fallbackToBrowserSpeech(explanation);
    }
  };
  
  // Start TTS when explanation changes
  useEffect(() => {
    if (explanation) {
      console.log('[ExplanationDisplay.js] Starting TTS for new explanation');
      
      if (GOOGLE_TTS_API_KEY) {
        setTimeout(() => speakWithGoogleTTS(explanation, false), 300);
      } else {
        setTimeout(() => fallbackToBrowserSpeech(explanation), 300);
      }
    }
    
    // Cleanup
    return () => {
      timeoutIdsRef.current.forEach(id => clearTimeout(id));
      timeoutIdsRef.current = [];
      
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      
      isProcessingRef.current = false;
    };
  }, [explanation]);

  if (!explanation) {
    return null;
  }

  return (
    <div className="explanation-display">
      <h2>Explanation {isSpeaking && "(Speaking...)"}</h2>
      <div className="explanation-content">
        {explanation}
      </div>
      
      {requiresUserInteraction && isIOS && (
        <div style={{
          marginTop: '15px',
          padding: '15px',
          background: '#fff3cd',
          border: '1px solid #ffeaa7',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <p style={{ margin: '0 0 10px 0', color: '#856404' }}>
            📱 iOS requires you to tap to play audio
          </p>
          <button
            onClick={handleManualPlay}
            style={{
              background: '#007bff',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            🔊 Play Explanation
          </button>
        </div>
      )}
      
      {isSpeaking && (
        <div className="speech-indicator">
          Reading explanation aloud...
          <div className="speech-animation">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      )}
      
      {/* Simple debug for development */}
      {isIOS && process.env.NODE_ENV === 'development' && (
        <div style={{ 
          marginTop: '10px', 
          fontSize: '12px', 
          color: '#666',
          background: '#f8f9fa',
          padding: '8px',
          borderRadius: '4px'
        }}>
          iOS Debug: Speaking={isSpeaking ? 'Yes' : 'No'}, Method={ttsMethod}, UserInteraction={requiresUserInteraction ? 'Required' : 'Not Required'}
        </div>
      )}
    </div>
  );
}

export default ExplanationDisplay;