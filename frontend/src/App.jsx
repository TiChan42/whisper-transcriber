import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Container,
  Typography,
  Box,
  Button
} from '@mui/material';
import LoginDialog    from './components/LoginDialog.jsx';
import RegisterDialog from './components/RegisterDialog.jsx';
import UserPage       from './components/UserPage.jsx';
import UploadForm     from './components/UploadForm.jsx';
import JobTable       from './components/JobTable.jsx';
import TranscriptDialog from './components/TranscriptDialog.jsx';

const API_BASE = 'https://whisper-api.shape-z.de';

export default function App() {
  // Auth-State
  const [apiKey,    setApiKey]    = useState(localStorage.getItem('apiKey') || '');
  const [username, setUsername]  = useState(localStorage.getItem('username') || '');
  // Dialog‑States
  const [showLogin,    setShowLogin]    = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  // Jobs & Transcript‑Dialog
  const [jobs, setJobs] = useState([]);
  const [transcript, setTranscript] = useState('');
  const [openTrans, setOpenTrans] = useState(false);

  // Axios Header setzen, wenn apiKey da ist
  useEffect(() => {
    if (apiKey) {
      axios.defaults.headers.common['X-API-Key'] = apiKey;
      fetchJobs();
    }
  }, [apiKey]);

  // Alle eigenen Jobs laden
  const fetchJobs = async () => {
    try {
      const res = await axios.get(`${API_BASE}/jobs`);
      setJobs(res.data);
    } catch (err) {
      console.error('Fehler beim Laden der Jobs:', err);
    }
  };

  // Login-Handler
  const handleLogin = ({ username, apiKey }) => {
    setUsername(username);
    setApiKey(apiKey);
    localStorage.setItem('username', username);
    localStorage.setItem('apiKey', apiKey);
    setShowLogin(false);
  };
  // Logout
  const handleLogout = () => {
    setUsername('');
    setApiKey('');
    localStorage.removeItem('username');
    localStorage.removeItem('apiKey');
  };

  // Transcript‑Popup öffnen
  const handleRowClick = async (jobId) => {
    try {
      const res = await axios.get(`${API_BASE}/jobs/${jobId}`);
      setTranscript(res.data.result);
      setOpenTrans(true);
    } catch (err) {
      console.error('Fehler beim Laden des Transkripts:', err);
    }
  };

  // Wenn nicht eingeloggt: Landing Page
  if (!apiKey) {
    return (
      <Container sx={{ mt: 8, textAlign: 'center' }}>
        <Typography variant="h3" gutterBottom>
          Whisper Transcription
        </Typography>
        <Box mt={4} display="flex" justifyContent="center" gap={2}>
          <Button variant="contained" onClick={() => setShowLogin(true)}>
            Anmelden
          </Button>
          <Button variant="outlined" onClick={() => setShowRegister(true)}>
            Registrieren
          </Button>
        </Box>
        <LoginDialog
          open={showLogin}
          onClose={() => setShowLogin(false)}
          onSuccess={handleLogin}
        />
        <RegisterDialog
          open={showRegister}
          onClose={() => setShowRegister(false)}
          onSuccess={handleLogin}
        />
      </Container>
    );
  }

  // Haupt-UI für eingeloggte User
  return (
    <Container sx={{ mt: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Typography variant="h4">Willkommen, {username}!</Typography>
        <Button color="error" onClick={handleLogout}>Abmelden</Button>
      </Box>
      <Box my={2}>
        <UserPage username={username} apiKey={apiKey} />
      </Box>
      <Box my={4}>
        <UploadForm onDone={fetchJobs} />
      </Box>
      <JobTable jobs={jobs} onRefresh={fetchJobs} onRowClick={handleRowClick} />
      <TranscriptDialog
        open={openTrans}
        transcript={transcript}
        onClose={() => setOpenTrans(false)}
      />
    </Container>
  );
}
