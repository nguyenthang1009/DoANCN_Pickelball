import { Route, Routes } from 'react-router';
import { CustomerLayout } from './components/Layout';
import Home from './pages/customer/Home';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ChangePassword from './pages/auth/ChangePassword';

export default function App() {
  return (
    <Routes>
      <Route path="/dang-nhap" element={<Login />} />
      <Route path="/dang-ky" element={<Register />} />
      <Route path="/doi-mat-khau" element={<ChangePassword />} />
      <Route element={<CustomerLayout />}>
        <Route index element={<Home />} />
      </Route>
    </Routes>
  );
}
