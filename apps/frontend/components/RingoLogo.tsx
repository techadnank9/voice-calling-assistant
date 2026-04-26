export function RingoLogo({
  size = 'md',
  variant = 'light'
}: {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'light' | 'dark';
}) {
  const iconSize = size === 'sm' ? 26 : size === 'lg' ? 38 : 30;
  const fontSize = size === 'sm' ? 15 : size === 'lg' ? 22 : 18;
  const subSize = size === 'sm' ? 6 : size === 'lg' ? 9 : 7;
  const wordColor = variant === 'dark' ? '#ffffff' : '#0f172a';

  return (
    <span className="flex items-center gap-2" style={{ lineHeight: 1 }}>
      {/* Phone icon with concentric rings */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        <defs>
          <radialGradient id={`ringo-grad-${variant}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="100%" stopColor="#7f1d1d" />
          </radialGradient>
        </defs>
        {/* Outer ring */}
        <circle cx="16" cy="16" r="15" fill="none" stroke="#9d3c2a" strokeWidth="1.5" opacity="0.45" />
        {/* Middle ring */}
        <circle cx="16" cy="16" r="11" fill="none" stroke="#b84c35" strokeWidth="1.5" opacity="0.6" />
        {/* Inner filled circle */}
        <circle cx="16" cy="16" r="8" fill={`url(#ringo-grad-${variant})`} />
        {/* Phone handset */}
        <path
          d="M11.5 13.2c.4 1.1 1 2.1 1.8 3 .8.9 1.8 1.6 2.9 2l1.2-1.2c.2-.2.4-.2.6-.1.7.3 1.4.5 2.2.5.3 0 .5.2.5.5v2.1c0 .3-.2.5-.5.5-5.2 0-9.5-4.2-9.5-9.5 0-.3.2-.5.5-.5h2.1c.3 0 .5.2.5.5 0 .8.2 1.5.5 2.2.1.2 0 .4-.1.6l-1.2 1.2z"
          fill="white"
        />
      </svg>

      {/* Wordmark */}
      <span className="flex flex-col" style={{ gap: '2px' }}>
        <span
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: `${fontSize}px`,
            fontWeight: 700,
            color: wordColor,
            letterSpacing: '-0.02em',
            lineHeight: 1
          }}
        >
          ringo
        </span>
        <span
          style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${subSize}px`,
            fontWeight: 600,
            color: '#c9804a',
            letterSpacing: '0.18em',
            lineHeight: 1
          }}
        >
          VOICE AGENT
        </span>
      </span>
    </span>
  );
}
