import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
  Divider,
  LinearProgress,
  Chip
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  PersonAdd,
  Person,
  Lock,
  Close,
  Check
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = `https://${import.meta.env.VITE_WHISPER_API_DOMAIN}`;

export default function RegisterDialog({ open, onClose, onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [registrationKey, setRegistrationKey] = useState(''); 
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Password strength validation
  const getPasswordStrength = (pwd) => {
    let score = 0;
    const checks = {
      length: pwd.length >= 8,
      lowercase: /[a-z]/.test(pwd),
      uppercase: /[A-Z]/.test(pwd),
      numbers: /\d/.test(pwd),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(pwd)
    };

    score = Object.values(checks).filter(Boolean).length;
    
    return {
      score,
      checks,
      strength: score < 2 ? 'weak' : score < 4 ? 'medium' : 'strong'
    };
  };

  const passwordStrength = getPasswordStrength(password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!username || !password || !confirmPassword || !registrationKey) {
      setError('Bitte füllen Sie alle Felder aus');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwörter stimmen nicht überein');
      return;
    }

    if (passwordStrength.score < 3) {
      setError('Passwort ist zu schwach. Mindestens 3 Kriterien erforderlich.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // JSON statt FormData verwenden
      const response = await axios.post(`${API_BASE}/register`, {
        username,
        password,
        reg_key: registrationKey
      });

      onSuccess({
        username,
        apiKey: response.data.api_key
      });

      // Reset form
      setUsername('');
      setPassword('');
      setConfirmPassword('');
      setRegistrationKey('');
    } catch (err) {
      setError(
        err.response?.data?.detail || 
        'Registrierung fehlgeschlagen. Benutzername möglicherweise bereits vergeben.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setRegistrationKey('');
    setError('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    onClose();
  };

  const getStrengthColor = () => {
    switch (passwordStrength.strength) {
      case 'weak': return 'error';
      case 'medium': return 'warning';
      case 'strong': return 'success';
      default: return 'grey';
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          boxShadow: '0 20px 40px rgba(0,0,0,0.1)'
        }
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={1}>
            <PersonAdd color="primary" />
            <Typography variant="h5" component="div" sx={{ fontWeight: 600 }}>
              Registrieren
            </Typography>
          </Box>
          <IconButton onClick={handleClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ pt: 3 }}>
        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="Benutzername"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            margin="normal"
            variant="outlined"
            disabled={loading}
            helperText="Mindestens 3 Zeichen"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Person color="action" />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            label="Registrierungsschlüssel"
            type="password"
            value={registrationKey}
            onChange={(e) => setRegistrationKey(e.target.value)}
            margin="normal"
            variant="outlined"
            disabled={loading}
            helperText="Von Administrator erhaltener Schlüssel"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Lock color="action" />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            label="Passwort"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            margin="normal"
            variant="outlined"
            disabled={loading}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Lock color="action" />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                    size="small"
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{ mb: 1 }}
          />

          {/* Password Strength Indicator */}
          {password && (
            <Box sx={{ mb: 2 }}>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <Typography variant="caption">
                  Passwort-Stärke:
                </Typography>
                <Chip 
                  label={passwordStrength.strength === 'weak' ? 'Schwach' : 
                        passwordStrength.strength === 'medium' ? 'Mittel' : 'Stark'}
                  color={getStrengthColor()}
                  size="small"
                />
              </Box>
              
              <LinearProgress 
                variant="determinate" 
                value={(passwordStrength.score / 5) * 100}
                color={getStrengthColor()}
                sx={{ height: 6, borderRadius: 3, mb: 1 }}
              />

              <Box display="flex" flexWrap="wrap" gap={0.5}>
                {Object.entries({
                  length: '8+ Zeichen',
                  lowercase: 'Kleinbuchstaben',
                  uppercase: 'Großbuchstaben', 
                  numbers: 'Zahlen',
                  special: 'Sonderzeichen'
                }).map(([key, label]) => (
                  <Chip
                    key={key}
                    label={label}
                    size="small"
                    variant={passwordStrength.checks[key] ? 'filled' : 'outlined'}
                    color={passwordStrength.checks[key] ? 'success' : 'default'}
                    icon={passwordStrength.checks[key] ? <Check /> : undefined}
                    sx={{ fontSize: '0.7rem', height: 24 }}
                  />
                ))}
              </Box>
            </Box>
          )}

          <TextField
            fullWidth
            label="Passwort bestätigen"
            type={showConfirmPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            margin="normal"
            variant="outlined"
            disabled={loading}
            error={confirmPassword && password !== confirmPassword}
            helperText={
              confirmPassword && password !== confirmPassword 
                ? 'Passwörter stimmen nicht überein' 
                : ''
            }
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Lock color="action" />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    edge="end"
                    size="small"
                  >
                    {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{ mb: 2 }}
          />

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 0 }}>
        <Button 
          onClick={handleClose} 
          disabled={loading}
          sx={{ mr: 1 }}
        >
          Abbrechen
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={
            loading || 
            !username || 
            !password || 
            !confirmPassword ||
            password !== confirmPassword ||
            passwordStrength.score < 3
          }
          startIcon={loading ? <CircularProgress size={20} /> : <PersonAdd />}
          sx={{
            px: 3,
            background: 'linear-gradient(45deg, #667eea, #764ba2)',
            '&:hover': {
              background: 'linear-gradient(45deg, #5a6fd8, #6a42a0)',
            }
          }}
        >
          {loading ? 'Registrieren...' : 'Registrieren'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
