import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Container,
  Typography,
  Box,
  Button,
  AppBar,
  Toolbar,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Chip,
  Grid,
  Card,
  CardContent,
  Fade,
  useTheme,
  useMediaQuery,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider
} from '@mui/material';
import {
  AccountCircle,
  Logout,
  Upload,
  History,
  Dashboard,
  Menu as MenuIcon,
  Close
} from '@mui/icons-material';
import LoginDialog from './components/LoginDialog.jsx';
import RegisterDialog from './components/RegisterDialog.jsx';
import UserPage from './components/UserPage.jsx';
import UploadForm from './components/UploadForm.jsx';
import JobTable from './components/JobTable.jsx';
import TranscriptDialog from './components/TranscriptDialog.jsx';

const API_BASE = `https://${import.meta.env.VITE_WHISPER_API_DOMAIN}`;

export default function App() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  // Auth-State
  const [apiKey, setApiKey] = useState(localStorage.getItem('apiKey') || '');
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  
  // Dialog-States
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  
  // Jobs & Transcript-Dialog
  const [jobs, setJobs] = useState([]);
  const [transcript, setTranscript] = useState('');
  const [openTrans, setOpenTrans] = useState(false);
  const [selectedJobInfo, setSelectedJobInfo] = useState(null);
  
  // UI States
  const [activeView, setActiveView] = useState('upload');
  const [anchorEl, setAnchorEl] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [jobStats, setJobStats] = useState({ total: 0, completed: 0, processing: 0 });

  // Axios Header setzen
  useEffect(() => {
    if (apiKey) {
      axios.defaults.headers.common['X-API-Key'] = apiKey;
      fetchJobs();
    }
  }, [apiKey]);

  // Job-Statistiken berechnen
  useEffect(() => {
    const total = jobs.length;
    const completed = jobs.filter(job => job.status === 'completed').length;
    const processing = jobs.filter(job => job.progress < 1 && job.status !== 'failed').length;
    setJobStats({ total, completed, processing });
  }, [jobs]);

  const fetchJobs = async () => {
    try {
      const res = await axios.get(`${API_BASE}/jobs`);
      setJobs(res.data);
    } catch (err) {
      console.error('Fehler beim Laden der Jobs:', err);
    }
  };

  const handleLogin = ({ username, apiKey }) => {
    setUsername(username);
    setApiKey(apiKey);
    localStorage.setItem('username', username);
    localStorage.setItem('apiKey', apiKey);
    setShowLogin(false);
  };

  const handleLogout = () => {
    setUsername('');
    setApiKey('');
    localStorage.removeItem('username');
    localStorage.removeItem('apiKey');
    axios.defaults.headers.common['X-API-Key'] = '';
    setAnchorEl(null);
  };

  // ✅ Neue Funktion für Account-Löschung hinzufügen
  const handleAccountDeleted = () => {
    // Benutzer ausloggen und zur Startseite weiterleiten
    setUsername('');
    setApiKey('');
    localStorage.removeItem('username');
    localStorage.removeItem('apiKey');
    axios.defaults.headers.common['X-API-Key'] = '';
    setAnchorEl(null);
    setActiveView('upload');
    
    // Optional: Erfolgsbenachrichtigung anzeigen
    alert('Ihr Konto wurde erfolgreich gelöscht.');
  };

  const handleRowClick = async (jobId) => {
    try {
      const res = await axios.get(`${API_BASE}/jobs/${jobId}`);
      setTranscript(res.data.result);
      // Zusätzliche Job-Infos für den Dialog
      const jobInfo = jobs.find(job => job.id === jobId);
      setSelectedJobInfo(jobInfo);
      setOpenTrans(true);
    } catch (err) {
      console.error('Fehler beim Laden des Transkripts:', err);
    }
  };

  // Navigation Menu Items
  const navigationItems = [
    { id: 'upload', label: 'Upload', icon: <Upload />, badge: null },
    { id: 'jobs', label: 'Jobs', icon: <History />, badge: jobStats.total },
    { id: 'profile', label: 'Profil', icon: <AccountCircle />, badge: null }
  ];

  // Mobile Navigation Drawer
  const MobileDrawer = () => (
    <Drawer
      anchor="left"
      open={mobileMenuOpen}
      onClose={() => setMobileMenuOpen(false)}
    >
      <Box sx={{ width: 250, pt: 2 }}>
        <Box sx={{ px: 2, pb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Whisper AI
          </Typography>
        </Box>
        <Divider />
        <List>
          {navigationItems.map((item) => (
            <ListItem
              key={item.id}
              button
              selected={activeView === item.id}
              onClick={() => {
                setActiveView(item.id);
                setMobileMenuOpen(false);
              }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
              {item.badge && (
                <Chip size="small" label={item.badge} />
              )}
            </ListItem>
          ))}
        </List>
        <Divider />
        <ListItem button onClick={handleLogout}>
          <ListItemIcon><Logout /></ListItemIcon>
          <ListItemText primary="Abmelden" />
        </ListItem>
      </Box>
    </Drawer>
  );

  // Landing Page für nicht eingeloggte User
  if (!apiKey) {
    return (
      <Box sx={{ 
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center'
      }}>
        <Container maxWidth="md">
          <Fade in timeout={1000}>
            <Card sx={{ 
              textAlign: 'center', 
              p: 4,
              backdropFilter: 'blur(10px)',
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              borderRadius: 3,
              boxShadow: '0 20px 40px rgba(0,0,0,0.1)'
            }}>
              <Typography variant="h2" gutterBottom sx={{ 
                fontWeight: 700,
                background: 'linear-gradient(45deg, #667eea, #764ba2)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                color: 'transparent',
                fontSize: { xs: '2rem', md: '3.5rem' }
              }}>
                Whisper AI
              </Typography>
              <Typography variant="h5" color="text.secondary" gutterBottom sx={{
                fontSize: { xs: '1.2rem', md: '1.5rem' }
              }}>
                Professionelle Audio-Transkription mit KI
              </Typography>
              <Typography variant="body1" sx={{ 
                mb: 4, 
                maxWidth: 600, 
                mx: 'auto',
                fontSize: { xs: '0.9rem', md: '1rem' }
              }}>
                Wandeln Sie Ihre Audio-Dateien mit modernster Whisper-Technologie 
                in präzise Texte um. Schnell, sicher und benutzerfreundlich.
              </Typography>
              
              <Box display="flex" justifyContent="center" gap={2} flexWrap="wrap">
                <Button 
                  variant="contained" 
                  size="large"
                  onClick={() => setShowLogin(true)}
                  sx={{ 
                    px: 4, 
                    py: 1.5,
                    borderRadius: 2,
                    background: 'linear-gradient(45deg, #667eea, #764ba2)',
                    '&:hover': {
                      background: 'linear-gradient(45deg, #5a6fd8, #6a42a0)',
                    }
                  }}
                >
                  Anmelden
                </Button>
                <Button 
                  variant="outlined" 
                  size="large"
                  onClick={() => setShowRegister(true)}
                  sx={{ px: 4, py: 1.5, borderRadius: 2 }}
                >
                  Registrieren
                </Button>
              </Box>

              <Grid container spacing={3} sx={{ mt: 4 }}>
                <Grid item xs={12} md={4}>
                  <Box textAlign="center">
                    <Upload sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
                    <Typography variant="h6">Einfacher Upload</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Drag & Drop oder Datei auswählen
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Box textAlign="center">
                    <Dashboard sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
                    <Typography variant="h6">Live-Status</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Verfolgen Sie den Fortschritt in Echtzeit
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Box textAlign="center">
                    <History sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
                    <Typography variant="h6">Verlauf</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Alle Transkriptionen übersichtlich verwalten
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </Card>
          </Fade>
        </Container>

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
      </Box>
    );
  }

  // Haupt-UI für eingeloggte User
  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: '#f5f7fa' }}>
      <AppBar position="static" elevation={0} sx={{ 
        background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)'
      }}>
        <Toolbar>
          {isMobile && (
            <IconButton
              color="inherit"
              onClick={() => setMobileMenuOpen(true)}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
          )}
          
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }}>
            Whisper AI
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 1, mr: 2 }}>
            <Chip 
              label={`${jobStats.total} Jobs`} 
              size="small" 
              sx={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}
            />
            {jobStats.processing > 0 && (
              <Chip 
                label={`${jobStats.processing} läuft`} 
                size="small" 
                color="warning"
              />
            )}
          </Box>

          <IconButton
            size="large"
            onClick={(e) => setAnchorEl(e.currentTarget)}
            color="inherit"
          >
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'rgba(255,255,255,0.2)' }}>
              {username.charAt(0).toUpperCase()}
            </Avatar>
          </IconButton>
          
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
          >
            <MenuItem onClick={() => { setActiveView('profile'); setAnchorEl(null); }}>
              <AccountCircle sx={{ mr: 1 }} />
              Profil
            </MenuItem>
            <MenuItem onClick={handleLogout}>
              <Logout sx={{ mr: 1 }} />
              Abmelden
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <MobileDrawer />

      <Container maxWidth="lg" sx={{ py: 3 }}>
        {!isMobile && (
          <Box sx={{ mb: 3 }}>
            <Box display="flex" gap={1} flexWrap="wrap">
              {navigationItems.map((item) => (
                <Button
                  key={item.id}
                  variant={activeView === item.id ? 'contained' : 'outlined'}
                  onClick={() => setActiveView(item.id)}
                  startIcon={item.icon}
                  endIcon={item.badge ? <Chip size="small" label={item.badge} /> : null}
                >
                  {item.label}
                </Button>
              ))}
            </Box>
          </Box>
        )}

        <Fade in key={activeView} timeout={300}>
          <Box>
            {activeView === 'upload' && (
              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant="h5" gutterBottom>
                    Neue Transkription
                  </Typography>
                  <UploadForm onDone={() => { fetchJobs(); setActiveView('jobs'); }} />
                </CardContent>
              </Card>
            )}

            {activeView === 'jobs' && (
              <Card>
                <CardContent>
                  <Typography variant="h5" gutterBottom>
                    Meine Transkriptionen
                  </Typography>
                  <JobTable 
                    jobs={jobs} 
                    onRefresh={fetchJobs} 
                    onRowClick={handleRowClick} 
                  />
                </CardContent>
              </Card>
            )}

            {activeView === 'profile' && (
              <Card>
                <CardContent>
                  <Typography variant="h5" gutterBottom>
                    Profil & API-Zugang
                  </Typography>
                  <UserPage 
                    username={username} 
                    apiKey={apiKey} 
                    onAccountDeleted={handleAccountDeleted}
                  />
                </CardContent>
              </Card>
            )}
          </Box>
        </Fade>
      </Container>

      <TranscriptDialog
        open={openTrans}
        transcript={transcript}
        jobInfo={selectedJobInfo}
        onClose={() => {
          setOpenTrans(false);
          setSelectedJobInfo(null);
        }}
      />
    </Box>
  );
}
