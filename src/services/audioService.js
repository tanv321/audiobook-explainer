// Handles audio recording, buffering, and processing
console.log('[audioService.js] Loading audio service');

let audioContext = null;
let audioSource = null;
let audioBuffer = null;
let mediaRecorder = null;
let recordedChunks = [];
let lastTenSecondsBuffer = [];
let audioSampleRate = 44100; // Default sample rate

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
    
    // Connect nodes
    audioSource.connect(analyser);
    analyser.connect(audioContext.destination);
    audioSource.connect(destination);
    
    // Initialize media recorder for capturing audio
    setupMediaRecorder(destination.stream);
    
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
    // Prioritize MP3 format if supported, which works better with Whisper API
    const mimeTypes = [
      'audio/mp3', 
      'audio/mpeg',
      'audio/wav', 
      'audio/ogg',
      'audio/webm',
      'audio/webm;codecs=opus'
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
    
    const options = selectedMimeType ? { mimeType: selectedMimeType, audioBitsPerSecond: 128000 } : {};
    console.log(`[audioService.js] Using recording format: ${selectedMimeType || 'browser default'} with bitrate: 128kbps`);
    
    mediaRecorder = new MediaRecorder(stream, options);
    
    // Clear previous recorded chunks
    recordedChunks = [];
    
    // Handle data available event
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
        console.log('[audioService.js] Recorded chunk added, total chunks:', recordedChunks.length);
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
      
      const handleStop = () => {
        console.log('[audioService.js] Media recorder stopped, combining chunks');
        
        // Get the MIME type from the recorder
        const mimeType = mediaRecorder.mimeType;
        console.log('[audioService.js] Recording MIME type:', mimeType);
        
        // Check if we need to handle large files differently
        const isLargeRecording = recordedChunks.length > 5; // More than 5 seconds
        console.log(`[audioService.js] Recording size: ${recordedChunks.length} chunks, large recording: ${isLargeRecording}`);
        
        // For larger files, we'll ensure compatibility by forcing MP3 or WAV format
        if (isLargeRecording) {
          console.log('[audioService.js] Large recording detected, ensuring Whisper API compatibility');
          // Convert to more reliable format for the API
          convertToWhisperCompatibleFormat(recordedChunks, mimeType)
            .then(result => resolve(result))
            .catch(error => {
              console.error('[audioService.js] Error in conversion, falling back to regular processing:', error);
              // Fallback to regular processing
              const audioBlob = new Blob(recordedChunks, { type: mimeType });
              console.log('[audioService.js] Audio blob created with size:', audioBlob.size);
              processAudioForWhisper(audioBlob, mimeType)
                .then(result => resolve(result))
                .catch(fallbackError => reject(fallbackError));
            });
        } else {
          // For small recordings that work fine, just process normally
          const audioBlob = new Blob(recordedChunks, { type: mimeType });
          console.log('[audioService.js] Audio blob created with size:', audioBlob.size);
          
          processAudioForWhisper(audioBlob, mimeType)
            .then(result => resolve(result))
            .catch(error => reject(error));
        }
        
        // Clean up event listener
        mediaRecorder.removeEventListener('stop', handleStop);
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
 * Convert audio to a format that's definitely compatible with Whisper API
 * This function handles larger recordings that may cause format compatibility issues
 * @param {Array<Blob>} chunks - The recorded audio chunks
 * @param {string} originalMimeType - The original MIME type
 * @returns {Promise<Object>} - Object containing the converted audio and metadata
 */
const convertToWhisperCompatibleFormat = async (chunks, originalMimeType) => {
  console.log('[audioService.js] Converting large recording to Whisper-compatible format');
  
  return new Promise(async (resolve, reject) => {
    try {
      // Create an AudioContext for processing
      const context = new (window.AudioContext || window.webkitAudioContext)();
      
      // Combine chunks into a single blob
      const originalBlob = new Blob(chunks, { type: originalMimeType });
      console.log(`[audioService.js] Original combined blob size: ${originalBlob.size} bytes`);
      
      // Convert to ArrayBuffer
      const arrayBuffer = await originalBlob.arrayBuffer();
      
      // Decode the audio data
      context.decodeAudioData(arrayBuffer, async (audioBuffer) => {
        try {
          console.log('[audioService.js] Successfully decoded audio, converting to WAV format');
          
          // Convert to WAV format
          const wavBlob = await audioBufferToWav(audioBuffer);
          console.log(`[audioService.js] Converted WAV blob size: ${wavBlob.size} bytes`);
          
          // Return WAV format which is highly compatible with Whisper API
          resolve({
            audioBlob: wavBlob,
            mimeType: 'audio/wav',
            filename: 'audio.wav'
          });
        } catch (conversionError) {
          console.error('[audioService.js] Error converting to WAV:', conversionError);
          reject(conversionError);
        }
      }, (decodeError) => {
        console.error('[audioService.js] Error decoding audio data:', decodeError);
        reject(decodeError);
      });
    } catch (error) {
      console.error('[audioService.js] Error in audio conversion process:', error);
      reject(error);
    }
  });
};

/**
 * Convert AudioBuffer to WAV Blob (16-bit PCM format)
 * @param {AudioBuffer} audioBuffer - The decoded audio buffer
 * @returns {Promise<Blob>} - The WAV blob
 */
const audioBufferToWav = (audioBuffer) => {
  return new Promise((resolve) => {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM format
    const bitDepth = 16; // 16-bit PCM
    
    console.log(`[audioService.js] Creating WAV with ${numChannels} channels at ${sampleRate}Hz, ${bitDepth}-bit`);
    
    // Extract channel data
    const channelData = [];
    for (let channel = 0; channel < numChannels; channel++) {
      channelData.push(audioBuffer.getChannelData(channel));
    }
    
    // Calculate file size
    const dataLength = channelData[0].length * numChannels * (bitDepth / 8);
    const buffer = new ArrayBuffer(44 + dataLength); // 44 bytes for WAV header
    const view = new DataView(buffer);
    
    // Write WAV header
    // "RIFF" chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true); // File size minus RIFF chunk
    writeString(view, 8, 'WAVE');
    
    // "fmt " sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Length of format data
    view.setUint16(20, format, true); // Format type (PCM)
    view.setUint16(22, numChannels, true); // Number of channels
    view.setUint32(24, sampleRate, true); // Sample rate
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true); // Byte rate
    view.setUint16(32, numChannels * (bitDepth / 8), true); // Block align
    view.setUint16(34, bitDepth, true); // Bits per sample
    
    // "data" sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true); // Data length
    
    // Write audio data
    let offset = 44;
    if (bitDepth === 16) {
      for (let i = 0; i < channelData[0].length; i++) {
        for (let channel = 0; channel < numChannels; channel++) {
          const sample = Math.max(-1, Math.min(1, channelData[channel][i]));
          view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
          offset += 2;
        }
      }
    }
    
    console.log('[audioService.js] WAV file created successfully');
    resolve(new Blob([buffer], { type: 'audio/wav' }));
  });
};

/**
 * Utility to write string to DataView
 * @param {DataView} view - The DataView to write to
 * @param {number} offset - The offset to write at
 * @param {string} string - The string to write
 */
const writeString = (view, offset, string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

/**
 * Process audio for Whisper API compatibility
 * @param {Blob} audioBlob - The recorded audio blob
 * @param {string} mimeType - The MIME type of the recorded audio
 * @returns {Promise<Object>} - Object containing the audio blob and metadata
 */
const processAudioForWhisper = async (audioBlob, mimeType) => {
  console.log('[audioService.js] Processing audio for Whisper API');
  
  // List of formats supported by Whisper API
  const supportedFormats = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];
  
  // Extract format and codec information
  let format = '';
  let codec = '';
  
  // Parse MIME type to extract format and codec
  const mimeTypeParts = mimeType.split(';');
  if (mimeTypeParts.length > 0) {
    format = mimeTypeParts[0].split('/')[1].toLowerCase();
    
    // Check for codec information
    if (mimeTypeParts.length > 1 && mimeTypeParts[1].includes('codecs=')) {
      codec = mimeTypeParts[1].trim().split('=')[1].replace(/"/g, '');
      console.log(`[audioService.js] Detected codec: ${codec}`);
    }
  }
  
  // Choose appropriate file extension for the API
  let fileExtension = '';
  
  // For WebM formats, which can be problematic, use 'mp3' extension
  // This is a common problem with WebM files and Whisper API
  if (format === 'webm') {
    console.log('[audioService.js] WebM format detected, using mp3 extension for better compatibility');
    fileExtension = 'mp3';
  } 
  // Check if the extracted format is in the supported list
  else if (supportedFormats.includes(format)) {
    fileExtension = format;
  } else {
    // Default to a common supported format if format is not recognized
    fileExtension = 'mp3';
  }
  
  console.log(`[audioService.js] Using file extension: ${fileExtension} for Whisper API`);
  
  // Create a clean MIME type without codec information for the API
  const cleanMimeType = `audio/${fileExtension}`;
  
  // Create a new blob with the clean MIME type
  const processedBlob = new Blob([audioBlob], { type: cleanMimeType });
  
  console.log(`[audioService.js] Processed audio blob: size=${processedBlob.size}, type=${cleanMimeType}`);
  
  return {
    audioBlob: processedBlob,
    mimeType: cleanMimeType,
    filename: `audio.${fileExtension}`
  };
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