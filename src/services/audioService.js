// Handles audio recording, buffering, and processing
console.log('[audioService.js] Loading audio service');

let audioContext = null;
let audioSource = null;
let audioBuffer = null;
let mediaRecorder = null;
let recordedChunks = [];
let lastTenSecondsBuffer = [];  // Buffer to store only the last 10 seconds of audio
let audioSampleRate = 44100; // Default sample rate
let recordingStream = null; // Store the stream to recreate the media recorder
const MAX_BUFFER_SIZE = 10; // Maximum number of 1-second chunks to keep (10 seconds)
let audioStartTime = null; // Track when audio playback begins

/**
 * Initializes audio context and sets up audio source
 * @param {File} audioFile - The uploaded audio file
 * @returns {Promise<Object>} - The audio context and source
 */
export const initializeAudio = async (audioFile) => {
  console.log('[audioService.js] Initializing audio');
  
  try {
    // Create new audio context if not exists or is closed
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      console.log('[audioService.js] Created new audio context with state:', audioContext.state);
      audioSampleRate = audioContext.sampleRate;
    }
    
    // Read the audio file and set up the source
    const arrayBuffer = await readFileAsArrayBuffer(audioFile);
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    console.log('[audioService.js] Audio buffer created with duration:', audioBuffer.duration);
    
    // Create source from buffer
    audioSource = audioContext.createBufferSource();
    audioSource.buffer = audioBuffer;
    
    // Create analyzer for audio visualization (optional for future use)
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    
    // Set up recording stream
    const destination = audioContext.createMediaStreamDestination();
    recordingStream = destination.stream; // Store the stream for later reuse
    
    // Connect nodes
    audioSource.connect(analyser);
    analyser.connect(audioContext.destination);
    audioSource.connect(destination);
    
    // Initialize media recorder for capturing audio
    setupMediaRecorder(recordingStream);
    
    // Track when audio starts
    audioStartTime = Date.now();
    
    // Start the audio
    audioSource.start(0);
    console.log('[audioService.js] Audio playback started');
    
    return { context: audioContext, source: audioSource };
  } catch (error) {
    console.error('[audioService.js] Error initializing audio:', error);
    throw error;
  }
};

/**
 * Sets up the media recorder to capture audio
 * @param {MediaStream} stream - The audio stream
 */
const setupMediaRecorder = (stream) => {
  console.log('[audioService.js] Setting up media recorder');
  
  try {
    // Use a more limited set of MIME types that are most reliable
    const mimeTypes = [
      'audio/webm',
      'audio/webm;codecs=opus',
      'audio/ogg;codecs=opus'
    ];
    
    let selectedMimeType = '';
    
    // Find the first supported MIME type
    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        selectedMimeType = type;
        console.log(`[audioService.js] Found supported MIME type: ${selectedMimeType}`);
        break;
      }
    }
    
    const options = selectedMimeType ? { mimeType: selectedMimeType } : {};
    console.log(`[audioService.js] Using recording format: ${selectedMimeType || 'browser default'}`);
    
    mediaRecorder = new MediaRecorder(stream, options);
    
    // Clear previous recorded chunks
    recordedChunks = [];
    lastTenSecondsBuffer = [];
    
    // Handle data available event
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        // Store all chunks for complete recording
        recordedChunks.push(event.data);
        
        // Add new chunk to the lastTenSecondsBuffer
        lastTenSecondsBuffer.push({
          timestamp: Date.now(),
          data: event.data
        });
        
        // Keep only the last MAX_BUFFER_SIZE chunks (10 seconds)
        if (lastTenSecondsBuffer.length > MAX_BUFFER_SIZE) {
          // Remove the oldest chunk
          lastTenSecondsBuffer.shift();
        }
        
        console.log('[audioService.js] Recorded chunk added, buffer size:', lastTenSecondsBuffer.length);
      }
    };
    
    // Start recording with smaller chunks to avoid format issues with larger files
    mediaRecorder.start(1000); // Collect data in 1-second chunks
    console.log('[audioService.js] Media recorder started with MIME type:', mediaRecorder.mimeType);
  } catch (error) {
    console.error('[audioService.js] Error setting up media recorder:', error);
    throw error;
  }
};

/**
 * Restart the media recorder after it has been stopped
 * This is key to fixing the "Media recorder not active" error
 */
