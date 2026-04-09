"use client";

import { useMicVAD, utils } from '@ricky0123/vad-react';
import { Mic, MicOff, Loader2, Waves, Play, Pause, Trash2 } from 'lucide-react';
import { useState, useCallback } from 'react';

interface AudioSegment {
    id: string;
    url: string;
    timestamp: Date;
}

export default function Assistant() {
    const [segments, setSegments] = useState<AudioSegment[]>([]);

    const vad = useMicVAD({
        model: 'v5',
        baseAssetPath: '/',
        onnxWASMBasePath: '/',
        startOnLoad: false,
        onSpeechEnd: (audio) => {
            const wavBuffer = utils.encodeWAV(audio);
            const base64 = utils.arrayBufferToBase64(wavBuffer);
            const url = `data:audio/wav;base64,${base64}`;

            const newSegment: AudioSegment = {
                id: Math.random().toString(36).substring(2, 9),
                url,
                timestamp: new Date(),
            };

            setSegments((prev) => [newSegment, ...prev]);
        },
    });

    const toggleListening = () => {
        if (vad.listening) {
            vad.pause();
        } else {
            vad.start();
        }
    };

    const clearSegments = useCallback(() => {
        setSegments([]);
    }, []);

    return (
        <div className="max-w-4xl mx-auto space-y-12">
            <div className="flex flex-col items-center justify-center space-y-8 p-12 bg-white/5 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xl backdrop-blur-sm">
                <div 
                    className={`relative flex items-center justify-center w-40 h-40 rounded-full transition-all duration-700 ${
                        vad.userSpeaking 
                            ? 'bg-blue-500 shadow-[0_0_60px_rgba(59,130,246,0.6)] scale-110' 
                            : vad.listening 
                                ? 'bg-indigo-500 shadow-[0_0_30px_rgba(99,102,241,0.3)]' 
                                : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                >
                    {vad.userSpeaking ? (
                        <Waves className="w-20 h-20 text-white animate-pulse" />
                    ) : vad.listening ? (
                        <Mic className="w-20 h-20 text-white" />
                    ) : (
                        <MicOff className="w-20 h-20 text-slate-400" />
                    )}
                    
                    {vad.userSpeaking && (
                        <div className="absolute inset-0 rounded-full border-4 border-blue-400 animate-ping opacity-75"></div>
                    )}
                </div>

                <div className="text-center space-y-4">
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white">
                        {vad.userSpeaking ? 'I am listening...' : vad.listening ? 'Awaiting your voice...' : 'Assistant is sleeping'}
                    </h2>
                    
                    <button
                        onClick={toggleListening}
                        className={`px-8 py-4 rounded-full font-bold text-lg text-white shadow-lg transition-all active:scale-95 ${
                            vad.listening ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/30'
                        }`}
                    >
                        {vad.listening ? 'Stop Assistant' : 'Wake Assistant'}
                    </button>
                </div>
            </div>

            {segments.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">Captured Voice Notes</h3>
                        <button 
                            onClick={clearSegments}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                            Clear All
                        </button>
                    </div>
                    
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {segments.map((seg) => (
                            <div key={seg.id} className="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow border border-slate-100 dark:border-slate-700 flex flex-col gap-3">
                                <span className="text-xs text-slate-400 font-medium">
                                    {seg.timestamp.toLocaleTimeString()}
                                </span>
                                <audio controls src={seg.url} className="w-full h-10" />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
