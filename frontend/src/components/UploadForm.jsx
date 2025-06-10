import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  LinearProgress,
  Paper,
  Chip,
  Alert,
  Grid,
  Card,
  CardContent,
  Fade,
  CircularProgress
} from '@mui/material';
import {
  CloudUpload,
  AudioFile,
  CheckCircle,
  Error as ErrorIcon,
  Delete,
  Refresh
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = `https://${import.meta.env.VITE_WHISPER_API_DOMAIN}`;
// ✅ Upload-Limit aus Umgebungsvariable oder API abrufen
const MAX_UPLOAD_SIZE_MB = parseInt(import.meta.env.VITE_MAX_UPLOAD_SIZE_MB) || 500;
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

export default function UploadForm({ onDone }) {
  const [file, setFile] = useState(null);
  const [model, setModel] = useState('');
  const [alias, setAlias] = useState('');
  const [language, setLanguage] = useState('auto'); 
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [availableModels, setAvailableModels] = useState([]);
  const [availableLanguages, setAvailableLanguages] = useState([]); 
  const [dragOver, setDragOver] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [error, setError] = useState('');
  const [loadingModels, setLoadingModels] = useState(true);
  const [loadingLanguages, setLoadingLanguages] = useState(true);
  const [uploadLimits, setUploadLimits] = useState({
    max_size_mb: MAX_UPLOAD_SIZE_MB,
    max_size_bytes: MAX_UPLOAD_SIZE_BYTES,
    supported_formats: ["MP3", "WAV", "M4A", "FLAC", "OGG"]
  });

  useEffect(() => {
    fetchModels();
    fetchLanguages();
    fetchUploadLimits(); // ✅ Upload-Limits vom Backend abrufen
  }, []);

  const fetchModels = async () => {
    setLoadingModels(true);
    try {
      const response = await axios.get(`${API_BASE}/models`);
      const loadedModels = response.data.models.filter(m => m.loaded);
      setAvailableModels(loadedModels);
      
      if (loadedModels.length > 0 && !model) {
        setModel(loadedModels[0].value);
      }
    } catch (error) {
      console.error('Fehler beim Laden der Modelle:', error);
      setError('Modelle konnten nicht geladen werden');
    } finally {
      setLoadingModels(false);
    }
  };

  // Laden der Sprachen
  const fetchLanguages = async () => {
    setLoadingLanguages(true);
    try {
      const response = await axios.get(`${API_BASE}/languages`);
      setAvailableLanguages(response.data.languages);
    } catch (error) {
      console.error('Fehler beim Laden der Sprachen:', error);
      // Fallback zu statischen Sprachen
      setAvailableLanguages([
        {"code": "auto", "name": "Automatisch erkennen", "flag": "🌐"},
        {"code": "de", "name": "Deutsch", "flag": "🇩🇪"},
        {"code": "en", "name": "English", "flag": "🇺🇸"},
        {"code": "fr", "name": "Français", "flag": "🇫🇷"},
        {"code": "es", "name": "Español", "flag": "🇪🇸"}
      ]);
    } finally {
      setLoadingLanguages(false);
    }
  };

  // ✅ Neue Funktion zum Laden der Upload-Limits
  const fetchUploadLimits = async () => {
    try {
      const response = await axios.get(`${API_BASE}/upload-limits`);
      setUploadLimits(response.data);
    } catch (error) {
      console.warn('Upload-Limits konnten nicht geladen werden, verwende Fallback-Werte');
    }
  };

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // ✅ Verbesserte Dateivalidierung
  const isValidAudioFile = (file) => {
    if (!file) return false;
    
    // Größenprüfung mit dynamischem Limit
    if (file.size > uploadLimits.max_size_bytes) {
      setError(`Datei zu groß! Maximal ${uploadLimits.max_size_mb} MB erlaubt (${formatFileSize(file.size)} gewählt)`);
      return false;
    }
    
    // MIME-Type Prüfung
    const validMimeTypes = [
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
      'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac',
      'audio/flac', 'audio/x-flac', 'audio/ogg', 'application/ogg'
    ];
    
    // Dateiendung-Prüfung als Fallback
    const fileName = file.name.toLowerCase();
    const validExtensions = ['.mp3', '.wav', '.m4a', '.flac', '.ogg'];
    const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));
    
    if (!validMimeTypes.includes(file.type) && !hasValidExtension) {
      setError(`Nicht unterstütztes Audio-Format. Erlaubt: ${uploadLimits.supported_formats.join(', ')}`);
      return false;
    }
    
    return true;
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && isValidAudioFile(droppedFile)) {
      setFile(droppedFile);
      setError('');
      // Auto-generate alias from filename
      const nameWithoutExt = droppedFile.name.replace(/\.[^/.]+$/, "");
      setAlias(nameWithoutExt);
    } else {
      setError('Bitte wählen Sie eine gültige Audio-Datei aus (MP3, WAV, M4A, FLAC, OGG)');
    }
  }, []);

  const handleFileSelect = (selectedFile) => {
    if (selectedFile && isValidAudioFile(selectedFile)) {
      setFile(selectedFile);
      setUploadComplete(false);
      setError('');
      const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, "");
      setAlias(nameWithoutExt);
    } else {
      setError('Bitte wählen Sie eine gültige Audio-Datei aus (MP3, WAV, M4A, FLAC, OGG)');
    }
  };

  const removeFile = () => {
    setFile(null);
    setAlias('');
    setError('');
    setUploadComplete(false);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !model) return;
    
    setUploading(true);
    setProgress(0);
    setError('');
    
    const form = new FormData();
    form.append('file', file);
    form.append('model', model);
    form.append('alias', alias);
    form.append('language', language); 
    
    try {
      const response = await axios.post(`${API_BASE}/jobs`, form, {
        onUploadProgress: (p) => setProgress((p.loaded / p.total) * 100)
      });
      
      setUploadComplete(true);
      setTimeout(() => {
        onDone();
        // Reset form
        setFile(null);
        setAlias('');
        setLanguage('auto');
        setProgress(0);
        setUploadComplete(false);
      }, 1500);
    } catch (err) {
      console.error('Upload-Fehler:', err);
      setError(err.response?.data?.detail || 'Upload fehlgeschlagen');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Grid container spacing={3}>
        {/* Drag & Drop Area */}
        <Grid item xs={12}>
          <Paper
            sx={{
              p: 4,
              textAlign: 'center',
              border: '2px dashed',
              borderColor: dragOver ? 'primary.main' : (error ? 'error.main' : 'grey.300'),
              backgroundColor: dragOver ? 'action.hover' : 'background.paper',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              '&:hover': {
                borderColor: 'primary.main',
                backgroundColor: 'action.hover'
              }
            }}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => !file && document.getElementById('file-input').click()}
          >
            <input
              id="file-input"
              type="file"
              hidden
              accept=".mp3,.wav,.m4a,.flac,.ogg,audio/*"
              onChange={(e) => handleFileSelect(e.target.files[0])}
            />
            
            {!file ? (
              <Fade in timeout={500}>
                <Box>
                  <CloudUpload sx={{ 
                    fontSize: 48, 
                    color: error ? 'error.main' : 'primary.main', 
                    mb: 2 
                  }} />
                  <Typography variant="h6" gutterBottom>
                    Audio-Datei auswählen oder hierher ziehen
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Unterstützte Formate: {uploadLimits.supported_formats.join(', ')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    {/* ✅ Dynamische Größenanzeige */}
                    Maximale Dateigröße: {uploadLimits.max_size_mb} MB
                  </Typography>
                </Box>
              </Fade>
            ) : (
              <Fade in timeout={500}>
                <Card sx={{ maxWidth: 400, mx: 'auto', textAlign: 'left' }}>
                  <CardContent>
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                      <Box display="flex" alignItems="center" gap={2}>
                        <AudioFile sx={{ fontSize: 40, color: 'success.main' }} />
                        <Box>
                          <Typography variant="subtitle1" noWrap sx={{ maxWidth: 200 }}>
                            {file.name}
                          </Typography>
                          <Box display="flex" gap={1} mt={0.5}>
                            <Chip 
                              label={formatFileSize(file.size)} 
                              size="small" 
                              variant="outlined"
                            />
                            {/* ✅ Dateityp-Chip hinzufügen */}
                            <Chip 
                              label={file.name.split('.').pop().toUpperCase()} 
                              size="small" 
                              variant="outlined"
                              color="primary"
                            />
                          </Box>
                        </Box>
                      </Box>
                      <Button
                        size="small"
                        color="error"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile();
                        }}
                      >
                        <Delete />
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Fade>
            )}
          </Paper>

          {/* ✅ Erweiterte Fehleranzeige mit Upload-Info */}
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {error}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Erlaubte Formate: {uploadLimits.supported_formats.join(', ')} • 
                Max. Größe: {uploadLimits.max_size_mb} MB
              </Typography>
            </Alert>
          )}
        </Grid>

        {/* Form Fields */}
        {file && (
          <>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel>Whisper-Modell</InputLabel>
                <Select
                  value={model}
                  label="Whisper-Modell"
                  onChange={(e) => setModel(e.target.value)}
                  disabled={loadingModels}
                >
                  {availableModels.map((modelOption) => (
                    <MenuItem key={modelOption.value} value={modelOption.value}>
                      <Box>
                        <Typography variant="body1">
                          {modelOption.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Modell: {modelOption.value}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel>Sprache</InputLabel>
                <Select
                  value={language}
                  label="Sprache"
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={loadingLanguages}
                >
                  {availableLanguages.map((lang) => (
                    <MenuItem key={lang.code} value={lang.code}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="body1">
                          {lang.flag} {lang.name}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Alias"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="z.B. Meeting_2024-01-15"
                helperText="Optional: Vergeben Sie einen Namen für diese Transkription"
              />
            </Grid>

            <Grid item xs={12}>
              {/* Information Box für Sprachauswahl */}
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  <strong>Sprach-Tipp:</strong> Die Auswahl der richtigen Sprache kann die Erkennungsgenauigkeit 
                  deutlich verbessern. Bei unbekannter Sprache verwenden Sie "Automatisch erkennen".
                </Typography>
              </Alert>

              {uploadComplete ? (
                <Alert 
                  severity="success" 
                  icon={<CheckCircle />}
                  sx={{ mb: 2 }}
                >
                  Upload erfolgreich! Transkription wird gestartet...
                </Alert>
              ) : (
                <Button 
                  type="submit" 
                  variant="contained" 
                  size="large"
                  fullWidth
                  disabled={uploading || !model || loadingModels || loadingLanguages}
                  startIcon={uploading ? <CircularProgress size={20} /> : <CloudUpload />}
                  sx={{ 
                    py: 1.5,
                    background: 'linear-gradient(45deg, #667eea, #764ba2)',
                    '&:hover': {
                      background: 'linear-gradient(45deg, #5a6fd8, #6a42a0)',
                    }
                  }}
                >
                  {uploading ? 'Upload läuft...' : 'Transkription starten'}
                </Button>
              )}
              
              {uploading && (
                <Box sx={{ mt: 2 }}>
                  <LinearProgress 
                    variant="determinate" 
                    value={progress}
                    sx={{ 
                      height: 8, 
                      borderRadius: 4,
                      backgroundColor: 'grey.200',
                      '& .MuiLinearProgress-bar': {
                        background: 'linear-gradient(45deg, #667eea, #764ba2)',
                      }
                    }}
                  />
                  <Typography variant="body2" textAlign="center" sx={{ mt: 1 }}>
                    {Math.round(progress)}% hochgeladen
                  </Typography>
                </Box>
              )}
            </Grid>
          </>
        )}
      </Grid>
    </Box>
  );
}
