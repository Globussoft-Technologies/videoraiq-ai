import mailHelper from "../../../mailService/mail.helper.js";
import telegramService from "../../../services/telegram.service.js";
import response from "../../../utils/response.js";
import DomainValidation from "./domain.validate.js";

class DomainService {
  async registerDomain(req, res, _next) {
    try {
      const { error, value } = DomainValidation.registerDomain(req.body);
      if (error) {
        const messages = error.details.map((d) => d.message);
        return res
          .status(400)
          .json(response.errorResp("Validation failed", messages));
      }
      const { domainName, ip, port } = value;
      await mailHelper.sendDomainIp(domainName, ip, port);
      await telegramService.sendDomainRegistration(domainName, ip, port);
      return res
        .status(200)
        .json(response.userSuccessResp("Domain and ip sent successfully."));
    } catch (error) {
      return res.status(500).json({
        message: "An error occurred while registering the domain.",
        error: error.message,
      });
    }
  }
}
export default new DomainService();
