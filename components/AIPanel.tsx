import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { ChevronDoubleRightIcon, ChatbotIcon } from './icons';
import MarkdownPreview from './MarkdownPreview';
import { Images } from '../types';
import Spinner from './Spinner';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface AIPanelProps {
  onToggleCollapse: () => void;
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  images: Images;
}

// A new component to render the AI's response with a typewriter effect.
const TypewriterMessage: React.FC<{ text: string; images: Images, scrollRef: React.RefObject<HTMLDivElement> }> = ({ text, images, scrollRef }) => {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    setDisplayedText(''); // Reset when a new message comes in
    if (text) {
      let i = 0;
      const intervalId = setInterval(() => {
        if (i < text.length) {
          setDisplayedText(prev => prev + text.charAt(i));
          i++;
        } else {
          clearInterval(intervalId);
        }
      }, 15); // Typing speed in milliseconds

      return () => clearInterval(intervalId);
    }
  }, [text]);

  // Scroll to the bottom as new text is being typed to keep it in view
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayedText, scrollRef]);

  return <MarkdownPreview markdown={displayedText} images={images} />;
};


const AIPanel: React.FC<AIPanelProps> = ({ onToggleCollapse, messages, onSendMessage, isLoading, images }) => {
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
            <h2 className="text-[15px] font-semibold text-text-main tracking-tight">AI 學習夥伴</h2>
        </div>
        <button onClick={onToggleCollapse} className="p-1.5 rounded-full text-text-secondary hover:bg-border-color/50 transition-all duration-150 ease-apple active:scale-90" title="收合側邊欄 (Esc)" aria-label="收合 AI 面板">
          <ChevronDoubleRightIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-grow overflow-y-auto p-6 space-y-6">
        {messages.map((msg, index) => {
          const isLastMessage = index === messages.length - 1;
          return (
            <div key={index} className={`flex items-end gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'model' && (
                <div className="w-7 h-7 rounded-full bg-elevated shadow-apple-xs flex items-center justify-center flex-shrink-0">
                    <ChatbotIcon className="w-4 h-4 text-accent" />
                </div>
              )}
              <div className={`px-4 py-2.5 rounded-2xl max-w-[75%] ${msg.role === 'user' ? 'bg-accent text-white rounded-br-md' : 'bg-elevated text-text-main rounded-bl-md shadow-apple-xs'}`}>
                {msg.role === 'model' && isLastMessage && !isLoading && messages.length > 1 ? (
                  <TypewriterMessage text={msg.text} images={images} scrollRef={messagesEndRef} />
                ) : (
                  <MarkdownPreview markdown={msg.text} images={images} />
                )}
              </div>
            </div>
          )
        })}
        {isLoading && (
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
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                }
            }}
            placeholder="在這裡問問題...（Enter 傳送，Shift + Enter 換行）"
            aria-label="向 AI 學習夥伴提問"
            className="w-full pl-4 pr-14 py-3.5 bg-transparent focus:outline-none text-[14.5px] leading-relaxed text-text-main placeholder:text-text-secondary/70 resize-none"
            rows={1}
            style={{ maxHeight: '200px', minHeight: '52px' }}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            title="傳送 (Enter)"
            aria-label="傳送訊息"
            className="absolute right-2 bottom-2 w-9 h-9 flex-shrink-0 bg-accent text-white rounded-full flex items-center justify-center disabled:bg-accent/35 disabled:cursor-not-allowed transition-all duration-150 ease-apple active:scale-90 hover:opacity-90"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
};

export default AIPanel;
