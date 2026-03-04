import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

interface MoScriptsTooltipProps {
  children: React.ReactNode;
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
  delay?: number;
}

export default function MoScriptsTooltip({
  children,
  title,
  description,
  position = "bottom",
  delay = 400,
}: MoScriptsTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const enterTimer = useRef<ReturnType<typeof setTimeout>>();
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>();

  const calcPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 10;

    let x = 0, y = 0;
    switch (position) {
      case "top":
        x = r.left + r.width / 2;
        y = r.top - gap;
        break;
      case "bottom":
        x = r.left + r.width / 2;
        y = r.bottom + gap;
        break;
      case "left":
        x = r.left - gap;
        y = r.top + r.height / 2;
        break;
      case "right":
        x = r.right + gap;
        y = r.top + r.height / 2;
        break;
    }
    setCoords({ x, y });
  }, [position]);

  const show = useCallback(() => {
    clearTimeout(leaveTimer.current);
    enterTimer.current = setTimeout(() => {
      calcPosition();
      setVisible(true);
    }, delay);
  }, [delay, calcPosition]);

  const hide = useCallback(() => {
    clearTimeout(enterTimer.current);
    leaveTimer.current = setTimeout(() => setVisible(false), 150);
  }, []);

  useEffect(() => {
    return () => {
      clearTimeout(enterTimer.current);
      clearTimeout(leaveTimer.current);
    };
  }, []);

  const transformOrigin: Record<string, string> = {
    top: "bottom center",
    bottom: "top center",
    left: "center right",
    right: "center left",
  };

  const translate: Record<string, string> = {
    top: "translate(-50%, -100%)",
    bottom: "translate(-50%, 0)",
    left: "translate(-100%, -50%)",
    right: "translate(0, -50%)",
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="inline-block"
      >
        {children}
      </div>

      {visible &&
        createPortal(
          <div
            onMouseEnter={() => clearTimeout(leaveTimer.current)}
            onMouseLeave={hide}
            className="fixed z-[9999] pointer-events-auto"
            style={{
              left: coords.x,
              top: coords.y,
              transform: translate[position],
            }}
          >
            <div
              className="w-72 rounded-2xl border border-border/40 shadow-2xl overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, hsla(220, 18%, 12%, 0.75) 0%, hsla(220, 20%, 8%, 0.8) 100%)",
                backdropFilter: "blur(24px) saturate(1.4)",
                WebkitBackdropFilter: "blur(24px) saturate(1.4)",
                boxShadow:
                  "0 8px 32px hsla(0, 0%, 0%, 0.4), inset 0 1px 0 hsla(210, 20%, 95%, 0.06)",
                transformOrigin: transformOrigin[position],
                animation: "tooltipIn 0.18s ease-out",
              }}
            >
              {/* Inner glow accent line */}
              <div
                className="h-[1px] w-full"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 5%, hsl(var(--primary) / 0.5) 50%, transparent 95%)",
                }}
              />

              <div className="px-4 py-3 space-y-2">
                {/* Header */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground tracking-wide">
                    {title}
                  </span>
                  <span className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-medium">
                    intel
                  </span>
                </div>

                {/* Description */}
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {description}
                </p>

                {/* Footer */}
                <div className="flex items-center gap-1.5 pt-1 border-t border-border/20">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-pulse" />
                  <span className="text-[9px] text-muted-foreground/50 font-mono">
                    MoScripts Intelligence
                  </span>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
