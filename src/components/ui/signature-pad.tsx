import React, { useRef, useEffect, useState } from 'react';
import { Button } from './button';
import { Trash2, RotateCcw } from 'lucide-react';

interface SignaturePadProps {
  value?: string;
  onChange: (signature: string) => void;
  width?: number;
  height?: number;
  className?: string;
  disabled?: boolean;
  showLabel?: boolean;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  value,
  onChange,
  width = 400,
  height = 200,
  className = '',
  disabled = false,
  showLabel = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Set drawing styles
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Load existing signature if provided
    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        setHasSignature(true);
      };
      img.src = value;
    }
  }, [value, width, height]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.nativeEvent instanceof MouseEvent ? e.nativeEvent.clientX : e.nativeEvent.touches[0].clientX) - rect.left;
    const y = (e.nativeEvent instanceof MouseEvent ? e.nativeEvent.clientY : e.nativeEvent.touches[0].clientY) - rect.top;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(x * scaleX, y * scaleY);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.nativeEvent instanceof MouseEvent ? e.nativeEvent.clientX : e.nativeEvent.touches[0].clientX) - rect.left;
    const y = (e.nativeEvent instanceof MouseEvent ? e.nativeEvent.clientY : e.nativeEvent.touches[0].clientY) - rect.top;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(x * scaleX, y * scaleY);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    
    setIsDrawing(false);
    setHasSignature(true);
    
    // Save signature as data URL
    const canvas = canvasRef.current;
    if (canvas) {
      const dataURL = canvas.toDataURL('image/png');
      onChange(dataURL);
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    setHasSignature(false);
    onChange('');
  };

  return (
    <div className={`signature-pad ${className}`}>
      <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className={`cursor-crosshair ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
          style={{ display: 'block', width: '100%', height: 'auto' }}
        />
      </div>
      
      <div className="flex items-center justify-between mt-3">
        <div className="text-sm text-gray-600">
          {hasSignature ? 'Signature captured' : 'Sign above'}
        </div>
        <div className="flex space-x-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearSignature}
            disabled={disabled || !hasSignature}
            className="text-gray-600 hover:text-gray-800"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
};
