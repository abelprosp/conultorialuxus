import type { StatusCobranca } from '../types';
import { STATUS_COLORS, STATUS_LABELS } from '../api';

interface Props {
  status: StatusCobranca;
}

export default function StatusBadge({ status }: Props) {
  return (
    <span className={`badge ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
