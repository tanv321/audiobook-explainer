// Handles communication with the OpenAI API for audio transcription and explanation
console.log('[apiService.js] Loading API service');

// Get API key from environment variables
const API_KEY = process.env.REACT_APP_OPENAI_API_KEY;

// Check if API key is available
if (!API_KEY) {
  console.warn('[apiService.js] OpenAI API key not found in environment variables');
}

/**
 * Process audio data and get explanation from OpenAI
 * @param {Object} audioData - The recorded audio data object
 * @param {string} fileName - Name of the audiobook file
 * @returns {Promise<Object>} - The explanation response
 */
export const processAudioAndGetExplanation = async (audioData, fileName) => {
  console.log('[apiService.js] Processing audio and getting explanation');
  
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
 * Transcribe audio using OpenAI's Whisper API
 * @param {Object} audioData - The audio data object containing blob and metadata
 * @returns {Promise<string>} - The transcription text
 */
export const transcribeAudio = async (audioData) => {
  console.log('[apiService.js] Transcribing audio with Whisper API');
  
  try {
    if (!API_KEY) {
      throw new Error('OpenAI API key not found');
    }
    
    const { audioBlob, mimeType, filename } = audioData;
    
    // Log detailed information about the audio being sent
    console.log('[apiService.js] Sending audio to Whisper API:');
    console.log(`[apiService.js] - File size: ${Math.round(audioBlob.size / 1024)} KB`);
    console.log(`[apiService.js] - File type: ${mimeType}`);
    console.log(`[apiService.js] - Filename: ${filename}`);
    
    // For debugging purposes, record the timestamp when the API call starts
    const startTime = new Date().getTime();
    
    // Create FormData
    const formData = new FormData();
    
    // Append the file with explicit filename and type
    // Make sure the extension matches one of Whisper's supported formats
    // The correct extension is crucial for the API to recognize the format
    const fileExtension = filename.split('.').pop().toLowerCase();
    const supportedExtensions = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];
    
    // If the extension is not supported, default to mp3
    const finalExtension = supportedExtensions.includes(fileExtension) ? fileExtension : 'mp3';
    const finalFilename = `audio.${finalExtension}`;
    
    console.log(`[apiService.js] Using filename with extension: ${finalFilename}`);
    
    // Create a file object with the correct extension
    const file = new File([audioBlob], finalFilename, { type: mimeType });
    formData.append('file', file);
    formData.append('model', 'whisper-1');
    
    // Set a longer timeout as a safety measure
    const timeout = 30000; // 30 seconds
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    // Make API request to OpenAI Whisper with detailed logging
    console.log('[apiService.js] Sending request to Whisper API...');
    
    try {
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`
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
        let errorMessage = `Status code: ${response.status}`;
        
        try {
          // Try to parse the error response as JSON
          const errorData = JSON.parse(rawResponse);
          console.error('[apiService.js] Whisper API error data:', errorData);
          
          // Special handling for format errors
          if (errorData.error && errorData.error.message.includes('Invalid file format')) {
            throw new Error(`Format error: ${errorData.error.message}. Used filename: ${finalFilename}, mimetype: ${mimeType}`);
          }
          
          errorMessage = errorData.error?.message || 'Unknown error';
        } catch (parseError) {
          // If not JSON, log the raw response
          console.error('[apiService.js] Whisper API raw error response:', rawResponse);
          errorMessage = 'Could not parse error response';
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
      
      console.log('[apiService.js] Transcription successful');
      
      return data.text;
    } catch (fetchError) {
      if (fetchError.name === 'AbortError') {
        console.error('[apiService.js] Request timed out after', timeout, 'ms');
        throw new Error(`Whisper API request timed out after ${timeout}ms`);
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('[apiService.js] Error transcribing audio:', error);
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
    
    // Extract book title from filename (remove extension)
    const bookTitle = fileName.replace(/\.[^/.]+$/, "");
    
    // Prepare prompt for ChatGPT
    const prompt = `In the audiobook "${bookTitle}", this passage is being discussed: "${transcription}". Could you help me understand in simpler terms what is being discussed here?`;
    
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
          { role: 'system', content: 'You are a helpful assistant that explains audiobook content in simple terms.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 300
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('[apiService.js] ChatGPT API error:', errorData);
      throw new Error(`ChatGPT API error: ${errorData.error?.message || 'Unknown error'}`);
    }
    
    const data = await response.json();
    console.log('[apiService.js] Explanation generated successfully');
    
    return data.choices[0].message.content;
  } catch (error) {
    console.error('[apiService.js] Error getting explanation:', error);
    throw error;
  }
};