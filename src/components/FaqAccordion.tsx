import { useState } from 'react';
import { MotionConfig, motion, AnimatePresence } from 'motion/react';

export interface FaqItem {
  id: string;
  pergunta: string;
  resposta: string;
}

interface FaqAccordionProps {
  items: FaqItem[];
}

export function FaqAccordion({ items }: FaqAccordionProps) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  return (
    <MotionConfig reducedMotion="user">
      <div className="divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-surface-card shadow-xs">
        {items.map((item) => {
          const isOpen = openId === item.id;
          const panelId = `faq-panel-${item.id}`;
          const btnId = `faq-btn-${item.id}`;
          return (
            <div key={item.id} className="px-5 py-1 sm:px-7">
              <h3 className="m-0">
                <button
                  id={btnId}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenId(isOpen ? null : item.id)}
                  className="flex min-h-[56px] w-full cursor-pointer items-center justify-between gap-4 py-4 text-left font-display text-base font-bold text-ink-primary transition-colors hover:text-ccg-green-800 sm:text-lg"
                >
                  <span>{item.pergunta}</span>
                  <span
                    aria-hidden="true"
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      isOpen
                        ? 'border-ccg-green-800 bg-ccg-green-800 text-white'
                        : 'border-border-subtle bg-surface-canvas text-ink-secondary'
                    }`}
                  >
                    <svg
                      className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </span>
                </button>
              </h3>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    id={panelId}
                    role="region"
                    aria-labelledby={btnId}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <p className="pb-5 pr-8 text-base leading-relaxed text-ink-secondary">
                      {item.resposta}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </MotionConfig>
  );
}
