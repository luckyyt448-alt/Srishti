
import React, { useEffect, useRef } from 'react';
import { Message } from '../types';

interface ChatHistoryProps {
  messages: Message[];
}

const ChatHistory: React.FC<ChatHistoryProps> = ({ messages }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div 
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-6 py-6 space-y-6 scrollbar-hide"
    >
      {messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center opacity-40 select-none text-center px-10">
          <p className="text-xs font-medium uppercase tracking-[0.2em] italic text-[#5c4033]">Your story with Srishti begins here</p>
        </div>
      ) : (
        messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <span className="text-[9px] font-mono text-[#8c7a6b] mb-1 uppercase tracking-widest">
              {msg.role === 'user' ? 'You' : 'Srishti'} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <div 
              className={`max-w-[90%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-orange-100 border border-orange-200 text-[#5c4033] rounded-tr-none' 
                  : 'bg-white border border-[#e6dbb9] text-[#4a3728] rounded-tl-none'
              }`}
            >
              {msg.text}
              
              {msg.grounding && msg.grounding.length > 0 && (
                <div className="mt-3 pt-2 border-t border-orange-50 flex flex-wrap gap-2">
                  {msg.grounding.map((chunk: any, i: number) => {
                    const source = chunk.web || chunk.maps;
                    if (!source) return null;
                    return (
                      <a 
                        key={i} 
                        href={source.uri} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-[10px] bg-orange-50 text-orange-700 px-2 py-1 rounded hover:bg-orange-100 transition-colors flex items-center gap-1"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        {source.title || 'Source'}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default ChatHistory;
