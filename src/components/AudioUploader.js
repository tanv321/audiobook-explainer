import React from 'react';

function AudioUploader({ onFileUpload }) {
  console.log('[AudioUploader.js] Rendering AudioUploader component');

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    console.log('[AudioUploader.js] File selected:', file?.name);
    
    if (file && file.type.includes('audio')) {
      onFileUpload(file);
    } else {
      console.error('[AudioUploader.js] Invalid file type. Please select an audio file.');
      alert('Please select a valid audio file (MP3, WAV, etc.)');
    }
  };

  return (
    <div className="audio-uploader">
      <h2>Upload Audiobook</h2>
      <input 
        type="file" 
        accept="audio/*" 
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