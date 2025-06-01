// iOS-Compatible Audio Service - Fixed buffer management and comprehensive logging
console.log('[audioService.js] Loading improved iOS-compatible audio service with enhanced logging');

let audioContext = null;
let audioSource = null;
let audioBuffer = null;
let mediaRecorder = null;
let recordedChunks = [];
let lastTenSecondsBuffer = [];
let audioSampleRate = 44100;
let recordingStream = null;
const MAX_BUFFER_SIZE = 20; // Increased for better 10-second coverage
let audioStartTime = null;
let isRecordingActive = false;
let isResetting = false;
let currentPlaybackTime = 0;

// Enhanced logging system
let debugLogs = [];
const MAX_LOG_ENTRIES = 1000;

// iOS-specific variables
let isIOS = false;
let safariVersion = null;
let supportedMimeType = null;

// Buffer management variables
let bufferStartTime = null;
let chunkDuration = 500; // milliseconds per chunk
let maxChunksFor10Seconds = Math.ceil(10000 / chunkDuration); // 20 chunks for 10 seconds

// Enhanced logging function
const logDebug = (message, data = null) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    message,
    data: data ? JSON.stringify(data) : null,
    memoryUsage: performance.memory ? {
      used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
      total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024)
    } : null
  };
  
  debugLogs.push(logEntry);
  
  // Keep only the last MAX_LOG_ENTRIES
  if (debugLogs.length > MAX_LOG_ENTRIES) {
    debugLogs = debugLogs.slice(-MAX_LOG_ENTRIES);
  }
  
  console.log(`[audioService.js] ${message}`, data || '');
};

