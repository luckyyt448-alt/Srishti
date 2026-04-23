
import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isSpeaking: boolean;
  isListening: boolean;
  isConnected: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ isSpeaking, isListening, isConnected }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    const render = () => {
      time += 0.015;
      const width = canvas.width = 600;
      const height = canvas.height = 600;
      const centerX = width / 2;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      // --- Simple 2D Bloom/Pulse ---
      if (isConnected) {
        const pulse = Math.sin(time * 1.5) * 10;
        const radius = 230 + pulse + (isListening ? 30 : 0);
        
        const gradient = ctx.createRadialGradient(centerX, centerY, 100, centerX, centerY, radius);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
        gradient.addColorStop(0.8, isSpeaking ? 'rgba(251, 146, 60, 0.15)' : isListening ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255, 240, 220, 0.05)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // --- 2D Lip-Sync (Flat Anime Style) ---
      if (isSpeaking) {
        // Aligned with the face of the 16-year-old anime girl illustration
        const mouthOpenness = Math.abs(Math.sin(time * 20)) * 7; 
        const mouthY = centerY + 82; 
        const mouthX = centerX;
        
        // Mouth shadow
        ctx.beginPath();
        ctx.ellipse(mouthX, mouthY, 6, mouthOpenness, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#4a2c2c';
        ctx.fill();

        // Subtle highlight
        ctx.beginPath();
        ctx.ellipse(mouthX, mouthY - 2, 3, mouthOpenness * 0.3, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fill();
      }

      // --- Flat 2D Blinking ---
      const blinkCycle = time % 5; 
      const isBlinking = blinkCycle > 4.8;
      
      if (isBlinking) {
        const eyeY = centerY - 14;
        const eyeOffsetX = 42;
        ctx.fillStyle = '#fff5f0'; // Skin tone match
        ctx.fillRect(centerX - eyeOffsetX - 13, eyeY - 8, 26, 16);
        ctx.fillRect(centerX + eyeOffsetX - 13, eyeY - 8, 26, 16);
      }

      // --- Anime "Sparkles" (Flat 2D Elements) ---
      for (let i = 0; i < 6; i++) {
        const angle = (time * 0.2) + (i * Math.PI * 2 / 6);
        const dist = 260 + Math.sin(time + i) * 20;
        const px = centerX + Math.cos(angle) * dist;
        const py = centerY + Math.sin(angle) * dist;
        
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(time + i);
        ctx.fillStyle = 'white';
        // Draw small diamond/star shapes
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(4, 0);
        ctx.lineTo(0, 6);
        ctx.lineTo(-4, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [isConnected, isSpeaking, isListening]);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden pointer-events-none">
      <style>
        {`
          @keyframes breathe2D {
            0%, 100% { transform: translateY(0px) scale(1); }
            50% { transform: translateY(-8px) scale(1.01); }
          }
        `}
      </style>
      <div className="relative w-full h-full flex items-center justify-center">
        {/* The 16-year-old Anime Girl Avatar */}
        <div 
          className="absolute w-[95%] h-[95%] transition-all duration-1000"
          style={{ animation: 'breathe2D 4s ease-in-out infinite' }}
        >
           <img 
            src="https://raw.githubusercontent.com/google/generative-ai-docs/main/site/en/gemini-api/docs/quickstart/srishti-cafe.png" 
            alt="Srishti 2D Avatar"
            className="w-full h-full object-contain"
          />
        </div>
        
        {/* Overlay Canvas for Mouth & Blinks */}
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
      </div>
    </div>
  );
};

export default Visualizer;
