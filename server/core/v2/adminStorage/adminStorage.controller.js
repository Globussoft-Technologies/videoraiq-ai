import service from "./adminStorage.service.js";

class AdminStorageController {
  get(req, res) { return service.get(req, res); }
  save(req, res) { return service.save(req, res); }
  test(req, res) { return service.test(req, res); }
}

export default new AdminStorageController();
