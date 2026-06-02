import React from 'react';

export const Slider = React.forwardRef(({
  label,
  min = 0,
  max = 100,
  value,
  onChange,
  step = 1,
  className,
}, ref) => {
  return (
    <div className={className}>
      {label && (
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-medium text-slate-200">
            {label}
          </label>
          <span className="text-primary font-semibold">{value}</span>
        </div>
      )}
      <input
        ref={ref}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-primary"
        style={{
          background: `linear-gradient(to right, #a78bfa 0%, #a78bfa ${((value - min) / (max - min)) * 100}%, #334155 ${((value - min) / (max - min)) * 100}%, #334155 100%)`
        }}
      />
    </div>
  );
});

Slider.displayName = 'Slider';
