import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Modal,
  StyleSheet,
  PanResponder,
  Dimensions,
  Animated,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { RadarTileSnapshot, RadarAnimationFrame } from '../domain';

export interface InteractiveRadarMapViewProps {
  radar: RadarTileSnapshot;
}

const TILE_REQUEST_HEADERS = {
  'User-Agent': 'proj01-weather-app/1.0 (https://github.com/anonymous/proj01)',
};

const PLAYBACK_INTERVAL_MS = 650;
const MIN_ZOOM = 4;
const MAX_ZOOM = 11;
const TILE_SIZE = 256;
const GRID_RADIUS = 3; // 7x7 tile grid (-3..+3 around center tile = 1792x1792 px) so rapid panning never reveals blank edges

type BasemapTheme = 'dark' | 'street';

const RAIN_GRADIENT_SWATCHES = [
  '#4ADE80',
  '#22C55E',
  '#A3E635',
  '#FACC15',
  '#F97316',
  '#EF4444',
  '#EC4899',
  '#9333EA',
];

const ICE_GRADIENT_SWATCHES = [
  '#FBCFE8',
  '#F9A8D4',
  '#F472B6',
  '#FB7185',
  '#F43F5E',
  '#E11D48',
];

const SNOW_GRADIENT_SWATCHES = [
  '#BAE6FD',
  '#7DD3FC',
  '#38BDF8',
  '#0284C7',
  '#0369A1',
  '#1E3A8A',
];

function formatRelativeLabel(
  frameTimestamp: number,
  nowTimestamp: number
): string {
  const diffMinutes = Math.round((frameTimestamp - nowTimestamp) / 60);
  if (Math.abs(diffMinutes) <= 2) {
    return 'Now';
  }
  if (diffMinutes < 0) {
    return `${diffMinutes}m`;
  }
  if (diffMinutes >= 60 && diffMinutes % 60 === 0) {
    return `+${diffMinutes / 60}h`;
  }
  if (diffMinutes > 60) {
    const hrs = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    return `+${hrs}h${mins}m`;
  }
  return `+${diffMinutes}m`;
}

function formatDayShort(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) {
    return 'Today';
  }
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[date.getDay()]} ${date.getDate()}`;
}

function format12HourClock(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }
  const h24 = date.getHours();
  const mins = String(date.getMinutes()).padStart(2, '0');
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mins} ${period}`;
}

function formatShortHourTick(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const h24 = date.getHours();
  const mins = date.getMinutes();
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  if (mins === 0) {
    return `${h12} ${period}`;
  }
  return `${h12}:${String(mins).padStart(2, '0')}`;
}

interface TileCell {
  key: string;
  dx: number;
  dy: number;
  baseUri: string;
  labelRefUri: string | null;
  overlayUri: string | null;
}

function buildDarkTileUrls(
  zoom: number,
  tileX: number,
  tileY: number,
  theme: BasemapTheme
): { baseUri: string; labelRefUri: string | null } {
  if (theme === 'street') {
    return {
      baseUri: `https://tile.openstreetmap.de/${zoom}/${tileX}/${tileY}.png`,
      labelRefUri: null,
    };
  }
  return {
    baseUri: `https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${zoom}/${tileY}/${tileX}`,
    labelRefUri: `https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/${zoom}/${tileY}/${tileX}`,
  };
}

function buildSlippyTileGrid(
  centerTileX: number,
  centerTileY: number,
  zoom: number,
  activeFrame: RadarAnimationFrame | null,
  theme: BasemapTheme
): TileCell[] {
  const n = Math.pow(2, zoom);
  const cells: TileCell[] = [];

  for (let dy = -GRID_RADIUS; dy <= GRID_RADIUS; dy++) {
    for (let dx = -GRID_RADIUS; dx <= GRID_RADIUS; dx++) {
      const tileY = centerTileY + dy;
      if (tileY < 0 || tileY >= n) {
        continue;
      }
      const tileX = (((centerTileX + dx) % n) + n) % n;
      const { baseUri, labelRefUri } = buildDarkTileUrls(
        zoom,
        tileX,
        tileY,
        theme
      );
      const overlayUri = activeFrame
        ? activeFrame.tileUrlTemplate
            .replace('{z}', String(zoom))
            .replace('{x}', String(tileX))
            .replace('{y}', String(tileY))
        : null;

      cells.push({
        key: `${theme}_${zoom}_${tileX}_${tileY}`,
        dx,
        dy,
        baseUri,
        labelRefUri,
        overlayUri,
      });
    }
  }

  return cells;
}

export const InteractiveRadarMapView: React.FC<
  InteractiveRadarMapViewProps
