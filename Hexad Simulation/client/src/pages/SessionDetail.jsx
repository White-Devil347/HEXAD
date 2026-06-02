import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { SimulationPanel } from '../components/SimulationPanel';
import { SimulationExecution } from '../components/SimulationExecution';
import { useSimulation } from '../hooks/useSimulation';
import { api } from '../utils/api';
import { getSavedSessionCode, saveSessionCodeMapping, toCompactSessionId } from '../utils/sessionCode';

export const SessionDetail = () => {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const { status, logs, completed, total, succeeded, failed, retried, job, reset, executeSimulation, loading } = useSimulation();
  const [activeJobId, setActiveJobId] = useState(null);
  const [sessionCode, setSessionCode] = useState(() => getSavedSessionCode(sessionId));
  const compactSessionId = toCompactSessionId(sessionId);

  const handleSimulationStart = (jobId) => {
    setActiveJobId(jobId);
  };

  const handleClose = () => {
    reset();
    setActiveJobId(null);
  };

  useEffect(() => {
    if (sessionCode) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await api.get('/sessions');
        const data = response.data;
        const list = Array.isArray(data?.data) ? data.data : [];
        const match = list.find((s) => s?.sessionId === sessionId);
        const code = match?.sessionCode;
        if (!cancelled && typeof code === 'string' && code) {
          setSessionCode(code);
          saveSessionCodeMapping(sessionId, code);
        }
      } catch {
        // ignore (fallback remains blank)
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, sessionCode]);

  return (
    <div className="min-h-screen bg-dark-900">
      {/* Header */}
      <div className="border-b border-slate-700 bg-gradient-to-br from-slate-800 to-dark-900 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate('/')}
              className="!px-3 !py-2"
            >
              ← Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold gradient-text">Session Code: {sessionCode || '—'}</h1>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-sm text-slate-400" title={sessionId}>
                  ID: <span className="font-mono text-slate-300">{compactSessionId}</span>
                </p>
              </div>
              <p className="text-sm text-slate-400 mt-2">Configure and run attendance simulation</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Simulation Controls */}
          <div className="lg:col-span-1">
            <SimulationPanel
              sessionId={sessionId}
              onSimulationStart={handleSimulationStart}
              executeSimulation={executeSimulation}
              status={status}
              loading={loading}
            />
          </div>

          {/* Right: Execution & Logs */}
          <div className="lg:col-span-2">
            {activeJobId ? (
              <SimulationExecution
                jobData={{
                  status,
                  logs,
                  completed,
                  total,
                  succeeded,
                  failed,
                  retried,
                  error: job?.error || null,
                }}
                onClose={handleClose}
              />
            ) : (
              <Card className="p-8 text-center">
                <p className="text-4xl mb-3">🎬</p>
                <p className="text-slate-400">
                  Configure simulation parameters and click "Send Simulation" to begin
                </p>
                <div className="mt-6 space-y-2 text-sm text-slate-500">
                  <p>💡 Use presets for quick scenarios</p>
                  <p>⚙️ Fine-tune success/failure rates</p>
                  <p>🚀 Run simulations with realistic delays</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
