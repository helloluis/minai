'use client';

import { useState, useEffect } from 'react';

const messages = [
  { text: 'Hello! How can I help you today?', lang: 'en' },
  { text: 'Kamusta! Paano kita matutulungan?', lang: 'fil' },
  { text: 'Jambo! Ninaweza kukusaidia vipi leo?', lang: 'sw' },
];

export function WelcomeMessage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);

      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % messages.length);
        setVisible(true);
      }, 400);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 bg-minai-100 dark:bg-minai-900/30 rounded-full flex items-center justify-center mb-6">
        <span className="text-3xl">🌿</span>
      </div>

      <div className="h-16 flex items-center justify-center">
        <p
          className={`text-xl text-gray-600 dark:text-gray-300 text-center transition-all duration-400
            ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
        >
          {messages[currentIndex].text}
        </p>
      </div>

      <p className="text-sm text-gray-400 mt-4">
        English · Filipino · Swahili
      </p>
    </div>
  );
}
