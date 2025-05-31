import React, { useState } from 'react';
import './FileUpload.css';

/**
 * FileUpload Component
 * Handles audiobook file uploads and validates file typ
 */
const FileUpload = ({ onFileSelect }) => {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState(null);
  
  // Allowed audio file types
  const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/ogg', 'audio/wav'];
  
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };
  
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };
  
  const handleChange = (e) => {
    e.preventDefault();
    
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };
  
  const handleFile = (file) => {
    setError(null);
    
    // Validate file type
    if (!allowedTypes.includes(file.type)) {
      setError('Please upload a valid audio file (MP3, MP4, OGG, or WAV)');
      return;
    }
    
    // Extract book title from filename
    let bookTitle = file.name.replace(/\.[^/.]+$/, ''); // Remove file extension
    
    // Set filename for display
    setFileName(file.name);
    
    // Pass the file and title to parent component
    onFileSelect(file, bookTitle);
  };
  
  const handleButtonClick = () => {
    document.getElementById('file-upload').click();
  };
  
  return (
    <div 
      className={`file-upload-container ${dragActive ? 'drag-active' : ''}`}
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
    >
      <input 
        type="file"
        id="file-upload"
        className="file-input"
        onChange={handleChange}
        accept=".mp3,.mp4,.ogg,.wav"
      />
      
      <div className="file-upload-content">
        <div className="upload-icon">
          <svg xmlns="http://www.w3.org/2000/svg" height="64" width="64" viewBox="0 0 24 24">
            <path d="M5 12.5l7-7 7 7M12 5v14" stroke="#007bff" strokeWidth="2" fill="none"/>
          </svg>
        </div>
        
        <h3>Drag & Drop your audiobook here</h3>
        <p>or</p>
        <button className="browse-button" onClick={handleButtonClick}>
          Browse Files
        </button>
        
        <p className="file-types">Supported formats: MP3, MP4, OGG, WAV</p>
        
        {fileName && (
          <div className="selected-file">
            <p>Selected file: {fileName}</p>
          </div>
        )}
        
        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUpload;