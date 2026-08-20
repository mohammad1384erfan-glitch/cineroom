import React, { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { useRoomStore } from './store/useRoomStore';

export const App: React.FC = () => {
  const restoreSession = useRoomStore(state => state.restoreSession);

  useEffect(() => {
    // Check if a saved watchroom session exists to auto-restore
    restoreSession().then((restored) => {
      if (restored) {
        const activeRoom = useRoomStore.getState().room;
        if (activeRoom) {
          const currentPath = window.location.pathname;
          // Only redirect if they are currently on a setup page (landing or join)
          if (currentPath === '/' || currentPath.startsWith('/join') || currentPath.startsWith('/create')) {
            router.navigate(`/room/${activeRoom.id}`);
          }
        }
      }
    });
  }, [restoreSession]);

  return <RouterProvider router={router} />;
};

export default App;
