'use client';

// Shown only for pre-existing conversations that predate the widget system.
// New conversations always have a widget message as their first entry.
export function WelcomeMessage() {
  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-bl-md px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-sm text-gray-500">
        Hello! How can I help you today?
      </div>
    </div>
  );
}
