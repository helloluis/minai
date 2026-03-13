'use client';

interface ThinkingBlockProps {
  content: string;
  isActive: boolean;
}

export function ThinkingBlock({ content, isActive }: ThinkingBlockProps) {
  // When active but no content yet, show just the header as a "reasoning starting" indicator
  if (!content && !isActive) return null;

  return (
    <div
      className={`mb-2 rounded-lg border text-sm transition-all duration-500
        ${isActive
          ? 'border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20'
          : 'border-gray-200/50 bg-gray-50/50 dark:bg-gray-800/30 opacity-60'
        }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-inherit">
        {isActive ? (
          <>
            <span className="text-amber-500 animate-pulse text-xs">●●●</span>
            <span className="text-xs text-amber-600 dark:text-amber-400">Reasoning...</span>
          </>
        ) : (
          <>
            <span className="text-green-500 text-xs">✓</span>
            <span className="text-xs text-gray-500">Done</span>
          </>
        )}
      </div>

      {/* Content — only rendered when there is content */}
      {content && (
        <div
          className="px-3 py-2 max-h-32 overflow-y-auto text-gray-500 dark:text-gray-400 text-xs leading-relaxed"
          style={{
            maskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)',
          }}
        >
          {content.split('\n').map((line, i) => (
            <p key={i} className="mb-1">
              {line.length > 120 ? line.slice(0, 120) + '…' : line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
