import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Film, ArrowLeft, Settings, Palette } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useRoomStore } from '@/store/useRoomStore';

const MOCK_AVATARS = ['🐼', '🐱', '🐶', '🦊', '🐯', '🐨'];
const THEME_LABELS = {
  cinema: 'Cinema (Red Glow)',
  night: 'Night (Indigo Blue)',
  couple: 'Couple (Rose Pink)',
  gaming: 'Gaming (Emerald Green)',
  horror: 'Horror (Blood Crimson)',
  casual: 'Casual (Charcoal Grey)'
};

export const CreateRoom: React.FC = () => {
  const navigate = useNavigate();
  const roomStore = useRoomStore();

  const [nickname, setNickname] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('🐼');
  const [roomName, setRoomName] = useState('');
  const [capacity, setCapacity] = useState(4);
  const [password, setPassword] = useState('');
  const [theme, setTheme] = useState('cinema');
  const [formError, setFormError] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const trimmedNick = nickname.trim();
    if (!trimmedNick) {
      setFormError('Please enter a display nickname.');
      return;
    }

    if (capacity < 2 || capacity > 6) {
      setFormError('Capacity must be between 2 and 6.');
      return;
    }

    try {
      await roomStore.createRoom(
        roomName.trim() || `${trimmedNick}'s CineRoom`,
        capacity,
        password || undefined,
        trimmedNick,
        selectedAvatar,
        theme
      );

      // Extract generated room and route
      const activeRoom = useRoomStore.getState().room;
      if (activeRoom) {
        // Apply initial theme state locally to document html
        document.body.className = document.body.className
          .replace(/theme-\w+/g, '')
          .trim();
        if (theme !== 'cinema') {
          document.body.classList.add(`theme-${theme}`);
        }
        navigate(`/room/${activeRoom.id}`);
      }
    } catch (err: any) {
      setFormError(err.message || 'An error occurred during room initialization.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden bg-black select-none">
      {/* Background radial glow */}
      <div className="absolute top-[-20%] left-[50%] -translate-x-[50%] w-[600px] h-[600px] rounded-full bg-brand-primary/10 blur-[130px] pointer-events-none" />

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

      {/* Card wrapper */}
      <Card className="w-full max-w-md z-10 animate-fade-in my-10" glow>
        <CardHeader className="flex flex-col items-center gap-1 text-center">
          <div className="w-10 h-10 rounded-lg bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary mb-2">
            <Film size={20} />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white">Create Private Watch Party</h2>
          <p className="text-xs text-brand-text-muted">Enter host profile and room configurations.</p>
        </CardHeader>
        
        <form onSubmit={handleCreate}>
          <CardContent className="flex flex-col gap-4">
            {formError && (
              <div className="p-3 text-xs bg-red-950/20 border border-red-500/25 rounded-lg text-red-400 font-medium">
                {formError}
              </div>
            )}

            {/* Profile Grid */}
            <div className="grid grid-cols-2 gap-4">
              <Input 
                label="Your Nickname"
                type="text"
                placeholder="e.g. Host Bashir"
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

            {/* Room Name */}
            <Input 
              label="Room Name"
              type="text"
              placeholder="e.g. Marvel Sync Party"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              helperText="If empty, default is 'Nickname's CineRoom'"
              maxLength={30}
            />

            {/* Room Password */}
            <Input 
              label="Room Password (Optional)"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              helperText="Enforces password checks for other invitees"
              maxLength={20}
              className="tracking-widest"
            />

            {/* Configuration selection rows */}
            <div className="grid grid-cols-2 gap-4">
              {/* Capacity select */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-brand-text-muted">
                  Capacity Limit
                </label>
                <select 
                  value={capacity}
                  onChange={(e) => setCapacity(parseInt(e.target.value))}
                  className="px-4 py-2.5 rounded-lg text-sm bg-brand-bg-input/60 border border-glass text-brand-text-main focus:outline-none focus:border-brand-primary/50 focus:ring-1 focus:ring-brand-primary/20"
                >
                  <option value={2} className="bg-zinc-900">2 People</option>
                  <option value={3} className="bg-zinc-900">3 People</option>
                  <option value={4} className="bg-zinc-900">4 People</option>
                  <option value={5} className="bg-zinc-900">5 People</option>
                  <option value={6} className="bg-zinc-900">6 People (Max)</option>
                </select>
              </div>

              {/* Theme select */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-brand-text-muted flex gap-1 items-center">
                  <Palette size={12} />
                  Default Theme
                </label>
                <select 
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="px-4 py-2.5 rounded-lg text-sm bg-brand-bg-input/60 border border-glass text-brand-text-main focus:outline-none focus:border-brand-primary/50 focus:ring-1 focus:ring-brand-primary/20"
                >
                  {Object.entries(THEME_LABELS).map(([key, label]) => (
                    <option key={key} value={key} className="bg-zinc-900">{label}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-2">
            <Button 
              type="submit" 
              variant="primary" 
              fullWidth
              isLoading={roomStore.isConnecting}
              className="flex gap-2 items-center justify-center font-bold uppercase tracking-wider text-xs"
            >
              <Settings size={15} />
              Launch CineRoom
            </Button>
            <span className="text-[10px] text-zinc-500 text-center select-none block">
              Rooms are temporary and disappear once all participants leave.
            </span>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
export default CreateRoom;
