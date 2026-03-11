import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children, adminOnly = false, driverOnly = false }: { children: React.ReactNode; adminOnly?: boolean; driverOnly?: boolean }) => {
  const { user, isLoading, isAdmin, isDriver } = useAuth();

  if (isLoading) return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />;
  if (driverOnly && !isDriver) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
};

export default ProtectedRoute;
