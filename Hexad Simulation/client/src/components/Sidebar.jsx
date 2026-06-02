import React from 'react';
import { motion } from 'framer-motion';
import classNames from 'classnames';

export const Sidebar = ({ activeTab, setActiveTab }) => {
  const tabs = [
    {
      id: 'sessions',
      label: '🎓 Live Sessions',
      icon: '🎓',
      description: 'View and manage sessions',
    },
    {
      id: 'generator',
      label: '✨ Student Generator',
      icon: '✨',
      description: 'Create fake students',
    },
    {
      id: 'students',
      label: '👥 Student List',
      icon: '👥',
      description: 'View all students',
    },
    {
      id: 'config',
      label: '⚙️ API Configuration',
      icon: '⚙️',
      description: 'Configure endpoints',
    },
    {
      id: 'export',
      label: '📊 Export Data',
      icon: '📊',
      description: 'Download as JSON/CSV',
    },
  ];

  return (
    <div className="w-64 bg-slate-800 border-r border-slate-700 h-screen overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">⬡</span>
          <div>
            <h1 className="text-lg font-bold gradient-text">Hexad</h1>
            <p className="text-xs text-slate-400">Simulator</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        {tabs.map((tab) => (
          <motion.button
            key={tab.id}
            whileHover={{ x: 4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveTab(tab.id)}
            className={classNames(
              'w-full text-left px-4 py-3 rounded-lg transition-all duration-200 border',
              activeTab === tab.id
                ? 'bg-gradient-primary text-white border-primary shadow-glow'
                : 'bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-600'
            )}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{tab.icon}</span>
              <div>
                <p className="font-medium text-sm">{tab.label}</p>
                <p className="text-xs text-slate-400 opacity-75">{tab.description}</p>
              </div>
            </div>
          </motion.button>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-700 text-center">
        <p className="text-xs text-slate-500">v2.0.0 • Schema Enabled</p>
      </div>
    </div>
  );
};
