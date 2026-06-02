import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './styles/globals.css';
import './styles/animations.css';
import { MainLayout } from './components/MainLayout';
import { SessionDetail } from './pages/SessionDetail';
import { StudentsProvider } from './hooks/useStudents';
import { ErrorBoundary } from './components/common/ErrorBoundary';

function App() {
  return (
    <Router>
      <StudentsProvider>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<MainLayout />} />
            <Route path="/session/:sessionId" element={<SessionDetail />} />
            <Route path="*" element={<MainLayout />} />
          </Routes>
        </ErrorBoundary>
      </StudentsProvider>
    </Router>
  );
}

export default App;
