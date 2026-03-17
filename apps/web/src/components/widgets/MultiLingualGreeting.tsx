'use client';

import { useState, useEffect } from 'react';

export function MultiLingualGreeting({ content }: { content: string[] }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (content.length <= 1) return;
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % content.length);
        setVisible(true);
      }, 350);
    }, 2400);
    return () => clearInterval(timer);
  }, [content]);

  return (
    <div className="h-5 relative overflow-hidden" style={{ minWidth: '14rem' }}>
      <span
        className="absolute inset-0 flex items-center transition-all duration-300"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(6px)',
        }}
      >
        {content[index]}
      </span>
    </div>
  );
}
