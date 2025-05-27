// iOS-Compatible Audio Service - Enhanced with memory management and debugging
console.log('[audioService.js] Loading iOS-compatible audio service with enhanced memory management');

let audioContext = null;
let audioSource = null;
let audioBuffer = null;
let mediaRecorder = null;
let recordedChunks = [];
let lastTenSecondsBuffer = [];
let audioSampleRate = 44100;
let recordingStream = null;
const MAX_BUFFER_SIZE = 10;
let audioStartTime = null;
let isRecordingActive = false;
let isResetting = false;
let currentPlaybackTime = 0;

// Debugging storage
let debugLog = [];
let lastError = null;

// iOS-specific variables
let isIOS = false;
let safariVersion = null;
let supportedMimeType = null;

// Memory management for iOS
const MAX_MEMORY_MB = 50; // Maximum memory usage in MB
const CHUNK_CLEANUP_INTERVAL = 30000; // Clean up old chunks every 30 seconds
let memoryCleanupTimer = null;

// Add debug logging function
const addDebugLog = (message, data = null) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    message,
    data,
    memory: getMemoryUsage()
  };
  
  debugLog.push(logEntry);
  console.log(`[audioService.js DEBUG ${timestamp}]`, message, data || '');
  
  // Keep only last 100 entries to prevent memory issues
  if (debugLog.length > 100) {
    debugLog.shift();
  }
};

// Get memory usage estimate
const getMemoryUsage = () => {
  let totalSize = 0;
  
  // Calculate size of recorded chunks
  recordedChunks.forEach(chunk => {
    totalSize += chunk.size || 0;
  });
  
  // Calculate size of buffer
  lastTenSecondsBuffer.forEach(item => {
    totalSize += item.data.size || 0;
  });
  
  return {
    totalBytes: totalSize,
    totalMB: (totalSize / 1024 / 1024).toFixed(2),
    chunksCount: recordedChunks.length,
    bufferCount: lastTenSecondsBuffer.length
  };
};

// Export debug information
export const exportDebugInfo = () => {
  const debugInfo = {
    timestamp: new Date().toISOString(),
    deviceInfo: {
      isIOS,
      safariVersion,
      userAgent: navigator.userAgent,
      supportedMimeType
    },
    memoryUsage: getMemoryUsage(),
    audioState: {
      isRecordingActive,
      isResetting,
      currentPlaybackTime,
      audioContextState: audioContext?.state || 'not initialized',
      mediaRecorderState: mediaRecorder?.state || 'not initialized'
    },
    lastError,
    logs: debugLog.slice(-50) // Last 50 logs
  };
  
  return debugInfo;
};

// Download debug info as file
export const downloadDebugInfo = () => {
  try {
    const debugInfo = exportDebugInfo();
    const jsonStr = JSON.stringify(debugInfo, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `audiobook-debug-${timestamp}.json`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    addDebugLog('Debug info downloaded', { filename });
  } catch (error) {
    console.error('[audioService.js] Error downloading debug info:', error);
    lastError = error;
  }
};

// Clean up old chunks to prevent memory issues
const cleanupOldChunks = () => {
  const memoryUsage = getMemoryUsage();
  const maxBytes = MAX_MEMORY_MB * 1024 * 1024;
  
  addDebugLog('Memory cleanup check', memoryUsage);
  
  if (memoryUsage.totalBytes > maxBytes) {
    addDebugLog('Memory limit exceeded, cleaning up old chunks', {
      currentMB: memoryUsage.totalMB,
      maxMB: MAX_MEMORY_MB
    });
    
    // Keep only recent chunks
    const chunksToKeep = Math.floor(recordedChunks.length / 2);
    const removedChunks = recordedChunks.length - chunksToKeep;
    recordedChunks = recordedChunks.slice(-chunksToKeep);
    
    addDebugLog('Cleaned up chunks', {
      removed: removedChunks,
      remaining: recordedChunks.length
    });
    
    // Force garbage collection if available (non-standard)
    if (window.gc) {
      window.gc();
    }
  }
};

// Start memory cleanup timer
const startMemoryCleanup = () => {
  if (memoryCleanupTimer) {
    clearInterval(memoryCleanupTimer);
  }
  
  memoryCleanupTimer = setInterval(cleanupOldChunks, CHUNK_CLEANUP_INTERVAL);
  addDebugLog('Started memory cleanup timer');
};

// Stop memory cleanup timer
const stopMemoryCleanup = () => {
  if (memoryCleanupTimer) {
    clearInterval(memoryCleanupTimer);
    memoryCleanupTimer = null;
    addDebugLog('Stopped memory cleanup timer');
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
  
  addDebugLog('Device detection', { isIOS, safariVersion, userAgent });
  return { isIOS, safariVersion };
};

// Determine the best supported MIME type for the current device
const getBestSupportedMimeType = () => {
  if (!window.MediaRecorder) {
    addDebugLog('MediaRecorder not supported');
    return null;
  }

  // iOS Safari priority order (based on research)
  const iosMimeTypes = [
    'audio/mp4',
    'audio/mp4; codecs="mp4a.40.2"',  // AAC-LC
    'audio/mp4; codecs="mp4a.40.5"',  // HE-AAC
    'video/mp4',
    'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'
  ];

  // Desktop/Chrome priority order
  const desktopMimeTypes = [
    'audio/webm; codecs=opus',
    'audio/webm',
    'audio/ogg; codecs=opus',
    'audio/ogg',
    'audio/mp4',
    'audio/wav'
  ];

  const mimeTypesToTest = isIOS ? iosMimeTypes : desktopMimeTypes;
  
  addDebugLog('Testing MIME types', { isIOS, types: mimeTypesToTest });
  
  for (const mimeType of mimeTypesToTest) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      addDebugLog('Selected MIME type', { mimeType });
      return mimeType;
    }
  }
  
  addDebugLog('No supported MIME types found');
  return null;
};

