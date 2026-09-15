import service from "./measurementCalibration.service.js";

class MeasurementCalibrationController {
  status(req, res) { return service.status(req, res); }
  capture(req, res) { return service.capture(req, res); }
  frame(req, res) { return service.frame(req, res); }
  run(req, res) { return service.run(req, res); }
  zone(req, res) { return service.zone(req, res); }
  saveZone(req, res) { return service.saveZone(req, res); }
}

export default new MeasurementCalibrationController();
