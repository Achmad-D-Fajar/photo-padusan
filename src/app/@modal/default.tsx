// Returned by Next.js when no intercepting route is active (e.g. on hard
// refresh, direct navigation, or any page that hasn't triggered the modal).
// Must exist — without it, the @modal slot throws an unmatched-slot error
// and breaks the entire route tree.
export default function ModalDefault(): null {
  return null;
}