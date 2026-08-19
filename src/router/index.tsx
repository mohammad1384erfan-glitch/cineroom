import { createBrowserRouter } from 'react-router-dom';
import { Landing } from '@/pages/Landing';
import { CreateRoom } from '@/pages/CreateRoom';
import { JoinRoom } from '@/pages/JoinRoom';
import { Room } from '@/pages/Room';
import { NotFound } from '@/pages/NotFound';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Landing />,
  },
  {
    path: '/create',
    element: <CreateRoom />,
  },
  {
    path: '/join',
    element: <JoinRoom />,
  },
  {
    path: '/join/:code',
    element: <JoinRoom />,
  },
  {
    path: '/room/:id',
    element: <Room />,
  },
  {
    path: '*',
    element: <NotFound />,
  },
]);
