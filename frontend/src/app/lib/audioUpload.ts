import { BACKEND_PATH_PREFIX } from './auraPath';

const isProd = process.env.NODE_ENV === 'production';
const BACKEND_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? (isProd ? '' : 'http://localhost:4000')).replace(/\/$/, '');
const EXECUTOR_ID_HEADER = 'x-aura-executor-id';

export function createSessionId() {
    const globalCrypto = typeof crypto !== 'undefined' ? crypto : undefined;

    if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
        return globalCrypto.randomUUID();
    }

    const suffix = Math.random().toString(36).substring(2, 10);
    return `session-${Date.now()}-${suffix}`;
}

export async function uploadAudioChunk(sessionId: string, wavBuffer: ArrayBuffer) {
    if (!sessionId) {
        throw new Error('Missing session ID for audio upload');
    }

    const url = `${BACKEND_BASE_URL}${BACKEND_PATH_PREFIX}/sessions/${encodeURIComponent(sessionId)}/audio`;
    const formData = new FormData();
    formData.append('audio', new Blob([wavBuffer], { type: 'audio/wav' }), `${sessionId}.wav`);

    const response = await fetch(url, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const message = await response.text().catch(() => response.statusText);
        throw new Error(`Upload failed (${response.status}): ${message}`);
    }
}
