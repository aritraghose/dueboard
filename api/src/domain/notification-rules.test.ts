import { describe, expect, test } from "bun:test";
import {
  HIDDEN_REQUEST_STATUSES,
  notificationState,
  onRequestAccepted,
  onRequestSent,
} from "./notification-rules.ts";

describe("onRequestSent", () => {
  test("tells the recipient who asked", () => {
    expect(onRequestSent({ id: "r1", fromUserId: "ana", toUserId: "ben" })).toEqual([
      { userId: "ben", actorId: "ana", kind: "connection_request", requestId: "r1" },
    ]);
  });

  test("never notifies anyone about themselves", () => {
    expect(onRequestSent({ id: "r1", fromUserId: "ana", toUserId: "ana" })).toEqual([]);
  });
});

describe("onRequestAccepted", () => {
  test("tells the requester who accepted, about their own request", () => {
    expect(onRequestAccepted({ acceptorId: "ben", requesterId: "ana", requestId: "r1" })).toEqual([
      { userId: "ana", actorId: "ben", kind: "connection_accepted", requestId: "r1" },
    ]);
  });

  test("the acceptor isn't told about their own accept", () => {
    const drafts = onRequestAccepted({ acceptorId: "ben", requesterId: "ana", requestId: "r1" });
    expect(drafts.some((draft) => draft.userId === "ben")).toBe(false);
  });

  test("never notifies anyone about themselves", () => {
    expect(onRequestAccepted({ acceptorId: "ana", requesterId: "ana", requestId: "r1" })).toEqual([]);
  });
});

describe("notificationState", () => {
  test("a request reads as its answer", () => {
    expect(notificationState("connection_request", "pending")).toBe("pending");
    expect(notificationState("connection_request", "accepted")).toBe("accepted");
    expect(notificationState("connection_request", "declined")).toBe("declined");
  });

  test("a request the sender took back is hidden", () => {
    expect(notificationState("connection_request", "cancelled")).toBeNull();
  });

  test("an acceptance is always accepted", () => {
    expect(notificationState("connection_accepted", "accepted")).toBe("accepted");
    expect(notificationState("connection_accepted", "pending")).toBe("accepted");
  });

  test("the SQL filter hides exactly what the rule hides", () => {
    expect(HIDDEN_REQUEST_STATUSES).toEqual(["cancelled"]);
  });
});
