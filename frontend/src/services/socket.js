import { io } from 'socket.io-client';

let socket = null;

export const getSocket = () => {
  if (!socket) {
    const token = localStorage.getItem('token');
    socket = io('/', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });

    socket.on('connect_error', (err) => {
      console.error('WebSocket connection error:', err.message);
    });
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const subscribeToServer = (serverId) => {
  const s = getSocket();
  s.emit('subscribe_server', serverId);
};

export const unsubscribeFromServer = (serverId) => {
  const s = getSocket();
  s.emit('unsubscribe_server', serverId);
};
