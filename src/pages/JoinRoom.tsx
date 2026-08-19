import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Film, ArrowLeft, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useRoomStore } from '@/store/useRoomStore';

const MOCK_AVATARS = ['🐼', '🐱', '🐶', '🦊', '🐯', '🐨'];

export const JoinRoom: React.FC = () => {
  const navigate = useNavigate();
  const { code: urlCode } = useParams<{ code?: string }>();
  const roomStore = useRoomStore();

  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('🐼');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (urlCode) {
      setCode(urlCode.toUpperCase());
    }
  }, [urlCode]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const trimmedCode = code.trim().toUpperCase();
    const trimmedNick = nickname.trim();

    if (!trimmedCode || trimmedCode.length !== 6) {
      setFormError('Room code must be exactly 6 alphanumeric characters.');
      return;
    }

    if (!trimmedNick) {
      setFormError('Please enter a display nickname.');
      return;
    }

    try {
      await roomStore.joinRoom(
        trimmedCode, 
        trimmedNick, 
        selectedAvatar, 
        password || undefined
      );

      const activeRoom = useRoomStore.getState().room;
      if (activeRoom) {
        // Clear any previous CSS theme classes on join
        document.body.className = document.body.className
          .replace(/theme-\w+/g, '')
          .trim();
        if (activeRoom.theme && activeRoom.theme !== 'cinema') {
          document.body.classList.add(`theme-${activeRoom.theme}`);
        }
        navigate(`/room/${activeRoom.id}`);
      }
    } catch (err: any) {
      // Security Check: Do not reveal whether room exists through specific errors
      if (err.message.includes('not found') || err.message.includes('password') || err.message.includes('Incorrect')) {
        setFormError('Unable to join room. Please verify the code and password.');
      } else {
        setFormError(err.message || 'Failed to join the watch party.');
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden bg-black select-none">
      {/* Background radial glow */}
      <div className="absolute bottom-[-20%] left-[50%] -translate-x-[50%] w-[600px] h-[600px] rounded-full bg-brand-primary/10 blur-[130px] pointer-events-none" />

      {/* Back Button */}
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={() => navigate('/')} 
        className="absolute top-6 left-6 flex gap-2 items-center text-brand-text-muted hover:text-white"
      >
        <ArrowLeft size={16} />
        Back
      </Button>

      {/* Main card */}
      <Card className="w-full max-w-md z-10 animate-fade-in my-10" glow>
        <CardHeader className="flex flex-col items-center gap-1 text-center">
          <div className="w-10 h-10 rounded-lg bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary mb-2">
            <Film size={20} />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white font-serif">Join watch party</h2>
          <p className="text-xs text-brand-text-muted">Enter the private credentials to connect.</p>
        </CardHeader>
        
        <form onSubmit={handleJoin}>
          <CardContent className="flex flex-col gap-4">
            {formError && (
              <div className="p-3 text-xs bg-red-950/20 border border-red-500/25 rounded-lg text-red-400 font-medium">
                {formError}
              </div>
            )}

            {/* Room Code */}
            <Input 
              label="Room Access Code"
              type="text"
              placeholder="e.g. A4D8EG"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              required
              className="text-center font-bold text-lg tracking-widest"
            />

            {/* Nickname and Avatar */}
            <div className="grid grid-cols-2 gap-4">
              <Input 
                label="Your Nickname"
                type="text"
                placeholder="e.g. Guest Bob"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={15}
                required
              />
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-brand-text-muted">
                  Choose Avatar
                </span>
                <div className="grid grid-cols-3 gap-2 bg-brand-bg-input/60 p-1.5 rounded-lg border border-glass">
                  {MOCK_AVATARS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setSelectedAvatar(emoji)}
                      className={`
                        w-8 h-8 rounded flex items-center justify-center text-lg select-none
                        transition-all duration-300 active:scale-90
                        ${selectedAvatar === emoji 
                          ? 'bg-brand-primary/20 border border-brand-primary shadow-[0_0_8px_rgb(var(--color-primary-glow)/0.4)]' 
                          : 'border border-transparent hover:bg-white/5'
                        }
                      `}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Room Password */}
            <Input 
              label="Room Password (If Secured)"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              helperText="Only fill if this watch room requires authentication"
              maxLength={20}
              className="tracking-widest"
            />
          </CardContent>

          <CardFooter className="flex flex-col gap-2">
            <Button 
              type="submit" 
              variant="primary" 
              fullWidth
              isLoading={roomStore.isConnecting}
              className="flex gap-2 items-center justify-center font-bold uppercase tracking-wider text-xs"
            >
              <LogIn size={15} />
              Connect to CineRoom
            </Button>
            <span className="text-[10px] text-zinc-500 text-center select-none block">
              P2P connections are established immediately upon entry.
            </span>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
export default JoinRoom;
