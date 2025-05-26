// iOS-Compatible API Service - Handles communication with OpenAI API
console.log('[apiService.js] Loading iOS-compatible API service');

// Get API key from environment variables
const API_KEY = process.env.REACT_APP_OPENAI_API_KEY;

// Check if API key is available
if (!API_KEY) {
  console.warn('[apiService.js] OpenAI API key not found in environment variables');
}

// iOS detection
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

/**
 * Process audio data and get explanation from OpenAI
 * @param {Object} audioData - The recorded audio data object
 * @param {string} fileName - Name of the audiobook file
 * @returns {Promise<Object>} - The explanation response
 */
export const processAudioAndGetExplanation = async (audioData, fileName) => {
  console.log('[apiService.js] Processing audio and getting explanation for iOS:', isIOS);
  
  try {
    // First transcribe the audio using Whisper API
    const transcription = await transcribeAudio(audioData);
    console.log('[apiService.js] Audio transcribed successfully');
    
    // Then get explanation from ChatGPT API
    const explanation = await getExplanation(transcription, fileName);
    console.log('[apiService.js] Explanation received successfully');
    
    return { transcription, explanation };
  } catch (error) {
    console.error('[apiService.js] Error processing audio:', error);
    throw error;
  }
};

/**
 * Transcribe audio using OpenAI's Whisper API with iOS optimizations
 * @param {Object} audioData - The audio data object containing blob and metadata
 * @returns {Promise<string>} - The transcription text
 */
