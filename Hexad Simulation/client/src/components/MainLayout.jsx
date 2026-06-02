import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { LiveSessions } from './LiveSessions';
import { StudentGenerator } from './StudentGenerator';
import { StudentList } from './StudentList';
import { ConfigForm } from './ConfigForm';
import { ExportPanel } from './ExportPanel';
import { useStudents } from '../hooks/useStudents';

export const MainLayout = () => {
  const [activeTab, setActiveTab] = useState('sessions');
  const [studentRefreshTrigger, setStudentRefreshTrigger] = useState(0);
  const { students } = useStudents();

  const handleStudentsGenerated = (count) => {
    setStudentRefreshTrigger(prev => prev + 1);
    setActiveTab('students');
    if (typeof count === 'number') {
      window.alert(`Generated ${count} students. Opening Student List.`);
    } else {
      window.alert('Students generated. Opening Student List.');
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'sessions':
        return (
          <div className="h-full min-h-0 flex flex-col">
            <div className="mb-6">
              <h1 className="text-4xl font-bold gradient-text mb-2">🎓 Live Sessions</h1>
              <p className="text-slate-400">Fetch and manage attendance sessions from your Hexad backend</p>
            </div>
            <div className="flex-1 min-h-0">
              <LiveSessions />
            </div>
          </div>
        );

      case 'generator':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-4xl font-bold gradient-text mb-2">✨ Student Generator</h1>
              <p className="text-slate-400">Create realistic fake students for testing</p>
            </div>
            <StudentGenerator onStudentsGenerated={handleStudentsGenerated} />
          </div>
        );

      case 'students':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-4xl font-bold gradient-text mb-2">👥 Student List</h1>
              <p className="text-slate-400">View, search, and manage all generated students ({students.length} total)</p>
            </div>
            <StudentList refreshTrigger={studentRefreshTrigger} />
          </div>
        );

      case 'config':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-4xl font-bold gradient-text mb-2">⚙️ API Configuration</h1>
              <p className="text-slate-400">Configure your Hexad backend endpoints</p>
            </div>
            <ConfigForm />
          </div>
        );

      case 'export':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-4xl font-bold gradient-text mb-2">📊 Export Data</h1>
              <p className="text-slate-400">Download student data for import into your system</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ExportPanel studentCount={students.length} />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      {/* Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Top Header */}
        <div className="border-b border-slate-700 bg-gradient-to-br from-slate-800 to-dark-900 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-8 py-6">
            <p className="text-sm text-slate-400">Hexad Simulator v2.0 • Schema Enabled</p>
          </div>
        </div>

        {/* Content Area */}
        <div className={activeTab === 'sessions' ? 'px-8 py-8 h-full min-h-0 flex flex-col' : 'max-w-7xl mx-auto px-8 py-8'}>
          {renderContent()}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700 py-6 text-center text-sm text-slate-500 mt-12">
          <p>Hexad Simulator • Independent Testing Tool • Not for Production Use</p>
        </div>
      </div>
    </div>
  );
};
