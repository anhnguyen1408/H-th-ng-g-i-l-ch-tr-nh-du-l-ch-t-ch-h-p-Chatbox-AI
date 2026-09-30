let io;

export const initSocket = (socketIo) => {
  io = socketIo;
  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};
