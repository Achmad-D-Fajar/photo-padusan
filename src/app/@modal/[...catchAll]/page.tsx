export default function CatchAllModal() {
  // Mengembalikan null memaksa Next.js untuk menghapus (unmount) modal 
  // ketika URL saat ini tidak lagi cocok dengan rute (..)photo/[id].
  return null;
}