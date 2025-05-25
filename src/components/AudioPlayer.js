import React, { useState, useEffect, useRef } from 'react';
import './AudioPlayer.css';

function AudioPlayer({ 
  isPlaying, 
  onPlay, 
  onPause, 
  onExplain, 
  onResume,
  fileName, 
  isExplaining,
  audioFile,
  currentTime: propCurrentTime
}) {
  const [currentTime, setCurrentTime] = useState(propCurrentTime || 0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const playbackStartTime = useRef(null);
  const pausedAt = useRef(propCurrentTime || 0);
  const animationFrame = useRef(null);
  const scrubberRef = useRef(null);

  // Update internal current time when prop changes
  useEffect(() => {
    if (propCurrentTime !== undefined) {
      setCurrentTime(propCurrentTime);
      pausedAt.current = propCurrentTime;
    }
  }, [propCurrentTime]);

  // Setup Media Session API for car controls
  useEffect(() => {
    if ('mediaSession' in navigator) {
      // Set metadata
      navigator.mediaSession.metadata = new MediaMetadata({
        title: fileName || 'Audiobook',
        artist: 'AI Explained Audiobook',
        album: 'Audiobook Collection',
      });

      // Set up action handlers
      navigator.mediaSession.setActionHandler('play', () => {
        if (!isExplaining) {
          onPlay();
        }
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        if (!isExplaining) {
          onPause();
        }
      });

      // Map the previoustrack action to explain functionality
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        console.log('[AudioPlayer] Car back button pressed - triggering explain');
        if (!isExplaining && (isPlaying || fileName)) {
          onExplain();
        }
      });

      // Optional: You could also map seekbackward to explain
      navigator.mediaSession.setActionHandler('seekbackward', (event) => {
        console.log('[AudioPlayer] Car seek backward pressed - triggering explain');
        if (!isExplaining && (isPlaying || fileName)) {
          onExplain();
        }
      });

      // Update playback state
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

      // Update position state if we have duration
      if (duration > 0) {
        navigator.mediaSession.setPositionState({
          duration: duration,
          playbackRate: 1,
          position: currentTime
        });
      }
    }

    // Cleanup functionaa
    return () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('seekbackward', null);
      }
    };
  }, [isPlaying, isExplaining, fileName, onPlay, onPause, onExplain, duration, currentTime]);

  // Calculate and update current time
  const updateCurrentTime = () => {
    if (isPlaying && playbackStartTime.current !== null) {
      const elapsed = (Date.now() - playbackStartTime.current) / 1000;
      const newCurrentTime = pausedAt.current + elapsed;
      
      if (newCurrentTime >= duration) {
        setCurrentTime(duration);
        // Audio has ended
        return;
      }
      
      setCurrentTime(newCurrentTime);
      animationFrame.current = requestAnimationFrame(updateCurrentTime);
    }
  };

  // Get audio duration when file changes
  useEffect(() => {
    if (audioFile) {
      const audio = new Audio();
      audio.preload = 'metadata';
      
      audio.addEventListener('loadedmetadata', () => {
        setDuration(audio.duration);
        if (!propCurrentTime) {
          setCurrentTime(0);
          pausedAt.current = 0;
        }
      });

      audio.src = URL.createObjectURL(audioFile);
      
      return () => {
        URL.revokeObjectURL(audio.src);
      };
    }
  }, [audioFile]);

  // Handle play/pause state changes
  useEffect(() => {
    if (isPlaying) {
      playbackStartTime.current = Date.now();
      updateCurrentTime();
    } else {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
      if (playbackStartTime.current !== null) {
        const elapsed = (Date.now() - playbackStartTime.current) / 1000;
        pausedAt.current += elapsed;
        setCurrentTime(pausedAt.current);
      }
      playbackStartTime.current = null;
    }

    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [isPlaying]);

  // Format time display
  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Handle scrubber interactions
  const handleScrubberClick = (e) => {
    if (!scrubberRef.current || isDragging) return;
    
    const rect = scrubberRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = Math.max(0, Math.min(duration, percentage * duration));
    
    seekTo(newTime);
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    handleScrubberClick(e);
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !scrubberRef.current) return;
    
    const rect = scrubberRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * duration;
    
    setCurrentTime(newTime);
  };

  const handleMouseUp = (e) => {
    if (!isDragging) return;
    
    const rect = scrubberRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * duration;
    
    seekTo(newTime);
    setIsDragging(false);
  };

  // Add global mouse events for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, duration]);

  // Seek to specific time
  const seekTo = (time) => {
    const newTime = Math.max(0, Math.min(duration, time));
    setCurrentTime(newTime);
    pausedAt.current = newTime;
    
    // If playing, restart from new position
    if (isPlaying) {
      playbackStartTime.current = Date.now();
    }
    
    // Notify parent component about seek
    if (window.audioPlayerSeek) {
      window.audioPlayerSeek(newTime);
    }
  };

  // Calculate progress percentage
  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  console.log('[AudioPlayer.js] Rendering AudioPlayer component, playing status:', isPlaying);

  return (
    <div className="audio-player">
      <h2>Now Playing: {fileName}</h2>
      
      {/* Time Display */}
      <div className="time-display">
        <span className="current-time">{formatTime(currentTime)}</span>
        <span className="duration">{formatTime(duration)}</span>
      </div>
      
      {/* Progress Bar / Scrubber */}
      <div 
        className="scrubber-container"
        ref={scrubberRef}
        onClick={handleScrubberClick}
        onMouseDown={handleMouseDown}
      >
        <div className="scrubber-track">
          <div 
            className="scrubber-progress"
            style={{ width: `${progressPercentage}%` }}
          />
          <div 
            className="scrubber-thumb"
            style={{ left: `${progressPercentage}%` }}
          />
        </div>
      </div>
      
      <div className="controls">
        {!isPlaying ? (
          <button 
            onClick={() => onPlay()}
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
          disabled={(!isPlaying && !fileName) || isExplaining}
        >
          {isExplaining ? 'Explaining...' : 'Explain Last 10 Seconds'}
        </button>
        
        <button 
          onClick={onResume}
          disabled={isPlaying || !fileName || isExplaining}
          style={{ opacity: 0.7 }}
        >
          Resume Manually
        </button>
      </div>
      
      <p className="instructions">
        Press "Explain" to have the AI explain what's happening in the audiobook.
        <br/>
        <small>The audiobook will automatically resume after the explanation is read aloud.</small>
        <br/>
        <small><strong>Car users:</strong> Press the back/previous button on your car stereo to trigger explanations.</small>
      </p>
    </div>
  );
}

export default AudioPlayer;
