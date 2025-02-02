'use client';

import { useState, useEffect, useRef } from 'react';

const CANVAS_WIDTH = parseInt(process.env.NEXT_PUBLIC_CANVAS_WIDTH || '800', 10);
const CANVAS_HEIGHT = parseInt(process.env.NEXT_PUBLIC_CANVAS_HEIGHT || '800', 10);
const BOX_SIZE = 50;
const WS_URL = 'ws://localhost:8765';

export default function Home() {
  const [selectedBoxes, setSelectedBoxes] = useState<Set<number>>(new Set());
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
  const [broadcastedPositions, setBroadcastedPositions] = useState<{ x: number, y: number }[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);

  const GRID_COLS = Math.floor(CANVAS_WIDTH / BOX_SIZE);
  const GRID_ROWS = Math.floor(CANVAS_HEIGHT / BOX_SIZE);
  const totalBoxes = GRID_ROWS * GRID_COLS;

  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    setWs(socket);

    socket.onopen = () => console.log('WebSocket connected');
    socket.onclose = () => console.log('WebSocket disconnected');
    socket.onerror = (error) => console.error('WebSocket error:', error);

    socket.onmessage = (event) => {
      console.log('Message from server:', event.data);
      const data = JSON.parse(event.data);
      if (data.status === "success") {
        setBroadcastedPositions(prev => [...prev, { x: data.x, y: data.y }]);
      } else {
        console.error("Server error:", data.message);
      }
    };

    return () => {
      socket.close();
    };
  }, []);

  const handleMouseMove = (event: React.MouseEvent) => {
    if (ws && ws.readyState === WebSocket.OPEN && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      setMousePosition({ x, y });
      ws.send(JSON.stringify({ x, y }));
    }
  };

  const handleBoxClick = (index: number) => {
    setSelectedBoxes(prev => {
      const newSet = new Set(prev);
      newSet.has(index) ? newSet.delete(index) : newSet.add(index);
      return newSet;
    });
  };

  return (
    <div className="h-screen w-screen bg-white dark:bg-black overflow-auto flex justify-center items-center">
      <div
        ref={canvasRef}
        className="grid gap-[1px]"
        style={{ width: `${CANVAS_WIDTH}px`, height: `${CANVAS_HEIGHT}px`, gridTemplateColumns: `repeat(${GRID_COLS}, ${BOX_SIZE}px)`, gridTemplateRows: `repeat(${GRID_ROWS}, ${BOX_SIZE}px)` }}
        onMouseMove={handleMouseMove}
      >
        {Array.from({ length: totalBoxes }, (_, index) => (
          <div
            key={index}
            onClick={() => handleBoxClick(index)}
            className={`
              w-[${BOX_SIZE}px] h-[${BOX_SIZE}px] cursor-pointer transition-colors
              ${selectedBoxes.has(index)
                ? 'bg-blue-500'
                : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700'}
            `}
          />
        ))}
      </div>

      <div style={{ position: 'absolute', top: '10px', left: '10px', color: 'white' }}>
        Local Mouse position: X={mousePosition.x}, Y={mousePosition.y}
      </div>

      <div style={{ position: 'absolute', top: '40px', left: '10px', color: 'white' }}>
        <h3>Broadcasted Mouse positions:</h3>
        {broadcastedPositions.map((position, index) => (
          <div key={index}>
            X={position.x}, Y={position.y}
          </div>
        ))}
      </div>
    </div>
  );
}