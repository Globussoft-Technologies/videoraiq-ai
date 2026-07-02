import CameraGrid from '../../../components/CameraGrid';

/** Live Wall — full multi-camera monitoring grid (HLS), 3×3 default. */
export default function LiveWall() {
  return <CameraGrid defaultCols={3} hideSingleUp />;
}
