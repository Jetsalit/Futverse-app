import { useState, useRef, useEffect } from 'react';
import { 
  MousePointer2, Hand, Eraser, Undo2, Trash2, 
  Pencil, ArrowRight, Activity, ChevronLeft, Save, X,
  Upload, Image as ImageIcon, Camera
} from 'lucide-react';
import { Stage, Layer, Line, Circle, Image as KonvaImage, Arrow, Rect, Path, Group } from 'react-konva';
import useImage from 'use-image';
import { useDrillDatabase } from '../hooks/useDrillDatabase';

// Custom icons based on requirements
const RedTeamIcon = () => <div className="w-3.5 h-3.5 bg-red-500 rounded-full border border-red-700 shadow-sm" />;
const BlueTeamIcon = () => <div className="w-3.5 h-3.5 bg-blue-500 rounded-full border border-blue-700 shadow-sm" />;
const BallIcon = () => (
  <div className="w-4 h-4 bg-white border border-slate-800 rounded-full flex items-center justify-center shadow-sm">
    <div className="w-1.5 h-1.5 bg-slate-800 rounded-full flex flex-wrap gap-[1px]"></div>
  </div>
);
const ConeIcon = () => <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[12px] border-b-orange-500 drop-shadow-sm" />;
const GoalIcon = () => <div className="w-4 h-3 flex items-end justify-center border-t-[2px] border-x-[2px] border-slate-500 rounded-t-[2px]" />;
const HurdleIcon = () => <div className="w-5 h-2.5 border-t-[3px] border-x-[3px] border-yellow-400" />;
const LadderIcon = () => (
  <div className="flex gap-[2px]">
    <div className="w-[3px] h-4 bg-yellow-400" />
    <div className="w-[3px] h-4 bg-yellow-400" />
    <div className="w-[3px] h-4 bg-yellow-400" />
  </div>
);

const DashedLineIcon = () => <div className="w-4 border-b-[3px] border-dashed border-current" />;
const CurveLineIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 19c4-10 10-10 16 0" />
  </svg>
);

const MAIN_TOOLS = [
  { id: 'select', label: 'เลือก', icon: MousePointer2 },
  { id: 'pan', label: 'เลื่อนจอ', icon: Hand },
  { id: 'red', label: 'ทีมแดง', icon: RedTeamIcon },
  { id: 'blue', label: 'ทีมน้ำเงิน', icon: BlueTeamIcon },
  { id: 'ball', label: 'ลูกบอล', icon: BallIcon },
  { id: 'cone', label: 'กรวย', icon: ConeIcon },
  { id: 'mini_goal', label: 'มินิโกล', icon: GoalIcon },
  { id: 'hurdle', label: 'รั้วข้าม', icon: HurdleIcon },
  { id: 'ladder', label: 'บันไดลิง', icon: LadderIcon },
  { id: 'eraser', label: 'ยางลบ', icon: Eraser },
];

const DRAWING_TOOLS = [
  { id: 'freehand', icon: Pencil, label: 'วาดอิสระ' },
  { id: 'pass', icon: ArrowRight, label: 'ส่งบอล' },
  { id: 'dashed', icon: DashedLineIcon, label: 'เส้นประ' },
  { id: 'curve', icon: CurveLineIcon, label: 'เส้นโค้ง' },
  { id: 'dribble', icon: Activity, label: 'เลี้ยงบอล' },
];

const COLORS = [
  { id: 'white', hex: '#ffffff' },
  { id: 'yellow', hex: '#facc15' },
  { id: 'red', hex: '#ef4444' },
  { id: 'blue', hex: '#3b82f6' },
  { id: 'black', hex: '#1e293b' },
];

const BallNode = ({ el, onDragEnd, onClick, onTap }: any) => {
  const [image] = useImage('https://upload.wikimedia.org/wikipedia/commons/d/d3/Soccerball.svg', 'anonymous');
  return (
    <KonvaImage 
      image={image} 
      x={el.x} 
      y={el.y} 
      width={16} 
      height={16} 
      offsetX={8} 
      offsetY={8} 
      draggable 
      onDragEnd={(e) => onDragEnd(el.id, e)} 
      onClick={onClick}
      onTap={onTap}
    />
  );
};

