import React, { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  LinearProgress,
  Typography,
  Box,
  IconButton,
  Button,
  Tooltip,
  Alert,
  Card,
  CardContent,
  Grid,
  useMediaQuery,
  useTheme,
  Collapse,
  CircularProgress,
  Fade
} from '@mui/material';
import {
  Refresh,
  Download,
  Delete,
  Visibility,
  ExpandMore,
  ExpandLess,
  Schedule,
  CheckCircle,
  Error as ErrorIcon,
  HourglassEmpty,
  PlayArrow,
  Pause,
  AccessTime
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = `https://${import.meta.env.VITE_WHISPER_API_DOMAIN}`;

export default function JobTable({ jobs, onRefresh, onRowClick }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [deletingJobs, setDeletingJobs] = useState(new Set());

  // Auto-refresh für laufende Jobs
  useEffect(() => {
    const hasRunningJobs = jobs.some(job => 
      job.status === 'processing' || job.status === 'pending' || job.status === 'queued'
    );
    
    if (hasRunningJobs) {
      const interval = setInterval(onRefresh, 2000); // Alle 2 Sekunden
      return () => clearInterval(interval);
    }
  }, [jobs, onRefresh]);

  // Hilfsfunktionen für Formatierung
  const formatFileSize = (bytes) => {
    if (!bytes) return '-';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 10) / 10 + ' ' + sizes[i];
  };

  const getLanguageFlag = (languageCode) => {
    const flags = {
      'de': '🇩🇪', 'en': '🇺🇸', 'fr': '🇫🇷', 'es': '🇪🇸', 'it': '🇮🇹',
      'pt': '🇵🇹', 'ru': '🇷🇺', 'ja': '🇯🇵', 'ko': '🇰🇷', 'zh': '🇨🇳',
      'ar': '🇸🇦', 'hi': '🇮🇳', 'nl': '🇳🇱', 'sv': '🇸🇪', 'da': '🇩🇰',
      'no': '🇳🇴', 'pl': '🇵🇱', 'tr': '🇹🇷', 'uk': '🇺🇦', 'cs': '🇨🇿',
      'el': '🇬🇷', 'fi': '🇫🇮', 'he': '🇮🇱', 'hu': '🇭🇺', 'is': '🇮🇸',
      'id': '🇮🇩', 'lv': '🇱🇻', 'lt': '🇱🇹', 'mt': '🇲🇹', 'ro': '🇷🇴',
      'sk': '🇸🇰', 'sl': '🇸🇮'
    };
    return flags[languageCode] || '🌐';
  };

  const formatAudioDuration = (seconds) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getFileTypeIcon = (filename) => {
    if (!filename) return '📄';
    
    const extension = filename.toLowerCase().split('.').pop();
    const iconMap = {
      'mp3': '🎵',
      'wav': '🎶',
      'm4a': '🎧',
      'flac': '🎼',
      'ogg': '🔊',
      'aac': '🎤'
    };
    
    return iconMap[extension] || '🎵';
  };

  // Status-Management
  const getStatusInfo = (job) => {
    switch (job.status) {
      case 'completed':
        return {
          color: 'success',
          icon: <CheckCircle />,
          label: 'Abgeschlossen',
          progress: 100,
          animated: false
        };
      case 'processing':
        return {
          color: 'primary',
          icon: <PlayArrow />,
          label: 'Verarbeitung läuft',
          progress: Math.round((job.progress || 0) * 100),
          animated: true
        };
      case 'pending':
        return {
          color: 'warning',
          icon: <HourglassEmpty />,
          label: 'In Warteschlange',
          progress: 0,
          animated: true
        };
      case 'queued':
        return {
          color: 'info',
          icon: <Schedule />,
          label: 'Warteschlange',
          progress: 0,
          animated: true
        };
      case 'failed':
        return {
          color: 'error',
          icon: <ErrorIcon />,
          label: 'Fehler',
          progress: 0,
          animated: false
        };
      default:
        return {
          color: 'default',
          icon: <Schedule />,
          label: job.status || 'Unbekannt',
          progress: 0,
          animated: false
        };
    }
  };

  // Event-Handler
  const handleDelete = async (jobId, event) => {
    event.stopPropagation();
    if (!window.confirm('Möchten Sie diesen Job wirklich löschen?')) return;
    
    setDeletingJobs(prev => new Set([...prev, jobId]));
    try {
      await axios.delete(`${API_BASE}/jobs/${jobId}`);
      onRefresh();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
    } finally {
      setDeletingJobs(prev => {
        const newSet = new Set(prev);
        newSet.delete(jobId);
        return newSet;
      });
    }
  };

  const handleDownload = async (jobId, event) => {
    event.stopPropagation();
    try {
      const response = await axios.get(`${API_BASE}/jobs/${jobId}/download`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `transcript_${jobId}.txt`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download-Fehler:', error);
    }
  };

  const toggleRowExpansion = (jobId) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(jobId)) {
        newSet.delete(jobId);
      } else {
        newSet.add(jobId);
      }
      return newSet;
    });
  };

  // Datum- und Zeit-Formatierung
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Datum parsing error:', error);
      return 'Ungültiges Datum';
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds || seconds <= 0) return '-';
    
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')} min`;
    } else {
      return `${secs}s`;
    }
  };

  // Zeitschätzung für laufende Jobs
  const getEstimatedTimeRemaining = (job) => {
    if (job.status !== 'processing' || !job.start_timestamp || !job.progress) {
      return null;
    }
    
    const startTime = new Date(job.start_timestamp);
    const now = new Date();
    const elapsedSeconds = (now - startTime) / 1000;
    
    if (job.progress > 0.1) { // Nur nach 10% Fortschritt schätzen
      const totalEstimatedSeconds = elapsedSeconds / job.progress;
      const remainingSeconds = totalEstimatedSeconds - elapsedSeconds;
      
      if (remainingSeconds > 0) {
        return Math.max(10, Math.round(remainingSeconds)); // Mindestens 10 Sekunden
      }
    }
    
    return null;
  };

  // UI-Komponenten
  const AnimatedProgressBar = ({ statusInfo, job }) => {
    const estimatedTimeRemaining = getEstimatedTimeRemaining(job);
    
    // Warteschlange - unbestimmter Fortschritt
    if (job.status === 'queued') {
      return (
        <Box sx={{ minWidth: 120 }}>
          <LinearProgress 
            sx={{ 
              height: 8, 
              borderRadius: 4,
              '& .MuiLinearProgress-bar': {
                background: 'linear-gradient(45deg, #f39c12, #e67e22)',
              }
            }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            🕒 In Warteschlange
          </Typography>
        </Box>
      );
    }

    // Vorbereitung - unbestimmter Fortschritt
    if (job.status === 'pending') {
      return (
        <Box sx={{ minWidth: 120 }}>
          <LinearProgress 
            color="warning"
            sx={{ 
              height: 8, 
              borderRadius: 4,
              '& .MuiLinearProgress-bar': {
                background: 'linear-gradient(45deg, #ff9800, #f57c00)',
              }
            }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            ⚙️ Wird vorbereitet...
          </Typography>
        </Box>
      );
    }

    // Aktive Verarbeitung - echter Fortschritt mit Zeitschätzung
    if (job.status === 'processing' && job.progress !== undefined) {
      const progressPercent = Math.round((job.progress || 0) * 100);
      
      return (
        <Box sx={{ minWidth: 140 }}>
          <LinearProgress 
            variant="determinate" 
            value={progressPercent}
            sx={{ 
              height: 8, 
              borderRadius: 4,
              '& .MuiLinearProgress-bar': {
                background: 'linear-gradient(45deg, #667eea, #764ba2)',
                transition: 'transform 0.8s ease-in-out',
              }
            }}
          />
          <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
            <Typography variant="caption" color="primary" sx={{ fontWeight: 600 }}>
              🎯 {progressPercent}%
            </Typography>
            <Box display="flex" alignItems="center" gap={0.5}>
              {estimatedTimeRemaining && (
                <Typography variant="caption" color="text.secondary">
                  ⏱️ ~{formatDuration(estimatedTimeRemaining)}
                </Typography>
              )}
              <CircularProgress size={12} thickness={6} sx={{ color: 'primary.main' }} />
            </Box>
          </Box>
        </Box>
      );
    }

    // Abgeschlossen
    if (job.status === 'completed') {
      return (
        <Box sx={{ minWidth: 120 }}>
          <LinearProgress 
            variant="determinate" 
            value={100}
            sx={{ 
              height: 8, 
              borderRadius: 4,
              '& .MuiLinearProgress-bar': {
                background: 'linear-gradient(45deg, #4caf50, #2e7d32)',
              }
            }}
          />
          <Box display="flex" alignItems="center" gap={1} sx={{ mt: 0.5 }}>
            <CheckCircle sx={{ fontSize: 14, color: 'success.main' }} />
            <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>
              ✅ Abgeschlossen
            </Typography>
          </Box>
          {job.duration && (
            <Typography variant="caption" color="text.secondary" display="block">
              ⏱️ {formatDuration(job.duration)}
            </Typography>
          )}
        </Box>
      );
    }

    // Fehler
    if (job.status === 'failed') {
      return (
        <Box sx={{ minWidth: 120 }}>
          <LinearProgress 
            variant="determinate" 
            value={100}
            sx={{ 
              height: 8, 
              borderRadius: 4,
              '& .MuiLinearProgress-bar': {
                background: 'linear-gradient(45deg, #f44336, #d32f2f)',
              }
            }}
          />
          <Box display="flex" alignItems="center" gap={1} sx={{ mt: 0.5 }}>
            <ErrorIcon sx={{ fontSize: 14, color: 'error.main' }} />
            <Typography variant="caption" color="error.main" sx={{ fontWeight: 600 }}>
              ❌ Fehler
            </Typography>
          </Box>
        </Box>
      );
    }

    // Fallback
    return (
      <Typography variant="body2" color="text.secondary">
        -
      </Typography>
    );
  };

  const AnimatedStatusChip = ({ statusInfo, job }) => {
    const pulseAnimation = statusInfo.animated ? {
      '@keyframes pulse': {
        '0%': { opacity: 1, transform: 'scale(1)' },
        '50%': { opacity: 0.8, transform: 'scale(1.02)' },
        '100%': { opacity: 1, transform: 'scale(1)' }
      },
      animation: 'pulse 2s infinite ease-in-out'
    } : {};

    return (
      <Chip
        icon={statusInfo.icon}
        label={
          <Box display="flex" alignItems="center" gap={0.5}>
            {statusInfo.label}
            {job.status === 'processing' && job.progress !== undefined && (
              <Typography variant="caption" sx={{ ml: 0.5, fontWeight: 600 }}>
                ({Math.round((job.progress || 0) * 100)}%)
              </Typography>
            )}
            {statusInfo.animated && statusInfo.color === 'primary' && (
              <CircularProgress size={10} thickness={6} color="inherit" />
            )}
          </Box>
        }
        color={statusInfo.color}
        size="small"
        sx={{
          ...pulseAnimation,
          transition: 'all 0.3s ease-in-out'
        }}
      />
    );
  };

  // Mobile Layout
  if (isMobile) {
    return (
      <Box>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">
            {jobs.length} Job{jobs.length !== 1 ? 's' : ''}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            onClick={onRefresh}
            startIcon={<Refresh />}
          >
            Aktualisieren
          </Button>
        </Box>

        <Grid container spacing={2}>
          {jobs.map((job) => {
            const statusInfo = getStatusInfo(job);
            const isExpanded = expandedRows.has(job.id);
            
            return (
              <Grid item xs={12} key={job.id}>
                <Fade in timeout={300}>
                  <Card 
                    sx={{ 
                      cursor: job.status === 'completed' ? 'pointer' : 'default',
                      transition: 'all 0.2s',
                      '&:hover': { 
                        boxShadow: job.status === 'completed' ? 4 : 2 
                      }
                    }}
                    onClick={() => job.status === 'completed' && onRowClick(job.id)}
                  >
                    <CardContent>
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                        <Box flex={1}>
                          <Typography variant="subtitle1" noWrap>
                            {job.alias || job.filename}
                          </Typography>
                          <Box display="flex" alignItems="center" gap={1} mt={1} flexWrap="wrap">
                            <AnimatedStatusChip statusInfo={statusInfo} job={job} />
                            <Typography variant="caption" color="text.secondary">
                              {formatDate(job.created_at)}
                            </Typography>
                            {/* Metadaten-Chips */}
                            {job.detected_language && (
                              <Chip 
                                label={`${getLanguageFlag(job.detected_language)} ${job.detected_language.toUpperCase()}`}
                                size="small" 
                                variant="outlined"
                              />
                            )}
                            {job.file_size && (
                              <Chip 
                                label={formatFileSize(job.file_size)}
                                size="small" 
                                variant="outlined"
                                color="info"
                              />
                            )}
                          </Box>
                        </Box>
                        
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRowExpansion(job.id);
                          }}
                        >
                          {isExpanded ? <ExpandLess /> : <ExpandMore />}
                        </IconButton>
                      </Box>

                      {/* Fortschrittsbalken für Mobile */}
                      {(statusInfo.progress > 0 && statusInfo.progress < 100) || 
                       job.status === 'queued' || job.status === 'pending' ? (
                        <Box mt={2}>
                          <AnimatedProgressBar statusInfo={statusInfo} job={job} />
                        </Box>
                      ) : null}

                      {/* Erweiterte Completion-Info */}
                      {job.status === 'completed' && (
                        <Box mt={1} display="flex" alignItems="center" gap={2} flexWrap="wrap">
                          {job.duration && (
                            <Box display="flex" alignItems="center" gap={0.5}>
                              <AccessTime sx={{ fontSize: 16, color: 'text.secondary' }} />
                              <Typography variant="caption" color="text.secondary">
                                Verarbeitung: {formatDuration(job.duration)}
                              </Typography>
                            </Box>
                          )}
                          {job.audio_duration && (
                            <Box display="flex" alignItems="center" gap={0.5}>
                              <PlayArrow sx={{ fontSize: 16, color: 'text.secondary' }} />
                              <Typography variant="caption" color="text.secondary">
                                Audio: {formatAudioDuration(job.audio_duration)}
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      )}

                      <Collapse in={isExpanded}>
                        <Box mt={2} pt={2} borderTop="1px solid" borderColor="divider">
                          <Grid container spacing={2}>
                            <Grid item xs={6}>
                              <Typography variant="caption" color="text.secondary">
                                Modell:
                              </Typography>
                              <Typography variant="body2">
                                {job.model}
                              </Typography>
                            </Grid>
                            <Grid item xs={6}>
                              <Typography variant="caption" color="text.secondary">
                                Datei:
                              </Typography>
                              <Typography variant="body2" noWrap>
                                {job.filename}
                              </Typography>
                            </Grid>
                            {/* Erweiterte Metadaten */}
                            {job.detected_language && (
                              <Grid item xs={6}>
                                <Typography variant="caption" color="text.secondary">
                                  Sprache:
                                </Typography>
                                <Typography variant="body2">
                                  {getLanguageFlag(job.detected_language)} {job.detected_language.toUpperCase()}
                                </Typography>
                              </Grid>
                            )}
                            {job.file_size && (
                              <Grid item xs={6}>
                                <Typography variant="caption" color="text.secondary">
                                  Dateigröße:
                                </Typography>
                                <Typography variant="body2">
                                  {formatFileSize(job.file_size)}
                                </Typography>
                              </Grid>
                            )}
                            {job.audio_duration && (
                              <Grid item xs={6}>
                                <Typography variant="caption" color="text.secondary">
                                  Audio-Dauer:
                                </Typography>
                                <Typography variant="body2">
                                  {formatAudioDuration(job.audio_duration)}
                                </Typography>
                              </Grid>
                            )}
                            {job.start_timestamp && (
                              <Grid item xs={6}>
                                <Typography variant="caption" color="text.secondary">
                                  Gestartet:
                                </Typography>
                                <Typography variant="body2">
                                  {formatDate(job.start_timestamp)}
                                </Typography>
                              </Grid>
                            )}
                            {/* Fehlerbehandlung */}
                            {job.status === 'failed' && job.error_message && (
                              <Grid item xs={12}>
                                <Alert severity="error" size="small">
                                  <Typography variant="caption">
                                    <strong>Fehler:</strong> {job.error_message}
                                  </Typography>
                                </Alert>
                              </Grid>
                            )}
                          </Grid>

                          <Box display="flex" gap={1} mt={2}>
                            {job.status === 'completed' && (
                              <>
                                <Button
                                  size="small"
                                  startIcon={<Visibility />}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRowClick(job.id);
                                  }}
                                >
                                  Anzeigen
                                </Button>
                                <Button
                                  size="small"
                                  startIcon={<Download />}
                                  onClick={(e) => handleDownload(job.id, e)}
                                >
                                  Download
                                </Button>
                              </>
                            )}
                            <Button
                              size="small"
                              color="error"
                              startIcon={<Delete />}
                              onClick={(e) => handleDelete(job.id, e)}
                              disabled={deletingJobs.has(job.id)}
                            >
                              Löschen
                            </Button>
                          </Box>
                        </Box>
                      </Collapse>
                    </CardContent>
                  </Card>
                </Fade>
              </Grid>
            );
          })}
        </Grid>
      </Box>
    );
  }

  // Desktop Table Layout
  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">
          {jobs.length} Job{jobs.length !== 1 ? 's' : ''}
        </Typography>
        <Button
          variant="outlined"
          onClick={onRefresh}
          startIcon={<Refresh />}
        >
          Aktualisieren
        </Button>
      </Box>

      <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: 'grey.50' }}>
              <TableCell><strong>Status</strong></TableCell>
              <TableCell><strong>Name</strong></TableCell>
              <TableCell><strong>Erstellt</strong></TableCell>
              <TableCell><strong>Fortschritt</strong></TableCell>
              <TableCell align="center"><strong>Aktionen</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {jobs.map((job) => {
              const statusInfo = getStatusInfo(job);
              
              return (
                <TableRow
                  key={job.id}
                  sx={{
                    cursor: job.status === 'completed' ? 'pointer' : 'default',
                    '&:hover': {
                      backgroundColor: job.status === 'completed' ? 'action.hover' : 'inherit'
                    }
                  }}
                  onClick={() => job.status === 'completed' && onRowClick(job.id)}
                >
                  <TableCell>
                    <AnimatedStatusChip statusInfo={statusInfo} job={job} />
                    {job.status === 'failed' && job.error_message && (
                      <Tooltip title={job.error_message} arrow>
                        <ErrorIcon sx={{ fontSize: 16, color: 'error.main', ml: 1 }} />
                      </Tooltip>
                    )}
                  </TableCell>
                  
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                      {job.alias || job.filename}
                    </Typography>
                    {job.alias && (
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {job.filename}
                      </Typography>
                    )}
                    {job.file_size && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {getFileTypeIcon(job.filename)} {formatFileSize(job.file_size)}
                      </Typography>
                    )}
                    {/* Modell und Sprache als kompakte Badges */}
                    <Box display="flex" gap={0.5} mt={0.5}>
                      {job.model && (
                        <Chip 
                          label={job.model} 
                          size="small" 
                          variant="outlined" 
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      )}
                      {job.detected_language && (
                        <Chip 
                          label={`${getLanguageFlag(job.detected_language)} ${job.detected_language.toUpperCase()}`}
                          size="small" 
                          variant="outlined"
                          color="info"
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      )}
                    </Box>
                  </TableCell>
                  
                  <TableCell>
                    <Typography variant="body2">
                      {formatDate(job.created_at)}
                    </Typography>
                    {job.audio_duration && (
                      <Typography variant="caption" color="info.main" display="block">
                        🎵 {formatAudioDuration(job.audio_duration)}
                      </Typography>
                    )}
                  </TableCell>
                  
                  <TableCell>
                    <AnimatedProgressBar statusInfo={statusInfo} job={job} />
                  </TableCell>
                  
                  <TableCell align="center">
                    <Box display="flex" gap={1} justifyContent="center">
                      {job.status === 'completed' && (
                        <>
                          <Tooltip title="Transkript anzeigen">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRowClick(job.id);
                              }}
                            >
                              <Visibility />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Als Textdatei herunterladen">
                            <IconButton
                              size="small"
                              onClick={(e) => handleDownload(job.id, e)}
                            >
                              <Download />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                      <Tooltip title="Job löschen">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={(e) => handleDelete(job.id, e)}
                          disabled={deletingJobs.has(job.id)}
                        >
                          <Delete />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
