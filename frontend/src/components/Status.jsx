import { useState, useEffect } from 'react';
import api from '../services/api';

const STATE_CONFIG = {
  checking: {
    label: 'Checking connection…',
    dot: 'bg-yellow-400 animate-pulse',
  },
  connected: {
    label: 'Backend Connected',
    dot: 'bg-green-500',
  },
  error: {
    label: 'Backend Offline',
    dot: 'bg-red-500',
  },
};

export default function Status() {
  const [state, setState] = useState('checking');

  useEffect(() => {
    api
      .get('/health')
      .then(() => setState('connected'))
      .catch(() => setState('error'));
  }, []);

  const { label, dot } = STATE_CONFIG[state];

  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-2.5 rounded-full border border-gray-200 bg-white px-4 py-2 shadow-sm text-sm font-medium text-gray-700"
    >
      <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${dot}`} aria-hidden="true" />
      {label}
    </div>
  );
}
