"use client";

import type { MouseEvent } from 'react';

export interface ContextOption {
    id: string;
    label: string;
    description?: string;
}

interface ContextModeSelectorProps {
    options: ContextOption[];
    selectedId: string;
    onSelect: (id: string) => void;
}

export default function ContextModeSelector({ options, selectedId, onSelect }: ContextModeSelectorProps) {
    const handleSelect = (id: string) => (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        onSelect(id);
    };

    return (
        <div className="w-full max-w-xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-widest text-slate-400">Conversation context</p>
            </div>
            <div
                role="group"
                aria-label="Select assistant context"
                className="flex w-full flex-col gap-2 sm:flex-row sm:gap-3"
            >
                {options.map((option) => {
                    const isSelected = option.id === selectedId;

                    return (
                        <button
                            key={option.id}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={handleSelect(option.id)}
                            className={`w-full sm:flex-1 rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${isSelected
                                ? 'bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-900/30'
                                : 'bg-white/10 hover:bg-slate-100 text-slate-700 border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                                }`}
                        >
                            <span className="inline-flex items-center justify-center gap-2">
                                {option.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
