'use client';

import type { ReactNode } from 'react';
import { ModuleStub } from '@/components/stub';

export default function ConfigurationsPage(): ReactNode {
  return (
    <ModuleStub
      title="Configurations"
      subtitle="Processors, currencies, templates and modes."
      planned={['Payment processors (MTN / Airtel / Zamtel / Zed / Visa)', 'Currency: ZMW', 'Notification templates', 'Operating modes']}
    />
  );
}