const restartMediaRecorder = () => {
  console.log('[audioService.js] Restarting media recorder');
  
  try {
    if (recordingStream) {
      setupMediaRecorder(recordingStream);
      console.log('[audioService.js] Media recorder successfully restarted');
    } else {
      console.warn('[audioService.js] Cannot restart media recorder: No recording stream available');
    }
  } catch (error) {
    console.error('[audioService.js] Error restarting media recorder:', error);
  }
};

/**
 * Stops recording and returns the recorded audio data
 * @returns {Promise<Object>} - The recorded audio data and mime type
 */
export const stopRecording = () => {
  console.log('[audioService.js] Stopping recording');
  
  return new Promise((resolve, reject) => {
    try {
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        console.warn('[audioService.js] Media recorder not active');
        reject(new Error('Media recorder not active'));
        return;
      }
      
      const handleStop = async () => {
        console.log('[audioService.js] Media recorder stopped, processing chunks');
        
        // Get the MIME type from the recorder
        const mimeType = mediaRecorder.mimeType;
        console.log('[audioService.js] Recording MIME type:', mimeType);
        
        // Extract only the data from our buffer
        const processedChunks = lastTenSecondsBuffer.map(item => item.data);
        console.log(`[audioService.js] Processing last ${processedChunks.length} chunks (${processedChunks.length} seconds)`);
        
        if (processedChunks.length === 0) {
          console.warn('[audioService.js] No audio chunks to process');
          reject(new Error('No audio chunks recorded'));
          return;
        }
        
        try {
          // Create a proper audio file with the correct headers by re-recording the buffer
          const properAudioBlob = await createProperAudioFile(processedChunks, mimeType);
          const resultMimeType = properAudioBlob.type || mimeType;
          
          // Return properly formatted audio
          resolve({
            audioBlob: properAudioBlob,
            mimeType: resultMimeType,
            filename: `audio.${getFileExtensionFromMimeType(resultMimeType)}`
          });
        } catch (error) {
          console.error('[audioService.js] Error creating proper audio file:', error);
          reject(error);
        }
        
        // Restart media recorder for the next recording
        restartMediaRecorder();
      };
      
      // Add stop event handler
      mediaRecorder.addEventListener('stop', handleStop);
      
      // Stop recording
      mediaRecorder.stop();
      console.log('[audioService.js] Stopping media recorder');
    } catch (error) {
      console.error('[audioService.js] Error stopping recording:', error);
      reject(error);
    }
  });
};

/**
 * Creates a proper audio file by ensuring it has correct headers
 * @param {Array<Blob>} chunks - Audio chunks to combine
 * @param {string} mimeType - The MIME type of the audio
 * @returns {Promise<Blob>} - A properly formatted audio blob
 */
const createProperAudioFile = async (chunks, mimeType) => {
  console.log('[audioService.js] Creating proper audio file from chunks');
  
  // For audio/webm formats, we need a special approach
  if (mimeType.includes('webm')) {
    try {
      // Using a more reliable approach for WebM format
      console.log('[audioService.js] Using specialized WebM handling');
      
      // Get the first chunk from the entire recording to ensure we have headers
      const firstChunk = recordedChunks.length > 0 ? recordedChunks[0] : null;
      
      if (firstChunk) {
        // If we have the original first chunk (which contains headers), use it
        const properChunks = [firstChunk];
        
        // Then add our last 10 second chunks, avoiding duplicating the first chunk
        for (const chunk of chunks) {
          // Only add chunks that aren't the first chunk (to avoid duplication)
          if (chunk !== firstChunk) {
            properChunks.push(chunk);
          }
        }
        
        console.log(`[audioService.js] Created proper WebM with ${properChunks.length} chunks (including header chunk)`);
        return new Blob(properChunks, { type: mimeType });
      }
    } catch (error) {
      console.error('[audioService.js] Error in WebM specialized handling:', error);
    }
  }
  
  // If we're here, either it's not WebM or the WebM approach failed
  // Try different approach: Convert to WAV format which is more reliable
  try {
    console.log('[audioService.js] Converting to WAV format for better compatibility');
    
    // Use more reliable WAV encoding for Whisper API
    const wavBlob = await convertToWav(chunks);
    if (wavBlob) {
      console.log('[audioService.js] Successfully converted to WAV format');
      return wavBlob;
    }
  } catch (error) {
    console.error('[audioService.js] Error converting to WAV:', error);
  }
  
  // Fallback: just return the simple blob and hope for the best
  console.log('[audioService.js] Using simple concatenation as fallback');
  return new Blob(chunks, { type: mimeType });
};