const resetRecordingState = () => {
  try {
    addDebugLog('Resetting recording state');
    
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch (e) {
        addDebugLog('Error stopping media recorder during reset', e);
      }
    }
    
    // Clear chunks and buffer
    recordedChunks = [];
    lastTenSecondsBuffer = [];
    isRecordingActive = false;
    
    // Clear debug log if it's getting too large
    if (debugLog.length > 50) {
      debugLog = debugLog.slice(-25);
    }
    
    addDebugLog('Recording state reset complete');
  } catch (error) {
    lastError = error;
    addDebugLog('Error during recording state reset', error);
  }
};

export const initializeAudio = async (audioFile, seekTime = 0) => {
  try {
    addDebugLog('Initializing audio', { fileName: audioFile.name, seekTime });
    
    // Detect device capabilities
    const deviceInfo = detectDevice();
    supportedMimeType = getBestSupportedMimeType();
    
    if (!supportedMimeType) {
      throw new Error('No supported audio recording format found on this device');
    }
    
    resetRecordingState();
    
    // Start memory cleanup for iOS
    if (isIOS) {
      startMemoryCleanup();
    }
    
    if (audioContext && audioSource) {
      audioSource.stop();
      audioSource.disconnect();
    }
    
    if (!audioContext || audioContext.state === 'closed') {
      // iOS requires user interaction to create AudioContext
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioSampleRate = audioContext.sampleRate;
      
      // iOS-specific: Resume context if suspended
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
    } else if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    
    const arrayBuffer = await readFileAsArrayBuffer(audioFile);
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
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
    
    // Start from the specified time
    audioSource.start(0, seekTime);
    
    addDebugLog('Audio initialized successfully');
    
    return { context: audioContext, source: audioSource };
  } catch (error) {
    lastError = error;
    addDebugLog('Error initializing audio', error);
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
};

const setupMediaRecorder = async (stream) => {
  try {
    addDebugLog('Setting up MediaRecorder');
    
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch (e) {
        addDebugLog('Error stopping existing media recorder', e);
      }
    }
    
    if (!supportedMimeType) {
      throw new Error('No supported MIME type available');
    }
    
    // iOS-specific MediaRecorder options
    const options = { mimeType: supportedMimeType };
    
    // Add iOS-specific bitrate settings for better compatibility
    if (isIOS) {
      if (supportedMimeType.includes('mp4')) {
        // Lower bitrates for iOS to prevent memory issues
        options.audioBitsPerSecond = 64000; // 64 kbps instead of default
      }
    }
    
    addDebugLog('Creating MediaRecorder', options);
    
    mediaRecorder = new MediaRecorder(stream, options);
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        addDebugLog('Audio chunk received', { size: event.data.size });
        recordedChunks.push(event.data);
        
        lastTenSecondsBuffer.push({
          timestamp: Date.now(),
          data: event.data
        });
        
        if (lastTenSecondsBuffer.length > MAX_BUFFER_SIZE) {
          lastTenSecondsBuffer.shift();
        }
        
        // Check memory usage on iOS
        if (isIOS) {
          const memoryUsage = getMemoryUsage();
          if (memoryUsage.totalBytes > MAX_MEMORY_MB * 1024 * 1024 * 0.8) {
            addDebugLog('Memory usage high, triggering cleanup', memoryUsage);
            cleanupOldChunks();
          }
        }
      }
    };
    
    mediaRecorder.onerror = (error) => {
      lastError = error;
      addDebugLog('Media recorder error', error);
    };
    
    mediaRecorder.onstart = () => {
      addDebugLog('MediaRecorder started');
      isRecordingActive = true;
    };
    
    mediaRecorder.onstop = () => {
      addDebugLog('MediaRecorder stopped');
    };
    
    // iOS-specific: Use shorter intervals to prevent memory issues
    const chunkInterval = isIOS ? 500 : 1000; // 0.5s for iOS, 1s for others
    
    addDebugLog('Starting MediaRecorder', { chunkInterval });
    mediaRecorder.start(chunkInterval);
    
    return mediaRecorder;
  } catch (error) {
    lastError = error;
    addDebugLog('Error setting up media recorder', error);
    throw error;
  }
};

