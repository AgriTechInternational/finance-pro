import React from 'react';

const fmtKg   = (n) => Number(n || 0).toLocaleString('en-EG', { maximumFractionDigits: 0 });
const fmtTons = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtBags = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const pctFmt  = (n) => (Number(n || 0) * 100).toFixed(1) + '%';

export default function EndProductStock({ data }) {
  const totalProducedTons  = data?.summary?.totalProduced     || 0; // tons
  const totalProducedKg    = data?.summary?.totalProducedKg   || 0; // kg
  const totalProducedBags  = data?.summary?.totalProducedBags || 0;
  const rawMaterialStockKg = data?.summary?.rawMaterialStock  || 0; // kg
  const conversionRatio    = data?.summary?.conversionRatio   || 0;

  return (
    <div className="page-fade" style={{ padding: 24 }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <div className="page-title">End Product Stock</div>
        <div className="page-sub">Finished goods output — aggregated from daily production logs.</div>
      </div>

      {/* Primary KPI: Total Finished Product */}
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(5,150,105,0.06))',
            border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: 20,
            padding: '40px 48px',
            display: 'flex',
            alignItems: 'center',
            gap: 40,
          }}
        >
          <div style={{ fontSize: 60 }}>🏭</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#34d399', marginBottom: 10 }}>
              Total Finished Product (Y)
            </div>
            <div style={{ fontSize: 72, fontWeight: 900, color: 'var(--text1)', fontFamily: 'var(--mono)', lineHeight: 1 }}>
              {fmtKg(totalProducedKg)}
              <span style={{ fontSize: 28, marginLeft: 14, opacity: 0.5, fontWeight: 600 }}>kg</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 12 }}>
              {fmtBags(totalProducedBags)} bags · {fmtTons(totalProducedTons)} tons produced
            </div>
          </div>
        </div>
      </div>

      {/* Secondary KPIs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 20,
          marginBottom: 28,
        }}
      >
        <div className="card shadow-soft" style={{ padding: 28, borderLeft: '4px solid var(--accent)' }}>
          <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--accent)', marginBottom: 10 }}>
            📦 Raw Material Input (X)
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--text1)', fontFamily: 'var(--mono)', lineHeight: 1 }}>
            {rawMaterialStockKg > 0 ? fmtKg(rawMaterialStockKg) : '—'}
            <span style={{ fontSize: 16, marginLeft: 8, opacity: 0.5 }}>kg</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
            From Material Inventory · Cell J72
          </div>
        </div>
      </div>

    </div>
  );
}
