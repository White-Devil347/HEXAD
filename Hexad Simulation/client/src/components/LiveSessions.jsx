import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from './common/Card';
import { Button } from './common/Button';
import { SkeletonCard } from './common/Loader';
import { useSessions } from '../hooks/useSessions';
import { saveSessionCodeMapping, toCompactSessionId } from '../utils/sessionCode';

export const LiveSessions = () => {
  const navigate = useNavigate();
  const [sessionError, setSessionError] = useState(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const { sessions, loading, error, fetchSessions } = useSessions();
  const didAutoFetchRef = useRef(false);

  const cooldownMsLeft = Math.max(0, cooldownUntil - Date.now());
  const cooldownSecondsLeft = Math.ceil(cooldownMsLeft / 1000);

  const handleFetchSessions = async () => {
    try {
      setSessionError(null);
      await fetchSessions();
    } catch (err) {
      const status = err?.response?.status;
      if (status === 429) {
        const retryAfterHeader = err?.response?.headers?.['retry-after'];
        const retryAfterSeconds = Number(retryAfterHeader);
        const seconds = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : 15;
        setCooldownUntil(Date.now() + seconds * 1000);
        setSessionError(`Rate limited (429). Please retry in ~${seconds}s.`);
      } else {
        setSessionError(err?.response?.data?.error || err.message || 'Failed to fetch sessions');
      }
    }
  };

  useEffect(() => {
    if (didAutoFetchRef.current) return;
    didAutoFetchRef.current = true;
    handleFetchSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenSession = (session) => {
    if (session?.sessionId && session?.sessionCode) {
      saveSessionCodeMapping(session.sessionId, session.sessionCode);
    }
    navigate(`/session/${session.sessionId}`);
  };

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Top Bar - Fetch Button */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-sm text-slate-400">Active sessions</h3>
        </div>
        <Button
          variant="primary"
          onClick={handleFetchSessions}
          loading={loading}
          disabled={loading || cooldownMsLeft > 0}
          className="!px-6"
        >
          {cooldownMsLeft > 0
            ? `⏳ Wait ${cooldownSecondsLeft}s`
            : sessions.length > 0
              ? '🔄 Refresh'
              : '📡 Fetch Active Sessions'}
        </Button>
      </div>

      {/* Error Messages */}
      {error && (
        <div className="p-3 bg-error bg-opacity-10 border border-error rounded-lg text-error text-sm mb-4">
          {error}
        </div>
      )}

      {sessionError && (
        <div className="p-3 bg-error bg-opacity-10 border border-error rounded-lg text-error text-sm mb-4">
          {sessionError}
        </div>
      )}

      {/* Main Content - Fill Width */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : sessions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sessions.map((session) => (
              <Card
                key={session.sessionId}
                hover
                className="p-4 flex flex-col"
              >
                <div className="flex justify-between items-start gap-2 mb-3 flex-1">
                  <div className="flex-1">
                    <p className="font-semibold text-slate-100 line-clamp-2">{session.subject}</p>
                    <p className="text-xs text-slate-400 mt-1">{session.className}</p>
                    <p className="text-xs text-slate-400 mt-2">
                      Code:{' '}
                      <span className="font-mono text-slate-300 tracking-widest">
                        {session.sessionCode || '—'}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 font-mono mt-1" title={session.sessionId}>
                      {toCompactSessionId(session.sessionId)}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded whitespace-nowrap ${
                      session.status === 'active'
                        ? 'bg-success bg-opacity-20 text-success'
                        : 'bg-slate-600 text-slate-300'
                    }`}
                  >
                    {session.status}
                  </span>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleOpenSession(session)}
                  className="w-full"
                >
                  Open Session →
                </Button>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <p className="text-4xl mb-4">🎓</p>
              <p className="text-slate-400">No active sessions</p>
              <p className="text-sm text-slate-500 mt-2">If this is unexpected, verify your collegeId and backend status.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