/**
 * Converts audio chunks to WAV format
 * @param {Array<Blob>} chunks - Audio chunks to convert
 * @returns {Promise<Blob>} - A WAV format blob
 */
const convertToWav = async (chunks) => {
  // For simplicity, we'll use a fixed WAV format that's compatible with Whisper API
  // 16000Hz, 16-bit, mono
  const sampleRate = 16000;
  const numChannels = 1;
  const bitsPerSample = 16;
  
  try {
    // Combine the chunks into one blob
    const blob = new Blob(chunks);
    const arrayBuffer = await blob.arrayBuffer();
    
    // Create a temporary audio context
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Try to decode the audio data
    let audioBuffer;
    try {
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    } catch (error) {
      console.error('[audioService.js] Failed to decode audio for WAV conversion:', error);
      return null; // Return null to trigger fallback
    }
    
    // Get the raw PCM data
    const numSamples = Math.ceil(audioBuffer.duration * sampleRate);
    const outputBuffer = new Float32Array(numSamples);
    
    // Mix down to mono if needed and resample
    const sourceData = audioBuffer.getChannelData(0);
    const targetLength = outputBuffer.length;
    const sourceLength = sourceData.length;
    
    // Simple resampling (this is not high quality but works for speech)
    for (let i = 0; i < targetLength; i++) {
      const sourceIndex = Math.floor(i * sourceLength / targetLength);
      outputBuffer[i] = sourceData[sourceIndex];
    }
    
    // Create WAV header and data
    const wavBuffer = createWavHeader(numSamples, sampleRate, numChannels, bitsPerSample);
    const wavData = new DataView(wavBuffer);
    
    // Convert float audio data to 16-bit PCM
    let offset = 44; // WAV header size
    for (let i = 0; i < numSamples; i++) {
      // Convert float to 16-bit PCM
      const sample = Math.max(-1, Math.min(1, outputBuffer[i]));
      const pcmValue = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      wavData.setInt16(offset, pcmValue, true); // true = little endian
      offset += 2;
    }
    
    // Create WAV blob
    return new Blob([wavBuffer], { type: 'audio/wav' });
  } catch (error) {
    console.error('[audioService.js] Error in WAV conversion:', error);
    return null;
  }
};

/**
 * Creates a WAV header
 * @param {number} numSamples - Number of audio samples
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} numChannels - Number of audio channels
 * @param {number} bitsPerSample - Bits per sample
 * @returns {ArrayBuffer} - WAV header buffer
 */
const createWavHeader = (numSamples, sampleRate, numChannels, bitsPerSample) => {
  const dataSize = numSamples * numChannels * bitsPerSample / 8;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  
  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // RIFF chunk size
  view.setUint32(4, 36 + dataSize, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // Format chunk identifier
  writeString(view, 12, 'fmt ');
  // Format chunk size
  view.setUint32(16, 16, true);
  // Sample format (raw)
  view.setUint16(20, 1, true);
  // Channel count
  view.setUint16(22, numChannels, true);
  // Sample rate
  view.setUint32(24, sampleRate, true);
  // Byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true);
  // Block align (channel count * bytes per sample)
  view.setUint16(32, numChannels * bitsPerSample / 8, true);
  // Bits per sample
  view.setUint16(34, bitsPerSample, true);
  // Data chunk identifier
  writeString(view, 36, 'data');
  // Data chunk size
  view.setUint32(40, dataSize, true);
  
  return buffer;
};

/**
 * Writes a string to a DataView
 * @param {DataView} view - DataView to write to
 * @param {number} offset - Offset to write at
 * @param {string} string - String to write
 */
const writeString = (view, offset, string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

/**
 * Get file extension from MIME type
 * @param {string} mimeType - The MIME type
 * @returns {string} - The file extension
 */
const getFileExtensionFromMimeType = (mimeType) => {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm'; // Default fallback
};

/**
 * Utility to read a file as ArrayBuffer
 * @param {File} file - The file to read
 * @returns {Promise<ArrayBuffer>} - The file contents as ArrayBuffer
 */
const readFileAsArrayBuffer = (file) => {
  console.log('[audioService.js] Reading file as array buffer:', file.name);
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      resolve(event.target.result);
    };
    
    reader.onerror = (error) => {
      console.error('[audioService.js] Error reading file:', error);
      reject(error);
    };
    
    reader.readAsArrayBuffer(file);
  });
};