import React, { useEffect, useState, useRef } from 'react';
import './ExplanationDisplay.css';

function ExplanationDisplay({ explanation, onSpeechEnd }) {
  console.log('[ExplanationDisplay.js] Rendering explanation');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef(null);
  const isProcessingRef = useRef(false);
  const timeoutIdsRef = useRef([]);
  
  // Get Google TTS API key from environment
  const GOOGLE_TTS_API_KEY = process.env.REACT_APP_GOOGLE_TTS_API_KEY;
  
  // Google TTS function
  const speakWithGoogleTTS = async (text) => {
    if (!text || isProcessingRef.current) return;
    
    isProcessingRef.current = true;
    console.log('[ExplanationDisplay.js] Starting Google TTS');
    
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
            audioEncoding: 'MP3',
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
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        isProcessingRef.current = false;
        
        // Call callback on error
        if (onSpeechEnd) {
          const timeoutId = setTimeout(() => onSpeechEnd(), 300);
          timeoutIdsRef.current.push(timeoutId);
        }
      };

      // Start playing the audio
      console.log('[ExplanationDisplay.js] Starting audio playback');
      await audio.play();

    } catch (error) {
      console.error('[ExplanationDisplay.js] Error with Google TTS:', error);
      setIsSpeaking(false);
      isProcessingRef.current = false;
      
      // Fallback to browser speech synthesis if Google TTS fails
      console.log('[ExplanationDisplay.js] Falling back to browser speech synthesis');
      fallbackToBrowserSpeech(text);
    }
  };

  // Fallback to browser speech synthesis
  const fallbackToBrowserSpeech = (text) => {
    try {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      utterance.onstart = () => {
        console.log('[ExplanationDisplay.js] Fallback speech started');
        setIsSpeaking(true);
      };

      utterance.onend = () => {
        console.log('[ExplanationDisplay.js] Fallback speech ended');
        setIsSpeaking(false);
        if (onSpeechEnd) {
          const timeoutId = setTimeout(() => onSpeechEnd(), 300);
          timeoutIdsRef.current.push(timeoutId);
        }
      };

      utterance.onerror = () => {
        console.error('[ExplanationDisplay.js] Fallback speech error');
        setIsSpeaking(false);
        if (onSpeechEnd) {
          const timeoutId = setTimeout(() => onSpeechEnd(), 300);
          timeoutIdsRef.current.push(timeoutId);
        }
      };

      window.speechSynthesis.speak(utterance);
    } catch (fallbackError) {
      console.error('[ExplanationDisplay.js] Fallback speech synthesis failed:', fallbackError);
      setIsSpeaking(false);
      if (onSpeechEnd) {
        onSpeechEnd();
      }
    }
  };
  
  // Speak the explanation when it changes
  useEffect(() => {
    if (explanation) {
      console.log('[ExplanationDisplay.js] New explanation received, starting Google TTS');
      // Add a small delay before starting speech
      const timeoutId = setTimeout(() => speakWithGoogleTTS(explanation), 300);
      timeoutIdsRef.current.push(timeoutId);
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
    </div>
  );
}

export default ExplanationDisplay;
