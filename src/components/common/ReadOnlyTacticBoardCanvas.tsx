import {
  DEFAULT_TEAM_COLORS,
  HALF_PITCH_GOAL_SIDE,
  PITCH_THEME_PRESETS,
  getContrastColor,
  normalizeOrientation,
  normalizePitchTheme,
  normalizeTeamColors,
  resolveTacticLineStyle,
  validatePitchBounds,
  type PitchBounds,
} from "../../lib/tacticBoardModel";
import { normalizeDrillFieldType } from "../../lib/drillDataModel";
import Konva from "konva";

type ReadOnlyTacticBoardCanvasProps = {
  canvasData: Readonly<Record<string, unknown>>;
};

type CanvasRecord = Record<string, unknown>;

function asRecord(value: unknown): CanvasRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as CanvasRecord
    : null;
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function legacyPitchBounds(width: number, height: number): PitchBounds {
  const inset = width > 48 && height > 48 ? 24 : 0;
  return {
    pitchX: inset,
    pitchY: inset,
    pitchWidth: width - inset * 2,
    pitchHeight: height - inset * 2,
  };
}

function renderPitchMarkings(
  fieldType: "full" | "half" | "small",
  markings: string,
  pitch: PitchBounds,
) {
  const pitchLeft = pitch.pitchX;
  const pitchTop = pitch.pitchY;
  const pitchWidth = pitch.pitchWidth;
  const pitchHeight = pitch.pitchHeight;
  const pitchRight = pitchLeft + pitchWidth;
  const pitchBottom = pitchTop + pitchHeight;
  const centerX = pitchLeft + pitchWidth / 2;
  const centerY = pitchTop + pitchHeight / 2;
  const strokeWidth = 2;
  const halfPenaltyAreaTop = pitchBottom - pitchHeight * 0.314;
  const halfPenaltyMarkY = pitchBottom - pitchHeight * 0.21;
  const halfPenaltyArcRadius = pitchWidth * 0.1345;
  const normalizedHalfPenaltyArcOffset =
    (halfPenaltyAreaTop - halfPenaltyMarkY) / halfPenaltyArcRadius;
  const halfPenaltyArcInset = Number.isFinite(normalizedHalfPenaltyArcOffset) &&
    Math.abs(normalizedHalfPenaltyArcOffset) < 1
    ? halfPenaltyArcRadius * Math.sqrt(1 - normalizedHalfPenaltyArcOffset ** 2)
    : 0;
  const cornerRadiusX = pitchWidth * 0.028;
  const cornerRadiusY = pitchHeight * 0.037;

  return (
    <g
      fill="none"
      stroke={markings}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      data-pitch-markings="true"
    >
      <rect
        x={pitchLeft}
        y={pitchTop}
        width={pitchWidth}
        height={pitchHeight}
        data-pitch-boundary="true"
      />
      {fieldType === "full" ? (
        <>
          <line x1={centerX} y1={pitchTop} x2={centerX} y2={pitchBottom} />
          <circle cx={centerX} cy={centerY} r={pitchHeight * 0.135} />
          <circle cx={centerX} cy={centerY} r={3} fill={markings} />
          {[pitchLeft, pitchRight - pitchWidth * 0.157].map((x) => (
            <g key={`penalty-${x}`}>
              <rect x={x} y={centerY - pitchHeight * 0.2965} width={pitchWidth * 0.157} height={pitchHeight * 0.593} />
              <rect x={x} y={centerY - pitchHeight * 0.1345} width={pitchWidth * 0.052} height={pitchHeight * 0.269} />
            </g>
          ))}
          <circle cx={pitchLeft + pitchWidth * 0.104} cy={centerY} r={3} fill={markings} />
          <circle cx={pitchRight - pitchWidth * 0.104} cy={centerY} r={3} fill={markings} />
          <path
            d={`M ${pitchLeft + cornerRadiusX} ${pitchTop} A ${cornerRadiusX} ${cornerRadiusY} 0 0 0 ${pitchLeft} ${pitchTop + cornerRadiusY} M ${pitchRight - cornerRadiusX} ${pitchTop} A ${cornerRadiusX} ${cornerRadiusY} 0 0 1 ${pitchRight} ${pitchTop + cornerRadiusY} M ${pitchLeft} ${pitchBottom - cornerRadiusY} A ${cornerRadiusX} ${cornerRadiusY} 0 0 0 ${pitchLeft + cornerRadiusX} ${pitchBottom} M ${pitchRight - cornerRadiusX} ${pitchBottom} A ${cornerRadiusX} ${cornerRadiusY} 0 0 0 ${pitchRight} ${pitchBottom - cornerRadiusY}`}
            data-pitch-feature="corner-arcs"
          />
        </>
      ) : fieldType === "half" ? (
        <>
          <line
            x1={pitchLeft}
            y1={pitchTop}
            x2={pitchRight}
            y2={pitchTop}
            data-pitch-feature="center-line"
          />
          <path
            d={`M ${centerX - pitchWidth * 0.1345} ${pitchTop} A ${pitchWidth * 0.1345} ${pitchWidth * 0.1345} 0 0 0 ${centerX + pitchWidth * 0.1345} ${pitchTop}`}
            data-pitch-feature="center-circle"
          />
          <circle
            cx={centerX}
            cy={pitchTop}
            r={3}
            fill={markings}
            data-pitch-feature="center-mark"
          />
          <path
            d={`M ${centerX - pitchWidth * 0.2965} ${pitchBottom} v -${pitchHeight * 0.314} h ${pitchWidth * 0.593} v ${pitchHeight * 0.314}`}
            data-pitch-feature="penalty-area"
          />
          <path
            d={`M ${centerX - pitchWidth * 0.1345} ${pitchBottom} v -${pitchHeight * 0.105} h ${pitchWidth * 0.269} v ${pitchHeight * 0.105}`}
            data-pitch-feature="goal-area"
          />
          <circle
            cx={centerX}
            cy={halfPenaltyMarkY}
            r={3}
            fill={markings}
            data-pitch-feature="penalty-mark"
          />
          <path
            d={`M ${centerX - halfPenaltyArcInset} ${halfPenaltyAreaTop} A ${halfPenaltyArcRadius} ${halfPenaltyArcRadius} 0 0 1 ${centerX + halfPenaltyArcInset} ${halfPenaltyAreaTop}`}
            data-pitch-feature="penalty-arc"
          />
          <path
            d={`M ${pitchLeft} ${pitchBottom - cornerRadiusY} A ${cornerRadiusX} ${cornerRadiusY} 0 0 1 ${pitchLeft + cornerRadiusX} ${pitchBottom} M ${pitchRight - cornerRadiusX} ${pitchBottom} A ${cornerRadiusX} ${cornerRadiusY} 0 0 1 ${pitchRight} ${pitchBottom - cornerRadiusY}`}
            data-pitch-feature="corner-arcs"
          />
        </>
      ) : null}
    </g>
  );
}