// Download debug logs as file
export const downloadDebugLogs = () => {
  try {
    const logData = {
      deviceInfo: getDeviceInfo(),
      timestamp: new Date().toISOString(),
      logs: debugLogs,
      bufferState: {
        bufferSize: lastTenSecondsBuffer.length,
        maxBufferSize: MAX_BUFFER_SIZE,
        chunksFor10Seconds: maxChunksFor10Seconds,
        chunkDuration,
        isRecordingActive,
        supportedMimeType
      }
    };
    
    const blob = new Blob([JSON.stringify(logData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audiobook-debug-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    logDebug('Debug logs downloaded successfully');
  } catch (error) {
    logDebug('Error downloading debug logs', { error: error.message });
  }
};

// Detect iOS and Safari version
const detectDevice = () => {
  const userAgent = navigator.userAgent;
  isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
  
  // Extract Safari version
  const safariMatch = userAgent.match(/Version\/(\d+\.\d+)/);
  if (safariMatch) {
    safariVersion = parseFloat(safariMatch[1]);
  }
  
  logDebug('Device detection completed', { isIOS, safariVersion, userAgent });
  return { isIOS, safariVersion };
};

// Determine the best supported MIME type for the current device
const getBestSupportedMimeType = () => {
  if (!window.MediaRecorder) {
    logDebug('MediaRecorder not supported');
    return null;
  }

  // iOS Safari priority order (based on research)
  const iosMimeTypes = [
    'audio/mp4',
    'audio/mp4; codecs="mp4a.40.2"',  // AAC-LC
    'video/mp4', // Sometimes iOS MediaRecorder only supports video container
  ];

  // Desktop/Chrome priority order
  const desktopMimeTypes = [
    'audio/webm; codecs=opus',
    'audio/webm',
    'audio/ogg; codecs=opus',
  ];

  const mimeTypesToTest = isIOS ? iosMimeTypes : desktopMimeTypes;
  
  logDebug('Testing MIME types', { platform: isIOS ? 'iOS' : 'Desktop', types: mimeTypesToTest });
  
  const supportResults = {};
  for (const mimeType of mimeTypesToTest) {
    const isSupported = MediaRecorder.isTypeSupported(mimeType);
    supportResults[mimeType] = isSupported;
    
    if (isSupported) {
      logDebug('Selected MIME type', { mimeType });
      return mimeType;
    }
  }
  
  logDebug('No supported MIME types found', { supportResults });
  return null;
};

// Enhanced buffer management - keep only the last 10 seconds
const manageBuffer = () => {
  if (!bufferStartTime) {
    bufferStartTime = Date.now();
  }
  
  const currentTime = Date.now();
  const tenSecondsAgo = currentTime - 10000; // 10 seconds in milliseconds
  
  // Remove chunks older than 10 seconds
  lastTenSecondsBuffer = lastTenSecondsBuffer.filter(chunk => chunk.timestamp >= tenSecondsAgo);
  
  // Also limit by count as a safety measure
  if (lastTenSecondsBuffer.length > maxChunksFor10Seconds) {
    const excessChunks = lastTenSecondsBuffer.length - maxChunksFor10Seconds;
    lastTenSecondsBuffer.splice(0, excessChunks);
    logDebug('Buffer trimmed by count', { 
      removed: excessChunks, 
      remaining: lastTenSecondsBuffer.length 
    });
  }
  
  // Log buffer state periodically (every 20 chunks)
  if (lastTenSecondsBuffer.length % 20 === 0) {
    const oldestChunk = lastTenSecondsBuffer[0];
    const newestChunk = lastTenSecondsBuffer[lastTenSecondsBuffer.length - 1];
    
    logDebug('Buffer state check', {
      bufferSize: lastTenSecondsBuffer.length,
      timeSpan: oldestChunk && newestChunk ? 
        (newestChunk.timestamp - oldestChunk.timestamp) / 1000 : 0,
      oldestAge: oldestChunk ? (currentTime - oldestChunk.timestamp) / 1000 : 0
    });
  }
};

const resetRecordingState = () => {
  try {
    logDebug('Resetting recording state');
    
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch (e) {
        logDebug('Error stopping media recorder during reset', { error: e.message });
      }
    }
    
    recordedChunks = [];
    lastTenSecondsBuffer = [];
    bufferStartTime = null;
    isRecordingActive = false;
    
    logDebug('Recording state reset complete');
  } catch (error) {
    logDebug('Error during recording state reset', { error: error.message });
  }
};

export const initializeAudio = async (audioFile, seekTime = 0) => {
  logDebug('Initializing audio', { fileName: audioFile.name, seekTime });
  
  // Detect device capabilities
  const deviceInfo = detectDevice();
  supportedMimeType = getBestSupportedMimeType();
  
  if (!supportedMimeType) {
    const error = 'No supported audio recording format found on this device';
    logDebug('Initialization failed', { error });
    throw new Error(error);
  }
  
  resetRecordingState();
  
  try {
    if (audioContext && audioSource) {
      audioSource.stop();
      audioSource.disconnect();
    }
    
    if (!audioContext || audioContext.state === 'closed') {
      // iOS requires user interaction to create AudioContext
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioSampleRate = audioContext.sampleRate;
      
      logDebug('AudioContext created', { 
        sampleRate: audioSampleRate, 
        state: audioContext.state 
      });
      
      // iOS-specific: Resume context if suspended
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
        logDebug('AudioContext resumed from suspended state');
      }
    } else if (audioContext.state === 'suspended') {
      await audioContext.resume();
      logDebug('AudioContext resumed');
    }
    
    const arrayBuffer = await readFileAsArrayBuffer(audioFile);
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    logDebug('Audio buffer decoded', { 
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels
    });
    
    audioSource = audioContext.createBufferSource();
    audioSource.buffer = audioBuffer;
    
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    
    const destination = audioContext.createMediaStreamDestination();
    recordingStream = destination.stream;
    
    audioSource.connect(analyser);
    analyser.connect(audioContext.destination);
    audioSource.connect(destination);
    
    await setupMediaRecorder(recordingStream);
    
    audioStartTime = Date.now();
    currentPlaybackTime = seekTime;
    bufferStartTime = Date.now(); // Reset buffer timing
    
    // Start from the specified time
    audioSource.start(0, seekTime);
    
    logDebug('Audio playback started', { seekTime, audioStartTime });
    
    return { context: audioContext, source: audioSource };
  } catch (error) {
    logDebug('Error initializing audio', { error: error.message });
    throw error;
  }
};

export const getCurrentPlaybackTime = () => {
  if (!audioStartTime) return 0;
  const elapsedSinceStart = (Date.now() - audioStartTime) / 1000;
  return currentPlaybackTime + elapsedSinceStart;
};

export const setCurrentPlaybackTime = (time) => {
  currentPlaybackTime = time;
  audioStartTime = Date.now();
  logDebug('Playback time set', { time });
};

const setupMediaRecorder = async (stream) => {
  try {
    logDebug('Setting up MediaRecorder', { supportedMimeType });
    
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch (e) {
        logDebug('Error stopping existing media recorder', { error: e.message });
      }
    }
    
    if (!supportedMimeType) {
      throw new Error('No supported MIME type available');
    }
    
    // iOS-specific MediaRecorder options
    const options = { mimeType: supportedMimeType };
    
    // Add iOS-specific bitrate settings for better compatibility
    if (isIOS) {
      // Lower bitrates for iOS to prevent memory issues
      options.audioBitsPerSecond = 48000; // Reduced from 64000
      chunkDuration = 500; // 0.5 second chunks for iOS
      maxChunksFor10Seconds = Math.ceil(10000 / chunkDuration);
    } else {
      chunkDuration = 1000; // 1 second chunks for desktop
      maxChunksFor10Seconds = Math.ceil(10000 / chunkDuration);
    }
    
    logDebug('MediaRecorder options', { 
      options, 
      chunkDuration, 
      maxChunksFor10Seconds 
    });
    
    mediaRecorder = new MediaRecorder(stream, options);
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        const chunkInfo = {
          size: event.data.size,
          type: event.data.type,
          timestamp: Date.now()
        };
        
        logDebug('Audio chunk received', chunkInfo);
        
        recordedChunks.push(event.data);
        
        lastTenSecondsBuffer.push({
          timestamp: Date.now(),
          data: event.data,
          size: event.data.size
        });
        
        // Enhanced buffer management
        manageBuffer();
        
        // Prevent unlimited growth of recordedChunks
        if (recordedChunks.length > 1000) { // Keep last 1000 chunks max
          const removedCount = recordedChunks.length - 500; // Keep last 500
          recordedChunks.splice(0, removedCount);
          logDebug('Main chunks array trimmed', { removed: removedCount });
        }
      }
    };
    
    mediaRecorder.onerror = (error) => {
      logDebug('Media recorder error', { error: error.toString() });
    };
    
    mediaRecorder.onstart = () => {
      logDebug('MediaRecorder started successfully');
      isRecordingActive = true;
    };
    
    mediaRecorder.onstop = () => {
      logDebug('MediaRecorder stopped');
    };
    
    logDebug('Starting MediaRecorder', { chunkInterval: chunkDuration });
    mediaRecorder.start(chunkDuration);
    
    return mediaRecorder;
  } catch (error) {
    logDebug('Error setting up media recorder', { error: error.message });
    throw error;
  }
};