export const transcribeAudio = async (audioData) => {
  console.log('[apiService.js] Transcribing audio with Whisper API (iOS optimized)');
  
  try {
    if (!API_KEY) {
      throw new Error('OpenAI API key not found');
    }
    
    const { audioBlob, mimeType, filename } = audioData;
    
    // Enhanced logging for iOS debugging
    console.log('[apiService.js] Sending audio to Whisper API:');
    console.log(`[apiService.js] - File size: ${Math.round(audioBlob.size / 1024)} KB`);
    console.log(`[apiService.js] - File type: ${mimeType}`);
    console.log(`[apiService.js] - Filename: ${filename}`);
    console.log(`[apiService.js] - Is iOS: ${isIOS}`);
    console.log(`[apiService.js] - User Agent: ${navigator.userAgent}`);
    
    // Validate blob size (iOS has memory constraints)
    if (audioBlob.size === 0) {
      throw new Error('Audio blob is empty - no audio data recorded');
    }
    
    if (audioBlob.size > 25 * 1024 * 1024) { // 25MB limit for Whisper
      throw new Error(`Audio file too large: ${Math.round(audioBlob.size / 1024 / 1024)}MB (max 25MB)`);
    }
    
    // iOS-specific: Check for very small files that might indicate recording issues
    if (isIOS && audioBlob.size < 1000) { // Less than 1KB
      throw new Error(`Audio file suspiciously small (${audioBlob.size} bytes) - may indicate iOS recording issue`);
    }
    
    // For debugging purposes, record the timestamp when the API call starts
    const startTime = new Date().getTime();
    
    // Create FormData
    const formData = new FormData();
    
    // iOS-specific filename handling
    const fileExtension = filename.split('.').pop().toLowerCase();
    const supportedExtensions = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];
    
    // iOS Safari typically produces MP4/AAC, so handle that properly
    let finalExtension = fileExtension;
    let finalMimeType = mimeType;
    
    if (isIOS) {
      // iOS MediaRecorder typically produces MP4 container with AAC audio
      if (mimeType.includes('mp4') || !supportedExtensions.includes(fileExtension)) {
        finalExtension = 'mp4';
        finalMimeType = 'audio/mp4';
      }
    } else {
      // Desktop fallback
      if (!supportedExtensions.includes(fileExtension)) {
        finalExtension = 'webm';
        finalMimeType = 'audio/webm';
      }
    }
    
    const finalFilename = `audio.${finalExtension}`;
    
    console.log(`[apiService.js] Using filename: ${finalFilename}, MIME type: ${finalMimeType}`);
    
    // Create a file object with the correct extension and MIME type
    const file = new File([audioBlob], finalFilename, { type: finalMimeType });
    formData.append('file', file);
    formData.append('model', 'whisper-1');
    
    // Optional: Add language hint for better accuracy
    // formData.append('language', 'en');
    
    // iOS-specific: Use longer timeout as mobile devices may be slower
    const timeout = isIOS ? 60000 : 30000; // 60s for iOS, 30s for desktop
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    // Make API request to OpenAI Whisper with detailed logging
    console.log('[apiService.js] Sending request to Whisper API...');
    
    try {
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`
          // Note: Don't set Content-Type when using FormData
        },
        body: formData,
        signal: controller.signal
      });
      
      // Clear the timeout since the request completed
      clearTimeout(timeoutId);
      
      // Get the raw response for better debugging
      const rawResponse = await response.text();
      
      // Calculate and log the response time
      const endTime = new Date().getTime();
      console.log(`[apiService.js] Whisper API response time: ${endTime - startTime}ms`);
      
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        try {
          // Try to parse the error response as JSON
          const errorData = JSON.parse(rawResponse);
          console.error('[apiService.js] Whisper API error data:', errorData);
          
          // iOS-specific error handling
          if (errorData.error) {
            if (errorData.error.message.includes('Invalid file format') || 
                errorData.error.message.includes('Unsupported file type')) {
              throw new Error(`iOS Audio Format Error: ${errorData.error.message}. 
                Device: ${isIOS ? 'iOS' : 'Desktop'}, 
                MIME: ${finalMimeType}, 
                Extension: ${finalExtension},
                Original MIME: ${mimeType}`);
            }
            
            if (errorData.error.message.includes('file size')) {
              throw new Error(`File size error: ${errorData.error.message}. Size: ${audioBlob.size} bytes`);
            }
            
            errorMessage = errorData.error.message;
          }
        } catch (parseError) {
          // If not JSON, log the raw response
          console.error('[apiService.js] Whisper API raw error response:', rawResponse);
          if (rawResponse.includes('413') || rawResponse.includes('too large')) {
            errorMessage = `File too large (${Math.round(audioBlob.size / 1024)}KB). Try recording shorter segments.`;
          } else {
            errorMessage = `Could not parse error response. Status: ${response.status}`;
          }
        }
        
        throw new Error(`Whisper API error: ${errorMessage}`);
      }
      
      // Parse the successful response
      let data;
      try {
        data = JSON.parse(rawResponse);
      } catch (parseError) {
        console.error('[apiService.js] Error parsing successful response:', parseError);
        console.log('[apiService.js] Raw response:', rawResponse);
        throw new Error('Could not parse API response');
      }
      
      // Validate the response
      if (!data.text || data.text.trim().length === 0) {
        throw new Error('Whisper API returned empty transcription - audio may be silent or corrupted');
      }
      
      console.log('[apiService.js] Transcription successful, length:', data.text.length);
      
      return data.text;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        console.error('[apiService.js] Request timed out after', timeout, 'ms');
        throw new Error(`Whisper API request timed out after ${timeout/1000}s. ${isIOS ? 'iOS networks may be slower.' : ''}`);
      }
      
      // Network error handling for iOS
      if (fetchError.message.includes('Failed to fetch') || fetchError.message.includes('Network request failed')) {
        throw new Error(`Network error: Unable to reach Whisper API. ${isIOS ? 'Check your iOS device\'s internet connection.' : 'Check your internet connection.'}`);
      }
      
      throw fetchError;
    }
  } catch (error) {
    console.error('[apiService.js] Error transcribing audio:', error);
    
    // Add iOS-specific debugging info to errors
    if (isIOS && error.message.includes('format')) {
      const debugInfo = {
        isIOS: true,
        userAgent: navigator.userAgent,
        blobSize: audioData.audioBlob.size,
        mimeType: audioData.mimeType,
        filename: audioData.filename
      };
      console.error('[apiService.js] iOS Debug Info:', debugInfo);
      
      error.message += `\n\nDEBUG INFO: ${JSON.stringify(debugInfo)}`;
    }
    
    throw error;
  }
};

/**
 * Get explanation from OpenAI's ChatGPT API
 * @param {string} transcription - The transcribed text
 * @param {string} fileName - Name of the audiobook file
 * @returns {Promise<string>} - The explanation text
 */
export const getExplanation = async (transcription, fileName) => {
  console.log('[apiService.js] Getting explanation from ChatGPT API');
  
  try {
    if (!API_KEY) {
      throw new Error('OpenAI API key not found');
    }
    
    // Validate transcription
    if (!transcription || transcription.trim().length === 0) {
      throw new Error('Cannot generate explanation: transcription is empty');
    }
    
    // Extract book title from filename (remove extension)
    const bookTitle = fileName.replace(/\.[^/.]+$/, "");
    
    // Enhanced prompt for better explanations
    const prompt = `You are explaining an audiobook passage to help someone understand it better. 

Audiobook: "${bookTitle}"
Passage: "${transcription}"

Please provide a clear, helpful explanation of what's happening in this passage. Keep it concise but informative, focusing on:
- Key concepts or ideas being discussed
- Important context or background information
- Any significant events or developments
- How this relates to the overall story/topic

Explanation:`;
    
    // iOS-specific: Use shorter max_tokens to reduce response time and memory usage
    const maxTokens = isIOS ? 200 : 300;
    
    // Make API request to OpenAI ChatGPT
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { 
            role: 'system', 
            content: 'You are a helpful assistant that explains audiobook content clearly and concisely. Always provide useful context and make complex ideas easy to understand.' 
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: maxTokens,
        temperature: 0.7
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('[apiService.js] ChatGPT API error:', errorData);
      throw new Error(`ChatGPT API error: ${errorData.error?.message || 'Unknown error'}`);
    }
    
    const data = await response.json();
    
    // Validate response
    if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
      throw new Error('Invalid response from ChatGPT API');
    }
    
    const explanation = data.choices[0].message.content.trim();
    
    if (explanation.length === 0) {
      throw new Error('ChatGPT returned empty explanation');
    }
    
    console.log('[apiService.js] Explanation generated successfully, length:', explanation.length);
    
    return explanation;
  } catch (error) {
    console.error('[apiService.js] Error getting explanation:', error);
    throw error;
  }
};