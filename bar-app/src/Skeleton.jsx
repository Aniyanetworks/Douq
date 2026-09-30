// Grey pulsing placeholders shown while data loads.
const Bar = ({ w = '100%', h = 14 }) => <span className="sk" style={{ width: w, height: h }} />;

export function MemberCardsSkeleton({ count = 6 }) {
  return (
    <div className="cards" aria-busy="true" aria-label="Loading members">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card">
          <div className="card-head">
            <span className="sk" style={{ width: 72, height: 44, borderRadius: 10 }} />
            <div style={{ flex: 1, display: 'grid', gap: 6 }}>
              <Bar w="60%" h={18} />
              <Bar w="40%" h={12} />
            </div>
          </div>
          <div className="perks">
            {[0, 1, 2, 3].map((j) => <span key={j} className="sk" style={{ height: 38, borderRadius: 8 }} />)}
          </div>
          <div style={{ marginTop: 12 }}><Bar w="55%" h={12} /></div>
        </div>
      ))}
    </div>
  );
}

export function LogRowsSkeleton({ rows = 6, stats = true }) {
  return (
    <div aria-busy="true" aria-label="Loading log">
      {stats && (
        <div className="summary">
          {[0, 1, 2].map((i) => <span key={i} className="sk" style={{ width: 110, height: 62, borderRadius: 10 }} />)}
        </div>
      )}
      <div className="sk-rows">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="sk-row">
            <Bar w="18%" /><Bar w="8%" /><Bar w="16%" /><Bar w="18%" /><Bar w="12%" /><Bar w="22%" />
          </div>
        ))}
      </div>
    </div>
  );
}
