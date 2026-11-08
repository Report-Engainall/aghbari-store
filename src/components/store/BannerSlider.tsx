import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Banner } from '../../lib/types';

function BannerSlide({ banner }: { banner: Banner }) {
  return (
    <div
      style={{
        minWidth: '100%',
        background: 'linear-gradient(135deg, ' + banner.color + '22, ' + banner.color + '44)',
        padding: '12px 24px',
        textAlign: 'center',
      }}
    >
      <span style={{ fontSize: '15px', fontWeight: 600, color: banner.color }}>
        {banner.title}: {banner.content}
      </span>
    </div>
  );
}

function BannerTrack({ banners, current }: { banners: Banner[]; current: number }) {
  return (
    <div
      style={{
        display: 'flex',
        transition: 'transform 0.5s ease',
        transform: 'translateX(' + current * 100 + '%)',
        direction: 'ltr',
      }}
    >
      {banners.map((banner) => (
        <BannerSlide key={banner.id} banner={banner} />
      ))}
    </div>
  );
}

function BannerIndicators({
  count,
  current,
  onSelect,
}: {
  count: number;
  current: number;
  onSelect: (index: number) => void;
}) {
  if (count <= 1) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '4px',
        left: '50%',
        transform: 'translateX(' + current * 100 + '%)',
        display: 'flex',
        gap: '6px',
      }}
    >
      {Array.from({ length: count }, (_, index) => (
        <button
          key={index}
          type="button"
          aria-label={'الشريحة ' + (index + 1)}
          aria-pressed={index === current}
          onClick={() => onSelect(index)}
          style={{
            width: index === current ? '20px' : '6px',
            height: '6px',
            borderRadius: '3px',
            background: index === current ? 'var(--color-accent)' : 'rgba(255,255,255,0.3)',
          }}
        />
      ))}
    </div>
  );
}

export default function BannerSlider() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('banners')
      .select('*')
      .eq('is_active', true)
      .order('priority')
      .then(({ data }) => {
        if (!cancelled && data) setBanners(data as Banner[]);
      })
      .catch((error: unknown) => {
        console.warn('[store-banner-slider] banner load failed', {
          errorType: error instanceof Error ? error.name : 'UnknownError',
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (banners.length <= 1 || paused) return;
    const interval = setInterval(() => {
      setCurrent((position) => (position + 1) % banners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [banners.length, paused]);

  if (banners.length === 0) return null;

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        background: 'var(--color-primary-dark)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <BannerTrack banners={banners} current={current} />
      <BannerIndicators
        count={banners.length}
        current={current}
        onSelect={setCurrent}
      />
    </div>
  );
}
