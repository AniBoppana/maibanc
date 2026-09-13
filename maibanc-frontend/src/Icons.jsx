const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function IconGrid({ className }) {
  return (
    <svg {...base} className={className}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </svg>
  );
}

export function IconTrendUp({ className }) {
  return (
    <svg {...base} className={className}>
      <polyline points="3.5,17 9,11 13,14.5 20.5,6" />
      <polyline points="14.5,6 20.5,6 20.5,12" />
    </svg>
  );
}

export function IconList({ className }) {
  return (
    <svg {...base} className={className}>
      <line x1="4" y1="6.5" x2="20" y2="6.5" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17.5" x2="14" y2="17.5" />
    </svg>
  );
}

export function IconTarget({ className }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function IconBarChart({ className }) {
  return (
    <svg {...base} className={className}>
      <line x1="5" y1="20" x2="19" y2="20" />
      <rect x="6" y="13" width="3.4" height="7" rx="0.8" />
      <rect x="10.3" y="8" width="3.4" height="12" rx="0.8" />
      <rect x="14.6" y="4" width="3.4" height="16" rx="0.8" />
    </svg>
  );
}

export function IconCalendar({ className }) {
  return (
    <svg {...base} className={className}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
      <line x1="7.5" y1="13.5" x2="10" y2="13.5" strokeDasharray="0.1 3.2" />
      <line x1="7.5" y1="17" x2="14" y2="17" strokeDasharray="0.1 3.2" />
    </svg>
  );
}

export function IconFile({ className }) {
  return (
    <svg {...base} className={className}>
      <path d="M6 3.5h8l4.5 4.5v12.5H6z" />
      <path d="M14 3.5v4.5h4.5" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="16.5" x2="15" y2="16.5" />
    </svg>
  );
}

export function IconClipboard({ className }) {
  return (
    <svg {...base} className={className}>
      <rect x="5" y="4.5" width="14" height="17" rx="1.8" />
      <path d="M9 3.5h6a1 1 0 0 1 1 1v1.5H8V4.5a1 1 0 0 1 1-1z" />
      <line x1="8.5" y1="11" x2="15.5" y2="11" />
      <line x1="8.5" y1="14.5" x2="15.5" y2="14.5" />
      <line x1="8.5" y1="18" x2="13" y2="18" />
    </svg>
  );
}

export function IconBriefcase({ className }) {
  return (
    <svg {...base} className={className}>
      <rect x="3.5" y="8" width="17" height="11" rx="1.8" />
      <path d="M8.5 8V6a1.8 1.8 0 0 1 1.8-1.8h3.4A1.8 1.8 0 0 1 15.5 6v2" />
      <line x1="3.5" y1="13" x2="20.5" y2="13" />
    </svg>
  );
}

export function IconSpark({ className }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3.5l1.7 5.8L19.5 11l-5.8 1.7L12 18.5l-1.7-5.8L4.5 11l5.8-1.7z" />
    </svg>
  );
}

export function IconBank({ className }) {
  return (
    <svg {...base} className={className}>
      <path d="M4 10.5L12 5l8 5.5" />
      <line x1="3.5" y1="20" x2="20.5" y2="20" />
      <line x1="5.5" y1="10.5" x2="5.5" y2="17.5" />
      <line x1="10" y1="10.5" x2="10" y2="17.5" />
      <line x1="14" y1="10.5" x2="14" y2="17.5" />
      <line x1="18.5" y1="10.5" x2="18.5" y2="17.5" />
    </svg>
  );
}
