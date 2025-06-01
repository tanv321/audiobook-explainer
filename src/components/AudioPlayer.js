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

  // iOS detection
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  // Update internal current time when prop changes
  useEffect(() => {
    if (propCurrentTime !== undefined) {
      setCurrentTime(propCurrentTime);
      pausedAt.current = propCurrentTime;
      
      // If we're explaining, don't restart the playback timer
      if (!isExplaining) {
        playbackStartTime.current = isPlaying ? Date.now() : null;
      }
    }
  }, [propCurrentTime, isExplaining, isPlaying]);

  // Enhanced Media Session API setup with iOS PWA error handling
  useEffect(() => {
    if ('mediaSession' in navigator) {
      try {
        // Set metadata
        navigator.mediaSession.metadata = new MediaMetadata({
          title: fileName || 'Audiobook',
          artist: 'AI Explained Audiobook',
          album: 'Audiobook Collection',
        });

        console.log('[AudioPlayer] Media Session metadata set successfully');
      } catch (error) {
        console.warn('[AudioPlayer] Failed to set Media Session metadata:', error);
      }

      // Set up action handlers with error handling
      const setupActionHandler = (action, handler) => {
        try {
          navigator.mediaSession.setActionHandler(action, handler);
          console.log(`[AudioPlayer] Media Session ${action} handler set successfully`);
        } catch (error) {
          console.warn(`[AudioPlayer] Failed to set Media Session ${action} handler:`, error);
        }
      };

      setupActionHandler('play', () => {
        if (!isExplaining) {
          console.log('[AudioPlayer] Media Session play triggered');
          onPlay();
        }
      });

      setupActionHandler('pause', () => {
        if (!isExplaining) {
          console.log('[AudioPlayer] Media Session pause triggered');
          onPause();
        }
      });

      // Map the previoustrack action to explain functionality
      setupActionHandler('previoustrack', () => {
        console.log('[AudioPlayer] Car back button pressed - triggering explain');
        if (!isExplaining && (isPlaying || fileName)) {
          onExplain();
        }
      });

      // Optional: You could also map seekbackward to explain
      setupActionHandler('seekbackward', (event) => {
        console.log('[AudioPlayer] Car seek backward pressed - triggering explain');
        if (!isExplaining && (isPlaying || fileName)) {
          onExplain();
        }
      });

      // Update playback state with error handling
      try {
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
        console.log('[AudioPlayer] Media Session playback state updated:', isPlaying ? 'playing' : 'paused');
      } catch (error) {
        console.warn('[AudioPlayer] Failed to update Media Session playback state:', error);
      }

      // Update position state with enhanced iOS PWA error handling
      if (duration > 0 && !isNaN(duration) && !isNaN(currentTime)) {
        try {
          // iOS PWA specific validation
          const positionData = {
            duration: Math.max(0, Number(duration)) || 0,
            playbackRate: 1.0,
            position: Math.max(0, Math.min(Number(currentTime) || 0, Number(duration) || 0))
          };

          // Additional validation for iOS
          if (isIOS) {
            // Ensure all values are finite numbers
            if (!isFinite(positionData.duration) || 
                !isFinite(positionData.position) || 
                !isFinite(positionData.playbackRate)) {
              console.warn('[AudioPlayer] Invalid position data for iOS, skipping setPositionState');
              return;
            }

            // Ensure position is not greater than duration
            if (positionData.position > positionData.duration) {
              positionData.position = positionData.duration;
            }

            // Ensure minimum values
            if (positionData.duration < 0.1) {
              console.warn('[AudioPlayer] Duration too small for iOS setPositionState, skipping');
              return;
            }
          }

          console.log('[AudioPlayer] Setting position state:', positionData);
          navigator.mediaSession.setPositionState(positionData);
          console.log('[AudioPlayer] Media Session position state updated successfully');
        } catch (error) {
          console.warn('[AudioPlayer] Failed to update Media Session position state:', error);
          
          // On iOS, if setPositionState fails, we can still use the other Media Session features
          if (isIOS) {
            console.log('[AudioPlayer] Continuing without position state on iOS');
          }
        }
      } else {
        console.log('[AudioPlayer] Skipping position state update - invalid duration or currentTime');
      }
    }

    // Cleanup function
    return () => {
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.setActionHandler('play', null);
          navigator.mediaSession.setActionHandler('pause', null);
          navigator.mediaSession.setActionHandler('previoustrack', null);
          navigator.mediaSession.setActionHandler('seekbackward', null);
          console.log('[AudioPlayer] Media Session handlers cleaned up');
        } catch (error) {
          console.warn('[AudioPlayer] Error cleaning up Media Session handlers:', error);
        }
      }
    };
  }, [isPlaying, isExplaining, fileName, onPlay, onPause, onExplain, duration, currentTime]);

  // Calculate and update current time
  const updateCurrentTime = () => {
    // Only update time if we're actually playing AND not explaining
    if (isPlaying && !isExplaining && playbackStartTime.current !== null) {
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
        const audioDuration = audio.duration;
        
        // Validate duration before setting
        if (isFinite(audioDuration) && audioDuration > 0) {
          setDuration(audioDuration);
          console.log('[AudioPlayer] Audio duration set:', audioDuration);
          
          if (!propCurrentTime) {
            setCurrentTime(0);
            pausedAt.current = 0;
          }
        } else {
          console.warn('[AudioPlayer] Invalid audio duration:', audioDuration);
          setDuration(0);
        }
      });

      audio.addEventListener('error', (error) => {
        console.error('[AudioPlayer] Error loading audio metadata:', error);
        setDuration(0);
      });

      audio.src = URL.createObjectURL(audioFile);
      
      return () => {
        URL.revokeObjectURL(audio.src);
      };
    }
  }, [audioFile, propCurrentTime]);

  // Handle play/pause state changes
  useEffect(() => {
    if (isPlaying && !isExplaining) {
      // Only start time tracking if we're playing and not explaining
      playbackStartTime.current = Date.now();
      updateCurrentTime();
    } else {
      // Stop time tracking if paused OR explaining
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
      
      if (playbackStartTime.current !== null && !isExplaining) {
        // Only update pausedAt if we're not explaining (to avoid time jumps)
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
  }, [isPlaying, isExplaining]); // Added isExplaining as dependency

  // Format time display
  const formatTime = (time) => {
    if (!isFinite(time) || time < 0) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Handle scrubber interactions
  const handleScrubberClick = (e) => {
    if (!scrubberRef.current || isDragging || !duration || !isFinite(duration)) return;
    
    const rect = scrubberRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = Math.max(0, Math.min(duration, percentage * duration));
    
    if (isFinite(newTime)) {
      seekTo(newTime);
    }
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    handleScrubberClick(e);
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !scrubberRef.current || !duration || !isFinite(duration)) return;
    
    const rect = scrubberRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * duration;
    
    if (isFinite(newTime)) {
      setCurrentTime(newTime);
    }
  };

  const handleMouseUp = (e) => {
    if (!isDragging || !duration || !isFinite(duration)) return;
    
    const rect = scrubberRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * duration;
    
    if (isFinite(newTime)) {
      seekTo(newTime);
    }
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
    if (!isFinite(time) || !isFinite(duration)) return;
    
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

  // Calculate progress percentage with safety checks
  const progressPercentage = (duration > 0 && isFinite(duration) && isFinite(currentTime)) ? 
    (currentTime / duration) * 100 : 0;

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
            style={{ width: `${Math.max(0, Math.min(100, progressPercentage))}%` }}
          />
          <div 
            className="scrubber-thumb"
            style={{ left: `${Math.max(0, Math.min(100, progressPercentage))}%` }}
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
      
      {/* iOS PWA Debug Info */}
      {isIOS && process.env.NODE_ENV === 'development' && (
        <div style={{
          marginTop: '10px',
          padding: '8px',
          background: '#f8f9fa',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#666'
        }}>
          iOS PWA Debug: Duration={isFinite(duration) ? duration.toFixed(1) : 'invalid'}, 
          CurrentTime={isFinite(currentTime) ? currentTime.toFixed(1) : 'invalid'}, 
          Progress={progressPercentage.toFixed(1)}%
        </div>
      )}
    </div>
  );
}

export default AudioPlayer;