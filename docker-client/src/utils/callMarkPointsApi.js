import axios from 'axios';
const HOST = import.meta.env.VITE_DS_API;

export const callMarkPointsApi = async function (imageBase64, resolution, points) {

  const zones = { additionalProp1: points.map((p) => [p.x, p.y]) };
  const payload = {
    image_base64: imageBase64,
    source_resolution: resolution, 
    zones,
  };

  return await axios.post(`${HOST}/mark_points`, payload, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
};