import { Link, useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  Bell,
  LogOut,
  LogIn,
  User,
  Package,
  Chrome as Home,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useCartStore } from '../../lib/cartStore';
import { useAuthStore } from '../../lib/authStore';
import { useSettings } from '../../lib/useSettings';

function StoreIdentity({ name }: { name: string }) {
  return (
    <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
      <span
        aria-hidden="true"
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: 'var(--color-accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          color: 'var(--color-primary-dark)',
          fontSize: '18px',
        }}
      >
        أ
      </span>
      <span style={{ fontWeight: 700, fontSize: '18px' }}>{name}</span>
    </Link>
  );
}

function StoreSearchForm({
  value,
  onChange,
  onSearch,
}: {
  value: string;
  onChange: (value: string) => void;
  onSearch: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSearch} style={{ flex: 1, maxWidth: '500px', position: 'relative' }}>
      <input
        type="text"
        placeholder="ابحث بالاسم أو الكود..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          width: '100%',
          padding: '10px 14px 10px 40px',
          borderRadius: 'var(--radius-md)',
          border: 'none',
          background: 'rgba(255,255,255,0.15)',
          color: '#fff',
          outline: 'none',
          fontSize: '14px',
        }}
        onFocus={(event) => {
          event.currentTarget.style.background = 'rgba(255,255,255,0.95)';
          event.currentTarget.style.color = '#1a1a1a';
        }}
        onBlur={(event) => {
          event.currentTarget.style.background = 'rgba(255,255,255,0.15)';
          event.currentTarget.style.color = '#fff';
        }}
      />
      <svg
        style={{
          position: 'absolute',
          left: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          opacity: 0.7,
        }}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    </form>
  );
}

function ConnectivityIndicator({ online }: { online: boolean }) {
  return (
    <div title={online ? 'متصل' : 'غير متصل'} aria-label={online ? 'متصل' : 'غير متصل'} style={{ opacity: 0.8 }}>
      {online ? <Wifi size={18} /> : <WifiOff size={18} />}
    </div>
  );
}

function CartLink({ itemCount }: { itemCount: number }) {
  return (
    <Link to="/cart" className="btn btn-ghost" style={{ color: '#fff', position: 'relative' }}>
      <ShoppingCart size={20} />
      {itemCount > 0 ? (
        <span
          style={{
            position: 'absolute',
            top: '2px',
            left: '2px',
            background: 'var(--color-accent)',
            color: 'var(--color-primary-dark)',
            borderRadius: '999px',
            fontSize: '11px',
            fontWeight: 700,
            padding: '1px 6px',
            minWidth: '18px',
            textAlign: 'center',
          }}
        >
          {itemCount}
        </span>
      ) : null}
    </Link>
  );
}

function AccountActions({
  authenticated,
  onSignOut,
}: {
  authenticated: boolean;
  onSignOut: () => void;
}) {
  if (!authenticated) {
    return <Link to="/login" className="btn btn-accent btn-sm"><LogIn size={16} /> دخول</Link>;
  }

  return (
    <>
      <Link to="/orders" className="btn btn-ghost" style={{ color: '#fff' }}>
        <User size={18} />
      </Link>
      <button onClick={onSignOut} className="btn btn-ghost" style={{ color: '#fff' }}>
        <LogOut size={18} />
      </button>
    </>
  );
}

function StoreNavigation({
  online,
  itemCount,
  authenticated,
  onSignOut,
}: {
  online: boolean;
  itemCount: number;
  authenticated: boolean;
  onSignOut: () => void;
}) {
  return (
    <nav aria-label="التنقل الرئيسي" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <Link to="/" className="btn btn-ghost" style={{ color: '#fff' }}><Home size={18} /></Link>
      <Link to="/products" className="btn btn-ghost" style={{ color: '#fff' }}><Package size={18} /></Link>
      <ConnectivityIndicator online={online} />
      <CartLink itemCount={itemCount} />
      <button type="button" className="btn btn-ghost" style={{ color: '#fff' }} aria-label="التنبيهات">
        <Bell size={20} />
      </button>
      <AccountActions authenticated={authenticated} onSignOut={onSignOut} />
    </nav>
  );
}

export default function StoreHeader() {
  const navigate = useNavigate();
  const { items } = useCartStore();
  const { session, signOut } = useAuthStore();
  const { settings } = useSettings();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = search.trim();
    if (!query) return;
    navigate('/products?q=' + encodeURIComponent(query));
  };

  const handleSignOut = () => {
    signOut();
    navigate('/');
  };

  const storeName = settings['store_name'] || 'متجر الأغبري';

  return (
    <header
      style={{
        background: 'var(--color-primary)',
        color: '#fff',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <div className="main-content" style={{ display: 'flex', alignItems: 'center', gap: '16px', height: '64px' }}>
        <StoreIdentity name={storeName} />
        <StoreSearchForm value={search} onChange={setSearch} onSearch={handleSearch} />
        <StoreNavigation
          online={isOnline}
          itemCount={items.length}
          authenticated={Boolean(session)}
          onSignOut={handleSignOut}
        />
      </div>
    </header>
  );
}
