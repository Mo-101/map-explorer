import { useState } from "react";
import MapView from "@/components/MapView";
import MapControls from "@/components/MapControls";

const Index = () => {
  const [zoom, setZoom] = useState(2);
  const [coordinates, setCoordinates] = useState({ lng: 0, lat: 20 });

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-background">
      <MapView
        onZoomChange={setZoom}
        onCenterChange={(lng, lat) => setCoordinates({ lng, lat })}
      />
      <MapControls zoom={zoom} coordinates={coordinates} />
    </div>
  );
};

export default Index;