function linePath(points: number[], tension: number): string {
  let path = `M ${points[0]} ${points[1]}`;
  if (tension !== 0 && points.length > 4) {
    const tensionPoints = new Konva.Line({ points, tension }).getTensionPoints();
    path += ` Q ${tensionPoints[0]} ${tensionPoints[1]} ${tensionPoints[2]} ${tensionPoints[3]}`;
    for (let index = 4; index < tensionPoints.length - 2;) {
      path += ` C ${tensionPoints[index++]} ${tensionPoints[index++]} ${tensionPoints[index++]} ${tensionPoints[index++]} ${tensionPoints[index++]} ${tensionPoints[index++]}`;
    }
    path += ` Q ${tensionPoints.at(-2)} ${tensionPoints.at(-1)} ${points.at(-2)} ${points.at(-1)}`;
    return path;
  }

  for (let index = 2; index < points.length; index += 2) {
    path += ` L ${points[index]} ${points[index + 1]}`;
  }
  return path;
}

function arrowPoints(points: number[], tension: number): string {
  const lastX = points.at(-2)!;
  const lastY = points.at(-1)!;
  let dx: number;
  let dy: number;
  if (tension !== 0 && points.length > 4) {
    const tensionPoints = new Konva.Line({ points, tension }).getTensionPoints();
    const curve = [
      tensionPoints.at(-4)!,
      tensionPoints.at(-3)!,
      tensionPoints.at(-2)!,
      tensionPoints.at(-1)!,
      lastX,
      lastY,
    ];
    const length = Konva.Path.calcLength(curve[0], curve[1], "C", curve);
    const previous = length > 0
      ? Konva.Path.getPointOnQuadraticBezier(
          Math.min(1, 1 - 10 / length),
          curve[0], curve[1], curve[2], curve[3], curve[4], curve[5],
        )
      : { x: points.at(-4)!, y: points.at(-3)! };
    dx = lastX - previous.x;
    dy = lastY - previous.y;
  } else {
    dx = lastX - points.at(-4)!;
    dy = lastY - points.at(-3)!;
  }

  const radians = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const length = 10;
  const width = 10;
  const firstBase = {
    x: lastX - length * cosine - (width / 2) * sine,
    y: lastY - length * sine + (width / 2) * cosine,
  };
  const secondBase = {
    x: lastX - length * cosine + (width / 2) * sine,
    y: lastY - length * sine - (width / 2) * cosine,
  };
  return `${lastX},${lastY} ${firstBase.x},${firstBase.y} ${secondBase.x},${secondBase.y}`;
}

