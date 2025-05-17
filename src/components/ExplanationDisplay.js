import React, { useEffect } from 'react';

function ExplanationDisplay({ explanation }) {
  console.log('[ExplanationDisplay.js] Rendering explanation');
  
  useEffect(() => {
    if (explanation) {
      // Here you could add text-to-speech functionality
      // to read the explanation aloud
      console.log('[ExplanationDisplay.js] New explanation received, could trigger TTS here');
    }
  }, [explanation]);

  if (!explanation) {
    return null;
  }

  return (
    <div className="explanation-display">
      <h2>Explanation</h2>
      <div className="explanation-content">
        {explanation}
      </div>
    </div>
  );
}

export default ExplanationDisplay;