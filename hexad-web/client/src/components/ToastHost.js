import React from 'react';
import { useToast } from '../context/ToastContext';

const ToastHost = () => {
    const { toasts, dismiss } = useToast();

    if (!toasts || toasts.length === 0) return null;

    return (
        <div className="toast-container" aria-live="polite" aria-relevant="additions removals">
            {toasts.map((t) => (
                <div key={t.id} className={`toast toast-${t.type}`}>
                    <div className="toast-content">
                        {t.title ? <div className="toast-title">{t.title}</div> : null}
                        <div className="toast-message">{t.message}</div>
                    </div>
                    <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                        &times;
                    </button>
                </div>
            ))}
        </div>
    );
};

export default ToastHost;
