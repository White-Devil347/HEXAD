import React, { useState, useCallback } from 'react';
import { Card } from './common/Card';
import { Button } from './common/Button';
import { Input } from './common/Input';
import { useStudents } from '../hooks/useStudents';

export const StudentGenerator = ({ onStudentsGenerated }) => {
  const [count, setCount] = useState(10);
  const [startingNumber, setStartingNumber] = useState(1);
  const [domain, setDomain] = useState('hexad.test');
  const { generateStudents, loading, error } = useStudents();

  const prefix = 'STD-';

  const startNum = Number.isFinite(startingNumber) ? startingNumber : parseInt(startingNumber, 10);
  const endNum = (Number.isFinite(startNum) ? startNum : 0) + count - 1;
  const startingNumberError =
    !startNum || startNum < 1 || startNum > 999
      ? 'Starting number must be between 1 and 999'
      : null;
  const rangeError = endNum > 999 ? 'Range exceeds STD-999 (3 digits). Reduce count or starting number.' : null;

  const canGenerate = !loading && !startingNumberError && !rangeError;

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    try {
      const result = await generateStudents(count, prefix, startingNumber, domain);
      onStudentsGenerated?.(result.count, result.students);
    } catch (err) {
      console.error('Generation error:', err);
      const msg = err?.response?.data?.error || '';
      if (err?.response?.status === 400 && msg.toLowerCase().includes('duplicate')) {
        onStudentsGenerated?.(0);
      }
    }
  }, [canGenerate, count, prefix, startingNumber, domain, generateStudents, onStudentsGenerated]);

  const handleRandomize = useCallback(async () => {
    const randomPrefix = 'STD-';
    const randomStart = Math.floor(Math.random() * 900) + 1; // 1-900
    const randomCount = Math.min(Math.floor(Math.random() * 90) + 10, 1000 - randomStart); // keep <= 999
    const domains = ['hexad.test', 'school.local', 'academy.dev'];
    const randomDomain = domains[Math.floor(Math.random() * domains.length)];

    setCount(randomCount);
    setStartingNumber(randomStart);
    setDomain(randomDomain);

    try {
      const result = await generateStudents(randomCount, randomPrefix, randomStart, randomDomain);
      onStudentsGenerated?.(result.count, result.students);
    } catch (err) {
      console.error('Generation error:', err);
      const msg = err?.response?.data?.error || '';
      if (err?.response?.status === 400 && msg.toLowerCase().includes('duplicate')) {
        onStudentsGenerated?.(0);
      }
    }
  }, [generateStudents, onStudentsGenerated]);

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-xl font-semibold gradient-text">✨ Student Generator</h2>
      </div>

      {error && (
        <div className="p-3 bg-error bg-opacity-10 border border-error rounded-lg text-error text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Number of Students"
          type="number"
          value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(10000, parseInt(e.target.value) || 1)))}
          min="1"
          max="10000"
          containerClassName="col-span-1"
        />

        <Input
          label="Student ID Prefix"
          value={prefix}
          disabled
          containerClassName="col-span-1"
        />

        <Input
          label="Starting Number"
          type="number"
          value={startingNumber}
          onChange={(e) => setStartingNumber(Math.max(1, parseInt(e.target.value) || 1))}
          min="1"
          max="999"
          error={startingNumberError || rangeError}
          containerClassName="col-span-1"
        />

        <Input
          label="Domain"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="e.g., hexad.test"
          containerClassName="col-span-1"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          variant="primary"
          onClick={handleGenerate}
          loading={loading}
          disabled={!canGenerate}
          className="flex-1"
        >
          Generate Students
        </Button>
        <Button
          variant="secondary"
          onClick={handleRandomize}
          disabled={loading}
        >
          🎲 Randomize
        </Button>
      </div>

      <p className="text-xs text-slate-400 text-center pt-2">
        Will generate {count} students with IDs: {prefix}
        {String(startingNumber).padStart(3, '0')} to {prefix}
        {String(startingNumber + count - 1).padStart(3, '0')}
      </p>
    </Card>
  );
};
