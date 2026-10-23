// Resize/rotate the presentation without changing the Java framebuffer or RMS.
export function createDisplayLayout(canvas, onGeometry) {
  let rotation = 0,
    integerScale = true,
    frame = 0,
    lastGeometry = "";
  const fit = () => {
    frame = 0;
    const width = canvas.width,
      height = canvas.height;
    const odd = rotation % 180 !== 0;
    const displayWidth = odd ? height : width,
      displayHeight = odd ? width : height;
    const viewportWidth = document.documentElement.clientWidth || innerWidth;
    const viewportHeight = Math.min(
      document.documentElement.clientHeight || innerHeight,
      window.visualViewport?.height || innerHeight,
    );
    if (!width || !height || !viewportWidth || !viewportHeight) return;
    let scale = Math.min(
      viewportWidth / displayWidth,
      viewportHeight / displayHeight,
    );
    if (integerScale && scale >= 1) scale = Math.floor(scale);
    Object.assign(canvas.style, {
      position: "absolute",
      left: "50%",
      top: "50%",
      width: width + "px",
      height: height + "px",
      zoom: "",
      transformOrigin: "center",
      transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})`,
    });
    canvas.dataset.rotation = String(rotation);
    const geometry = { width: displayWidth, height: displayHeight, rotation };
    const signature = JSON.stringify(geometry);
    if (signature !== lastGeometry) {
      lastGeometry = signature;
      onGeometry(geometry);
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(fit);
  };
  const resize = new ResizeObserver(schedule);
  resize.observe(document.documentElement);
  const size = new MutationObserver(schedule);
  size.observe(canvas, {
    attributes: true,
    attributeFilter: ["width", "height"],
  });
  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);
  window.visualViewport?.addEventListener("resize", schedule);
  return {
    update(options = {}) {
      rotation = options.rotation ?? rotation;
      integerScale = options.integerScale ?? integerScale;
      schedule();
    },
    dispose() {
      cancelAnimationFrame(frame);
      resize.disconnect();
      size.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    },
  };
}
