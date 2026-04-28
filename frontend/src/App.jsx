import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { ToastProvider } from './components/Toast';
import Dashboard from './pages/Dashboard';
import Uploads from './pages/Uploads';
import Sessions from './pages/Sessions';
import Availability from './pages/Availability';
import NewExam from './pages/NewExam';
import Conflicts from './pages/Conflicts';
import FinalSchedule from './pages/FinalSchedule';
import Rooms from './pages/Rooms';
import CalendarView from './pages/CalendarView';
import ExamImports from './pages/ExamImports';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <div className="app-layout">
          <Sidebar />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/uploads" element={<Uploads />} />
              <Route path="/rooms" element={<Rooms />} />
              <Route path="/sessions" element={<Sessions />} />
              <Route path="/availability" element={<Availability />} />
              <Route path="/new-exam" element={<NewExam />} />
              <Route path="/conflicts" element={<Conflicts />} />
              <Route path="/schedule" element={<FinalSchedule />} />
              <Route path="/exam-imports" element={<ExamImports />} />
              <Route path="/calendar" element={<CalendarView />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </ToastProvider>
    </BrowserRouter>
  );
}
