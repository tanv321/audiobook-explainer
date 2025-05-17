// audioTroubleshooter.js - Helper functions to debug audio format issues

/**
 * Checks if the audio blob has a valid WebM format header
 * @param {Blob} blob - The audio blob to check
 * @returns {Promise<Object>} - Result of the check with details
 */
export const checkAudioFormat = async (blob) => {
    try {
      const result = {
        size: blob.size,
        type: blob.type,
        isValid: false,
        format: 'unknown',
        details: {}
      };
      
      // Get the first 50 bytes to check headers
      const buffer = await blob.slice(0, 50).arrayBuffer();
      const header = new Uint8Array(buffer);
      
      // Convert to hex for logging
      const headerHex = Array.from(header)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      
      console.log('Audio header bytes:', headerHex);
      result.headerHex = headerHex;
      
      // Check for WebM header
      // WebM files start with 0x1A 0x45 0xDF 0xA3 (EBML header)
      if (header[0] === 0x1A && header[1] === 0x45 && header[2] === 0xDF && header[3] === 0xA3) {
        result.isValid = true;
        result.format = 'webm';
        result.details.webm = true;
      }
      
      // Check for Ogg header
      // Ogg files start with "OggS"
      else if (header[0] === 0x4F && header[1] === 0x67 && header[2] === 0x67 && header[3] === 0x53) {
        result.isValid = true;
        result.format = 'ogg';
        result.details.ogg = true;
      }
      
      // Check for MP3 header
      // MP3 files often start with ID3 or 0xFF 0xFB
      else if (
        (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) || // "ID3"
        (header[0] === 0xFF && (header[1] & 0xE0) === 0xE0) // MPEG sync bits
      ) {
        result.isValid = true;
        result.format = 'mp3';
        result.details.mp3 = true;
      }
      
      // Check for WAV header
      // WAV files start with "RIFF" followed by 4 bytes and then "WAVE"
      else if (
        header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 && // "RIFF"
        header[8] === 0x57 && header[9] === 0x41 && header[10] === 0x56 && header[11] === 0x45 // "WAVE"
      ) {
        result.isValid = true;
        result.format = 'wav';
        result.details.wav = true;
      }
      
      return result;
    } catch (error) {
      console.error('Error checking audio format:', error);
      return {
        size: blob.size,
        type: blob.type,
        isValid: false,
        error: error.message
      };
    }
  };
  
  /**
   * Converts an audio blob to MP3 format using Web Audio API
   * Note: This is experimental and may not work in all browsers
   * @param {Blob} audioBlob - The audio blob to convert
   * @returns {Promise<Blob>} - An MP3 blob
   */
  export const convertToMP3 = async (audioBlob) => {
    // This is a placeholder for future implementation
    // Web Audio API doesn't natively support MP3 encoding
    // You would need a library like lamejs for this
    
    console.warn('MP3 conversion not implemented yet - returning original blob');
    return audioBlob;
  };
  
  /**
   * Checks if MediaRecorder supports various audio formats
   * @returns {Object} - Object with supported formats
   */
  export const checkMediaRecorderSupport = () => {
    const types = [
      'audio/webm',
      'audio/webm;codecs=opus',
      'audio/ogg',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/mp3',
      'audio/wav'
    ];
    
    const support = {};
    
    if (!window.MediaRecorder) {
      console.error('MediaRecorder not supported in this browser');
      return { supported: false, error: 'MediaRecorder not available' };
    }
    
    for (const type of types) {
      support[type] = MediaRecorder.isTypeSupported(type);
    }
    
    console.log('MediaRecorder supported formats:', support);
    return { supported: true, formats: support };
  };
  
  /**
   * Analyzes an audio buffer service to check for issues
   * @param {Object} audioBufferService - Instance of AudioBufferService
   * @returns {Object} - Diagnostic information
   */
  export const analyzeAudioBufferService = (audioBufferService) => {
    if (!audioBufferService) {
      return { valid: false, error: 'No AudioBufferService provided' };
    }
    
    const diagnostics = {
      valid: true,
      chunks: {
        count: audioBufferService.audioChunks ? audioBufferService.audioChunks.length : 0,
        totalSize: 0,
        types: new Set()
      },
      mediaRecorder: {
        state: audioBufferService.mediaRecorder ? audioBufferService.mediaRecorder.state : 'not initialized',
        mimeType: audioBufferService.mediaRecorder ? audioBufferService.mediaRecorder.mimeType : 'unknown'
      },
      mediaStream: {
        active: audioBufferService.mediaStream ? audioBufferService.mediaStream.active : false,
        tracks: []
      }
    };
    
    // Check audioChunks
    if (audioBufferService.audioChunks && audioBufferService.audioChunks.length > 0) {
      audioBufferService.audioChunks.forEach(chunk => {
        diagnostics.chunks.totalSize += chunk.size;
        diagnostics.chunks.types.add(chunk.type);
      });
      diagnostics.chunks.types = Array.from(diagnostics.chunks.types);
    } else {
      diagnostics.warnings = diagnostics.warnings || [];
      diagnostics.warnings.push('No audio chunks recorded yet');
    }
    
    // Check mediaStream
    if (audioBufferService.mediaStream) {
      const tracks = audioBufferService.mediaStream.getTracks();
      diagnostics.mediaStream.trackCount = tracks.length;
      
      tracks.forEach(track => {
        diagnostics.mediaStream.tracks.push({
          kind: track.kind,
          id: track.id,
          label: track.label,
          enabled: track.enabled,
          readyState: track.readyState,
          muted: track.muted
        });
      });
    } else {
      diagnostics.errors = diagnostics.errors || [];
      diagnostics.errors.push('No media stream available');
      diagnostics.valid = false;
    }
    
    return diagnostics;
  };
  
  export default {
    checkAudioFormat,
    convertToMP3,
    checkMediaRecorderSupport,
    analyzeAudioBufferService
  };