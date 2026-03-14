'use client';

interface NotebookPopupProps {
  onClose: () => void;
}

export function NotebookPopup({ onClose }: NotebookPopupProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md mx-4 p-5 rounded-xl shadow-xl
          bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Notebook</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="text-center py-8">
          <div className="text-4xl mb-4">📓</div>
          <p className="text-gray-500 dark:text-gray-400">
            Notebook feature coming soon!
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
            Save important responses for later reference.
          </p>
        </div>

        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg
              bg-minai-500 text-white hover:bg-minai-600 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
