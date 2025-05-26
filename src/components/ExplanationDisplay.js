import React, { useEffect, useState, useRef } from 'react';
import './ExplanationDisplay.css';

function ExplanationDisplay({ explanation, onSpeechEnd }) {
  console.log('[ExplanationDisplay.js] Rendering explanation');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsMethod, setTtsMethod] = useState('google'); // 'google' or 'browser'
  const [requiresUserInteraction, setRequiresUserInteraction] = useState(false);
  const audioRef = useRef(null);
  const isProcessingRef = useRef(false);
  const timeoutIdsRef = useRef([]);
  
  // Detect iOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  
  // Get Google TTS API key from environment
  const GOOGLE_TTS_API_KEY = process.env.REACT_APP_GOOGLE_TTS_API_KEY;
  
  // iOS-specific: Check if we can play audio without user interaction
  const checkAutoplaySupport = async () => {
    try {
      const audio = new Audio();
      const canAutoplay = await audio.play().catch(() => false);
      if (canAutoplay !== false) {
        audio.pause();
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  };

  // Enhanced Google TTS function with iOS handling
  const speakWithGoogleTTS = async (text, userInitiated = false) => {
    if (!text || isProcessingRef.current) return;
    
    isProcessingRef.current = true;
    console.log('[ExplanationDisplay.js] Starting Google TTS (iOS mode:', isIOS, ', User initiated:', userInitiated, ')');
    
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
      console.log('[ExplanationDisplay.js] Calling Google TTS API');

      // Call Google Text-to-Speech API
      const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: { text: text },
          voice: {
            languageCode: 'en-US',
            name: 'en-US-Neural2-D', // Male natural voice
            ssmlGender: 'MALE'
          },
          audioConfig: {
            audioEncoding: 'MP3', // Use MP3 for better iOS compatibility
            speakingRate: 1.0,
            pitch: 0.0,
            volumeGainDb: 0.0
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[ExplanationDisplay.js] Google TTS API error:', errorData);
        throw new Error(`Google TTS API error: ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      console.log('[ExplanationDisplay.js] Google TTS API response received');

      // Convert base64 audio to blob and play
      const audioContent = data.audioContent;
      const audioBlob = new Blob([Uint8Array.from(atob(audioContent), c => c.charCodeAt(0))], { type: 'audio/mp3' });
      const audioUrl = URL.createObjectURL(audioBlob);

      // Create and setup audio element
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      // iOS-specific audio setup
      if (isIOS) {
        // Set additional properties for iOS compatibility
        audio.crossOrigin = 'anonymous';
        audio.preload = 'auto';
        
        // Enable inline playback for iOS
        audio.setAttribute('playsinline', 'true');
        audio.setAttribute('webkit-playsinline', 'true');
      }

      audio.onloadstart = () => {
        console.log('[ExplanationDisplay.js] Audio loading started');
      };

      audio.oncanplay = () => {
        console.log('[ExplanationDisplay.js] Audio can start playing');
        isProcessingRef.current = false;
      };

      audio.onplay = () => {
        console.log('[ExplanationDisplay.js] Audio playback started');
      };

      audio.onended = () => {
        console.log('[ExplanationDisplay.js] Audio playback completed');
        setIsSpeaking(false);
        
        // Clean up the blob URL
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        
        // Call the callback to notify parent component
        const timeoutId = setTimeout(() => {
          if (onSpeechEnd) {
            onSpeechEnd();
          }
        }, 300);
        timeoutIdsRef.current.push(timeoutId);
      };

      audio.onerror = (event) => {
        console.error('[ExplanationDisplay.js] Audio playback error:', event);
        console.error('[ExplanationDisplay.js] Audio error details:', {
          error: audio.error,
          networkState: audio.networkState,
          readyState: audio.readyState,
          src: audio.src
        });
        
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        isProcessingRef.current = false;
        
        // On iOS, if audio fails and wasn't user-initiated, try browser fallback
        if (isIOS && !userInitiated) {
          console.log('[ExplanationDisplay.js] iOS audio failed, trying browser TTS fallback');
          fallbackToBrowserSpeech(text);
        } else if (isIOS) {
          // Show user interaction requirement
          setRequiresUserInteraction(true);
          setTtsMethod('browser');
          
          // Call callback on error
          if (onSpeechEnd) {
            const timeoutId = setTimeout(() => onSpeechEnd(), 300);
            timeoutIdsRef.current.push(timeoutId);
          }
        }
      };

      // iOS-specific: Handle play promise
      console.log('[ExplanationDisplay.js] Starting audio playback');
      
      try {
        const playPromise = audio.play();
        
        if (playPromise !== undefined) {
          await playPromise;
          console.log('[ExplanationDisplay.js] Audio started successfully');
        }
      } catch (playError) {
        console.error('[ExplanationDisplay.js] Play promise rejected:', playError);
        
        if (isIOS && playError.name === 'NotAllowedError') {
          console.log('[ExplanationDisplay.js] iOS requires user interaction for audio');
          setRequiresUserInteraction(true);
          setTtsMethod('browser');
          URL.revokeObjectURL(audioUrl);
          
          // Try browser speech as fallback
          fallbackToBrowserSpeech(text);
        } else {
          throw playError;
        }
      }

    } catch (error) {
      console.error('[ExplanationDisplay.js] Error with Google TTS:', error);
      setIsSpeaking(false);
      isProcessingRef.current = false;
      
      // Fallback to browser speech synthesis if Google TTS fails
      console.log('[ExplanationDisplay.js] Falling back to browser speech synthesis');
      fallbackToBrowserSpeech(text);
    }
  };

  // Enhanced browser speech synthesis with iOS optimizations
  const fallbackToBrowserSpeech = (text) => {
    try {
      console.log('[ExplanationDisplay.js] Using browser speech synthesis fallback');
      
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }

      // Wait a moment for iOS to be ready
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        
        // iOS-specific voice settings
        if (isIOS) {
          // Get available voices and prefer English ones
          const voices = window.speechSynthesis.getVoices();
          const englishVoice = voices.find(voice => 
            voice.lang.startsWith('en') && !voice.name.includes('Compact')
          );
          if (englishVoice) {
            utterance.voice = englishVoice;
          }
          
          // Slower rate for iOS for better quality
          utterance.rate = 0.9;
          utterance.pitch = 1.0;
          utterance.volume = 1.0;
        } else {
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          utterance.volume = 1.0;
        }

        utterance.onstart = () => {
          console.log('[ExplanationDisplay.js] Browser speech started');
          setIsSpeaking(true);
          setRequiresUserInteraction(false);
        };

        utterance.onend = () => {
          console.log('[ExplanationDisplay.js] Browser speech ended');
          setIsSpeaking(false);
          if (onSpeechEnd) {
            const timeoutId = setTimeout(() => onSpeechEnd(), 300);
            timeoutIdsRef.current.push(timeoutId);
          }
        };

        utterance.onerror = (event) => {
          console.error('[ExplanationDisplay.js] Browser speech error:', event);
          setIsSpeaking(false);
          
          if (isIOS && event.error === 'not-allowed') {
            setRequiresUserInteraction(true);
          }
          
          if (onSpeechEnd) {
            const timeoutId = setTimeout(() => onSpeechEnd(), 300);
            timeoutIdsRef.current.push(timeoutId);
          }
        };

        window.speechSynthesis.speak(utterance);
      }, isIOS ? 500 : 100);
      
    } catch (fallbackError) {
      console.error('[ExplanationDisplay.js] Browser speech synthesis failed:', fallbackError);
      setIsSpeaking(false);
      
      if (isIOS) {
        setRequiresUserInteraction(true);
      }
      
      if (onSpeechEnd) {
        onSpeechEnd();
      }
    }
  };

  // Manual play button for iOS when user interaction is required
  const handleManualPlay = () => {
    console.log('[ExplanationDisplay.js] Manual play triggered by user');
    setRequiresUserInteraction(false);
    
    if (ttsMethod === 'google' && GOOGLE_TTS_API_KEY) {
      speakWithGoogleTTS(explanation, true); // true = user initiated
    } else {
      fallbackToBrowserSpeech(explanation);
    }
  };
  
  // Speak the explanation when it changes
  useEffect(() => {
    if (explanation) {
      console.log('[ExplanationDisplay.js] New explanation received, determining TTS method for iOS:', isIOS);
      
      // For iOS, always try Google TTS first, but be prepared for fallback
      if (GOOGLE_TTS_API_KEY) {
        const timeoutId = setTimeout(() => speakWithGoogleTTS(explanation, false), 300);
        timeoutIdsRef.current.push(timeoutId);
      } else {
        // No Google TTS available, use browser speech
        const timeoutId = setTimeout(() => fallbackToBrowserSpeech(explanation), 300);
        timeoutIdsRef.current.push(timeoutId);
      }
    }
    
    // Cleanup function
    return () => {
      // Clear all timeouts
      timeoutIdsRef.current.forEach(id => clearTimeout(id));
      timeoutIdsRef.current = [];
      
      // Stop any ongoing audio playback
      if (audioRef.current) {
        console.log('[ExplanationDisplay.js] Cleaning up audio playback');
        audioRef.current.pause();
        audioRef.current = null;
      }
      
      // Cancel any browser speech synthesis as fallback cleanup
      if (window.speechSynthesis.speaking) {
        console.log('[ExplanationDisplay.js] Cleaning up browser speech synthesis');
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
      
      {/* iOS-specific: Show manual play button when user interaction is required */}
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
          {isIOS && <span style={{ fontSize: '12px', opacity: 0.7 }}>(iOS mode)</span>}
          <div className="speech-animation">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      )}
      
      {/* Debug info for iOS */}
      {isIOS && process.env.NODE_ENV === 'development' && (
        <div style={{ 
          marginTop: '10px', 
          fontSize: '12px', 
          color: '#666',
          background: '#f8f9fa',
          padding: '8px',
          borderRadius: '4px'
        }}>
          iOS TTS Mode: {ttsMethod} | User Interaction Required: {requiresUserInteraction ? 'Yes' : 'No'}
        </div>
      )}
    </div>
  );
}

export default ExplanationDisplay;