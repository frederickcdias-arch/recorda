import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
  readOnly?: boolean;
  label?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Escreva em Markdown...',
  minHeight = '200px',
  readOnly = false,
  label,
}: MarkdownEditorProps): JSX.Element {
  const [mode, setMode] = useState<'edit' | 'preview' | 'split'>(readOnly ? 'preview' : 'edit');

  const toolbar = [
    { label: 'B', md: '**texto**', title: 'Negrito' },
    { label: 'I', md: '*texto*', title: 'Itálico' },
    { label: 'H2', md: '## ', title: 'Título' },
    { label: '—', md: '\n---\n', title: 'Linha horizontal' },
    { label: '•', md: '- ', title: 'Lista' },
    { label: '1.', md: '1. ', title: 'Lista numerada' },
    { label: '``', md: '`código`', title: 'Código inline' },
    { label: '```', md: '\n```\ncódigo\n```\n', title: 'Bloco de código' },
    { label: '📋', md: '| Col 1 | Col 2 |\n|-------|-------|\n| A     | B     |', title: 'Tabela' },
    { label: '🔗', md: '[texto](url)', title: 'Link' },
  ];

  const insertMarkdown = (md: string) => {
    onChange(value + md);
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      {label && <div className="px-3 pt-2 text-sm font-medium text-gray-700">{label}</div>}

      {!readOnly && (
        <div className="flex items-center justify-between border-b bg-gray-50 px-2 py-1">
          <div className="flex gap-0.5">
            {toolbar.map((item) => (
              <button
                key={item.title}
                type="button"
                title={item.title}
                onClick={() => insertMarkdown(item.md)}
                className="px-2 py-1 text-xs font-mono text-gray-600 hover:bg-gray-200 rounded transition-colors"
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex gap-0.5 bg-gray-200 rounded p-0.5">
            {(['edit', 'split', 'preview'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  mode === m
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {m === 'edit' ? 'Editar' : m === 'preview' ? 'Preview' : 'Dividir'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        className={`${mode === 'split' ? 'grid grid-cols-2 divide-x' : ''}`}
        style={{ minHeight }}
      >
        {(mode === 'edit' || mode === 'split') && !readOnly && (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full p-3 text-sm font-mono resize-y border-0 focus:outline-none focus:ring-0"
            style={{ minHeight }}
          />
        )}
        {(mode === 'preview' || mode === 'split') && (
          <div
            className="p-3 overflow-auto prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-blue-600 prose-strong:text-gray-900 prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded prose-pre:bg-gray-50 prose-pre:border prose-table:text-sm prose-th:bg-gray-50 prose-td:border prose-th:border prose-th:px-3 prose-th:py-1.5 prose-td:px-3 prose-td:py-1.5"
            style={{ minHeight }}
          >
            {value.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
            ) : (
              <p className="text-gray-400 italic">Nenhum conteúdo para visualizar.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface MarkdownViewerProps {
  content: string;
  className?: string;
}

export function MarkdownViewer({ content, className = '' }: MarkdownViewerProps): JSX.Element {
  return (
    <div
      className={`prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-blue-600 prose-strong:text-gray-900 prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded prose-pre:bg-gray-50 prose-pre:border prose-table:text-sm prose-th:bg-gray-50 prose-td:border prose-th:border prose-th:px-3 prose-th:py-1.5 prose-td:px-3 prose-td:py-1.5 ${className}`}
    >
      {content.trim() ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      ) : (
        <p className="text-gray-400 italic">Sem conteúdo.</p>
      )}
    </div>
  );
}
