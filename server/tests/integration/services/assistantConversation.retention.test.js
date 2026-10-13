import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import AssistantConversation from "../../../core/v2/assistant/assistantConversation.model.js";
import conversationService from "../../../core/v2/assistant/assistantConversation.service.js";

const adminId = new mongoose.Types.ObjectId();
const ownerId = new mongoose.Types.ObjectId();
const otherAdminId = new mongoose.Types.ObjectId();

const reqFor = (admin = adminId, owner = ownerId, memberId = null) => ({
  verified: { userData: { adminId: admin, ...(memberId ? { memberId: owner } : {}) } },
  query: {},
});

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(clearCollections);

describe("assistant conversation retention", () => {
  it.each([0, 1, 10, 20, 21, 100])("retains the latest 20 for %i conversations", async (count) => {
    const now = Date.now();
    await AssistantConversation.insertMany(Array.from({ length: count }, (_, index) => ({
      adminId,
      ownerType: "admin",
      ownerId,
      title: `chat-${index}`,
      lastActivityAt: new Date(now - (count - index) * 1000),
    })));

    await conversationService.enforceConversationLimit({ adminId, ownerType: "admin", ownerId });
    const retained = await AssistantConversation.find({ adminId, ownerType: "admin", ownerId })
      .sort({ lastActivityAt: -1 })
      .lean();
    expect(retained).toHaveLength(Math.min(count, 20));
    expect(retained.map((doc) => doc.title)).toEqual(
      Array.from({ length: Math.min(count, 20) }, (_, offset) => `chat-${count - 1 - offset}`),
    );
  });

  it("updates activity when a message is saved and keeps follow-up context", async () => {
    const conversation = await AssistantConversation.create({
      adminId, ownerType: "admin", ownerId, title: "follow-up",
      lastActivityAt: new Date("2020-01-01T00:00:00Z"),
    });
    const before = conversation.lastActivityAt;
    await conversationService.appendMessage(conversation, "user", "How many incidents?");
    await conversationService.appendMessage(conversation, "assistant", "There were 3.");
    const saved = await AssistantConversation.findById(conversation._id).lean();
    expect(saved.lastActivityAt.getTime()).toBeGreaterThan(before.getTime());
    expect(saved.messages.map((message) => message.text)).toEqual(["How many incidents?", "There were 3."]);
  });

  it("keeps histories independent and converges under concurrent creation", async () => {
    await Promise.all(Array.from({ length: 25 }, (_, index) =>
      conversationService.createConversation(reqFor(), `mine-${index}`),
    ));
    const otherOwnerId = new mongoose.Types.ObjectId();
    await Promise.all(Array.from({ length: 15 }, (_, index) =>
      conversationService.createConversation(reqFor(otherAdminId, otherOwnerId), `other-${index}`),
    ));
    expect(await AssistantConversation.countDocuments({ adminId, ownerType: "admin", ownerId })).toBe(20);
    expect(await AssistantConversation.countDocuments({ adminId: otherAdminId, ownerType: "admin", ownerId: otherOwnerId })).toBe(15);
  });
});
