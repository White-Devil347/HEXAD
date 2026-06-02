import React, { useState } from 'react';
import { StudentGenerator } from '../components/StudentGenerator';
import { StudentList } from '../components/StudentList';
import { ExportPanel } from '../components/ExportPanel';
import { ConfigForm } from '../components/ConfigForm';
import { LiveSessions } from '../components/LiveSessions';
import { useStudents } from '../hooks/useStudents';

export const Dashboard = () => {
  const [studentCount, setStudentCount] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { students } = useStudents();

  const handleStudentsGenerated = (count) => {
    setStudentCount(count);
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-dark-900">
      {/* Header */}
      <div className="border-b border-slate-700 bg-gradient-to-br from-slate-800 to-dark-900 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-4xl">⬡</span>
            <div>
              <h1 className="text-3xl font-bold gradient-text">Hexad Simulator</h1>
              <p className="text-sm text-slate-400 mt-1">Independent testing tool for attendance simulation</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top Section: Generation & Export */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2">
            <StudentGenerator onStudentsGenerated={handleStudentsGenerated} />
          </div>
          <div>
            <ExportPanel studentCount={studentCount || students.length} />
          </div>
        </div>

        {/* Middle Section: Configuration */}
        <div className="mb-8">
          <ConfigForm />
        </div>

        {/* Bottom Section: Sessions & Students */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <LiveSessions />
          </div>
          <div>
            <StudentList refreshTrigger={refreshTrigger} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-700 mt-12 py-6 text-center text-sm text-slate-500">
        <p>Hexad Simulator v1.0.0 • Testing Environment Only</p>
      </div>
    </div>
  );
};
