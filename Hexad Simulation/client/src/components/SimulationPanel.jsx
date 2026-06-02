import React, { useState } from 'react';
import { Card } from './common/Card';
import { Button } from './common/Button';
import { Input } from './common/Input';
import { Slider } from './common/Slider';
import { useStudents } from '../hooks/useStudents';

export const SimulationPanel = ({ sessionId, onSimulationStart, executeSimulation, status, loading }) => {
  const { students, syncEnrollment } = useStudents();

  const [delayMin, setDelayMin] = useState(100);
  const [delayMax, setDelayMax] = useState(500);
  const [retries, setRetries] = useState(1);
  const [mode, setMode] = useState('realistic'); // 'instant' or 'realistic'
  const [overrideStudentIds, setOverrideStudentIds] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  const parsedOverrideIds = overrideStudentIds
    .split(/[\s,]+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const defaultMappedIds = students
    .map((s) => s.hexadStudentId || s.studentId)
    .filter(Boolean);

  const mappedCount = students.filter((s) => !!s.hexadStudentId).length;

  const handleExecute = async () => {
    const idsToUse = parsedOverrideIds.length > 0
      ? parsedOverrideIds
      : defaultMappedIds;

    if (idsToUse.length === 0) {
      alert('No student IDs available. Generate students or paste enrolled student IDs.');
      return;
    }

    const delayRange = mode === 'instant' ? [0, 0] : [delayMin, delayMax];

    try {
      const jobId = await executeSimulation({
        sessionId,
        delayRange,
        retries,
        studentIds: idsToUse,
      });
      onSimulationStart?.(jobId);
    } catch (err) {
      console.error('Simulation error:', err);
    }
  };

  const handleMarkAllPresent = () => {
    setDelayMin(0);
    setDelayMax(0);
    setRetries(0);
    setMode('instant');
  };

  const handleAutoSync = async () => {
    try {
      setSyncing(true);
      setSyncMessage('');
      const result = await syncEnrollment(sessionId);
      setSyncMessage(`Synced: extracted ${result.extracted}, matched ${result.matched}, mapped ${result.mappedStudents}/${result.totalStudents}`);
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Auto sync failed';
      setSyncMessage(`Sync failed: ${msg}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold gradient-text">🎬 Simulation Controls</h2>
        {students.length > 0 && (
          <span className="text-sm text-slate-400">
            ({students.length} students)
          </span>
        )}
      </div>

      <div className="space-y-4 pt-4 border-t border-slate-600">
        <div className="flex gap-2">
          <Button
            variant={mode === 'instant' ? 'primary' : 'secondary'}
            onClick={() => setMode('instant')}
            size="sm"
            className="flex-1"
          >
            ⚡ Instant
          </Button>
          <Button
            variant={mode === 'realistic' ? 'primary' : 'secondary'}
            onClick={() => setMode('realistic')}
            size="sm"
            className="flex-1"
          >
            🌊 Realistic
          </Button>
        </div>

        {mode === 'realistic' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Delay Min (ms)"
                type="number"
                value={delayMin}
                onChange={(e) => setDelayMin(Math.max(0, parseInt(e.target.value) || 0))}
                min="0"
                max="5000"
              />
              <Input
                label="Delay Max (ms)"
                type="number"
                value={delayMax}
                onChange={(e) => setDelayMax(Math.max(delayMin, parseInt(e.target.value) || 0))}
                min={delayMin}
                max="5000"
              />
            </div>

            <Slider
              label="Retry Attempts"
              min={0}
              max={5}
              value={retries}
              onChange={setRetries}
            />
          </>
        )}

        <div className="pt-2">
          <label className="block text-sm font-medium text-slate-200 mb-2">
            Override Student IDs (optional)
          </label>
          <textarea
            className="input-base w-full min-h-[96px] font-mono text-xs"
            placeholder="Paste enrolled Hexad student IDs here (space/comma/newline separated)"
            value={overrideStudentIds}
            onChange={(e) => setOverrideStudentIds(e.target.value)}
          />
          <p className="text-xs text-slate-500 mt-2">
            {parsedOverrideIds.length > 0
              ? `Using ${parsedOverrideIds.length} pasted student IDs (ignores local generated students).`
              : `Leave blank to use auto IDs (${mappedCount}/${students.length} mapped to official Hexad IDs).`}
          </p>
        </div>
      </div>

      <div className="space-y-2 pt-4 border-t border-slate-600">
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={handleMarkAllPresent}
            size="sm"
            className="flex-1"
          >
            ✓ Mark All Present
          </Button>
          <Button
            variant="secondary"
            onClick={handleAutoSync}
            size="sm"
            loading={syncing}
            className="flex-1"
          >
            🔄 Auto Sync Enrolled
          </Button>
        </div>

        {syncMessage && (
          <p className="text-xs text-slate-400 text-center p-2 bg-slate-700 rounded">
            {syncMessage}
          </p>
        )}

        <Button
          variant="primary"
          onClick={handleExecute}
          loading={loading || status === 'running'}
          disabled={students.length === 0 && parsedOverrideIds.length === 0}
          className="w-full py-3 text-lg"
        >
          🚀 Send Simulation
        </Button>
      </div>

      {students.length === 0 && parsedOverrideIds.length === 0 && (
        <p className="text-xs text-slate-400 text-center p-3 bg-slate-700 rounded">
          Generate students or paste enrolled student IDs to run simulations
        </p>
      )}
    </Card>
  );
};
