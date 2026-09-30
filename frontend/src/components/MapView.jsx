import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';

// Fix for default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Create custom marker icons for different states
const createNumberedIcon = (number, isSelected = false) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background-color: ${isSelected ? '#ef4444' : '#2563eb'};
      color: white;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 14px;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    ">${number}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

// Component to handle routing với OSRM
const RoutingMachine = ({ locations }) => {
  const map = useMap();
  const routingControlRef = useRef(null);

  useEffect(() => {
    if (!map || locations.length < 2) return;
    
    // ✅ GIẢM OSRM CALLS: Chỉ vẽ route nếu ≤ 10 waypoints
    // Nếu quá nhiều → skip routing để tránh 502 error
    const MAX_WAYPOINTS = 10;
    if (locations.length > MAX_WAYPOINTS) {
      console.warn(`⚠️  Quá nhiều locations (${locations.length}), skip routing để tránh OSRM overload`);
      return;
    }

    // Cleanup existing routing control properly
    if (routingControlRef.current) {
      try {
        // Abort any pending routing request (best-effort)
        const router = routingControlRef.current?._router;
        const xhr = router?._xhr;
        if (xhr && typeof xhr.abort === 'function') {
          try {
            xhr.abort();
          } catch (e) {
            // ignore
          }
        }

        // Remove from map safely (routing control is not a layer)
        if (map && typeof map.removeControl === 'function') {
          map.removeControl(routingControlRef.current);
        }
        // Clear internal state safely
        if (routingControlRef.current._line && routingControlRef.current._line.remove) {
          try {
            routingControlRef.current._line.remove();
          } catch (lineError) {
            // Line might already be removed
          }
        }
      } catch (e) {
        // Silently ignore cleanup errors
      }
      routingControlRef.current = null;
    }

    const waypoints = locations.map((loc) => L.latLng(loc.lat, loc.lng));

    try {
      const routingControl = L.Routing.control({
        waypoints,
        routeWhileDragging: false,
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: false,
        showAlternatives: false,
        lineOptions: {
          styles: [
            {
              color: '#2563eb',
              opacity: 0.8,
              weight: 5,
            },
          ],
          extendToWaypoints: true,
          missingRouteTolerance: 0,
        },
        createMarker: () => null, // không dùng marker mặc định
        router: L.Routing.osrmv1({
          serviceUrl: 'http://localhost:5000/osrm/route/v1',
        }),
      }).addTo(map);

      try {
        routingControl.on('routingerror', () => {
          try {
            console.warn('OSRM routing failed');
          } catch (e) {
            // ignore
          }
          try {
            map.removeControl(routingControl);
          } catch (e) {
            // ignore
          }
        });
      } catch (e) {
        // ignore
      }

      // Ẩn panel hướng dẫn mặc định
      const container = routingControl.getContainer();
      if (container) {
        container.style.display = 'none';
      }

      routingControlRef.current = routingControl;
    } catch (e) {
      console.log('Error creating routing control:', e.message);
    }

    return () => {
      if (routingControlRef.current && map) {
        try {
          // Abort any pending routing request (best-effort)
          const router = routingControlRef.current?._router;
          const xhr = router?._xhr;
          if (xhr && typeof xhr.abort === 'function') {
            try {
              xhr.abort();
            } catch (e) {
              // ignore
            }
          }

          // Properly cleanup before unmount
          if (typeof map.removeControl === 'function') {
            map.removeControl(routingControlRef.current);
          }
          if (routingControlRef.current._line) {
            routingControlRef.current._line.remove();
          }
        } catch (e) {
          // Silently ignore cleanup errors
        }
        routingControlRef.current = null;
      }
    };
  }, [map, locations]);

  return null;
};

// Component to handle map updates
const MapController = ({ center, zoom, selectedLocation }) => {
  const map = useMap();

  useEffect(() => {
    if (selectedLocation) {
      map.setView([selectedLocation.lat, selectedLocation.lng], 16, {
        animate: true,
        duration: 1,
      });
    } else if (center) {
      map.setView(center, zoom, {
        animate: true,
        duration: 1,
      });
    }
  }, [selectedLocation, center, zoom, map]);

  return null;
};

const MapView = ({ locations = [], selectedLocation = null, onMarkerClick }) => {
  if (!locations || locations.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100 rounded-lg">
        <p className="text-gray-500">Không có địa điểm để hiển thị</p>
      </div>
    );
  }

  // Calculate center point
  const centerLat =
    locations.reduce((sum, loc) => sum + loc.lat, 0) / locations.length;
  const centerLng =
    locations.reduce((sum, loc) => sum + loc.lng, 0) / locations.length;

  // Default zoom
  const defaultZoom = locations.length === 1 ? 14 : 13;

  return (
    <MapContainer
      center={[centerLat, centerLng]}
      zoom={defaultZoom}
      style={{ height: '100%', width: '100%', zIndex: 0 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      {/* Vẽ route thực tế bằng OSRM nếu có từ 2 điểm trở lên */}
      {locations.length > 1 && <RoutingMachine locations={locations} />}

      {/* Markers */}
      {locations.map((location, index) => {
        const isSelected = selectedLocation && 
          selectedLocation.lat === location.lat && 
          selectedLocation.lng === location.lng;

        return (
          <Marker
            key={index}
            position={[location.lat, location.lng]}
            icon={createNumberedIcon(index + 1, isSelected)}
            eventHandlers={{
              click: () => {
                if (onMarkerClick) {
                  onMarkerClick(location);
                }
              },
            }}
          >
            <Popup>
              <div className="text-sm">
                <strong>{location.name || `Địa điểm ${index + 1}`}</strong>
                {location.time && <p className="text-gray-600">⏰ {location.time}</p>}
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* Map controller for focus */}
      <MapController
        center={[centerLat, centerLng]}
        zoom={defaultZoom}
        selectedLocation={selectedLocation}
      />
    </MapContainer>
  );
};

export default MapView;



