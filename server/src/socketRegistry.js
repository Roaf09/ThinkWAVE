/* FILE GUIDE:
 * server/src/socketRegistry.js
 * Purpose: Lets REST route handlers (which don't otherwise have access to
 * the Socket.IO server instance) emit realtime events - e.g. broadcasting an
 * updated assignment leaderboard the moment a student submits.
 */

let ioInstance = null;

export function setIO(io) {
  ioInstance = io;
}

export function getIO() {
  return ioInstance;
}
