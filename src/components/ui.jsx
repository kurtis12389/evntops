import { STAGES, STAGE_LABEL } from '../lib/store.jsx';

export const ArrowIcon = ({ dir = 'ne' }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ transform: dir === 'sw' ? 'rotate(180deg)' : 'none' }}>
    <path d="M4 12 12 4M5.5 4H12v6.5" />
  </svg>
);

export const Arrow = ({ dir }) => <span className="arrow"><ArrowIcon dir={dir} /></span>;

/** "EXPLORE ↗" style link from the reference. */
export function Explore({ href, onClick, children = 'Open' }) {
  const Tag = href ? 'a' : 'button';
  return (
    <Tag className="explore" href={href} onClick={onClick} type={href ? undefined : 'button'}>
      {children} <Arrow />
    </Tag>
  );
}

export function Ring({ words = 'EVNT OPS · KIT CHECK · ' }) {
  const text = words.repeat(2);
  return (
    <div className="ring" aria-hidden="true">
      <div className="disc" />
      <svg className="text" viewBox="0 0 220 220">
        <defs><path id="ring-path" d="M110,110 m-88,0 a88,88 0 1,1 176,0 a88,88 0 1,1 -176,0" /></defs>
        <circle cx="110" cy="110" r="104" fill="none" stroke="currentColor" strokeWidth="1" />
        <circle cx="110" cy="110" r="72" fill="none" stroke="currentColor" strokeWidth="1" />
        <text fill="currentColor" fontSize="11" fontWeight="600" letterSpacing="2.4"><textPath href="#ring-path" textLength="548" lengthAdjust="spacing">{text}</textPath></text>
      </svg>
      <div className="core"><ArrowIcon /></div>
    </div>
  );
}

export const Squiggle = ({ style }) => (
  <svg className="squiggle" width="80" height="60" viewBox="0 0 80 60" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" style={style} aria-hidden="true">
    <path d="M4 52c10-2 8-14 18-16s8 12 18 10 6-14 16-16 8 10 18 6" />
  </svg>
);

export const CurlArrow = () => (
  <svg className="curl" width="64" height="70" viewBox="0 0 64 70" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 8c18-8 34 6 22 18S6 30 14 44s30 14 38 18" /><path d="M42 56l10 6-4 10" />
  </svg>
);

/** Page header: small label, title, one line of context, then the page's actions. */
export function Hero({ eyebrow, title, lede, children }) {
  return (
    <div className="page-head">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {lede && <p className="lede">{lede}</p>}
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

/** Section heading with an optional link on the right and a short note under it. */
export function PanelHead({ title, note, link, linkText }) {
  return (
    <div className="panel-head">
      <div className="spread"><h2>{title}</h2>{link && <Explore href={link}>{linkText}</Explore>}</div>
      {note && <p className="note">{note}</p>}
    </div>
  );
}

export function StageTrack({ status }) {
  const idx = STAGES.indexOf(status);
  return (
    <div className="stages" aria-label={`Stage: ${STAGE_LABEL[status]}`}>
      {STAGES.map((s, i) => (
        <div key={s} className={'stage' + (i < idx ? ' done' : i === idx ? ' now' : '')}>
          <span className="num">0{i + 1}.</span>
          <span className="name">{STAGE_LABEL[s]}</span>
        </div>
      ))}
    </div>
  );
}

const STATE_TEXT = { available: 'In stock', partly: 'Partly out', booked: 'Booked', out: 'Out', repair: 'In repair', missing: 'Missing', retired: 'Retired' };
export const StockTag = ({ state }) => <span className={'tag ' + state}>{STATE_TEXT[state] || state}</span>;

export const fmtDate = (d) => (d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
