import { redirect } from 'next/navigation';

export default async function ChatRedirect({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  redirect(`/notebooks/${threadId}/chat`);
}
