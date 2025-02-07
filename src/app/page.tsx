'use client';

import { useState, useEffect, useRef } from 'react';

const CANVAS_WIDTH = parseInt(process.env.NEXT_PUBLIC_CANVAS_WIDTH || '800', 10);
const CANVAS_HEIGHT = parseInt(process.env.NEXT_PUBLIC_CANVAS_HEIGHT || '800', 10);
const BOX_SIZE = 50;
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
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const GRID_COLS = Math.floor(CANVAS_WIDTH / BOX_SIZE);
  const GRID_ROWS = Math.floor(CANVAS_HEIGHT / BOX_SIZE);
  const totalBoxes = GRID_ROWS * GRID_COLS;

  useEffect(() => {
    const connectWebSocket = () => {
      try {
        setConnectionStatus('connecting');
        console.log('Attempting to connect to WebSocket...');
        
        const socket = new WebSocket(WS_URL);
        wsRef.current = socket;
        setWs(socket);

        socket.onopen = () => {
          console.log('WebSocket connected successfully');
          setConnectionStatus('connected');
          // Clear any existing reconnection timeout
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
        };

        socket.onclose = (event) => {
          console.log('WebSocket disconnected:', event.code, event.reason);
          setConnectionStatus('disconnected');
          wsRef.current = null;
          setWs(null);
          
          // Attempt to reconnect after 5 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('Attempting to reconnect...');
            connectWebSocket();
          }, 5000);
        };

        socket.onerror = (error) => {
          console.log('WebSocket error occurred. Details:', {
            error,
            readyState: socket.readyState,
            url: socket.url
          });
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
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
      } catch (error) {
        console.error('Error creating WebSocket connection:', error);
        setConnectionStatus('disconnected');
        
        // Attempt to reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 5000);
      }
    };

    connectWebSocket();

    // Cleanup function
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleMouseMove = (event: React.MouseEvent) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = Math.round(event.clientX - rect.left);
      const y = Math.round(event.clientY - rect.top);

      setMousePosition({ x, y });
      try {
        wsRef.current.send(JSON.stringify({ x, y }));
      } catch (error) {
        console.error('Error sending mouse position:', error);
      }
    }
  };

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
  };

  // Get connection status color
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
    <div className="min-h-screen w-full bg-gray-900 overflow-auto flex justify-center items-center p-4">
      {/* Connection Status */}
      <div className={`fixed top-2 right-2 ${getStatusColor()} font-bold`}>
        {connectionStatus.toUpperCase()}
      </div>

      <div
        ref={canvasRef}
        className="relative grid gap-[1px] bg-gray-800"
        style={{
          width: `${CANVAS_WIDTH}px`,
          height: `${CANVAS_HEIGHT}px`,
          gridTemplateColumns: `repeat(${GRID_COLS}, ${BOX_SIZE}px)`,
          gridTemplateRows: `repeat(${GRID_ROWS}, ${BOX_SIZE}px)`
        }}
        onMouseMove={handleMouseMove}
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

        {/* Render cursors */}
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

      <div className="fixed top-4 left-4 text-white space-y-2">
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