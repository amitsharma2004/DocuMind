'use client';

/**
 * ConfidenceBadge — displays the retrieval confidence score with colour-coded tier.
 *
 * Green  (≥ 0.85): High confidence
 * Yellow (≥ 0.75): Grounded (above threshold)
 * Red    (< 0.75): Below threshold — I don't know response
 */
interface ConfidenceBadgeProps {
  score: number;
  isGrounded: boolean;
}

export default function ConfidenceBadge({ score, isGrounded }: ConfidenceBadgeProps) {
  const percent = Math.round(score * 100);

  let label: string;
  let colorClass: string;

  if (!isGrounded) {
    label = 'No match';
    colorClass = 'bg-red-100 text-red-700 border-red-200';
  } else if (score >= 0.85) {
    label = 'High';
    colorClass = 'bg-green-100 text-green-700 border-green-200';
  } else {
    label = 'Moderate';
    colorClass = 'bg-yellow-100 text-yellow-700 border-yellow-200';
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${colorClass}`}
      title={`Retrieval confidence: ${percent}%`}
    >
      <span className="font-mono">{percent}%</span>
      <span>{label}</span>
    </span>
  );
}