export const stopRecording = () => {
  return new Promise((resolve, reject) => {
    try {
      logDebug('Stop recording requested', {
        mediaRecorderState: mediaRecorder?.state,
        isRecordingActive,
        bufferSize: lastTenSecondsBuffer.length
      });
      
      if (!mediaRecorder || mediaRecorder.state === 'inactive' || !isRecordingActive) {
        const error = 'Media recorder not active';
        logDebug('Stop recording failed', { error });
        reject(new Error(error));
        return;
      }
      
      if (isResetting) {
        const error = 'Reset operation in progress';
        logDebug('Stop recording failed', { error });
        reject(new Error(error));
        return;
      }
      
      isResetting = true;
      
      // Create a clean copy of the buffer for the last 10 seconds
      const bufferCopy = [...lastTenSecondsBuffer];
      const chunksCopy = [...recordedChunks];
      
      // Validate buffer before processing
      if (bufferCopy.length === 0) {
        const error = 'No audio chunks in buffer';
        logDebug('Stop recording failed', { error });
        isResetting = false;
        reject(new Error(error));
        return;
      }
      
      const bufferAnalysis = {
        totalChunks: bufferCopy.length,
        totalSize: bufferCopy.reduce((sum, chunk) => sum + chunk.size, 0),
        timeSpan: bufferCopy.length > 1 ? 
          (bufferCopy[bufferCopy.length - 1].timestamp - bufferCopy[0].timestamp) / 1000 : 0,
        oldestChunkAge: (Date.now() - bufferCopy[0].timestamp) / 1000
      };
      
      logDebug('Buffer analysis before processing', bufferAnalysis);
      
      isRecordingActive = false;
      
      const processAudio = async (buffer, chunks, mimeType) => {
        try {
          logDebug('Processing audio', { 
            bufferChunks: buffer.length, 
            totalChunks: chunks.length, 
            mimeType 
          });
          
          // Extract just the data blobs from buffer
          const processedChunks = buffer.map(item => item.data);
          
          if (processedChunks.length === 0) {
            throw new Error('No audio chunks to process');
          }
          
          // Enhanced audio blob creation with validation
          const properAudioBlob = await createProperAudioFile(processedChunks, chunks, mimeType);
          const resultMimeType = properAudioBlob.type || mimeType;
          
          // Validate the created blob
          if (properAudioBlob.size === 0) {
            throw new Error('Created audio blob is empty');
          }
          
          // iOS-specific size validation
          if (isIOS && properAudioBlob.size > 25 * 1024 * 1024) { // 25MB limit
            throw new Error(`Audio blob too large for iOS: ${Math.round(properAudioBlob.size / 1024 / 1024)}MB`);
          }
          
          const result = {
            audioBlob: properAudioBlob,
            mimeType: resultMimeType,
            filename: `audio.${getFileExtensionFromMimeType(resultMimeType)}`
          };
          
          logDebug('Audio processing complete', {
            size: result.audioBlob.size,
            type: result.mimeType,
            filename: result.filename,
            sizeKB: Math.round(result.audioBlob.size / 1024)
          });
          
          return result;
        } catch (error) {
          logDebug('Error in processAudio', { error: error.message });
          throw error;
        }
      };
      
      const handleStop = () => {
        processAudio(bufferCopy, chunksCopy, mediaRecorder.mimeType)
          .then(result => {
            logDebug('Audio processing successful, resolving promise');
            resolve(result);
            
            // Restart recording after a brief delay
            setTimeout(() => {
              try {
                if (recordingStream && !isResetting) {
                  setupMediaRecorder(recordingStream);
                }
              } catch (error) {
                logDebug('Error restarting media recorder', { error: error.message });
              }
              isResetting = false;
            }, isIOS ? 300 : 100); // Longer delay for iOS
          })
          .catch(error => {
            logDebug('Audio processing failed', { error: error.message });
            // Download debug logs on error
            setTimeout(() => downloadDebugLogs(), 1000);
            reject(error);
            isResetting = false;
          });
      };
      
      // iOS-specific: Add timeout as fallback
      const stopTimeout = setTimeout(() => {
        logDebug('Stop timeout triggered, processing audio anyway');
        handleStop();
      }, isIOS ? 3000 : 2000); // Longer timeout for iOS
      
      mediaRecorder.addEventListener('stop', () => {
        clearTimeout(stopTimeout);
        logDebug('MediaRecorder stop event received');
        handleStop();
      }, { once: true });
      
      try {
        logDebug('Stopping MediaRecorder...');
        mediaRecorder.stop();
      } catch (error) {
        logDebug('Error stopping MediaRecorder', { error: error.message });
        clearTimeout(stopTimeout);
        handleStop();
      }
    } catch (error) {
      logDebug('Error in stopRecording', { error: error.message });
      // Download debug logs on error
      setTimeout(() => downloadDebugLogs(), 1000);
      reject(error);
      isResetting = false;
    }
  });
};

