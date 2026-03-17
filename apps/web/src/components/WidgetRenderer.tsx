'use client';

import type { Message } from '@minai/shared';
import { MultiLingualGreeting } from './widgets/MultiLingualGreeting';

type WidgetData = NonNullable<Message['widget_data']>;

export function WidgetRenderer({ data }: { data: WidgetData }) {
  switch (data.widget_type) {
    case 'multi-lingual-greeting':
      return <MultiLingualGreeting content={data.widget_content} />;
    default:
      return null;
  }
}
