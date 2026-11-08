import { Link } from 'react-router-dom';
import { ShoppingCart, Minus, Plus, Package } from 'lucide-react';
import type { Product, CustomerTier } from '../../lib/types';
import { getPriceForTier, isOutOfStock, formatPrice } from '../../lib/pricing';
import { useCartStore } from '../../lib/cartStore';
import { useSettings } from '../../lib/useSettings';
import { useState } from 'react';

interface Props {
  product: Product;
  tier: CustomerTier;
  showPrice: boolean;
}

function ProductImageContent({ product }: { product: Product }) {
  if (product.image_url) {
    return <img src={product.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-light)' }}>
      <Package size={48} />
    </div>
  );
}

function ProductImageLink({ product, out }: { product: Product; out: boolean }) {
  return (
    <Link to={'/product/' + product.id} style={{ display: 'block', aspectRatio: '1', background: 'var(--color-bg-alt)', position: 'relative', overflow: 'hidden' }}>
      <ProductImageContent product={product} />
      {product.is_featured ? (
        <span className="badge badge-accent" style={{ position: 'absolute', top: '8px', right: '8px' }}>مميز</span>
      ) : null}
      {out ? (
        <span className="badge badge-error" style={{ position: 'absolute', top: '8px', left: '8px' }}>نفد</span>
      ) : null}
    </Link>
  );
}

function ProductQuantityControls({
  quantity,
  onChange,
}: {
  quantity: number;
  onChange: (value: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
      <button type="button" aria-label="إنقاص الكمية" onClick={() => onChange(Math.max(1, quantity - 1))} style={{ padding: '6px 10px', background: 'var(--color-bg-alt)' }}>
        <Minus size={14} />
      </button>
      <input
        type="number"
        min="1"
        value={quantity}
        aria-label="الكمية"
        onChange={(event) => onChange(Math.max(1, parseInt(event.target.value, 10) || 1))}
        style={{ width: '50px', textAlign: 'center', border: 'none', outline: 'none', padding: '6px 0', fontSize: '14px' }}
      />
      <button type="button" aria-label="زيادة الكمية" onClick={() => onChange(quantity + 1)} style={{ padding: '6px 10px', background: 'var(--color-bg-alt)' }}>
        <Plus size={14} />
      </button>
    </div>
  );
}

function ProductAddButton({ added, onAdd }: { added: boolean; onAdd: () => void }) {
  return (
    <button onClick={onAdd} className={'btn ' + (added ? 'btn-accent' : 'btn-primary') + ' btn-sm'} style={{ flex: 1 }}>
      {added ? 'تمت الإضافة ✓' : <><ShoppingCart size={16} /> إضافة</>}
    </button>
  );
}

function ProductCardDetails({
  product,
  price,
  currency,
  showPrice,
  out,
  quantity,
  added,
  onQuantityChange,
  onAdd,
}: {
  product: Product;
  price: number;
  currency: string;
  showPrice: boolean;
  out: boolean;
  quantity: number;
  added: boolean;
  onQuantityChange: (value: number) => void;
  onAdd: () => void;
}) {
  return (
    <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
      <Link to={'/product/' + product.id}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, lineHeight: '1.4', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {product.name}
        </h3>
      </Link>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <span className="badge badge-neutral">{product.item_code}</span>
        <span className="text-muted" style={{ fontSize: '12px' }}>{product.unit}</span>
      </div>
      {showPrice && !out ? (
        <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--color-primary)' }}>
          {formatPrice(price, currency)}
        </div>
      ) : null}
      {!out ? (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: 'auto' }}>
          <ProductQuantityControls quantity={quantity} onChange={onQuantityChange} />
          <ProductAddButton added={added} onAdd={onAdd} />
        </div>
      ) : null}
    </div>
  );
}

export default function ProductCard({ product, tier, showPrice }: Props) {
  const { addItem } = useCartStore();
  const { settings } = useSettings();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const price = getPriceForTier(product, tier);
  const out = isOutOfStock(product);
  const currency = settings['currency_symbol'] || 'ر.ي';

  const handleAdd = () => {
    if (out || quantity <= 0) return;
    addItem(product, quantity, price);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <article
      className="card"
      style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'all var(--transition)' }}
      onMouseEnter={(event) => {
        event.currentTarget.style.boxShadow = 'var(--shadow-lg)';
        event.currentTarget.style.transform = 'translateY(-4px)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.boxShadow = 'var(--shadow-sm)';
        event.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <ProductImageLink product={product} out={out} />
      <ProductCardDetails
        product={product}
        price={price}
        currency={currency}
        showPrice={showPrice}
        out={out}
        quantity={quantity}
        added={added}
        onQuantityChange={setQuantity}
        onAdd={handleAdd}
      />
    </article>
  );
}
