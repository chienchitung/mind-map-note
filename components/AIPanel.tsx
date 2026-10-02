import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { ChevronDoubleRightIcon, ChatbotIcon, RestartIcon, CopyIcon, CheckIcon, InsertIcon } from './icons';
import MarkdownPreview from './MarkdownPreview';
import { Images } from '../types';
import Spinner from './Spinner';
import { useTranslation } from '../contexts/LanguageContext';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  // Greetings and error notices aren't content worth copying or inserting.
  noActions?: boolean;
}

interface AIPanelProps {
  onToggleCollapse: () => void;
  onNewConversation: () => void;
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  onStopGenerating: () => void;
  isLoading: boolean;
  isStreaming: boolean;
  onInsertReply: (text: string) => void;
  images: Images;
}

const ReplyActions: React.FC<{ text: string; onInsert: (text: string) => void }> = ({ text, onInsert }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch (error) {
      console.error('Failed to copy AI reply:', error);
    }
  };

  const buttonClass = 'flex items-center gap-1 px-2 py-1 rounded-full text-xs text-text-secondary hover:bg-border-color/50 hover:text-text-main transition-colors duration-150 ease-apple';
  return (
    <div className="flex items-center gap-1 mt-1 ml-[2.375rem]">
      <button type="button" onClick={handleCopy} className={buttonClass}>
        {copied ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
        <span>{copied ? t('aiPanel.copied') : t('aiPanel.copyReply')}</span>
      </button>
      <button type="button" onClick={() => onInsert(text)} className={buttonClass} title={t('aiPanel.insertIntoNoteHint')}>
        <InsertIcon className="w-3.5 h-3.5" />
        <span>{t('aiPanel.insertIntoNote')}</span>
      </button>
    </div>
  );
};


const AIPanel: React.FC<AIPanelProps> = ({ onToggleCollapse, onNewConversation, messages, onSendMessage, onStopGenerating, isLoading, isStreaming, onInsertReply, images }) => {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);
  
  // Auto-grow textarea height based on content.
  // Using useLayoutEffect to prevent flicker and ensure correct height calculation after DOM mutations.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const resize = () => {
      // Reset height to allow shrinking
      textarea.style.height = 'auto';
      // Set height based on content, up to a max height
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 200; // Max height in pixels
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    };

    resize();

    // This panel stays mounted at all times — its parent <aside> just
    // animates width to 0 when collapsed — so a measurement taken while
    // collapsed (e.g. on first mount) would wrap the placeholder into many
    // lines and lock the textarea at max-height. Re-measure whenever the
    // composer's available width actually changes (panel opens, sidebar
    // resizes, etc.) so it self-corrects instead of staying stuck.
    const container = textarea.parentElement;
    if (!container) return;
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input);
      setInput('');
    }
  };

  return (
    <div className="h-full bg-secondary flex flex-col">
      <div
        className="flex items-center justify-between p-4 border-b border-border-color/70 flex-shrink-0"
      >
        <div className="flex items-center gap-2.5">
            <ChatbotIcon className="w-5 h-5 text-accent" />
            <h2 className="text-[15px] font-semibold text-text-main tracking-tight">{t('aiPanel.title')}</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onNewConversation}
            disabled={isLoading || messages.length === 0}
            className="p-1.5 rounded-full text-text-secondary hover:bg-border-color/50 transition-all duration-150 ease-apple active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            title={t('aiPanel.newConversation')}
            aria-label={t('aiPanel.newConversation')}
          >
            <RestartIcon className="w-4 h-4" />
          </button>
          <button onClick={onToggleCollapse} className="p-1.5 rounded-full text-text-secondary hover:bg-border-color/50 transition-all duration-150 ease-apple active:scale-90" title={t('aiPanel.collapse')} aria-label={t('aiPanel.collapseLabel')}>
            <ChevronDoubleRightIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto p-6 space-y-6">
        {messages.map((msg, index) => {
          const isStreamingThis = isStreaming && index === messages.length - 1;
          return (
            <div key={index}>
              <div className={`flex items-end gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'model' && (
                  <div className="w-7 h-7 rounded-full bg-elevated shadow-apple-xs flex items-center justify-center flex-shrink-0">
                      <ChatbotIcon className="w-4 h-4 text-accent" />
                  </div>
                )}
                <div className={`px-4 py-2.5 rounded-2xl max-w-[75%] ${msg.role === 'user' ? 'bg-accent text-white rounded-br-md' : 'bg-elevated text-text-main rounded-bl-md shadow-apple-xs'}`}>
                  <MarkdownPreview markdown={msg.text} images={images} />
                </div>
              </div>
              {msg.role === 'model' && !msg.noActions && !isStreamingThis && (
                <ReplyActions text={msg.text} onInsert={onInsertReply} />
              )}
            </div>
          )
        })}
        {isLoading && !isStreaming && (
            <div className="flex items-end gap-2.5 justify-start">
                <div className="w-7 h-7 rounded-full bg-elevated shadow-apple-xs flex items-center justify-center flex-shrink-0">
                    <ChatbotIcon className="w-4 h-4 text-accent" />
                </div>
                <div className="px-4 py-3 rounded-2xl bg-elevated shadow-apple-xs flex items-center justify-center space-x-1.5 h-[42px] rounded-bl-md">
                    <span className="h-2 w-2 bg-accent rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="h-2 w-2 bg-accent rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="h-2 w-2 bg-accent rounded-full animate-bounce"></span>
                </div>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-secondary border-t border-border-color/70 flex-shrink-0">
        <form
          onSubmit={handleSubmit}
          className="relative bg-elevated rounded-[26px] shadow-apple-xs border border-transparent focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30 transition-colors duration-150 ease-apple"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
                // isComposing is true while an IME (Chinese/Japanese/Korean
                // pinyin, etc.) candidate window is open — Enter there
                // confirms the candidate, it isn't the user asking to send.
                // keyCode 229 is the older fallback some browsers still use
                // instead of (or alongside) nativeEvent.isComposing.
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                    e.preventDefault();
                    handleSubmit(e);
                }
            }}
            placeholder={t('aiPanel.inputPlaceholder')}
            aria-label={t('aiPanel.inputLabel')}
            className="w-full pl-4 pr-14 py-3.5 bg-transparent focus:outline-none text-[14.5px] leading-relaxed text-text-main placeholder:text-text-secondary/70 resize-none"
            rows={1}
            style={{ maxHeight: '200px', minHeight: '52px' }}
            disabled={isLoading}
          />
          {isLoading ? (
            <button
              type="button"
              onClick={onStopGenerating}
              title={t('aiPanel.stopGenerating')}
              aria-label={t('aiPanel.stopGenerating')}
              className="absolute right-2 bottom-2 w-9 h-9 flex-shrink-0 bg-accent text-white rounded-full flex items-center justify-center transition-all duration-150 ease-apple active:scale-90 hover:opacity-90"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                  <rect x="5" y="5" width="14" height="14" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              title={t('aiPanel.sendShortcut')}
              aria-label={t('aiPanel.send')}
              className="absolute right-2 bottom-2 w-9 h-9 flex-shrink-0 bg-accent text-white rounded-full flex items-center justify-center disabled:bg-accent/35 disabled:cursor-not-allowed transition-all duration-150 ease-apple active:scale-90 hover:opacity-90"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
              </svg>
            </button>
          )}
        </form>
      </div>
    </div>
  );
};

export default AIPanel;
