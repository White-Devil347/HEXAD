import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

export const useToast = () => {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return ctx;
};

const DEFAULT_DURATION_MS = 3500;

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);
    const timersRef = useRef({});

    const dismiss = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        const timer = timersRef.current[id];
        if (timer) {
            clearTimeout(timer);
            delete timersRef.current[id];
        }
    }, []);

    const show = useCallback((message, options = {}) => {
        const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const type = options.type || 'info';
        const durationMs = Number.isFinite(options.durationMs) ? options.durationMs : DEFAULT_DURATION_MS;

        setToasts((prev) => {
            const next = [...prev, { id, type, message: String(message || ''), title: options.title || '' }];
            // Keep stack small to avoid layout issues.
            return next.slice(-4);
        });

        if (durationMs > 0) {
            timersRef.current[id] = setTimeout(() => dismiss(id), durationMs);
        }

        return id;
    }, [dismiss]);

    const api = useMemo(() => ({
        toasts,
        show,
        dismiss,
        success: (msg, opts) => show(msg, { ...opts, type: 'success' }),
        error: (msg, opts) => show(msg, { ...opts, type: 'error' }),
        info: (msg, opts) => show(msg, { ...opts, type: 'info' })
    }), [toasts, show, dismiss]);

    return (
        <ToastContext.Provider value={api}>
            {children}
        </ToastContext.Provider>
    );
};
