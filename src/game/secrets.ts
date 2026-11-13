import { ROOMS, type RoomId } from './world';

export const SECRET_ROOMS = Object.values(ROOMS).filter(room => Object.values(ROOMS).some(parent => parent.doors.some(door => door.hidden && door.to === room.id))).map(room => room.id);
export function unfinishedSecret(room: RoomId, defeated: readonly string[]): boolean {
    const secrets = SECRET_ROOMS.includes(room) ? [room] : ROOMS[room].doors.filter(door => door.hidden).map(door => door.to);
    return secrets.some(id => ROOMS[id].enemies.some(enemy => (enemy.kind === 'handcrab' || enemy.kind === 'hermit') && !defeated.includes(enemy.id)));
}
