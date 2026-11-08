import { useSettings } from '../../lib/useSettings';

function FooterBrand({ name }: { name: string }) {
  return (
    <div>
      <h4 style={{ color: '#fff', marginBottom: '12px', fontSize: '16px' }}>{name}</h4>
      <p style={{ fontSize: '14px', opacity: 0.7 }}>
        منصة تجارية متكاملة لخدمة التجار والعملاء بأسعار تنافسية وجودة عالية.
      </p>
    </div>
  );
}

function FooterLinks() {
  return (
    <div>
      <h4 style={{ color: '#fff', marginBottom: '12px', fontSize: '16px' }}>روابط</h4>
      <ul style={{ listStyle: 'none', fontSize: '14px', lineHeight: '2' }}>
        <li><a href="/products" style={{ opacity: 0.7 }}>المنتجات</a></li>
        <li><a href="/orders" style={{ opacity: 0.7 }}>طلباتي</a></li>
        <li><a href="/returns" style={{ opacity: 0.7 }}>مرتجعاتي</a></li>
        <li><a href="/profile" style={{ opacity: 0.7 }}>ملفي الشخصي</a></li>
        <li><a href="/payments" style={{ opacity: 0.7 }}>دفعاتي</a></li>
        <li><a href="/help" style={{ opacity: 0.7 }}>مركز المساعدة</a></li>
      </ul>
    </div>
  );
}

function FooterContact() {
  return (
    <div>
      <h4 style={{ color: '#fff', marginBottom: '12px', fontSize: '16px' }}>تواصل</h4>
      <p style={{ fontSize: '14px', opacity: 0.7 }}>اليمن — صنعاء</p>
    </div>
  );
}

function FooterCopyright({ name }: { name: string }) {
  return (
    <div
      style={{
        textAlign: 'center',
        paddingTop: '20px',
        marginTop: '20px',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        fontSize: '13px',
        opacity: 0.5,
      }}
    >
      © {new Date().getFullYear()} {name} — Aghbari Commerce
    </div>
  );
}

export default function StoreFooter() {
  const { settings } = useSettings();
  const name = settings['store_name'] || 'متجر الأغبري';

  return (
    <footer
      style={{
        background: 'var(--color-primary-dark)',
        color: 'rgba(255,255,255,0.8)',
        padding: '32px 0 20px',
        marginTop: '40px',
      }}
    >
      <div
        className="main-content"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '24px',
        }}
      >
        <FooterBrand name={name} />
        <FooterLinks />
        <FooterContact />
      </div>
      <FooterCopyright name={name} />
    </footer>
  );
}
