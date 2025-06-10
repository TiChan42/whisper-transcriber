import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  LinearProgress
} from '@mui/material';
import axios from 'axios';

const API_BASE = `https://${import.meta.env.VITE_WHISPER_API_DOMAIN}`;

export default function UploadForm({ onDone }) {
  const [file, setFile] = useState(null);
  const [model, setModel] = useState('');
  const [alias, setAlias] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [availableModels, setAvailableModels] = useState([]);

  // Verfügbare Modelle beim Laden abrufen
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await axios.get(`${API_BASE}/models`);
        const loadedModels = response.data.models.filter(m => m.loaded);
        setAvailableModels(loadedModels);
        
        // Erstes verfügbares Modell als Standard setzen
        if (loadedModels.length > 0 && !model) {
          setModel(loadedModels[0].value);
        }
      } catch (error) {
        console.error('Fehler beim Laden der Modelle:', error);
      }
    };

    fetchModels();
  }, []);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!file || !model) return;
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    form.append('model', model);
    form.append('alias', alias);
    try {
      await axios.post(`${API_BASE}/jobs`, form, {
        onUploadProgress: p => setProgress(p.loaded / p.total)
      });
      onDone();
    } catch (err) {
      console.error('Upload-Fehler:', err);
    } finally {
      setUploading(false);
      setProgress(0);
      setFile(null);
      setAlias('');
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} display="flex" flexDirection="column" gap={2}>
      <Button variant="contained" component="label">
        Audiodatei auswählen
        <input
          type="file"
          hidden
          accept="audio/*"
          onChange={e => setFile(e.target.files[0])}
        />
      </Button>
      {file && <Typography>Ausgewählt: {file.name}</Typography>}
      
      <FormControl fullWidth>
        <InputLabel id="model-label">Modell</InputLabel>
        <Select
          labelId="model-label"
          value={model}
          label="Modell"
          onChange={e => setModel(e.target.value)}
        >
          {availableModels.map(modelOption => (
            <MenuItem key={modelOption.value} value={modelOption.value}>
              {modelOption.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      
      <TextField
        label="Alias (optional)"
        value={alias}
        onChange={e => setAlias(e.target.value)}
      />
      <Button type="submit" variant="contained" disabled={uploading || !model}>
        Transkription starten
      </Button>
      {uploading && <LinearProgress variant="determinate" value={progress * 100} />}
    </Box>
  );
}
