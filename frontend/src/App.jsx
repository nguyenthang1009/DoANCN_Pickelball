import { lazy, Suspense } from 'react';
import { Route, Routes, Navigate } from 'react-router';
import { CustomerLayout, RequireRole, StaffLayout } from './components/Layout';
import { Spinner } from './components/ui';
import Home from './pages/customer/Home';
import Payment from './pages/customer/Payment';
import MyBookings from './pages/customer/MyBookings';
import Ticket from './pages/customer/Ticket';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ChangePassword from './pages/auth/ChangePassword';

// Trang nội bộ tải riêng (Chart.js, quét QR nặng) để trang đặt sân của khách nhẹ hơn
const Pos = lazy(() => import('./pages/staff/Pos'));
const CheckIn = lazy(() => import('./pages/staff/CheckIn'));
const SellServices = lazy(() => import('./pages/staff/SellServices'));
const DayBookings = lazy(() => import('./pages/staff/DayBookings'));
const Shift = lazy(() => import('./pages/staff/Shift'));
const Dashboard = lazy(() => import('./pages/manager/Dashboard'));
const Courts = lazy(() => import('./pages/manager/Courts'));
const Services = lazy(() => import('./pages/manager/Services'));
const Refunds = lazy(() => import('./pages/manager/Refunds'));
const Venues = lazy(() => import('./pages/admin/Venues'));
const Users = lazy(() => import('./pages/admin/Users'));

// Phân quyền giao diện theo ma trận RBAC; backend vẫn kiểm tra lại mọi API
const STAFF = ['STAFF', 'MANAGER', 'ADMIN'];
const MANAGERS = ['MANAGER', 'ADMIN'];
const guard = (roles, el) => <RequireRole roles={roles}><Suspense fallback={<Spinner />}>{el}</Suspense></RequireRole>;

export default function App() {
  return (
    <Routes>
      <Route path="/dang-nhap" element={<Login />} />
      <Route path="/dang-ky" element={<Register />} />
      <Route path="/doi-mat-khau" element={<ChangePassword />} />
      <Route element={<CustomerLayout />}>
        <Route index element={<Home />} />
        <Route path="/thanh-toan/:code" element={guard(['CUSTOMER'], <Payment />)} />
        <Route path="/lich-dat" element={guard(['CUSTOMER'], <MyBookings />)} />
        <Route path="/ve/:code" element={guard(['CUSTOMER'], <Ticket />)} />
      </Route>
      <Route element={guard(STAFF, <StaffLayout />)}>
        <Route path="/pos" element={guard(STAFF, <Pos />)} />
        <Route path="/check-in" element={guard(STAFF, <CheckIn />)} />
        <Route path="/ban-dich-vu" element={guard(STAFF, <SellServices />)} />
        <Route path="/don-hom-nay" element={guard(STAFF, <DayBookings />)} />
        <Route path="/doanh-thu-ca" element={guard(STAFF, <Shift />)} />
        <Route path="/quan-ly/tong-quan" element={guard(MANAGERS, <Dashboard />)} />
        <Route path="/quan-ly/san" element={guard(MANAGERS, <Courts />)} />
        <Route path="/quan-ly/dich-vu" element={guard(MANAGERS, <Services />)} />
        <Route path="/quan-ly/hoan-tien" element={guard(MANAGERS, <Refunds />)} />
        <Route path="/quan-tri/co-so" element={guard(['ADMIN'], <Venues />)} />
        <Route path="/quan-tri/tai-khoan" element={guard(['ADMIN'], <Users />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
