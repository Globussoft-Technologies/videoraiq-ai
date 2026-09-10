/**
 * Allow browser-based station discovery to read API responses served from a
 * different origin. Helmet defaults CORP to `same-origin`, while the station
 * dashboard is hosted on its own localhost port.
 */
export default function allowCrossOriginResource(_req, res, next) {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
}
