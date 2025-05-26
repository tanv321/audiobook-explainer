// iOS-Compatible Audio Service - Handles audio recording, buffering, and processing
console.log('[audioService.js] Loading iOS-compatible audio service');

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

// iOS-specific variables
let isIOS = false;
let safariVersion = null;
let supportedMimeType = null;

// Detect iOS and Safari version
const detectDevice = () => {
  const userAgent = navigator.userAgent;
  isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
  
  // Extract Safari version
  const safariMatch = userAgent.match(/Version\/(\d+\.\d+)/);
  if (safariMatch) {
    safariVersion = parseFloat(safariMatch[1]);
  }
  
  console.log('[audioService.js] Device detection:', { isIOS, safariVersion, userAgent });
  return { isIOS, safariVersion };
};

// Determine the best supported MIME type for the current device
const getBestSupportedMimeType = () => {
  if (!window.MediaRecorder) {
    console.error('[audioService.js] MediaRecorder not supported');
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
  
  console.log('[audioService.js] Testing MIME types for', isIOS ? 'iOS' : 'Desktop');
  
  for (const mimeType of mimeTypesToTest) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      console.log('[audioService.js] Selected MIME type:', mimeType);
      return mimeType;
    } else {
      console.log('[audioService.js] MIME type not supported:', mimeType);
    }
  }
  
  console.error('[audioService.js] No supported MIME types found');
  return null;
};

const resetRecordingState = () => {
  try {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch (e) {
        console.log('[audioService.js] Error stopping media recorder during reset:', e);
      }
    }
    recordedChunks = [];
    lastTenSecondsBuffer = [];
    isRecordingActive = false;
  } catch (error) {
    console.error('[audioService.js] Error during recording state reset:', error);
  }
};

export const initializeAudio = async (audioFile, seekTime = 0) => {
  // Detect device capabilities
  const deviceInfo = detectDevice();
  supportedMimeType = getBestSupportedMimeType();
  
  if (!supportedMimeType) {
    throw new Error('No supported audio recording format found on this device');
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
    
    return { context: audioContext, source: audioSource };
  } catch (error) {
    console.error('[audioService.js] Error initializing audio:', error);
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
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch (e) {
        console.log('[audioService.js] Error stopping existing media recorder:', e);
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
    
    console.log('[audioService.js] Creating MediaRecorder with options:', options);
    
    mediaRecorder = new MediaRecorder(stream, options);
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        console.log('[audioService.js] Audio chunk received:', event.data.size, 'bytes');
        recordedChunks.push(event.data);
        
        lastTenSecondsBuffer.push({
          timestamp: Date.now(),
          data: event.data
        });
        
        if (lastTenSecondsBuffer.length > MAX_BUFFER_SIZE) {
          lastTenSecondsBuffer.shift();
        }
      }
    };
    
    mediaRecorder.onerror = (error) => {
      console.error('[audioService.js] Media recorder error:', error);
    };
    
    mediaRecorder.onstart = () => {
      console.log('[audioService.js] MediaRecorder started successfully');
      isRecordingActive = true;
    };
    
    mediaRecorder.onstop = () => {
      console.log('[audioService.js] MediaRecorder stopped');
    };
    
    // iOS-specific: Use shorter intervals to prevent memory issues
    const chunkInterval = isIOS ? 500 : 1000; // 0.5s for iOS, 1s for others
    
    console.log('[audioService.js] Starting MediaRecorder with', chunkInterval, 'ms intervals');
    mediaRecorder.start(chunkInterval);
    
    return mediaRecorder;
  } catch (error) {
    console.error('[audioService.js] Error setting up media recorder:', error);
    throw error;
  }
};

export const stopRecording = () => {
  return new Promise((resolve, reject) => {
    try {
      if (!mediaRecorder || mediaRecorder.state === 'inactive' || !isRecordingActive) {
        reject(new Error('Media recorder not active'));
        return;
      }
      
      if (isResetting) {
        reject(new Error('Reset operation in progress'));
        return;
      }
      
      isResetting = true;
      
      const bufferCopy = [...lastTenSecondsBuffer];
      const chunksCopy = [...recordedChunks];
      
      isRecordingActive = false;
      
      const processAudio = async (buffer, chunks, mimeType) => {
        const processedChunks = buffer.map(item => item.data);
        
        if (processedChunks.length === 0) {
          return Promise.reject(new Error('No audio chunks recorded'));
        }
        
        console.log('[audioService.js] Processing', processedChunks.length, 'audio chunks');
        
        try {
          const properAudioBlob = await createProperAudioFile(processedChunks, chunks, mimeType);
          const resultMimeType = properAudioBlob.type || mimeType;
          
          const result = {
            audioBlob: properAudioBlob,
            mimeType: resultMimeType,
            filename: `audio.${getFileExtensionFromMimeType(resultMimeType)}`
          };
          
          console.log('[audioService.js] Audio processing complete:', {
            size: result.audioBlob.size,
            type: result.mimeType,
            filename: result.filename
          });
          
          return result;
        } catch (error) {
          console.error('[audioService.js] Error creating proper audio file:', error);
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
                console.error('[audioService.js] Error restarting media recorder:', error);
              }
              isResetting = false;
            }, isIOS ? 200 : 100); // Longer delay for iOS
          })
          .catch(error => {
            reject(error);
            isResetting = false;
          });
      };
      
      // iOS-specific: Add timeout as fallback
      const stopTimeout = setTimeout(() => {
        console.log('[audioService.js] Stop timeout triggered, processing audio');
        handleStop();
      }, isIOS ? 3000 : 2000); // Longer timeout for iOS
      
      mediaRecorder.addEventListener('stop', () => {
        clearTimeout(stopTimeout);
        handleStop();
      }, { once: true });
      
      try {
        console.log('[audioService.js] Stopping MediaRecorder...');
        mediaRecorder.stop();
      } catch (error) {
        console.error('[audioService.js] Error stopping MediaRecorder:', error);
        clearTimeout(stopTimeout);
        handleStop();
      }
    } catch (error) {
      console.error('[audioService.js] Error in stopRecording:', error);
      reject(error);
      isResetting = false;
    }
  });
};

const createProperAudioFile = async (chunks, allChunks, mimeType) => {
  console.log('[audioService.js] Creating proper audio file:', { 
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
        
        console.log('[audioService.js] Using iOS MP4 optimized blob creation');
        return new Blob(properChunks, { type: mimeType });
      }
    } catch (error) {
      console.error('[audioService.js] Error in iOS MP4 handling:', error);
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
      console.error('[audioService.js] Error in WebM handling:', error);
    }
  }
  
  // For iOS, avoid WAV conversion as it can cause memory issues
  if (!isIOS) {
    try {
      const wavBlob = await convertToWav(chunks);
      if (wavBlob) {
        console.log('[audioService.js] Successfully converted to WAV');
        return wavBlob;
      }
    } catch (error) {
      console.error('[audioService.js] Error converting to WAV:', error);
    }
  }
  
  // Fallback: return as-is
  console.log('[audioService.js] Using fallback blob creation');
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
    console.error('[audioService.js] Error in WAV conversion:', error);
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