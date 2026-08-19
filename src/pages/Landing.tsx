import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Film, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export const Landing: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden bg-black select-none">
      {/* Cinematic Red Radial Glow */}
      <div className="absolute top-[35%] left-[50%] -translate-x-[50%] -translate-y-[50%] w-[550px] h-[550px] rounded-full bg-brand-primary/10 blur-[130px] pointer-events-none" />

      {/* Landing Wrapper */}
      <div className="w-full max-w-lg flex flex-col items-center text-center z-10 py-12">
        
        {/* Cinematic Logo */}
        <div className="flex items-center gap-3 mb-8 animate-pulse-glow">
          <div className="w-11 h-11 rounded-xl bg-brand-primary flex items-center justify-center shadow-glow border border-white/20">
            <Film size={22} className="text-white" />
          </div>
          <span className="font-extrabold text-3xl tracking-tight text-white font-serif">
            Cine<span className="text-brand-primary text-glow">Room</span>
          </span>
        </div>

        {/* Tagline */}
        <h1 className="text-2xl font-bold tracking-widest text-zinc-400 uppercase mb-12 select-none">
          "Watch together. Anywhere."
        </h1>

        {/* Action Button Controls */}
        <div className="flex flex-col gap-4.5 w-full max-w-sm justify-center">
          <Button 
            variant="primary" 
            size="lg" 
            onClick={() => navigate('/create')}
            className="flex gap-2.5 items-center justify-center font-bold text-sm tracking-wider uppercase py-3.5 border-glass"
          >
            <Plus size={16} />
            Create Private Room
          </Button>
          <Button 
            variant="secondary" 
            size="lg" 
            onClick={() => navigate('/join')}
            className="flex gap-2.5 items-center justify-center font-bold text-sm tracking-wider uppercase py-3.5"
          >
            <Users size={16} />
            Join Private Room
          </Button>
        </div>
      </div>
    </div>
  );
};
export default Landing;
