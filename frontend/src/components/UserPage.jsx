import React from 'react';
import { Box, Typography, TextField } from '@mui/material';

export default function UserPage({ username, apiKey }) {
  return (
    <Box display="flex" flexDirection="column" gap={1}>
      <Typography variant="h6">Deine Daten</Typography>
      <TextField
        label="Benutzername"
        value={username}
        InputProps={{ readOnly: true }}
      />
      <TextField
        label="API-Key"
        value={apiKey}
        InputProps={{ readOnly: true }}
      />
    </Box>
  );
}
