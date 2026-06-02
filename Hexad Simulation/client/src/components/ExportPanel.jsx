import React from 'react';
import { Card } from './common/Card';
import { Button } from './common/Button';
import { useStudents } from '../hooks/useStudents';

export const ExportPanel = ({ studentCount }) => {
  const { exportJSON, exportCSV } = useStudents();

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-lg font-semibold gradient-text">📊 Export Data</h3>
      </div>

      <p className="text-sm text-slate-400">
        {studentCount > 0
          ? `Export ${studentCount} student${studentCount !== 1 ? 's' : ''} for import into Hexad`
          : 'Generate students first to export'}
      </p>

      <div className="flex gap-2">
        <Button
          variant="primary"
          onClick={exportJSON}
          disabled={studentCount === 0}
          className="flex-1"
        >
          📄 JSON
        </Button>
        <Button
          variant="primary"
          onClick={exportCSV}
          disabled={studentCount === 0}
          className="flex-1"
        >
          📋 CSV
        </Button>
      </div>
    </Card>
  );
};
