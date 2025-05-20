import React from 'react';

function AudioPlayer({ 
  isPlaying, 
  onPlay, 
  onPause, 
  onExplain, 
  onResume,
  fileName, 
  isExplaining 
}) {
  console.log('[AudioPlayer.js] Rendering AudioPlayer component, playing status:', isPlaying);

  return (
    <div className="audio-player">
      <h2>Now Playing: {fileName}</h2>
      
      <div className="controls">
        {!isPlaying ? (
          <button 
            onClick={onPlay}
            disabled={isExplaining}
          >
            Play
          </button>
        ) : (
          <button 
            onClick={onPause}
            disabled={isExplaining}
          >
            Pause
          </button>
        )}
        
        <button 
          onClick={onExplain}
          disabled={!isPlaying && !fileName || isExplaining}
        >
          {isExplaining ? 'Explaining...' : 'Explain Last 10 Seconds'}
        </button>
        
        {/* Keep the Resume button for manual control if needed */}
        <button 
          onClick={onResume}
          disabled={isPlaying || !fileName || isExplaining}
          style={{ opacity: 0.7 }} // Make it less prominent since auto-resume is available
        >
          Resume Manually
        </button>
      </div>
      
      <p className="instructions">
        Press "Explain" to have the AI explain what's happening in the audiobook.
        <br/>
        <small>The audiobook will automatically resume after the explanation is read aloud.</small>
      </p>
    </div>
  );
}

export default AudioPlayer;