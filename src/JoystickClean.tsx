import { useRef, useCallback } from 'react';
import { Joystick as JoystickComponent } from 'react-joystick-component';
import './Joystick.css';

interface JoystickProps {
  linearMul: number;
  angularMul: number;
  onMove: (linear: number, angular: number) => void;
  onEnd: () => void;
  onStatusUpdate: (text: string, color?: string) => void;
}

function Joystick({ 
  linearMul, 
  angularMul, 
  onMove, 
  onEnd, 
  onStatusUpdate 
}: JoystickProps) {
  const lastMoveTime = useRef<number>(0);

  // Apply smooth exponential easing for better control
  const applyEasing = (value: number): number => {
    const normalized = value / 100; // -1 to 1
    const sign = Math.sign(normalized);
    const abs = Math.abs(normalized);
    const eased = abs * abs;
    return sign * eased;
  };

  const handleMove = useCallback((event: any) => {
    if (event.x === null || event.y === null) return;

    const now = Date.now();
    if (now - lastMoveTime.current < 30) return;
    lastMoveTime.current = now;

    const easedY = applyEasing(event.y);
    const easedX = applyEasing(event.x);

    const lin = easedY * linearMul;
    const ang = -easedX * angularMul;

    if (Math.abs(lin) > 0.01 || Math.abs(ang) > 0.01) {
      onMove(lin, ang);
      onStatusUpdate('Active 🟢');
    }
  }, [linearMul, angularMul, onMove, onStatusUpdate]);

  const handleStop = useCallback(() => {
    onEnd();
    onStatusUpdate('Idle ⚪', '#ccc');
  }, [onEnd, onStatusUpdate]);

  return (
      <JoystickComponent
        size={200}
        baseColor="rgba(0, 255, 204, 0.15)"
        stickColor="#00ffcc"
        move={handleMove}
        stop={handleStop}
        throttle={30}
        baseImage=""
        stickImage=""
      />
  );
}

export default Joystick;
