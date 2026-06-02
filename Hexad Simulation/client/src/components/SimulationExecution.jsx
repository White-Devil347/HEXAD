import React, { useEffect, useRef } from 'react';
import { Card } from './common/Card';
import { Button } from './common/Button';
import { Loader } from './common/Loader';

export const SimulationExecution = ({ jobData, onClose }) => {
  const logsEndRef = useRef(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [jobData?.logs]);

  if (!jobData) return null;

  const isRunning = jobData.status === 'running' || jobData.status === 'queued';
  const isCompleted = jobData.status === 'completed';
  const isErrored = jobData.status === 'error';
  const progressPercent = jobData.total > 0 ? (jobData.completed / jobData.total) * 100 : 0;
  const hasFailures = (jobData.failed ?? 0) > 0;
  const allFailed = (jobData.total ?? 0) > 0 && (jobData.succeeded ?? 0) === 0 && hasFailures;

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold gradient-text">
          {isRunning ? '⏳ Simulation Running' : isCompleted ? '✓ Simulation Complete' : '⚠️ Simulation Stopped'}
        </h2>
        {!isRunning && (
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-slate-400">
          <span>Progress</span>
          <span>{jobData.completed} / {jobData.total}</span>
        </div>
        <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden border border-slate-600">
          <div
            className="h-full bg-gradient-primary transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-700 p-3 rounded-lg border border-slate-600">
          <p className="text-xs text-slate-400">Total</p>
          <p className="text-2xl font-bold text-slate-100">{jobData.total}</p>
        </div>
        <div className="bg-slate-700 p-3 rounded-lg border border-success border-opacity-50">
          <p className="text-xs text-slate-400">Success</p>
          <p className="text-2xl font-bold text-success">{jobData.succeeded}</p>
        </div>
        <div className="bg-slate-700 p-3 rounded-lg border border-error border-opacity-50">
          <p className="text-xs text-slate-400">Failed</p>
          <p className="text-2xl font-bold text-error">{jobData.failed}</p>
        </div>
        <div className="bg-slate-700 p-3 rounded-lg border border-warning border-opacity-50">
          <p className="text-xs text-slate-400">Retried</p>
          <p className="text-2xl font-bold text-warning">{jobData.retried}</p>
        </div>
      </div>

      {isErrored && jobData.error && (
        <div className="p-4 bg-error bg-opacity-10 border border-error rounded-lg">
          <p className="text-error font-medium">✗ Simulation stopped</p>
          <p className="text-sm text-slate-400 mt-1">{jobData.error}</p>
        </div>
      )}

      {/* Logs */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-300">Live Logs</p>
        <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 h-64 overflow-y-auto font-mono text-xs space-y-1">
          {jobData.logs && jobData.logs.length > 0 ? (
            <>
              {jobData.logs.slice(-30).map((log, idx) => (
                <div
                  key={idx}
                  className={`flex gap-2 ${
                    log.status === 'success'
                      ? 'text-success'
                      : log.status === 'failed'
                      ? 'text-error'
                      : 'text-warning'
                  }`}
                >
                  <span className="min-w-[20px]">
                    {log.status === 'success' ? '✓' : log.status === 'failed' ? '✗' : '↻'}
                  </span>
                  <span className="text-slate-400">{log.studentId}</span>
                  <span className="flex-1 text-slate-500">{log.name}</span>
                  {log.fieldCount !== undefined && (
                    <span className="text-slate-500">({log.fieldCount}f)</span>
                  )}
                  {log.validationError && (
                    <span className="text-error text-xs" title={log.validationError}>
                      ⚠ {log.validationError.length > 60 ? `${log.validationError.substring(0, 60)}...` : log.validationError}
                    </span>
                  )}
                </div>
              ))}
              <div ref={logsEndRef} />
            </>
          ) : (
            <p className="text-slate-500">Waiting for logs...</p>
          )}
        </div>
        <p className="text-xs text-slate-500">Field count format: (5f) = 5 fields sent</p>
      </div>

      {isRunning && (
        <div className="flex justify-center py-4">
          <Loader text={`Processing ${jobData.completed} / ${jobData.total}...`} />
        </div>
      )}

      {isCompleted && (
        <div
          className={
            allFailed
              ? 'p-4 bg-error bg-opacity-10 border border-error rounded-lg'
              : hasFailures
                ? 'p-4 bg-warning bg-opacity-10 border border-warning rounded-lg'
                : 'p-4 bg-success bg-opacity-10 border border-success rounded-lg'
          }
        >
          <p
            className={
              allFailed
                ? 'text-error font-medium'
                : hasFailures
                  ? 'text-warning font-medium'
                  : 'text-success font-medium'
            }
          >
            {allFailed
              ? '✗ Simulation completed with failures'
              : hasFailures
                ? '⚠️ Simulation completed with some failures'
                : '✓ Simulation completed successfully'}
          </p>
          <p className="text-sm text-slate-400 mt-1">
            {jobData.succeeded} succeeded, {jobData.failed} failed, {jobData.retried} retried
          </p>
        </div>
      )}
    </Card>
  );
};
