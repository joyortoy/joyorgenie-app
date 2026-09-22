import { stableCommitmentHash } from "./ownership";
export type Inquiry = {
  recipient: string;
  subject: string;
  body: string;
  testRecipient: boolean;
  sendEnabled: boolean;
};
export function inquiryHash(recommendationId: string, inquiry: Inquiry) {
  return stableCommitmentHash(
    JSON.stringify({
      version: 1,
      action: "send_availability_inquiry",
      recommendationId,
      recipient: inquiry.recipient,
      subject: inquiry.subject,
      body: inquiry.body,
      testRecipient: inquiry.testRecipient,
      sendEnabled: inquiry.sendEnabled,
    }),
  );
}
export function validEmail(value: string) {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) && value.length <= 254;
}
