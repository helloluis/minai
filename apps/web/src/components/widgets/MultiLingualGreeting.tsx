'use client';

import { useState, useEffect, useRef } from 'react';

export function MultiLingualGreeting({ content }: { content: string[] }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const contentRef = useRef(content);

  useEffect(() => {
    const greetings = contentRef.current;
    if (greetings.length <= 1) return;
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % greetings.length);
        setVisible(true);
      }, 350);
    }, 2400);
    return () => clearInterval(timer);
  }, []); // stable — content is captured via ref, not deps

  return (
    <div className="h-5 relative overflow-hidden" style={{ minWidth: '14rem' }}>
      <span
        className={`absolute inset-0 flex items-center transition-all duration-300
          ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}
      >
        {content[index]}
      </span>
    </div>
  );
}
