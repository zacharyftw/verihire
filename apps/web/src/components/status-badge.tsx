import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  labels: Record<string, string>;
  colors: Record<string, string>;
}

export function StatusBadge({ status, labels, colors }: StatusBadgeProps) {
  return (
    <Badge variant="secondary" className={cn('font-medium', colors[status])}>
      {labels[status] || status}
    </Badge>
  );
}
