"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type MapLocation = {
  label: string;
  address?: string;
  latitude: number;
  longitude: number;
};

type MapSpot = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  pop: number;
  precipitation: number;
};

type InteractiveWeatherMapProps = {
  condition: string;
  high: number;
  location: MapLocation;
  low: number;
  maxPop: number;
  precipitation: number;
  source: string;
  spots: MapSpot[];
  temperature: number;
};

type Coordinate = {
  latitude: number;
  longitude: number;
};

type KakaoLatLng = Coordinate & {
  getLat(): number;
  getLng(): number;
};

type KakaoMapInstance = {
  getLevel(): number;
  relayout(): void;
  setCenter(position: KakaoLatLng): void;
  setLevel(level: number, options?: { animate?: boolean }): void;
};

type KakaoOverlay = {
  setMap(map: KakaoMapInstance | null): void;
};

type KakaoMapsApi = {
  CustomOverlay: new (options: {
    content: HTMLElement;
    position: KakaoLatLng;
    xAnchor?: number;
    yAnchor?: number;
    zIndex?: number;
  }) => KakaoOverlay;
  LatLng: new (latitude: number, longitude: number) => KakaoLatLng;
  Map: new (
    container: HTMLElement,
    options: { center: KakaoLatLng; level: number },
  ) => KakaoMapInstance;
  load(callback: () => void): void;
};

declare global {
  interface Window {
    kakao?: { maps: KakaoMapsApi };
  }
}

type MapProvider = "kakao" | "loading" | "openstreetmap";

const TILE_SIZE = 256;
const MIN_ZOOM = 6;
const MAX_ZOOM = 18;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function project(coordinate: Coordinate, zoom: number) {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const latitude = clamp(coordinate.latitude, -85.05112878, 85.05112878);
  const sine = Math.sin((latitude * Math.PI) / 180);

  return {
    x: ((coordinate.longitude + 180) / 360) * worldSize,
    y:
      (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) *
      worldSize,
  };
}

function unproject(point: { x: number; y: number }, zoom: number): Coordinate {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const longitude = (point.x / worldSize) * 360 - 180;
  const latitude =
    (Math.atan(Math.sinh(Math.PI - (2 * Math.PI * point.y) / worldSize)) *
      180) /
    Math.PI;

  return {
    latitude: clamp(latitude, -85.05112878, 85.05112878),
    longitude: normalizeLongitude(longitude),
  };
}

function spotIntensity(spot: MapSpot) {
  if (spot.precipitation >= 3 || spot.pop >= 70) return "heavy";
  if (spot.precipitation >= 1 || spot.pop >= 50) return "mid";
  if (spot.pop >= 25) return "light";
  return "clear";
}

function buildSpotElement(spot: MapSpot) {
  const element = document.createElement("div");
  element.className = `map-rain-marker ${spotIntensity(spot)}`;

  const label = document.createElement("strong");
  label.textContent = spot.label;
  const amount = document.createElement("span");
  amount.textContent = `${spot.precipitation.toFixed(1)}mm`;
  const probability = document.createElement("small");
  probability.textContent = `강수 ${spot.pop}%`;

  element.append(label, amount, probability);
  return element;
}

function buildCurrentLocationElement(label: string) {
  const wrapper = document.createElement("div");
  wrapper.className = "map-current-marker";
  const pin = document.createElement("span");
  const text = document.createElement("strong");
  text.textContent = label;
  wrapper.append(pin, text);
  return wrapper;
}

