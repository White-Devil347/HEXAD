export function toSessionCode(sessionId, length = 8) {
  if (!sessionId || typeof sessionId !== 'string') return '';
  const compact = sessionId.replace(/-/g, '');
  return compact.slice(0, length).toUpperCase();
}

export function toCompactSessionId(sessionId, head = 8, tail = 6) {
  if (!sessionId || typeof sessionId !== 'string') return '';
  if (sessionId.length <= head + tail + 3) return sessionId;
  return `${sessionId.slice(0, head)}…${sessionId.slice(-tail)}`;
}

const MAP_KEY = 'hexadSessionCodeMap';

export function saveSessionCodeMapping(sessionId, sessionCode) {
  if (!sessionId || typeof sessionId !== 'string') return;
  if (!sessionCode || typeof sessionCode !== 'string') return;
  try {
    const raw = sessionStorage.getItem(MAP_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const next = { ...(map || {}), [sessionId]: sessionCode };
    sessionStorage.setItem(MAP_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function getSavedSessionCode(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return '';
  try {
    const raw = sessionStorage.getItem(MAP_KEY);
    const map = raw ? JSON.parse(raw) : null;
    const value = map?.[sessionId];
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}
