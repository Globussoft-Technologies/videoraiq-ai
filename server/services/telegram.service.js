import config from "config";
import axios from "axios";
const botToken = config.get("domainPoint.botToken");
const chatId = config.get("domainPoint.chatId");

class TelegramService {
  async sendMessage(message) {
    try {
      await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error("❌ Telegram sendMessage error:", error.message);
    }
  }

  async sendDomainRegistration(domainName, ip, port) {
    const message = `
        🌐 *New Domain Registration*
        Domain: ${domainName}
        IP: ${ip}
        Port: ${port}
        Date: ${new Date().toLocaleString()}
    `;
    await this.sendMessage(message);
  }
}

export default new TelegramService();