function OpenStreetMap({
  center,
  currentPosition,
  onCenterChange,
  onZoomChange,
  spots,
  zoom,
}: {
  center: Coordinate;
  currentPosition: Coordinate;
  onCenterChange: (coordinate: Coordinate) => void;
  onZoomChange: (zoom: number) => void;
  spots: MapSpot[];
  zoom: number;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    center: Coordinate;
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const [size, setSize] = useState({ height: 0, width: 0 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver(([entry]) => {
      setSize({
        height: entry.contentRect.height,
        width: entry.contentRect.width,
      });
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const nextZoom = clamp(
        zoom + (event.deltaY < 0 ? 1 : -1),
        MIN_ZOOM,
        MAX_ZOOM,
      );
      if (nextZoom === zoom) return;

      const bounds = viewport.getBoundingClientRect();
      const offset = {
        x: event.clientX - bounds.left - size.width / 2,
        y: event.clientY - bounds.top - size.height / 2,
      };
      const oldCenter = project(center, zoom);
      const scale = 2 ** (nextZoom - zoom);
      const nextCenterPoint = {
        x: (oldCenter.x + offset.x) * scale - offset.x,
        y: (oldCenter.y + offset.y) * scale - offset.y,
      };

      onCenterChange(unproject(nextCenterPoint, nextZoom));
      onZoomChange(nextZoom);
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [center, onCenterChange, onZoomChange, size.height, size.width, zoom]);

  const centerPoint = project(center, zoom);
  const tiles = useMemo(() => {
    if (!size.width || !size.height) return [];

    const tileCount = 2 ** zoom;
    const left = centerPoint.x - size.width / 2;
    const top = centerPoint.y - size.height / 2;
    const firstX = Math.floor(left / TILE_SIZE);
    const lastX = Math.floor((left + size.width) / TILE_SIZE);
    const firstY = Math.max(0, Math.floor(top / TILE_SIZE));
    const lastY = Math.min(
      tileCount - 1,
      Math.floor((top + size.height) / TILE_SIZE),
    );
    const nextTiles: Array<{
      key: string;
      left: number;
      sourceX: number;
      top: number;
      y: number;
    }> = [];

    for (let x = firstX; x <= lastX; x += 1) {
      for (let y = firstY; y <= lastY; y += 1) {
        nextTiles.push({
          key: `${zoom}-${x}-${y}`,
          left: x * TILE_SIZE - left,
          sourceX: ((x % tileCount) + tileCount) % tileCount,
          top: y * TILE_SIZE - top,
          y,
        });
      }
    }

    return nextTiles;
  }, [centerPoint.x, centerPoint.y, size.height, size.width, zoom]);

  function screenPosition(coordinate: Coordinate) {
    const point = project(coordinate, zoom);
    const worldSize = TILE_SIZE * 2 ** zoom;
    let deltaX = point.x - centerPoint.x;

    if (deltaX > worldSize / 2) deltaX -= worldSize;
    if (deltaX < -worldSize / 2) deltaX += worldSize;

    return {
      left: size.width / 2 + deltaX,
      top: size.height / 2 + point.y - centerPoint.y,
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      center,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    setDragging(true);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const start = project(drag.center, zoom);
    onCenterChange(
      unproject(
        {
          x: start.x - (event.clientX - drag.x),
          y: start.y - (event.clientY - drag.y),
        },
        zoom,
      ),
    );
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const currentPositionStyle = screenPosition(currentPosition);

  return (
    <div
      aria-label="드래그와 마우스 휠로 조작하는 현재 위치 주변 지도"
      className={`slippy-map ${dragging ? "dragging" : ""}`}
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      ref={viewportRef}
      role="application"
    >
      <div className="map-tile-layer" aria-hidden="true">
        {tiles.map((tile) => (
          // OSM raster tiles are used only as a no-key fallback for the map.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            draggable={false}
            key={tile.key}
            src={`https://tile.openstreetmap.org/${zoom}/${tile.sourceX}/${tile.y}.png`}
            style={{ left: tile.left, top: tile.top }}
          />
        ))}
      </div>

      {spots
        .filter((spot) => spot.id !== "c")
        .map((spot) => {
          const position = screenPosition(spot);
          return (
            <div
              className={`map-rain-marker ${spotIntensity(spot)}`}
              key={spot.id}
              style={{ left: position.left, top: position.top }}
            >
              <strong>{spot.label}</strong>
              <span>{spot.precipitation.toFixed(1)}mm</span>
              <small>강수 {spot.pop}%</small>
            </div>
          );
        })}

      <div
        className="map-current-marker"
        style={{ left: currentPositionStyle.left, top: currentPositionStyle.top }}
      >
        <span />
        <strong>내 위치</strong>
      </div>

      <a
        className="map-attribution"
        href="https://www.openstreetmap.org/copyright"
        rel="noreferrer"
        target="_blank"
      >
        © OpenStreetMap contributors
      </a>
    </div>
  );
}

export default function InteractiveWeatherMap({
  condition,
  high,
  location,
  low,
  maxPop,
  precipitation,
  source,
  spots,
  temperature,
}: InteractiveWeatherMapProps) {
  const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY?.trim();
  const weatherSearchQuery = encodeURIComponent(`${location.label} 날씨`);
  const naverWeatherUrl = `https://search.naver.com/search.naver?query=${weatherSearchQuery}`;
  const daumWeatherUrl = `https://search.daum.net/search?w=tot&q=${weatherSearchQuery}`;
  const kakaoContainerRef = useRef<HTMLDivElement>(null);
  const kakaoMapRef = useRef<KakaoMapInstance | null>(null);
  const overlaysRef = useRef<KakaoOverlay[]>([]);
  const [provider, setProvider] = useState<MapProvider>(
    kakaoKey ? "loading" : "openstreetmap",
  );
  const [center, setCenter] = useState<Coordinate>({
    latitude: location.latitude,
    longitude: location.longitude,
  });
  const [currentPosition, setCurrentPosition] = useState<Coordinate>({
    latitude: location.latitude,
    longitude: location.longitude,
  });
  const [zoom, setZoom] = useState(12);
  const [mapVersion, setMapVersion] = useState(0);
  const [locationMessage, setLocationMessage] = useState("");
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!kakaoKey) return;

    let cancelled = false;
    let timedOut = false;
    const fallbackTimer = window.setTimeout(() => {
      if (!kakaoMapRef.current) {
        timedOut = true;
        setProvider("openstreetmap");
      }
    }, 8000);
    const initialize = () => {
      window.kakao?.maps.load(() => {
        if (cancelled || timedOut || !kakaoContainerRef.current || !window.kakao) return;

        const maps = window.kakao.maps;
        const map = new maps.Map(kakaoContainerRef.current, {
          center: new maps.LatLng(location.latitude, location.longitude),
          level: 8,
        });
        kakaoMapRef.current = map;
        window.clearTimeout(fallbackTimer);
        setProvider("kakao");
        setMapVersion((version) => version + 1);
      });
    };

    if (window.kakao?.maps) {
      initialize();
      return () => {
        cancelled = true;
        window.clearTimeout(fallbackTimer);
      };
    }

    const scriptId = "kakao-map-sdk";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.async = true;
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(kakaoKey)}&autoload=false`;
      document.head.appendChild(script);
    }
    script.addEventListener("load", initialize);
    script.addEventListener("error", () => setProvider("openstreetmap"), {
      once: true,
    });

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      script?.removeEventListener("load", initialize);
    };
  }, [kakaoKey, location.latitude, location.longitude]);

  useEffect(() => {
    const map = kakaoMapRef.current;
    const maps = window.kakao?.maps;
    if (provider !== "kakao" || !map || !maps) return;

    map.relayout();
    map.setCenter(new maps.LatLng(center.latitude, center.longitude));
  }, [center.latitude, center.longitude, provider]);

  useEffect(() => {
    const map = kakaoMapRef.current;
    const maps = window.kakao?.maps;
    if (provider !== "kakao" || !map || !maps) return;

    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    const overlays = spots
      .filter((spot) => spot.id !== "c")
      .map(
        (spot) =>
          new maps.CustomOverlay({
            content: buildSpotElement(spot),
            position: new maps.LatLng(spot.latitude, spot.longitude),
            xAnchor: 0.5,
            yAnchor: 0.5,
            zIndex: 2,
          }),
      );
    overlays.push(
      new maps.CustomOverlay({
        content: buildCurrentLocationElement("내 위치"),
        position: new maps.LatLng(
          currentPosition.latitude,
          currentPosition.longitude,
        ),
        xAnchor: 0.5,
        yAnchor: 1,
        zIndex: 5,
      }),
    );
    overlays.forEach((overlay) => overlay.setMap(map));
    overlaysRef.current = overlays;

    return () => overlays.forEach((overlay) => overlay.setMap(null));
  }, [currentPosition.latitude, currentPosition.longitude, mapVersion, provider, spots]);

  function zoomMap(direction: "in" | "out") {
    const map = kakaoMapRef.current;
    if (provider === "kakao" && map) {
      const delta = direction === "in" ? -1 : 1;
      map.setLevel(clamp(map.getLevel() + delta, 1, 14), { animate: true });
      return;
    }
    setZoom((currentZoom) =>
      clamp(currentZoom + (direction === "in" ? 1 : -1), MIN_ZOOM, MAX_ZOOM),
    );
  }

  function findMyLocation() {
    if (!navigator.geolocation) {
      setLocationMessage("이 브라우저에서는 현재 위치를 찾을 수 없습니다.");
      return;
    }

    setLocating(true);
    setLocationMessage("현재 위치를 확인하고 있습니다…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setCurrentPosition(nextPosition);
        setCenter(nextPosition);
        setLocationMessage(`현재 위치 · 오차 약 ${Math.round(position.coords.accuracy)}m`);
        setLocating(false);
      },
      () => {
        setLocationMessage("위치 권한을 허용하면 지도가 현재 위치로 이동합니다.");
        setLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 },
    );
  }

  return (
    <div className="interactive-map-shell">
      {provider === "kakao" || provider === "loading" ? (
        <div className="kakao-map" ref={kakaoContainerRef} />
      ) : (
        <OpenStreetMap
          center={center}
          currentPosition={currentPosition}
          onCenterChange={setCenter}
          onZoomChange={setZoom}
          spots={spots}
          zoom={zoom}
        />
      )}

      {provider === "loading" ? (
        <div className="map-loading">카카오 지도를 불러오는 중입니다…</div>
      ) : null}

      <section className="map-weather-window" aria-label="현재 날씨 요약">
        <div>
          <span>현재</span>
          <strong>{temperature}°</strong>
        </div>
        <p>
          <strong>{condition}</strong>
          <span>{location.address ?? location.label}</span>
        </p>
        <dl>
          <div>
            <dt>강수확률</dt>
            <dd>{maxPop}%</dd>
          </div>
          <div>
            <dt>강수량</dt>
            <dd>{precipitation.toFixed(1)}mm</dd>
          </div>
          <div>
            <dt>최고 / 최저</dt>
            <dd>{high}° / {low}°</dd>
          </div>
        </dl>
        <nav className="external-weather-links" aria-label="외부 날씨 서비스">
          <a href={naverWeatherUrl} rel="noreferrer" target="_blank">
            네이버 날씨 <span aria-hidden="true">↗</span>
          </a>
          <a className="daum" href={daumWeatherUrl} rel="noreferrer" target="_blank">
            카카오·다음 날씨 <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </section>

      <div className="map-controls" aria-label="지도 조작">
        <button aria-label="지도 확대" onClick={() => zoomMap("in")} type="button">
          +
        </button>
        <button aria-label="지도 축소" onClick={() => zoomMap("out")} type="button">
          −
        </button>
        <button
          aria-label="내 위치로 이동"
          className="locate-button"
          disabled={locating}
          onClick={findMyLocation}
          type="button"
        >
          ◎
        </button>
      </div>

      <div className="map-help">
        <span>{provider === "kakao" ? "카카오 지도" : "OpenStreetMap"}</span>
        <strong>드래그로 이동 · 휠로 확대/축소</strong>
        {locationMessage ? <small>{locationMessage}</small> : null}
      </div>

      <div className="map-source">강수 격자 · {source}</div>
    </div>
  );
}
