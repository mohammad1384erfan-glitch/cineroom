import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';

export const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-black relative">
      <div className="absolute top-[-10%] left-[50%] -translate-x-[50%] w-[450px] h-[450px] bg-red-950/20 blur-[100px] pointer-events-none" />

      <Card className="w-full max-w-md z-10 text-center py-8" glow>
        <CardContent className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-red-600/10 border border-red-500/25 flex items-center justify-center text-red-500 mb-2">
            <ShieldAlert size={26} />
          </div>
          
          <h1 className="text-5xl font-extrabold text-white tracking-tight font-serif">404</h1>
          <h2 className="text-lg font-bold text-white">Scene Not Found</h2>
          
          <p className="text-xs text-brand-text-muted max-w-xs leading-relaxed">
            The page you are looking for does not exist or you attempted to enter an expired/invalid private CineRoom code.
          </p>

          <Button 
            variant="outline" 
            size="md" 
            onClick={() => navigate('/')} 
            className="mt-4 flex gap-2 items-center"
          >
            <Home size={15} />
            Return to Lobby
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
export default NotFound;
