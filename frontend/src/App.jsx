import { lazy, Suspense } from 'react';
import { Route, Routes, Navigate } from 'react-router';
import { CustomerLayout, RequireAccess, StaffLayout } from './components/Layout';
import { PageLoader } from './components/RouteProgress';
import Landing from './pages/customer/Landing';
import Home from './pages/customer/Home';
import Payment from './pages/customer/Payment';
import MyBookings from './pages/customer/MyBookings';
import Ticket from './pages/customer/Ticket';
import MyInvoices from './pages/customer/MyInvoices';
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
const Roles = lazy(() => import('./pages/admin/Roles'));
const SiteContent = lazy(() => import('./pages/admin/SiteContent'));
const LegalParameters = lazy(() => import('./pages/admin/LegalParameters'));
const Invoices = lazy(() => import('./pages/staff/Invoices'));
const MyPayslips = lazy(() => import('./pages/staff/MyPayslips'));
const InvoiceDetail = lazy(() => import('./pages/shared/InvoiceDetail'));
const Finance = lazy(() => import('./pages/finance/Finance'));
const Payroll = lazy(() => import('./pages/finance/Payroll'));
const Lighting = lazy(() => import('./pages/manager/Lighting'));
const ShiftPlanner = lazy(() => import('./pages/manager/ShiftPlanner'));
const MyAttendance = lazy(() => import('./pages/staff/MyAttendance'));

// Phân quyền giao diện theo mã chức năng; backend vẫn kiểm tra lại mọi API
const guard = (any, el) => <RequireAccess any={any}><Suspense fallback={<PageLoader />}>{el}</Suspense></RequireAccess>;

export default function App() {
  return (
    <Routes>
      <Route path="/dang-nhap" element={<Login />} />
      <Route path="/dang-ky" element={<Register />} />
      <Route path="/doi-mat-khau" element={<ChangePassword />} />
      <Route path="/hoa-don/:no" element={guard(['invoice.view_own', 'invoice.view_venue'], <InvoiceDetail />)} />
      <Route element={<CustomerLayout fullBleed />}>
        <Route index element={<Landing />} />
      </Route>
      <Route element={<CustomerLayout />}>
        <Route path="/dat-san" element={<Home />} />
        <Route path="/thanh-toan/:code" element={guard(['booking.create'], <Payment />)} />
        <Route path="/lich-dat" element={guard(['booking.view_own'], <MyBookings />)} />
        <Route path="/ve/:code" element={guard(['booking.view_own'], <Ticket />)} />
        <Route path="/hoa-don" element={guard(['invoice.view_own'], <MyInvoices />)} />
      </Route>
      <Route element={<RequireAccess internal><StaffLayout /></RequireAccess>}>
        <Route path="/pos" element={guard(['pos.create'], <Pos />)} />
        <Route path="/check-in" element={guard(['checkin.perform'], <CheckIn />)} />
        <Route path="/ban-dich-vu" element={guard(['pos.sell'], <SellServices />)} />
        <Route path="/don-hom-nay" element={guard(['booking.view_venue'], <DayBookings />)} />
        <Route path="/doanh-thu-ca" element={guard(['report.shift'], <Shift />)} />
        <Route path="/quan-ly/tong-quan" element={guard(['report.revenue'], <Dashboard />)} />
        <Route path="/quan-ly/san" element={guard(['court.manage', 'price.manage'], <Courts />)} />
        <Route path="/quan-ly/dich-vu" element={guard(['service.manage'], <Services />)} />
        <Route path="/quan-ly/hoan-tien" element={guard(['booking.refund'], <Refunds />)} />
        <Route path="/quan-tri/co-so" element={guard(['venue.manage'], <Venues />)} />
        <Route path="/quan-tri/tai-khoan" element={guard(['user.view'], <Users />)} />
        <Route path="/quan-tri/phan-quyen" element={guard(['role.manage'], <Roles />)} />
        <Route path="/quan-tri/noi-dung" element={guard(['site.manage'], <SiteContent />)} />
        <Route path="/quan-tri/tham-so" element={guard(['legal.manage'], <LegalParameters />)} />
        <Route path="/hoa-don-co-so" element={guard(['invoice.view_venue'], <Invoices />)} />
        <Route path="/tai-chinh" element={guard(['finance.view'], <Finance />)} />
        <Route path="/chieu-sang" element={guard(['lighting.view'], <Lighting />)} />
        <Route path="/ca-lam" element={guard(['shift.manage'], <ShiftPlanner />)} />
        <Route path="/cham-cong" element={guard(['attendance.self'], <MyAttendance />)} />
        <Route path="/tien-luong" element={guard(['payroll.manage', 'payroll.approve'], <Payroll />)} />
        <Route path="/phieu-luong" element={guard(['payroll.view_own'], <MyPayslips />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
