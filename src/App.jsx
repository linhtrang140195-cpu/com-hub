import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import Layout from './components/layout/Layout';
import MasterTimeline from './components/admin/MasterTimeline';
import CampaignList from './components/admin/CampaignList';
import CampaignDetail from './components/admin/CampaignDetail';
import Archive from './components/admin/Archive';
import CampaignReport from './components/reports/CampaignReport';
import YearlyReport from './components/reports/YearlyReport';
import TodayChecklist from './components/operator/TodayChecklist';
import CaptionGenerator from './components/operator/CaptionGenerator';
import PostHistory from './components/operator/PostHistory';

function ProtectedRoute({ children, role }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) {
    return <Navigate to={user.role === 'admin' ? '/admin/timeline' : '/operator/today'} replace />;
  }
  return children;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'admin' ? '/admin/timeline' : '/operator/today'} replace /> : <LoginPage />} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        {/* Admin */}
        <Route path="/admin/timeline" element={<ProtectedRoute role="admin"><MasterTimeline /></ProtectedRoute>} />
        <Route path="/admin/campaigns" element={<ProtectedRoute role="admin"><CampaignList /></ProtectedRoute>} />
        <Route path="/admin/campaigns/:id" element={<ProtectedRoute role="admin"><CampaignDetail /></ProtectedRoute>} />
        <Route path="/admin/archive" element={<ProtectedRoute role="admin"><Archive /></ProtectedRoute>} />
        <Route path="/admin/reports" element={<ProtectedRoute role="admin"><YearlyReport /></ProtectedRoute>} />
        <Route path="/admin/reports/:campaignId" element={<ProtectedRoute role="admin"><CampaignReport /></ProtectedRoute>} />

        {/* Operator */}
        <Route path="/operator/today" element={<TodayChecklist />} />
        <Route path="/operator/write" element={<CaptionGenerator />} />
        <Route path="/operator/write/:postId" element={<CaptionGenerator />} />
        <Route path="/operator/history" element={<PostHistory />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
