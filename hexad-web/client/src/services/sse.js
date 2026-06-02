const getAuthHeader = () => {
    const token = localStorage.getItem('idToken') || localStorage.getItem('accessToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const decodeEventBlock = (block) => {
    const lines = block.split('\n');
    let event = 'message';
    const dataLines = [];

    for (const line of lines) {
        const trimmed = String(line || '').trimEnd();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed.startsWith('event:')) {
            event = trimmed.slice('event:'.length).trim() || event;
            continue;
        }
        if (trimmed.startsWith('data:')) {
            dataLines.push(trimmed.slice('data:'.length).trimStart());
        }
    }

    const dataRaw = dataLines.join('\n');
    let data = dataRaw;
    try {
        data = dataRaw ? JSON.parse(dataRaw) : null;
    } catch (_) {
        // Leave as string if not JSON.
    }

    return { event, data };
};

export const subscribeSse = async ({ url, onEvent, onError, signal }) => {
    const controller = new AbortController();
    const combinedSignal = signal;

    const abort = () => {
        try { controller.abort(); } catch (_) { /* ignore */ }
    };

    if (combinedSignal) {
        if (combinedSignal.aborted) abort();
        combinedSignal.addEventListener('abort', abort, { once: true });
    }

    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'text/event-stream',
                ...getAuthHeader()
            },
            signal: controller.signal
        });

        if (!res.ok || !res.body) {
            const err = new Error(`SSE request failed (${res.status})`);
            err.status = res.status;
            throw err;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Events are separated by a blank line.
            let idx;
            while ((idx = buffer.indexOf('\n\n')) !== -1) {
                const rawBlock = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 2);
                const parsed = decodeEventBlock(rawBlock);
                if (parsed && onEvent) onEvent(parsed);
            }
        }
    } catch (e) {
        if (controller.signal.aborted) return { close: abort };
        if (onError) onError(e);
    }

    return { close: abort };
};
