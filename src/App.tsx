import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { RequireAccess, RequireAuth } from './components/guards';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import EmployeeFormPage from './pages/EmployeeFormPage';
import DepartmentsPage from './pages/DepartmentsPage';
import CustomersPage from './pages/CustomersPage';
import ProductsPage from './pages/ProductsPage';
import OrdersPage from './pages/OrdersPage';
import NewOrderPage from './pages/NewOrderPage';
import OrderDetailPage from './pages/OrderDetailPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import { PageHeader } from './components/ui';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="employees" element={<RequireAccess area="Employees"><EmployeesPage /></RequireAccess>} />
        <Route path="employees/new" element={<RequireAccess area="Employees" action="create"><EmployeeFormPage /></RequireAccess>} />
        <Route path="employees/:id/edit" element={<RequireAccess area="Employees" action="edit"><EmployeeFormPage /></RequireAccess>} />
        <Route path="departments" element={<RequireAccess area="Departments"><DepartmentsPage /></RequireAccess>} />
        <Route path="customers" element={<RequireAccess area="Customers"><CustomersPage /></RequireAccess>} />
        <Route path="products" element={<RequireAccess area="Products"><ProductsPage /></RequireAccess>} />
        <Route path="orders" element={<RequireAccess area="Orders"><OrdersPage /></RequireAccess>} />
        <Route path="orders/new" element={<RequireAccess area="Orders" action="create"><NewOrderPage /></RequireAccess>} />
        <Route path="orders/:id" element={<RequireAccess area="Orders"><OrderDetailPage /></RequireAccess>} />
        <Route path="reports" element={<RequireAccess area="Reports"><ReportsPage /></RequireAccess>} />
        <Route path="settings" element={<RequireAccess area="Settings"><SettingsPage /></RequireAccess>} />
        <Route path="*" element={<PageHeader title="Page not found" subtitle="Check the address or use the menu." />} />
      </Route>
    </Routes>
  );
}