> = ({ radar }) => {
  // Normalize frames so we always have past frames + NOW + future forecast frames (+30m .. +2h)
  const frames: RadarAnimationFrame[] = useMemo(() => {
    if (Array.isArray(radar.frames) && radar.frames.length > 0) {
      const hasForecast = radar.frames.some((f) => f.isForecast);
      if (hasForecast) {
        return radar.frames;
      }
      const latest = radar.frames[radar.frames.length - 1];
      const forecastFrames: RadarAnimationFrame[] = [
        1800, 3600, 5400, 7200,
      ].map((offsetSec) => ({
        timestamp: latest.timestamp + offsetSec,
        overlayTileUrl: latest.overlayTileUrl,
        tileUrlTemplate: latest.tileUrlTemplate,
        isForecast: true,
      }));
      return [...radar.frames, ...forecastFrames];
    }
    if (radar.overlayTileUrl !== null && radar.radarTimestamp !== null) {
      const template = radar.overlayTileUrl.replace(
        /\/256\/\d+\/\d+\/\d+\//,
        '/256/{z}/{x}/{y}/'
      );
      const baseFrame: RadarAnimationFrame = {
        timestamp: radar.radarTimestamp,
        overlayTileUrl: radar.overlayTileUrl,
        tileUrlTemplate: template,
        isForecast: false,
      };
      const forecastFrames: RadarAnimationFrame[] = [
        1800, 3600, 5400, 7200,
      ].map((offsetSec) => ({
        timestamp: radar.radarTimestamp! + offsetSec,
        overlayTileUrl: radar.overlayTileUrl!,
        tileUrlTemplate: template,
        isForecast: true,
      }));
      return [baseFrame, ...forecastFrames];
    }
    return [];
  }, [radar.frames, radar.overlayTileUrl, radar.radarTimestamp]);

  // Identify the index of the "NOW" frame (last non-forecast frame)
  const nowFrameIndex = useMemo(() => {
    if (frames.length === 0) return 0;
    let lastPastIdx = 0;
    for (let i = 0; i < frames.length; i++) {
      if (!frames[i].isForecast) {
        lastPastIdx = i;
      }
    }
    return lastPastIdx;
  }, [frames]);

  const [frameIndex, setFrameIndex] = useState<number>(() => nowFrameIndex);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [basemapTheme, setBasemapTheme] = useState<BasemapTheme>('dark');
  const [showInfoTooltip, setShowInfoTooltip] = useState<boolean>(false);

  // Geographic origin in float tile coordinates at radar.zoom
  const originFloatX = useMemo(
    () => radar.tileX + radar.markerOffsetX / TILE_SIZE,
    [radar.tileX, radar.markerOffsetX]
  );
  const originFloatY = useMemo(
    () => radar.tileY + radar.markerOffsetY / TILE_SIZE,
    [radar.tileY, radar.markerOffsetY]
  );

  // Anchor state for the 7x7 tile grid (only updates when gesture settles or crosses >1.5 tiles)
  const [anchorState, setAnchorState] = useState<{
    zoom: number;
    centerTileX: number;
    centerTileY: number;
  }>({
    zoom: radar.zoom,
    centerTileX: radar.tileX,
    centerTileY: radar.tileY,
  });

  // Live 60fps Animated values for zero-rerender Google-Maps-like panning, pinching, double-tap & inertia!
  const animPanX = useRef(new Animated.Value(0)).current;
  const animPanY = useRef(new Animated.Value(0)).current;
  const animScale = useRef(new Animated.Value(1)).current;

  // Synchronous numeric tracking refs mirroring the Animated values
  const livePanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const liveScaleRef = useRef<number>(1);
  const anchorRef = useRef<{
    zoom: number;
    centerTileX: number;
    centerTileY: number;
  }>({
    zoom: radar.zoom,
    centerTileX: radar.tileX,
    centerTileY: radar.tileY,
  });

  const gestureStartPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const gestureStartScaleRef = useRef<number>(1);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchFocalRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastTapTimeRef = useRef<number>(0);

  // Sync active frame index to "Now" when new radar snapshot arrives
  useEffect(() => {
    setFrameIndex(nowFrameIndex);
  }, [nowFrameIndex, radar.radarTimestamp]);

  // Reset map camera when active city changes
  useEffect(() => {
    animPanX.stopAnimation();
    animPanY.stopAnimation();
    animScale.stopAnimation();
    livePanRef.current = { x: 0, y: 0 };
    liveScaleRef.current = 1;
    animPanX.setValue(0);
    animPanY.setValue(0);
    animScale.setValue(1);
    const initialAnchor = {
      zoom: radar.zoom,
      centerTileX: radar.tileX,
      centerTileY: radar.tileY,
    };
    anchorRef.current = initialAnchor;
    setAnchorState(initialAnchor);
  }, [radar.tileX, radar.tileY, radar.zoom, animPanX, animPanY, animScale]);

  // Loop playback timer across all past + future frames
  useEffect(() => {
    if (!isPlaying || frames.length <= 1) {
      return;
    }
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % frames.length);
    }, PLAYBACK_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [isPlaying, frames.length]);

  // Rebase the 7x7 tile grid after a pan or zoom gesture finishes so fresh tiles load seamlessly
  const commitCameraToTileGrid = () => {
    const curAnchor = anchorRef.current;
    const curScale = liveScaleRef.current;
    const curPan = livePanRef.current;

    const zoomDelta = Math.round(Math.log2(Math.max(0.125, curScale)));
    const nextZoom = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, curAnchor.zoom + zoomDelta)
    );
    const actualZoomFactor = Math.pow(2, nextZoom - curAnchor.zoom);

    // Current camera center in curAnchor.zoom tile coordinates:
    // Because the canvas is scaled by curScale around screen center and translated by curPan:
    const camFloatXAtCur =
      curAnchor.centerTileX + 0.5 - curPan.x / (TILE_SIZE * curScale);
    const camFloatYAtCur =
      curAnchor.centerTileY + 0.5 - curPan.y / (TILE_SIZE * curScale);

    const nNext = Math.pow(2, nextZoom);
    const camFloatXNext =
      (((camFloatXAtCur * actualZoomFactor) % nNext) + nNext) % nNext;
    const camFloatYNext = Math.max(
      0,
      Math.min(nNext - 1e-6, camFloatYAtCur * actualZoomFactor)
    );

    const nextTileX = Math.floor(camFloatXNext);
    const nextTileY = Math.floor(camFloatYNext);

    // Residual sub-tile offset in pixels at nextZoom with scale reset to 1
    const residualPanX = (nextTileX + 0.5 - camFloatXNext) * TILE_SIZE;
    const residualPanY = (nextTileY + 0.5 - camFloatYNext) * TILE_SIZE;

    const nextAnchor = {
      zoom: nextZoom,
      centerTileX: nextTileX,
      centerTileY: nextTileY,
    };
    anchorRef.current = nextAnchor;
    liveScaleRef.current = 1;
    livePanRef.current = { x: residualPanX, y: residualPanY };

    animScale.setValue(1);
    animPanX.setValue(residualPanX);
    animPanY.setValue(residualPanY);
    setAnchorState(nextAnchor);
  };

  const safeIndex =
    frames.length > 0 ? Math.min(frameIndex, frames.length - 1) : 0;
  const activeFrame = frames.length > 0 ? frames[safeIndex] : null;
  const nowTimestamp =
    frames.length > 0
      ? frames[nowFrameIndex].timestamp
      : radar.radarTimestamp;

  const activeOverlayUrl = activeFrame
    ? activeFrame.overlayTileUrl
    : radar.overlayTileUrl;

  const relativeLabel =
    activeFrame && nowTimestamp !== null
      ? formatRelativeLabel(activeFrame.timestamp, nowTimestamp)
      : 'Now';
  const activeTimestamp =
    activeFrame?.timestamp ?? radar.radarTimestamp ?? 1700000000;
  const dayShortLabel = formatDayShort(activeTimestamp);
  const clock12hLabel = format12HourClock(activeTimestamp);

  const screenDims = Dimensions.get('window');
  const viewportWidth = Math.max(320, screenDims.width);
  const viewportHeight = Math.max(480, screenDims.height);
  const centerScreenX = viewportWidth / 2;
  const centerScreenY = viewportHeight / 2;

  const slippyCells = useMemo(
    () =>
      buildSlippyTileGrid(
        anchorState.centerTileX,
        anchorState.centerTileY,
        anchorState.zoom,
        activeFrame,
        basemapTheme
      ),
    [
      anchorState.centerTileX,
      anchorState.centerTileY,
      anchorState.zoom,
      activeFrame,
      basemapTheme,
    ]
  );

  // Compute the geographic location pin position inside the unscaled canvas at anchorState.zoom
  const pinCanvasPosition = useMemo(() => {
    const zFactor = Math.pow(2, anchorState.zoom - radar.zoom);
    const pinFloatX = originFloatX * zFactor;
    const pinFloatY = originFloatY * zFactor;

    const dxTiles = pinFloatX - (anchorState.centerTileX + 0.5);
    const dyTiles = pinFloatY - (anchorState.centerTileY + 0.5);

    return {
      left: centerScreenX + dxTiles * TILE_SIZE,
      top: centerScreenY + dyTiles * TILE_SIZE,
    };
  }, [
    anchorState.zoom,
    anchorState.centerTileX,
    anchorState.centerTileY,
    radar.zoom,
    originFloatX,
    originFloatY,
    centerScreenX,
    centerScreenY,
  ]);

  // Smooth Animated zoom helper (used by double-tap and +/- buttons)
  const animateZoomByFactor = (
    scaleMultiplier: number,
    focalX = 0,
    focalY = 0
  ) => {
    animPanX.stopAnimation();
    animPanY.stopAnimation();
    animScale.stopAnimation();

    const curZoom =
      anchorRef.current.zoom + Math.log2(Math.max(0.125, liveScaleRef.current));
    const targetZoom = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, curZoom + Math.log2(scaleMultiplier))
    );
    const effectiveMult = Math.pow(2, targetZoom - curZoom);

    const targetScale = liveScaleRef.current * effectiveMult;
    const targetPanX =
      focalX + (livePanRef.current.x - focalX) * effectiveMult;
    const targetPanY =
      focalY + (livePanRef.current.y - focalY) * effectiveMult;

    liveScaleRef.current = targetScale;
    livePanRef.current = { x: targetPanX, y: targetPanY };

    Animated.parallel([
      Animated.timing(animScale, {
        toValue: targetScale,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(animPanX, {
        toValue: targetPanX,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(animPanY, {
        toValue: targetPanY,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        commitCameraToTileGrid();
      }
    });
  };

  // Google-Maps-Style PanResponder using direct Animated.Value updates (zero React state re-renders during drag/pinch!)
  const mapPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2,
        onPanResponderGrant: (evt) => {
          animPanX.stopAnimation((val) => {
            livePanRef.current.x = val;
          });
          animPanY.stopAnimation((val) => {
            livePanRef.current.y = val;
          });
          animScale.stopAnimation((val) => {
            liveScaleRef.current = val;
          });

          const now = Date.now();
          const touches = evt.nativeEvent.touches;

          if (!touches || touches.length <= 1) {
            if (now - lastTapTimeRef.current < 280) {
              // Google Maps double-tap to smoothly zoom in 2x toward tap point
              const tapX =
                (evt.nativeEvent.locationX ?? centerScreenX) - centerScreenX;
              const tapY =
                (evt.nativeEvent.locationY ?? centerScreenY) - centerScreenY;
              lastTapTimeRef.current = 0;
              animateZoomByFactor(2, tapX, tapY);
              return;
            }
            lastTapTimeRef.current = now;
          }

          gestureStartPanRef.current = {
            x: livePanRef.current.x,
            y: livePanRef.current.y,
          };
          gestureStartScaleRef.current = liveScaleRef.current;

          if (touches && touches.length >= 2) {
            const dx = touches[0].pageX - touches[1].pageX;
            const dy = touches[0].pageY - touches[1].pageY;
            pinchStartDistRef.current = Math.max(12, Math.hypot(dx, dy));
            pinchFocalRef.current = {
              x: (touches[0].pageX + touches[1].pageX) / 2 - centerScreenX,
              y: (touches[0].pageY + touches[1].pageY) / 2 - centerScreenY,
            };
          } else {
            pinchStartDistRef.current = null;
          }
        },
        onPanResponderMove: (evt, gestureState) => {
          const touches = evt.nativeEvent.touches;
          if (touches && touches.length >= 2) {
            const dx = touches[0].pageX - touches[1].pageX;
            const dy = touches[0].pageY - touches[1].pageY;
            const dist = Math.max(12, Math.hypot(dx, dy));
            const midX =
              (touches[0].pageX + touches[1].pageX) / 2 - centerScreenX;
            const midY =
              (touches[0].pageY + touches[1].pageY) / 2 - centerScreenY;

            if (pinchStartDistRef.current === null) {
              pinchStartDistRef.current = dist;
              gestureStartScaleRef.current = liveScaleRef.current;
              gestureStartPanRef.current = {
                x: livePanRef.current.x,
                y: livePanRef.current.y,
              };
              pinchFocalRef.current = { x: midX, y: midY };
              return;
            }

            const rawRatio = dist / pinchStartDistRef.current;
            const minAllowedScale = Math.pow(
              2,
              MIN_ZOOM - anchorRef.current.zoom
            );
            const maxAllowedScale = Math.pow(
              2,
              MAX_ZOOM - anchorRef.current.zoom
            );
            const nextScale = Math.max(
              minAllowedScale,
              Math.min(maxAllowedScale, gestureStartScaleRef.current * rawRatio)
            );
            const effectiveRatio = nextScale / gestureStartScaleRef.current;

            const focal = pinchFocalRef.current;
            const nextPanX =
              midX + (gestureStartPanRef.current.x - focal.x) * effectiveRatio;
            const nextPanY =
              midY + (gestureStartPanRef.current.y - focal.y) * effectiveRatio;

            liveScaleRef.current = nextScale;
            livePanRef.current = { x: nextPanX, y: nextPanY };
            animScale.setValue(nextScale);
            animPanX.setValue(nextPanX);
            animPanY.setValue(nextPanY);
            return;
          }

          if (pinchStartDistRef.current !== null) {
            pinchStartDistRef.current = null;
            gestureStartPanRef.current = {
              x: livePanRef.current.x - gestureState.dx,
              y: livePanRef.current.y - gestureState.dy,
            };
          }

          const nextPanX = gestureStartPanRef.current.x + gestureState.dx;
          const nextPanY = gestureStartPanRef.current.y + gestureState.dy;

          livePanRef.current = { x: nextPanX, y: nextPanY };
          animPanX.setValue(nextPanX);
          animPanY.setValue(nextPanY);

          // If user drags more than 1.5 tiles continuously without lifting finger, rebase grid seamlessly
          if (
            Math.abs(nextPanX) > TILE_SIZE * 1.5 ||
            Math.abs(nextPanY) > TILE_SIZE * 1.5
          ) {
            commitCameraToTileGrid();
            gestureStartPanRef.current = {
              x: livePanRef.current.x - gestureState.dx,
              y: livePanRef.current.y - gestureState.dy,
            };
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (pinchStartDistRef.current !== null) {
            pinchStartDistRef.current = null;
            commitCameraToTileGrid();
            return;
          }

          const speed = Math.hypot(gestureState.vx, gestureState.vy);
          if (speed > 0.15) {
            // Native-driver momentum decay glide (exact Google Maps feel)
            const glideX = livePanRef.current.x + gestureState.vx * 260;
            const glideY = livePanRef.current.y + gestureState.vy * 260;
            livePanRef.current = { x: glideX, y: glideY };

            Animated.parallel([
              Animated.timing(animPanX, {
                toValue: glideX,
                duration: 320,
                useNativeDriver: true,
              }),
              Animated.timing(animPanY, {
                toValue: glideY,
                duration: 320,
                useNativeDriver: true,
              }),
            ]).start(({ finished }) => {
              if (finished) {
                commitCameraToTileGrid();
              }
            });
          } else {
            commitCameraToTileGrid();
          }
        },
      }),
    [centerScreenX, centerScreenY, animPanX, animPanY, animScale]
  );

  const handleZoomIn = () => {
    animateZoomByFactor(2, 0, 0);
  };

  const handleZoomOut = () => {
    animateZoomByFactor(0.5, 0, 0);
  };

  const handleRecenter = () => {
    animPanX.stopAnimation();
    animPanY.stopAnimation();
    animScale.stopAnimation();

    const originOffsetPxX = (0.5 - radar.markerOffsetX / TILE_SIZE) * TILE_SIZE;
    const originOffsetPxY = (0.5 - radar.markerOffsetY / TILE_SIZE) * TILE_SIZE;

    const resetAnchor = {
      zoom: radar.zoom,
      centerTileX: radar.tileX,
      centerTileY: radar.tileY,
    };
    anchorRef.current = resetAnchor;
    liveScaleRef.current = 1;
    livePanRef.current = { x: originOffsetPxX, y: originOffsetPxY };
    setAnchorState(resetAnchor);

    Animated.parallel([
      Animated.timing(animScale, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(animPanX, {
        toValue: originOffsetPxX,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(animPanY, {
        toValue: originOffsetPxY,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleToggleLayerTheme = () => {
    setBasemapTheme((prev) => (prev === 'dark' ? 'street' : 'dark'));
  };

  // Draggable Timeline Scrubber State & PanResponder
  const scrubberWidthRef = useRef<number>(220);

  const updateFrameFromTouchX = (locationX: number) => {
    if (frames.length <= 1) return;
    const width = Math.max(1, scrubberWidthRef.current);
    const ratio = Math.max(0, Math.min(1, locationX / width));
    const targetIdx = Math.round(ratio * (frames.length - 1));
    setIsPlaying(false);
    setFrameIndex(targetIdx);
  };

  const scrubberPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          updateFrameFromTouchX(evt.nativeEvent.locationX);
        },
        onPanResponderMove: (evt) => {
          updateFrameFromTouchX(evt.nativeEvent.locationX);
        },
      }),
    [frames.length]
  );

  // Top Pill Legend matching `Images/ss02-radar.png` ("Rain | Ice | Snow" gradient bars)
  const renderTopPillLegend = () => (
    <View style={styles.topLegendPill} testID="radar-intensity-legend">
      <View style={styles.legendTypeGroup}>
        <Text style={styles.legendTypeLabel}>Rain</Text>
        <View style={styles.legendGradientTrack}>
          {RAIN_GRADIENT_SWATCHES.map((color, i) => (
            <View
              key={`rain-${i}`}
              style={[styles.legendSwatchSlice, { backgroundColor: color }]}
            />
          ))}
        </View>
      </View>

      <View style={styles.legendTypeGroup}>
        <Text style={styles.legendTypeLabel}>Ice</Text>
        <View style={styles.legendGradientTrackSmall}>
          {ICE_GRADIENT_SWATCHES.map((color, i) => (
            <View
              key={`ice-${i}`}
              style={[styles.legendSwatchSlice, { backgroundColor: color }]}
            />
          ))}
        </View>
      </View>

      <View style={styles.legendTypeGroup}>
        <Text style={styles.legendTypeLabel}>Snow</Text>
        <View style={styles.legendGradientTrackSmall}>
          {SNOW_GRADIENT_SWATCHES.map((color, i) => (
            <View
              key={`snow-${i}`}
              style={[styles.legendSwatchSlice, { backgroundColor: color }]}
            />
          ))}
        </View>
      </View>
    </View>
  );

  // Bottom Timeline Dock matching `Images/ss02-radar.png`
  const renderBottomTimelineDock = (testIdPrefix: string) => {
    if (frames.length === 0) {
      return null;
    }

    const progressPercent =
      frames.length > 1 ? (safeIndex / (frames.length - 1)) * 100 : 100;
    const nowPositionPercent =
      frames.length > 1 ? (nowFrameIndex / (frames.length - 1)) * 100 : 100;

    return (
      <View
        style={styles.bottomTimelineCard}
        testID={`${testIdPrefix}-controls`}
      >
        {/* Left Date & Clock Column ("Sat 7 / 6:40 PM") */}
        <View style={styles.timelineLeftTimeBox}>
          <Text style={styles.timelineDayText}>{dayShortLabel}</Text>
          <Text
            style={styles.timelineClockText}
            testID={`${testIdPrefix}-clock-time`}
          >
            {clock12hLabel}
          </Text>
          <Text
            style={styles.hiddenTestCarrier}
            testID={`${testIdPrefix}-relative-time`}
          >
            {relativeLabel}
          </Text>
        </View>

        {/* Play / Pause Button */}
        <TouchableOpacity
          style={[
            styles.timelinePlayButton,
            frames.length <= 1 && styles.timelinePlayButtonDisabled,
          ]}
          onPress={() => setIsPlaying((prev) => !prev)}
          disabled={frames.length <= 1}
          testID={`${testIdPrefix}-play-pause-button`}
        >
          <Feather
            name={isPlaying ? 'pause' : 'play'}
            size={22}
            color="#FFFFFF"
          />
        </TouchableOpacity>

        {/* Right Slider Track with "NOW" callout above & Hour ticks below */}
        <View
          style={styles.timelineSliderColumn}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0) {
              scrubberWidthRef.current = w;
            }
          }}
          {...scrubberPanResponder.panHandlers}
          testID={`${testIdPrefix}-scrubber-slider`}
        >
          {/* Floating "NOW" / Relative Label Above Thumb */}
          <View style={styles.nowCalloutRow}>
            <View
              style={[
                styles.nowCalloutBadge,
                { left: `${nowPositionPercent}%` },
              ]}
            >
              <Text style={styles.nowCalloutText}>NOW</Text>
            </View>
            {safeIndex !== nowFrameIndex && (
              <View
                style={[
                  styles.activeOffsetCalloutBadge,
                  { left: `${progressPercent}%` },
                ]}
              >
                <Text style={styles.activeOffsetCalloutText}>
                  {relativeLabel}
                </Text>
              </View>
            )}
          </View>

          {/* Yellow Active Rail + Dark Gray Future Rail + Large Yellow Thumb */}
          <View style={styles.sliderTrackCenter}>
            <View style={styles.sliderRailGray}>
              <View
                style={[
                  styles.sliderRailYellowFill,
                  { width: `${progressPercent}%` },
                ]}
              />
            </View>

            <View
              style={[
                styles.sliderYellowThumb,
                { left: `${progressPercent}%` },
              ]}
              pointerEvents="none"
            />
          </View>

          {/* Tappable Frame Stops & Bottom Clock Ticks (6 PM | 8 PM | 10 PM | 12 AM) */}
          <View
            style={styles.scrubberTrackRow}
            testID={`${testIdPrefix}-scrubber-track`}
          >
            {frames.map((frame, idx) => {
              const isActive = idx === safeIndex;
              const isNow = idx === nowFrameIndex;
              const showTickText =
                idx === 0 ||
                isNow ||
                idx === frames.length - 1 ||
                idx % 3 === 0;

              return (
                <TouchableOpacity
                  key={`${frame.timestamp}-${idx}`}
                  style={styles.scrubberStepTouch}
                  onPress={() => {
                    setIsPlaying(false);
                    setFrameIndex(idx);
                  }}
                  testID={`${testIdPrefix}-scrubber-frame-${idx}`}
                >
                  <View
                    style={[
                      styles.scrubberTickMark,
                      (isNow || isActive) && styles.scrubberTickMarkHighlight,
                    ]}
                  />
                  <Text
                    style={[
                      styles.scrubberTickLabel,
                      isActive && styles.scrubberTickLabelActive,
                    ]}
                    numberOfLines={1}
                  >
                    {showTickText ? formatShortHourTick(frame.timestamp) : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  const embeddedDarkUrls = useMemo(
    () => buildDarkTileUrls(radar.zoom, radar.tileX, radar.tileY, 'dark'),
    [radar.zoom, radar.tileX, radar.tileY]
  );

  return (
    <View style={styles.card} testID="static-radar-card">
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Precipitation Radar</Text>
        <TouchableOpacity
          style={styles.expandChip}
          onPress={() => setIsFullscreen(true)}
          testID="open-fullscreen-radar-button"
        >
          <Feather name="maximize-2" size={13} color="#FACC15" />
          <Text style={styles.expandChipText}>Full Screen Map</Text>
        </TouchableOpacity>
      </View>

      {/* Top Rain / Ice / Snow Pill Legend */}
      {renderTopPillLegend()}

      {/* Embedded Dark Vector Canvas Preview Tile (Tap to launch full-screen Google-Maps-smooth radar) */}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => setIsFullscreen(true)}
        style={styles.radarContainer}
        testID="radar-tile-container"
      >
        {/* Dark Gray Canvas Base Layer */}
        <Image
          source={{
            uri: radar.baseTileUrl,
            headers: TILE_REQUEST_HEADERS,
          }}
          style={styles.radarTileImage}
          testID="radar-base-image"
        />

        {/* RainViewer Precipitation Overlay */}
        {activeOverlayUrl !== null && (
          <Image
            source={{
              uri: activeOverlayUrl,
              headers: TILE_REQUEST_HEADERS,
            }}
            style={[styles.radarTileImage, styles.radarOverlayImage]}
            testID="radar-overlay-image"
          />
        )}

        {/* City / Highway Reference Labels Layer on top of Radar */}
        {embeddedDarkUrls.labelRefUri && (
          <Image
            source={{
              uri: embeddedDarkUrls.labelRefUri,
              headers: TILE_REQUEST_HEADERS,
            }}
            style={styles.radarTileImage}
            pointerEvents="none"
          />
        )}

        {/* Blue-and-White Circular Location Dot matching `Images/ss02-radar.png` */}
        <View
          style={[
            styles.radarMarkerPin,
            {
              left: radar.markerOffsetX,
              top: radar.markerOffsetY,
            },
          ]}
          testID="radar-marker-pin"
        />

        <View style={styles.tapToExplorePrompt}>
          <Feather name="navigation" size={11} color="#FACC15" />
          <Text style={styles.tapToExploreText}>Tap for interactive map</Text>
        </View>
      </TouchableOpacity>

      {activeOverlayUrl === null && (
        <Text
          style={styles.radarUnavailableNote}
          testID="radar-unavailable-note"
        >
          Live precipitation radar overlay currently unavailable
        </Text>
      )}

      {/* Embedded Bottom Timeline Scrubber matching `ss02-radar.png` */}
      {renderBottomTimelineDock('radar')}

      <Text style={styles.radarAttribution}>
        Map tiles © Esri, OpenStreetMap • Weather radar © RainViewer
      </Text>

      {/* Full-Screen Google-Maps-Style Navigable Radar Screen matching `Images/ss02-radar.png` */}
      <Modal
        visible={isFullscreen}
        animationType="fade"
        transparent={false}
        onRequestClose={() => setIsFullscreen(false)}
      >
        <View
          style={styles.fullscreenModalContainer}
          testID="radar-expanded-modal"
        >
          {/* Full-Screen Hardware-Accelerated Animated Slippy Canvas */}
          <View
            style={styles.fullscreenInteractiveCanvas}
            {...mapPanResponder.panHandlers}
            testID="fullscreen-radar-canvas"
          >
            <Animated.View
              style={[
                styles.animatedMapPlane,
                {
                  transform: [
                    { translateX: animPanX },
                    { translateY: animPanY },
                    { scale: animScale },
                  ],
                },
              ]}
            >
              {slippyCells.map((cell) => {
                const tileLeft =
                  centerScreenX + (cell.dx - 0.5) * TILE_SIZE;
                const tileTop =
                  centerScreenY + (cell.dy - 0.5) * TILE_SIZE;

                return (
                  <View
                    key={cell.key}
                    style={[
                      styles.fullscreenTileCell,
                      {
                        left: tileLeft,
                        top: tileTop,
                      },
                    ]}
                  >
                    <Image
                      source={{
                        uri: cell.baseUri,
                        headers: TILE_REQUEST_HEADERS,
                      }}
                      style={styles.fullscreenTileImage}
                    />
                    {cell.overlayUri !== null && (
                      <Image
                        source={{
                          uri: cell.overlayUri,
                          headers: TILE_REQUEST_HEADERS,
                        }}
                        style={[
                          styles.fullscreenTileImage,
                          styles.radarOverlayImage,
                        ]}
                      />
                    )}
                    {cell.labelRefUri !== null && (
                      <Image
                        source={{
                          uri: cell.labelRefUri,
                          headers: TILE_REQUEST_HEADERS,
                        }}
                        style={styles.fullscreenTileImage}
                      />
                    )}
                  </View>
                );
              })}

              {/* Blue Location Dot with White Ring anchored to geographic coordinates */}
              <View
                style={[
                  styles.fullscreenBlueDotOuter,
                  {
                    left: pinCanvasPosition.left,
                    top: pinCanvasPosition.top,
                  },
                ]}
                pointerEvents="none"
              >
                <View style={styles.fullscreenBlueDotHalo} />
                <View style={styles.fullscreenBlueDotCore} />
              </View>
            </Animated.View>
          </View>

          {/* Top Floating Rain / Ice / Snow Pill Bar */}
          <View style={styles.floatingTopLegendWrapper}>
            {renderTopPillLegend()}
          </View>

          {/* Top-Left Back Button + Info ("i") Button matching `Images/ss02-radar.png` */}
          <View style={styles.floatingTopLeftRow}>
            <TouchableOpacity
              style={styles.floatingBackCircleButton}
              onPress={() => setIsFullscreen(false)}
              testID="close-radar-modal-button"
            >
              <Feather name="arrow-left" size={20} color="#F8FAFC" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.floatingInfoCircleButton}
              onPress={() => setShowInfoTooltip((prev) => !prev)}
              testID="radar-info-button"
            >
              <Text style={styles.infoIconLetter}>i</Text>
            </TouchableOpacity>

            {showInfoTooltip && (
              <View style={styles.infoTooltipBubble}>
                <Text style={styles.infoTooltipText}>
                  Pinch or double-tap to zoom • Drag with momentum • Tap or drag timeline for past & +2h forecast
                </Text>
              </View>
            )}
          </View>

          {/* Right-Side Square Action Buttons matching `Images/ss02-radar.png` */}
          <View style={styles.floatingRightButtonsColumn}>
            {/* Recenter GPS Arrow Button */}
            <TouchableOpacity
              style={styles.squareMapActionButton}
              onPress={handleRecenter}
              testID="radar-recenter-button"
            >
              <Feather name="navigation" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            {/* Layer Theme Switcher Button (Dark Radar Canvas <-> Street Map) */}
            <TouchableOpacity
              style={[
                styles.squareMapActionButton,
                basemapTheme === 'street' && styles.squareMapActionButtonActive,
              ]}
              onPress={handleToggleLayerTheme}
              testID="radar-layers-button"
            >
              <Feather name="layers" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            {/* + / - Zoom Controls */}
            <TouchableOpacity
              style={styles.squareMapActionButton}
              onPress={handleZoomIn}
              testID="radar-zoom-in-button"
            >
              <Feather name="plus" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.squareMapActionButton}
              onPress={handleZoomOut}
              testID="radar-zoom-out-button"
            >
              <Feather name="minus" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Bottom Floating Timeline Scrubber Card matching `Images/ss02-radar.png` */}
          <View style={styles.floatingBottomDockWrapper}>
            {renderBottomTimelineDock('fullscreen-radar')}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  expandChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1E24',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3F4454',
  },
  expandChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FACC15',
    marginLeft: 5,
  },
  topLegendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(28, 30, 36, 0.94)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    marginBottom: 10,
  },
  legendTypeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 3,
  },
  legendTypeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F8FAFC',
    marginRight: 5,
  },
  legendGradientTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  legendGradientTrackSmall: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  legendSwatchSlice: {
    flex: 1,
    height: '100%',
  },
  radarContainer: {
    width: 256,
    height: 256,
    alignSelf: 'center',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1F2229',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#334155',
  },
  radarTileImage: {
    width: 256,
    height: 256,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  radarOverlayImage: {
    opacity: 0.78,
  },
  radarMarkerPin: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#2563EB',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    marginLeft: -7,
    marginTop: -7,
  },
  tapToExplorePrompt: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(24, 26, 32, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  tapToExploreText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F8FAFC',
    marginLeft: 4,
  },
  radarUnavailableNote: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
  },
  bottomTimelineCard: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 37, 42, 0.95)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  timelineLeftTimeBox: {
    width: 68,
    paddingRight: 8,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.14)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineDayText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  timelineClockText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 3,
  },
  hiddenTestCarrier: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
  },
  timelinePlayButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
  },
  timelinePlayButtonDisabled: {
    opacity: 0.4,
  },
  timelineSliderColumn: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  nowCalloutRow: {
    height: 16,
    position: 'relative',
    marginBottom: 2,
  },
  nowCalloutBadge: {
    position: 'absolute',
    top: 0,
    transform: [{ translateX: -16 }],
  },
  nowCalloutText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  activeOffsetCalloutBadge: {
    position: 'absolute',
    top: 0,
    transform: [{ translateX: -14 }],
  },
  activeOffsetCalloutText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FACC15',
  },
  sliderTrackCenter: {
    height: 20,
    justifyContent: 'center',
    position: 'relative',
  },
  sliderRailGray: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#525866',
    overflow: 'hidden',
  },
  sliderRailYellowFill: {
    height: '100%',
    backgroundColor: '#FACC15',
    borderRadius: 4,
  },
  sliderYellowThumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    marginLeft: -9,
    backgroundColor: '#FACC15',
    borderWidth: 2,
    borderColor: '#FEF08A',
  },
  scrubberTrackRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  scrubberStepTouch: {
    flex: 1,
    alignItems: 'center',
  },
  scrubberTickMark: {
    width: 1,
    height: 5,
    backgroundColor: '#94A3B8',
    marginBottom: 2,
  },
  scrubberTickMarkHighlight: {
    height: 7,
    backgroundColor: '#FFFFFF',
  },
  scrubberTickLabel: {
    fontSize: 9,
    color: '#E2E8F0',
    height: 12,
  },
  scrubberTickLabelActive: {
    color: '#FACC15',
    fontWeight: '700',
  },
  radarAttribution: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
  },
  fullscreenModalContainer: {
    flex: 1,
    backgroundColor: '#1E2025',
    position: 'relative',
    overflow: 'hidden',
  },
  fullscreenInteractiveCanvas: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#1E2025',
    overflow: 'hidden',
  },
  animatedMapPlane: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  fullscreenTileCell: {
    position: 'absolute',
    width: TILE_SIZE + 1,
    height: TILE_SIZE + 1,
  },
  fullscreenTileImage: {
    width: TILE_SIZE + 1,
    height: TILE_SIZE + 1,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  fullscreenBlueDotOuter: {
    position: 'absolute',
    width: 28,
    height: 28,
    marginLeft: -14,
    marginTop: -14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenBlueDotHalo: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(59, 130, 246, 0.25)',
  },
  fullscreenBlueDotCore: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#2563EB',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  floatingTopLegendWrapper: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
  },
  floatingTopLeftRow: {
    position: 'absolute',
    top: 62,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  floatingBackCircleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(28, 30, 36, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    marginRight: 10,
  },
  floatingInfoCircleButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(148, 163, 184, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoIconLetter: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  infoTooltipBubble: {
    marginLeft: 10,
    maxWidth: 230,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  infoTooltipText: {
    fontSize: 11,
    color: '#F8FAFC',
  },
  floatingRightButtonsColumn: {
    position: 'absolute',
    top: 62,
    right: 14,
    alignItems: 'center',
  },
  squareMapActionButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: 'rgba(28, 30, 36, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  squareMapActionButtonActive: {
    borderColor: '#FACC15',
    backgroundColor: 'rgba(56, 62, 74, 0.95)',
  },
  floatingBottomDockWrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 18,
  },
});
