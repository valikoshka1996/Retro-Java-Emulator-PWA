// MIDP Canvas exposes one logical pointer. Other fingers may independently hold
// keypad buttons, but must not steal an active gesture on the game display.
export function attachPointerInput(canvas, queue, enabled) {
  let active = null,
    last = { x: 0, y: 0 };
  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          canvas.width - 1,
          Math.floor(
            ((event.clientX - rect.left) * canvas.width) / (rect.width || 1),
          ),
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          canvas.height - 1,
          Math.floor(
            ((event.clientY - rect.top) * canvas.height) / (rect.height || 1),
          ),
        ),
      ),
    };
  };
  const emit = (kind, p) => queue.queueEvent({ kind, ...p });
  const release = () => {
    if (active === null) return;
    const id = active;
    active = null;
    emit("pointerreleased", last);
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  };
  canvas.style.touchAction = "none";
  canvas.style.userSelect = "none";
  canvas.style.webkitUserSelect = "none";
  canvas.style.webkitTouchCallout = "none";
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("dragstart", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (
      !enabled() ||
      active !== null ||
      (e.pointerType === "mouse" && e.button !== 0)
    )
      return;
    active = e.pointerId;
    last = point(e);
    canvas.setPointerCapture(active);
    canvas.focus();
    emit("pointerpressed", last);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (active !== e.pointerId) return;
    e.preventDefault();
    last = point(e);
    emit("pointerdragged", last);
  });
  canvas.addEventListener("pointerup", (e) => {
    if (active === e.pointerId) {
      last = point(e);
      release();
    }
  });
  canvas.addEventListener("pointercancel", (e) => {
    if (active === e.pointerId) release();
  });
  canvas.addEventListener("lostpointercapture", (e) => {
    if (active === e.pointerId) release();
  });
  window.addEventListener("blur", release);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) release();
  });
  return release;
}
