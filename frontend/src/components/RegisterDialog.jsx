import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  DialogActions,
  Button,
  Alert
} from '@mui/material';
import axios from 'axios';

const API_BASE = `https://${import.meta.env.VITE_WHISPER_API_DOMAIN}`;

export default function RegisterDialog({ open, onClose, onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [regKey,   setRegKey]   = useState('');
  const [error,    setError]    = useState('');

  const handleRegister = async () => {
    try {
      const form = new FormData();
      form.append('username', username);
      form.append('password', password);
      form.append('reg_key', regKey);
      const res = await axios.post(`${API_BASE}/register`, form);
      onSuccess({ username, apiKey: res.data.api_key });
      setUsername('');
      setPassword('');
      setRegKey('');
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Registrierung fehlgeschlagen');
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Registrieren</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          autoFocus
          margin="dense"
          label="Benutzername"
          fullWidth
          value={username}
          onChange={e => setUsername(e.target.value)}
        />
        <TextField
          margin="dense"
          label="Passwort"
          type="password"
          fullWidth
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <TextField
          margin="dense"
          label="Registrierungs‑Schlüssel"
          fullWidth
          value={regKey}
          onChange={e => setRegKey(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button onClick={handleRegister} variant="contained">
          Registrieren
        </Button>
      </DialogActions>
    </Dialog>
  );
}
