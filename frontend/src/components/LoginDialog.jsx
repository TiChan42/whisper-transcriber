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

export default function LoginDialog({ open, onClose, onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');

  const handleLogin = async () => {
    try {
      const res = await axios.post(`${API_BASE}/login`, { username, password });
      onSuccess({ username, apiKey: res.data.api_key });
      setUsername('');
      setPassword('');
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Anmeldung fehlgeschlagen');
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Anmelden</DialogTitle>
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
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button onClick={handleLogin} variant="contained">Anmelden</Button>
      </DialogActions>
    </Dialog>
  );
}
