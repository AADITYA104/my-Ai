/**
 * ============================================================================
 *  ULTRON COMMUNICATION & MESSAGING SUITE (TOOLS/COMMUNICATION.JS)
 *  - Telegram Bot Dispatcher (connected to telegram-gateway.js)
 *  - WhatsApp / Email Notification Formatter & Webhook Dispatcher
 * ============================================================================
 */
"use strict";

const telegramGateway = require("../telegram-gateway");

class CommunicationSuite {
  /**
   * Send a message to Telegram channel/user via the REAL telegram-gateway
   * bot instance. Previously this was a stub that always claimed success
   * without sending anything — now it reports the actual outcome.
   */
  async sendTelegramAlert(message, chatId) {
    console.log(`📱 [COMMUNICATION] Sending Telegram alert: "${message}"`);
    const result = await telegramGateway.sendMessage(message, chatId);
    return {
      success: result.success,
      channel: "Telegram",
      message: result.success ? "Boss, message dispatched via Telegram gateway." : `Boss, Telegram dispatch failed: ${result.error}`
    };
  }

  /**
   * WhatsApp is NOT wired to any real provider (no Twilio/webhook config
   * exists anywhere in this project) — honestly report that instead of a
   * fake success, which would otherwise mislead the agent/user into
   * believing a message went out when nothing happened.
   */
  async sendWhatsAppAlert(recipientNumber, message) {
    console.warn(`💬 [WHATSAPP] Not configured — no real provider is wired up. Would have sent to ${recipientNumber}: "${message}"`);
    return {
      success: false,
      channel: "WhatsApp",
      recipient: recipientNumber,
      message: "Boss, WhatsApp is not configured yet — no message was actually sent. Wire up a Twilio/webhook provider in tools/communication.js to enable this."
    };
  }

  /**
   * Draft an email summary
   */
  draftEmail(to, subject, body) {
    return {
      to,
      subject,
      body,
      status: "DRAFT_CREATED",
      preview: `To: ${to}\nSubject: ${subject}\n\n${body}`
    };
  }
}

module.exports = new CommunicationSuite();
