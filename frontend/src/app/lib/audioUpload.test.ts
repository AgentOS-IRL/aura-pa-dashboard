import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionId, uploadAudioChunk } from './audioUpload';

afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
});

describe('uploadAudioChunk', () => {
    it('posts the WAV chunk as multipart/form-data', async () => {
        const fetchMock = vi.fn(() =>
            Promise.resolve({
                ok: true,
                status: 200,
                text: () => Promise.resolve(''),
            }),
        );

        vi.stubGlobal('fetch', fetchMock);

        const buffer = new Uint8Array([1, 2, 3]).buffer;
        await uploadAudioChunk('session-test', buffer);

        expect(fetchMock).toHaveBeenCalledOnce();
        const [calledUrl, options] = fetchMock.mock.calls[0];
        expect(calledUrl).toBe('http://localhost:4000/aura/sessions/session-test/audio');
        expect(options).toBeDefined();
        expect(options?.method).toBe('POST');

        const formData = options?.body as FormData;
        expect(formData).toBeInstanceOf(FormData);
        const audioField = formData.get('audio');
        expect(audioField).toBeInstanceOf(Blob);
    });

    it('throws when the backend responds with a failure', async () => {
        const fetchMock = vi.fn(() =>
            Promise.resolve({
                ok: false,
                status: 500,
                statusText: 'Boom',
                text: () => Promise.resolve('Something went wrong'),
            }),
        );

        vi.stubGlobal('fetch', fetchMock);

        await expect(uploadAudioChunk('session-test', new ArrayBuffer(1))).rejects.toThrow('Upload failed (500)');
    });
});

describe('createSessionId', () => {
    it('falls back when crypto.randomUUID is unavailable', () => {
        vi.stubGlobal('crypto', undefined as unknown as Crypto);
        const sessionId = createSessionId();
        expect(sessionId.startsWith('session-')).toBe(true);
    });
});
