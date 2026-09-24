import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage, { safeNext } from './pages/LoginPage';
import Layout from './components/layout/Layout';
import MasterTimeline from './components/admin/MasterTimeline';
import MasterCalendar from './components/admin/MasterCalendar';
import CampaignList from './components/admin/CampaignList';
import CampaignDetail from './components/admin/CampaignDetail';
import Archive from './components/admin/Archive';
import CampaignReport from './components/reports/CampaignReport';
import YearlyReport from './components/reports/YearlyReport';
import BenchmarkReport from './components/reports/BenchmarkReport';
import TodayChecklist from './components/operator/TodayChecklist';
import CaptionGenerator from './components/operator/CaptionGenerator';
import PostHistory from './components/operator/PostHistory';
import PublicTimeline from './pages/PublicTimeline';

function ProtectedRoute({ children, role }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) {
    return <Navigate to={user.role === 'admin' ? '/admin/timeline' : '/operator/today'} replace />;
  }
  return children;
}

// Someone already signed in who lands on /login goes where ?next= asked for,
// so the public board's "log in as admin" link returns to the board.
function LoggedInRedirect({ user }) {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  return <Navigate to={next || (user.role === 'admin' ? '/admin/timeline' : '/operator/today')} replace />;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Open to everyone — no login, no Layout chrome */}
      <Route path="/timeline" element={<PublicTimeline />} />

      <Route path="/login" element={user ? <LoggedInRedirect user={user} /> : <LoginPage />} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        {/* Admin */}
        <Route path="/admin/timeline" element={<ProtectedRoute role="admin"><MasterTimeline /></ProtectedRoute>} />
        <Route path="/admin/calendar" element={<ProtectedRoute role="admin"><MasterCalendar /></ProtectedRoute>} />
        <Route path="/admin/campaigns" element={<ProtectedRoute role="admin"><CampaignList /></ProtectedRoute>} />
        <Route path="/admin/campaigns/:id" element={<ProtectedRoute role="admin"><CampaignDetail /></ProtectedRoute>} />
        <Route path="/admin/archive" element={<ProtectedRoute role="admin"><Archive /></ProtectedRoute>} />
        <Route path="/admin/reports" element={<ProtectedRoute role="admin"><YearlyReport /></ProtectedRoute>} />
        <Route path="/admin/reports/benchmark" element={<ProtectedRoute role="admin"><BenchmarkReport /></ProtectedRoute>} />
        <Route path="/admin/reports/:campaignId" element={<ProtectedRoute role="admin"><CampaignReport /></ProtectedRoute>} />

        {/* Operator */}
        <Route path="/operator/timeline" element={<MasterTimeline />} />
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
