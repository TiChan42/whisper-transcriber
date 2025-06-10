import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  Button,
  IconButton,
  Paper,
  Tooltip,
  Chip,
  Alert,
  Divider,
  TextField,
  InputAdornment,
  Fade,
  Zoom,
  Fab,
  useMediaQuery,
  useTheme
} from '@mui/material';
import {
  Close,
  ContentCopy,
  Download,
  Search,
  Check,
  Article,
  FindInPage,
  KeyboardArrowUp,
  KeyboardArrowDown,
  Clear,
  Share,
  Print
} from '@mui/icons-material';

export default function TranscriptDialog({ open, transcript, onClose, jobInfo }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentMatch, setCurrentMatch] = useState(0);
  const [matches, setMatches] = useState([]);
  const contentRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Handle scroll to show/hide scroll-to-top button
  useEffect(() => {
    const handleScroll = () => {
      if (contentRef.current) {
        setShowScrollTop(contentRef.current.scrollTop > 300);
      }
    };

    const element = contentRef.current;
    if (element) {
      element.addEventListener('scroll', handleScroll);
      return () => element.removeEventListener('scroll', handleScroll);
    }
  }, []);

  // Find and highlight search matches
  useEffect(() => {
    if (!searchTerm.trim() || !transcript) {
      setMatches([]);
      setCurrentMatch(0);
      return;
    }

    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const foundMatches = [...transcript.matchAll(regex)];
    setMatches(foundMatches);
    setCurrentMatch(foundMatches.length > 0 ? 1 : 0);
  }, [searchTerm, transcript]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Kopieren fehlgeschlagen:', err);
    }
  };

  const handleDownload = () => {
    const filename = jobInfo?.alias || jobInfo?.filename || 'transcript';
    const timestamp = new Date().toISOString().split('T')[0];
    
    const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${timestamp}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Transkript',
          text: transcript,
        });
      } catch (err) {
        console.log('Share cancelled');
      }
    } else {
      handleCopy();
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Transkript - ${jobInfo?.alias || jobInfo?.filename || 'Unbekannt'}</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              line-height: 1.6; 
              margin: 40px;
              max-width: 800px;
            }
            .header {
              border-bottom: 2px solid #333;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .stats {
              color: #666;
              font-size: 0.9em;
              margin-top: 10px;
            }
            .content {
              white-space: pre-wrap;
              word-wrap: break-word;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Transkript</h1>
            <p><strong>Datei:</strong> ${jobInfo?.alias || jobInfo?.filename || 'Unbekannt'}</p>
            <p><strong>Erstellt:</strong> ${new Date().toLocaleString('de-DE')}</p>
            <div class="stats">
              ${getWordCount()} Wörter • ${getCharCount()} Zeichen
            </div>
          </div>
          <div class="content">${transcript}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const scrollToTop = () => {
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const navigateMatch = (direction) => {
    if (matches.length === 0) return;
    
    let newMatch;
    if (direction === 'next') {
      newMatch = currentMatch >= matches.length ? 1 : currentMatch + 1;
    } else {
      newMatch = currentMatch <= 1 ? matches.length : currentMatch - 1;
    }
    setCurrentMatch(newMatch);
    
    // Scroll to match (simplified - in real implementation you'd highlight and scroll to the actual position)
  };

  const clearSearch = () => {
    setSearchTerm('');
    setMatches([]);
    setCurrentMatch(0);
  };

  const highlightSearchTerm = (text) => {
    if (!searchTerm.trim()) return text;
    
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <span 
          key={index} 
          style={{ 
            backgroundColor: theme.palette.warning.light,
            color: theme.palette.warning.contrastText,
            fontWeight: 'bold',
            padding: '2px 4px',
            borderRadius: '3px'
          }}
        >
          {part}
        </span>
      ) : part
    );
  };

  const getWordCount = () => {
    if (!transcript) return 0;
    return transcript.trim().split(/\s+/).filter(word => word.length > 0).length;
  };

  const getCharCount = () => {
    return transcript ? transcript.length : 0;
  };

  const getSearchMatches = () => {
    return matches.length;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          height: isMobile ? '100vh' : '85vh',
          borderRadius: isMobile ? 0 : 3,
          boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column'
        }
      }}
    >
      <DialogTitle sx={{ pb: 1, flexShrink: 0 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={1}>
            <Article color="primary" />
            <Box>
              <Typography variant="h5" component="div" sx={{ fontWeight: 600 }}>
                Transkript
              </Typography>
              {jobInfo && (
                <Typography variant="caption" color="text.secondary">
                  {jobInfo.alias || jobInfo.filename}
                  {jobInfo.created_at && ` • ${formatDate(jobInfo.created_at)}`}
                </Typography>
              )}
            </Box>
          </Box>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </Box>
        
        {/* Statistics */}
        <Box display="flex" gap={1} mt={1} flexWrap="wrap">
          <Chip 
            label={`${getWordCount()} Wörter`} 
            size="small" 
            variant="outlined" 
          />
          <Chip 
            label={`${getCharCount()} Zeichen`} 
            size="small" 
            variant="outlined" 
          />
          {jobInfo?.model && (
            <Chip 
              label={`Modell: ${jobInfo.model}`} 
              size="small" 
              variant="outlined" 
              color="primary"
            />
          )}
          {searchTerm && matches.length > 0 && (
            <Chip 
              label={`${currentMatch}/${getSearchMatches()} Treffer`} 
              size="small" 
              color="primary"
              icon={<FindInPage />}
            />
          )}
        </Box>
      </DialogTitle>

      <Divider />

      {/* Search Bar */}
      <Box sx={{ p: 2, backgroundColor: 'grey.50', flexShrink: 0 }}>
        <Box display="flex" gap={1} alignItems="center">
          <TextField
            fullWidth
            size="small"
            placeholder="Im Transkript suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search color="action" />
                </InputAdornment>
              ),
              endAdornment: searchTerm && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={clearSearch}>
                    <Clear />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          
          {/* Search Navigation */}
          {searchTerm && matches.length > 0 && (
            <Box display="flex" gap={0.5}>
              <IconButton
                size="small"
                onClick={() => navigateMatch('prev')}
                disabled={matches.length === 0}
              >
                <KeyboardArrowUp />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => navigateMatch('next')}
                disabled={matches.length === 0}
              >
                <KeyboardArrowDown />
              </IconButton>
            </Box>
          )}
        </Box>
      </Box>

      {/* Transcript Content */}
      <DialogContent 
        ref={contentRef}
        sx={{ 
          p: 0, 
          flex: 1, 
          overflow: 'auto',
          position: 'relative'
        }}
      >
        <Box sx={{ p: 3 }}>
          {transcript ? (
            <Fade in timeout={500}>
              <Paper 
                elevation={0}
                sx={{ 
                  p: 3, 
                  backgroundColor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'grey.200',
                  borderRadius: 2
                }}
              >
                <Typography 
                  variant="body1" 
                  component="div"
                  sx={{ 
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    lineHeight: 1.7,
                    fontSize: '1rem',
                    color: 'text.primary'
                  }}
                >
                  {highlightSearchTerm(transcript)}
                </Typography>
              </Paper>
            </Fade>
          ) : (
            <Alert severity="info" sx={{ mx: 3 }}>
              Kein Transkript verfügbar oder Transkription noch nicht abgeschlossen.
            </Alert>
          )}
        </Box>

        {/* Scroll to Top Button */}
        <Zoom in={showScrollTop}>
          <Fab
            size="small"
            color="primary"
            onClick={scrollToTop}
            sx={{
              position: 'absolute',
              bottom: 16,
              right: 16,
              zIndex: 1
            }}
          >
            <KeyboardArrowUp />
          </Fab>
        </Zoom>
      </DialogContent>

      <Divider />

      {/* Actions */}
      <DialogActions sx={{ p: 2, gap: 1, flexShrink: 0, flexWrap: 'wrap' }}>
        <Tooltip title="In Zwischenablage kopieren">
          <Button
            onClick={handleCopy}
            startIcon={copied ? <Check /> : <ContentCopy />}
            color={copied ? 'success' : 'primary'}
            disabled={!transcript}
            size={isMobile ? 'small' : 'medium'}
          >
            {copied ? 'Kopiert!' : 'Kopieren'}
          </Button>
        </Tooltip>
        
        <Tooltip title="Als Textdatei herunterladen">
          <Button
            onClick={handleDownload}
            startIcon={<Download />}
            variant="outlined"
            disabled={!transcript}
            size={isMobile ? 'small' : 'medium'}
          >
            Download
          </Button>
        </Tooltip>

        {navigator.share && (
          <Tooltip title="Teilen">
            <Button
              onClick={handleShare}
              startIcon={<Share />}
              variant="outlined"
              disabled={!transcript}
              size={isMobile ? 'small' : 'medium'}
            >
              Teilen
            </Button>
          </Tooltip>
        )}

        <Tooltip title="Drucken">
          <Button
            onClick={handlePrint}
            startIcon={<Print />}
            variant="outlined"
            disabled={!transcript}
            size={isMobile ? 'small' : 'medium'}
          >
            Drucken
          </Button>
        </Tooltip>

        <Box sx={{ flexGrow: 1 }} />
        
        <Button 
          onClick={onClose}
          variant="contained"
          size={isMobile ? 'small' : 'medium'}
          sx={{
            background: 'linear-gradient(45deg, #667eea, #764ba2)',
            '&:hover': {
              background: 'linear-gradient(45deg, #5a6fd8, #6a42a0)',
            }
          }}
        >
          Schließen
        </Button>
      </DialogActions>
    </Dialog>
  );
}
