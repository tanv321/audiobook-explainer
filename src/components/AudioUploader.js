import React from 'react';

function AudioUploader({ onFileUpload }) {
  console.log('[AudioUploader.js] Rendering AudioUploader component');

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    console.log('[AudioUploader.js] File selected:', file?.name, 'Type:', file?.type);
    
    if (file && file.type.includes('audio')) {
      onFileUpload(file);
    } else if (file) {
      // Additional check for common audio file extensions in case MIME type detection fails
      const fileName = file.name.toLowerCase();
      const audioExtensions = ['.mp3', '.wav', '.aac', '.m4a', '.ogg', '.flac'];
      const hasAudioExtension = audioExtensions.some(ext => fileName.endsWith(ext));
      
      if (hasAudioExtension) {
        console.log('[AudioUploader.js] File has audio extension, proceeding despite MIME type');
        onFileUpload(file);
      } else {
        console.error('[AudioUploader.js] Invalid file type. Please select an audio file.');
        alert('Please select a valid audio file (MP3, WAV, AAC, etc.)');
      }
    }
  };

  return (
    <div className="audio-uploader">
      <h2>Upload Audiobook</h2>
      <input 
        type="file" 
        onChange={handleFileChange} 
        id="audio-file-input"
      />
      <label htmlFor="audio-file-input">
        Select Audio File
      </label>
      <p>Accepted formats: MP3, WAV, AAC, etc.</p>
    </div>
  );
}

export default AudioUploader;