const createProperAudioFile = async (chunks, allChunks, mimeType) => {
  logDebug('Creating proper audio file', { 
    chunksCount: chunks.length, 
    allChunksCount: allChunks.length,
    mimeType,
    isIOS 
  });
  
  try {
    // For iOS MP4, create a simple blob with proper header
    if (isIOS && mimeType.includes('mp4')) {
      logDebug('Using iOS MP4 optimized blob creation');
      
      // Take the first chunk as header (contains important metadata)
      const headerChunk = allChunks.length > 0 ? allChunks[0] : null;
      
      if (headerChunk) {
        // Combine header with the last 10 seconds chunks
        const finalChunks = [headerChunk, ...chunks.filter(chunk => chunk !== headerChunk)];
        
        const blob = new Blob(finalChunks, { type: mimeType });
        
        logDebug('iOS MP4 blob created', { 
          finalChunksCount: finalChunks.length,
          blobSize: blob.size 
        });
        
        return blob;
      }
    }
    
    // For WebM (desktop), ensure proper structure
    if (mimeType.includes('webm')) {
      logDebug('Using WebM optimized blob creation');
      
      const headerChunk = allChunks.length > 0 ? allChunks[0] : null;
      
      if (headerChunk) {
        const finalChunks = [headerChunk, ...chunks.filter(chunk => chunk !== headerChunk)];
        const blob = new Blob(finalChunks, { type: mimeType });
        
        logDebug('WebM blob created', { 
          finalChunksCount: finalChunks.length,
          blobSize: blob.size 
        });
        
        return blob;
      }
    }
    
    // Fallback: return simple blob
    logDebug('Using fallback blob creation');
    const blob = new Blob(chunks, { type: mimeType });
    
    logDebug('Fallback blob created', { blobSize: blob.size });
    
    return blob;
  } catch (error) {
    logDebug('Error creating proper audio file', { error: error.message });
    throw error;
  }
};

const getFileExtensionFromMimeType = (mimeType) => {
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  return isIOS ? 'mp4' : 'webm'; // Default based on platfor
};

const readFileAsArrayBuffer = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      resolve(event.target.result);
    };
    
    reader.onerror = (error) => {
      logDebug('Error reading file as ArrayBuffer', { error: error.toString() });
      reject(error);
    };
    
    reader.readAsArrayBuffer(file);
  });
};

// Export device detection and debug functions
export const getDeviceInfo = () => {
  return {
    isIOS,
    safariVersion,
    supportedMimeType,
    userAgent: navigator.userAgent,
    memoryInfo: performance.memory ? {
      used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
      total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
      limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
    } : null
  };
};

export const getDebugInfo = () => {
  return {
    bufferState: {
      bufferSize: lastTenSecondsBuffer.length,
      maxBufferSize: MAX_BUFFER_SIZE,
      chunksFor10Seconds: maxChunksFor10Seconds,
      chunkDuration,
      isRecordingActive,
      totalRecordedChunks: recordedChunks.length
    },
    deviceInfo: getDeviceInfo(),
    recentLogs: debugLogs.slice(-10) // Last 10 log entries
  };
};