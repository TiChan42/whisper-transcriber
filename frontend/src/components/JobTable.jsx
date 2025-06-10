import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  LinearProgress
} from '@mui/material';
import axios from 'axios';

const API_BASE = 'https://whisper-api.shape-z.de';

export default function JobTable({ jobs, onRefresh, onRowClick }) {
  const handleDelete = async id => {
    try {
      await axios.delete(`${API_BASE}/jobs/${id}`);
      onRefresh();
    } catch (err) {
      console.error('Löschen fehlgeschlagen:', err);
    }
  };

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Job ID</TableCell>
            <TableCell>Alias</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Dauer (s)</TableCell>
            <TableCell>Aktionen</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {jobs.map(job => (
            <TableRow
              key={job.id}
              hover
              onClick={() => onRowClick(job.id)}
              sx={{ cursor: 'pointer' }}
            >
              <TableCell>{job.id}</TableCell>
              <TableCell>{job.alias}</TableCell>
              <TableCell>
                {job.progress < 1 ? (
                  <LinearProgress variant="determinate" value={job.progress * 100} />
                ) : (
                  job.status
                )}
              </TableCell>
              <TableCell>{job.duration?.toFixed(1) || '-'}</TableCell>
              <TableCell>
                <Button
                  size="small"
                  onClick={e => { e.stopPropagation(); window.open(`${API_BASE}/jobs/${job.id}/download`, '_blank'); }}
                >
                  Download
                </Button>
                <Button
                  size="small"
                  color="error"
                  onClick={e => { e.stopPropagation(); handleDelete(job.id); }}
                >
                  Löschen
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
