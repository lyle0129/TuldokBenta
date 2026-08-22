// utils/bodyScrollLock.js
// Stops the page behind an overlay from scrolling.

/**
 * Body scroll lock, counted across every overlay rather than saved and restored
 * by each one.
 *
 * Each Modal used to capture `document.body.style.overflow` when it opened and
 * write that value back when it closed. Overlays in this app overlap — an edit
 * sheet and its confirm prompt, the cart and its unclaimed-freebie warning, the
 * nav drawer over any of them — and the second to open captured "hidden" from
 * the first. Whichever unmounted last then wrote "hidden" back, and the page
 * stayed unscrollable until a reload.
 *
 * With a count, only the first overlay stores the real value and only the last
 * one out restores it, so the order they close in stops mattering. It lives in
 * its own module so the nav drawer — which is no kind of dialog and needs
 * completely different geometry — shares the same counter instead of running a
 * rival one, which would be the original bug all over again.
 *
 * @returns {() => void} release, safe to use directly as an effect cleanup
 */
let openCount = 0;
let overflowBeforeLock = "";

export const lockBodyScroll = () => {
  if (openCount === 0) {
    overflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  openCount += 1;

  return () => {
    // Floored: a count that ever went negative would leave the page locked for
    // the rest of the session, which is the bug this replaced.
    openCount = Math.max(0, openCount - 1);
    if (openCount === 0) document.body.style.overflow = overflowBeforeLock;
  };
};