function renderElement(value: unknown, index: number, teamColors: ReturnType<typeof normalizeTeamColors>) {
  const element = asRecord(value);
  if (!element || typeof element.type !== "string") return null;

  const x = finiteNumber(element.x, Number.NaN);
  const y = finiteNumber(element.y, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const id = typeof element.id === "string" ? element.id : `element-${index}`;
  const shared = { "data-element-id": id, "data-element-type": element.type };

  if (element.type === "red" || element.type === "blue") {
    const fill = element.type === "red" ? teamColors.teamA : teamColors.teamB;
    const defaultFill = element.type === "red" ? DEFAULT_TEAM_COLORS.teamA : DEFAULT_TEAM_COLORS.teamB;
    const defaultStroke = element.type === "red" ? "#991b1b" : "#1e3a8a";
    const stroke = fill.toLowerCase() === defaultFill ? defaultStroke : getContrastColor(fill);
    return <circle key={id} {...shared} cx={x} cy={y} r={10} fill={fill} stroke={stroke} strokeWidth={2} />;
  }

  if (element.type === "ball") {
    return (
      <g key={id} {...shared} transform={`translate(${x} ${y})`}>
        <circle r={9} fill="#ffffff" stroke="#0f172a" strokeWidth={1.5} />
        <path d="M -3 -3 L 0 -5 L 3 -3 L 2 1 L -2 1 Z M -8 -3 L -5 -2 M 8 -3 L 5 -2 M -5 7 L -3 4 M 5 7 L 3 4" fill="#0f172a" stroke="#0f172a" strokeWidth={1.2} strokeLinejoin="round" />
      </g>
    );
  }

  if (element.type === "cone") {
    return <path key={id} {...shared} d={`M ${x - 8} ${y + 8} L ${x} ${y - 8} L ${x + 8} ${y + 8} Z`} fill="#f97316" />;
  }

  if (element.type === "mini_goal" || element.type === "hurdle") {
    const orientation = normalizeOrientation(element.orientation);
    const goal = element.type === "mini_goal";
    return (
      <g key={id} {...shared} transform={`translate(${x} ${y}) rotate(${orientation})`} fill="none" stroke={goal ? "#0f172a" : "#facc15"} strokeWidth={goal ? 4 : 3}>
        <path d={goal ? "M -20 8 L -20 -8 L 20 -8 L 20 8" : "M -12 8 L -12 -8 L 12 -8 L 12 8"} />
      </g>
    );
  }

  if (element.type === "ladder") {
    return (
      <g key={id} {...shared} transform={`translate(${x - 12} ${y - 24})`} fill="none" stroke="#facc15" strokeWidth={2}>
        <rect width={24} height={48} />
        <line x1={0} y1={12} x2={24} y2={12} />
        <line x1={0} y1={24} x2={24} y2={24} />
        <line x1={0} y1={36} x2={24} y2={36} />
      </g>
    );
  }

  return null;
}

function renderLine(value: unknown, index: number) {
  const line = asRecord(value);
  if (!line || !Array.isArray(line.points)) return null;

  const points = line.points
    .filter((point): point is number => typeof point === "number" && Number.isFinite(point));
  if (points.length < 4) return null;

  const id = typeof line.id === "string" ? line.id : `line-${index}`;
  const color = typeof line.color === "string" ? line.color : "#1e293b";
  const style = resolveTacticLineStyle(line);
  const coordinates = Array.from({ length: Math.floor(points.length / 2) }, (_, pointIndex) =>
    `${points[pointIndex * 2]},${points[pointIndex * 2 + 1]}`,
  ).join(" ");
  const x = finiteNumber(line.x);
  const y = finiteNumber(line.y);
  const tension = style.geometry === "curved" || style.geometry === "freehand" ? 0.5 : 0;
  const path = linePath(points, tension);
  const endArrowPoints = arrowPoints(points, tension);

  return (
    <g key={id} transform={`translate(${x} ${y})`} data-line-id={id} data-line-geometry={style.geometry} fill="none">
      <path
        d={path}
        stroke={color}
        strokeWidth={style.geometry === "dribble" ? 3 : 4}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={style.stroke === "dashed" ? "10 8" : undefined}
        data-line-path="true"
        data-line-points={coordinates}
      />
      {style.arrowhead === "end" ? <polygon points={endArrowPoints} fill={color} stroke="none" data-line-arrowhead="end" /> : null}
    </g>
  );
}

export default function ReadOnlyTacticBoardCanvas({
  canvasData,
}: ReadOnlyTacticBoardCanvasProps) {
  const fieldType = normalizeDrillFieldType(canvasData.fieldType);
  const pitchTheme = normalizePitchTheme(canvasData.pitchTheme);
  const teamColors = normalizeTeamColors(canvasData.teamColors);
  const pitchColors = PITCH_THEME_PRESETS[pitchTheme];
  const storedWidth = finiteNumber(canvasData.stageWidth, Number.NaN);
  const storedHeight = finiteNumber(canvasData.stageHeight, Number.NaN);
  const hasStoredStageDimensions =
    Number.isFinite(storedWidth) &&
    storedWidth > 0 &&
    Number.isFinite(storedHeight) &&
    storedHeight > 0;
  const width = hasStoredStageDimensions ? storedWidth : 800;
  const height = hasStoredStageDimensions
    ? storedHeight
    : fieldType === "half"
      ? 615
      : 520;
  const pitchBounds =
    validatePitchBounds(storedWidth, storedHeight, canvasData) ??
    legacyPitchBounds(width, height);
  const elements = Array.isArray(canvasData.elements) ? canvasData.elements : [];
  const lines = Array.isArray(canvasData.lines) ? canvasData.lines : [];

  return (
    <svg
      className="block h-auto w-full rounded-lg border border-slate-300 shadow-sm"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Submitted tactic board"
      data-field-type={fieldType}
      data-goal-side={fieldType === "half" ? HALF_PITCH_GOAL_SIDE : undefined}
      data-pitch-theme={pitchTheme}
      style={{ backgroundColor: pitchColors.background, pointerEvents: "none" }}
    >
      <title>Submitted tactic board</title>
      <rect x={0} y={0} width={width} height={height} fill={pitchColors.background} />
      {renderPitchMarkings(fieldType, pitchColors.markings, pitchBounds)}
      <g data-board-lines="true">{lines.map(renderLine)}</g>
      <g data-board-elements="true">{elements.map((element, index) => renderElement(element, index, teamColors))}</g>
    </svg>
  );
}
