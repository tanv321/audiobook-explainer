import React, { useEffect, useState, useRef } from 'react';
import './ExplanationDisplay.css';

function ExplanationDisplay({ explanation, onSpeechEnd }) {
  console.log('[ExplanationDisplay.js] Rendering explanation');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speechUtteranceRef = useRef(null);
  const isProcessingRef = useRef(false);
  const timeoutIdsRef = useRef([]);
  
  // Setup speech synthesis
  const speak = (text) => {
    if (!text || isProcessingRef.current) return;
    
    isProcessingRef.current = true;
    console.log('[ExplanationDisplay.js] Starting speech preparation');
    
    // Make sure speech synthesis is ready
    if (window.speechSynthesis.speaking) {
      console.log('[ExplanationDisplay.js] Canceling previous speech');
      window.speechSynthesis.cancel();
      // Allow a short delay for cleanup
      const timeoutId = setTimeout(() => startNewSpeech(text), 300);
      timeoutIdsRef.current.push(timeoutId);
    } else {
      startNewSpeech(text);
    }
  };
  
  const startNewSpeech = (text) => {
    try {
      // Create a new speech utterance
      const utterance = new SpeechSynthesisUtterance(text);
      speechUtteranceRef.current = utterance;
      
      // Set properties for the speech
      utterance.rate = 1.0;  // Normal speed
      utterance.pitch = 1.0; // Normal pitch
      utterance.volume = 1.0; // Full volume
      
      // Handle speech events
      utterance.onstart = () => {
        console.log('[ExplanationDisplay.js] Speech started');
        setIsSpeaking(true);
        isProcessingRef.current = false;
      };
      
      utterance.onend = () => {
        console.log('[ExplanationDisplay.js] Speech completed normally');
        setIsSpeaking(false);
        speechUtteranceRef.current = null;
        
        // Call the callback to notify parent component that speech has ended
        // Use setTimeout to ensure we don't have state update conflicts
        const timeoutId = setTimeout(() => {
          if (onSpeechEnd) {
            onSpeechEnd();
          }
        }, 300);
        timeoutIdsRef.current.push(timeoutId);
      };
      
      utterance.onerror = (event) => {
        console.error('[ExplanationDisplay.js] Speech error:', event.error);
        setIsSpeaking(false);
        speechUtteranceRef.current = null;
        isProcessingRef.current = false;
        
        // Only call callback on non-interrupted errors or if speech actually started
        if (event.error !== 'interrupted' || event.elapsedTime > 0) {
          console.log('[ExplanationDisplay.js] Calling speech end callback after error');
          if (onSpeechEnd) {
            const timeoutId = setTimeout(() => onSpeechEnd(), 300);
            timeoutIdsRef.current.push(timeoutId);
          }
        }
      };
      
      console.log('[ExplanationDisplay.js] Starting speech synthesis');
      window.speechSynthesis.speak(utterance);
      
      // Chrome sometimes pauses speech synthesis when the tab is not focused
      // This keeps it running
      const intervalId = setInterval(() => {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          console.log('[ExplanationDisplay.js] Keeping speech synthesis active');
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        } else if (!window.speechSynthesis.speaking) {
          clearInterval(intervalId);
        }
      }, 5000);
    } catch (error) {
      console.error('[ExplanationDisplay.js] Error in speech synthesis:', error);
      isProcessingRef.current = false;
    }
  };
  
  // Speak the explanation when it changes
  useEffect(() => {
    if (explanation) {
      console.log('[ExplanationDisplay.js] New explanation received, starting TTS');
      // Add a small delay before starting speech
      const timeoutId = setTimeout(() => speak(explanation), 300);
      timeoutIdsRef.current.push(timeoutId);
    }
    
    // Cleanup function to cancel speech when component unmounts or explanation changes
    return () => {
      // Clear all timeouts
      timeoutIdsRef.current.forEach(id => clearTimeout(id));
      timeoutIdsRef.current = [];
      
      // Cancel any ongoing speech
      if (speechUtteranceRef.current) {
        console.log('[ExplanationDisplay.js] Cleaning up speech synthesis');
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