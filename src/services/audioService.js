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
let isRecordingActive = false; // Track if recording is currently active
let isResetting = false; // Flag to prevent operations during reset

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

export const initializeAudio = async (audioFile) => {
  resetRecordingState();
  
  try {
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioSampleRate = audioContext.sampleRate;
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
    
    audioSource.start(0);
    
    return { context: audioContext, source: audioSource };
  } catch (error) {
    console.error('[audioService.js] Error initializing audio:', error);
    throw error;
  }
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
    
    const mimeTypes = [
      'audio/webm',
      'audio/webm;codecs=opus',
      'audio/ogg;codecs=opus'
    ];
    
    let selectedMimeType = '';
    
    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        selectedMimeType = type;
        break;
      }
    }
    
    const options = selectedMimeType ? { mimeType: selectedMimeType } : {};
    
    mediaRecorder = new MediaRecorder(stream, options);
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
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
    
    isRecordingActive = true;
    
    mediaRecorder.start(1000); // Collect data in 1-second chunks
    
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
      
      const stopTimeout = setTimeout(() => {
        processAudio(bufferCopy, chunksCopy, mediaRecorder.mimeType)
          .then(resolve)
          .catch(reject)
          .finally(() => {
            isResetting = false;
          });
      }, 2000);
      
      const processAudio = async (buffer, chunks, mimeType) => {
        const processedChunks = buffer.map(item => item.data);
        
        if (processedChunks.length === 0) {
          return Promise.reject(new Error('No audio chunks recorded'));
        }
        
        try {
          const properAudioBlob = await createProperAudioFile(processedChunks, chunks, mimeType);
          const resultMimeType = properAudioBlob.type || mimeType;
          
          const result = {
            audioBlob: properAudioBlob,
            mimeType: resultMimeType,
            filename: `audio.${getFileExtensionFromMimeType(resultMimeType)}`
          };
          
          return result;
        } catch (error) {
          console.error('[audioService.js] Error creating proper audio file:', error);
          throw error;
        }
      };
      
      const handleStop = () => {
        clearTimeout(stopTimeout);
        
        processAudio(bufferCopy, chunksCopy, mediaRecorder.mimeType)
          .then(result => {
            resolve(result);
            
            setTimeout(() => {
              try {
                if (recordingStream) {
                  setupMediaRecorder(recordingStream);
                }
              } catch (error) {
                console.error('[audioService.js] Error restarting media recorder:', error);
              }
              isResetting = false;
            }, 100);
          })
          .catch(error => {
            reject(error);
            isResetting = false;
          });
      };
      
      mediaRecorder.addEventListener('stop', handleStop, { once: true });
      
      try {
        mediaRecorder.stop();
      } catch (error) {
        clearTimeout(stopTimeout);
        processAudio(bufferCopy, chunksCopy, mediaRecorder.mimeType)
          .then(resolve)
          .catch(reject)
          .finally(() => {
            isResetting = false;
          });
      }
    } catch (error) {
      console.error('[audioService.js] Error in stopRecording:', error);
      reject(error);
      isResetting = false;
    }
  });
};

const createProperAudioFile = async (chunks, allChunks, mimeType) => {
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
      console.error('[audioService.js] Error in WebM specialized handling:', error);
    }
  }
  
  try {
    const wavBlob = await convertToWav(chunks);
    if (wavBlob) {
      return wavBlob;
    }
  } catch (error) {
    console.error('[audioService.js] Error converting to WAV:', error);
  }
  
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
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
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