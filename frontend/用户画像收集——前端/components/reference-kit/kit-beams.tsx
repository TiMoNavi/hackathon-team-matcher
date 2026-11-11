"use client";

import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import React, { useRef, useState, useEffect } from "react";

type BeamOptions = {
  initialX?: number;
  translateX?: number;
  initialY?: number;
  translateY?: number;
  rotate?: number;
  className?: string;
  duration?: number;
  delay?: number;
  repeatDelay?: number;
};

export function BackgroundBeamsWithCollision({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const beams: BeamOptions[] = [
    { initialX: 30, translateX: 30, duration: 7, repeatDelay: 3, delay: 2 },
    { initialX: 600, translateX: 600, duration: 3, repeatDelay: 3, delay: 4 },
    { initialX: 100, translateX: 100, duration: 7, repeatDelay: 7, className: "h-6" },
    { initialX: 400, translateX: 400, duration: 5, repeatDelay: 14, delay: 4 },
    { initialX: 800, translateX: 800, duration: 11, repeatDelay: 2, className: "h-20" },
    { initialX: 1000, translateX: 1000, duration: 4, repeatDelay: 2, className: "h-12" },
    { initialX: 1200, translateX: 1200, duration: 6, repeatDelay: 4, delay: 2, className: "h-6" }
  ];

  return (
    <div
      ref={parentRef}
      className={cn("relative flex w-full items-center justify-center overflow-hidden", className)}>
      {beams.map((beam, i) => (
        <CollisionBeam
          key={`beam-${i}`}
          beamOptions={beam}
          containerRef={containerRef}
          parentRef={parentRef}
        />
      ))}

      {children}

      <div
        ref={containerRef}
        className="pointer-events-none absolute bottom-0 w-full bg-neutral-100"
      />
    </div>
  );
}

function CollisionBeam({
  beamOptions = {},
  containerRef,
  parentRef
}: {
  beamOptions: BeamOptions;
  containerRef: React.RefObject<HTMLDivElement | null>;
  parentRef: React.RefObject<HTMLDivElement | null>;
}) {
  const beamRef = useRef<HTMLDivElement>(null);
  const [collision, setCollision] = useState<{
    detected: boolean;
    coordinates: { x: number; y: number } | null;
  }>({ detected: false, coordinates: null });

  const [beamKey, setBeamKey] = useState(0);
  const [cycleLock, setCycleLock] = useState(false);

  useEffect(() => {
    const check = () => {
      if (!beamRef.current || !containerRef.current || !parentRef.current || cycleLock) return;

      const beamRect = beamRef.current.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      const parentRect = parentRef.current.getBoundingClientRect();

      if (beamRect.bottom >= containerRect.top) {
        const relativeX = beamRect.left - parentRect.left + beamRect.width / 2;
        const relativeY = beamRect.bottom - parentRect.top;

        setCollision({ detected: true, coordinates: { x: relativeX, y: relativeY } });
        setCycleLock(true);
      }
    };

    const interval = setInterval(check, 50);
    return () => clearInterval(interval);
  }, [cycleLock, containerRef]);

  useEffect(() => {
    if (collision.detected) {
      const timer = setTimeout(() => {
        setCollision({ detected: false, coordinates: null });
        setCycleLock(false);
        setBeamKey((prev) => prev + 1); // restart animation
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [collision]);

  return (
    <>
      <motion.div
        key={beamKey}
        ref={beamRef}
        initial={{
          translateY: beamOptions.initialY ?? -200,
          translateX: beamOptions.initialX ?? 0,
          rotate: beamOptions.rotate ?? 0
        }}
        animate={{
          translateY: beamOptions.translateY ?? 1800,
          translateX: beamOptions.translateX ?? 0,
          rotate: beamOptions.rotate ?? 0
        }}
        transition={{
          duration: beamOptions.duration ?? 8,
          repeat: Infinity,
          repeatType: "loop",
          ease: "linear",
          delay: beamOptions.delay ?? 0,
          repeatDelay: beamOptions.repeatDelay ?? 0
        }}
        className={cn(
          "from-primary via-secondary absolute top-20 left-0 h-14 w-px rounded-full bg-gradient-to-t to-transparent",
          beamOptions.className
        )}
      />
      <AnimatePresence>
        {collision.detected && collision.coordinates && (
          <Explosion
            key={`explosion-${collision.coordinates.x}-${collision.coordinates.y}`}
            style={{
              left: `${collision.coordinates.x}px`,
              top: `${collision.coordinates.y}px`,
              transform: "translate(-50%, -50%)"
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function Explosion(props: React.HTMLProps<HTMLDivElement>) {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    dx: Math.floor(Math.random() * 80 - 40),
    dy: Math.floor(Math.random() * -50 - 10)
  }));

  return (
    <div {...props} className={cn("absolute z-50 h-2 w-2", props.className)}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
        className="via-primary absolute -inset-x-10 top-0 m-auto h-2 w-10 rounded-full bg-gradient-to-r from-transparent to-transparent blur-sm"
      />
      {particles.map((p) => (
        <motion.span
          key={p.id}
          initial={{ x: 0, y: 0, opacity: 1 }}
          animate={{ x: p.dx, y: p.dy, opacity: 0 }}
          transition={{ duration: Math.random() * 1.5 + 0.5, ease: "easeOut" }}
          className="bg-primary absolute h-1 w-1 rounded-full"
        />
      ))}
    </div>
  );
}
