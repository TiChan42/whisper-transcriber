import React, { useState } from 'react';
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

const API_BASE = 'https://whisper-api.shape-z.de';

export default function UploadForm({ onDone }) {
  const [file,    setFile]    = useState(null);
  const [model,   setModel]   = useState('fast');
  const [alias,   setAlias]   = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState(0);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!file) return;
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
        <InputLabel id="model-label">Modus</InputLabel>
        <Select
          labelId="model-label"
          value={model}
          label="Modus"
          onChange={e => setModel(e.target.value)}
        >
          <MenuItem value="fast">Schnell</MenuItem>
          <MenuItem value="accurate">Präzise</MenuItem>
        </Select>
      </FormControl>
      <TextField
        label="Alias (optional)"
        value={alias}
        onChange={e => setAlias(e.target.value)}
      />
      <Button type="submit" variant="contained" disabled={uploading}>
        Transkription starten
      </Button>
      {uploading && <LinearProgress variant="determinate" value={progress * 100} />}
    </Box>
  );
}
