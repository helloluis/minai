'use client';

import { useState, useEffect } from 'react';

const greetings = [
  { text: 'Hello! How can I help you today?',         lang: 'English'   },
  { text: 'Habari! Ninaweza kukusaidia vipi leo?',     lang: 'Swahili'   },
  { text: 'Kumusta! Paano kita matutulungan ngayon?',  lang: 'Filipino'  },
  { text: 'Bonjour! Comment puis-je vous aider?',      lang: 'French'    },
  { text: '¡Hola! ¿En qué puedo ayudarte hoy?',       lang: 'Spanish'   },
  { text: 'Sannu! Yaya zan iya taimaka muku yau?',     lang: 'Hausa'     },
];

export function WelcomeMessage() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % greetings.length);
        setVisible(true);
      }, 350);
    }, 2400);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-bl-md px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-sm">
        <div className="h-5 relative overflow-hidden">
          <span
            className="absolute inset-0 flex items-center transition-all duration-350"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(6px)',
            }}
          >
            {greetings[index].text}
          </span>
        </div>
      </div>
    </div>
  );
}