export const stopRecording = () => {
  return new Promise((resolve, reject) => {
    try {
      addDebugLog('Stop recording requested', {
        mediaRecorderState: mediaRecorder?.state,
        isRecordingActive,
        isResetting
      });
      
      // Download debug info before processing
      if (isIOS) {
        downloadDebugInfo();
      }
      
      if (!mediaRecorder || mediaRecorder.state === 'inactive' || !isRecordingActive) {
        const error = new Error('Media recorder not active');
        lastError = error;
        reject(error);
        return;
      }
      
      if (isResetting) {
        const error = new Error('Reset operation in progress');
        lastError = error;
        reject(error);
        return;
      }
      
      isResetting = true;
      
      const bufferCopy = [...lastTenSecondsBuffer];
      const chunksCopy = [...recordedChunks];
      
      addDebugLog('Preparing to process audio', {
        bufferSize: bufferCopy.length,
        chunksSize: chunksCopy.length,
        memoryUsage: getMemoryUsage()
      });
      
      isRecordingActive = false;
      
      const processAudio = async (buffer, chunks, mimeType) => {
        try {
          const processedChunks = buffer.map(item => item.data);
          
          if (processedChunks.length === 0) {
            throw new Error('No audio chunks recorded');
          }
          
          addDebugLog('Processing audio chunks', {
            count: processedChunks.length,
            mimeType
          });
          
          const properAudioBlob = await createProperAudioFile(processedChunks, chunks, mimeType);
          const resultMimeType = properAudioBlob.type || mimeType;
          
          const result = {
            audioBlob: properAudioBlob,
            mimeType: resultMimeType,
            filename: `audio.${getFileExtensionFromMimeType(resultMimeType)}`
          };
          
          addDebugLog('Audio processing complete', {
            size: result.audioBlob.size,
            type: result.mimeType,
            filename: result.filename
          });
          
          return result;
        } catch (error) {
          lastError = error;
          addDebugLog('Error processing audio', error);
          throw error;
        }
      };
      
      const handleStop = () => {
        processAudio(bufferCopy, chunksCopy, mediaRecorder.mimeType)
          .then(result => {
            resolve(result);
            
            // Restart recording after a brief delay
            setTimeout(() => {
              try {
                if (recordingStream && !isResetting) {
                  setupMediaRecorder(recordingStream);
                }
              } catch (error) {
                addDebugLog('Error restarting media recorder', error);
              }
              isResetting = false;
            }, isIOS ? 200 : 100); // Longer delay for iOS
          })
          .catch(error => {
            lastError = error;
            reject(error);
            isResetting = false;
          });
      };
      
      // iOS-specific: Add timeout as fallback
      const stopTimeout = setTimeout(() => {
        addDebugLog('Stop timeout triggered');
        handleStop();
      }, isIOS ? 3000 : 2000); // Longer timeout for iOS
      
      mediaRecorder.addEventListener('stop', () => {
        clearTimeout(stopTimeout);
        handleStop();
      }, { once: true });
      
      try {
        addDebugLog('Stopping MediaRecorder');
        mediaRecorder.stop();
      } catch (error) {
        lastError = error;
        addDebugLog('Error stopping MediaRecorder', error);
        clearTimeout(stopTimeout);
        handleStop();
      }
    } catch (error) {
      lastError = error;
      addDebugLog('Error in stopRecording', error);
      reject(error);
      isResetting = false;
    }
  });
};

