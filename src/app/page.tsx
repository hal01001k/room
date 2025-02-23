'use client';

import { useState, useEffect, useRef } from 'react';

const CANVAS_WIDTH = parseInt(process.env.NEXT_PUBLIC_CANVAS_WIDTH || '1400', 10); // 16:10 ratio width
const CANVAS_HEIGHT = Math.round(CANVAS_WIDTH * 7 / 16); // Calculate height based on 16:10 ratio
const BOX_SIZE = 50;
const PADDING = 5; // Padding between boxes
const WS_URL = 'ws://localhost:8765';

interface CursorPosition {
  x: number;
  y: number;
  source?: string;
}

export default function Home() {
  const [selectedBoxes, setSelectedBoxes] = useState<Set<number>>(new Set());
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [mousePosition, setMousePosition] = useState<CursorPosition>({ x: 0, y: 0 });
  const [broadcastedPositions, setBroadcastedPositions] = useState<{ [key: string]: CursorPosition }>({});
  const canvasRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const GRID_COLS = Math.floor(CANVAS_WIDTH / (BOX_SIZE + PADDING));
  const GRID_ROWS = Math.floor(CANVAS_HEIGHT / (BOX_SIZE + PADDING));
  const totalBoxes = GRID_ROWS * GRID_COLS;

  const sendPacket = (() => {
    let lastSent = 0;
    return (data: { type: string; x?: number; y?: number; index?: number; additionalData: string }) => {
      const now = Date.now();
      if (now - lastSent >= 500 && wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify(data));
          lastSent = now;
        } catch (error) {
          console.error('Error sending packet:', error);
        }
      }
    };
  })();

  useEffect(() => {
    const connectWebSocket = () => {
      setConnectionStatus('connecting');
      console.log('Attempting to connect to WebSocket...');
      
      const socket = new WebSocket(WS_URL);
      wsRef.current = socket;
      setWs(socket);

      socket.onopen = () => {
        console.log('WebSocket connected successfully');
        setConnectionStatus('connected');
        clearTimeout(reconnectTimeoutRef.current);
      };

      socket.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setConnectionStatus('disconnected');
        wsRef.current = null;
        setWs(null);
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 5000);
      };

      socket.onerror = (error) => {
        console.log('WebSocket error occurred. Details:', { error, readyState: socket.readyState, url: socket.url });
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received WebSocket message:', data);
          if (data.status === "success" && data.source) {
            setBroadcastedPositions(prev => ({
              ...prev,
              [data.source]: { x: data.x, y: data.y, source: data.source }
            }));
          } else {
            console.warn("Received message with unexpected format:", data);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };
    };

    connectWebSocket();

    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const x = Math.round(event.pageX);
      const y = Math.round(event.pageY);
      setMousePosition({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      sendPacket({ type: 'mousemove', x: mousePosition.x, y: mousePosition.y, additionalData: 'exampleData' });
    }, 500);

    return () => clearInterval(interval);
  }, [mousePosition, sendPacket]);

  const handleBoxClick = (index: number) => {
    setSelectedBoxes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });

    sendPacket({ type: 'boxclick', index, additionalData: 'exampleData' });
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'text-green-500';
      case 'connecting':
        return 'text-yellow-500';
      case 'disconnected':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className="min-h-screen w-full bg-gray-900 overflow-auto flex justify-center items-center p-4 relative">
      <div className="wave-background absolute inset-0 z-0"></div>
      <div className={`fixed top-2 right-2 ${getStatusColor()} font-bold z-10`}>
        {connectionStatus.toUpperCase()}
      </div>

      <div
        ref={canvasRef}
        className="relative grid gap-[6px] bg-gray-794 hidden md:grid z-10"
        style={{
          width: `${CANVAS_WIDTH}px`,
          height: `${CANVAS_HEIGHT}px`,
          gridTemplateColumns: `repeat(${GRID_COLS}, ${BOX_SIZE}px)`,
          gridTemplateRows: `repeat(${GRID_ROWS}, ${BOX_SIZE}px)`,
        }}
      >
        {Array.from({ length: totalBoxes }, (_, index) => (
          <div
            key={index}
            onClick={() => handleBoxClick(index)}
            className={`
              cursor-pointer transition-colors
              ${selectedBoxes.has(index)
                ? 'bg-blue-500'
                : 'bg-gray-700 hover:bg-gray-600'}
            `}
          />
        ))}

        {Object.values(broadcastedPositions).map((position, index) => (
          <div
            key={position.source || index}
            className="absolute w-4 h-4 bg-red-500 rounded-full transform -translate-x-2 -translate-y-2"
            style={{
              left: position.x,
              top: position.y,
            }}
          />
        ))}
      </div>

      <div className="fixed top-4 left-4 text-white space-y-2 hidden md:block z-10">
        <div>Local Mouse position: X={mousePosition.x}, Y={mousePosition.y}</div>
        <div>
          <h3 className="font-bold">Connected Cursors:</h3>
          {Object.values(broadcastedPositions).map((position, index) => (
            <div key={position.source || index}>
              Client {position.source}: X={position.x}, Y={position.y}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
