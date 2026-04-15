'use client';

import { useState } from 'react';

interface Flashcard {
  question: string;
  answer: string;
}

interface FlashcardViewProps {
  namespace: string;
  selectedDocIds?: string[];
  onClose: () => void;
}

export default function FlashcardView({ namespace, selectedDocIds, onClose }: FlashcardViewProps) {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generated, setGenerated] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError('');
    setFlipped(false);
    setCurrent(0);
    try {
      const resp = await fetch('/api/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          namespace,
          doc_ids: selectedDocIds?.length ? selectedDocIds : null,
          count: 10,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Failed to generate flashcards');
      setCards(data.cards);
      setGenerated(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const prev = () => { setCurrent((c) => Math.max(0, c - 1)); setFlipped(false); };
  const next = () => { setCurrent((c) => Math.min(cards.length - 1, c + 1)); setFlipped(false); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl p-6 flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">🃏 Flashcards</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {selectedDocIds?.length ? `From ${selectedDocIds.length} selected doc(s)` : 'From all documents'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">✕</button>
        </div>

        {/* Generate button */}
        {!generated && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="text-5xl">🃏</div>
            <p className="text-gray-600 dark:text-gray-300 text-sm text-center max-w-sm">
              Generate 10 flashcards from your documents to test your knowledge
            </p>
            <button
              onClick={generate}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-sm
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating…
                </span>
              ) : '✨ Generate Flashcards'}
            </button>
            {error && <p className="text-red-500 text-xs">{error}</p>}
          </div>
        )}

        {/* Cards */}
        {generated && cards.length > 0 && (
          <>
            {/* Progress */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">{current + 1} / {cards.length}</span>
              <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${((current + 1) / cards.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Flip card */}
            <div
              className="relative cursor-pointer"
              style={{ perspective: '1000px', height: '220px' }}
              onClick={() => setFlipped((f) => !f)}
            >
              <div
                className="relative w-full h-full transition-transform duration-500"
                style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
              >
                {/* Front — Question */}
                <div
                  className="absolute inset-0 rounded-2xl border border-gray-200 dark:border-gray-700
                    bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-800
                    flex flex-col items-center justify-center p-6 text-center"
                  style={{ backfaceVisibility: 'hidden' }}
                >
                  <span className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-3">Question</span>
                  <p className="text-gray-800 dark:text-gray-100 font-medium text-base leading-relaxed">
                    {cards[current].question}
                  </p>
                  <span className="text-xs text-gray-400 dark:text-gray-500 mt-4">Click to reveal answer</span>
                </div>

                {/* Back — Answer */}
                <div
                  className="absolute inset-0 rounded-2xl border border-gray-200 dark:border-gray-700
                    bg-gradient-to-br from-green-50 to-emerald-50 dark:from-gray-800 dark:to-gray-800
                    flex flex-col items-center justify-center p-6 text-center"
                  style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                >
                  <span className="text-xs font-semibold text-green-500 uppercase tracking-wide mb-3">Answer</span>
                  <p className="text-gray-800 dark:text-gray-100 text-sm leading-relaxed">
                    {cards[current].answer}
                  </p>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={prev}
                disabled={current === 0}
                className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm
                  text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800
                  disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >← Prev</button>

              <button
                onClick={generate}
                disabled={loading}
                className="px-4 py-2 rounded-xl text-xs text-blue-500 hover:text-blue-400 transition-colors"
              >
                {loading ? 'Generating…' : '🔄 Regenerate'}
              </button>

              <button
                onClick={next}
                disabled={current === cards.length - 1}
                className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm
                  text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800
                  disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >Next →</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
