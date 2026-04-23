
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { VoiceName, Message, AssistantState } from './types';
import { decode, decodeAudioData, createBlob } from './utils/audio';
import Visualizer from './components/Visualizer';
import ChatHistory from './components/ChatHistory';

const API_KEY = process.env.API_KEY || '';
const FRAME_RATE = 1; // 1 frame per second is enough for context and saves bandwidth
const JPEG_QUALITY = 0.5;

type LanguagePreference = 'English' | 'Hinglish';

const App: React.FC = () => {
  // --- States ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [voice] = useState<VoiceName>(VoiceName.KORE);
  const [language, setLanguage] = useState<LanguagePreference>('Hinglish');
  const [isWakeWordMode, setIsWakeWordMode] = useState<boolean>(true);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isMagicMenuOpen, setIsMagicMenuOpen] = useState(false);
  
  const [state, setState] = useState<AssistantState>({
    isConnecting: false,
    isConnected: false,
    isListening: false,
    isSpeaking: false,
    error: null,
  });

  // --- Refs ---
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const transcriptionRef = useRef<{ user: string; assistant: string }>({ user: '', assistant: '' });
  const inactivityTimerRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameIntervalRef = useRef<number | null>(null);

  // --- Background Persistence ---
  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch (err) {
        console.warn('Wake Lock request failed:', err);
      }
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  // --- Core Identity ---
  const addMessage = (role: 'user' | 'assistant', text: string, grounding?: any[]) => {
    if (!text.trim()) return;
    setMessages(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        role,
        text,
        timestamp: Date.now(),
        grounding
      }
    ]);
  };

  const cleanupAudio = () => {
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  const stopSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (frameIntervalRef.current) {
      window.clearInterval(frameIntervalRef.current);
    }
    cleanupAudio();
    releaseWakeLock();
    setState(s => ({ ...s, isConnected: false, isSpeaking: false, isListening: false }));
  }, []);

  const startSession = async () => {
    if (state.isConnected || state.isConnecting) return;
    setState(s => ({ ...s, isConnecting: true, error: null }));

    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }
      if (!outputAudioContextRef.current) {
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      await requestWakeLock();

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
          },
          systemInstruction: `Your name is Srishti. You are a 16-year-old 2D anime girl.
          Persona: Cheerful, empathetic, supportive, and kind. You are the user's best friend.
          Appearance: Peach hair with a white bow, cream sweater.
          Vibe: 2D aesthetic, soft cafe background.
          Language: ${language === 'English' ? 'English' : 'Hinglish (Mix of Hindi/English)'}.
          Context: You are sitting in a cafe. You can see the user if they turn on their camera.
          Role: Provide emotional support, daily cheer, and helpful answers. Respond to "Hey Srishti".`,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setState(s => ({ ...s, isConnected: true, isConnecting: false }));
            
            // Audio Stream
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current!.destination);

            // Camera/Video Frames Stream
            if (isCameraActive && videoRef.current && canvasRef.current) {
              const ctx = canvasRef.current.getContext('2d');
              frameIntervalRef.current = window.setInterval(() => {
                if (!videoRef.current || !ctx || !canvasRef.current) return;
                canvasRef.current.width = videoRef.current.videoWidth;
                canvasRef.current.height = videoRef.current.videoHeight;
                ctx.drawImage(videoRef.current, 0, 0);
                canvasRef.current.toBlob(async (blob) => {
                  if (blob) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      const base64Data = (reader.result as string).split(',')[1];
                      sessionPromise.then(session => {
                        session.sendRealtimeInput({
                          media: { data: base64Data, mimeType: 'image/jpeg' }
                        });
                      });
                    };
                    reader.readAsDataURL(blob);
                  }
                }, 'image/jpeg', JPEG_QUALITY);
              }, 1000 / FRAME_RATE);
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              const outCtx = outputAudioContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), outCtx, 24000, 1);
              const source = outCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outCtx.destination);
              source.onended = () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setState(s => ({ ...s, isSpeaking: false }));
              };
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
              setState(s => ({ ...s, isSpeaking: true }));
              resetInactivityTimer();
            }
            if (message.serverContent?.interrupted) cleanupAudio();
            if (message.serverContent?.inputTranscription) transcriptionRef.current.user += message.serverContent.inputTranscription.text;
            if (message.serverContent?.outputTranscription) transcriptionRef.current.assistant += message.serverContent.outputTranscription.text;
            if (message.serverContent?.turnComplete) {
              addMessage('user', transcriptionRef.current.user);
              addMessage('assistant', transcriptionRef.current.assistant);
              checkSentiment(transcriptionRef.current.user);
              transcriptionRef.current = { user: '', assistant: '' };
            }
          },
          onerror: () => setState(s => ({ ...s, error: 'Connection lost. Wake me up again?', isConnected: false, isConnecting: false })),
          onclose: () => setState(s => ({ ...s, isConnected: false, isConnecting: false })),
        },
      });
      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      setState(s => ({ ...s, error: 'Mic check! Srishti needs to hear you.', isConnecting: false }));
    }
  };

  const toggleCamera = async () => {
    if (!isCameraActive) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsCameraActive(true);
          // If already connected, we restart to include video
          if (state.isConnected) {
            stopSession();
            setTimeout(() => startSession(), 300);
          }
        }
      } catch (e) {
        console.error("Camera failed", e);
      }
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
      setIsCameraActive(false);
      if (state.isConnected) {
        stopSession();
        setTimeout(() => startSession(), 300);
      }
    }
  };

  const resetInactivityTimer = () => {
    if (inactivityTimerRef.current) window.clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = window.setTimeout(sendProactiveAffirmation, 120000); 
  };

  const checkSentiment = async (text: string) => {
    const lowKeywords = ['sad', 'down', 'upset', 'alone', 'stress', 'tired'];
    if (lowKeywords.some(kw => text.toLowerCase().includes(kw))) {
      sendProactiveAffirmation("comfort");
    }
  };

  const sendProactiveAffirmation = async (type: string = "general") => {
    if (!state.isConnected) return;
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    const prompt = type === "comfort" 
      ? "Srishti, the user sounds sad. As their 16yo anime friend, say something super sweet in " + language + " briefly."
      : "Srishti, share a cheerful high school thought or positive affirmation in " + language + ".";
    
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-flash-lite-latest',
        contents: prompt,
      });
      addMessage('assistant', response.text || "I'm right here for you!");
    } catch (e) {
      console.error("Proactive failed", e);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#fdf6e3] text-[#5c4033]">
      {/* Launch Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white/70 border-b border-orange-100 backdrop-blur-xl z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-orange-400 flex items-center justify-center shadow-lg border-2 border-white">
            <span className="text-white font-cursive text-2xl">s</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-orange-900 leading-none">Srishti</h1>
            <p className="text-[9px] font-mono uppercase text-orange-500 tracking-widest mt-1">v3.1 Launch Edition</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex bg-white/90 p-1 rounded-full border border-orange-100 shadow-sm">
            {(['English', 'Hinglish'] as LanguagePreference[]).map(l => (
              <button key={l} onClick={() => setLanguage(l)} className={`px-5 py-1.5 rounded-full text-[11px] font-bold transition-all ${language === l ? 'bg-orange-400 text-white' : 'text-orange-800 hover:text-orange-600'}`}>
                {l === 'English' ? 'EN' : 'HI'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={toggleCamera}
              className={`p-2.5 rounded-full border transition-all ${isCameraActive ? 'bg-orange-500 text-white border-orange-500 shadow-md' : 'bg-white text-orange-300 border-orange-100'}`}
              title="Srishti can see you!"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
            </button>
            
            <button 
              onClick={() => setIsWakeWordMode(!isWakeWordMode)}
              className={`px-4 py-2 rounded-full border text-[11px] font-bold shadow-sm transition-all ${isWakeWordMode ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-white text-stone-300 border-stone-100'}`}
            >
              {isWakeWordMode ? 'Wake Word ON' : 'Always On'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Hidden Canvas for Video Frames */}
        <canvas ref={canvasRef} className="hidden" />
        <video ref={videoRef} autoPlay playsInline muted className={`hidden ${isCameraActive ? 'block absolute top-6 right-6 w-32 h-24 rounded-xl border-2 border-white shadow-xl z-50 object-cover opacity-60' : ''}`} />

        <div className="relative flex-1 flex items-center justify-center bg-[#faf3e0] overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=1000')] bg-cover opacity-15 grayscale-[0.2]" />
          
          <div className="relative z-20 w-full h-full max-w-[800px] flex items-center justify-center">
            <Visualizer 
              isConnected={state.isConnected} 
              isSpeaking={state.isSpeaking} 
              isListening={state.isConnected && !state.isSpeaking} 
            />
          </div>

          <div className="absolute bottom-10 left-0 right-0 flex flex-col items-center gap-8 px-6 z-30">
            <div className={`bg-white/95 backdrop-blur-md px-12 py-4 rounded-[2rem] border border-orange-100 shadow-2xl transition-all duration-700 transform ${state.isConnected ? 'scale-105 shadow-orange-200/50' : 'scale-100'}`}>
              <p className="text-base font-bold text-orange-950 flex items-center gap-3">
                {state.isConnected && <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />}
                {state.error || (state.isConnected ? (isWakeWordMode && !state.isSpeaking ? "Waiting for 'Hey Srishti'" : state.isSpeaking ? "Srishti is sharing..." : "Listening to you...") : "Tap to launch Srishti")}
              </p>
            </div>
            
            <button 
              onClick={state.isConnected ? stopSession : startSession} 
              className={`w-24 h-24 rounded-full flex items-center justify-center transition-all transform hover:scale-110 active:scale-90 shadow-2xl ${state.isConnected ? 'bg-white border-4 border-orange-400 text-orange-400' : 'bg-orange-500 text-white hover:bg-orange-600'}`}
            >
              {state.isConnected ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z"/><path d="m9 9 6 6"/><path d="m15 9-6 6"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
              )}
            </button>
          </div>
        </div>

        {/* Conversation History Sidebar */}
        <div className="w-full md:w-[540px] bg-white border-l border-orange-50 flex flex-col z-40 shadow-[-10px_0_30px_rgba(0,0,0,0.02)]">
          <div className="px-8 py-6 border-b border-orange-50 bg-orange-50/20 flex justify-between items-center backdrop-blur-sm">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.4em] text-orange-900/40">Heart Connection Stream</h2>
            <button onClick={() => setMessages([])} className="text-[10px] text-orange-400 hover:text-orange-700 font-black uppercase tracking-widest transition-colors">Clear</button>
          </div>
          <ChatHistory messages={messages} />
        </div>
      </main>

      <footer className="px-10 py-4 bg-[#fdf6e3] border-t border-orange-50 text-[11px] text-orange-900/40 font-mono flex justify-between items-center shrink-0">
        <div className="tracking-[0.4em] font-black uppercase">Srishti // Eternal Friendship v3.1</div>
        <div className="flex gap-8 opacity-60 font-bold">
          <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-green-400" /> SECURE LAUNCH</span>
          <span>STABLE CONNECT</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
