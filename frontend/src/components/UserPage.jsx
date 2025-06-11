import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Grid,
  Chip,
  Alert,
  IconButton,
  Tooltip,
  Divider,
  Avatar,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tabs,
  Tab,
  Badge,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Skeleton
} from '@mui/material';
import {
  ContentCopy,
  Visibility,
  VisibilityOff,
  Check,
  Person,
  Key,
  Security,
  Info,
  Code,
  Download,
  ExpandMore,
  Upload,
  History,
  GetApp,
  Delete,
  PlayArrow,
  Language,
  Close,
  ModelTraining,
  FileDownload,
  DeleteForever,
  Warning
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = `https://${import.meta.env.VITE_WHISPER_API_DOMAIN}`;

export default function UserPage({ username, apiKey, onAccountDeleted }) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [codeDialogOpen, setCodeDialogOpen] = useState(false);
  const [currentCodeExample, setCurrentCodeExample] = useState({ title: '', content: {} });
  const [activeTab, setActiveTab] = useState(0);
  
  // ✅ Dynamische API-Daten
  const [apiDocs, setApiDocs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ✅ Konto löschen
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  
  // ✅ API-Dokumentation laden
  useEffect(() => {
    fetchApiDocs();
  }, []);

  const fetchApiDocs = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/api-docs`);
      setApiDocs(response.data);
    } catch (err) {
      console.error('Fehler beim Laden der API-Dokumentation:', err);
      setError('API-Dokumentation konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Kopieren fehlgeschlagen:', err);
    }
  };

  // ✅ Dynamische Code-Generierung basierend auf API-Dokumentation
  const generateCodeExamples = (endpoint) => {
    const examples = {};
    
    // cURL Beispiel
    examples.curl = () => {
      let curlCmd = `curl -X ${endpoint.method} "${apiDocs.base_url}${endpoint.path}"`;
      
      if (endpoint.requires_auth) {
        curlCmd += ` \\\n  -H "X-API-Key: ${apiKey}"`;
      }
      
      if (endpoint.method === 'POST' && endpoint.parameters) {
        const fileParam = endpoint.parameters.find(p => p.type === 'file');
        const otherParams = endpoint.parameters.filter(p => p.type !== 'file');
        
        if (fileParam) {
          curlCmd += ` \\\n  -F "${fileParam.name}=@example.mp3"`;
        }
        
        otherParams.forEach(param => {
          const value = param.default || (param.options ? param.options[0].value : 'example');
          curlCmd += ` \\\n  -F "${param.name}=${value}"`;
        });
      }
      
      return curlCmd;
    };

    // Python Beispiel
    examples.python = () => {
      let pythonCode = `import requests\n\n`;
      pythonCode += `url = "${apiDocs.base_url}${endpoint.path}"\n`;
      
      if (endpoint.requires_auth) {
        pythonCode += `headers = {"X-API-Key": "${apiKey}"}\n\n`;
      }
      
      if (endpoint.method === 'POST' && endpoint.parameters) {
        const fileParam = endpoint.parameters.find(p => p.type === 'file');
        const otherParams = endpoint.parameters.filter(p => p.type !== 'file');
        
        if (fileParam) {
          pythonCode += `files = {"${fileParam.name}": open("example.mp3", "rb")}\n`;
        }
        
        if (otherParams.length > 0) {
          pythonCode += `data = {\n`;
          otherParams.forEach(param => {
            const value = param.default || (param.options ? `"${param.options[0].value}"` : '"example"');
            pythonCode += `    "${param.name}": ${value},\n`;
          });
          pythonCode += `}\n\n`;
        }
        
        pythonCode += `response = requests.${endpoint.method.toLowerCase()}(url`;
        if (endpoint.requires_auth) pythonCode += `, headers=headers`;
        if (fileParam) pythonCode += `, files=files`;
        if (otherParams.length > 0) pythonCode += `, data=data`;
        pythonCode += `)\n`;
      } else {
        pythonCode += `response = requests.${endpoint.method.toLowerCase()}(url`;
        if (endpoint.requires_auth) pythonCode += `, headers=headers`;
        pythonCode += `)\n`;
      }
      
      pythonCode += `result = response.json()\nprint(result)`;
      return pythonCode;
    };

    // JavaScript Beispiel  
    examples.javascript = () => {
      let jsCode = '';
      
      if (endpoint.method === 'POST' && endpoint.parameters?.find(p => p.type === 'file')) {
        jsCode += `const formData = new FormData();\n`;
        jsCode += `formData.append('file', audioFile); // File object\n`;
        
        endpoint.parameters.filter(p => p.type !== 'file').forEach(param => {
          const value = param.default || (param.options ? param.options[0].value : 'example');
          jsCode += `formData.append('${param.name}', '${value}');\n`;
        });
        
        jsCode += `\nfetch('${apiDocs.base_url}${endpoint.path}', {\n`;
        jsCode += `  method: '${endpoint.method}',\n`;
        if (endpoint.requires_auth) {
          jsCode += `  headers: {\n    'X-API-Key': '${apiKey}'\n  },\n`;
        }
        jsCode += `  body: formData\n`;
      } else {
        jsCode += `fetch('${apiDocs.base_url}${endpoint.path}', {\n`;
        jsCode += `  method: '${endpoint.method}'`;
        if (endpoint.requires_auth) {
          jsCode += `,\n  headers: {\n    'X-API-Key': '${apiKey}'\n  }`;
        }
      }
      
      jsCode += `\n})\n.then(response => response.json())\n.then(data => {\n  console.log(data);\n})\n.catch(error => console.error('Error:', error));`;
      
      return jsCode;
    };

    return examples;
  };

  const showCodeDialog = (endpoint) => {
    const examples = generateCodeExamples(endpoint);
    setCurrentCodeExample({ 
      title: `${endpoint.title} - Code-Beispiele`,
      content: examples 
    });
    setCodeDialogOpen(true);
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    setDeleteError('');
    
    try {
      await axios.delete(`${API_BASE}/user/delete`);
      
      // Account wurde gelöscht - Parent-Komponente benachrichtigen
      if (onAccountDeleted) {
        onAccountDeleted();
      }
      
    } catch (error) {
      console.error('Fehler beim Löschen des Kontos:', error);
      setDeleteError(
        error.response?.data?.detail || 
        'Fehler beim Löschen des Kontos. Bitte versuchen Sie es später erneut.'
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  // Icon Mapping
  const getIconForEndpoint = (iconName) => {
    const iconMap = {
      upload: <Upload color="primary" />,
      history: <History color="success" />,
      download: <GetApp color="info" />,
      file_download: <FileDownload color="secondary" />,
      delete: <Delete color="error" />,
      model_training: <ModelTraining color="primary" />,
      language: <Language color="secondary" />,
      info: <Info color="info" />,
      play_arrow: <PlayArrow color="warning" />
    };
    return iconMap[iconName] || <Code color="primary" />;
  };

  // Code Dialog Component
  const CodeExampleDialog = () => (
    <Dialog 
      open={codeDialogOpen} 
      onClose={() => setCodeDialogOpen(false)}
      maxWidth="lg"
      fullWidth
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">{currentCodeExample.title}</Typography>
          <IconButton onClick={() => setCodeDialogOpen(false)}>
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} sx={{ mb: 2 }}>
          <Tab label="cURL" />
          <Tab label="Python" />
          <Tab label="JavaScript" />
        </Tabs>
        
        {Object.entries(currentCodeExample.content).map(([lang, code], index) => (
          <Box key={lang} hidden={activeTab !== index}>
            <Paper sx={{ p: 2, backgroundColor: 'grey.50' }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  {lang === 'curl' ? 'cURL' : lang === 'python' ? 'Python' : 'JavaScript'}
                </Typography>
                <Button
                  size="small"
                  startIcon={<ContentCopy />}
                  onClick={() => handleCopy(typeof code === 'function' ? code() : code)}
                >
                  Kopieren
                </Button>
              </Box>
              <Box 
                component="pre" 
                sx={{ 
                  fontSize: '0.75rem',
                  overflow: 'auto',
                  backgroundColor: 'grey.900',
                  color: 'grey.100',
                  p: 1.5,
                  borderRadius: 1,
                  whiteSpace: 'pre-wrap'
                }}
              >
                {typeof code === 'function' ? code() : code}
              </Box>
            </Paper>
          </Box>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setCodeDialogOpen(false)}>Schließen</Button>
      </DialogActions>
    </Dialog>
  );

  const DeleteAccountDialog = () => (
    <Dialog
      open={deleteDialogOpen}
      onClose={() => !deleteLoading && setDeleteDialogOpen(false)}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <Warning color="error" />
          <Typography variant="h6" color="error">
            Konto löschen
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            <strong>Achtung: Diese Aktion kann nicht rückgängig gemacht werden!</strong>
          </Typography>
          <Typography variant="body2">
            Wenn Sie Ihr Konto löschen, werden folgende Daten unwiderruflich entfernt:
          </Typography>
        </Alert>
        
        <List dense>
          <ListItem>
            <ListItemIcon>
              <DeleteForever color="error" />
            </ListItemIcon>
            <ListItemText 
              primary="Ihr Benutzerkonto"
              secondary="Benutzername und Anmeldedaten"
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <History color="error" />
            </ListItemIcon>
            <ListItemText 
              primary="Alle Transkriptionsjobs"
              secondary="Inklusive Verlauf und Ergebnisse"
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <Key color="error" />
            </ListItemIcon>
            <ListItemText 
              primary="API-Zugangsschlüssel"
              secondary="Alle API-Integrationen werden deaktiviert"
            />
          </ListItem>
        </List>
        
        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Alternative:</strong> Sie können auch einfach aufhören, den Dienst zu nutzen. 
            Ihre Daten bleiben dann inaktiv gespeichert.
          </Typography>
        </Alert>
        
        {deleteError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {deleteError}
          </Alert>
        )}
      </DialogContent>
      
      <DialogActions sx={{ p: 3 }}>
        <Button
          onClick={() => setDeleteDialogOpen(false)}
          disabled={deleteLoading}
        >
          Abbrechen
        </Button>
        <Button
          onClick={handleDeleteAccount}
          color="error"
          variant="contained"
          disabled={deleteLoading}
          startIcon={deleteLoading ? <CircularProgress size={20} /> : <DeleteForever />}
        >
          {deleteLoading ? 'Wird gelöscht...' : 'Konto endgültig löschen'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  if (loading) {
    return (
      <Box>
        <Grid container spacing={3}>
          {[...Array(3)].map((_, i) => (
            <Grid item xs={12} md={6} key={i}>
              <Card>
                <CardContent>
                  <Skeleton variant="text" width="60%" height={32} />
                  <Skeleton variant="rectangular" width="100%" height={100} sx={{ mt: 2 }} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" action={
        <Button size="small" onClick={fetchApiDocs}>
          Erneut versuchen
        </Button>
      }>
        {error}
      </Alert>
    );
  }

  return (
    <Box>
      <Grid container spacing={3}>
        {/* Benutzer-Info */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2} mb={3}>
                <Avatar sx={{ 
                  width: 56, 
                  height: 56, 
                  background: 'linear-gradient(45deg, #667eea, #764ba2)',
                  fontSize: '1.5rem'
                }}>
                  {username.charAt(0).toUpperCase()}
                </Avatar>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {username}
                  </Typography>
                  <Chip 
                    icon={<Person />}
                    label="Aktiver Benutzer" 
                    color="success" 
                    size="small" 
                  />
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              <List dense>
                <ListItem>
                  <ListItemIcon>
                    <Security color="primary" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Account-Status"
                    secondary="Aktiv und verifiziert"
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <Key color="primary" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="API-Zugriff"
                    secondary="Vollzugriff auf alle Funktionen"
                  />
                </ListItem>
              </List>

              {/* ✅ Konto-Verwaltung Section hinzufügen */}
              <Divider sx={{ my: 2 }} />
              
              <Box>
                <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600, color: 'error.main' }}>
                  Konto-Verwaltung
                </Typography>
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  startIcon={<DeleteForever />}
                  onClick={() => setDeleteDialogOpen(true)}
                  sx={{ mt: 1 }}
                >
                  Konto löschen
                </Button>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                  Löscht Ihr Konto und alle zugehörigen Daten permanent
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* API Key */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                <Key sx={{ mr: 1, verticalAlign: 'middle' }} />
                API-Schlüssel
              </Typography>
              
              <Box sx={{ mb: 2 }}>
                <TextField
                  fullWidth
                  label="Ihr API-Key"
                  value={showApiKey ? apiKey : '●'.repeat(32)}
                  variant="outlined"
                  size="small"
                  InputProps={{
                    readOnly: true,
                    endAdornment: (
                      <Box display="flex" gap={1}>
                        <Tooltip title={showApiKey ? 'Verbergen' : 'Anzeigen'}>
                          <IconButton
                            size="small"
                            onClick={() => setShowApiKey(!showApiKey)}
                          >
                            {showApiKey ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={copied ? 'Kopiert!' : 'Kopieren'}>
                          <IconButton
                            size="small"
                            onClick={() => handleCopy(apiKey)}
                            color={copied ? 'success' : 'default'}
                          >
                            {copied ? <Check /> : <ContentCopy />}
                          </IconButton>
                        </Tooltip>
                      </Box>
                    ),
                  }}
                />
              </Box>

              <Alert severity="warning" size="small">
                <strong>Wichtig:</strong> Teilen Sie Ihren API-Key niemals mit anderen. 
                Er gewährt vollen Zugriff auf Ihr Konto.
              </Alert>
            </CardContent>
          </Card>
        </Grid>

        {/* ✅ Dynamische API-Dokumentation */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                <Code sx={{ mr: 1, verticalAlign: 'middle' }} />
                API-Dokumentation
              </Typography>

              <Typography variant="body2" color="text.secondary" paragraph>
                Nutzen Sie die Whisper API direkt in Ihren Anwendungen. 
                Klicken Sie auf "Code anzeigen" für vollständige Beispiele.
              </Typography>

              <Alert severity="info" sx={{ mb: 3 }}>
                <Typography variant="body2">
                  <strong>API-Basis-URL:</strong> <code>{apiDocs?.base_url}</code><br/>
                  <strong>Authentifizierung:</strong> Header <code>X-API-Key: {apiKey.substring(0, 8)}...</code><br/>
                  <strong>Version:</strong> {apiDocs?.version}
                </Typography>
              </Alert>

              {/* ✅ Dynamische Endpunkte */}
              <Box>
                {apiDocs?.endpoints?.map((endpoint) => (
                  <Accordion key={endpoint.id} sx={{ mb: 1 }}>
                    <AccordionSummary expandIcon={<ExpandMore />}>
                      <Box display="flex" alignItems="center" gap={2} width="100%">
                        {getIconForEndpoint(endpoint.icon)}
                        <Box flex={1}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                            {endpoint.title}
                          </Typography>
                          <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                            <Chip 
                              label={endpoint.method}
                              size="small"
                              color={endpoint.method === 'GET' ? 'info' : 
                                     endpoint.method === 'POST' ? 'success' : 
                                     endpoint.method === 'DELETE' ? 'error' : 'default'}
                            />
                            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                              {endpoint.path}
                            </Typography>
                            <Badge 
                              badgeContent={endpoint.badge} 
                              color="primary" 
                              sx={{ ml: 'auto' }} 
                            />
                            {endpoint.requires_auth && (
                              <Chip label="🔐 Auth" size="small" variant="outlined" />
                            )}
                          </Box>
                        </Box>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Typography variant="body2" color="text.secondary" paragraph>
                        {endpoint.description}
                      </Typography>
                      
                      {/* Parameter-Dokumentation */}
                      {endpoint.parameters && endpoint.parameters.length > 0 && (
                        <Box mb={2}>
                          <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
                            Parameter:
                          </Typography>
                          <List dense>
                            {endpoint.parameters.map((param, idx) => (
                              <ListItem key={idx} sx={{ pl: 0 }}>
                                <ListItemText
                                  primary={
                                    <Box display="flex" alignItems="center" gap={1}>
                                      <code>{param.name}</code>
                                      <Chip 
                                        label={param.type} 
                                        size="small" 
                                        variant="outlined"
                                      />
                                      {param.required && (
                                        <Chip 
                                          label="Erforderlich" 
                                          size="small" 
                                          color="error"
                                        />
                                      )}
                                    </Box>
                                  }
                                  secondary={param.description}
                                />
                              </ListItem>
                            ))}
                          </List>
                        </Box>
                      )}
                      
                      <Box display="flex" gap={1} flexWrap="wrap">
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<Code />}
                          onClick={() => showCodeDialog(endpoint)}
                        >
                          Code anzeigen
                        </Button>
                        
                        <Button
                          variant="text"
                          size="small"
                          startIcon={<ContentCopy />}
                          onClick={() => handleCopy(generateCodeExamples(endpoint).curl())}
                        >
                          cURL kopieren
                        </Button>
                      </Box>
                    </AccordionDetails>
                  </Accordion>
                ))}
              </Box>

              {/* System-Limits */}
              {apiDocs?.limits && (
                <Box mt={3}>
                  <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
                    System-Limits:
                  </Typography>
                  <List dense>
                    <ListItem>
                      <ListItemText 
                        primary="Upload-Größe"
                        secondary={`Maximal ${apiDocs.limits.max_upload_size_mb} MB`}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText 
                        primary="Gleichzeitige Jobs"
                        secondary={`Maximal ${apiDocs.limits.max_concurrent_jobs} pro Benutzer`}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText 
                        primary="Unterstützte Formate"
                        secondary={apiDocs.limits.supported_formats.join(', ')}
                      />
                    </ListItem>
                  </List>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <DeleteAccountDialog />
      <CodeExampleDialog />
    </Box>
  );
}