const createProperAudioFile = async (chunks, allChunks, mimeType) => {
  addDebugLog('Creating proper audio file', { 
    chunksCount: chunks.length, 
    mimeType,
    isIOS 
  });
  
  // iOS-specific handling for MP4/AAC
  if (isIOS && mimeType.includes('mp4')) {
    try {
      // For iOS MP4, we need to ensure proper container structure
      const firstChunk = allChunks.length > 0 ? allChunks[0] : null;
      
      if (firstChunk) {
        const properChunks = [firstChunk];
        
        for (const chunk of chunks) {
          if (chunk !== firstChunk) {
            properChunks.push(chunk);
          }
        }
        
        addDebugLog('Using iOS MP4 optimized blob creation');
        return new Blob(properChunks, { type: mimeType });
      }
    } catch (error) {
      lastError = error;
      addDebugLog('Error in iOS MP4 handling', error);
    }
  }
  
  // WebM handling for desktop
  if (mimeType.includes('webm')) {
    try {
      const firstChunk = allChunks.length > 0 ? allChunks[0] : null;
      
      if (firstChunk) {
        const properChunks = [firstChunk];
        
        for (const chunk of chunks) {
          if (chunk !== firstChunk) {
            properChunks.push(chunk);
          }
        }
        
        return new Blob(properChunks, { type: mimeType });
      }
    } catch (error) {
      lastError = error;
      addDebugLog('Error in WebM handling', error);
    }
  }
  
  // For iOS, avoid WAV conversion as it can cause memory issues
  if (!isIOS) {
    try {
      const wavBlob = await convertToWav(chunks);
      if (wavBlob) {
        addDebugLog('Successfully converted to WAV');
        return wavBlob;
      }
    } catch (error) {
      lastError = error;
      addDebugLog('Error converting to WAV', error);
    }
  }
  
  // Fallback: return as-is
  addDebugLog('Using fallback blob creation');
  return new Blob(chunks, { type: mimeType });
};

const convertToWav = async (chunks) => {
  const sampleRate = 16000;
  const numChannels = 1;
  const bitsPerSample = 16;
  
  try {
    const blob = new Blob(chunks);
    const arrayBuffer = await blob.arrayBuffer();
    
    const tempContext = new (window.AudioContext || window.webkitAudioContext)();
    
    let audioBuffer;
    try {
      audioBuffer = await tempContext.decodeAudioData(arrayBuffer);
    } catch (error) {
      tempContext.close();
      return null;
    }
    
    const numSamples = Math.ceil(audioBuffer.duration * sampleRate);
    const outputBuffer = new Float32Array(numSamples);
    
    const sourceData = audioBuffer.getChannelData(0);
    const targetLength = outputBuffer.length;
    const sourceLength = sourceData.length;
    
    for (let i = 0; i < targetLength; i++) {
      const sourceIndex = Math.floor(i * sourceLength / targetLength);
      outputBuffer[i] = sourceData[sourceIndex];
    }
    
    const wavBuffer = createWavHeader(numSamples, sampleRate, numChannels, bitsPerSample);
    const wavData = new DataView(wavBuffer);
    
    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const sample = Math.max(-1, Math.min(1, outputBuffer[i]));
      const pcmValue = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      wavData.setInt16(offset, pcmValue, true);
      offset += 2;
    }
    
    tempContext.close();
    
    return new Blob([wavBuffer], { type: 'audio/wav' });
  } catch (error) {
    lastError = error;
    addDebugLog('Error in WAV conversion', error);
    return null;
  }
};

const createWavHeader = (numSamples, sampleRate, numChannels, bitsPerSample) => {
  const dataSize = numSamples * numChannels * bitsPerSample / 8;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true);
  view.setUint16(32, numChannels * bitsPerSample / 8, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  
  return buffer;
};

const writeString = (view, offset, string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

const getFileExtensionFromMimeType = (mimeType) => {
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  return isIOS ? 'mp4' : 'webm'; // Default based on platform
};

const readFileAsArrayBuffer = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      resolve(event.target.result);
    };
    
    reader.onerror = (error) => {
      reject(error);
    };
    
    reader.readAsArrayBuffer(file);
  });
};

// Export device detection for debugging
export const getDeviceInfo = () => {
  return {
    isIOS,
    safariVersion,
    supportedMimeType,
    userAgent: navigator.userAgent
  };
};

// Clean up on unmount
export const cleanup = () => {
  addDebugLog('Cleaning up audio service');
  
  stopMemoryCleanup();
  
  if (audioSource) {
    audioSource.stop();
    audioSource.disconnect();
  }
  
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
  }
  
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  
  recordedChunks = [];
  lastTenSecondsBuffer = [];
  debugLog = [];
};