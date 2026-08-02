import React, { useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';

export function formatThaiDate(dateString: string): string {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length !== 3) return dateString;
  const year = parseInt(parts[0], 10);
  const thaiYear = year + 543;
  return `${parts[2]}/${parts[1]}/${thaiYear}`; // DD/MM/YYYY (BE)
}

export function parseThaiDate(thaiDateString: string): string {
  const parts = thaiDateString.split('/');
  if (parts.length !== 3) return '';
  
  const day = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  let year = parseInt(parts[2], 10);
  
  if (isNaN(year)) return '';
  
  // Convert Buddhist Era to CE
  if (year > 2400) year -= 543;
  
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  if (d < 1 || d > 31 || m < 1 || m > 12) return '';

  return `${year}-${month}-${day}`;
}

interface ThaiDatePickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
}

export const ThaiDatePicker: React.FC<ThaiDatePickerProps> = ({ 
  value, 
  onChange, 
  className = "",
  ...props 
}) => {
  const [inputValue, setInputValue] = useState('');
  
  useEffect(() => {
    const formatted = formatThaiDate(value);
    if (parseThaiDate(inputValue) !== value) {
      setInputValue(formatted);
    }
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^\d]/g, ''); 
    if (val.length > 8) val = val.slice(0, 8);
    
    let formatted = val;
    if (val.length > 2) {
      formatted = val.slice(0, 2) + '/' + val.slice(2);
    }
    if (val.length > 4) {
      formatted = val.slice(0, 2) + '/' + val.slice(2, 4) + '/' + val.slice(4);
    }
    
    setInputValue(formatted);
    
    if (val.length === 8) {
      const parsedIso = parseThaiDate(formatted);
      if (parsedIso) {
        onChange({
          target: { value: parsedIso, name: props.name }
        } as React.ChangeEvent<HTMLInputElement>);
      }
    } else if (val.length === 0) {
      onChange({
        target: { value: '', name: props.name }
      } as React.ChangeEvent<HTMLInputElement>);
    }
  };

  const handleNativeDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e);
  };

  return (
    <div className={`relative flex items-center ${className}`}>
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        placeholder="วว/ดด/ปปปป (พ.ศ.)"
        className="w-full h-full bg-transparent outline-none border-none p-0 m-0 focus:ring-0 text-slate-900 placeholder:text-slate-400"
        style={{ fontSize: 'inherit', fontWeight: 'inherit', color: '#0f172a', WebkitTextFillColor: '#0f172a' }}
        {...props}
      />
      
      <div className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center">
        <Calendar size={18} className="text-slate-400 pointer-events-none" />
        <input
          type="date"
          value={value || ''}
          onChange={handleNativeDateChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
};