export default function TacticBoard({ onBack }: { onBack: () => void }) {
  const [drillMode, setDrillMode] = useState<'digital' | 'upload'>('digital');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  const [activeTool, setActiveTool] = useState('select');
  const [activeLineTool, setActiveLineTool] = useState('freehand');
  const [activeColor, setActiveColor] = useState('#ffffff');
  const [fieldType, setFieldType] = useState('full');
  
  const { saveDrill } = useDrillDatabase();
  const [saveForm, setSaveForm] = useState({ 
    title: '', 
    category: 'Tactical', 
    is_shared: false,
    duration: '60 นาที',
    ageGroup: 'รุ่น U12',
    phase: 'Preparatory - General',
    trainingMethod: '',
    coachingPoints: ''
  });

  // Konva State
  const stageRef = useRef<any>(null);
  const [elements, setElements] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const isDrawing = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 500 });

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setStageSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMainToolClick = (toolId: string) => {
    if (['red', 'blue', 'ball', 'cone', 'mini_goal', 'hurdle', 'ladder'].includes(toolId)) {
      const x = stageSize.width / 2 + (Math.random() * 40 - 20);
      const y = stageSize.height / 2 + (Math.random() * 40 - 20);
      setElements([...elements, { id: Date.now().toString(), type: toolId, x, y }]);
      setActiveTool('select');
    } else {
      setActiveTool(toolId);
    }
  };

  const handleClear = () => {
    setElements([]);
    setLines([]);
  };

  const handleUndo = () => {
    if (lines.length > 0 && isDrawing.current === false) {
      setLines(lines.slice(0, -1));
    } else if (elements.length > 0) {
      setElements(elements.slice(0, -1));
    }
  };

  const handleElementClick = (e: any, id: string, type: 'element'|'line') => {
    if (activeTool === 'eraser') {
      if (type === 'element') setElements(elements.filter(el => el.id !== id));
      if (type === 'line') setLines(lines.filter(l => l.id !== id));
    }
  };

  const handleDragEnd = (id: string, e: any) => {
    if (activeTool === 'eraser') return;
    setElements(elements.map(el => {
      if (el.id === id) {
        return { ...el, x: e.target.x(), y: e.target.y() };
      }
      return el;
    }));
  };

  const handleMouseDown = (e: any) => {
    if (activeTool === 'eraser') return;
    if (activeTool !== 'draw') return;
    isDrawing.current = true;
    const pos = e.target.getStage().getPointerPosition();
    setLines([...lines, { id: Date.now().toString(), points: [pos.x, pos.y], color: activeColor, tool: activeLineTool }]);
  };

  const generateZigzag = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 15) return [x1, y1, x2, y2];
    const points = [];
    const wavelength = 20;
    const amplitude = 10;
    const noOfWaves = Math.max(2, Math.floor(dist / wavelength));
    
    for(let i=0; i<=noOfWaves; i++) {
       const t = i / noOfWaves;
       const px = x1 + dx * t;
       const py = y1 + dy * t;
       let offset = 0;
       if (i !== 0 && i !== noOfWaves) {
         offset = (i % 2 === 0 ? 1 : -1) * amplitude;
       }
       points.push(px - (dy/dist)*offset, py + (dx/dist)*offset);
    }
    return points;
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing.current || activeTool !== 'draw') return;
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    let lastLine = { ...lines[lines.length - 1] };
    
    if (['pass', 'dashed'].includes(lastLine.tool)) {
      lastLine.points = [lastLine.points[0], lastLine.points[1], point.x, point.y];
    } else if (lastLine.tool === 'curve') {
      const x1 = lastLine.points[0];
      const y1 = lastLine.points[1];
      const x2 = point.x;
      const y2 = point.y;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dist = Math.sqrt(dx*dx + dy*dy);
      // Create a nice arc by generating a single control point in the middle, pushed out orthogonally.
      if (dist > 10) {
        const mx = x1 + dx / 2;
        const my = y1 + dy / 2;
        // The normal vector
        const nx = -dy / dist;
        const ny = dx / dist;
        // Curve offset: 25% of the distance
        const offset = dist * 0.25; 
        lastLine.points = [x1, y1, mx + nx * offset, my + ny * offset, x2, y2];
      } else {
        lastLine.points = [x1, y1, x2, y2];
      }
    } else if (lastLine.tool === 'dribble') {
      lastLine.points = generateZigzag(lastLine.points[0], lastLine.points[1], point.x, point.y);
    } else {
      lastLine.points = lastLine.points.concat([point.x, point.y]);
    }
    
    setLines([...lines.slice(0, -1), lastLine]);
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveAll = () => {
    let finalPreviewImage = undefined;
    let finalCanvasData: any = undefined;

    if (drillMode === 'digital') {
      finalPreviewImage = stageRef.current ? stageRef.current.toDataURL({ pixelRatio: 2 }) : undefined;
      finalCanvasData = { elements, lines, fieldType };
    } else {
      finalPreviewImage = uploadedImage || undefined;
      finalCanvasData = null; // Mark as paper drill essentially
    }

    saveDrill({
      title: saveForm.title || 'Untitled Drill',
      category: saveForm.category,
      is_shared: saveForm.is_shared,
      duration: saveForm.duration,
      ageGroup: saveForm.ageGroup,
      phase: saveForm.phase,
      trainingMethod: saveForm.trainingMethod,
      coachingPoints: saveForm.coachingPoints,
      date: new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }),
      canvas_data: finalCanvasData,
      previewImage: finalPreviewImage
    });
    onBack();
  };

  return (
    <div className="w-full flex-1 flex flex-col animate-in fade-in duration-300 xl:h-[calc(100vh-100px)]">
      <div className="flex items-center gap-4 mb-4 shrink-0">
        <button 
          onClick={onBack}
          className="p-2 rounded-full hover:bg-slate-200 bg-white shadow-sm text-slate-600 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Practice Drill Planner</h1>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Design Tactics & Training Exercises</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button 
            onClick={handleSaveAll}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition shadow-sm"
          >
            <Save size={16} />
            <span className="hidden sm:inline">บันทึกแบบฝึกซ้อม</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col xl:flex-row gap-6 min-h-[500px]">
        {/* Board Container */}
        <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px]">
          
          {/* Tabs for Mode Selection */}
          <div className="flex bg-slate-50 border-b border-slate-200 p-2 gap-2">
            <button
              onClick={() => setDrillMode('digital')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${
                drillMode === 'digital' ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-200'
              }`}
            >
              <Pencil size={18} /> วาดบนกระดานดิจิทัล (Tacticboard)
            </button>
            <button
              onClick={() => setDrillMode('upload')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${
                drillMode === 'upload' ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-200'
              }`}
            >
              <Camera size={18} /> อัปโหลดจากสมุดโน้ต (Upload Photo)
            </button>
          </div>

          {drillMode === 'digital' ? (
            <>
              {/* Toolbars Container */}
              <div className="bg-slate-100 border-b border-slate-200 p-3 sm:p-4 flex flex-col gap-3 shrink-0 relative z-10">
          
          {/* Row 1: Main Toolbar */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-sm overflow-x-auto scrubber">
              {MAIN_TOOLS.map(tool => {
                const Icon = tool.icon;
                const isActive = activeTool === tool.id;
                return (
                  <button
                    key={tool.id}
                    onClick={() => handleMainToolClick(tool.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all whitespace-nowrap ${
                      isActive ? 'bg-blue-600 text-white shadow-sm font-medium' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon size={16} />
                    <span>{tool.label}</span>
                  </button>
                );
              })}
            </div>

            <button onClick={handleUndo} className="flex items-center gap-1.5 px-3 py-1.5 text-slate-600 hover:bg-slate-200 bg-white border border-slate-200 rounded-lg shadow-sm whitespace-nowrap shrink-0 transition-colors">
              <Undo2 size={16} /> 
              <span className="text-sm font-medium">Undo</span>
            </button>
          </div>

          {/* Row 2: Drawing Tools & Clear */}
          <div className="flex items-center gap-4 flex-wrap">
            <button onClick={handleClear} className="flex items-center gap-1.5 px-3 py-1.5 text-rose-600 hover:bg-rose-50 bg-white border border-rose-200 rounded-lg shadow-sm whitespace-nowrap shrink-0 transition-colors">
              <Trash2 size={16} /> 
              <span className="text-sm font-bold">Clear</span>
            </button>

            <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-slate-200 shadow-sm overflow-x-auto">
              <span className="text-xs font-bold text-slate-500 ml-2 mr-1">วาดเส้น:</span>
              
              {DRAWING_TOOLS.map(tool => {
                const Icon = tool.icon;
                const isActive = activeLineTool === tool.id && activeTool === 'draw'; 
                return (
                  <button
                    key={tool.id}
                    onClick={() => { setActiveLineTool(tool.id); setActiveTool('draw'); }}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm transition-all whitespace-nowrap ${
                      isActive ? 'bg-slate-200 text-slate-800 font-medium' : 'text-slate-500 hover:bg-slate-100'
                    }`}
                    title={tool.label}
                  >
                    <Icon size={16} />
                  </button>
                );
              })}
              
              <div className="w-[1px] h-6 bg-slate-200 mx-1 shrink-0"></div>
              
              <div className="flex items-center gap-1.5 px-1 shrink-0">
                {COLORS.map(color => (
                  <button
                    key={color.id}
                    onClick={() => setActiveColor(color.hex)}
                    className={`w-6 h-6 rounded-full border-2 transition-all shadow-sm ${activeColor === color.hex ? 'scale-110 border-slate-800' : 'border-white hover:scale-105'}`}
                    style={{ backgroundColor: color.hex }}
                    title={color.id}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Row 3: Field Settings */}
          <div className="flex items-center gap-6 mt-1 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-600 text-xs">รูปแบบสนาม:</span>
              <select 
                value={fieldType} 
                onChange={(e) => setFieldType(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1 text-sm bg-white outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-slate-700 shadow-sm"
              >
                <option value="full">เต็มสนาม</option>
                <option value="half">ครึ่งสนาม</option>
              </select>
            </div>
            
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-600 text-xs">สีทีมแดง:</span>
                <div className="w-5 h-5 bg-[#ef4444] rounded box-border border-2 border-white shadow-[0_0_0_1px_#cbd5e1]"></div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-600 text-xs">สีทีมน้ำเงิน:</span>
                <div className="w-5 h-5 bg-[#3b82f6] rounded box-border border-2 border-white shadow-[0_0_0_1px_#cbd5e1]"></div>
              </div>
            </div>
          </div>

        </div>

        {/* Canvas Area (Football Pitch) */}
        <div 
          className="flex-1 relative w-full overflow-hidden select-none touch-none bg-white"
          ref={containerRef}
        >
           {/* Pure CSS Pitch Markings */}
           <div className="absolute inset-4 lg:inset-8 ring-[1.5px] ring-slate-800 pointer-events-none z-0">
             {fieldType === 'full' ? (
               <>
                 <div className="absolute top-0 bottom-0 left-1/2 w-[1.5px] bg-slate-800 -translate-x-1/2"></div>
                 <div className="absolute top-1/2 left-1/2 w-[22%] max-w-[200px] aspect-square border-[1.5px] border-slate-800 rounded-full -translate-x-1/2 -translate-y-1/2"></div>
                 <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-slate-800 rounded-full -translate-x-1/2 -translate-y-1/2"></div>
                 
                 <div className="absolute top-1/2 left-0 w-[16%] h-[55%] border-[1.5px] border-slate-800 -translate-y-1/2 border-l-0"></div>
                 <div className="absolute top-1/2 left-0 w-[5%] h-[24%] border-[1.5px] border-slate-800 -translate-y-1/2 border-l-0"></div>
                 <div className="absolute top-1/2 left-[11%] w-1.5 h-1.5 bg-slate-800 rounded-full -translate-y-1/2"></div>
                 <div className="absolute top-1/2 left-[16%] w-[8%] max-w-[80px] h-[20%] border-[1.5px] border-slate-800 border-l-0 rounded-r-full -translate-y-1/2"></div>
                 <div className="absolute top-1/2 left-0 w-[2.5%] h-[12%] border-[1.5px] border-slate-800 -translate-y-1/2 -translate-x-full border-r-0"></div>
                 
                 <div className="absolute top-1/2 right-0 w-[16%] h-[55%] border-[1.5px] border-slate-800 -translate-y-1/2 border-r-0"></div>
                 <div className="absolute top-1/2 right-0 w-[5%] h-[24%] border-[1.5px] border-slate-800 -translate-y-1/2 border-r-0"></div>
                 <div className="absolute top-1/2 right-[11%] w-1.5 h-1.5 bg-slate-800 rounded-full -translate-y-1/2"></div>
                 <div className="absolute top-1/2 right-[16%] w-[8%] max-w-[80px] h-[20%] border-[1.5px] border-slate-800 border-r-0 rounded-l-full -translate-y-1/2"></div>
                 <div className="absolute top-1/2 right-0 w-[2.5%] h-[12%] border-[1.5px] border-slate-800 -translate-y-1/2 translate-x-full border-l-0"></div>

                 <div className="absolute top-0 left-0 w-4 h-4 border-b-[1.5px] border-r-[1.5px] border-slate-800 rounded-br-full"></div>
                 <div className="absolute bottom-0 left-0 w-4 h-4 border-t-[1.5px] border-r-[1.5px] border-slate-800 rounded-tr-full"></div>
                 <div className="absolute top-0 right-0 w-4 h-4 border-b-[1.5px] border-l-[1.5px] border-slate-800 rounded-bl-full"></div>
                 <div className="absolute bottom-0 right-0 w-4 h-4 border-t-[1.5px] border-l-[1.5px] border-slate-800 rounded-tl-full"></div>
               </>
             ) : (
               <>
                 <div className="absolute top-0 left-1/2 w-[55%] h-[35%] border-[1.5px] border-slate-800 border-t-0 -translate-x-1/2"></div>
                 <div className="absolute top-0 left-1/2 w-[24%] h-[12%] border-[1.5px] border-slate-800 border-t-0 -translate-x-1/2"></div>
                 <div className="absolute top-[24%] left-1/2 w-1.5 h-1.5 bg-slate-800 rounded-full -translate-x-1/2"></div>
                 <div className="absolute top-[35%] left-1/2 w-[20%] max-w-[200px] h-[15%] border-[1.5px] border-slate-800 border-t-0 rounded-b-full -translate-x-1/2"></div>
                 
                 <div className="absolute top-0 left-1/2 w-[12%] h-[5%] border-[1.5px] border-slate-800 border-b-0 -translate-y-full -translate-x-1/2"></div>

                 <div className="absolute top-0 left-0 w-6 h-6 border-b-[1.5px] border-r-[1.5px] border-slate-800 rounded-br-full"></div>
                 <div className="absolute top-0 right-0 w-6 h-6 border-b-[1.5px] border-l-[1.5px] border-slate-800 rounded-bl-full"></div>

                 <div className="absolute bottom-0 left-1/2 w-[35%] max-w-[300px] aspect-square border-[1.5px] border-slate-800 border-b-0 rounded-t-full -translate-x-1/2 translate-y-[50%]"></div>
                 <div className="absolute bottom-0 left-1/2 w-1.5 h-1.5 bg-slate-800 rounded-full -translate-x-1/2 translate-y-1/2"></div>
               </>
             )}
           </div>

           {/* Interactive Canvas Grid (Subtle overlay for alignment) */}
           <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNykiLz48L3N2Zz4=')] z-0"></div>

           {/* The Drawing & Drag Layer (react-konva) */}
           <div className="absolute inset-0 z-10 block w-full h-full">
             <Stage 
               ref={stageRef}
               width={stageSize.width} 
               height={stageSize.height}
               onMouseDown={handleMouseDown}
               onMouseMove={handleMouseMove}
               onMouseUp={handleMouseUp}
               onTouchStart={handleMouseDown}
               onTouchMove={handleMouseMove}
               onTouchEnd={handleMouseUp}
               className={activeTool === 'select' ? 'cursor-default' : activeTool === 'pan' ? 'cursor-grab' : 'cursor-crosshair'}
             >
               <Layer>
                 {lines.map((line, i) => {
                    let dash: number[] = [];
                    if (line.tool === 'dashed') dash = [10, 8];
                    let tension = line.tool === 'curve' || line.tool === 'freehand' ? 0.5 : 0;
                    
                    return (
                      <Arrow
                        key={line.id || i}
                        points={line.points}
                        stroke={line.color}
                        strokeWidth={line.tool === 'dribble' ? 3 : 4}
                        fill={line.color}
                        tension={tension}
                        lineCap="round"
                        lineJoin="round"
                        dash={dash}
                        pointerLength={10}
                        pointerWidth={10}
                        onClick={(e) => handleElementClick(e, line.id, 'line')}
                        onTap={(e) => handleElementClick(e, line.id, 'line')}
                        hitStrokeWidth={20}
                      />
                    );
                 })}
                 
                 {elements.map((el) => {
                    if (el.type === 'red') {
                      return <Circle key={el.id} id={el.id} x={el.x} y={el.y} radius={10} fill="#ef4444" stroke="#991b1b" strokeWidth={2} draggable onDragEnd={(e) => handleDragEnd(el.id, e)} onClick={(e) => handleElementClick(e, el.id, 'element')} onTap={(e) => handleElementClick(e, el.id, 'element')} />;
                    }
                    if (el.type === 'blue') {
                      return <Circle key={el.id} id={el.id} x={el.x} y={el.y} radius={10} fill="#3b82f6" stroke="#1e3a8a" strokeWidth={2} draggable onDragEnd={(e) => handleDragEnd(el.id, e)} onClick={(e) => handleElementClick(e, el.id, 'element')} onTap={(e) => handleElementClick(e, el.id, 'element')} />;
                    }
                    if (el.type === 'ball') {
                      return <BallNode key={el.id} el={el} onDragEnd={handleDragEnd} onClick={(e: any) => handleElementClick(e, el.id, 'element')} onTap={(e: any) => handleElementClick(e, el.id, 'element')} />;
                    }
                     if (el.type === 'cone') {
                       return <Path key={el.id} id={el.id} x={el.x} y={el.y} data="M 0 16 L 8 0 L 16 16 Z" fill="#f97316" offsetX={8} offsetY={8} draggable onDragEnd={(e) => handleDragEnd(el.id, e)} onClick={(e) => handleElementClick(e, el.id, 'element')} onTap={(e) => handleElementClick(e, el.id, 'element')} hitStrokeWidth={16} />;
                     }
                     if (el.type === 'mini_goal') {
                       return <Path key={el.id} id={el.id} x={el.x} y={el.y} data="M 0 16 L 0 0 L 40 0 L 40 16" stroke="#e2e8f0" strokeWidth={5} offsetX={20} offsetY={8} draggable onDragEnd={(e) => handleDragEnd(el.id, e)} onClick={(e) => handleElementClick(e, el.id, 'element')} onTap={(e) => handleElementClick(e, el.id, 'element')} hitStrokeWidth={16} />;
                     }
                     if (el.type === 'hurdle') {
                       return <Path key={el.id} id={el.id} x={el.x} y={el.y} data="M 0 16 L 0 0 L 24 0 L 24 16" stroke="#facc15" strokeWidth={3} offsetX={12} offsetY={8} draggable onDragEnd={(e) => handleDragEnd(el.id, e)} onClick={(e) => handleElementClick(e, el.id, 'element')} onTap={(e) => handleElementClick(e, el.id, 'element')} hitStrokeWidth={16} />;
                     }
                     if (el.type === 'ladder') {
                       return (
                         <Group key={el.id} id={el.id} x={el.x} y={el.y} offsetX={12} offsetY={24} draggable onDragEnd={(e) => handleDragEnd(el.id, e)} onClick={(e) => handleElementClick(e, el.id, 'element')} onTap={(e) => handleElementClick(e, el.id, 'element')}>
                           <Rect width={24} height={48} stroke="transparent" strokeWidth={20} />
                           <Rect width={24} height={48} stroke="#facc15" strokeWidth={2} />
                           <Line points={[0, 12, 24, 12]} stroke="#facc15" strokeWidth={2} />
                           <Line points={[0, 24, 24, 24]} stroke="#facc15" strokeWidth={2} />
                           <Line points={[0, 36, 24, 36]} stroke="#facc15" strokeWidth={2} />
                         </Group>
                       );
                     }
                    return null;
                 })}
               </Layer>
             </Stage>
            </div>
           </div>
           </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-6 relative min-h-[400px]">
              {uploadedImage ? (
                <div className="relative w-full max-w-2xl mx-auto flex flex-col items-center justify-center h-full">
                  <img src={uploadedImage} alt="Uploaded Drill" className="max-h-full max-w-full rounded-lg shadow-sm border border-slate-200 object-contain" />
                  <button 
                    onClick={() => setUploadedImage(null)}
                    className="absolute top-4 right-4 p-2.5 bg-white text-rose-600 rounded-full shadow-md hover:bg-rose-50 transition-colors"
                    title="ลบรูปภาพ"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ) : (
                <label className="w-full max-w-lg aspect-video flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-300 rounded-2xl bg-white hover:bg-slate-50 hover:border-blue-400 transition-colors cursor-pointer text-center group shadow-sm">
                  <div className="p-4 bg-blue-50 text-blue-600 rounded-full mb-4 group-hover:-translate-y-1 transition-transform">
                    <Camera size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">อัปโหลดรูปภาพ / ถ่ายรูป</h3>
                  <p className="text-sm text-slate-500 max-w-sm mx-auto">
                    คลิกเพื่อเลือกไฟล์รูปภาพจากอุปกรณ์ หรือใช้กล้องถ่ายรูปสมุดโน้ตวาดมือ
                  </p>
                  <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment" 
                    onChange={handleImageUpload} 
                    className="hidden" 
                  />
                </label>
              )}
            </div>
          )}
        </div>

      {/* Drill Metadata Form Container */}
      <div className="w-full xl:w-[380px] shrink-0 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden xl:max-h-full xl:overflow-y-auto">
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 sticky top-0 z-10 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Drill Details</h2>
        </div>
        
        <div className="p-4 sm:p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">หัวข้อแบบฝึก (Title)</label>
            <input type="text" value={saveForm.title} onChange={e => setSaveForm({...saveForm, title: e.target.value})} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="เช่น Rondo 4v2" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">หมวดหมู่ (Category)</label>
            <select value={saveForm.category} onChange={e => setSaveForm({...saveForm, category: e.target.value})} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none">
                <option value="Tactical">Tactical</option>
                <option value="Technical">Technical</option>
                <option value="Physical">Physical</option>
                <option value="Psychological">Psychological</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Phase / Objective</label>
              <input type="text" value={saveForm.phase} onChange={e => setSaveForm({...saveForm, phase: e.target.value})} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500" placeholder="Preparatory - General" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">เวลา (Duration)</label>
              <input type="text" value={saveForm.duration} onChange={e => setSaveForm({...saveForm, duration: e.target.value})} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500" placeholder="60 นาที" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">กลุ่มผู้เล่น (Age Group)</label>
            <input type="text" value={saveForm.ageGroup} onChange={e => setSaveForm({...saveForm, ageGroup: e.target.value})} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500" placeholder="รุ่น U12" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">วิธีการฝึก (Training Method)</label>
            <textarea value={saveForm.trainingMethod} onChange={e => setSaveForm({...saveForm, trainingMethod: e.target.value})} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none min-h-[80px] resize-y" placeholder="อธิบายวิธีการซ้อม..." />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">จุดโค้ชชิ่ง (Coaching Points)</label>
            <textarea value={saveForm.coachingPoints} onChange={e => setSaveForm({...saveForm, coachingPoints: e.target.value})} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none min-h-[80px] resize-y" placeholder="พืัน, การเคลื่อนที่, ความแม่นยำ..." />
          </div>
          
          <button 
            onClick={handleSaveAll}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 transition-colors mt-2">
            บันทึกแบบฝึกซ้อม
          </button>
        </div>
      </div>
    </div>
    </div>
  );
}
