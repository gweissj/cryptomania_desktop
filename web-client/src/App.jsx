import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Wallet from "./pages/Wallet";
import Market from "./pages/Market";
import Trade from "./pages/Trade";
import Sell from "./pages/Sell";
import {
  LayoutDashboard,
  Wallet as WalletIcon,
  LineChart,
  ArrowRightLeft,
  Coins,
  LogOut,
} from "lucide-react";
import { api } from "./api";

function PrivateRoute({ children }) {
  const token = localStorage.getItem("access_token");
  return token ? children : <Navigate to="/login" />;
}

function HeaderNavLink({ to, label }) {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <Link
      to={to}
      className={
        "text-sm font-medium " +
        (active ? "text-indigo-900" : "text-gray-500 hover:text-gray-800")
      }
    >
      {label}
    </Link>
  );
}

function Layout({ children }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await api.logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen pb-16 md:pb-0 bg-gray-50 text-gray-900">
      <header className="bg-white shadow-sm sticky top-0 z-10 px-6 py-3 flex justify-between items-center">
        <Link
          to="/"
          className="flex items-center gap-2 cursor-pointer select-none"
        >
          <div className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold">
            C
          </div>
          <span className="font-bold text-lg tracking-tight">Comoney</span>
        </Link>

        <div className="hidden md:flex items-center gap-6">
          <HeaderNavLink to="/" label="Home" />
          <HeaderNavLink to="/trade" label="Trade" />
          <HeaderNavLink to="/sell" label="Sell" />
          <HeaderNavLink to="/market" label="Market" />
          <HeaderNavLink to="/wallet" label="Wallet" />
          <button
            onClick={handleLogout}
            className="ml-2 p-2 text-gray-500 hover:text-red-600 transition"
            title="Log out"
          >
            <LogOut size={20} />
          </button>
        </div>

        <button
          onClick={handleLogout}
          className="md:hidden p-2 text-gray-500 hover:text-red-600 transition"
          title="Log out"
        >
          <LogOut size={20} />
        </button>
      </header>

      <main className="pt-4">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around p-2 md:hidden z-20">
        <BottomNavItem
          to="/"
          icon={<LayoutDashboard size={22} />}
          label="Home"
        />
        <BottomNavItem
          to="/trade"
          icon={<ArrowRightLeft size={22} />}
          label="Trade"
        />
        <BottomNavItem to="/sell" icon={<Coins size={22} />} label="Sell" />
        <BottomNavItem
          to="/market"
          icon={<LineChart size={22} />}
          label="Market"
        />
        <BottomNavItem
          to="/wallet"
          icon={<WalletIcon size={22} />}
          label="Wallet"
        />
      </nav>
    </div>
  );
}

function BottomNavItem({ to, icon, label }) {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <Link
      to={to}
      className={
        "flex flex-col items-center gap-0.5 text-xs " +
        (active ? "text-indigo-900" : "text-gray-400")
      }
    >
      {icon}
      <span className="font-medium">{label}</span>
    </Link>
  );
}

function AppLayout() {
  return (
    <Layout>
      <Routes>
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/wallet"
          element={
            <PrivateRoute>
              <Wallet />
            </PrivateRoute>
          }
        />
        <Route
          path="/market"
          element={
            <PrivateRoute>
              <Market />
            </PrivateRoute>
          }
        />
        <Route
          path="/trade"
          element={
            <PrivateRoute>
              <Trade />
            </PrivateRoute>
          }
        />
        <Route
          path="/sell"
          element={
            <PrivateRoute>
              <Sell />
            </PrivateRoute>
          }
        />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/*" element={<AppLayout />} />
      </Routes>
    </Router>
  );
}
