import React from 'react';
import { Button } from './common/Button';

export const PresetButtons = ({ onSelectPreset }) => {
  const presets = [
    {
      name: 'Normal Class',
      icon: '📚',
      config: {
        successRate: 80,
        failureRate: 10,
        delayRange: [100, 500],
        retries: 1,
      },
    },
    {
      name: 'High Failure',
      icon: '⚠️',
      config: {
        successRate: 50,
        failureRate: 30,
        delayRange: [200, 1000],
        retries: 2,
      },
    },
    {
      name: 'Chaos Mode',
      icon: '🌪️',
      config: {
        successRate: 30,
        failureRate: 50,
        delayRange: [500, 3000],
        retries: 3,
      },
    },
    {
      name: 'Instant',
      icon: '⚡',
      config: {
        successRate: 95,
        failureRate: 2,
        delayRange: [0, 0],
        retries: 0,
      },
    },
  ];

  return (
    <div>
      <p className="text-sm font-medium text-slate-300 mb-3">Quick Presets</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {presets.map((preset) => (
          <Button
            key={preset.name}
            variant="secondary"
            onClick={() => onSelectPreset(preset.config)}
            className="flex flex-col items-center gap-1 py-3"
          >
            <span className="text-lg">{preset.icon}</span>
            <span className="text-xs text-center">{preset.name}</span>
          </Button>
        ))}
      </div>
    </div>
  );
};
