'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function ChatRedirect() {
  const params = useParams();
  const router = useRouter();
  const threadId = params.threadId as string;

  useEffect(() => {
    if (threadId) router.replace(`/notebooks/${threadId}/chat`);
  }, [threadId, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-pulse text-gray-400">Loading...</div>
    </div>
  );
}
